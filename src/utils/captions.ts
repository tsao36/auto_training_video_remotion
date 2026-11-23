import { parseSrt } from '@remotion/captions';
import type { Caption } from '@remotion/captions';

export function parseSrtCaptions(input: string): Caption[] {
  return parseSrt({ input }).captions;
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
