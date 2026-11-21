import React, { useEffect, useRef, useState } from 'react';
import {
  FileUp,
  Sparkles,
  Cpu,
  Wifi,
  Bluetooth,
  Radio,
  X,
  Loader2,
  Clock,
  Wand2,
  Copy,
  Check,
  Mic,
} from 'lucide-react';
import {
  CONTENT_LANGUAGES,
  DOMAIN_META,
  DEFAULT_CONTENT_LANGUAGE,
  ContentLanguage,
  LlmConfig,
  TechDomain,
  TrainingProject,
  TtsProvider,
  VoiceProfile,
} from '../types/training';
import { DomainChoice, isTechDomain } from '../utils/domainInference';
import { DEFAULT_GNAI_CONFIG, loadStoredLlmConfig, saveStoredLlmConfig } from '../utils/llmConfigStorage';
import { loadTtsSettings } from '../utils/ttsSettingsStorage';
import { listVoiceProfiles, toCustomVoice } from '../utils/voiceProfiles';
import { createPresetProject } from '../utils/planGenerator';

interface SourceWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLlmConfig?: LlmConfig;
  onProjectCreated: (project: TrainingProject, notice?: string) => void;
}

const DOMAIN_ICONS: Record<TechDomain, React.ReactNode> = {
  'debug-logic': <Cpu className="w-5 h-5" />,
  wifi: <Wifi className="w-5 h-5" />,
  bluetooth: <Bluetooth className="w-5 h-5" />,
  rf: <Radio className="w-5 h-5" />,
};

const DURATION_PRESETS = [
  { label: '30 秒', seconds: 30 },
  { label: '1 分鐘', seconds: 60 },
  { label: '3 分鐘', seconds: 180 },
  { label: '5 分鐘', seconds: 300 },
  { label: '10 分鐘', seconds: 600 },
];

