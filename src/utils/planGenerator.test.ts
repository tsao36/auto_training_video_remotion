import { describe, expect, it } from 'vitest';
import type { SceneSpec } from '../types/training';
import {
  balanceScenesToDuration,
  buildPlanFromSource,
  computeRichnessDuration,
  formatDuration,
  getDefaultDiagramData,
  getRequiredSceneSeconds,
  MIN_SCENE_SECONDS,
} from './planGenerator';

function makeScene(overrides: Partial<SceneSpec> = {}): SceneSpec {
  return {
    id: 'scene-1',
    index: 0,
    title: 'PCIe Link Training',
    subtitle: 'DEBUG',
    domain: 'debug-logic',
    template: 'architecture-flow',
    durationSeconds: 10,
    keyPoints: ['REFCLK 100MHz', 'PERST#'],
    script: '檢查參考時脈與重置訊號時序。',
    tts: {
      provider: 'openformosa',
      voiceId: 'hung_yi_lee',
      speed: 1,
      status: 'idle',
    },
    animation: {
      motionStyle: 'spring-snappy',
      accentColor: '#00C2FF',
      showSubtitles: true,
      showProgressHud: true,
    },
    ...overrides,
  };
}

describe('planGenerator', () => {
  it('formats seconds as zero-padded MM:SS', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('prefers actual TTS duration with breathing buffer over script estimate', () => {
    const scene = makeScene({
      script: '短句',
      tts: { provider: 'openformosa', voiceId: 'v', speed: 1, status: 'ready', actualDurationSec: 11.2 },
    });
    expect(getRequiredSceneSeconds(scene)).toBe(12);
    expect(computeRichnessDuration(scene)).toBe(12);
  });

  it('enforces minimum scene seconds for empty script', () => {
    const scene = makeScene({ script: '', keyPoints: [], diagramData: undefined });
    expect(getRequiredSceneSeconds(scene)).toBe(MIN_SCENE_SECONDS);
  });

  it('balances scene durations to exact target without cutting below actual TTS length', () => {
    const scenes = [
      makeScene({
        id: 's1',
        durationSeconds: 10,
        tts: { provider: 'openformosa', voiceId: 'v', speed: 1, status: 'ready', actualDurationSec: 14.2 },
      }),
      makeScene({ id: 's2', durationSeconds: 20 }),
      makeScene({ id: 's3', durationSeconds: 20 }),
    ];

    const balanced = balanceScenesToDuration(scenes, 40);
    const total = balanced.reduce((sum, s) => sum + s.durationSeconds, 0);

    expect(total).toBe(40);
    expect(balanced[0].durationSeconds).toBeGreaterThanOrEqual(15);
    expect(balanced.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('builds a balanced 10-minute plan from research text and slides', () => {
    const project = buildPlanFromSource({
      title: 'Wi-Fi 7 MLO 實務',
      domain: 'wifi',
      sourceType: 'research-text',
      rawText: 'Wi-Fi 7 導入 MLO 多鏈路聚合，能同時使用 5GHz 與 6GHz 提升吞吐量與降低延遲。',
      defaultTtsProvider: 'openformosa',
    });

    const total = project.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
    expect(project.scenes.length).toBeGreaterThan(0);
    expect(total).toBe(600);
    expect(project.scenes[0].template).toBe('title-hero');
  });

  it('provides domain-specific default diagram data for key templates', () => {
    expect(getDefaultDiagramData('wifi', 'architecture-flow')?.nodes?.length).toBeGreaterThan(0);
    expect(getDefaultDiagramData('debug-logic', 'signal-waveform')?.waveformChannels?.length).toBeGreaterThan(0);
    expect(getDefaultDiagramData('bluetooth', 'comparison-matrix')?.comparisonRows?.length).toBeGreaterThan(0);
  });
});
