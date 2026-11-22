import React, { useEffect } from 'react';
import { FileText, Pencil, X } from 'lucide-react';
import { SceneSpec } from '../types/training';

interface ScriptReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectTitle: string;
  scenes: SceneSpec[];
  onEditScene: (sceneIndex: number) => void;
}

const TTS_STATUS_LABELS: Record<SceneSpec['tts']['status'], string> = {
  idle: '尚未配音',
  generating: '配音中',
  ready: '配音就緒',
  error: '配音失敗',
};

export const ScriptReviewModal: React.FC<ScriptReviewModalProps> = ({
  isOpen,
  onClose,
  projectTitle,
  scenes,
  onEditScene,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totalChars = scenes.reduce((sum, s) => sum + s.script.length, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="script-review-title"
    >
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-[#161411] border border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-4 bg-[#1B1814]">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <h2 id="script-review-title" className="text-sm font-bold text-white truncate">
                腳本總覽：{projectTitle}
              </h2>
              <p className="text-[11px] text-slate-400">
                共 {scenes.length} 個場景 • 旁白 {totalChars} 字 • 確認內容後再按「全部配音」生成 TTS
              </p>
            </div>
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

        <div className="flex-1 overflow-y-auto p-5 space-y-3 select-text">
          {scenes.map((scene, idx) => (
            <section key={scene.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="font-bold text-cyan-400">SCENE {String(idx + 1).padStart(2, '0')}</span>
                    <span className="text-slate-400">{scene.durationSeconds}s</span>
                    <span
                      className={
                        scene.tts.status === 'ready'
                          ? 'text-emerald-400'
                          : scene.tts.status === 'error'
                          ? 'text-rose-400'
                          : scene.tts.status === 'generating'
                          ? 'text-amber-300'
                          : 'text-slate-500'
                      }
                    >
                      {TTS_STATUS_LABELS[scene.tts.status]}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mt-1">{scene.title}</h3>
                  {scene.subtitle && <p className="text-xs text-slate-400 mt-0.5">{scene.subtitle}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => onEditScene(idx)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold text-slate-200 flex items-center gap-1.5 transition shrink-0 select-none"
                >
                  <Pencil className="w-3 h-3 text-cyan-400" />
                  編輯此場景
                </button>
              </div>

              {scene.keyPoints.length > 0 && (
                <div className="mb-2.5">
                  <div className="text-[11px] font-semibold text-slate-400 mb-1">畫面要點</div>
                  <ul className="list-disc list-inside space-y-0.5 text-xs text-slate-200">
                    {scene.keyPoints.map((point, pointIdx) => (
                      <li key={pointIdx}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="text-[11px] font-semibold text-slate-400 mb-1">
                  旁白腳本（{scene.script.length} 字）
                </div>
                <p className="text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">{scene.script}</p>
              </div>

              {scene.visualDescription && (
                <div className="mt-2.5">
                  <div className="text-[11px] font-semibold text-slate-400 mb-1">畫面描述</div>
                  <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
                    {scene.visualDescription}
                  </p>
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
