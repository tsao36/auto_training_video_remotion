import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import {
  PptxElement,
  PptxFill,
  PptxSlideData,
  PptxTableCell,
  PptxTextParagraph,
  PptxTextRun,
} from '../src/types/training';

// ============================================================================
// Lightweight, deterministic XML parser for OOXML
// ============================================================================

export interface XmlNode {
  tag: string; // local name without namespace prefix, e.g. 'sp', 'txBody'
  fullTag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function parseAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    const key = m[1].includes(':') ? m[1].split(':').pop()! : m[1];
    attrs[key] = decodeXmlEntities(m[2] ?? m[3] ?? '');
    attrs[m[1]] = decodeXmlEntities(m[2] ?? m[3] ?? '');
  }
  return attrs;
}

export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: 'root', fullTag: 'root', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];

  // Strip XML declaration and comments
  const cleaned = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const tokenRe = /<(\/?)([A-Za-z0-9_:-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;

  while ((m = tokenRe.exec(cleaned)) !== null) {
    if (m[5] !== undefined) {
      // Text node
      const parent = stack[stack.length - 1];
      parent.text += decodeXmlEntities(m[5]);
      continue;
    }

    const isClosing = m[1] === '/';
    const fullTag = m[2];
    const tag = fullTag.includes(':') ? fullTag.split(':').pop()! : fullTag;
    const attrStr = m[3] || '';
    const isSelfClosing = m[4] === '/';

    if (isClosing) {
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].fullTag === fullTag || stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
    } else {
      const node: XmlNode = {
        tag,
        fullTag,
        attrs: parseAttributes(attrStr),
        children: [],
        text: '',
      };
      stack[stack.length - 1].children.push(node);
      if (!isSelfClosing) {
        stack.push(node);
      }
    }
  }

  return root.children[0] || root;
}

function findChild(node: XmlNode | undefined, tag: string): XmlNode | undefined {
  return node?.children.find((c) => c.tag === tag);
}

function findChildren(node: XmlNode | undefined, tag: string): XmlNode[] {
  return node ? node.children.filter((c) => c.tag === tag) : [];
}

function findDeep(node: XmlNode | undefined, tag: string): XmlNode | undefined {
  if (!node) return undefined;
  for (const c of node.children) {
    if (c.tag === tag) return c;
    const found = findDeep(c, tag);
    if (found) return found;
  }
  return undefined;
}

function collectText(node: XmlNode | undefined): string {
  if (!node) return '';
  let out = node.text || '';
  for (const c of node.children) {
    out += collectText(c);
  }
  return out;
}

// ============================================================================
// Theme, Colors & Coordinate Helpers
// ============================================================================

interface ThemeContext {
  colors: Record<string, string>;
  majorFont: string;
  minorFont: string;
}

