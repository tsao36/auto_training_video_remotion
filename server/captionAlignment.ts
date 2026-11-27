import { spawnSync } from 'node:child_process';
import type { Caption } from '@remotion/captions';
import { generateCaptionsFromScript, splitCaptionIntoChunks } from '../src/utils/captions';

export interface SilenceInterval {
  startSec: number;
  endSec: number;
}

export function parseSilenceIntervals(ffmpegLog: string): SilenceInterval[] {
  const intervals: SilenceInterval[] = [];
  let pending: number | null = null;
  for (const line of ffmpegLog.split(/\r?\n/)) {
    const start = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/i);
    if (start) pending = Number(start[1]);
    const end = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/i);
    if (end && pending !== null) {
      intervals.push({ startSec: Math.max(0, pending), endSec: Math.max(0, Number(end[1])) });
      pending = null;
    }
  }
  return intervals;
}

export function detectNarrationSilences(audioPath: string, ffmpegBin = 'ffmpeg'): SilenceInterval[] {
  const result = spawnSync(ffmpegBin, [
    '-hide_banner', '-i', audioPath,
    '-af', 'silencedetect=noise=-38dB:d=0.12',
    '-f', 'null', '-',
  ], { encoding: 'utf8', windowsHide: true });
  if (result.error) return [];
  return parseSilenceIntervals(`${result.stdout || ''}\n${result.stderr || ''}`);
}

export function alignCaptionsToSilences(
  script: string,
  durationSec: number,
  silences: SilenceInterval[]
): Caption[] {
  const fallback = generateCaptionsFromScript(script, durationSec);
  const phrases = splitCaptionIntoChunks(script);
  const boundaryCount = Math.max(0, phrases.length - 1);
  const usable = silences
    .filter((interval) => interval.startSec > 0.08 && interval.endSec < durationSec - 0.08)
    .sort((a, b) => a.startSec - b.startSec);
  if (boundaryCount === 0 || usable.length < Math.min(2, boundaryCount)) return fallback;

  const totalLength = phrases.reduce((sum, phrase) => sum + phrase.length, 0) || 1;
  const expected = phrases.slice(0, -1).reduce<number[]>((targets, phrase, index) => {
    const prior = index === 0 ? 0 : phrases.slice(0, index).reduce((sum, value) => sum + value.length, 0);
    targets.push(((prior + phrase.length) / totalLength) * durationSec);
    return targets;
  }, []);

  const remaining = [...usable];
  const selected = expected.map((target) => {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((interval, index) => {
      const distance = Math.abs(interval.startSec - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    const [match] = remaining.splice(bestIndex, 1);
    return match;
  }).sort((a, b) => a.startSec - b.startSec);

  let startSec = 0;
  return phrases.map((text, index) => {
    const silence = selected[index];
    const endSec = silence
      ? Math.min(durationSec, silence.startSec)
      : durationSec;
    const caption: Caption = {
      text,
      startMs: Math.round(startSec * 1000),
      endMs: Math.round(endSec * 1000),
      timestampMs: Math.round(((startSec + endSec) / 2) * 1000),
      confidence: 0.9,
    };
    startSec = silence ? Math.min(durationSec, silence.endSec) : durationSec;
    return caption;
  });
}

export function generateAlignedCaptions(script: string, durationSec: number, audioPath: string): Caption[] {
  return alignCaptionsToSilences(script, durationSec, detectNarrationSilences(audioPath));
}
