import { TtsProvider } from '../types/training';

export type TtsPipelineStepKey =
  | 'loading-model'
  | 'preparing-voice'
  | 'synthesizing'
  | 'encoding'
  | 'measuring-audio';

export interface ActiveTtsJobStatus {
  sceneId: string;
  provider: TtsProvider;
  voice: string;
  textChars: number;
  stage:
    | 'checking-cache'
    | 'connecting-engine'
    | 'synthesizing'
    | 'fallback-edge'
    | 'fallback-silent'
    | 'measuring-audio';
  stageLabel: string;
  startedAt: number;
  stageStartedAt: number;
  updatedAt: number;
  engineUrl?: string;
}

export interface BlueMagpieEngineStatus {
  ok?: boolean;
  state?: 'idle' | 'loading_model' | 'preparing_voice' | 'generating' | 'encoding';
  stage_label?: string;
  started_at?: number | null;
  stage_started_at?: number | null;
  text_chars?: number;
  voice?: string;
  completed_count?: number;
  last_duration_sec?: number | null;
  device?: string;
  device_name?: string | null;
  model_loaded?: boolean;
  server_time_ms?: number;
}

export interface TtsLiveStatusResponse {
  ok?: boolean;
  serverTimeMs?: number;
  activeJobs?: ActiveTtsJobStatus[];
  engineStatus?: BlueMagpieEngineStatus | null;
}

export interface TtsProgressInput {
  totalScenes: number;
  readyScenes: number;
  generatingCount: number;
  currentSceneElapsedSec: number;
  completedDurationsSec: number[];
  provider?: TtsProvider;
  device?: string | null;
  engineLastDurationSec?: number | null;
  isLoadingModel?: boolean;
}

export interface TtsProgressMetrics {
  /** Smooth overall percentage (0-100) including fractional active scene progress */
  overallPct: number;
  /** Estimated progress (0-95) of the currently synthesizing scene */
  currentScenePct: number;
  /** Estimated seconds per scene based on history or device baseline */
  estimatedSecPerScene: number;
  /** Estimated remaining seconds for all unfinished scenes (null when nothing remaining) */
  estimatedRemainingSec: number | null;
}

export interface ResolvedTtsStage {
  stepKey: TtsPipelineStepKey;
  label: string;
  isLoadingModel: boolean;
  device: string | null;
  modelLoaded: boolean | null;
}

export const TTS_PIPELINE_STEPS: { key: TtsPipelineStepKey; label: string }[] = [
  { key: 'loading-model', label: '載入模型' },
  { key: 'preparing-voice', label: '聲線準備' },
  { key: 'synthesizing', label: '語音推論' },
  { key: 'encoding', label: '封裝音軌' },
  { key: 'measuring-audio', label: '校正時長' },
];

export function resolveTtsStage(
  liveStatus: TtsLiveStatusResponse | null,
  activeSceneId?: string,
  fallbackProvider?: TtsProvider,
  fallbackDevice?: string | null
): ResolvedTtsStage {
  const jobs = liveStatus?.activeJobs ?? [];
  const job = (activeSceneId ? jobs.find((j) => j.sceneId === activeSceneId) : undefined) ?? jobs[0];
  const engine = liveStatus?.engineStatus ?? null;
  const device = engine?.device || fallbackDevice || null;
  const modelLoaded = typeof engine?.model_loaded === 'boolean' ? engine.model_loaded : null;
  const provider = job?.provider ?? fallbackProvider;

  if (job?.stage === 'measuring-audio') {
    return {
      stepKey: 'measuring-audio',
      label: job.stageLabel || '正在量測語音長度並校正場景時長...',
      isLoadingModel: false,
      device,
      modelLoaded,
    };
  }

  if (job?.stage === 'fallback-edge') {
    return {
      stepKey: 'synthesizing',
      label: job.stageLabel || '正在透過 Edge TTS 快速合成語音...',
      isLoadingModel: false,
      device: 'cloud',
      modelLoaded,
    };
  }

  if (job?.stage === 'fallback-silent') {
    return {
      stepKey: 'encoding',
      label: job.stageLabel || '正在生成離線時序音軌...',
      isLoadingModel: false,
      device,
      modelLoaded,
    };
  }

  if (provider === 'openformosa' && engine?.state && engine.state !== 'idle') {
    if (engine.state === 'loading_model') {
      return {
        stepKey: 'loading-model',
        label: engine.stage_label || `正在載入 BlueMagpie-TTS 模型權重 (${(device || 'cpu').toUpperCase()})...`,
        isLoadingModel: true,
        device,
        modelLoaded: false,
      };
    }
    if (engine.state === 'preparing_voice') {
      return {
        stepKey: 'preparing-voice',
        label: engine.stage_label || '正在準備參考聲線與輸入參數...',
        isLoadingModel: false,
        device,
        modelLoaded,
      };
    }
    if (engine.state === 'generating') {
      return {
        stepKey: 'synthesizing',
        label: engine.stage_label || `正在執行 BlueMagpie 語音推論 (${(device || 'cpu').toUpperCase()})...`,
        isLoadingModel: false,
        device,
        modelLoaded: true,
      };
    }
    if (engine.state === 'encoding') {
      return {
        stepKey: 'encoding',
        label: engine.stage_label || '正在封裝 48kHz WAV 音檔...',
        isLoadingModel: false,
        device,
        modelLoaded: true,
      };
    }
  }

  if (job) {
    return {
      stepKey: job.stage === 'checking-cache' ? 'preparing-voice' : 'synthesizing',
      label: job.stageLabel || '正在合成語音...',
      isLoadingModel: false,
      device,
      modelLoaded,
    };
  }

  if (provider === 'browser-fallback') {
    return {
      stepKey: 'synthesizing',
      label: '正在透過 Edge TTS 合成語音...',
      isLoadingModel: false,
      device: 'cloud',
      modelLoaded,
    };
  }

  if (provider === 'openformosa' && modelLoaded === false) {
    return {
      stepKey: 'loading-model',
      label: `首次推論正在載入 BlueMagpie 模型 (${(device || 'cpu').toUpperCase()})...`,
      isLoadingModel: true,
      device,
      modelLoaded: false,
    };
  }

  return {
    stepKey: 'synthesizing',
    label:
      provider === 'ming-3.0'
        ? '正在透過 Ming-3.0-TTS 合成語音...'
        : '正在連線至 TTS 語音引擎並合成...',
    isLoadingModel: false,
    device,
    modelLoaded,
  };
}

