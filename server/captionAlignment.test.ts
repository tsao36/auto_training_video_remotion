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

  it('never drops trailing phrases to zero duration when fewer silences than boundaries exist', () => {
    const script = 'LTSSM 是 PCIe 的鏈路訓練狀態機。先看哪個狀態卡住，可以馬上縮小故障範圍：PHY 偵測、Polling 協商、Configuration 完成或進入 Recovery，決定下一步量測與檢查項目。';
    const captions = alignCaptionsToSilences(script, 12.48, [
      { startSec: 3.7, endSec: 4.15 },
      { startSec: 10.25, endSec: 10.4 },
    ]);
    expect(captions.length).toBeGreaterThanOrEqual(5);
    expect(captions[0].startMs).toBe(0);
    expect(captions.at(-1)?.endMs).toBe(12480);
    for (let i = 0; i < captions.length; i++) {
      expect(captions[i].endMs - captions[i].startMs).toBeGreaterThanOrEqual(250);
      if (i > 0) {
        expect(captions[i].startMs).toBeGreaterThanOrEqual(captions[i - 1].endMs);
      }
    }
  });

  it('ignores early noise-blip silences that would crush the opening phrase', () => {
    const script = '本單元示範 PCIe Gen5 的 LTSSM 鏈路訓練與實務除錯步驟，重點是快速定位訓練失敗來源，並提供可執行的回復策略，適合 PC 與筆電工程師作為工作複習。';
    const captions = alignCaptionsToSilences(script, 12.01, [
      { startSec: 0.094, endSec: 0.247 },
      { startSec: 3.714, endSec: 3.917 },
      { startSec: 5.215, endSec: 5.431 },
    ]);
    expect(captions[0].endMs - captions[0].startMs).toBeGreaterThan(2000);
    for (const c of captions) {
      expect(c.endMs - c.startMs).toBeGreaterThanOrEqual(250);
    }
  });
});