export const SourceWizardModal: React.FC<SourceWizardModalProps> = ({
  isOpen,
  onClose,
  initialLlmConfig,
  onProjectCreated,
}) => {
  const [domainChoice, setDomainChoice] = useState<DomainChoice>('auto');
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>(() => loadTtsSettings().defaultProvider);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [voiceProfilesLoading, setVoiceProfilesLoading] = useState(false);
  const [selectedVoiceFileName, setSelectedVoiceFileName] = useState<string>(
    () => loadTtsSettings().defaultVoice?.fileName ?? ''
  );
  const [language, setLanguage] = useState<ContentLanguage>(DEFAULT_CONTENT_LANGUAGE);
  const [inputMode, setInputMode] = useState<'topic-llm' | 'upload' | 'preset'>('topic-llm');
  const [topic, setTopic] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<number>(60);
  const [researchText, setResearchText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(() =>
    initialLlmConfig?.apiKey ? initialLlmConfig : loadStoredLlmConfig()
  );
  const [envLlmStatus, setEnvLlmStatus] = useState<{ configured: boolean; baseUrl?: string; model?: string }>({
    configured: false,
  });
  const [useBrowserLlmOverride, setUseBrowserLlmOverride] = useState<boolean>(false);
  const [showLlmConfig, setShowLlmConfig] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [createProgress, setCreateProgress] = useState(0);
  const [createStage, setCreateStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiedError, setCopiedError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const progressTimerRef = useRef<number | null>(null);

  const usingEnvLlm = envLlmStatus.configured && !useBrowserLlmOverride;
  const selectedVoiceProfile = voiceProfiles.find((p) => p.fileName === selectedVoiceFileName);

  const stopProgressTimer = () => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopProgressTimer();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const stored = loadStoredLlmConfig();
    const merged = initialLlmConfig?.apiKey ? initialLlmConfig : stored;
    setLlmConfig(merged);

    const ttsSettings = loadTtsSettings();
    setTtsProvider(ttsSettings.defaultProvider);
    setSelectedVoiceFileName(ttsSettings.defaultVoice?.fileName ?? '');

    let cancelled = false;
    fetch('/api/llm/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((status: { configured?: boolean; baseUrl?: string; model?: string } | null) => {
        if (cancelled) return;
        const envConfigured = Boolean(status?.configured);
        setEnvLlmStatus({
          configured: envConfigured,
          baseUrl: status?.baseUrl,
          model: status?.model,
        });
        // Prefer project .env automatically whenever server .env has GNAI_TOKEN configured.
        setUseBrowserLlmOverride(!envConfigured);
        setShowLlmConfig(!envConfigured && !merged.apiKey);
      })
      .catch(() => {
        if (!cancelled) {
          setEnvLlmStatus({ configured: false });
          setUseBrowserLlmOverride(true);
          if (!merged.apiKey) setShowLlmConfig(true);
        }
      });

    setVoiceProfilesLoading(true);
    listVoiceProfiles()
      .then((profiles) => {
        if (!cancelled) setVoiceProfiles(profiles);
      })
      .catch(() => {
        if (!cancelled) setVoiceProfiles([]);
      })
      .finally(() => {
        if (!cancelled) setVoiceProfilesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, initialLlmConfig]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isProcessing, onClose]);
  const updateLlmConfig = (patch: Partial<LlmConfig>) => {
    setLlmConfig((prev) => {
      const next = { ...prev, ...patch };
      saveStoredLlmConfig(next);
      return next;
    });
  };

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setError(null);
    stopProgressTimer();
    setIsProcessing(true);
    setCreateProgress(5);
    setCreateStage('初始化 Remotion 專案參數...');

    try {
      const requestLlmConfig = usingEnvLlm ? undefined : llmConfig;
      const projectLlmConfig: LlmConfig = usingEnvLlm
        ? {
            baseUrl: envLlmStatus.baseUrl || DEFAULT_GNAI_CONFIG.baseUrl,
            apiKey: '',
            model: envLlmStatus.model || DEFAULT_GNAI_CONFIG.model,
          }
        : llmConfig;
      const selectedCustomVoice = selectedVoiceProfile ? toCustomVoice(selectedVoiceProfile) : undefined;

      if (inputMode === 'preset') {
        if (!isTechDomain(domainChoice)) {
          setError('載入標準範本時請先手動選擇技術領域；AI 自動判斷只適用於主題或文件生成。');
          setIsProcessing(false);
          setCreateProgress(0);
          return;
        }
        const domain = domainChoice;
        setCreateProgress(60);
        setCreateStage('載入 10 分鐘工程培訓標準範本...');
        const proj = createPresetProject(domain);
        if (language !== DEFAULT_CONTENT_LANGUAGE) {
          setCreateStage('正在依所選語言生成範本內容...');
          const localizedResp = await fetch('/api/llm/generate-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topic: proj.title,
              durationSeconds: proj.targetDurationSeconds,
              domain,
              rawText: [
                proj.rawSourceText,
                ...proj.scenes.map(
                  (scene) => `${scene.title}\n${scene.keyPoints.join('、')}\n${scene.script}`
                ),
              ].join('\n\n'),
              defaultTtsProvider: ttsProvider,
              language,
              llmConfig: requestLlmConfig,
            }),
          });
          const localizedData = await localizedResp.json();
          if (!localizedResp.ok) {
            throw new Error(localizedData.error || '無法依所選語言生成範本');
          }
          proj.title = localizedData.title || proj.title;
          proj.subtitle = localizedData.subtitle || proj.subtitle;
          proj.scenes = localizedData.scenes;
        }
        proj.language = language;
        proj.ttsConfig.defaultProvider = ttsProvider === 'ming-3.0' ? 'ming-3.0' : 'openformosa';
        proj.ttsConfig.customVoice = selectedCustomVoice;
        proj.llmConfig = projectLlmConfig;
        proj.scenes = proj.scenes.map((s) => ({
          ...s,
          tts: { ...s.tts, provider: ttsProvider },
        }));
        setCreateProgress(100);
        setCreateStage('專案建立完成！');
        onProjectCreated(proj);
        onClose();
        return;
      }

      let rawTextForLlm = researchText.trim();
      let pptxSlidesForLlm: unknown[] | undefined;
      let resolvedTopic = topic.trim();
      let sourceType: TrainingProject['sourceType'] = 'topic-llm';
      let sourceFileName: string | undefined;

      if (inputMode === 'upload') {
        if (!selectedFile) {
          setError('請先選擇 .pptx 或 .pdf 檔案');
          setIsProcessing(false);
          setCreateProgress(0);
          return;
        }
        setCreateProgress(15);
        setCreateStage(`正在解析檔案「${selectedFile.name}」...`);
        const form = new FormData();
        form.append('file', selectedFile);
        const parseResp = await fetch('/api/parse-document', { method: 'POST', body: form });
        const parseData = await parseResp.json();
        if (!parseResp.ok) throw new Error(parseData.error || '文件解析失敗');

        rawTextForLlm = parseData.rawText || '';
        if (parseData.isPptx && Array.isArray(parseData.slides) && parseData.slides.length > 0) {
          pptxSlidesForLlm = parseData.slides;
        }
        resolvedTopic = resolvedTopic || parseData.title || selectedFile.name;
        sourceType = selectedFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'pptx';
        sourceFileName = selectedFile.name;
        setCreateProgress(30);
      } else {
        if (resolvedTopic.length < 2) {
          setError('請輸入影片主題（例如：PCIe Gen5 訊號完整性與眼圖除錯）');
          setIsProcessing(false);
          setCreateProgress(0);
          return;
        }
        setCreateProgress(18);
      }

      setCreateStage('AI 正在規劃場景與撰寫口語腳本...');
      progressTimerRef.current = window.setInterval(() => {
        setCreateProgress((prev) => {
          if (prev >= 88) return prev;
          const step = prev < 50 ? 4 : prev < 75 ? 2 : 1;
          const next = Math.min(88, prev + step);
          if (next >= 78) {
            setCreateStage('正在進行區域語言技術術語校對與潤飾...');
          } else if (next >= 62) {
            setCreateStage('正在為每 2 句台詞匹配 Remotion 動態特效與圖表...');
          } else if (next >= 44) {
            setCreateStage('正在設計硬體拓撲、波形與時序結構...');
          }
          return next;
        });
      }, 450);

      const targetSec = Math.max(15, Math.min(1800, Number(durationSeconds) || 60));
      const resp = await fetch('/api/llm/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: resolvedTopic,
          durationSeconds: targetSec,
          domain: domainChoice,
          rawText: rawTextForLlm,
          pptxSlides: pptxSlidesForLlm,
          defaultTtsProvider: ttsProvider,
          language,
          llmConfig: requestLlmConfig,
        }),
      });
      const data = await resp.json();
      stopProgressTimer();
      if (!resp.ok) throw new Error(data.error || 'LLM 生成失敗');

      setCreateProgress(94);
      setCreateStage('正在建構 Remotion 專案與儲存草稿...');

      const apiDomain: unknown = data.domain;
      const fallbackDomain: TechDomain = isTechDomain(domainChoice) ? domainChoice : 'debug-logic';
      const resolvedDomain: TechDomain = isTechDomain(apiDomain) ? apiDomain : fallbackDomain;
      const meta = DOMAIN_META[resolvedDomain];
      const domainNote = data.domainReason
        ? `視覺風格：${meta.shortLabel}（${data.domainSource === 'manual' ? '手動指定' : 'AI 判斷'}）`
        : undefined;
      const proj: TrainingProject = {
        id: `proj-${Date.now()}`,
        title: data.title || resolvedTopic,
        subtitle: data.subtitle || meta.description,
        language,
        topic: resolvedTopic,
        domain: resolvedDomain,
        targetDurationSeconds: targetSec,
        fps: 30,
        width: 1920,
        height: 1080,
        sourceType,
        sourceFileName,
        rawSourceText: rawTextForLlm,
        llmConfig: projectLlmConfig,
        ttsConfig: {
          defaultProvider: ttsProvider === 'ming-3.0' ? 'ming-3.0' : 'openformosa',
          openformosa: {
            baseUrl: 'http://127.0.0.1:8001/v1/tts',
            apiKey: '',
            model: 'OpenFormosa/BlueMagpie-TTS',
            voice: 'hung_yi_lee',
          },
          mingTts: {
            baseUrl: 'http://localhost:8000/v1/tts',
            apiKey: '',
            model: 'inclusionAI/Ming-3.0-tts',
            speaker: 'ming-tech-zh-en',
            style: 'professional-training',
          },
          customVoice: selectedCustomVoice,
        },
        scenes: data.scenes,
      };

      setCreateProgress(100);
      setCreateStage('專案建立完成！');
      onProjectCreated(proj, [domainNote, data.note].filter(Boolean).join(' • '));
      onClose();
    } catch (err) {
      stopProgressTimer();
      setCreateProgress(0);
      setCreateStage('');
      setError(err instanceof Error ? err.message : '建立專案失敗');
    } finally {
      stopProgressTimer();
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-wizard-title"
        className="w-full max-w-3xl rounded-2xl border border-slate-700/80 bg-[#151310] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#1A1713]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <h2 id="source-wizard-title" className="text-lg font-bold text-white">AI 自動生成 Remotion 技術影片</h2>
              <p className="text-xs text-slate-400">
                輸入主題與時長 • LLM 自動生成口語台詞（非照唸畫面）與完全匹配的 Remotion 動態圖表與特效
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          {/* Step 1: Creation Mode */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              1. 建立方式
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setInputMode('topic-llm')}
                className={`py-2.5 px-3 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition ${
                  inputMode === 'topic-llm'
                    ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                }`}
              >
                <Wand2 className="w-4 h-4" /> AI 主題 + 時長生成
              </button>
              <button
                type="button"
                onClick={() => setInputMode('upload')}
                className={`py-2.5 px-3 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition ${
                  inputMode === 'upload'
                    ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                }`}
              >
                <FileUp className="w-4 h-4" /> 上傳 PPTX / PDF + AI
              </button>
              <button
                type="button"
                onClick={() => setInputMode('preset')}
                className={`py-2.5 px-3 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition ${
                  inputMode === 'preset'
                    ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4" /> 載入 10 分鐘標準範本
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="content-language"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
            >
              內容與 TTS 語言
            </label>
            <select
              id="content-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as ContentLanguage)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-400"
            >
              {CONTENT_LANGUAGES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: Topic & Duration (for topic-llm & upload) */}
          {inputMode !== 'preset' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  2. 影片主題 (Topic) {inputMode === 'topic-llm' && <span className="text-rose-400">*</span>}
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="例如：PCIe Gen5 訊號完整性除錯、Wi-Fi 7 MLO 架構、RF Desense 排查"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  影片總時長 (秒)
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Clock className="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      min={15}
                      max={1800}
                      value={durationSeconds}
                      onChange={(e) => setDurationSeconds(Math.max(15, Math.min(1800, Number(e.target.value) || 60)))}
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {DURATION_PRESETS.map((p) => (
                    <button
                      key={p.seconds}
                      type="button"
                      onClick={() => setDurationSeconds(p.seconds)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
                        durationSeconds === p.seconds
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                          : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Optional Research Notes or PPTX/PDF Upload */}
          {inputMode === 'topic-llm' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                補充技術筆記 / 大綱（選填）
              </label>
              <textarea
                rows={3}
                value={researchText}
                onChange={(e) => setResearchText(e.target.value)}
                placeholder="可貼上關鍵規格、量測數據或想強調的工程重點；留空將完全由 LLM 依主題規劃..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
          )}

          {inputMode === 'upload' && (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-cyan-400/70 rounded-xl p-6 text-center cursor-pointer bg-slate-900/40 transition"
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pptx,.pdf"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
              <FileUp className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
              {selectedFile ? (
                <div className="text-sm font-semibold text-cyan-300">
                  已選擇：{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </div>
              ) : (
                <>
                  <div className="text-sm font-medium text-slate-200">
                    點擊上傳 PowerPoint (.pptx) 或 PDF (.pdf)
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    匯入 .pptx 將 100% 還原每張投影片原始版面、圖片、表格與文字，並生成完全對應投影片內容的旁白腳本
                  </div>
                </>
              )}
            </div>
          )}

          {inputMode === 'preset' && (
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 text-xs text-slate-300 leading-relaxed">
              將立即載入{' '}
              <span className="text-cyan-300 font-semibold">
                {isTechDomain(domainChoice) ? DOMAIN_META[domainChoice].label : '所選技術領域'}
              </span>{' '}
              的完整 10 分鐘（600 秒）PC 筆電工程培訓範本。AI 自動判斷不適用於標準範本。
            </div>
          )}

          {/* Step 3: Domain */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              3. 技術領域視覺風格
            </label>
            <p className="text-[11px] text-slate-500 mb-2">
              預設由 AI 依主題或文件內容判斷。只有想固定風格時才手動覆寫。
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setDomainChoice('auto')}
                className={`text-left p-3 rounded-xl border transition flex items-start gap-2.5 ${
                  domainChoice === 'auto'
                    ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(201,164,92,0.14)]'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg ${
                    domainChoice === 'auto' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">AI 自動判斷（建議）</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    依主題與補充筆記選擇視覺風格
                  </div>
                </div>
              </button>
              {(Object.keys(DOMAIN_META) as TechDomain[]).map((key) => {
                const m = DOMAIN_META[key];
                const active = domainChoice === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDomainChoice(key)}
                    className={`text-left p-3 rounded-xl border transition flex items-start gap-2.5 ${
                      active
                        ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(201,164,92,0.14)]'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`p-1.5 rounded-lg ${
                        active ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {DOMAIN_ICONS[key]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white">{m.label}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{m.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* GNAI LLM Config (Prefers project .env, optional browser override) */}
          {inputMode !== 'preset' && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <button
                type="button"
                onClick={() => setShowLlmConfig((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white"
              >
                <span>
                  Intel GNAI LLM 設定（支援專案 .env 自動載入或瀏覽器覆寫）
                  {usingEnvLlm ? (
                    <span className="ml-2 text-emerald-400">
                      • 已由本機 .env 載入{envLlmStatus.model ? ` (${envLlmStatus.model})` : ''}
                    </span>
                  ) : llmConfig.apiKey ? (
                    <span className="ml-2 text-emerald-400">• 已設定 Token（瀏覽器覆寫）</span>
                  ) : (
                    <span className="ml-2 text-amber-400">• 尚未填入 GNAI_TOKEN</span>
                  )}
                </span>
                <span className="text-cyan-400">{showLlmConfig ? '收起 ▲' : '展開設定 ▼'}</span>
              </button>
              {showLlmConfig && (
                <div className="mt-3 space-y-3">
                  {envLlmStatus.configured && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setUseBrowserLlmOverride(false)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${
                            usingEnvLlm
                              ? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-200'
                              : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-white'
                          }`}
                        >
                          使用本機 .env（預設）
                        </button>
                        <button
                          type="button"
                          onClick={() => setUseBrowserLlmOverride(true)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${
                            !usingEnvLlm
                              ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200'
                              : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-white'
                          }`}
                        >
                          瀏覽器手動覆寫
                        </button>
                      </div>
                      {llmConfig.apiKey && (
                        <button
                          type="button"
                          onClick={() => updateLlmConfig({ apiKey: '' })}
                          className="text-[11px] text-slate-400 hover:text-rose-300 underline"
                        >
                          清除瀏覽器舊 Token
                        </button>
                      )}
                    </div>
                  )}

                  {usingEnvLlm ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                      <div className="px-2.5 py-1.5 rounded bg-slate-950/70 border border-slate-800">
                        <div className="text-[10px] text-slate-500 mb-0.5">GNAI_URL (.env)</div>
                        <div className="text-slate-300 truncate" title={envLlmStatus.baseUrl}>
                          {envLlmStatus.baseUrl || DEFAULT_GNAI_CONFIG.baseUrl}
                        </div>
                      </div>
                      <div className="px-2.5 py-1.5 rounded bg-slate-950/70 border border-slate-800">
                        <div className="text-[10px] text-slate-500 mb-0.5">GNAI_TOKEN (.env)</div>
                        <div className="text-emerald-400">已由伺服器端 .env 安全載入</div>
                      </div>
                      <div className="px-2.5 py-1.5 rounded bg-slate-950/70 border border-slate-800">
                        <div className="text-[10px] text-slate-500 mb-0.5">GNAI_MODEL (.env)</div>
                        <div className="text-slate-300 font-mono">
                          {envLlmStatus.model || DEFAULT_GNAI_CONFIG.model}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">GNAI_URL</label>
                        <input
                          type="text"
                          value={llmConfig.baseUrl}
                          onChange={(e) => updateLlmConfig({ baseUrl: e.target.value })}
                          placeholder="https://gnai.intel.com/api/providers/openai/v1"
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">GNAI_TOKEN (本機儲存)</label>
                        <input
                          type="password"
                          value={llmConfig.apiKey}
                          onChange={(e) => updateLlmConfig({ apiKey: e.target.value })}
                          placeholder="貼上您的 GNAI Token"
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">GNAI_MODEL</label>
                        <input
                          type="text"
                          value={llmConfig.model}
                          onChange={(e) => updateLlmConfig({ model: e.target.value })}
                          placeholder="gpt-5-mini"
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Default TTS Model & Voice Profile */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              4. 預設 TTS 語音合成引擎與聲線
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTtsProvider('openformosa')}
                className={`p-3 rounded-xl border text-left transition ${
                  ttsProvider === 'openformosa'
                    ? 'border-cyan-400 bg-cyan-500/10'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <div className="text-sm font-bold text-white">OpenFormosa TTS (預設)</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  openformosa.com • 台灣繁中/英文雙語技術名詞最佳化
                </div>
              </button>
              <button
                type="button"
                onClick={() => setTtsProvider('ming-3.0')}
                className={`p-3 rounded-xl border text-left transition ${
                  ttsProvider === 'ming-3.0'
                    ? 'border-cyan-400 bg-cyan-500/10'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <div className="text-sm font-bold text-white">Ming-3.0-TTS (預設)</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  inclusionAI/Ming-3.0-tts • 支援本地推論與多語氣控制
                </div>
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <label
                htmlFor="wizard-voice-profile"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5"
              >
                <Mic className="w-3.5 h-3.5 text-cyan-400" />
                自訂聲線 (Voice Profile)
              </label>
              <select
                id="wizard-voice-profile"
                value={selectedVoiceFileName}
                onChange={(e) => {
                  const fileName = e.target.value;
                  setSelectedVoiceFileName(fileName);
                  const picked = voiceProfiles.find((p) => p.fileName === fileName);
                  if (picked?.provider) {
                    setTtsProvider(picked.provider);
                  }
                }}
                disabled={voiceProfilesLoading}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="">
                  {voiceProfilesLoading ? '載入聲線列表中...' : '不使用自訂聲線（使用引擎預設聲音）'}
                </option>
                {voiceProfiles.map((p) => {
                  const tag = p.provider
                    ? ` (${p.provider === 'ming-3.0' ? 'Ming-3.0' : 'OpenFormosa'}${p.trainingStatus === 'trained' ? ' · 已訓練' : ''})`
                    : '';
                  return (
                    <option key={p.id} value={p.fileName}>
                      {p.name}
                      {tag}
                    </option>
                  );
                })}
              </select>
              <p className="text-[11px] text-slate-500 mt-1.5">
                {selectedVoiceProfile
                  ? `建立後將套用聲線「${selectedVoiceProfile.name}」${selectedVoiceProfile.trainingNote ? `（${selectedVoiceProfile.trainingNote}）` : ''}。`
                  : voiceProfiles.length > 0
                  ? '可選擇已錄製或訓練完成的自訂聲線；選擇後會自動切換至對應的 TTS 引擎。'
                  : '尚未建立自訂聲線，可先至「設定」或進入編輯器錄製 / 上傳聲線。'}
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300 flex items-center justify-between gap-3">
              <span className="break-all select-text">{error}</span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(error);
                    setCopiedError(true);
                    setTimeout(() => setCopiedError(false), 2000);
                  } catch {
                    // ignore
                  }
                }}
                className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 flex items-center gap-1 shrink-0 transition cursor-pointer"
              >
                {copiedError ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" /> 已複製
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> 複製訊息
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Project Creation Progress Bar */}
        {isProcessing && (
          <div className="px-6 py-3 border-t border-slate-800 bg-[#100F0D] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-cyan-300 font-semibold">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                {createStage || '正在建立 Remotion 專案...'}
              </span>
              <span className="font-mono font-bold text-cyan-400 tabular-nums">
                {createProgress}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300 ease-out"
                style={{ width: `${createProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-[#1A1713]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 transition"
          >
            取消
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleGenerate}
            className="px-5 py-2 rounded-lg text-sm font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-2 transition disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> AI 生成腳本與 Remotion 圖表中...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />{' '}
                {inputMode === 'preset' ? '載入 10 分鐘標準範本' : `生成 ${durationSeconds} 秒 Remotion 專案`}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
