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
  ChevronDown,
} from 'lucide-react';
import {
  CONTENT_LANGUAGES,
  DOMAIN_META,
  DEFAULT_CONTENT_LANGUAGE,
  ContentLanguage,
  LlmConfig,
  ResearchSourceRecord,
  TechDomain,
  TrainingBrief,
  TrainingProject,
  TtsProvider,
  VideoThemeId,
  VoiceProfile,
} from '../types/training';
import { DomainChoice, isTechDomain } from '../utils/domainInference';
import { DEFAULT_GNAI_CONFIG, LLM_PROVIDER_PRESETS, loadStoredLlmConfig, saveStoredLlmConfig } from '../utils/llmConfigStorage';
import { loadTtsSettings } from '../utils/ttsSettingsStorage';
import { listVoiceProfiles, toCustomVoice } from '../utils/voiceProfiles';
import { getVideoTheme, VIDEO_THEMES } from '../utils/videoThemes';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface SourceWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLlmConfig?: LlmConfig;
  onProjectCreated: (project: TrainingProject, notice?: string) => void | Promise<void>;
}

const WIZARD_RECOVERY_KEY = 'remotion-training:wizard-draft:v1';

type WizardPlanDraft = {
  title: string;
  subtitle: string;
  domain: TechDomain;
  domainReason?: string;
  domainSource?: string;
  note?: string;
  scenes: any[];
};

type PersistedWizardDraft = {
  savedAt: string;
  domainChoice: DomainChoice;
  ttsProvider: TtsProvider;
  selectedVoiceFileName: string;
  createTtsOnFirstRun: boolean;
  language: ContentLanguage;
  inputMode: 'topic-llm' | 'upload';
  topic: string;
  odmMode: boolean;
  durationSeconds: number;
  videoTheme: VideoThemeId;
  researchText: string;
  brief: TrainingBrief;
  allowWebResearch: boolean;
  researchSources: ResearchSourceRecord[];
  pipelineStage: 0 | 1 | 2;
  preparedSource: {
    topic: string;
    rawText: string;
    sourceType: TrainingProject['sourceType'];
    sourceFileName?: string;
    pptxSlides?: unknown[];
  };
  planDraft: WizardPlanDraft | null;
  jsonDraft: string;
};

