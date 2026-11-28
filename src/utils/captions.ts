import { parseSrt } from '@remotion/captions';
import type { Caption } from '@remotion/captions';
import type { SceneSpec } from '../types/training';

export interface TimedTechnicalTerm {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TechnicalTermMatch extends TimedTechnicalTerm {
  start: number;
  end: number;
}

export interface TechnicalTermCandidate {
  term: string;
  occurrences: number;
  sceneIndexes: number[];
}

const TECHNICAL_TERM_PATTERN = /Wi[‐‑-]Fi(?:\s+\d+)?|\bIEEE\s+\d{3}\.\d{1,2}\w*\b|\b11(?:az|bf|bh|bi|bn)\b|\b(?:[A-Z]{2,10}|[A-Z][a-z]+[A-Z][A-Za-z0-9]*|IoT)(?:[\-/][A-Z0-9]{1,10})*\b|\b\d+(?:\.\d+)?\s*(?:%|dB|dBm|GHz|MHz|kHz|Gbps|Mbps|ms|ns|V|mV|W|mW|x)\b|\b[A-Z][A-Za-z]*[a-z][A-Za-z0-9-]*(?:\s+(?:[A-Z][A-Za-z0-9-]*|of|and)){1,4}\b/g;

export function normalizeTechnicalTerm(value: string): string {
  return value.replace(/[‐‑]/g, '-').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

export function extractTechnicalTerms(text: string): string[] {
  return Array.from(new Set(
    Array.from(text.matchAll(TECHNICAL_TERM_PATTERN), (match) => match[0].trim())
      .filter(Boolean)
  ));
}

export function hasTechnicalTerms(text: string): boolean {
  return extractTechnicalTerms(text).length > 0;
}

function getAllowedTechnicalTermSet(allowedTerms?: readonly string[]): Set<string> | null {
  if (allowedTerms === undefined) return null;
  return new Set(allowedTerms.map(normalizeTechnicalTerm).filter(Boolean));
}

function getCaptionTechnicalTerms(
  caption: Caption,
  allowedTerms?: readonly string[]
): TimedTechnicalTerm[] {
  const allowed = getAllowedTechnicalTermSet(allowedTerms);
  const durationMs = Math.max(1, caption.endMs - caption.startMs);
  return Array.from(caption.text.matchAll(TECHNICAL_TERM_PATTERN), (match) => {
    const normalized = normalizeTechnicalTerm(match[0]);
    if (allowed && !allowed.has(normalized)) return null;
    const text = match[0].trim();
    const index = match.index ?? 0;
    const startMs = caption.startMs + (index / Math.max(1, caption.text.length)) * durationMs;
    const spokenMs = Math.max(420, Math.min(1400, (text.length / Math.max(1, caption.text.length)) * durationMs));
    return {
      text,
      startMs,
      endMs: Math.min(caption.endMs, startMs + spokenMs),
    };
  }).filter((term): term is TimedTechnicalTerm => term !== null);
}

export function getActiveCaption(captions: Caption[], currentMs: number): Caption | undefined {
  return captions.find((caption) => currentMs >= caption.startMs && currentMs < caption.endMs)
    ?? (currentMs === captions.at(-1)?.endMs ? captions.at(-1) : undefined);
}

export function getTimedTechnicalTerms(
  captions: Caption[],
  currentMs: number,
  allowedTerms?: readonly string[]
): TimedTechnicalTerm[] {
  const caption = getActiveCaption(captions, currentMs);
  return caption ? getCaptionTechnicalTerms(caption, allowedTerms) : [];
}

export function getTechnicalTermOverlayQueue(
  captions: Caption[],
  currentMs: number,
  maxVisible = 3,
  allowedTerms?: readonly string[]
): TimedTechnicalTerm[] {
  if (maxVisible <= 0) return [];
  const mentioned = captions
    .flatMap((caption) => getCaptionTechnicalTerms(caption, allowedTerms))
    .sort((a, b) => a.startMs - b.startMs)
    .filter((term) => term.startMs <= currentMs);
  if (mentioned.length === 0) return [];

  const groupStart = Math.floor((mentioned.length - 1) / maxVisible) * maxVisible;
  return mentioned.slice(groupStart, groupStart + maxVisible);
}

export function findTechnicalTermMatches(text: string, terms: TimedTechnicalTerm[]): TechnicalTermMatch[] {
  const normalizedText = normalizeTechnicalTerm(text);
  const matches = terms.flatMap((term) => {
    const normalizedTerm = normalizeTechnicalTerm(term.text);
    if (!normalizedTerm) return [];
    const ranges: TechnicalTermMatch[] = [];
    let fromIndex = 0;
    while (fromIndex <= normalizedText.length) {
      const start = normalizedText.indexOf(normalizedTerm, fromIndex);
      if (start < 0) break;
      const end = Math.min(text.length, start + term.text.length);
      ranges.push({ ...term, start, end });
      fromIndex = start + Math.max(1, normalizedTerm.length);
    }
    return ranges;
  });

  return matches.sort((a, b) => a.start - b.start || b.end - a.end);
}

export function ensurePoppingTechnicalTermsPrimitive<T extends string>(
  script: string,
  primitives: readonly T[] = []
): Array<T | 'popping-word-captions'> {
  const unique = Array.from(new Set(primitives));
  if (!hasTechnicalTerms(script) || unique.includes('popping-word-captions' as T)) return unique;
  return [...unique.slice(0, 3), 'popping-word-captions'];
}

export function shouldUsePoppingTechnicalTerms(params: {
  script: string;
  remotionPrimitives?: readonly string[];
}): boolean {
  return params.remotionPrimitives?.includes('popping-word-captions') || hasTechnicalTerms(params.script);
}

function collectPptxText(scene: SceneSpec): string {
  if (!scene.pptxSlide) return '';
  const text: string[] = [scene.pptxSlide.title, scene.pptxSlide.bodyText, scene.pptxSlide.notes || ''];
  for (const element of scene.pptxSlide.elements) {
    for (const paragraph of element.paragraphs || []) {
      text.push(paragraph.runs.map((run) => run.text).join(''));
    }
    for (const row of element.tableRows || []) {
      for (const cell of row.cells) {
        for (const paragraph of cell.textParagraphs || []) {
          text.push(paragraph.runs.map((run) => run.text).join(''));
        }
      }
    }
  }
  return text.join('\n');
}

export function generateTechnicalTermCandidates(scenes: SceneSpec[]): TechnicalTermCandidate[] {
  const candidates = new Map<string, TechnicalTermCandidate>();
  scenes.forEach((scene, sceneIndex) => {
    const sourceText = [
      scene.script,
      scene.title,
      ...scene.keyPoints,
      scene.visualDescription || '',
      ...(scene.captions || []).map((caption) => caption.text),
      collectPptxText(scene),
    ].join('\n');

    for (const term of extractTechnicalTerms(sourceText)) {
      const normalized = normalizeTechnicalTerm(term);
      const existing = candidates.get(normalized);
      if (existing) {
        existing.occurrences += 1;
        if (!existing.sceneIndexes.includes(sceneIndex)) existing.sceneIndexes.push(sceneIndex);
      } else {
        candidates.set(normalized, {
          term,
          occurrences: 1,
          sceneIndexes: [sceneIndex],
        });
      }
    }
  });

  return [...candidates.values()].sort((a, b) =>
    b.occurrences - a.occurrences || a.term.localeCompare(b.term)
  );
}

export function parseSrtCaptions(input: string): Caption[] {
  return parseSrt({ input }).captions;
}

export function splitCaptionIntoChunks(text: string, _legacyMaxWidthUnits = 36): string[] {
  const cleaned = (text || '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!cleaned) return [];

  const dotToken = '__CAPTION_DOT__';
  const protectedText = cleaned
    .replace(/([A-Za-z0-9])\.([0-9])/g, `$1${dotToken}$2`)
    .replace(/([A-Za-z])\.([A-Z0-9])/g, `$1${dotToken}$2`);

  return protectedText
    .split(/(?<=[。！？!?，,；;、：:])\s*|(?<=\.(?=\s|$|\n))|\n+/)
    .map((segment) => segment.replaceAll(dotToken, '.').trim())
    .filter(Boolean);
}

export function normalizeSceneCaptions(
  scene: Pick<SceneSpec, 'script' | 'captions' | 'durationSeconds' | 'tts'>,
  effectiveDurationSec?: number
): Caption[] {
  const durationSeconds = effectiveDurationSec && effectiveDurationSec > 0
    ? effectiveDurationSec
    : scene.tts?.actualDurationSec && scene.tts.actualDurationSec > 0
      ? scene.tts.actualDurationSec
      : scene.durationSeconds;
  const totalDurationMs = Math.round(Math.max(0, durationSeconds) * 1000);
  if (!scene.captions?.length) {
    return generateCaptionsFromScript(scene.script, durationSeconds);
  }
  const lastEndMs = scene.captions.at(-1)?.endMs ?? 0;
  if (totalDurationMs > 0 && lastEndMs > 0 && Math.abs(lastEndMs - totalDurationMs) / totalDurationMs > 0.12) {
    const scale = totalDurationMs / lastEndMs;
    return scene.captions.map((caption, index) => {
      const startMs = Math.round(caption.startMs * scale);
      const endMs = index === scene.captions!.length - 1
        ? totalDurationMs
        : Math.max(startMs + 1, Math.round(caption.endMs * scale));
      return {
        ...caption,
        startMs,
        endMs,
        timestampMs: Math.round((startMs + endMs) / 2),
      };
    });
  }
  return scene.captions;
}

export function generateProjectCaptions(scenes: SceneSpec[]): Array<Caption & { sceneId: string }> {
  let offsetMs = 0;
  return scenes.flatMap((scene) => {
    const durationSeconds = scene.tts?.actualDurationSec && scene.tts.actualDurationSec > 0
      ? scene.tts.actualDurationSec
      : scene.durationSeconds;
    const captions = normalizeSceneCaptions(scene, durationSeconds);
    const sceneCaptions = captions.map((caption) => ({
      ...caption,
      sceneId: scene.id,
      startMs: caption.startMs + offsetMs,
      endMs: caption.endMs + offsetMs,
      timestampMs: (caption.timestampMs ?? caption.startMs + Math.floor((caption.endMs - caption.startMs) / 2)) + offsetMs,
    }));
    offsetMs += Math.round(durationSeconds * 1000);
    return sceneCaptions;
  });
}

function formatCaptionTimestamp(milliseconds: number, separator: ',' | '.'): string {
  const safeMs = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const millis = safeMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${separator}${String(millis).padStart(3, '0')}`;
}

export function serializeCaptions(captions: Caption[], format: 'srt' | 'vtt'): string {
  const separator = format === 'srt' ? ',' : '.';
  const blocks = captions.map((caption, index) => {
    const timing = `${formatCaptionTimestamp(caption.startMs, separator)} --> ${formatCaptionTimestamp(caption.endMs, separator)}`;
    const text = caption.text.replace(/\r\n?/g, '\n').trim();
    return format === 'srt' ? `${index + 1}\n${timing}\n${text}` : `${timing}\n${text}`;
  });
  return format === 'vtt' ? `WEBVTT\n\n${blocks.join('\n\n')}\n` : `${blocks.join('\n\n')}\n`;
}

export function generateCaptionsFromScript(script: string, durationSeconds: number): Caption[] {
  const segments = splitCaptionIntoChunks(script);
  const totalDurationMs = Math.round(durationSeconds * 1000);

  if (segments.length === 0 || totalDurationMs <= 0) return [];

  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0) || 1;
  let elapsedMs = 0;

  return segments.map((segment, index) => {
    const endMs = index === segments.length - 1
      ? totalDurationMs
      : Math.max(
          elapsedMs + 1,
          Math.round((totalDurationMs * segments.slice(0, index + 1).reduce((sum, item) => sum + item.length, 0)) / totalLength)
        );
    const caption: Caption = {
      text: segment,
      startMs: elapsedMs,
      endMs,
      timestampMs: elapsedMs + Math.floor((endMs - elapsedMs) / 2),
      confidence: 1,
    };
    elapsedMs = endMs;
    return caption;
  });
}
