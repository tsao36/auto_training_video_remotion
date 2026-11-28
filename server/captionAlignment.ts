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
  if (boundaryCount === 0 || durationSec <= 0) return fallback;

  const usable = silences
    .filter((interval) => interval.startSec > 0.08 && interval.endSec < durationSec - 0.08 && interval.endSec >= interval.startSec)
    .sort((a, b) => a.startSec - b.startSec);
  if (usable.length === 0) return fallback;

  const lengths = phrases.map((phrase) => Math.max(1, phrase.length));
  const totalLength = lengths.reduce((sum, len) => sum + len, 0);
  const expectedBoundaries: number[] = [];
  let cumulative = 0;
  for (let i = 0; i < boundaryCount; i++) {
    cumulative += lengths[i];
    expectedBoundaries.push((cumulative / totalLength) * durationSec);
  }

  const avgPhraseSec = durationSec / phrases.length;
  const maxDriftSec = Math.max(0.75, Math.min(2.2, avgPhraseSec * 0.65));
  const minPhraseSec = Math.max(0.35, Math.min(0.6, avgPhraseSec * 0.35));

  // Match each expected phrase boundary to the nearest unused silence within maxDriftSec
  // while preserving monotonic time order and minimum readable phrase durations.
  const matched: Array<SilenceInterval | null> = new Array(boundaryCount).fill(null);
  let silenceCursor = 0;
  let prevConfirmedEnd = 0;

  for (let i = 0; i < boundaryCount; i++) {
    const target = expectedBoundaries[i];
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;

    for (let j = silenceCursor; j < usable.length; j++) {
      const candidate = usable[j];
      const dist = Math.abs(candidate.startSec - target);
      if (
        dist <= maxDriftSec &&
        candidate.startSec >= prevConfirmedEnd + minPhraseSec &&
        durationSec - candidate.endSec >= minPhraseSec * (boundaryCount - i) * 0.5
      ) {
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = j;
        }
      }
    }

    if (bestIdx >= 0) {
      matched[i] = usable[bestIdx];
      prevConfirmedEnd = usable[bestIdx].endSec;
      silenceCursor = bestIdx + 1;
    }
  }

  // If no boundaries matched a measured silence, fall back cleanly to proportional timing
  if (matched.every((entry) => entry === null)) return fallback;

  // Build resolved boundary intervals: confirmed silences stay anchored, unmatched
  // boundaries are interpolated proportionally by character length between anchors.
  const boundaries: Array<{ endOfPrev: number; startOfNext: number }> = new Array(boundaryCount);
  let anchorIdx = -1;
  let anchorStartSec = 0;

  while (anchorIdx < boundaryCount) {
    let nextAnchorIdx = anchorIdx + 1;
    while (nextAnchorIdx < boundaryCount && matched[nextAnchorIdx] === null) {
      nextAnchorIdx++;
    }

    const spanEndSec =
      nextAnchorIdx < boundaryCount
        ? matched[nextAnchorIdx]!.startSec
        : durationSec;
    const firstPhrase = anchorIdx + 1;
    const lastPhrase = nextAnchorIdx; // inclusive
    const spanChars = lengths
      .slice(firstPhrase, lastPhrase + 1)
      .reduce((sum, len) => sum + len, 0) || 1;
    const spanDuration = Math.max(0, spanEndSec - anchorStartSec);

    let runningChars = 0;
    for (let b = anchorIdx + 1; b < nextAnchorIdx; b++) {
      runningChars += lengths[b];
      const t = anchorStartSec + (runningChars / spanChars) * spanDuration;
      boundaries[b] = { endOfPrev: t, startOfNext: t };
    }

    if (nextAnchorIdx < boundaryCount) {
      const silence = matched[nextAnchorIdx]!;
      boundaries[nextAnchorIdx] = {
        endOfPrev: Math.min(durationSec, silence.startSec),
        startOfNext: Math.min(durationSec, silence.endSec),
      };
      anchorStartSec = boundaries[nextAnchorIdx].startOfNext;
    }
    anchorIdx = nextAnchorIdx;
  }

  const captions: Caption[] = phrases.map((text, index) => {
    const startSec = index === 0 ? 0 : boundaries[index - 1].startOfNext;
    const endSec = index === phrases.length - 1 ? durationSec : boundaries[index].endOfPrev;
    const startMs = Math.round(startSec * 1000);
    const endMs = Math.round(endSec * 1000);
    return {
      text,
      startMs,
      endMs,
      timestampMs: Math.round((startMs + endMs) / 2),
      confidence: 0.9,
    };
  });

  // Safety check: if any caption ended up too short (<250ms) or inverted, fall back to proportional timing
  const hasDegenerateCaption = captions.some((c) => c.endMs - c.startMs < 250);
  return hasDegenerateCaption ? fallback : captions;
}

export function generateAlignedCaptions(script: string, durationSec: number, audioPath: string): Caption[] {
  return alignCaptionsToSilences(script, durationSec, detectNarrationSilences(audioPath));
}