const PRESET_COLORS: Record<string, string> = {
  black: '000000',
  white: 'FFFFFF',
  red: 'FF0000',
  green: '008000',
  blue: '0000FF',
  yellow: 'FFFF00',
  cyan: '00FFFF',
  magenta: 'FF00FF',
  gray: '808080',
  grey: '808080',
  ltGray: 'D3D3D3',
  dkGray: 'A9A9A9',
  orange: 'FFA500',
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function applyColorTransforms(hex: string, colorNode: XmlNode): { color: string; opacity?: number } {
  let [r, g, b] = hexToRgb(hex);
  let opacity: number | undefined;

  for (const mod of colorNode.children) {
    const val = parseInt(mod.attrs.val || '0', 10) / 100000;
    if (mod.tag === 'alpha') {
      opacity = Math.max(0, Math.min(1, val));
    } else if (mod.tag === 'tint') {
      r = r + (255 - r) * val;
      g = g + (255 - g) * val;
      b = b + (255 - b) * val;
    } else if (mod.tag === 'shade') {
      r = r * val;
      g = g * val;
      b = b * val;
    } else if (mod.tag === 'lumMod' || mod.tag === 'lumOff') {
      let [h, s, l] = rgbToHsl(r, g, b);
      if (mod.tag === 'lumMod') l = l * val;
      if (mod.tag === 'lumOff') l = l + val;
      l = Math.max(0, Math.min(1, l));
      [r, g, b] = hslToRgb(h, s, l);
    }
  }

  return { color: rgbToHex(r, g, b), opacity };
}

function resolveColorNode(
  parentNode: XmlNode | undefined,
  theme: ThemeContext,
  phClrOverride?: string
): { color: string; opacity?: number } | undefined {
  if (!parentNode) return undefined;

  const srgb = findChild(parentNode, 'srgbClr');
  if (srgb?.attrs.val) {
    return applyColorTransforms(srgb.attrs.val, srgb);
  }

  const scheme = findChild(parentNode, 'schemeClr');
  if (scheme?.attrs.val) {
    const key = scheme.attrs.val;
    let baseHex = '000000';
    if (key === 'phClr' && phClrOverride) {
      baseHex = phClrOverride.replace('#', '');
    } else {
      baseHex = theme.colors[key] || '000000';
    }
    return applyColorTransforms(baseHex, scheme);
  }

  const prst = findChild(parentNode, 'prstClr');
  if (prst?.attrs.val && PRESET_COLORS[prst.attrs.val]) {
    return applyColorTransforms(PRESET_COLORS[prst.attrs.val], prst);
  }

  const sys = findChild(parentNode, 'sysClr');
  if (sys?.attrs.lastClr) {
    return applyColorTransforms(sys.attrs.lastClr, sys);
  }

  return undefined;
}

function parseTheme(xmlStr?: string): ThemeContext {
  const defaults: ThemeContext = {
    colors: {
      dk1: '000000',
      lt1: 'FFFFFF',
      dk2: '1F497D',
      lt2: 'EEECE1',
      tx1: '000000',
      bg1: 'FFFFFF',
      tx2: '1F497D',
      bg2: 'EEECE1',
      accent1: '4472C4',
      accent2: 'ED7D31',
      accent3: 'A5A5A5',
      accent4: 'FFC000',
      accent5: '5B9BD5',
      accent6: '70AD47',
      hlink: '0563C1',
      folHlink: '954F72',
    },
    majorFont: 'Calibri Light',
    minorFont: 'Calibri',
  };
  if (!xmlStr) return defaults;

  const doc = parseXml(xmlStr);
  const clrScheme = findDeep(doc, 'clrScheme');
  if (clrScheme) {
    for (const child of clrScheme.children) {
      const srgb = findChild(child, 'srgbClr');
      const sys = findChild(child, 'sysClr');
      const val = srgb?.attrs.val || sys?.attrs.lastClr;
      if (val) {
        defaults.colors[child.tag] = val;
      }
    }
    defaults.colors.tx1 = defaults.colors.dk1;
    defaults.colors.bg1 = defaults.colors.lt1;
    defaults.colors.tx2 = defaults.colors.dk2;
    defaults.colors.bg2 = defaults.colors.lt2;
  }

  const fontScheme = findDeep(doc, 'fontScheme');
  if (fontScheme) {
    const major = findChild(fontScheme, 'majorFont');
    const minor = findChild(fontScheme, 'minorFont');
    const majorLatin = findChild(major, 'latin')?.attrs.typeface;
    const minorLatin = findChild(minor, 'latin')?.attrs.typeface;
    if (majorLatin) defaults.majorFont = majorLatin;
    if (minorLatin) defaults.minorFont = minorLatin;
  }

  return defaults;
}

// ============================================================================
// Relationship & Media Helpers
// ============================================================================

async function readRels(zip: JSZip, xmlPath: string): Promise<Record<string, string>> {
  const dir = path.posix.dirname(xmlPath);
  const base = path.posix.basename(xmlPath);
  const relsPath = path.posix.join(dir, '_rels', `${base}.rels`);
  const file = zip.file(relsPath);
  if (!file) return {};
  const xml = await file.async('string');
  const doc = parseXml(xml);
  const map: Record<string, string> = {};
  for (const rel of findChildren(doc, 'Relationship')) {
    const id = rel.attrs.Id;
    const target = rel.attrs.Target;
    if (id && target) {
      if (target.startsWith('/')) {
        map[id] = target.slice(1);
      } else {
        map[id] = path.posix.normalize(path.posix.join(dir, target));
      }
    }
  }
  return map;
}

async function extractMediaUrl(
  zip: JSZip,
  mediaPath: string,
  mediaDir: string,
  cache: Map<string, string>
): Promise<string | undefined> {
  if (cache.has(mediaPath)) return cache.get(mediaPath);
  const entry = zip.file(mediaPath);
  if (!entry) return undefined;

  const buf = await entry.async('nodebuffer');
  const ext = path.posix.extname(mediaPath).toLowerCase() || '.png';
  // Skip unsupported WMF/EMF binary metafiles gracefully
  if (ext === '.wmf' || ext === '.emf') return undefined;

  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const outName = `slide-img-${hash}${ext}`;
  const outPath = path.join(mediaDir, outName);
  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(mediaDir, { recursive: true });
    fs.writeFileSync(outPath, buf);
  }
  const url = `/pptx-media/${outName}`;
  cache.set(mediaPath, url);
  return url;
}

// ============================================================================
// Geometry, Transform & Fill Parsers
// ============================================================================

interface CoordTransform {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  fontScale: number;
}

