import { describe, expect, it } from 'vitest';
import {
  ensurePoppingTechnicalTermsPrimitive,
  findTechnicalTermMatches,
  getActiveCaption,
  getTechnicalTermOverlayQueue,
  getTimedTechnicalTerms,
  generateProjectCaptions,
  serializeCaptions,
} from './captions';
import type { SceneSpec } from '../types/training';

describe('technical-term caption alignment', () => {
  it('exports project captions with effective scene offsets', () => {
    const baseScene = {
      id: 'scene-1', index: 0, title: 'Intro', subtitle: '', domain: 'debug-logic',
      template: 'title-hero', durationSeconds: 5, keyPoints: [], script: 'First sentence.',
      tts: { provider: 'openformosa', voiceId: 'voice', speed: 1, status: 'ready', audioUrl: '/audio/a.wav', actualDurationSec: 2.5 },
      animation: { motionStyle: 'step-reveal', accentColor: '#fff', showSubtitles: true, showProgressHud: true },
    } satisfies SceneSpec;
    const captions = generateProjectCaptions([
      baseScene,
      { ...baseScene, id: 'scene-2', index: 1, script: 'Second sentence.', tts: { ...baseScene.tts, actualDurationSec: undefined } },
    ]);

    expect(captions[0]).toMatchObject({ sceneId: 'scene-1', startMs: 0, endMs: 2500 });
    expect(captions[1]).toMatchObject({ sceneId: 'scene-2', startMs: 2500, endMs: 7500 });
  });

  it('serializes timestamp separators for SRT and WebVTT', () => {
    const captions = [{ text: 'Hello', startMs: 1500, endMs: 2750, timestampMs: 2000, confidence: 1 }];
    expect(serializeCaptions(captions, 'srt')).toContain('00:00:01,500 --> 00:00:02,750');
    expect(serializeCaptions(captions, 'vtt')).toMatch(/^WEBVTT\n\n00:00:01\.500 --> 00:00:02\.750/);
  });

  it('switches to the next caption exactly at its start boundary', () => {
    const captions = [
      { text: '第一段，', startMs: 0, endMs: 1000, timestampMs: 500, confidence: 1 },
      { text: '第二段。', startMs: 1000, endMs: 2000, timestampMs: 1500, confidence: 1 },
    ];
    expect(getActiveCaption(captions, 999)?.text).toBe('第一段，');
    expect(getActiveCaption(captions, 1000)?.text).toBe('第二段。');
  });

  it('times terms within the active caption', () => {
    const terms = getTimedTechnicalTerms([
      {
        text: 'Wi-Fi 8 以 Distributed RU 提升 10dB UL。',
        startMs: 1000,
        endMs: 9000,
        timestampMs: 5000,
        confidence: 1,
      },
    ], 4500);

    expect(terms.map((term) => term.text)).toEqual(
      expect.arrayContaining(['Wi-Fi 8', 'Distributed RU', '10dB', 'UL'])
    );
    expect(terms.every((term) => term.startMs >= 1000 && term.endMs <= 9000)).toBe(true);
  });

  it('matches spoken terms inside unchanged slide text', () => {
    const matches = findTechnicalTermMatches('Up to 10dB UL in low data rates', [
      { text: '10dB', startMs: 0, endMs: 1000 },
      { text: 'UL', startMs: 1000, endMs: 1800 },
    ]);

    expect(matches.map((match) => match.text)).toEqual(['10dB', 'UL']);
    expect(matches.map((match) => match.start)).toEqual([6, 11]);
  });

  it('rotates persistent overlays in groups of one, two, then three terms', () => {
    const captions = [{
      text: 'MCS LDPC RU SNR PHY QoS DSO',
      startMs: 0,
      endMs: 28000,
      timestampMs: 14000,
      confidence: 1,
    }];

    const at = (ms: number) => getTechnicalTermOverlayQueue(captions, ms).map((term) => term.text);
    expect(at(100)).toEqual(['MCS']);
    expect(at(4500)).toEqual(['MCS', 'LDPC']);
    expect(at(9500)).toEqual(['MCS', 'LDPC', 'RU']);
    expect(at(13500)).toEqual(['SNR']);
    expect(at(22500)).toEqual(['SNR', 'PHY', 'QoS']);
    expect(at(26500)).toEqual(['DSO']);
  });

  it('only emits allowlisted terms from timed extraction and overlays', () => {
    const captions = [{
      text: 'MCS LDPC RU',
      startMs: 0,
      endMs: 9000,
      timestampMs: 4500,
      confidence: 1,
    }];

    expect(getTimedTechnicalTerms(captions, 1000, ['MCS', 'RU']).map((term) => term.text))
      .toEqual(expect.arrayContaining(['MCS', 'RU']));
    expect(getTechnicalTermOverlayQueue(captions, 8000, 3, ['MCS']).map((term) => term.text))
      .toEqual(['MCS']);
  });

  it('enforces the popping primitive for technical scripts without discarding all existing choices', () => {
    const primitives = ensurePoppingTechnicalTermsPrimitive(
      '比較 MCS、LDPC 與 11bn 的延遲改善。',
      ['state-card', 'pop-badge', 'camera-pan-zoom', 'svg-trace-path']
    );

    expect(primitives).toEqual([
      'state-card',
      'pop-badge',
      'camera-pan-zoom',
      'popping-word-captions',
    ]);
  });
});
