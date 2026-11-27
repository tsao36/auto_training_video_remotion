import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { QualityReport, ScenePreviewStill } from '../types/training';

export interface PreviewStillsState {
  active: boolean;
  status: string;
  progress: number;
  totalScenes: number;
  completedScenes: number;
  stills: ScenePreviewStill[];
  error?: string;
}

interface QualityPreviewModalProps {
  isOpen: boolean;
  initialTab: 'quality' | 'stills';
  onClose: () => void;
  qualityReport: QualityReport;
  stillsState: PreviewStillsState;
  onGenerateStills: () => void;
  onJumpToScene: (sceneIndex: number) => void;
  renderReviewActive?: boolean;
  onContinueRender?: () => void;
}

export const QualityPreviewModal: React.FC<QualityPreviewModalProps> = ({
  isOpen,
  initialTab,
  onClose,
  qualityReport,
  stillsState,
  onGenerateStills,
  onJumpToScene,
  renderReviewActive = false,
  onContinueRender,
}) => {
  const [activeTab, setActiveTab] = React.useState<'quality' | 'stills'>(initialTab);
  const [warningsAcknowledged, setWarningsAcknowledged] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setWarningsAcknowledged(false);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="品質檢查與場景預覽"
    >
      <div className="w-full max-w-5xl max-h-[88vh] flex flex-col rounded-2xl bg-[#161411] border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-4 bg-[#1B1814]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('quality')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'quality'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              品質檢查 ({qualityReport.errorCount} 錯誤 / {qualityReport.warningCount} 警告)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stills')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'stills'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              逐場景靜態預覽 ({stillsState.stills.length})
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉視窗"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'quality' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
                <div className="flex items-center gap-2.5">
                  {qualityReport.errorCount > 0 ? (
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  ) : qualityReport.warningCount > 0 ? (
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  )}
                  <div>
                    <div className="text-sm font-bold text-white">
                      {qualityReport.errorCount > 0
                        ? `發現 ${qualityReport.errorCount} 項阻塞錯誤，建議修正後再輸出`
                        : qualityReport.warningCount > 0
                        ? `無阻塞錯誤，但有 ${qualityReport.warningCount} 項排版／音訊建議`
                        : '全部品質檢查項目皆已通過！'}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      自動檢查標題長度、內部標籤洩漏、視覺模板多樣性、要點密度與旁白音軌狀態
                    </div>
                  </div>
                </div>
              </div>

              {qualityReport.issues.length === 0 ? (
                <div className="py-12 text-center text-sm text-emerald-300/90">
                  目前專案符合所有視覺與音訊規範。
                </div>
              ) : (
                <div className="space-y-2">
                  {qualityReport.issues.map((issue, idx) => {
                    const tone =
                      issue.level === 'error'
                        ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
                        : issue.level === 'warning'
                        ? 'border-amber-500/35 bg-amber-950/20 text-amber-200'
                        : 'border-sky-500/35 bg-sky-950/20 text-sky-200';
                    const Icon =
                      issue.level === 'error'
                        ? AlertCircle
                        : issue.level === 'warning'
                        ? AlertTriangle
                        : Info;
                    return (
                      <div
                        key={`${issue.code}-${issue.sceneId || idx}`}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${tone}`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <div className="text-xs font-mono opacity-80">[{issue.code}]</div>
                            <div className="text-sm leading-snug">{issue.message}</div>
                          </div>
                        </div>
                        {typeof issue.sceneIndex === 'number' && (
                          <button
                            type="button"
                            onClick={() => {
                              onJumpToScene(issue.sceneIndex!);
                              onClose();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-white shrink-0 transition"
                          >
                            跳至第 {issue.sceneIndex + 1} 幕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
                <div>
                  <div className="text-sm font-bold text-white">逐場景中點截圖檢查（Remotion Still）</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    正式輸出整支 MP4 前，先為每一幕算圖一張中點 PNG，快速確認是否有字體溢位或排版裁切。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onGenerateStills}
                  disabled={stillsState.active}
                  className="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 shrink-0"
                >
                  {stillsState.active ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      算圖中 ({stillsState.completedScenes}/{stillsState.totalScenes})
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      {stillsState.stills.length > 0 ? '重新產生預覽圖' : '產生全部場景預覽圖'}
                    </>
                  )}
                </button>
              </div>

              {stillsState.active && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>
                      {stillsState.status === 'bundling'
                        ? '正在打包 Remotion 專案...'
                        : `正在算圖場景預覽 (${stillsState.completedScenes}/${stillsState.totalScenes})`}
                    </span>
                    <span className="tabular-nums">{stillsState.progress}%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 transition-all duration-300"
                      style={{ width: `${stillsState.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {stillsState.error && (
                <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-950/30 text-xs text-rose-200">
                  {stillsState.error}
                </div>
              )}

              {stillsState.stills.length === 0 && !stillsState.active ? (
                <div className="py-16 text-center text-sm text-slate-400">
                  點擊右上角「產生全部場景預覽圖」以產出每一幕的靜態截圖。
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stillsState.stills.map((still) => (
                    <button
                      key={still.sceneId}
                      type="button"
                      onClick={() => {
                        onJumpToScene(still.sceneIndex);
                        onClose();
                      }}
                      className="group text-left rounded-xl overflow-hidden bg-slate-900 border border-slate-800 hover:border-cyan-500/60 transition"
                    >
                      <div className="aspect-video bg-black relative overflow-hidden">
                        <img
                          src={still.imageUrl}
                          alt={`Scene ${still.sceneIndex + 1}: ${still.title}`}
                          className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform"
                        />
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 text-[11px] font-bold text-cyan-300">
                          #{still.sceneIndex + 1} • F{still.frame}
                        </span>
                      </div>
                      <div className="p-2.5">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {still.title}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">點擊跳至此幕編輯</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {renderReviewActive && (
          <div className="border-t border-slate-800 bg-[#191612] px-5 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-white">MP4 輸出前品質確認</div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  阻塞錯誤必須修正；警告需要創作者明確確認後才可繼續。
                </div>
              </div>
              <div className="flex items-center gap-3">
                {qualityReport.warningCount > 0 && (
                  <label className="flex items-center gap-2 text-xs text-amber-200">
                    <input
                      type="checkbox"
                      checked={warningsAcknowledged}
                      onChange={(event) => setWarningsAcknowledged(event.target.checked)}
                      className="accent-amber-400"
                    />
                    我已檢視並接受警告
                  </label>
                )}
                <button
                  type="button"
                  onClick={onContinueRender}
                  disabled={!onContinueRender || (qualityReport.warningCount > 0 && !warningsAcknowledged)}
                  className="rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {qualityReport.errorCount > 0 ? '請先修正錯誤' : '繼續輸出'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
