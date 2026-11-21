import { describe, expect, it } from 'vitest';
import { computeTtsProgressMetrics, resolveTtsStage } from './ttsProgress';

describe('computeTtsProgressMetrics', () => {
  it('advances smoothly during first scene even before any scene completes', () => {
    const start = computeTtsProgressMetrics({
      totalScenes: 6,
      readyScenes: 0,
      generatingCount: 1,
      currentSceneElapsedSec: 0,
      completedDurationsSec: [],
      provider: 'openformosa',
      device: 'cpu',
    });
    const mid = computeTtsProgressMetrics({
      totalScenes: 6,
      readyScenes: 0,
      generatingCount: 1,
      currentSceneElapsedSec: 60,
      completedDurationsSec: [],
      provider: 'openformosa',
      device: 'cpu',
    });
    expect(start.overallPct).toBeGreaterThanOrEqual(1);
    expect(mid.currentScenePct).toBeGreaterThan(start.currentScenePct);
    expect(mid.overallPct).toBeGreaterThan(start.overallPct);
    expect(mid.overallPct).toBeLessThan(100);
    expect(mid.estimatedRemainingSec).toBeGreaterThan(0);
  });

  it('refines ETA using actual completed scene durations', () => {
    const metrics = computeTtsProgressMetrics({
      totalScenes: 5,
      readyScenes: 2,
      generatingCount: 1,
      currentSceneElapsedSec: 10,
      completedDurationsSec: [20, 30],
      provider: 'openformosa',
      device: 'cpu',
    });
    // avg = 25s -> current remaining = 15s, 2 queued scenes = 50s -> total 65s
    expect(metrics.estimatedSecPerScene).toBe(25);
    expect(metrics.estimatedRemainingSec).toBe(65);
    expect(metrics.overallPct).toBeGreaterThan(40);
    expect(metrics.overallPct).toBeLessThan(60);
  });

  it('returns 100% and 0 ETA when all scenes are ready', () => {
    const metrics = computeTtsProgressMetrics({
      totalScenes: 4,
      readyScenes: 4,
      generatingCount: 0,
      currentSceneElapsedSec: 0,
      completedDurationsSec: [12, 14, 11, 13],
    });
    expect(metrics.overallPct).toBe(100);
    expect(metrics.estimatedRemainingSec).toBe(0);
  });
});

describe('resolveTtsStage', () => {
  it('prefers live BlueMagpie loading_model state when OpenFormosa is active', () => {
    const stage = resolveTtsStage(
      {
        activeJobs: [
          {
            sceneId: 's1',
            provider: 'openformosa',
            voice: 'bm-1',
            textChars: 120,
            stage: 'synthesizing',
            stageLabel: '正在透過 OpenFormosa 合成...',
            startedAt: 1000,
            stageStartedAt: 1000,
            updatedAt: 1000,
          },
        ],
        engineStatus: {
          state: 'loading_model',
          stage_label: '正在載入 BlueMagpie-TTS 模型權重 (CPU)...',
          device: 'cpu',
          model_loaded: false,
        },
      },
      's1',
      'openformosa',
      'cpu'
    );
    expect(stage.stepKey).toBe('loading-model');
    expect(stage.isLoadingModel).toBe(true);
    expect(stage.label).toContain('模型權重');
  });

  it('reflects Edge TTS fallback stage from backend job', () => {
    const stage = resolveTtsStage(
      {
        activeJobs: [
          {
            sceneId: 's2',
            provider: 'openformosa',
            voice: 'bm-1',
            textChars: 80,
            stage: 'fallback-edge',
            stageLabel: '正在使用快速神經網路語音 (Edge TTS) 合成 (80 字)...',
            startedAt: 1000,
            stageStartedAt: 2000,
            updatedAt: 2000,
          },
        ],
      },
      's2',
      'openformosa',
      'cpu'
    );
    expect(stage.stepKey).toBe('synthesizing');
    expect(stage.device).toBe('cloud');
    expect(stage.label).toContain('Edge TTS');
  });
});
