import { describe, expect, it } from 'vitest';
import { alignCaptionsToSilences, parseSilenceIntervals } from './captionAlignment';

describe('captionAlignment', () => {
  it('parses FFmpeg silence intervals', () => {
    const intervals = parseSilenceIntervals('[silencedetect] silence_start: 1.2\n[silencedetect] silence_end: 1.5 | silence_duration: 0.3');
    expect(intervals).toEqual([{ startSec: 1.2, endSec: 1.5 }]);
  });

  it('places caption boundaries on measured pauses', () => {
    const captions = alignCaptionsToSilences('First phrase. Second phrase.', 5, [
      { startSec: 2.1, endSec: 2.4 },
    ]);
    expect(captions[0].endMs).toBe(2100);
    expect(captions[1].startMs).toBe(2400);
  });

  it('uses detected pause boundaries when enough phrases and silences exist', () => {
    const captions = alignCaptionsToSilences('One. Two. Three.', 9, [
      { startSec: 2.4, endSec: 2.7 },
      { startSec: 5.1, endSec: 5.5 },
    ]);
    expect(captions[0]).toMatchObject({ endMs: 2400 });
    expect(captions[1]).toMatchObject({ startMs: 2700, endMs: 5100 });
    expect(captions[2]).toMatchObject({ startMs: 5500, endMs: 9000 });
  });

  it('falls back to proportional timing without enough pauses', () => {
    const captions = alignCaptionsToSilences('A short sentence. Another sentence.', 4, []);
    expect(captions[0].startMs).toBe(0);
    expect(captions.at(-1)?.endMs).toBe(4000);
  });
});
