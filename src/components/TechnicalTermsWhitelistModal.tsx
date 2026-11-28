import React, { useEffect, useMemo, useState } from 'react';
import { Check, Plus, RefreshCw, Search, ShieldCheck, Tag, X } from 'lucide-react';
import type { TrainingProject } from '../types/training';
import {
  generateTechnicalTermCandidates,
  normalizeTechnicalTerm,
} from '../utils/captions';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface TechnicalTermsWhitelistModalProps {
  isOpen: boolean;
  project: TrainingProject;
  renderLabel?: string;
  onClose: () => void;
  onApprove: (terms: string[], generatedAt: string) => void;
}

export const TechnicalTermsWhitelistModal: React.FC<TechnicalTermsWhitelistModalProps> = ({
  isOpen,
  project,
  renderLabel,
  onClose,
  onApprove,
}) => {
  const generatedCandidates = useMemo(
    () => generateTechnicalTermCandidates(project.scenes),
    [project.scenes]
  );
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
  const [generatedAt, setGeneratedAt] = useState('');
  const [query, setQuery] = useState('');
  const [customTerm, setCustomTerm] = useState('');
  const dialogRef = useDialogFocus(isOpen, onClose);

  const regenerate = () => {
    setSelectedTerms(generatedCandidates.map((candidate) => candidate.term));
    setGeneratedAt(new Date().toISOString());
  };

  useEffect(() => {
    if (!isOpen) return;
    setSelectedTerms(
      project.technicalTermsWhitelist?.terms.length
        ? project.technicalTermsWhitelist.terms
        : generatedCandidates.map((candidate) => candidate.term)
    );
    setGeneratedAt(project.technicalTermsWhitelist?.generatedAt || new Date().toISOString());
    setQuery('');
    setCustomTerm('');
  }, [isOpen, generatedCandidates, project.technicalTermsWhitelist]);

  if (!isOpen) return null;

  const savedOnlyTerms = selectedTerms.filter((term) =>
    !generatedCandidates.some((candidate) => normalizeTechnicalTerm(candidate.term) === normalizeTechnicalTerm(term))
  );
  const rows = [
    ...generatedCandidates,
    ...savedOnlyTerms.map((term) => ({ term, occurrences: 0, sceneIndexes: [] })),
  ].filter((candidate) => candidate.term.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selectedSet = new Set(selectedTerms.map(normalizeTechnicalTerm));

  const toggleTerm = (term: string) => {
    const normalized = normalizeTechnicalTerm(term);
    setSelectedTerms((current) => current.some((item) => normalizeTechnicalTerm(item) === normalized)
      ? current.filter((item) => normalizeTechnicalTerm(item) !== normalized)
      : [...current, term]);
  };

  const addCustomTerm = () => {
    const term = customTerm.trim();
    if (!term) return;
    if (!selectedTerms.some((item) => normalizeTechnicalTerm(item) === normalizeTechnicalTerm(term))) {
      setSelectedTerms((current) => [...current, term]);
    }
    setCustomTerm('');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="technical-terms-title">
      <div ref={dialogRef} tabIndex={-1} className="w-full max-w-5xl max-h-[88vh] flex flex-col rounded-lg bg-[#161411] border border-slate-700 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4 bg-[#1B1814]">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
              <h2 id="technical-terms-title" className="text-base font-bold text-white">技術術語白名單</h2>
              <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-[11px] font-semibold text-cyan-200">
                {selectedTerms.length} 已核准
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              只顯示清單中核准的術語。可刪除誤判、加入自訂術語，確認後才開始{renderLabel || '影片輸出'}。
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="關閉技術術語白名單" className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-800 grid grid-cols-[1fr_auto] gap-3">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋候選術語"
              className="w-full pl-9 pr-3 py-2 rounded bg-slate-950 border border-slate-700 text-sm text-white outline-none focus:border-cyan-500"
            />
          </label>
          <button type="button" onClick={regenerate} className="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5" />
            重新產生候選
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {rows.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {rows.map((candidate) => {
                const checked = selectedSet.has(normalizeTechnicalTerm(candidate.term));
                return (
                  <button
                    key={normalizeTechnicalTerm(candidate.term)}
                    type="button"
                    onClick={() => toggleTerm(candidate.term)}
                    className={`p-3 rounded border text-left flex items-start gap-3 transition ${checked ? 'bg-cyan-500/10 border-cyan-500/45' : 'bg-slate-950/60 border-slate-800 hover:border-slate-600'}`}
                  >
                    <span className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'border-slate-600 text-transparent'}`}>
                      <Check className="w-3.5 h-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-white break-words">{candidate.term}</span>
                      <span className="block mt-1 text-[11px] text-slate-400">
                        {candidate.occurrences > 0
                          ? `${candidate.occurrences} 次候選 • 場景 ${candidate.sceneIndexes.map((index) => index + 1).join(', ')}`
                          : '自訂術語'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-slate-500">沒有符合搜尋的技術術語。</div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 bg-[#12100e]">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              value={customTerm}
              onChange={(event) => setCustomTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addCustomTerm();
              }}
              placeholder="加入未被自動偵測的自訂術語"
              className="flex-1 px-3 py-2 rounded bg-slate-950 border border-slate-700 text-sm text-white outline-none focus:border-cyan-500"
            />
            <button type="button" onClick={addCustomTerm} disabled={!customTerm.trim()} className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" />
              加入
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4">
            <p className="text-[11px] text-slate-500">候選自腳本、字幕、標題與原始 PowerPoint 內容產生。白名單隨專案儲存。</p>
            <button
              type="button"
              onClick={() => onApprove(selectedTerms, generatedAt || new Date().toISOString())}
              className="px-4 py-2.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-bold flex items-center gap-2 whitespace-nowrap"
            >
              <Check className="w-4 h-4" />
              核准白名單{renderLabel ? `並開始${renderLabel}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