function getBaselineSecPerScene(provider?: TtsProvider, device?: string | null): number {
  if (provider === 'browser-fallback') return 2;
  if (device === 'cuda' || device === 'mps' || device === 'xpu') return 15;
  if (provider === 'openformosa' || provider === 'ming-3.0') return 90;
  return 15;
}

export function computeTtsProgressMetrics(input: TtsProgressInput): TtsProgressMetrics {
  const {
    totalScenes,
    readyScenes,
    generatingCount,
    currentSceneElapsedSec,
    completedDurationsSec,
    provider,
    device,
    engineLastDurationSec,
    isLoadingModel,
  } = input;

  const baseline = getBaselineSecPerScene(provider, device);
  let estimatedSecPerScene = baseline;
  const validDurations = completedDurationsSec.filter((d) => Number.isFinite(d) && d > 0);
  if (validDurations.length > 0) {
    const avg = validDurations.reduce((a, b) => a + b, 0) / validDurations.length;
    estimatedSecPerScene = Math.max(1.5, Math.round(avg));
  } else if (
    typeof engineLastDurationSec === 'number' &&
    Number.isFinite(engineLastDurationSec) &&
    engineLastDurationSec > 0
  ) {
    estimatedSecPerScene = Math.max(1.5, Math.round(engineLastDurationSec));
  }

  if (totalScenes <= 0) {
    return {
      overallPct: 0,
      currentScenePct: 0,
      estimatedSecPerScene,
      estimatedRemainingSec: null,
    };
  }

  const clampedReady = Math.min(totalScenes, Math.max(0, readyScenes));
  const remainingScenes = Math.max(0, totalScenes - clampedReady);

  if (remainingScenes === 0) {
    return {
      overallPct: 100,
      currentScenePct: 100,
      estimatedSecPerScene,
      estimatedRemainingSec: 0,
    };
  }

  // Smooth asymptotic progress for the active scene so the bar visibly advances
  // even when a single scene takes 1-3 minutes on CPU, never stalling at 0%.
  let currentSceneFraction = 0;
  if (generatingCount > 0) {
    const effectiveTarget = isLoadingModel ? Math.max(estimatedSecPerScene, 45) : estimatedSecPerScene;
    const ratio = Math.max(0, currentSceneElapsedSec) / Math.max(1, effectiveTarget);
    // Asymptotic curve: reaches ~63% at 1x target, ~86% at 2x target, capped at 94%
    currentSceneFraction = Math.min(0.94, Math.max(0.05, 1 - Math.exp(-ratio * 1.15)));
  }

  const currentScenePct = Math.round(currentSceneFraction * 100);
  const rawOverall = ((clampedReady + currentSceneFraction) / totalScenes) * 100;
  const overallPct = Math.min(99, Math.max(generatingCount > 0 ? 1 : 0, Math.round(rawOverall)));

  const currentRemaining =
    generatingCount > 0
      ? Math.max(3, Math.round(estimatedSecPerScene - currentSceneElapsedSec))
      : estimatedSecPerScene;
  const queuedAfterCurrent = Math.max(0, remainingScenes - Math.max(1, generatingCount));
  const estimatedRemainingSec = currentRemaining + queuedAfterCurrent * estimatedSecPerScene;

  return {
    overallPct,
    currentScenePct,
    estimatedSecPerScene,
    estimatedRemainingSec,
  };
}
