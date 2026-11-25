import { describe, expect, it } from 'vitest';
import { RemotionEffect, SentenceEffectCue } from '../types/training';
import { generateCaptionsFromScript, splitCaptionIntoChunks } from './captions';
import {
  analyzeSentencePairEffect,
  buildSentenceEffectCues,
  getActiveSentenceCue,
  getElementRevealFrame,
  groupSentencesForDynamicBeats,
  splitScriptIntoSentences,
} from './sentenceEffects';

const VALID_EFFECTS: RemotionEffect[] = [
  'signal-pulse',
  'glitch-alert',
  'cascade-reveal',
  'zoom-focus',
  'sweep-scan',
  'packet-traffic',
];

/** Shared invariants every generated cue list must satisfy. */
function expectValidCues(cues: SentenceEffectCue[]) {
  expect(cues.length).toBeGreaterThan(0);
  expect(cues[0].startRatio).toBe(0);
  expect(cues[cues.length - 1].endRatio).toBe(1);

  cues.forEach((cue, i) => {
    expect(cue.beatIndex).toBe(i);
    expect(cue.endRatio).toBeGreaterThan(cue.startRatio);
    expect(cue.startRatio).toBeGreaterThanOrEqual(0);
    expect(cue.endRatio).toBeLessThanOrEqual(1);
    expect(VALID_EFFECTS).toContain(cue.effect);
    expect(cue.sentences.length).toBeGreaterThan(0);
    if (i > 0) expect(cue.startRatio).toBe(cues[i - 1].endRatio);
  });

  expect(new Set(cues.map((c) => c.id)).size).toBe(cues.length);
}

describe('splitCaptionIntoChunks', () => {
  it('breaks long captions at punctuation without dropping text', () => {
    const source = '藍牙與許多裝置共享 2.4 GHz ISM 頻段。理解頻段範圍與鄰頻干擾，是設計連線穩定性的第一步。';
    const chunks = splitCaptionIntoChunks(source, 18);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.join('').replace(/\s/g, '')).toBe(source.replace(/\s/g, ''));
    expect(chunks.every((chunk) => Array.from(chunk).length <= 32)).toBe(true);
  });

  it('returns blank input as no chunks', () => {
    expect(splitCaptionIntoChunks('   ')).toEqual([]);
  });
});

describe('splitScriptIntoSentences', () => {
  it('returns an empty list for blank input', () => {
    expect(splitScriptIntoSentences('')).toEqual([]);
    expect(splitScriptIntoSentences('   \n ')).toEqual([]);
  });

  it('splits on CJK and Latin sentence terminators', () => {
    const out = splitScriptIntoSentences('先檢查電源。再量測時序！Then verify the link. Done?');
    expect(out).toHaveLength(4);
  });

  it('does not split decimals, versions or M.2-style tokens', () => {
    const out = splitScriptIntoSentences('量測 3.3V 電壓。支援 802.11ax 與 M.2 介面。');
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('3.3V');
    expect(out[1]).toContain('802.11ax');
    expect(out[1]).toContain('M.2');
  });

  it('keeps the placeholder token out of the output', () => {
    expect(splitScriptIntoSentences('Ming-3.0 is ready.').join('')).not.toContain('__DOT_NUM__');
  });
});

describe('groupSentencesForDynamicBeats', () => {
  it('maps short sentences one-to-one', () => {
    const beats = groupSentencesForDynamicBeats(['第一句。', '第二句。', '第三句。']);
    expect(beats).toEqual([['第一句。'], ['第二句。'], ['第三句。']]);
  });

  it('can still split a long sentence for standalone visual experimentation', () => {
    const long =
      '先確認電源軌 PG 訊號在開機後是否準時拉高並維持穩定，再用示波器量測 3.3V 電壓是否出現壓降與雜訊干擾。';
    expect(long.length).toBeGreaterThan(48);
    expect(groupSentencesForDynamicBeats([long])).toHaveLength(2);
  });

  it('merges very short clauses instead of creating tiny beats', () => {
    const text = '這是一段刻意寫得很長很長很長很長很長很長很長，好，嗯，行，以及另一段很長的描述文字來測試合併。';
    const beats = groupSentencesForDynamicBeats([text]);
    beats.forEach((b) => expect(b.join('').length).toBeGreaterThanOrEqual(8));
  });

  it('never drops text', () => {
    const input = ['短句。', '這是一個比較長的句子，包含逗號，並且總長度超過四十八個字元所以會被切開來處理。'];
    const joined = groupSentencesForDynamicBeats(input).flat().join('').replace(/\s/g, '');
    expect(joined).toBe(input.join('').replace(/\s/g, ''));
  });
});