const readWizardRecovery = (): PersistedWizardDraft | null => {
  try {
    const raw = window.localStorage.getItem(WIZARD_RECOVERY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedWizardDraft>;
    if (!parsed.savedAt || typeof parsed.pipelineStage !== 'number') return null;
    return parsed as PersistedWizardDraft;
  } catch {
    return null;
  }
};

const DOMAIN_ICONS: Record<TechDomain, React.ReactNode> = {
  'debug-logic': <Cpu className="w-5 h-5" />,
  wifi: <Wifi className="w-5 h-5" />,
  bluetooth: <Bluetooth className="w-5 h-5" />,
  rf: <Radio className="w-5 h-5" />,
};

const DURATION_PRESETS = [
  { label: '5 分鐘', seconds: 300 },
  { label: '10 分鐘', seconds: 600 },
  { label: '15 分鐘', seconds: 900 },
  { label: '20 分鐘', seconds: 1200 },
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
  const dialogRef = useDialogFocus(isOpen, onClose);
  const [language, setLanguage] = useState<ContentLanguage>(DEFAULT_CONTENT_LANGUAGE);
  const [inputMode, setInputMode] = useState<'topic-llm' | 'upload'>('topic-llm');
  const [topic, setTopic] = useState('');
  const [odmMode, setOdmMode] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState<number>(300);
  const [videoTheme, setVideoTheme] = useState<VideoThemeId>('signal-grid');
  const [researchText, setResearchText] = useState('');
  const [brief, setBrief] = useState<TrainingBrief>({
    audience: 'Professionals',
    objective: '',
    tone: 'calm-instructional',
    sourceUrls: [],
  });
  const [sourceUrlsText, setSourceUrlsText] = useState('');
  const [allowWebResearch, setAllowWebResearch] = useState(false);
  const [researchSources, setResearchSources] = useState<ResearchSourceRecord[]>([]);
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
  const [pipelineStage, setPipelineStage] = useState<0 | 1 | 2>(0);
  const [showSourceEditor, setShowSourceEditor] = useState(false);
  const [preparedSource, setPreparedSource] = useState({
    topic: '',
    rawText: '',
    sourceType: 'topic-llm' as TrainingProject['sourceType'],
    sourceFileName: '' as string | undefined,
    pptxSlides: undefined as unknown[] | undefined,
  });
  const [planDraft, setPlanDraft] = useState<WizardPlanDraft | null>(null);
  const [jsonDraft, setJsonDraft] = useState('');
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [recoveredDraftAt, setRecoveredDraftAt] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const themePreviewRef = useRef<HTMLDivElement>(null);
  const progressTimerRef = useRef<number | null>(null);

  const usingEnvLlm = envLlmStatus.configured && !useBrowserLlmOverride;
  const selectedVoiceProfile = voiceProfiles.find((p) => p.fileName === selectedVoiceFileName);
  const selectedVideoTheme = getVideoTheme(videoTheme);

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
    setDraftHydrated(false);
    const recovery = readWizardRecovery();
    if (recovery) {
      setDomainChoice(recovery.domainChoice);
      setTtsProvider(recovery.ttsProvider);
      setSelectedVoiceFileName(recovery.selectedVoiceFileName || '');
      setCreateTtsOnFirstRun(Boolean(recovery.createTtsOnFirstRun));
      setLanguage(recovery.language || DEFAULT_CONTENT_LANGUAGE);
      setInputMode(recovery.inputMode || 'topic-llm');
      setTopic(recovery.topic || '');
      setOdmMode(Boolean(recovery.odmMode));
      setDurationSeconds(Math.max(300, Math.min(1200, recovery.durationSeconds || 300)));
      setVideoTheme(recovery.videoTheme || 'signal-grid');
      setResearchText(recovery.researchText || '');
      setBrief(recovery.brief || {
        audience: 'Professionals',
        objective: '',
        tone: 'calm-instructional',
        sourceUrls: [],
      });
      setSourceUrlsText((recovery.brief?.sourceUrls || []).join('\n'));
      setAllowWebResearch(Boolean(recovery.allowWebResearch));
      setResearchSources(recovery.researchSources || []);
      const restoredStage: 0 | 1 | 2 = !recovery.planDraft
        ? 0
        : (Math.min(2, Math.max(0, recovery.pipelineStage)) as 0 | 1 | 2);
      setPipelineStage(restoredStage);
      setShowSourceEditor(false);
      setPreparedSource({
        ...recovery.preparedSource,
        sourceFileName: recovery.preparedSource.sourceFileName,
        pptxSlides: recovery.preparedSource.pptxSlides,
      });
      setPlanDraft(recovery.planDraft || null);
      setJsonDraft(recovery.jsonDraft || '');
      setRecoveredDraftAt(recovery.savedAt);
    } else {
      setPipelineStage(0);
      setPlanDraft(null);
      setJsonDraft('');
      setRecoveredDraftAt(null);
      const ttsSettings = loadTtsSettings();
      setTtsProvider(ttsSettings.defaultProvider);
      setSelectedVoiceFileName(ttsSettings.defaultVoice?.fileName ?? '');
    }
    setDraftHydrated(true);

    const stored = loadStoredLlmConfig();
    const merged = initialLlmConfig?.apiKey ? initialLlmConfig : stored;
    setLlmConfig(merged);

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
    if (!isOpen || !draftHydrated) return;
    const draft: PersistedWizardDraft = {
      savedAt: new Date().toISOString(),
      domainChoice,
      ttsProvider,
      selectedVoiceFileName,
      createTtsOnFirstRun,
      language,
      inputMode,
      topic,
      odmMode,
      durationSeconds,
      videoTheme,
      researchText,
      brief: {
        ...brief,
        sourceUrls: sourceUrlsText.split(/\n|,/).map((url) => url.trim()).filter(Boolean),
      },
      allowWebResearch,
      researchSources,
      pipelineStage,
      preparedSource,
      planDraft,
      jsonDraft,
    };
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(WIZARD_RECOVERY_KEY, JSON.stringify(draft));
      } catch {
        setError('瀏覽器無法儲存建立進度；請保持此分頁開啟直到專案建立完成。');
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    isOpen,
    draftHydrated,
    domainChoice,
    ttsProvider,
    selectedVoiceFileName,
    createTtsOnFirstRun,
    language,
    inputMode,
    topic,
    odmMode,
    durationSeconds,
    videoTheme,
    researchText,
    brief,
    sourceUrlsText,
    allowWebResearch,
    researchSources,
    pipelineStage,
    preparedSource,
    planDraft,
    jsonDraft,
  ]);

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

      const sourceUrls = sourceUrlsText.split(/\n|,/).map((url) => url.trim()).filter(Boolean);
      if (pipelineStage === 0 && sourceUrls.length === 0) {
        setResearchSources([]);
      }
      if (pipelineStage === 0 && sourceUrls.length > 0) {
        if (!allowWebResearch) {
          throw new Error('已填入參考網址。請先勾選同意讀取公開網頁，或移除網址後重新產生。');
        }
        setCreateStage(`正在讀取 ${Math.min(sourceUrls.length, 6)} 個公開參考來源...`);
        const researchResp = await fetch('/api/research-sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consent: true, urls: sourceUrls }),
        });
        const researchData = await researchResp.json();
        if (!researchResp.ok) throw new Error(researchData.error || '參考來源讀取失敗');
        if (Array.isArray(researchData.errors) && researchData.errors.length > 0) {
          const details = researchData.errors.map((item: { url: string; error: string }) => `${item.url}: ${item.error}`).join('\n');
          throw new Error(`部分參考來源無法讀取：\n${details}`);
        }
        const fetchedSources = Array.isArray(researchData.sources)
          ? researchData.sources as Array<ResearchSourceRecord & { text: string }>
          : [];
        setResearchSources(fetchedSources.map(({ url, requestedUrl, title, chars }) => ({ url, requestedUrl, title, chars })));
        const sourceText = fetchedSources
          .map((source) => `\n\n## Web source: ${source.title}\nURL: ${source.url}\n${source.text}`)
          .join('');
        rawTextForLlm = `${rawTextForLlm}${sourceText}`.trim();
        setCreateProgress(28);
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

      const targetSec = Math.max(300, Math.min(1200, Number(durationSeconds) || 300));
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
          brief: {
            ...brief,
            sourceUrls: sourceUrlsText.split(/\n|,/).map((url) => url.trim()).filter(Boolean),
          },
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
      setPipelineStage(1);
      setShowSourceEditor(false);
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

  const handleFinalizeProject = async () => {
    if (!planDraft || isProcessing) return;
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
          provider: 'intel-gnai',
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
      brief: {
        ...brief,
        sourceUrls: sourceUrlsText.split(/\n|,/).map((url) => url.trim()).filter(Boolean),
      },
      domain: finalPlan.domain,
      targetDurationSeconds: Math.max(300, Math.min(1200, durationSeconds)),
      fps: 30,
      width: 1920,
      height: 1080,
      sourceType: preparedSource.sourceType,
      sourceFileName: preparedSource.sourceFileName,
      rawSourceText: preparedSource.rawText,
      researchSources,
      videoTheme,
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

    setError(null);
    setIsProcessing(true);
    setCreateStage('正在將專案安全寫入專案庫...');
    try {
      await onProjectCreated(proj, [domainNote, finalPlan.note, ttsNote].filter(Boolean).join(' • '));
      window.localStorage.removeItem(WIZARD_RECOVERY_KEY);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '專案建立後儲存失敗，草稿已保留');
    } finally {
      setIsProcessing(false);
      setCreateStage('');
    }
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
    { label: 'AI 場景大綱', description: '標題與腳本' },
    { label: 'Remotion JSON', description: '最終草稿' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
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
            disabled={isProcessing}
            aria-label="關閉"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          {recoveredDraftAt && (
            <div className="flex items-center justify-between gap-3 border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              <span>已從 {new Date(recoveredDraftAt).toLocaleString('zh-TW')} 復原未完成的建立流程。</span>
              <button
                type="button"
                onClick={() => setRecoveredDraftAt(null)}
                className="text-emerald-300 hover:text-white"
              >
                關閉提示
              </button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {PIPELINE_STAGES.map((stage, idx) => {
              const active = pipelineStage === idx;
              const complete = pipelineStage > idx;
              return (
                <button
                  key={stage.label}
                  type="button"
                  onClick={() => {
                    if (idx === 0 || (idx >= 1 && planDraft)) {
                      setPipelineStage(idx as 0 | 1 | 2);
                    }
                  }}
                  disabled={idx >= 1 && !planDraft}
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
                      min={300}
                      max={1200}
                      step={60}
                      value={durationSeconds}
                      onChange={(e) => setDurationSeconds(Math.max(300, Math.min(1200, Number(e.target.value) || 300)))}
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

          <section aria-labelledby="lesson-brief-title" className="space-y-3 border-y border-slate-800 py-4">
            <div>
              <h3 id="lesson-brief-title" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                教學簡報
              </h3>
              <p className="mt-1 text-[11px] text-slate-500">
                指定受眾、學習成果與語氣，讓場景順序與解說深度保持一致。
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="lesson-audience" className="mb-1.5 block text-[11px] font-semibold text-slate-400">
                  主要受眾
                </label>
                <input
                  id="lesson-audience"
                  type="text"
                  value={brief.audience}
                  onChange={(e) => setBrief((current) => ({ ...current, audience: e.target.value }))}
                  placeholder="例如：5 年以上經驗的系統設計工程師"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="lesson-tone" className="mb-1.5 block text-[11px] font-semibold text-slate-400">
                  敘事語氣
                </label>
                <select
                  id="lesson-tone"
                  value={brief.tone}
                  onChange={(e) => setBrief((current) => ({ ...current, tone: e.target.value as TrainingBrief['tone'] }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                >
                  <option value="calm-instructional">沉穩教學</option>
                  <option value="editorial">編輯敘事</option>
                  <option value="technical-documentary">技術紀錄片</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="lesson-objective" className="mb-1.5 block text-[11px] font-semibold text-slate-400">
                  學習目標
                </label>
                <textarea
                  id="lesson-objective"
                  rows={2}
                  value={brief.objective}
                  onChange={(e) => setBrief((current) => ({ ...current, objective: e.target.value }))}
                  placeholder="觀眾完成影片後，應該能做出什麼判斷、解決哪類問題，或解釋哪些因果關係？"
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="lesson-source-urls" className="mb-1.5 block text-[11px] font-semibold text-slate-400">
                  參考網址（每行一個，最多 6 個，選填）
                </label>
                <textarea
                  id="lesson-source-urls"
                  rows={3}
                  value={sourceUrlsText}
                  onChange={(e) => setSourceUrlsText(e.target.value)}
                  placeholder="https://example.com/specification\nhttps://example.com/white-paper"
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none"
                />
                <label className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-slate-400">
                  <input
                    type="checkbox"
                    checked={allowWebResearch}
                    onChange={(e) => setAllowWebResearch(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-cyan-400"
                  />
                  <span>
                    允許本機應用程式讀取以上公開 HTTP(S) 網頁內容。私人網址、登入頁與超過 1 MB 的內容不會讀取。
                  </span>
                </label>
              </div>
            </div>
          </section>

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

          <fieldset>
            <legend className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              3. 影片背景主題
            </legend>
            <p className="mb-3 text-[11px] text-slate-500">選擇貫穿所有場景的背景與 HUD 基礎風格；內容圖表仍會依技術領域配色。</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {VIDEO_THEMES.map((theme) => {
                const selected = videoTheme === theme.id;
                return (
                  <label
                    key={theme.id}
                    className={`group cursor-pointer border p-2 transition focus-within:ring-2 focus-within:ring-cyan-400/70 ${
                      selected
                        ? 'border-cyan-400 bg-cyan-500/[0.08]'
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="video-theme"
                      value={theme.id}
                      checked={selected}
                      onChange={() => {
                        setVideoTheme(theme.id);
                        window.requestAnimationFrame(() =>
                          themePreviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        );
                      }}
                      className="sr-only"
                    />
                    <span
                      className="relative block aspect-video overflow-hidden border"
                      style={{
                        backgroundColor: theme.backgroundColor,
                        backgroundImage: theme.backgroundImage,
                        backgroundSize: theme.backgroundSize,
                        borderColor: theme.panelBorder,
                      }}
                      aria-hidden="true"
                    >
                      <span className="absolute inset-x-2.5 top-2.5 flex items-center justify-between">
                        <span className="px-1 py-0.5 text-[5px] font-bold tracking-wider text-white" style={{ backgroundColor: theme.panelSurface, fontFamily: theme.labelFontFamily }}>
                          {theme.patternLabel}
                        </span>
                        <span className="h-1.5 w-8" style={{ backgroundColor: theme.secondaryAccent }} />
                      </span>
                      <span
                        className="absolute top-[37%]"
                        style={{
                          left: theme.layout === 'split-console' ? '48%' : theme.layout === 'drafting-sheet' ? '12%' : theme.layout === 'lab-notebook' ? '10%' : '14%',
                          right: theme.layout === 'split-console' ? '7%' : theme.layout === 'flow-canvas' ? '14%' : '12%',
                          textAlign: theme.layout === 'flow-canvas' ? 'center' : theme.layout === 'split-console' ? 'right' : 'left',
                          borderLeft: theme.layout === 'drafting-sheet' ? `1px solid ${theme.accentColor}` : undefined,
                          paddingLeft: theme.layout === 'drafting-sheet' ? 4 : 0,
                        }}
                      >
                        <span className="block h-1.5 w-full bg-white/80" />
                        <span className="mt-1.5 block h-1 w-2/3" style={{ backgroundColor: theme.accentColor, marginLeft: theme.layout === 'flow-canvas' ? 'auto' : theme.layout === 'split-console' ? 'auto' : undefined, marginRight: theme.layout === 'flow-canvas' ? 'auto' : undefined }} />
                      </span>
                      <span
                        className="absolute bottom-2.5 grid items-end gap-1.5"
                        style={{
                          left: theme.layout === 'split-console' ? '13%' : theme.layout === 'drafting-sheet' ? '14%' : '12%',
                          right: theme.layout === 'split-console' ? '42%' : theme.layout === 'flow-canvas' ? '12%' : '10%',
                          gridTemplateColumns: theme.layout === 'split-console' ? '1fr' : theme.layout === 'drafting-sheet' ? '1fr auto 1.25fr' : '1fr auto 1fr',
                          rotate: theme.layout === 'lab-notebook' ? '-1.5deg' : undefined,
                        }}
                      >
                        <span className="border" style={{ height: theme.layout === 'split-console' ? 15 : 28, backgroundColor: theme.panelSurface, borderColor: theme.panelBorder, borderRadius: theme.panelRadius / 3 }} />
                        <span className={theme.layout === 'split-console' ? 'mx-auto h-3 w-px' : 'mb-3 h-px w-3'} style={{ backgroundColor: theme.secondaryAccent }} />
                        <span className="border" style={{ height: theme.layout === 'split-console' ? 15 : 28, backgroundColor: theme.panelSurface, borderColor: theme.panelBorder, borderRadius: theme.panelRadius / 3 }} />
                      </span>
                    </span>
                    <span className="mt-2 flex items-start gap-2">
                      <span
                        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                          selected ? 'border-cyan-300 bg-cyan-400' : 'border-slate-600'
                        }`}
                        aria-hidden="true"
                      >
                        {selected && <span className="h-1.5 w-1.5 rounded-full bg-slate-950" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-bold text-slate-100">{theme.name}</span>
                        <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{theme.description}</span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div ref={themePreviewRef} className="mt-4 scroll-mb-24 border-t border-slate-800 pt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">主題預覽</div>
                  <div className="mt-0.5 text-xs font-bold text-slate-100">{selectedVideoTheme.name}</div>
                </div>
                <div className="text-right text-[10px] leading-4 text-slate-500">點選上方任一主題<br />立即更新下方畫面</div>
              </div>
              <div
                className="relative aspect-video overflow-hidden border shadow-[0_16px_40px_rgba(0,0,0,.28)]"
                style={{
                  backgroundColor: selectedVideoTheme.backgroundColor,
                  backgroundImage: selectedVideoTheme.backgroundImage,
                  backgroundSize: selectedVideoTheme.backgroundSize,
                  borderColor: selectedVideoTheme.panelBorder,
                }}
                aria-label={`${selectedVideoTheme.name} 影片背景預覽`}
              >
                {selectedVideoTheme.layout === 'drafting-sheet' && (
                  <div className="pointer-events-none absolute inset-y-4 left-8 border-l opacity-60" style={{ borderColor: selectedVideoTheme.panelBorder }}>
                    <span className="absolute -left-4 top-1 text-[6px]" style={{ color: selectedVideoTheme.accentColor }}>00</span>
                    <span className="absolute -left-4 top-1/2 text-[6px]" style={{ color: selectedVideoTheme.accentColor }}>50</span>
                    <span className="absolute -left-4 bottom-1 text-[6px]" style={{ color: selectedVideoTheme.accentColor }}>80</span>
                  </div>
                )}
                {selectedVideoTheme.layout === 'split-console' && (
                  <div className="pointer-events-none absolute inset-y-5 left-7 w-14 border-r opacity-55" style={{ borderColor: selectedVideoTheme.panelBorder }}>
                    <span className="absolute left-2 top-8 h-1 w-9" style={{ backgroundColor: selectedVideoTheme.secondaryAccent }} />
                    <span className="absolute left-2 top-14 h-px w-7 bg-white/30" />
                    <span className="absolute left-2 top-20 h-px w-10 bg-white/20" />
                  </div>
                )}
                {selectedVideoTheme.layout === 'flow-canvas' && (
                  <>
                    <div className="pointer-events-none absolute -left-[8%] bottom-[8%] h-[32%] w-[58%] rotate-[-10deg] rounded-[50%] border opacity-30" style={{ borderColor: selectedVideoTheme.accentColor }} />
                    <div className="pointer-events-none absolute -right-[8%] top-[16%] h-[28%] w-[54%] rotate-[12deg] rounded-[50%] border opacity-30" style={{ borderColor: selectedVideoTheme.secondaryAccent }} />
                  </>
                )}
                {selectedVideoTheme.layout === 'lab-notebook' && (
                  <div className="pointer-events-none absolute inset-y-8 left-8 w-px opacity-60" style={{ backgroundColor: selectedVideoTheme.secondaryAccent }} />
                )}
                <div className="absolute inset-x-5 top-4 flex items-center justify-between sm:inset-x-7 sm:top-5">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-1 text-[8px] font-bold tracking-wider sm:text-[10px]"
                      style={{ color: selectedVideoTheme.accentColor, backgroundColor: `${selectedVideoTheme.accentColor}18`, fontFamily: selectedVideoTheme.labelFontFamily }}
                    >
                      {selectedVideoTheme.patternLabel}
                    </span>
                    <span className="hidden text-[9px] text-white/45 sm:block" style={{ fontFamily: selectedVideoTheme.labelFontFamily }}>PCIe 訊號完整性分析</span>
                  </div>
                  <span
                    className="px-2 py-1 text-[8px] font-bold text-white/80 sm:text-[10px]"
                    style={{ backgroundColor: selectedVideoTheme.hudSurface }}
                  >
                    SCENE 03 / 08
                  </span>
                </div>

                <div
                  className="absolute top-[22%]"
                  style={{
                    left: selectedVideoTheme.layout === 'split-console' ? '48%' : selectedVideoTheme.layout === 'drafting-sheet' ? '12%' : selectedVideoTheme.layout === 'lab-notebook' ? '10%' : '8%',
                    right: selectedVideoTheme.layout === 'split-console' ? '6%' : selectedVideoTheme.layout === 'flow-canvas' ? '8%' : '8%',
                    textAlign: selectedVideoTheme.layout === 'flow-canvas' ? 'center' : selectedVideoTheme.layout === 'split-console' ? 'right' : 'left',
                    paddingLeft: selectedVideoTheme.layout === 'drafting-sheet' ? 12 : 0,
                    borderLeft: selectedVideoTheme.layout === 'drafting-sheet' ? `2px solid ${selectedVideoTheme.accentColor}` : undefined,
                  }}
                >
                  <div className="mb-1 text-[9px] font-bold tracking-[.12em] sm:text-[10px]" style={{ color: selectedVideoTheme.accentColor, fontFamily: selectedVideoTheme.labelFontFamily }}>
                    HIGH-SPEED SIGNAL PATH
                  </div>
                  <div
                    className="text-lg leading-tight text-white sm:text-2xl"
                    style={{ fontFamily: selectedVideoTheme.titleFontFamily, fontWeight: selectedVideoTheme.titleWeight, letterSpacing: selectedVideoTheme.titleLetterSpacing }}
                  >
                    PCIe Link Training 訊號鏈
                  </div>
                </div>

                <div
                  className="absolute bottom-[27%] top-[42%] grid items-center gap-2 sm:gap-5"
                  style={{
                    left: selectedVideoTheme.layout === 'split-console' ? '15%' : selectedVideoTheme.layout === 'drafting-sheet' ? '14%' : '7%',
                    right: selectedVideoTheme.layout === 'split-console' ? '38%' : selectedVideoTheme.layout === 'flow-canvas' ? '15%' : '7%',
                    gridTemplateColumns: selectedVideoTheme.layout === 'split-console' ? '1fr' : selectedVideoTheme.layout === 'drafting-sheet' ? '1fr auto 1.2fr' : '1fr auto 1fr',
                    rotate: selectedVideoTheme.layout === 'lab-notebook' ? '-1deg' : undefined,
                  }}
                >
                  <div className="border p-2 sm:p-3" style={{ backgroundColor: selectedVideoTheme.panelSurface, borderColor: selectedVideoTheme.panelBorder, borderRadius: selectedVideoTheme.panelRadius / 2 }}>
                    <div className="mb-2 h-1 w-10" style={{ backgroundColor: selectedVideoTheme.accentColor }} />
                    <div className="text-[8px] font-bold text-white sm:text-xs" style={{ fontFamily: selectedVideoTheme.labelFontFamily }}>Root Port</div>
                    <div className="mt-1 h-1.5 w-full bg-white/10"><span className="block h-full w-2/3" style={{ backgroundColor: `${selectedVideoTheme.accentColor}99` }} /></div>
                  </div>
                  <div className={selectedVideoTheme.layout === 'split-console' ? 'relative ml-auto h-8 w-px sm:h-12' : 'relative h-px w-12 sm:w-24'} style={{ backgroundColor: selectedVideoTheme.secondaryAccent }}>
                    <span className={`absolute h-3 w-3 rotate-45 border-r border-t ${selectedVideoTheme.layout === 'split-console' ? '-bottom-1 -right-1.5 rotate-[135deg]' : '-right-1 -top-1.5'}`} style={{ borderColor: selectedVideoTheme.secondaryAccent }} />
                  </div>
                  <div className="border p-2 sm:p-3" style={{ backgroundColor: selectedVideoTheme.panelSurface, borderColor: selectedVideoTheme.panelBorder, borderRadius: selectedVideoTheme.panelRadius / 2 }}>
                    <div className="mb-2 h-1 w-10" style={{ backgroundColor: selectedVideoTheme.secondaryAccent }} />
                    <div className="text-[8px] font-bold text-white sm:text-xs" style={{ fontFamily: selectedVideoTheme.labelFontFamily }}>Endpoint</div>
                    <div className="mt-1 h-1.5 w-full bg-white/10"><span className="block h-full w-4/5" style={{ backgroundColor: `${selectedVideoTheme.secondaryAccent}99` }} /></div>
                  </div>
                </div>

                <div
                  className="absolute inset-x-5 bottom-4 border px-3 py-2 text-center text-[9px] font-semibold leading-4 text-white/90 sm:inset-x-14 sm:bottom-5 sm:px-5 sm:py-3 sm:text-xs"
                  style={{ backgroundColor: selectedVideoTheme.captionSurface, borderColor: selectedVideoTheme.panelBorder, fontFamily: selectedVideoTheme.titleFontFamily, borderRadius: selectedVideoTheme.panelRadius / 2 }}
                >
                  先確認參考時脈與重置信號，再驗證鏈路訓練是否穩定完成。
                  <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: `linear-gradient(90deg, ${selectedVideoTheme.accentColor}, ${selectedVideoTheme.secondaryAccent})`, width: '42%' }} />
                </div>
              </div>
            </div>
          </fieldset>

          {/* Step 4: Domain */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              4. 技術領域視覺風格
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
                  文字模型供應商設定（支援本機 .env 自動載入或瀏覽器覆寫）
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="wizard-llm-provider" className="block text-[10px] text-slate-400 mb-1">文字模型供應商</label>
                        <select
                          id="wizard-llm-provider"
                          value={llmConfig.provider || 'openai-compatible'}
                          onChange={(event) => {
                            const provider = event.target.value as keyof typeof LLM_PROVIDER_PRESETS;
                            updateLlmConfig({ ...LLM_PROVIDER_PRESETS[provider], apiKey: llmConfig.apiKey });
                          }}
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                        >
                          <option value="intel-gnai">Intel GNAI</option>
                          <option value="openai-compatible">OpenAI-compatible</option>
                          <option value="local">Local OpenAI-compatible</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="wizard-llm-url" className="block text-[10px] text-slate-400 mb-1">Base URL</label>
                        <input
                          id="wizard-llm-url"
                          type="text"
                          value={llmConfig.baseUrl}
                          onChange={(e) => updateLlmConfig({ baseUrl: e.target.value })}
                          placeholder="https://api.example.com/v1"
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label htmlFor="wizard-llm-token" className="block text-[10px] text-slate-400 mb-1">API Key (本機儲存)</label>
                        <input
                          id="wizard-llm-token"
                          type="password"
                          value={llmConfig.apiKey}
                          onChange={(e) => updateLlmConfig({ apiKey: e.target.value })}
                          placeholder="貼上供應商 API Key"
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label htmlFor="wizard-llm-model" className="block text-[10px] text-slate-400 mb-1">Model</label>
                        <input
                          id="wizard-llm-model"
                          type="text"
                          value={llmConfig.model}
                          onChange={(e) => updateLlmConfig({ model: e.target.value })}
                          placeholder="模型識別碼"
                          className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 5: Default TTS Model & Voice Profile */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              5. 預設 TTS 語音合成引擎與聲線
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
                createTtsOnFirstRun ? 'border-cyan-400 bg-cyan-500/10 text-cyan-100' : 'border-slate-800 bg-slate-900/50 text-slate-300 hover:border-slate-700'
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
              {pipelineStage === 1 && planDraft && (
                <section className="space-y-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowSourceEditor((prev) => !prev)}
                      className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left text-xs text-slate-300 hover:bg-slate-900/70 transition"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-slate-200">來源文字與主題</span>
                        <span className="text-[11px] text-slate-500 truncate">
                          {preparedSource.sourceFileName
                            ? `${preparedSource.sourceFileName} • ${preparedSource.rawText.length.toLocaleString()} 字`
                            : preparedSource.rawText.trim()
                            ? `${preparedSource.rawText.length.toLocaleString()} 字`
                            : '展開可補充來源筆記並重新生成大綱'}
                        </span>
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                          showSourceEditor ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {showSourceEditor && (
                      <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-800 space-y-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">影片主題</label>
                          <input
                            value={preparedSource.topic}
                            onChange={(e) => setPreparedSource((prev) => ({ ...prev, topic: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">送給 AI 的來源文字 / 筆記</label>
                          <textarea
                            rows={6}
                            value={preparedSource.rawText}
                            onChange={(e) => setPreparedSource((prev) => ({ ...prev, rawText: e.target.value }))}
                            placeholder="可貼上或修正解析後的來源文字，再重新生成大綱..."
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono leading-relaxed"
                          />
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => void handleGenerate()}
                            className="px-3.5 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                          >
                            {isProcessing ? (
                              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 重新生成大綱中...</>
                            ) : (
                              <><Sparkles className="w-3.5 h-3.5" /> 套用來源並重新生成大綱</>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

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
                      className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
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
                </section>
              )}

              {pipelineStage === 2 && planDraft && (
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
              onClick={() => setPipelineStage((pipelineStage - 1) as 0 | 1)}
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
                <><Loader2 className="w-4 h-4 animate-spin" /> AI 生成場景大綱中...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> 生成 AI 場景大綱</>
              )}
            </button>
          ) : pipelineStage === 1 ? (
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => {
                setJsonDraft(JSON.stringify(planDraft, null, 2));
                setPipelineStage(2);
              }}
              className="px-5 py-2 rounded-lg text-sm font-bold bg-cyan-500 hover:bg-cyan-400 text-[#050607] transition disabled:opacity-50"
            >
              確認場景大綱，檢視 JSON
            </button>
          ) : (
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleFinalizeProject}
              className="px-5 py-2 rounded-lg text-sm font-bold bg-cyan-500 hover:bg-cyan-400 text-[#050607] transition disabled:opacity-50"
            >
              建立已審閱的 Remotion 專案
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