interface RawBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rotDeg?: number;
  flipH?: boolean;
  flipV?: boolean;
}

function parseXfrm(xfrm: XmlNode | undefined): RawBox | undefined {
  if (!xfrm) return undefined;
  const off = findChild(xfrm, 'off');
  const ext = findChild(xfrm, 'ext');
  if (!off || !ext) return undefined;
  const x = parseInt(off.attrs.x || '0', 10);
  const y = parseInt(off.attrs.y || '0', 10);
  const w = parseInt(ext.attrs.cx || '0', 10);
  const h = parseInt(ext.attrs.cy || '0', 10);
  const rot = xfrm.attrs.rot ? parseInt(xfrm.attrs.rot, 10) / 60000 : undefined;
  return {
    x,
    y,
    w,
    h,
    rotDeg: rot,
    flipH: xfrm.attrs.flipH === '1' || xfrm.attrs.flipH === 'true',
    flipV: xfrm.attrs.flipV === '1' || xfrm.attrs.flipV === 'true',
  };
}

function mapBox(box: RawBox, tf: CoordTransform) {
  return {
    x: box.x * tf.scaleX + tf.offsetX,
    y: box.y * tf.scaleY + tf.offsetY,
    width: Math.max(1, box.w * tf.scaleX),
    height: Math.max(1, box.h * tf.scaleY),
    rotationDeg: box.rotDeg,
    flipH: box.flipH,
    flipV: box.flipV,
  };
}

async function parseFill(
  container: XmlNode | undefined,
  theme: ThemeContext,
  rels: Record<string, string>,
  zip: JSZip,
  mediaDir: string,
  mediaCache: Map<string, string>
): Promise<PptxFill | undefined> {
  if (!container) return undefined;

  if (findChild(container, 'noFill')) {
    return { type: 'none' };
  }

  const solid = findChild(container, 'solidFill');
  if (solid) {
    const resolved = resolveColorNode(solid, theme);
    if (resolved) {
      return { type: 'solid', color: resolved.color, opacity: resolved.opacity };
    }
  }

  const grad = findChild(container, 'gradFill');
  if (grad) {
    const gsLst = findChild(grad, 'gsLst');
    const stops: { position: number; color: string }[] = [];
    for (const gs of findChildren(gsLst, 'gs')) {
      const pos = Math.round((parseInt(gs.attrs.pos || '0', 10) / 100000) * 100);
      const resolved = resolveColorNode(gs, theme);
      if (resolved) {
        stops.push({ position: pos, color: resolved.color });
      }
    }
    stops.sort((a, b) => a.position - b.position);
    const lin = findChild(grad, 'lin');
    const angRaw = lin?.attrs.ang ? parseInt(lin.attrs.ang, 10) / 60000 : 0;
    // OOXML angle is clockwise from 3 o'clock -> CSS linear-gradient is clockwise from 12 o'clock
    const cssAngle = (angRaw + 90) % 360;
    if (stops.length > 0) {
      return {
        type: 'gradient',
        gradientAngleDeg: cssAngle,
        gradientStops: stops,
      };
    }
  }

  const blipFill = findChild(container, 'blipFill');
  if (blipFill) {
    const blip = findChild(blipFill, 'blip');
    const rId = blip?.attrs.embed || blip?.attrs['r:embed'];
    if (rId && rels[rId]) {
      const imageUrl = await extractMediaUrl(zip, rels[rId], mediaDir, mediaCache);
      if (imageUrl) {
        return { type: 'image', imageUrl };
      }
    }
  }

  return undefined;
}

function parseFontFamily(rPr: XmlNode | undefined, theme: ThemeContext): string | undefined {
  if (!rPr) return undefined;
  const latin = findChild(rPr, 'latin')?.attrs.typeface;
  const ea = findChild(rPr, 'ea')?.attrs.typeface;
  const raw = latin || ea;
  if (!raw) return undefined;
  if (raw.startsWith('+mj')) return theme.majorFont;
  if (raw.startsWith('+mn')) return theme.minorFont;
  return raw;
}

