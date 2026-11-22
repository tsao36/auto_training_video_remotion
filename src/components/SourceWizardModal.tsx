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
  { label: '20 分鐘', seconds: 1200 },
  { label: '30 分鐘', seconds: 1800 },
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
  const [createTtsOnFirstRun, setCreateTtsOnFirstRun] = useState(false);
  const [language, setLanguage] = useState<ContentLanguage>(DEFAULT_CONTENT_LANGUAGE);
  const [inputMode, setInputMode] = useState<'topic-llm' | 'upload'>('topic-llm');
  const [topic, setTopic] = useState('');
  const [odmMode, setOdmMode] = useState(false);
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
  const [pipelineStage, setPipelineStage] = useState<0 | 1 | 2 | 3>(0);
  const [preparedSource, setPreparedSource] = useState({
    topic: '',
    rawText: '',
    sourceType: 'topic-llm' as TrainingProject['sourceType'],
    sourceFileName: '' as string | undefined,
    pptxSlides: undefined as unknown[] | undefined,
  });
  const [planDraft, setPlanDraft] = useState<{
    title: string;
    subtitle: string;
    domain: TechDomain;
    domainReason?: string;
    domainSource?: string;
    note?: string;
    scenes: any[];
  } | null>(null);
  const [jsonDraft, setJsonDraft] = useState('');
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
    setPipelineStage(0);
    setPlanDraft(null);
    setJsonDraft('');
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
      let rawTextForLlm = pipelineStage >= 1 ? preparedSource.rawText : researchText.trim();
      let resolvedTopic = pipelineStage >= 1 ? preparedSource.topic : topic.trim();
      let sourceType: TrainingProject['sourceType'] = pipelineStage >= 1 ? preparedSource.sourceType : 'topic-llm';
      let sourceFileName: string | undefined = pipelineStage >= 1 ? preparedSource.sourceFileName : undefined;
      let pptxSlidesForLlm: unknown[] | undefined = pipelineStage >= 1 ? preparedSource.pptxSlides : undefined;

      if (inputMode === 'upload' && pipelineStage === 0) {
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
          odmMode,
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

      setCreateProgress(100);
      setCreateStage('AI 大綱草稿已生成，等待逐階段審閱...');

      const apiDomain: unknown = data.domain;
      const fallbackDomain: TechDomain = isTechDomain(domainChoice) ? domainChoice : 'debug-logic';
      const resolvedDomain: TechDomain = isTechDomain(apiDomain) ? apiDomain : fallbackDomain;

      setPreparedSource({
        topic: resolvedTopic,
        rawText: rawTextForLlm,
        sourceType,
        sourceFileName,
        pptxSlides: pptxSlidesForLlm,
      });
      const nextDraft = {
        title: data.title || resolvedTopic,
        subtitle: data.subtitle || DOMAIN_META[resolvedDomain].description,
        domain: resolvedDomain,
        domainReason: data.domainReason,
        domainSource: data.domainSource,
        note: data.note,
        scenes: Array.isArray(data.scenes) ? data.scenes : [],
      };
      setPlanDraft(nextDraft);
      setJsonDraft(JSON.stringify(nextDraft, null, 2));
      setPipelineStage(pipelineStage === 1 ? 2 : 1);
      setCreateProgress(100);
      setCreateStage('');
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

  const handleFinalizeProject = () => {
    if (!planDraft) return;
    let finalPlan = planDraft;
    if (jsonDraft.trim()) {
      try {
        const parsed = JSON.parse(jsonDraft);
        if (!Array.isArray(parsed.scenes)) throw new Error('JSON 缺少 scenes 陣列');
        finalPlan = {
          ...parsed,
          domain: isTechDomain(parsed.domain) ? parsed.domain : planDraft.domain,
          scenes: parsed.scenes,
        };
      } catch (err) {
        setError(err instanceof Error ? `Remotion JSON 格式錯誤：${err.message}` : 'Remotion JSON 格式錯誤');
        return;
      }
    }

    const projectLlmConfig: LlmConfig = usingEnvLlm
      ? {
          baseUrl: envLlmStatus.baseUrl || DEFAULT_GNAI_CONFIG.baseUrl,
          apiKey: '',
          model: envLlmStatus.model || DEFAULT_GNAI_CONFIG.model,
        }
      : llmConfig;
    const selectedCustomVoice = selectedVoiceProfile ? toCustomVoice(selectedVoiceProfile) : undefined;
    const meta = DOMAIN_META[finalPlan.domain];
    const domainNote = finalPlan.domainReason
      ? `視覺風格：${meta.shortLabel}（${finalPlan.domainSource === 'manual' ? '手動指定' : 'AI 判斷'}）`
      : undefined;
    const proj: TrainingProject = {
      id: `proj-${Date.now()}`,
      title: finalPlan.title || preparedSource.topic,
      subtitle: finalPlan.subtitle || meta.description,
      language,
      topic: preparedSource.topic,
      odmMode,
      domain: finalPlan.domain,
      targetDurationSeconds: Math.max(15, Math.min(1800, durationSeconds)),
      fps: 30,
      width: 1920,
      height: 1080,
      sourceType: preparedSource.sourceType,
      sourceFileName: preparedSource.sourceFileName,
      rawSourceText: preparedSource.rawText,
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
      ttsDeferred: !createTtsOnFirstRun,
      colorScheme: {
        preset: 'domain',
        primary: meta.accentColor,
        secondary: meta.secondaryColor,
        surface: '#12100E',
      },
      aiGenerationStages: {
        input: {
          topic: preparedSource.topic,
          rawText: preparedSource.rawText,
          sourceType: preparedSource.sourceType,
          sourceFileName: preparedSource.sourceFileName,
        },
        source: {
          topic: preparedSource.topic,
          rawText: preparedSource.rawText,
          pptxSlideCount: preparedSource.pptxSlides?.length,
        },
        outline: {
          title: finalPlan.title || preparedSource.topic,
          subtitle: finalPlan.subtitle || meta.description,
          domain: finalPlan.domain,
          scenes: finalPlan.scenes,
        },
        remotionJson: {
          json: jsonDraft.trim() || JSON.stringify(finalPlan, null, 2),
        },
      },
      scenes: finalPlan.scenes,
    };
    const ttsNote = createTtsOnFirstRun
      ? undefined
      : '尚未生成 TTS 配音：請先按「檢視腳本」審閱內容，確認後再按「全部配音」';

    onProjectCreated(proj, [domainNote, finalPlan.note, ttsNote].filter(Boolean).join(' • '));
    onClose();
  };

  const updateDraftScene = (idx: number, patch: Record<string, unknown>) => {
    setPlanDraft((prev) => {
      if (!prev) return prev;
      const scenes = prev.scenes.map((scene, sceneIdx) =>
        sceneIdx === idx ? { ...scene, ...patch } : scene
      );
      const next = { ...prev, scenes };
      setJsonDraft(JSON.stringify(next, null, 2));
      return next;
    });
  };

  const PIPELINE_STAGES = [
    { label: '輸入內容', description: '主題與條件' },
    { label: '來源整理', description: '解析後文字' },
    { label: 'AI 場景大綱', description: '標題與腳本' },
    { label: 'Remotion JSON', description: '最終草稿' },
  ] as const;

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
          <div className="grid grid-cols-4 gap-2">
            {PIPELINE_STAGES.map((stage, idx) => {
              const active = pipelineStage === idx;
              const complete = pipelineStage > idx;
              return (
                <button
                  key={stage.label}
                  type="button"
                  onClick={() => {
                    if (idx === 0 || (idx === 1 && preparedSource.topic) || (idx >= 2 && planDraft)) {
                      setPipelineStage(idx as 0 | 1 | 2 | 3);
                    }
                  }}
                  disabled={idx === 1 && !preparedSource.topic || idx >= 2 && !planDraft}
                  className={`text-left px-3 py-2 rounded-lg border transition ${
                    active
                      ? 'border-cyan-400 bg-cyan-500/10'
                      : complete
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-slate-800 bg-slate-900/50'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <div className={`text-[11px] font-bold ${active ? 'text-cyan-300' : complete ? 'text-emerald-300' : 'text-slate-400'}`}>
                    {idx + 1}. {stage.label}
                  </div>
                  <div className="text-[10px] mt-0.5 text-slate-500">{stage.description}</div>
                </button>
              );
            })}
          </div>

          {pipelineStage === 0 ? (
            <div className="space-y-5">
          {/* Step 1: Creation Mode */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              1. 建立方式
            </label>
            <div className="grid grid-cols-2 gap-2">
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
          {(
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
                <button
                  type="button"
                  role="switch"
                  aria-checked={odmMode}
                  onClick={() => setOdmMode((enabled) => !enabled)}
                  className={`mb-2 w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-left transition ${
                    odmMode
                      ? 'border-amber-400 bg-amber-400/10 text-amber-100'
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <span>
                    <span className="block text-xs font-bold">ODM 模式</span>
                    <span className="block text-[10px] mt-0.5 text-slate-400">用比喻與生活例子講給新手工程師</span>
                  </span>
                  <span className={`relative w-9 h-5 shrink-0 rounded-full transition ${odmMode ? 'bg-amber-400' : 'bg-slate-700'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition ${odmMode ? 'left-[18px]' : 'left-0.5'}`} />
                  </span>
                </button>
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
          {(
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

            <button
              type="button"
              role="switch"
              aria-checked={createTtsOnFirstRun}
              onClick={() => setCreateTtsOnFirstRun((enabled) => !enabled)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left transition ${
                createTtsOnFirstRun
                  ? 'border-cyan-400 bg-cyan-500/10 text-cyan-100'
                  : 'border-slate-800 bg-slate-900/50 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span>
                <span className="block text-xs font-bold">建立後立即生成 TTS 配音</span>
                <span className="block text-[11px] mt-0.5 text-slate-400">
                  {createTtsOnFirstRun
                    ? '專案建立後會自動開始合成所有場景的語音。'
                    : '預設關閉：先只生成腳本，審閱內容後再於編輯器按「全部配音」。'}
                </span>
              </span>
              <span
                className={`relative w-9 h-5 shrink-0 rounded-full transition ${
                  createTtsOnFirstRun ? 'bg-cyan-400' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition ${
                    createTtsOnFirstRun ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </span>
            </button>
          </div>

            </div>
          ) : (
            <div className="space-y-4">
              {pipelineStage === 1 && (
                <section className="space-y-4">
                  <div>
                    <div className="text-sm font-bold text-white">來源整理結果</div>
                    <p className="text-xs text-slate-400 mt-1">可直接修正這階段的文字；確認後會送入 AI 場景規劃。</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">影片主題</label>
                    <input
                      value={preparedSource.topic}
                      onChange={(e) => setPreparedSource((prev) => ({ ...prev, topic: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">送給 AI 的來源文字 / 筆記</label>
                    <textarea
                      rows={12}
                      value={preparedSource.rawText}
                      onChange={(e) => setPreparedSource((prev) => ({ ...prev, rawText: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white font-mono leading-relaxed"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleGenerate()}
                    className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#050607] text-sm font-bold"
                  >
                    確認來源，檢視 AI 場景大綱
                  </button>
                </section>
              )}

              {pipelineStage === 2 && planDraft && (
                <section className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">專案標題</label>
                      <input
                        value={planDraft.title}
                        onChange={(e) => {
                          const next = { ...planDraft, title: e.target.value };
                          setPlanDraft(next);
                          setJsonDraft(JSON.stringify(next, null, 2));
                        }}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">副標題</label>
                      <input
                        value={planDraft.subtitle}
                        onChange={(e) => {
                          const next = { ...planDraft, subtitle: e.target.value };
                          setPlanDraft(next);
                          setJsonDraft(JSON.stringify(next, null, 2));
                        }}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">視覺領域</label>
                    <select
                      value={planDraft.domain}
                      onChange={(e) => {
                        const next = { ...planDraft, domain: e.target.value as TechDomain };
                        setPlanDraft(next);
                        setJsonDraft(JSON.stringify(next, null, 2));
                      }}
                      className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                    >
                      {(Object.keys(DOMAIN_META) as TechDomain[]).map((domain) => (
                        <option key={domain} value={domain}>{DOMAIN_META[domain].label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    {planDraft.scenes.map((scene, idx) => (
                      <section key={scene.id || idx} className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-cyan-300">SCENE {idx + 1}</span>
                          <span className="text-[10px] text-slate-500">可編輯標題、秒數與旁白</span>
                        </div>
                        <input
                          value={scene.title || ''}
                          onChange={(e) => updateDraftScene(idx, { title: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                        />
                        <div className="grid grid-cols-[90px_1fr] gap-2">
                          <input
                            type="number"
                            min={3}
                            max={180}
                            value={scene.durationSeconds || 6}
                            onChange={(e) => updateDraftScene(idx, { durationSeconds: Number(e.target.value) || 6 })}
                            className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                          />
                          <input
                            value={scene.visualDescription || ''}
                            onChange={(e) => updateDraftScene(idx, { visualDescription: e.target.value })}
                            placeholder="畫面描述"
                            className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                          />
                        </div>
                        <textarea
                          rows={3}
                          value={scene.script || ''}
                          onChange={(e) => updateDraftScene(idx, { script: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white leading-relaxed"
                        />
                      </section>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setJsonDraft(JSON.stringify(planDraft, null, 2));
                      setPipelineStage(3);
                    }}
                    className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#050607] text-sm font-bold"
                  >
                    確認場景大綱，檢視最終 JSON
                  </button>
                </section>
              )}

              {pipelineStage === 3 && planDraft && (
                <section className="space-y-3">
                  <div>
                    <div className="text-sm font-bold text-white">最終 Remotion JSON 草稿</div>
                    <p className="text-xs text-slate-400 mt-1">可直接修正模板、特效、字幕、時間與每幕旁白；建立專案前會再次驗證 JSON 格式。</p>
                  </div>
                  <textarea
                    value={jsonDraft}
                    onChange={(e) => setJsonDraft(e.target.value)}
                    rows={20}
                    spellCheck={false}
                    className="w-full px-3.5 py-3 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 font-mono leading-relaxed resize-y"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleFinalizeProject}
                      className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#050607] text-sm font-bold"
                    >
                      建立已審閱的 Remotion 專案
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}

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
          {pipelineStage > 0 && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setPipelineStage((pipelineStage - 1) as 0 | 1 | 2)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 text-slate-300 hover:bg-slate-800 transition"
            >
              上一步
            </button>
          )}
          {pipelineStage === 0 ? (
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleGenerate}
              className="px-5 py-2 rounded-lg text-sm font-bold bg-cyan-500 hover:bg-cyan-400 text-[#050607] flex items-center gap-2 transition disabled:opacity-50"
            >
              {isProcessing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> AI 生成來源與大綱中...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> 生成並進入來源審閱</>
              )}
            </button>
          ) : pipelineStage === 1 ? (
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => void handleGenerate()}
              className="px-5 py-2 rounded-lg text-sm font-bold bg-cyan-500 hover:bg-cyan-400 text-[#050607] flex items-center gap-2 transition disabled:opacity-50"
            >
              {isProcessing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 正在重新生成大綱...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> 確認來源並重新生成大綱</>
              )}
            </button>
          ) : pipelineStage === 2 ? (
            <button
              type="button"
              onClick={() => {
                setJsonDraft(JSON.stringify(planDraft, null, 2));
                setPipelineStage(3);
              }}
              className="px-5 py-2 rounded-lg text-sm font-bold bg-cyan-500 hover:bg-cyan-400 text-[#050607]"
            >
              確認場景大綱，檢視 JSON
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinalizeProject}
              className="px-5 py-2 rounded-lg text-sm font-bold bg-cyan-500 hover:bg-cyan-400 text-[#050607]"
            >
              建立已審閱的 Remotion 專案
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
