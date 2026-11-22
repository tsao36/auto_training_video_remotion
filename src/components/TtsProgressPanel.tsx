import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Loader2,
  Sparkles,
  Square,
  Zap,
} from 'lucide-react';
import { SceneSpec } from '../types/training';
import { formatDuration } from '../utils/planGenerator';
import {
  ResolvedTtsStage,
  TTS_PIPELINE_STEPS,
  TtsProgressMetrics,
} from '../utils/ttsProgress';

interface TtsProgressPanelProps {
  scenes: SceneSpec[];
  readyCount: number;
  activeGeneratingScene?: { scene: SceneSpec; idx: number };
  stage: ResolvedTtsStage;
  metrics: TtsProgressMetrics;
  currentSceneElapsedSec: number;
  batchElapsedSec: number;
  serverAlive: boolean;
  customVoiceName?: string;
  canSwitchToFastTts: boolean;
  onSwitchToFastTts: () => void;
  onStop: () => void;
  onJumpToScene: (idx: number) => void;
}

export const TtsProgressPanel: React.FC<TtsProgressPanelProps> = ({
  scenes,
  readyCount,
  activeGeneratingScene,
  stage,
  metrics,
  currentSceneElapsedSec,
  batchElapsedSec,
  serverAlive,
  customVoiceName,
  canSwitchToFastTts,
  onSwitchToFastTts,
  onStop,
  onJumpToScene,
}) => {
  const [expanded, setExpanded] = useState(true);

  const errorCount = scenes.filter((s) => s.tts.status === 'error').length;
  const activeStepIdx = TTS_PIPELINE_STEPS.findIndex((s) => s.key === stage.stepKey);

  const providerLabel =
    activeGeneratingScene?.scene.tts.provider === 'ming-3.0'
      ? 'Ming-3.0-TTS'
      : activeGeneratingScene?.scene.tts.provider === 'browser-fallback' || stage.device === 'cloud'
      ? 'Edge TTS'
      : 'BlueMagpie-TTS';

  const deviceBadge =
    stage.device === 'cuda'
      ? 'CUDA GPU'
      : stage.device === 'xpu'
      ? 'Intel XPU iGPU'
      : stage.device === 'mps'
      ? 'Apple MPS'
      : stage.device === 'cloud'
      ? '雲端快速'
      : stage.device
      ? stage.device.toUpperCase()
      : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-950/45 border-b border-amber-500/35 text-xs select-none"
    >
      {/* Primary live status row */}
      <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="relative flex items-center justify-center shrink-0">
            <Loader2 className="w-4 h-4 text-amber-300 animate-spin" />
          </div>

          <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-amber-100 font-semibold">
              TTS 語音合成中 ({readyCount}/{scenes.length} 幕完成
              {errorCount > 0 ? ` · ${errorCount} 失敗` : ''})
            </span>

            {/* Live backend heartbeat pill */}
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${
                serverAlive
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
              }`}
              title={
                serverAlive
                  ? 'TTS 後端服務即時回報中，合成正常進行未當機'
                  : '正在等待後端服務回應...'
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  serverAlive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'
                }`}
              />
              {serverAlive ? '引擎運作中' : '連線檢查中'}
            </span>

            {/* Engine + device badge */}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/70 border border-amber-500/25 text-[10px] text-amber-200/90 font-mono">
              <Cpu className="w-2.5 h-2.5 text-amber-300" />
              {providerLabel}
              {deviceBadge ? ` · ${deviceBadge}` : ''}
              {customVoiceName ? ` · ${customVoiceName}` : ''}
            </span>

            {/* Active stage label */}
            <span className="text-amber-200/95 truncate max-w-md" title={stage.label}>
              · {stage.label}
            </span>
          </div>
        </div>

        {/* Right side: timing + smooth progress bar + actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden md:flex items-center gap-2 text-[11px] font-mono tabular-nums text-amber-200/90">
            <span className="inline-flex items-center gap-1" title="目前這一幕已耗時">
              <Clock className="w-3 h-3 text-amber-300" />
              本幕 {formatDuration(currentSceneElapsedSec)}
            </span>
            {batchElapsedSec > currentSceneElapsedSec && (
              <span className="text-amber-300/75" title="本批次總耗時">
                · 總計 {formatDuration(batchElapsedSec)}
              </span>
            )}
            {metrics.estimatedRemainingSec !== null && metrics.estimatedRemainingSec > 0 && (
              <span
                className="text-amber-100/90"
                title={`依每幕約 ${metrics.estimatedSecPerScene} 秒估算`}
              >
                · 預估剩餘 ~{formatDuration(metrics.estimatedRemainingSec)}
              </span>
            )}
          </div>

          {canSwitchToFastTts && (
            <button
              type="button"
              onClick={onSwitchToFastTts}
              title="將尚未完成配音的場景改用快速神經網路語音 (Edge TTS)，每幕約 1–2 秒完成"
              className="px-2.5 py-1 rounded-md bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/50 text-[11px] font-semibold text-amber-100 flex items-center gap-1 transition cursor-pointer"
            >
              <Zap className="w-3 h-3 text-amber-300" />
              改用快速語音
            </button>
          )}

          <button
            type="button"
            onClick={onStop}
            title="停止 TTS 配音；已完成的場景語音會保留"
            className="px-2.5 py-1 rounded-md bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 text-[11px] font-semibold text-rose-100 flex items-center gap-1 transition cursor-pointer"
          >
            <Square className="w-3 h-3 text-rose-300" />
            停止配音
          </button>

          <div
            role="progressbar"
            aria-label="TTS 語音生成總進度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={metrics.overallPct}
            className="w-28 sm:w-40 h-2 bg-slate-900/90 rounded-full overflow-hidden border border-amber-500/30"
          >
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-yellow-300 transition-all duration-500"
              style={{ width: `${Math.max(metrics.overallPct, 4)}%` }}
            />
          </div>
          <span className="font-mono text-[11px] font-semibold text-amber-200 tabular-nums w-9 text-right">
            {metrics.overallPct}%
          </span>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="px-2 py-1 rounded bg-slate-900/60 hover:bg-slate-900 border border-amber-500/30 text-[11px] text-amber-200 flex items-center gap-1 transition cursor-pointer"
          >
            {expanded ? (
              <>
                收合明細 <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                展開明細 <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Detailed pipeline + per-scene queue drawer */}
      {expanded && (
        <div className="px-4 pb-2.5 pt-1.5 border-t border-amber-500/20 bg-slate-950/35 space-y-2">
          {/* Active scene info + 5-step pipeline indicator */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2 min-w-0 text-amber-100/90">
              <Activity className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              {activeGeneratingScene ? (
                <span className="truncate">
                  目前場景：
                  <strong className="text-white">
                    S{activeGeneratingScene.idx + 1} {activeGeneratingScene.scene.title}
                  </strong>{' '}
                  <span className="text-amber-200/75">
                    ({activeGeneratingScene.scene.script.length} 字 · 本幕估算進度{' '}
                    {metrics.currentScenePct}%)
                  </span>
                </span>
              ) : (
                <span>正在排程下一個待配音場景...</span>
              )}
            </div>

            {/* Pipeline step breadcrumbs */}
            <div className="flex items-center gap-1 flex-wrap">
              {TTS_PIPELINE_STEPS.map((step, i) => {
                const isDone = activeStepIdx > i;
                const isCurrent = activeStepIdx === i;
                return (
                  <React.Fragment key={step.key}>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition ${
                        isCurrent
                          ? 'bg-amber-400/25 border border-amber-400/60 text-amber-100 font-semibold'
                          : isDone
                          ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                          : 'bg-slate-900/60 border border-slate-800 text-slate-500'
                      }`}
                    >
                      {isDone ? '✓ ' : isCurrent ? '● ' : ''}
                      {step.label}
                    </span>
                    {i < TTS_PIPELINE_STEPS.length - 1 && (
                      <span className="text-slate-600 text-[10px]">›</span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Per-scene queue chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {scenes.map((sc, idx) => {
              const isReady = sc.tts.status === 'ready' && Boolean(sc.tts.audioUrl);
              const isGen = sc.tts.status === 'generating';
              const isErr = sc.tts.status === 'error';
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => onJumpToScene(idx)}
                  title={`S${idx + 1} ${sc.title} (${sc.script.length} 字) — ${
                    isReady
                      ? `完成 (${sc.tts.actualDurationSec?.toFixed(1) ?? sc.durationSeconds}s)`
                      : isGen
                      ? `合成中 · 已耗時 ${formatDuration(currentSceneElapsedSec)}`
                      : isErr
                      ? `失敗：${sc.tts.error || '未知錯誤'}`
                      : '排隊等待合成'
                  }`}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-medium transition cursor-pointer ${
                    isGen
                      ? 'bg-amber-400/20 border-amber-400/70 text-amber-100 shadow-sm shadow-amber-500/20'
                      : isReady
                      ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/20'
                      : isErr
                      ? 'bg-rose-500/15 border-rose-500/45 text-rose-200 hover:bg-rose-500/25'
                      : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {isGen ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-300" />
                  ) : isReady ? (
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                  ) : isErr ? (
                    <AlertCircle className="w-2.5 h-2.5 text-rose-400" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  )}
                  <span className="font-mono font-semibold">S{idx + 1}</span>
                  <span className="max-w-[90px] truncate">{sc.title}</span>
                  <span className="font-mono text-[9px] opacity-80">
                    {isGen
                      ? formatDuration(currentSceneElapsedSec)
                      : isReady
                      ? `${(sc.tts.actualDurationSec ?? sc.durationSeconds).toFixed(0)}s`
                      : isErr
                      ? '失敗'
                      : '排隊'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Helpful hint when running on local CPU so user knows it's normal */}
          {stage.device === 'cpu' &&
            activeGeneratingScene?.scene.tts.provider === 'openformosa' && (
              <div className="flex items-center gap-1.5 text-[10px] text-amber-200/75">
                <Sparkles className="w-3 h-3 text-amber-300 shrink-0" />
                <span>
                  {stage.isLoadingModel
                    ? '首次啟動正在載入 BlueMagpie-TTS 約 8GB 模型權重（約 30–60 秒），載入完成後將自動開始語音推論。'
                    : '本地 CPU 模式每幕約需 1–3 分鐘（已正常進行推論，非當機）；若想立即預覽可點右上「改用快速語音」。'}
                </span>
              </div>
            )}
        </div>
      )}
    </div>
  );
};
