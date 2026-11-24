import { parseSrt } from '@remotion/captions';
import type { Caption } from '@remotion/captions';

export function parseSrtCaptions(input: string): Caption[] {
  return parseSrt({ input }).captions;
}

export function splitCaptionIntoChunks(text: string, maxWidthUnits = 36): string[] {
  const cleaned = (text || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return [];

  const units = Array.from(cleaned).map((char) => /[\u1100-\u11ff\u2e80-\uffff]/.test(char) ? 1 : 0.58);
  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let cursor = start;
    let visualUnits = 0;
    let preferredEnd = -1;

    while (cursor < cleaned.length && visualUnits + units[cursor] <= maxWidthUnits) {
      visualUnits += units[cursor];
      if (/[。！？!?，；;,.、\s]/.test(cleaned[cursor])) preferredEnd = cursor + 1;
      cursor++;
    }

    if (cursor >= cleaned.length) {
      chunks.push(cleaned.slice(start).trim());
      break;
    }

    if (cursor === start) cursor++;
    const minimumPreferredLength = Math.max(1, Math.floor((cursor - start) * 0.55));
    const splitAt = preferredEnd >= start + minimumPreferredLength ? preferredEnd : cursor;
    chunks.push(cleaned.slice(start, splitAt).trim());
    start = splitAt;
    while (start < cleaned.length && /\s/.test(cleaned[start])) start++;
  }

  return chunks.filter(Boolean);
}

export function generateCaptionsFromScript(script: string, durationSeconds: number): Caption[] {
  const sentences = script
    .split(/[。.!?\n]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  if (sentences.length === 0 || durationSeconds <= 0) return [];

  const totalLength = sentences.reduce((sum, sentence) => sum + sentence.length, 0) || 1;
  let elapsedMs = 0;

  return sentences.map((sentence, index) => {
    const durationMs = Math.max(
      300,
      Math.round((durationSeconds * 1000 * sentence.length) / totalLength)
    );
    const endMs = index === sentences.length - 1
      ? Math.round(durationSeconds * 1000)
      : elapsedMs + durationMs;
    const caption: Caption = {
      text: `${sentence}${/[。.!?！？]$/.test(sentence) ? '' : ' '}`,
      startMs: elapsedMs,
      endMs,
      timestampMs: elapsedMs + Math.floor((endMs - elapsedMs) / 2),
      confidence: 1,
    };
    elapsedMs = endMs;
    return caption;
  });
}