function parseParagraphs(
  txBody: XmlNode | undefined,
  theme: ThemeContext,
  tf: CoordTransform,
  defaultFontSizePt = 18,
  defaultColor = '#000000'
): PptxTextParagraph[] {
  if (!txBody) return [];
  const lstStyle = findChild(txBody, 'lstStyle');
  const paragraphs: PptxTextParagraph[] = [];

  let autoNumCounter = 1;
  for (const pNode of findChildren(txBody, 'p')) {
    const pPr = findChild(pNode, 'pPr');
    const level = parseInt(pPr?.attrs.lvl || '0', 10);
    const lvlStyle = findChild(lstStyle, `lvl${level + 1}pPr`);
    const defRPr = findChild(pPr, 'defRPr') || findChild(lvlStyle, 'defRPr');

    const algnMap: Record<string, PptxTextParagraph['align']> = {
      l: 'left',
      ctr: 'center',
      r: 'right',
      just: 'justify',
    };
    const align = algnMap[pPr?.attrs.algn || lvlStyle?.attrs.algn || 'l'] || 'left';

    let bullet: string | undefined;
    const buNone = findChild(pPr, 'buNone');
    if (!buNone) {
      const buChar = findChild(pPr, 'buChar') || findChild(lvlStyle, 'buChar');
      const buAutoNum = findChild(pPr, 'buAutoNum') || findChild(lvlStyle, 'buAutoNum');
      if (buChar?.attrs.char) {
        bullet = buChar.attrs.char;
      } else if (buAutoNum) {
        bullet = `${autoNumCounter++}.`;
      }
    }

    const runs: PptxTextRun[] = [];
    for (const child of pNode.children) {
      if (child.tag === 'r' || child.tag === 'fld') {
        const rPr = findChild(child, 'rPr') || defRPr;
        const tNode = findChild(child, 't');
        const text = tNode ? collectText(tNode) : '';
        if (!text) continue;

        const szRaw = rPr?.attrs.sz ? parseInt(rPr.attrs.sz, 10) / 100 : defaultFontSizePt;
        const fontSizePx = Math.max(10, Math.round(szRaw * tf.fontScale));
        const solid = findChild(rPr, 'solidFill');
        const resolvedClr = resolveColorNode(solid, theme);
        const color = solid ? resolvedClr?.color || defaultColor : defaultColor;

        runs.push({
          text,
          fontSizePx,
          fontFamily: parseFontFamily(rPr, theme),
          color,
          bold: rPr?.attrs.b === '1' || rPr?.attrs.b === 'true',
          italic: rPr?.attrs.i === '1' || rPr?.attrs.i === 'true',
          underline: Boolean(rPr?.attrs.u && rPr.attrs.u !== 'none'),
          strike: Boolean(rPr?.attrs.strike && rPr.attrs.strike !== 'noStrike'),
        });
      } else if (child.tag === 'br') {
        runs.push({ text: '\n' });
      }
    }

    paragraphs.push({
      align,
      bullet,
      level,
      runs,
    });
  }

  return paragraphs;
}

// ============================================================================
// Placeholder Inheritance Index
// ============================================================================

interface PlaceholderDef {
  box?: RawBox;
  defaultFontSizePt?: number;
  defaultColor?: string;
}

function indexPlaceholders(doc: XmlNode | undefined, theme: ThemeContext): Map<string, PlaceholderDef> {
  const map = new Map<string, PlaceholderDef>();
  if (!doc) return map;
  const spTree = findDeep(doc, 'spTree');
  if (!spTree) return map;

  for (const sp of findChildren(spTree, 'sp')) {
    const nvSpPr = findChild(sp, 'nvSpPr');
    const nvPr = findChild(nvSpPr, 'nvPr');
    const ph = findChild(nvPr, 'ph');
    if (!ph) continue;

    const phType = ph.attrs.type || 'body';
    const phIdx = ph.attrs.idx || '';
    const spPr = findChild(sp, 'spPr');
    const box = parseXfrm(findChild(spPr, 'xfrm'));

    const txBody = findChild(sp, 'txBody');
    const lstStyle = findChild(txBody, 'lstStyle');
    const lvl1 = findChild(lstStyle, 'lvl1pPr');
    const defRPr = findChild(lvl1, 'defRPr');
    const defaultFontSizePt = defRPr?.attrs.sz ? parseInt(defRPr.attrs.sz, 10) / 100 : undefined;
    const defaultColor = resolveColorNode(defRPr, theme)?.color;

    const def: PlaceholderDef = { box, defaultFontSizePt, defaultColor };
    if (phIdx) map.set(`idx:${phIdx}`, def);
    map.set(`type:${phType}`, def);
  }
  return map;
}

// ============================================================================
// Shape Tree Recursive Parser
// ============================================================================

