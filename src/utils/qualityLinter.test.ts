import { describe, expect, it } from 'vitest';
import { SceneSpec } from '../types/training';
import { evaluateProjectQuality } from './qualityLinter';

function makeScene(overrides: Partial<SceneSpec> = {}): SceneSpec {
  return {
    id: 'scene-1',
    index: 0,
    title: 'PCIe Link Training 異常排查',
    subtitle: 'DEBUG FLOW',
    domain: 'debug-logic',
    template: 'architecture-flow',
    durationSeconds: 10,
    keyPoints: ['檢查 REFCLK 100MHz', '確認 PERST# 釋放時序'],
    script: '我們先從時脈與重置訊號開始排查。',
    tts: {
      provider: 'openformosa',
      voiceId: 'hung_yi_lee',
      speed: 1,
      status: 'ready',
      audioUrl: '/audio/scene-1.wav',
    },
    animation: {
      motionStyle: 'spring-snappy',
      effect: 'signal-pulse',
      accentColor: '#00C2FF',
      showSubtitles: true,
      showProgressHud: true,
    },
    ...overrides,
  };
}

describe('evaluateProjectQuality', () => {
  it('passes a well-formed multi-template project with ready audio', () => {
    const report = evaluateProjectQuality(
      {
        title: 'PC Debug Course',
        language: 'zh-TW',
        scenes: [
          makeScene({ id: 's1', index: 0, template: 'title-hero' }),
          makeScene({ id: 's2', index: 1, template: 'architecture-flow' }),
          makeScene({ id: 's3', index: 2, template: 'signal-waveform' }),
          makeScene({ id: 's4', index: 3, template: 'summary-takeaways' }),
        ],
      },
      { requireAudio: true }
    );

    expect(report.passed).toBe(true);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
  });

  it('flags missing titles and exposed internal template labels as errors', () => {
    const report = evaluateProjectQuality({
      title: 'Test',
      language: 'en-US',
      scenes: [
        makeScene({ id: 's1', index: 0, title: '' }),
        makeScene({ id: 's2', index: 1, title: 'signal-waveform', subtitle: 'architecture-flow' }),
      ],
    });

    expect(report.passed).toBe(false);
    expect(report.issues.map((i) => i.code)).toContain('scene-title-missing');
    expect(report.issues.map((i) => i.code)).toContain('implementation-label');
  });

  it('warns on weak visual variety, dense points, and all-caps English titles', () => {
    const report = evaluateProjectQuality({
      title: 'Dense Course',
      language: 'en-US',
      scenes: [
        makeScene({
          id: 's1',
          index: 0,
          template: 'architecture-flow',
          title: 'THIS IS AN ALL CAPS TECHNICAL HEADLINE',
          keyPoints: ['1', '2', '3', '4', '5', '6'],
        }),
        makeScene({ id: 's2', index: 1, template: 'architecture-flow' }),
        makeScene({ id: 's3', index: 2, template: 'architecture-flow' }),
        makeScene({ id: 's4', index: 3, template: 'architecture-flow' }),
      ],
    });

    const codes = report.issues.map((i) => i.code);
    expect(codes).toContain('all-caps-headline');
    expect(codes).toContain('too-many-points');
    expect(codes).toContain('weak-scene-differentiation');
  });

  it('warns when a scene combines too many visual units', () => {
    const report = evaluateProjectQuality({
      title: 'Readable Scenes',
      language: 'en-US',
      scenes: [
        makeScene({
          keyPoints: ['Power', 'Clock', 'Reset', 'Link'],
          remotionPrimitives: ['line-chart', 'number-counter', 'pop-badge', 'camera-pan-zoom', 'svg-trace-path'],
          diagramData: {
            nodes: [1, 2, 3, 4, 5].map((index) => ({ id: `${index}`, label: `Node ${index}` })),
          },
        }),
      ],
    });

    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['too-many-primitives', 'scene-too-dense'])
    );
  });

  it('blocks missing TTS audio when requireAudio is true', () => {
    const report = evaluateProjectQuality(
      {
        title: 'Missing Audio',
        language: 'zh-TW',
        scenes: [
          makeScene({
            tts: {
              provider: 'openformosa',
              voiceId: 'hung_yi_lee',
              speed: 1,
              status: 'idle',
            },
          }),
        ],
      },
      { requireAudio: true }
    );

    expect(report.passed).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'error',
          code: 'narration-audio-missing',
        }),
      ])
    );
  });

  it('warns when declared web sources lack saved provenance', () => {
    const report = evaluateProjectQuality({
      title: 'Sourced Lesson',
      language: 'en-US',
      brief: {
        audience: 'Professionals',
        objective: 'Explain the standard',
        tone: 'calm-instructional',
        sourceUrls: ['https://example.com/spec'],
      },
      researchSources: [],
      scenes: [makeScene()],
    });

    expect(report.issues.map((issue) => issue.code)).toContain('research-provenance-missing');
  });

  it('accepts declared web sources with matching saved provenance', () => {
    const report = evaluateProjectQuality({
      title: 'Sourced Lesson',
      language: 'en-US',
      brief: {
        audience: 'Professionals',
        objective: 'Explain the standard',
        tone: 'calm-instructional',
        sourceUrls: ['https://example.com/spec'],
      },
      researchSources: [{
        requestedUrl: 'https://example.com/spec',
        url: 'https://docs.example.com/specification',
        title: 'Specification',
        chars: 1200,
      }],
      scenes: [makeScene()],
    });

    expect(report.issues.map((issue) => issue.code)).not.toContain('research-provenance-missing');
  });

  it('warns when background music lacks a license note', () => {
    const report = evaluateProjectQuality({
      title: 'Licensed Music Lesson',
      language: 'en-US',
      backgroundMusic: {
        url: '/music/track.mp3',
        fileName: 'track.mp3',
        volume: 0.12,
        loop: true,
      },
      scenes: [makeScene()],
    });

    expect(report.issues.map((issue) => issue.code)).toContain('music-license-note-missing');
  });

  it('warns when technical terms do not match the selected regional language', () => {
    const report = evaluateProjectQuality({
      title: 'Wi-Fi EAPOL',
      language: 'zh-TW',
      scenes: [
        makeScene({
          title: '快速導覽',
          keyPoints: ['目標：派生 PTK'],
          script: 'EAPOL 的任務是安全派生與驗證鑰匙，並檢查關鍵字段。',
        }),
      ],
    });

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'warning',
          code: 'regional-terminology',
        }),
      ])
    );
  });

  it('warns on occluding full-viewport primitives, slow TTS tempo, and caption-audio desync', () => {
    const report = evaluateProjectQuality({
      title: 'PCIe Gen5 LTSSM',
      language: 'zh-TW',
      scenes: [
        makeScene({
          template: 'packet-frame',
          durationSeconds: 16,
          remotionPrimitives: ['code-reveal', 'popping-word-captions'],
          tts: {
            provider: 'openformosa',
            voiceId: 'voice',
            speed: 0.95,
            status: 'ready',
            audioUrl: '/audio/test.wav',
            actualDurationSec: 15.8,
          },
          captions: [
            { text: '先檢查 Ordered Set 欄位。', startMs: 0, endMs: 10000, timestampMs: 5000, confidence: 1 },
          ],
        }),
      ],
    });

    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'primitive-occludes-diagram',
        'tts-tempo-too-slow',
        'caption-audio-desync',
        'scene-too-long',
      ])
    );
  });

  it('warns on degenerate zero-duration or flashing captions', () => {
    const report = evaluateProjectQuality({
      title: 'PCIe Gen5 LTSSM',
      language: 'zh-TW',
      scenes: [
        makeScene({
          durationSeconds: 12,
          captions: [
            { text: '第一段字幕，', startMs: 0, endMs: 94, timestampMs: 47, confidence: 0.9 },
            { text: '第二段字幕，', startMs: 247, endMs: 12000, timestampMs: 6123, confidence: 0.9 },
            { text: '被歸零的字幕。', startMs: 12000, endMs: 12000, timestampMs: 12000, confidence: 0.9 },
          ],
        }),
      ],
    });

    expect(report.issues.map((issue) => issue.code)).toContain('caption-timing-degenerate');
  });
});