describe('analyzeSentencePairEffect', () => {
  const cases: [string, RemotionEffect][] = [
    ['電源出現壓降與雜訊干擾', 'glitch-alert'],
    ['請用示波器量測並確認波形', 'sweep-scan'],
    ['依序完成各階段的交握', 'cascade-reveal'],
    ['核心差異在於比較兩者的優勢', 'zoom-focus'],
    ['訊號經過匯流排進入控制器', 'signal-pulse'],
  ];

  it.each(cases)('maps "%s" to %s', (text, expected) => {
    expect(analyzeSentencePairEffect(text, 0, 'architecture-flow').effect).toBe(expected);
  });

  it('gives glitch-alert priority over measurement keywords', () => {
    expect(analyzeSentencePairEffect('量測發現異常', 0, 'debug-checklist').effect).toBe('glitch-alert');
  });

  it('falls back to the template default when no keyword matches', () => {
    const text = '今天天氣很好';
    expect(analyzeSentencePairEffect(text, 0, 'protocol-timeline').effect).toBe('cascade-reveal');
    expect(analyzeSentencePairEffect(text, 0, 'comparison-matrix').effect).toBe('zoom-focus');
    expect(analyzeSentencePairEffect(text, 0, 'debug-checklist').effect).toBe('sweep-scan');
  });

  it('keeps targetIndex within 0..3 and always supplies a rationale', () => {
    for (let beat = 0; beat < 12; beat++) {
      const r = analyzeSentencePairEffect('任意內容', beat, 'summary-takeaways');
      expect(r.targetIndex).toBeGreaterThanOrEqual(0);
      expect(r.targetIndex).toBeLessThanOrEqual(3);
      expect(r.rationale.length).toBeGreaterThan(0);
    }
  });
});

describe('buildSentenceEffectCues', () => {
  const script =
    '第一句說明架構。第二句量測波形！第三句出現雜訊異常。第四句比較差異。Fifth sentence ends here.';

  it('produces contiguous, ordered, fully covering cues', () => {
    expectValidCues(buildSentenceEffectCues(script, 'architecture-flow'));
  });

  it('creates one beat per short sentence', () => {
    expect(buildSentenceEffectCues(script, 'architecture-flow')).toHaveLength(5);
  });

  it('does not split one long sentence at a comma', () => {
    const sentence = '先確認電源，再量測時序，最後驗證鏈路是否穩定。';
    const cues = buildSentenceEffectCues(sentence, 'title-hero');
    expect(cues).toHaveLength(1);
    expect(cues[0].sentences).toEqual([sentence]);
  });

  it('weights cue length by character count', () => {
    const cues = buildSentenceEffectCues('短。這是一個明顯比較長的第二句話用來測試權重分配。', 'title-hero');
    const [a, b] = cues;
    expect(b.endRatio - b.startRatio).toBeGreaterThan(a.endRatio - a.startRatio);
  });

  it('still returns a single full-range cue for an empty script', () => {
    const cues = buildSentenceEffectCues('', 'title-hero');
    expect(cues).toHaveLength(1);
    expect(cues[0].startRatio).toBe(0);
    expect(cues[0].endRatio).toBe(1);
  });

  it('preserves custom effect, rationale, targetIndex and id from existing cues', () => {
    const cues = buildSentenceEffectCues(script, 'architecture-flow', 'signal-pulse', [
      { id: 'custom-0', effect: 'zoom-focus', rationale: 'manual', targetIndex: 3 },
    ]);
    expect(cues[0]).toMatchObject({
      id: 'custom-0',
      effect: 'zoom-focus',
      rationale: 'manual',
      targetIndex: 3,
    });
    expectValidCues(cues);
  });

  it('is deterministic', () => {
    expect(buildSentenceEffectCues(script, 'title-hero')).toEqual(
      buildSentenceEffectCues(script, 'title-hero')
    );
  });
});