async function parseSpTree(
  spTree: XmlNode | undefined,
  theme: ThemeContext,
  rels: Record<string, string>,
  zip: JSZip,
  mediaDir: string,
  mediaCache: Map<string, string>,
  tf: CoordTransform,
  placeholders: Map<string, PlaceholderDef>,
  idPrefix: string,
  skipPlaceholders = false
): Promise<PptxElement[]> {
  if (!spTree) return [];
  const elements: PptxElement[] = [];
  let seq = 0;

  for (const node of spTree.children) {
    seq++;
    const elId = `${idPrefix}-${seq}`;

    if (node.tag === 'sp') {
      const nvSpPr = findChild(node, 'nvSpPr');
      const nvPr = findChild(nvSpPr, 'nvPr');
      const ph = findChild(nvPr, 'ph');
      if (skipPlaceholders && ph) continue;
      const phKeyIdx = ph?.attrs.idx ? `idx:${ph.attrs.idx}` : '';
      const phKeyType = ph?.attrs.type ? `type:${ph.attrs.type}` : '';
      const inheritedPh = placeholders.get(phKeyIdx) || placeholders.get(phKeyType);

      const spPr = findChild(node, 'spPr');
      const rawBox = parseXfrm(findChild(spPr, 'xfrm')) || inheritedPh?.box;
      if (!rawBox || rawBox.w <= 0 || rawBox.h <= 0) continue;

      const mapped = mapBox(rawBox, tf);
      const prstGeom = findChild(spPr, 'prstGeom');
      const shapeType = prstGeom?.attrs.prst || 'rect';

      let fill = await parseFill(spPr, theme, rels, zip, mediaDir, mediaCache);
      // Check style fillRef if no explicit fill
      if (!fill) {
        const style = findChild(node, 'style');
        const fillRef = findChild(style, 'fillRef');
        if (fillRef && fillRef.attrs.idx !== '0') {
          const refClr = resolveColorNode(fillRef, theme);
          if (refClr) {
            fill = { type: 'solid', color: refClr.color, opacity: refClr.opacity };
          }
        }
      }

      const ln = findChild(spPr, 'ln');
      let strokeColor: string | undefined;
      let strokeWidthPx: number | undefined;
      let strokeDash: string | undefined;
      if (ln && !findChild(ln, 'noFill')) {
        const lnClr = resolveColorNode(ln, theme);
        if (lnClr) {
          strokeColor = lnClr.color;
          const wEmu = parseInt(ln.attrs.w || '12700', 10);
          strokeWidthPx = Math.max(1, Math.round(wEmu * tf.scaleX));
          strokeDash = findChild(ln, 'prstDash')?.attrs.val;
        }
      }

      const txBody = findChild(node, 'txBody');
      const bodyPr = findChild(txBody, 'bodyPr');
      const anchorMap: Record<string, 'top' | 'middle' | 'bottom'> = {
        t: 'top',
        ctr: 'middle',
        b: 'bottom',
      };
      const verticalAlign = anchorMap[bodyPr?.attrs.anchor || 't'] || 'top';

      const defaultPt =
        inheritedPh?.defaultFontSizePt ||
        (ph?.attrs.type === 'title' || ph?.attrs.type === 'ctrTitle' ? 32 : 18);
      const defaultClr = inheritedPh?.defaultColor || '#0F172A';
      const paragraphs = parseParagraphs(txBody, theme, tf, defaultPt, defaultClr);

      const hasText = paragraphs.some((p) => p.runs.some((r) => r.text.trim().length > 0));
      const hasVisualShape =
        (fill && fill.type !== 'none') || Boolean(strokeColor);

      if (!hasText && !hasVisualShape) continue;

      elements.push({
        id: elId,
        kind: 'shape',
        ...mapped,
        shapeType,
        fill,
        strokeColor,
        strokeWidthPx,
        strokeDash,
        paragraphs: hasText ? paragraphs : undefined,
        verticalAlign,
        paddingPx: {
          top: Math.round(parseInt(bodyPr?.attrs.tIns || '45720', 10) * tf.scaleY),
          right: Math.round(parseInt(bodyPr?.attrs.rIns || '91440', 10) * tf.scaleX),
          bottom: Math.round(parseInt(bodyPr?.attrs.bIns || '45720', 10) * tf.scaleY),
          left: Math.round(parseInt(bodyPr?.attrs.lIns || '91440', 10) * tf.scaleX),
        },
      });
    } else if (node.tag === 'pic') {
      const spPr = findChild(node, 'spPr');
      const rawBox = parseXfrm(findChild(spPr, 'xfrm'));
      if (!rawBox || rawBox.w <= 0 || rawBox.h <= 0) continue;

      const blipFill = findChild(node, 'blipFill');
      const blip = findChild(blipFill, 'blip');
      const rId = blip?.attrs.embed || blip?.attrs['r:embed'];
      if (!rId || !rels[rId]) continue;

      const imageUrl = await extractMediaUrl(zip, rels[rId], mediaDir, mediaCache);
      if (!imageUrl) continue;

      const srcRect = findChild(blipFill, 'srcRect');
      const cropRect = srcRect
        ? {
            left: parseInt(srcRect.attrs.l || '0', 10) / 100000,
            top: parseInt(srcRect.attrs.t || '0', 10) / 100000,
            right: parseInt(srcRect.attrs.r || '0', 10) / 100000,
            bottom: parseInt(srcRect.attrs.b || '0', 10) / 100000,
          }
        : undefined;

      elements.push({
        id: elId,
        kind: 'image',
        ...mapBox(rawBox, tf),
        imageUrl,
        cropRect,
      });
    } else if (node.tag === 'cxnSp') {
      const spPr = findChild(node, 'spPr');
      const rawBox = parseXfrm(findChild(spPr, 'xfrm'));
      if (!rawBox) continue;

      const ln = findChild(spPr, 'ln');
      const lnClr = resolveColorNode(ln, theme);
      const wEmu = parseInt(ln?.attrs.w || '12700', 10);
      const headEnd = findChild(ln, 'headEnd');
      const tailEnd = findChild(ln, 'tailEnd');

      elements.push({
        id: elId,
        kind: 'connector',
        ...mapBox({ ...rawBox, w: Math.max(rawBox.w, 12700), h: Math.max(rawBox.h, 12700) }, tf),
        strokeColor: lnClr?.color || '#334155',
        strokeWidthPx: Math.max(2, Math.round(wEmu * tf.scaleX)),
        strokeDash: findChild(ln, 'prstDash')?.attrs.val,
        headArrow: Boolean(headEnd && headEnd.attrs.type && headEnd.attrs.type !== 'none'),
        tailArrow: Boolean(tailEnd && tailEnd.attrs.type && tailEnd.attrs.type !== 'none'),
      });
    } else if (node.tag === 'graphicFrame') {
      const xfrm = findChild(node, 'xfrm');
      const rawBox = parseXfrm(xfrm);
      const tbl = findDeep(node, 'tbl');
      if (!rawBox || !tbl) continue;

      const mapped = mapBox(rawBox, tf);
      const tblGrid = findChild(tbl, 'tblGrid');
      const gridCols = findChildren(tblGrid, 'gridCol').map((c) =>
        Math.max(20, Math.round(parseInt(c.attrs.w || '914400', 10) * tf.scaleX))
      );

      const rows: { height: number; cells: PptxTableCell[] }[] = [];
      for (const tr of findChildren(tbl, 'tr')) {
        const rowH = Math.max(24, Math.round(parseInt(tr.attrs.h || '370840', 10) * tf.scaleY));
        const cells: PptxTableCell[] = [];
        for (const tc of findChildren(tr, 'tc')) {
          const tcPr = findChild(tc, 'tcPr');
          const fill = await parseFill(tcPr, theme, rels, zip, mediaDir, mediaCache);
          const anchorMap: Record<string, 'top' | 'middle' | 'bottom'> = {
            t: 'top',
            ctr: 'middle',
            b: 'bottom',
          };
          const verticalAlign = anchorMap[tcPr?.attrs.anchor || 'ctr'] || 'middle';
          const txBody = findChild(tc, 'txBody');
          const textParagraphs = parseParagraphs(txBody, theme, tf, 14, '#0F172A');

          cells.push({
            textParagraphs,
            fill,
            borderColor: '#CBD5E1',
            borderWidthPx: 1,
            verticalAlign,
            colSpan: tc.attrs.gridSpan ? parseInt(tc.attrs.gridSpan, 10) : undefined,
            rowSpan: tc.attrs.rowSpan ? parseInt(tc.attrs.rowSpan, 10) : undefined,
            skip: tc.attrs.hMerge === '1' || tc.attrs.vMerge === '1',
          });
        }
        rows.push({ height: rowH, cells });
      }

      elements.push({
        id: elId,
        kind: 'table',
        ...mapped,
        tableColWidths: gridCols,
        tableRows: rows,
      });
    } else if (node.tag === 'grpSp') {
      const grpSpPr = findChild(node, 'grpSpPr');
      const xfrm = findChild(grpSpPr, 'xfrm');
      const off = findChild(xfrm, 'off');
      const ext = findChild(xfrm, 'ext');
      const chOff = findChild(xfrm, 'chOff');
      const chExt = findChild(xfrm, 'chExt');

      let childTf = tf;
      if (off && ext && chOff && chExt) {
        const gx = parseInt(off.attrs.x || '0', 10);
        const gy = parseInt(off.attrs.y || '0', 10);
        const gw = parseInt(ext.attrs.cx || '1', 10);
        const gh = parseInt(ext.attrs.cy || '1', 10);
        const cx = parseInt(chOff.attrs.x || '0', 10);
        const cy = parseInt(chOff.attrs.y || '0', 10);
        const cw = Math.max(1, parseInt(chExt.attrs.cx || '1', 10));
        const ch = Math.max(1, parseInt(chExt.attrs.cy || '1', 10));

        const sx = (gw / cw) * tf.scaleX;
        const sy = (gh / ch) * tf.scaleY;
        childTf = {
          scaleX: sx,
          scaleY: sy,
          offsetX: tf.offsetX + gx * tf.scaleX - cx * sx,
          offsetY: tf.offsetY + gy * tf.scaleY - cy * sy,
          fontScale: tf.fontScale * (gw / cw),
        };
      }

      const groupElements = await parseSpTree(
        node,
        theme,
        rels,
        zip,
        mediaDir,
        mediaCache,
        childTf,
        placeholders,
        elId,
        skipPlaceholders
      );
      elements.push(...groupElements);
    }
  }

  return elements;
}

