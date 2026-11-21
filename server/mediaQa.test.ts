import { describe, expect, it } from 'vitest';
import { inspectRenderedMedia, parseMaxVolumeDb } from './mediaQa';

describe('mediaQa', () => {
  it('parses audible peak dB from ffmpeg volumedetect output', () => {
    const sample = `
[Parsed_volumedetect_0 @ 000001] n_samples: 441000
[Parsed_volumedetect_0 @ 000001] mean_volume: -18.4 dB
[Parsed_volumedetect_0 @ 000001] max_volume: -2.7 dB
`;
    expect(parseMaxVolumeDb(sample)).toBeCloseTo(-2.7, 1);
  });

  it('parses -inf dB as -Infinity', () => {
    const sample = `[Parsed_volumedetect_0 @ 000001] max_volume: -inf dB`;
    expect(parseMaxVolumeDb(sample)).toBe(Number.NEGATIVE_INFINITY);
  });

  it('returns null when max_volume is absent', () => {
    expect(parseMaxVolumeDb('no volume line here')).toBeNull();
  });

  it('fails gracefully when rendered file does not exist', () => {
    const res = inspectRenderedMedia('C:/nonexistent-file-12345.mp4', { expectAudio: true });
    expect(res.passed).toBe(false);
    expect(res.audioStream).toBe(false);
  });
});