describe('getElementRevealFrame', () => {
  const cues = [
    { beatIndex: 0, targetIndex: 2, startRatio: 0, endRatio: 0.3 },
    { beatIndex: 1, targetIndex: 0, startRatio: 0.3, endRatio: 0.65 },
    { beatIndex: 2, targetIndex: 1, startRatio: 0.65, endRatio: 1 },
  ] as SentenceEffectCue[];

  it('reveals each item at the first cue that targets it', () => {
    expect(getElementRevealFrame(cues, 0, 3, 300)).toBe(90);
    expect(getElementRevealFrame(cues, 1, 3, 300)).toBe(195);
    expect(getElementRevealFrame(cues, 2, 3, 300)).toBe(6);
  });

  it('keeps the scene blank for the lead-in before the first mention', () => {
    expect(getElementRevealFrame(cues, 2, 3, 300, 12)).toBe(12);
  });

  it('uses the cue order when a cue never explicitly targets an item', () => {
    const sparseCues = cues.map((cue, index) => ({
      ...cue,
      targetIndex: index === 2 ? 0 : 0,
    }));
    expect(getElementRevealFrame(sparseCues, 2, 4, 300)).toBe(195);
  });
});

describe('generateCaptionsFromScript', () => {
  it('creates one caption for each sentence without splitting commas', () => {
    const script = '先確認 3.3V 電源，再檢查時序。接著量測鏈路品質。';
    const captions = generateCaptionsFromScript(script, 12);
    expect(captions).toHaveLength(2);
    expect(captions[0].text.trim()).toBe('先確認 3.3V 電源，再檢查時序。');
    expect(captions[1].text.trim()).toBe('接著量測鏈路品質。');
  });
});

describe('getActiveSentenceCue', () => {
  const script = '第一句。第二句。第三句。';
  const cues = buildSentenceEffectCues(script, 'architecture-flow');

  it('selects the first cue at progress 0 and the last at progress 1', () => {
    expect(getActiveSentenceCue(cues, 0, script, 'architecture-flow').cue.beatIndex).toBe(0);
    expect(getActiveSentenceCue(cues, 1, script, 'architecture-flow').cue.beatIndex).toBe(cues.length - 1);
  });

  it('hands over to the next cue exactly at a boundary', () => {
    const boundary = cues[0].endRatio;
    const at = getActiveSentenceCue(cues, boundary, script, 'architecture-flow');
    expect(at.cue.beatIndex).toBe(1);
    expect(at.cueProgress).toBeCloseTo(0, 5);
  });

  it('clamps out-of-range progress', () => {
    expect(getActiveSentenceCue(cues, -5, script, 'architecture-flow').cue.beatIndex).toBe(0);
    expect(getActiveSentenceCue(cues, 9, script, 'architecture-flow').cue.beatIndex).toBe(cues.length - 1);
  });

  it('keeps cueProgress within 0..1 across the whole scene', () => {
    for (let i = 0; i <= 200; i++) {
      const { cueProgress } = getActiveSentenceCue(cues, i / 200, script, 'architecture-flow');
      expect(cueProgress).toBeGreaterThanOrEqual(0);
      expect(cueProgress).toBeLessThanOrEqual(1);
    }
  });

  it('visits every cue in order as progress advances', () => {
    const seen: number[] = [];
    for (let i = 0; i <= 300; i++) {
      const idx = getActiveSentenceCue(cues, i / 300, script, 'architecture-flow').cue.beatIndex;
      if (seen[seen.length - 1] !== idx) seen.push(idx);
    }
    expect(seen).toEqual(cues.map((_, i) => i));
  });

  it('derives cues from the script when none are supplied', () => {
    const r = getActiveSentenceCue(undefined, 0.5, script, 'architecture-flow');
    expect(r.cues.length).toBeGreaterThan(0);
  });
});
