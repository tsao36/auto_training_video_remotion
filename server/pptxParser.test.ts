import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterAll, describe, expect, it } from 'vitest';
import { parsePptxBuffer } from './pptxParser';
import { generateVideoPlanWithLlm } from './llmGenerator';

const tmpMediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pptx-media-test-'));

afterAll(() => {
  fs.rmSync(tmpMediaDir, { recursive: true, force: true });
});

async function buildSamplePptxBuffer(): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <p:sldIdLst>
        <p:sldId id="256" r:id="rId1"/>
        <p:sldId id="257" r:id="rId2"/>
      </p:sldIdLst>
      <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
    </p:presentation>`
  );

  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
    </Relationships>`
  );

  zip.file(
    'ppt/theme/theme1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="IntelTest">
      <a:themeElements>
        <a:clrScheme name="Intel">
          <a:dk1><a:srgbClr val="0F172A"/></a:dk1>
          <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
          <a:dk2><a:srgbClr val="1E293B"/></a:dk2>
          <a:lt2><a:srgbClr val="F1F5F9"/></a:lt2>
          <a:accent1><a:srgbClr val="0071C5"/></a:accent1>
          <a:accent2><a:srgbClr val="00C2FF"/></a:accent2>
        </a:clrScheme>
        <a:fontScheme name="Office">
          <a:majorFont><a:latin typeface="Intel Clear"/></a:majorFont>
          <a:minorFont><a:latin typeface="Segoe UI"/></a:minorFont>
        </a:fontScheme>
      </a:themeElements>
    </a:theme>`
  );

  // 1x1 transparent PNG
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );
  zip.file('ppt/media/image1.png', tinyPng);

  // Slide 1: dark blue background, title shape, bullet shape, embedded image, speaker notes
  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <p:cSld>
        <p:bg>
          <p:bgPr>
            <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
          </p:bgPr>
        </p:bg>
        <p:spTree>
          <p:sp>
            <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr>
            <p:spPr>
              <a:xfrm><a:off x="914400" y="685800"/><a:ext cx="10363200" cy="1143000"/></a:xfrm>
              <a:prstGeom prst="rect"/>
            </p:spPr>
            <p:txBody>
              <a:bodyPr anchor="ctr"/>
              <a:p>
                <a:pPr algn="ctr"/>
                <a:r>
                  <a:rPr sz="4400" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr>
                  <a:t>PCIe Gen5 Signal Integrity</a:t>
                </a:r>
              </a:p>
            </p:txBody>
          </p:sp>
          <p:pic>
            <p:nvPicPr><p:cNvPr id="3" name="Logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
            <p:blipFill><a:blip r:embed="rIdImg1"/></p:blipFill>
            <p:spPr>
              <a:xfrm><a:off x="914400" y="2286000"/><a:ext cx="1828800" cy="1828800"/></a:xfrm>
            </p:spPr>
          </p:pic>
        </p:spTree>
      </p:cSld>
    </p:sld>`
  );

  zip.file(
    'ppt/slides/_rels/slide1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
      <Relationship Id="rIdNote1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
    </Relationships>`
  );

  zip.file(
    'ppt/notesSlides/notesSlide1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Welcome to PCIe Gen5 Signal Integrity training.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
    </p:notes>`
  );

  // Slide 2: white background, table
  zip.file(
    'ppt/slides/slide2.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp>
            <p:nvSpPr><p:cNvPr id="2" name="Title 2"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
            <p:spPr>
              <a:xfrm><a:off x="609600" y="457200"/><a:ext cx="10972800" cy="914400"/></a:xfrm>
            </p:spPr>
            <p:txBody>
              <a:p><a:r><a:rPr sz="3200" b="1"/><a:t>Channel Loss Budget</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
          <p:graphicFrame>
            <p:nvGraphicFramePr><p:cNvPr id="4" name="Table 1"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
            <p:xfrm><a:off x="609600" y="1828800"/><a:ext cx="10972800" cy="2743200"/></p:xfrm>
            <a:graphic>
              <a:graphicData>
                <a:tbl>
                  <a:tblGrid><a:gridCol w="5486400"/><a:gridCol w="5486400"/></a:tblGrid>
                  <a:tr h="914400">
                    <a:tc><a:txBody><a:p><a:r><a:t>Metric</a:t></a:r></a:p></a:txBody><a:tcPr><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:tcPr></a:tc>
                    <a:tc><a:txBody><a:p><a:r><a:t>Target</a:t></a:r></a:p></a:txBody><a:tcPr><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:tcPr></a:tc>
                  </a:tr>
                  <a:tr h="914400">
                    <a:tc><a:txBody><a:p><a:r><a:t>Insertion Loss @ 16GHz</a:t></a:r></a:p></a:txBody></a:tc>
                    <a:tc><a:txBody><a:p><a:r><a:t>-36 dB max</a:t></a:r></a:p></a:txBody></a:tc>
                  </a:tr>
                </a:tbl>
              </a:graphicData>
            </a:graphic>
          </p:graphicFrame>
        </p:spTree>
      </p:cSld>
    </p:sld>`
  );

  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('parsePptxBuffer & PPTX 1:1 Remotion plan generation', () => {
  it('parses slide dimensions, theme background, shapes, images, tables, and notes accurately', async () => {
    const buf = await buildSamplePptxBuffer();
    const result = await parsePptxBuffer(buf, 'PCIe_Gen5_Deck.pptx', tmpMediaDir);

    expect(result.title).toBe('PCIe_Gen5_Deck');
    expect(result.slides).toHaveLength(2);

    const s1 = result.slides[0];
    expect(s1.slideWidthPx).toBe(1920);
    expect(s1.slideHeightPx).toBe(1080);
    expect(s1.background.type).toBe('solid');
    expect(s1.background.color).toBe('#0071C5');
    expect(s1.title).toBe('PCIe Gen5 Signal Integrity');
    expect(s1.notes).toBe('Welcome to PCIe Gen5 Signal Integrity training.');

    const shapeEl = s1.elements.find((e) => e.kind === 'shape');
    expect(shapeEl).toBeDefined();
    expect(shapeEl?.paragraphs?.[0]?.runs[0]?.color).toBe('#FFFFFF');
    expect(shapeEl?.paragraphs?.[0]?.runs[0]?.bold).toBe(true);

    const imgEl = s1.elements.find((e) => e.kind === 'image');
    expect(imgEl).toBeDefined();
    expect(imgEl?.imageUrl).toMatch(/^\/pptx-media\/slide-img-[a-f0-9]+\.png$/);

    const s2 = result.slides[1];
    expect(s2.background.color).toBe('#FFFFFF');
    expect(s2.title).toBe('Channel Loss Budget');
    const tblEl = s2.elements.find((e) => e.kind === 'table');
    expect(tblEl).toBeDefined();
    expect(tblEl?.tableRows).toHaveLength(2);
    expect(tblEl?.tableRows?.[1].cells[1].textParagraphs[0].runs[0].text).toBe('-36 dB max');
  });

  it('generates 1-to-1 pptx-slide scenes with scripts matching slide content', async () => {
    const buf = await buildSamplePptxBuffer();
    const parsed = await parsePptxBuffer(buf, 'PCIe_Gen5_Deck.pptx', tmpMediaDir);

    const plan = await generateVideoPlanWithLlm({
      topic: parsed.title,
      durationSeconds: 30,
      domain: 'debug-logic',
      rawText: parsed.rawText,
      pptxSlides: parsed.slides,
      llmConfig: { baseUrl: 'https://invalid.local/v1', apiKey: '' },
    });

    expect(plan.scenes).toHaveLength(2);
    expect(plan.scenes[0].template).toBe('pptx-slide');
    expect(plan.scenes[0].pptxSlide?.slideNumber).toBe(1);
    expect(plan.scenes[0].script).toContain('PCIe Gen5 Signal Integrity');

    expect(plan.scenes[1].template).toBe('pptx-slide');
    expect(plan.scenes[1].pptxSlide?.slideNumber).toBe(2);
    expect(plan.scenes[1].script).toContain('Channel Loss Budget');
    expect(plan.scenes[1].script).toContain('-36 dB max');
  });
});