// ============================================================================
// Main PPTX Entry Point
// ============================================================================

export interface ParsedPptxResult {
  title: string;
  slides: PptxSlideData[];
  rawText: string;
}

export async function parsePptxBuffer(
  buffer: Buffer,
  fileName: string,
  mediaDir: string
): Promise<ParsedPptxResult> {
  const zip = await JSZip.loadAsync(buffer);
  const baseTitle = path.basename(fileName, path.extname(fileName));
  const mediaCache = new Map<string, string>();

  // 1. Theme
  const themeFile = zip.file('ppt/theme/theme1.xml');
  const theme = parseTheme(themeFile ? await themeFile.async('string') : undefined);

  // 2. Presentation dimensions & slide order
  let slideCx = 12192000; // 16:9 default (13.333 in)
  let slideCy = 6858000;  // 16:9 default (7.5 in)
  const orderedSlidePaths: string[] = [];

  const presFile = zip.file('ppt/presentation.xml');
  if (presFile) {
    const presDoc = parseXml(await presFile.async('string'));
    const sldSz = findChild(presDoc, 'sldSz');
    if (sldSz?.attrs.cx && sldSz?.attrs.cy) {
      slideCx = parseInt(sldSz.attrs.cx, 10) || slideCx;
      slideCy = parseInt(sldSz.attrs.cy, 10) || slideCy;
    }

    const presRels = await readRels(zip, 'ppt/presentation.xml');
    const sldIdLst = findChild(presDoc, 'sldIdLst');
    for (const sldId of findChildren(sldIdLst, 'sldId')) {
      const rId = sldId.attrs.id && sldId.attrs['r:id'] ? sldId.attrs['r:id'] : sldId.attrs.id;
      // Prefer r:id attribute
      const relId = sldId.attrs['r:id'] || rId;
      if (relId && presRels[relId]) {
        orderedSlidePaths.push(presRels[relId]);
      }
    }
  }

  // Fallback to numeric slide filenames if presentation.xml didn't yield slides
  if (orderedSlidePaths.length === 0) {
    const fallbackFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => {
        const na = parseInt(a.match(/(\d+)/)?.[1] || '0', 10);
        const nb = parseInt(b.match(/(\d+)/)?.[1] || '0', 10);
        return na - nb;
      });
    orderedSlidePaths.push(...fallbackFiles);
  }

  // Map slide EMUs onto 1920x1080 preserving aspect ratio
  const scale = Math.min(1920 / slideCx, 1080 / slideCy);
  const slideWidthPx = Math.round(slideCx * scale);
  const slideHeightPx = Math.round(slideCy * scale);
  const tf: CoordTransform = {
    scaleX: scale,
    scaleY: scale,
    offsetX: Math.round((1920 - slideWidthPx) / 2),
    offsetY: Math.round((1080 - slideHeightPx) / 2),
    // 1 pt = 12700 EMU
    fontScale: 12700 * scale,
  };

  const slides: PptxSlideData[] = [];

  for (let i = 0; i < orderedSlidePaths.length; i++) {
    const sPath = orderedSlidePaths[i];
    const slideEntry = zip.file(sPath);
    if (!slideEntry) continue;

    const slideDoc = parseXml(await slideEntry.async('string'));
    const slideRels = await readRels(zip, sPath);

    // Resolve layout & master
    let layoutDoc: XmlNode | undefined;
    let layoutRels: Record<string, string> = {};
    let masterDoc: XmlNode | undefined;
    let masterRels: Record<string, string> = {};

    const layoutPath = Object.values(slideRels).find((p) => p.includes('slideLayouts/'));
    if (layoutPath && zip.file(layoutPath)) {
      layoutDoc = parseXml(await zip.file(layoutPath)!.async('string'));
      layoutRels = await readRels(zip, layoutPath);
      const masterPath = Object.values(layoutRels).find((p) => p.includes('slideMasters/'));
      if (masterPath && zip.file(masterPath)) {
        masterDoc = parseXml(await zip.file(masterPath)!.async('string'));
        masterRels = await readRels(zip, masterPath);
      }
    }

    // Build placeholder lookup (master -> layout)
    const placeholders = indexPlaceholders(masterDoc, theme);
    for (const [k, v] of indexPlaceholders(layoutDoc, theme)) {
      placeholders.set(k, v);
    }

    // Resolve background: slide -> layout -> master -> #FFFFFF
    let background: PptxFill | undefined;
    const bgSources: { doc?: XmlNode; rels: Record<string, string> }[] = [
      { doc: slideDoc, rels: slideRels },
      { doc: layoutDoc, rels: layoutRels },
      { doc: masterDoc, rels: masterRels },
    ];
    for (const src of bgSources) {
      if (!src.doc) continue;
      const cSld = findChild(src.doc, 'cSld');
      const bg = findChild(cSld, 'bg');
      if (!bg) continue;
      const bgPr = findChild(bg, 'bgPr');
      if (bgPr) {
        background = await parseFill(bgPr, theme, src.rels, zip, mediaDir, mediaCache);
        if (background) break;
      }
      const bgRef = findChild(bg, 'bgRef');
      if (bgRef) {
        const refClr = resolveColorNode(bgRef, theme);
        if (refClr) {
          background = { type: 'solid', color: refClr.color, opacity: refClr.opacity };
          break;
        }
      }
    }
    if (!background || background.type === 'none') {
      background = { type: 'solid', color: '#FFFFFF' };
    }

    // Parse master & layout decorative (non-placeholder) shapes, then slide elements
    const showMasterSp = slideDoc.attrs.showMasterSp !== '0';
    const layoutShowMasterSp = layoutDoc?.attrs.showMasterSp !== '0';
    const masterElements =
      showMasterSp && layoutShowMasterSp && masterDoc
        ? await parseSpTree(
            findChild(findChild(masterDoc, 'cSld'), 'spTree'),
            theme,
            masterRels,
            zip,
            mediaDir,
            mediaCache,
            tf,
            placeholders,
            `s${i + 1}-m`,
            true
          )
        : [];
    const layoutElements =
      showMasterSp && layoutDoc
        ? await parseSpTree(
            findChild(findChild(layoutDoc, 'cSld'), 'spTree'),
            theme,
            layoutRels,
            zip,
            mediaDir,
            mediaCache,
            tf,
            placeholders,
            `s${i + 1}-l`,
            true
          )
        : [];

    const cSld = findChild(slideDoc, 'cSld');
    const spTree = findChild(cSld, 'spTree');
    const slideElements = await parseSpTree(
      spTree,
      theme,
      slideRels,
      zip,
      mediaDir,
      mediaCache,
      tf,
      placeholders,
      `s${i + 1}`
    );
    const elements = [...masterElements, ...layoutElements, ...slideElements];

    // Extract notes
    let notes = '';
    const notesPath = Object.values(slideRels).find((p) => p.includes('notesSlides/'));
    if (notesPath && zip.file(notesPath)) {
      const notesDoc = parseXml(await zip.file(notesPath)!.async('string'));
      const notesTexts: string[] = [];
      const walk = (n: XmlNode) => {
        if (n.tag === 't') {
          const t = collectText(n).trim();
          if (t && !/^\d+$/.test(t)) notesTexts.push(t);
        }
        for (const c of n.children) walk(c);
      };
      walk(notesDoc);
      notes = notesTexts.join(' ').trim();
    }

    // Extract clean title & body text from slide elements (excluding master/layout boilerplate)
    const textLines: string[] = [];
    const textSource = slideElements.length > 0 ? slideElements : elements;
    for (const el of textSource) {
      if (el.paragraphs) {
        for (const p of el.paragraphs) {
          const line = p.runs.map((r) => r.text).join('').trim();
          if (line) textLines.push(line);
        }
      }
      if (el.tableRows) {
        for (const row of el.tableRows) {
          const rowText = row.cells
            .filter((c) => !c.skip)
            .map((c) => c.textParagraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ').trim())
            .filter(Boolean)
            .join(' | ');
          if (rowText) textLines.push(rowText);
        }
      }
    }

    const title = textLines[0] || `Slide ${i + 1}`;
    const bodyText = textLines.slice(1).join('\n') || title;

    slides.push({
      slideNumber: i + 1,
      slideWidthPx,
      slideHeightPx,
      background,
      elements,
      title,
      bodyText,
      notes: notes || undefined,
    });
  }

  const rawText = slides
    .map((s) => `# ${s.slideNumber}. ${s.title}\n${s.bodyText}${s.notes ? `\n[Notes] ${s.notes}` : ''}`)
    .join('\n\n');

  return {
    title: baseTitle,
    slides,
    rawText,
  };
}
