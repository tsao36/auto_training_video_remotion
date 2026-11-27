import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import {
  Activity,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  FileAudio,
  FileText,
  GitBranch,
  Film,
  LayoutGrid,
  Layers,
  Loader2,
  Mic,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Tag,
  Trash2,
  Tv,
  Undo2,
  Volume2,
  Wand2,
} from 'lucide-react';
import { SavedProjectsMenu } from './components/SavedProjectsMenu';
import { ProjectDashboard } from './components/ProjectDashboard';
import { VideoPlayerMode } from './components/VideoPlayerMode';
import { AiPipelineReviewModal } from './components/AiPipelineReviewModal';
import { PreviewStillsState, QualityPreviewModal } from './components/QualityPreviewModal';
import { ScriptReviewModal } from './components/ScriptReviewModal';
import { SourceWizardModal } from './components/SourceWizardModal';
import { TechnicalTermsWhitelistModal } from './components/TechnicalTermsWhitelistModal';
import { TtsProgressPanel } from './components/TtsProgressPanel';
import { RecordedVoiceSubmission, VoiceRecorderModal } from './components/VoiceRecorderModal';
import { TechTrainingVideo } from './remotion/TechTrainingVideo';
import {
  DOMAIN_META,
  DEFAULT_CONTENT_LANGUAGE,
  EFFECT_LABELS,
  getContentLanguage,
  MediaQaResult,
  MotionStyle,
  RemotionEffect,
  SavedProjectRecord,
  SavedProjectSummary,
  SceneSpec,
  TEMPLATE_LABELS,
  TechDomain,
  TrainingProject,
  TtsProvider,
  VIDEO_FPS,
  VideoCaptionStyle,
  VisualTemplate,
  VoiceProfile,
  VoiceProfileProvider,
} from './types/training';
import { evaluateProjectQuality } from './utils/qualityLinter';
import { applyTtsSettings, loadTtsSettings } from './utils/ttsSettingsStorage';
import {
  computeTtsProgressMetrics,
  resolveTtsStage,
  TtsLiveStatusResponse,
} from './utils/ttsProgress';
import { createVoiceProfile, listVoiceProfiles, toCustomVoice, trainVoiceProfile } from './utils/voiceProfiles';
import {
  DEFAULT_GNAI_CONFIG,
  LLM_PROVIDER_PRESETS,
  loadStoredLlmConfig,
  saveStoredLlmConfig,
} from './utils/llmConfigStorage';
import {
  ensurePoppingTechnicalTermsPrimitive,
  generateCaptionsFromScript,
  generateProjectCaptions,
  serializeCaptions,
} from './utils/captions';
import { getSceneIndexAtFrame } from './utils/playerPlaylist';
import { splitScriptIntoSentences } from './utils/sentenceEffects';
import { buildProjectExportZip } from './utils/projectExport';
import {
  balanceScenesToDuration,
  computeRichnessDuration,
  createEmptyProject,
  formatDuration,
  getDefaultDiagramData,
} from './utils/planGenerator';

type InspectorTab = 'script-tts' | 'motion-visual' | 'engine-config';
type PendingTechnicalTermsAction =
  | { type: 'render'; previewOnlySceneIndex?: number }
  | { type: 'stills' };

export function App() {
  const [project, setProject] = useState<TrainingProject>(() => ({
    ...createEmptyProject('debug-logic'),
    llmConfig: loadStoredLlmConfig(),
  }));
  const [selectedSceneIdx, setSelectedSceneIdx] = useState(0);
  const [playbackSceneIdx, setPlaybackSceneIdx] = useState(0);
  const [view, setView] = useState<'dashboard' | 'editor' | 'player'>('dashboard');
  const [playerInitialProjectId, setPlayerInitialProjectId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('script-tts');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isScriptReviewOpen, setIsScriptReviewOpen] = useState(false);
  const [isAiPipelineOpen, setIsAiPipelineOpen] = useState(false);
  const [isTechnicalTermsOpen, setIsTechnicalTermsOpen] = useState(false);
  const [pendingTechnicalTermsAction, setPendingTechnicalTermsAction] = useState<PendingTechnicalTermsAction | null>(null);
  const [batchTtsRunning, setBatchTtsRunning] = useState(false);
  const [ttsDevice, setTtsDevice] = useState<string | null>(null);
  const [ttsElapsedSec, setTtsElapsedSec] = useState(0);
  const [ttsBatchElapsedSec, setTtsBatchElapsedSec] = useState(0);
  const [ttsCompletedDurationsSec, setTtsCompletedDurationsSec] = useState<number[]>([]);
  const [ttsLiveStatus, setTtsLiveStatus] = useState<TtsLiveStatusResponse | null>(null);
  const [ttsServerAlive, setTtsServerAlive] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [musicUploading, setMusicUploading] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const voiceFileInputRef = useRef<HTMLInputElement>(null);
  const musicFileInputRef = useRef<HTMLInputElement>(null);
  const [voiceRecorderOpen, setVoiceRecorderOpen] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [sceneAiLoading, setSceneAiLoading] = useState<string | null>(null);
  const [projectHistory, setProjectHistory] = useState<TrainingProject[]>([]);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<{
    active: boolean;
    progress: number;
    status: string;
    jobId?: string;
    outputUrl?: string;
    mediaQa?: MediaQaResult;
    error?: string;
  }>({ active: false, progress: 0, status: 'idle' });
  const [qualityModal, setQualityModal] = useState<{
    open: boolean;
    tab: 'quality' | 'stills';
    renderReview?: number | null;
  }>({ open: false, tab: 'quality' });
  const [stillsState, setStillsState] = useState<PreviewStillsState>({
    active: false,
    status: 'idle',
    progress: 0,
    totalScenes: 0,
    completedScenes: 0,
    stills: [],
  });
  const [savedProjects, setSavedProjects] = useState<SavedProjectSummary[]>([]);
  const [savedProjectsLoading, setSavedProjectsLoading] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [envLlmConfigured, setEnvLlmConfigured] = useState(false);

  const qualityReport = useMemo(() => evaluateProjectQuality(project), [project]);

  useEffect(() => {
    setProjectHistory([]);
  }, [project.id]);

  useEffect(() => {
    fetch('/api/llm/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((status: { configured?: boolean } | null) => {
        if (status?.configured) setEnvLlmConfigured(true);
      })
      .catch(() => {});
  }, []);

  const playerRef = useRef<PlayerRef>(null);
  const activeProjectIdRef = useRef<string>(project.id);
  const deletedProjectIdsRef = useRef<Set<string>>(new Set());
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const ttsRunIdRef = useRef(0);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const sceneTtsAbortControllersRef = useRef<Set<AbortController>>(new Set());
  activeProjectIdRef.current = project.id;

  const fetchSavedProjects = async () => {
    setSavedProjectsLoading(true);
    try {
      const resp = await fetch('/api/projects');
      if (!resp.ok) return;
      const data = (await resp.json()) as { projects?: SavedProjectSummary[] };
      setSavedProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch {
      // Ignore network errors when backend is starting
    } finally {
      setSavedProjectsLoading(false);
    }
  };

  const saveProjectToDisk = (
    targetProject: TrainingProject,
    showNotice = false,
    throwOnError = false
  ) => {
    const run = async () => {
      if (deletedProjectIdsRef.current.has(targetProject.id)) return;
      setSavingProject(true);
      try {
        const resp = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: targetProject }),
        });
        if (deletedProjectIdsRef.current.has(targetProject.id)) {
          await fetch(`/api/projects/${encodeURIComponent(targetProject.id)}`, { method: 'DELETE' });
          return;
        }
        if (!resp.ok) throw new Error('儲存專案失敗');
        await fetchSavedProjects();
        if (showNotice) {
          setAiNotice(`已儲存專案「${targetProject.title}」至專案 / 草稿庫`);
        }
      } catch (err) {
        if (showNotice) {
          setAiNotice(err instanceof Error ? err.message : '儲存專案失敗');
        }
        if (throwOnError) throw err;
      } finally {
        setSavingProject(false);
      }
    };
    const next = saveChainRef.current.then(run, run);
    saveChainRef.current = next;
    return next;
  };

  const handleSelectSavedProject = async (projectId: string) => {
    const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
    if (!resp.ok) {
      setAiNotice('無法載入所選專案');
      return;
    }
    const data = (await resp.json()) as { record?: SavedProjectRecord };
    if (!data.record?.project) return;
    const loaded = data.record.project;
    const storedLlm = loadStoredLlmConfig();
    setProject({
      ...loaded,
      llmConfig: {
        provider: loaded.llmConfig?.provider || storedLlm.provider,
        baseUrl: loaded.llmConfig?.baseUrl || storedLlm.baseUrl,
        apiKey: loaded.llmConfig?.apiKey || storedLlm.apiKey,
        model: loaded.llmConfig?.model || storedLlm.model,
      },
    });
    setSelectedSceneIdx(0);
    setRenderState({ active: false, progress: 0, status: 'idle' });
    playerRef.current?.seekTo(0);
    setAiNotice(`已載入專案「${loaded.title}」`);
    setView('editor');
  };

  const handleDeleteSavedProject = async (projectId: string) => {
    deletedProjectIdsRef.current.add(projectId);
    setSavedProjects((prev) => prev.filter((item) => item.id !== projectId));
    try {
      await saveChainRef.current;
      const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      });
      if (!resp.ok && resp.status !== 404) {
        const body = (await resp.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || '刪除專案失敗');
      }
      if (activeProjectIdRef.current === projectId) {
        setProject((prev) => ({
          ...createEmptyProject(prev.domain),
          llmConfig: prev.llmConfig || loadStoredLlmConfig(),
        }));
        setSelectedSceneIdx(0);
        playerRef.current?.seekTo(0);
      }
      setAiNotice('已從專案庫移除');
      await fetchSavedProjects();
    } catch (err) {
      deletedProjectIdsRef.current.delete(projectId);
      setAiNotice(err instanceof Error ? err.message : '刪除專案失敗');
      await fetchSavedProjects();
    }
  };

  useEffect(() => {
    void fetchSavedProjects();
  }, []);

  const isCurrentProjectSaved = useMemo(
    () => savedProjects.some((p) => p.id === project.id),
    [savedProjects, project.id]
  );

  useEffect(() => {
    if (deletedProjectIdsRef.current.has(project.id)) return;
    // Unsaved empty projects (page load, or the placeholder left after a delete) must not be written to disk.
    if (!isCurrentProjectSaved) return;
    const timer = setTimeout(() => {
      void saveProjectToDisk(project, false);
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, isCurrentProjectSaved]);

  const selectedScene = project.scenes[selectedSceneIdx] || project.scenes[0];
  const readyTtsCount = useMemo(
    () => project.scenes.filter((s) => s.tts.status === 'ready' && s.tts.audioUrl).length,
    [project.scenes]
  );
  const generatingScenes = useMemo(
    () =>
      project.scenes
        .map((scene, idx) => ({ scene, idx }))
        .filter(({ scene }) => scene.tts.status === 'generating'),
    [project.scenes]
  );
  const isTtsRendering = batchTtsRunning || generatingScenes.length > 0;
  const activeGeneratingScene = generatingScenes[0];
  const resolvedTtsStage = useMemo(
    () =>
      resolveTtsStage(
        ttsLiveStatus,
        activeGeneratingScene?.scene.id,
        activeGeneratingScene?.scene.tts.provider,
        ttsDevice
      ),
    [ttsLiveStatus, activeGeneratingScene?.scene.id, activeGeneratingScene?.scene.tts.provider, ttsDevice]
  );
  const ttsProgressMetrics = useMemo(
    () =>
      computeTtsProgressMetrics({
        totalScenes: project.scenes.length,
        readyScenes: readyTtsCount,
        generatingCount: generatingScenes.length,
        currentSceneElapsedSec: ttsElapsedSec,
        completedDurationsSec: ttsCompletedDurationsSec,
        provider: activeGeneratingScene?.scene.tts.provider,
        device: resolvedTtsStage.device,
        engineLastDurationSec: ttsLiveStatus?.engineStatus?.last_duration_sec ?? null,
        isLoadingModel: resolvedTtsStage.isLoadingModel,
      }),
    [
      project.scenes.length,
      readyTtsCount,
      generatingScenes.length,
      ttsElapsedSec,
      ttsCompletedDurationsSec,
      activeGeneratingScene?.scene.tts.provider,
      resolvedTtsStage.device,
      resolvedTtsStage.isLoadingModel,
      ttsLiveStatus?.engineStatus?.last_duration_sec,
    ]
  );
  const isSelectedSceneTtsRendering = selectedScene?.tts.status === 'generating';

  const totalSeconds = useMemo(
    () => project.scenes.reduce((sum, s) => sum + s.durationSeconds, 0),
    [project.scenes]
  );
  const totalFrames = Math.max(VIDEO_FPS, Math.round(totalSeconds * VIDEO_FPS));

  const sceneStartFrames = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (const s of project.scenes) {
      starts.push(acc);
      acc += Math.round(s.durationSeconds * VIDEO_FPS);
    }
    return starts;
  }, [project.scenes]);

  const jumpToScene = (idx: number) => {
    setSelectedSceneIdx(idx);
    setPlaybackSceneIdx(idx);
    const frame = sceneStartFrames[idx] ?? 0;
    playerRef.current?.seekTo(frame);
  };

  useEffect(() => {
    const player = playerRef.current;
    if (!player || project.scenes.length === 0) return;

    const onFrameUpdate = (event: { detail: { frame: number } }) => {
      const nextIdx = getSceneIndexAtFrame(project.scenes, event.detail.frame, VIDEO_FPS);
      setPlaybackSceneIdx((current) => (current === nextIdx ? current : nextIdx));
    };

    player.addEventListener('frameupdate', onFrameUpdate);
    return () => player.removeEventListener('frameupdate', onFrameUpdate);
  }, [project.scenes, view]);

  const updateCaptionStyle = (patch: Partial<VideoCaptionStyle>) => {
    setProject((prev) => ({
      ...prev,
      captionStyle: { ...prev.captionStyle, ...patch },
    }));
  };

  const [exportingPackage, setExportingPackage] = useState(false);

  const downloadProjectPackage = async () => {
    setExportingPackage(true);
    try {
      const latestRender = savedProjects.find((item) => item.id === project.id)?.renders
        .slice()
        .reverse()
        .find((render) => !render.isPreview);
      let renderedVideo: Blob | undefined;
      if (latestRender?.outputUrl) {
        const response = await fetch(latestRender.outputUrl);
        if (response.ok) renderedVideo = await response.blob();
      }
      const blob = await buildProjectExportZip({ project, renderedVideo, latestRender });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const safeTitle = (project.title || 'training-project').replace(/[<>:"/\\|?*]+/g, '-').trim();
      anchor.href = url;
      anchor.download = `${safeTitle}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setAiNotice(`已匯出專案包${renderedVideo ? '（含 MP4）' : '（目前不含 MP4）'}。`);
    } catch (err) {
      setAiNotice(err instanceof Error ? err.message : '專案包匯出失敗');
    } finally {
      setExportingPackage(false);
    }
  };

  const downloadCaptions = (format: 'srt' | 'vtt') => {
    const captions = generateProjectCaptions(project.scenes);
    const content = serializeCaptions(captions, format);
    const blob = new Blob([content], { type: format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeTitle = (project.title || 'training-video').replace(/[<>:"/\\|?*]+/g, '-').trim();
    anchor.href = url;
    anchor.download = `${safeTitle}.${format}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAiNotice(`已匯出 ${captions.length} 段 ${format.toUpperCase()} 字幕。`);
  };

  const updateScene = (idx: number, patch: Partial<SceneSpec>) => {
    const candidateSourcesChanged = [
      'script',
      'title',
      'keyPoints',
      'visualDescription',
      'captions',
      'pptxSlide',
      'pptxNotes',
    ].some((key) => Object.prototype.hasOwnProperty.call(patch, key));
    setProject((prev) => ({
      ...prev,
      technicalTermsWhitelist: candidateSourcesChanged && prev.technicalTermsWhitelist
        ? { ...prev.technicalTermsWhitelist, reviewedAt: undefined }
        : prev.technicalTermsWhitelist,
      scenes: prev.scenes.map((scene, index) => {
        if (index !== idx) return scene;
        const next = { ...scene, ...patch };
        return {
          ...next,
          remotionPrimitives: ensurePoppingTechnicalTermsPrimitive(
            next.script,
            next.remotionPrimitives
          ) as SceneSpec['remotionPrimitives'],
          captions: patch.script !== undefined
            ? generateCaptionsFromScript(
                next.script,
                next.tts?.actualDurationSec && next.tts.actualDurationSec > 0
                  ? next.tts.actualDurationSec
                  : next.durationSeconds
              )
            : next.captions,
        };
      }),
    }));
  };

  const handleDomainSwitch = (domain: TechDomain) => {
    setProject((prev) => ({
      ...createEmptyProject(domain),
      language: DEFAULT_CONTENT_LANGUAGE,
      llmConfig: prev.llmConfig || loadStoredLlmConfig(),
    }));
    setSelectedSceneIdx(0);
    playerRef.current?.seekTo(0);
  };

  const handleAutoBalance = () => {
    setProject((prev) => ({
      ...prev,
      scenes: balanceScenesToDuration(prev.scenes, prev.targetDurationSeconds),
    }));
  };

  const regenerateSceneWithAi = async (
    idx: number,
    action: 'sync-visual-to-script' | 'rewrite-script-no-read' | 'regenerate-both'
  ) => {
    const scene = project.scenes[idx];
    if (!scene) return;
    setSceneAiLoading(action);
    setAiNotice(null);
    try {
      const resp = await fetch('/api/llm/regenerate-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: project.topic || project.title,
          scene,
          action,
          rawText: project.rawSourceText,
          language: project.language || DEFAULT_CONTENT_LANGUAGE,
          odmMode: Boolean(project.odmMode),
          llmConfig: project.llmConfig,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'AI 更新失敗');
      setProjectHistory((history) => [...history.slice(-7), structuredClone(project)]);
      updateScene(idx, data.scenePatch);
      if (data.note) setAiNotice(data.note);
    } catch (err) {
      setAiNotice(err instanceof Error ? err.message : 'AI 更新失敗');
    } finally {
      setSceneAiLoading(null);
    }
  };

  const undoAiChange = () => {
    const previous = projectHistory.at(-1);
    if (!previous) return;
    setProject(previous);
    setProjectHistory((history) => history.slice(0, -1));
    setSelectedSceneIdx((current) => Math.min(current, previous.scenes.length - 1));
    setAiNotice('已還原最近一次 AI 場景更新。');
  };

  const handleAddScene = () => {
    const meta = DOMAIN_META[project.domain];
    const newScene: SceneSpec = {
      id: `scene-${Date.now()}`,
      index: project.scenes.length,
      title: `新技術章節 ${project.scenes.length + 1}`,
      subtitle: `${meta.badge} • SCENE ${project.scenes.length + 1}`,
      domain: project.domain,
      template: 'architecture-flow',
      durationSeconds: 6,
      keyPoints: ['關鍵硬體架構解析', '訊號量測與除錯要點'],
      script: '請在此輸入此場景的 TTS 旁白講稿內容。',
      diagramData: getDefaultDiagramData(project.domain, 'architecture-flow'),
      tts: {
        provider: project.ttsConfig.defaultProvider,
        voiceId:
          project.ttsConfig.defaultProvider === 'ming-3.0'
            ? project.ttsConfig.mingTts.speaker
            : project.ttsConfig.openformosa.voice,
        speed: 1.0,
        status: 'idle',
      },
      animation: {
        motionStyle: 'spring-snappy',
        effect: 'signal-pulse',
        accentColor: project.colorScheme?.primary || meta.accentColor,
        showSubtitles: true,
        showProgressHud: true,
      },
    };
    const nextScenes = balanceScenesToDuration(
      [...project.scenes, newScene],
      project.targetDurationSeconds
    );
    setProject((prev) => ({ ...prev, scenes: nextScenes }));
    setSelectedSceneIdx(nextScenes.length - 1);
  };

  const handleDeleteScene = (idx: number) => {
    if (project.scenes.length <= 2) return;
    const filtered = project.scenes.filter((_, i) => i !== idx);
    const balanced = balanceScenesToDuration(filtered, project.targetDurationSeconds);
    setProject((prev) => ({ ...prev, scenes: balanced }));
    setSelectedSceneIdx(Math.max(0, Math.min(selectedSceneIdx, balanced.length - 1)));
  };

  const setCustomVoice = (customVoice: TrainingProject['ttsConfig']['customVoice']) => {
    // Existing audio was made with the old voice, so mark it for regeneration.
    setProject((prev) => ({
      ...prev,
      ttsConfig: {
        ...prev.ttsConfig,
        defaultProvider: customVoice?.provider ?? prev.ttsConfig.defaultProvider,
        customVoice,
      },
      scenes: prev.scenes.map((sc) => ({
        ...sc,
        tts: {
          ...sc.tts,
          provider:
            customVoice?.provider && sc.tts.provider !== 'browser-fallback'
              ? customVoice.provider
              : sc.tts.provider,
          status: 'idle',
          audioUrl: undefined,
          error: undefined,
        },
      })),
    }));
  };

  const uploadVoiceSample = async (
    file: File,
    opts?: { name?: string; provider?: VoiceProfileProvider; trainNow?: boolean; referenceText?: string }
  ): Promise<boolean> => {
    setVoiceUploading(true);
    setVoiceError(null);
    setAiNotice(null);
    try {
      let profile = await createVoiceProfile(file, {
        name: opts?.name,
        provider: opts?.provider,
        referenceText: opts?.referenceText,
      });
      if (opts?.trainNow && opts.provider) {
        profile = await trainVoiceProfile(profile.id, {
          provider: opts.provider,
          openformosa: project.ttsConfig.openformosa,
          mingTts: project.ttsConfig.mingTts,
          referenceText: opts.referenceText,
          language: project.language || DEFAULT_CONTENT_LANGUAGE,
        });
      }
      setVoiceProfiles((prev) => [...prev, profile]);
      setCustomVoice(toCustomVoice(profile));
      setAiNotice(
        profile.trainingNote
          ? `已套用聲線「${profile.name}」：${profile.trainingNote}。請重新生成 TTS 音軌`
          : `已建立並套用聲線「${profile.name}」，請重新生成 TTS 音軌；可在總覽頁「設定」管理聲線`
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上傳失敗';
      setVoiceError(msg);
      setAiNotice(msg);
      return false;
    } finally {
      setVoiceUploading(false);
    }
  };

  const uploadBackgroundMusic = async (file: File) => {
    setMusicUploading(true);
    setMusicError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/music/upload', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Background music import failed.');
      setProject((current) => ({
        ...current,
        backgroundMusic: {
          url: data.url,
          fileName: data.fileName,
          volume: 0.12,
          loop: true,
          licenseNote: current.backgroundMusic?.licenseNote || '',
        },
      }));
      setAiNotice(`已匯入背景音樂「${data.fileName}」。`);
    } catch (err) {
      setMusicError(err instanceof Error ? err.message : 'Background music import failed.');
    } finally {
      setMusicUploading(false);
    }
  };

  const synthesizeSceneTts = async (idx: number) => {
    const scene = project.scenes[idx];
    if (!scene) return;
    const startedAt = Date.now();
    const controller = new AbortController();
    sceneTtsAbortControllersRef.current.add(controller);
    updateScene(idx, { tts: { ...scene.tts, status: 'generating', error: undefined } });

    try {
      const resp = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          sceneId: scene.id,
          text: scene.script,
          provider: scene.tts.provider,
          voiceId: scene.tts.voiceId,
          language: project.language || DEFAULT_CONTENT_LANGUAGE,
          speed: scene.tts.speed,
          durationSeconds: scene.durationSeconds,
          openformosa: project.ttsConfig.openformosa,
          mingTts: project.ttsConfig.mingTts,
          customVoice: project.ttsConfig.customVoice,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'TTS failed');
      const wallSec = (Date.now() - startedAt) / 1000;
      if (data.mode !== 'cached' && wallSec >= 0.5) {
        setTtsCompletedDurationsSec((prev) => [...prev.slice(-11), wallSec]);
      }
      const actualDur = typeof data.durationSec === 'number' && data.durationSec > 0 ? data.durationSec : undefined;
      setProject((prev) => ({
        ...prev,
        scenes: prev.scenes.map((sc, i) =>
          i === idx
            ? {
                ...sc,
                durationSeconds: actualDur
                  ? Math.max(3, Math.ceil(actualDur + 0.5))
                  : sc.durationSeconds,
                tts: {
                  ...sc.tts,
                  status: 'ready',
                  audioUrl: data.audioUrl,
                  actualDurationSec: actualDur ?? sc.tts.actualDurationSec,
                  error: data.note || undefined,
                },
              }
            : sc
        ),
      }));
    } catch (err) {
      if (controller.signal.aborted) return;
      setProject((prev) => ({
        ...prev,
        scenes: prev.scenes.map((sc, i) =>
          i === idx
            ? {
                ...sc,
                tts: {
                  ...sc.tts,
                  status: 'error',
                  error: err instanceof Error ? err.message : 'TTS synthesis failed',
                },
              }
            : sc
        ),
      }));
    } finally {
      sceneTtsAbortControllersRef.current.delete(controller);
    }
  };

  const synthesizeScenesConcurrent = async (
    targetProjectId: string,
    scenesSnapshot: SceneSpec[],
    ttsConfigSnapshot: TrainingProject['ttsConfig'],
    languageSnapshot: TrainingProject['language'],
    onlyMissing = true
  ) => {
    const queue = scenesSnapshot
      .map((s, idx) => ({ s, idx }))
      .filter(({ s }) => (!onlyMissing ? true : s.tts.status !== 'ready' || !s.tts.audioUrl));

    if (queue.length === 0) return;
    ttsAbortControllerRef.current?.abort();
    const controller = new AbortController();
    ttsAbortControllerRef.current = controller;
    const runId = ++ttsRunIdRef.current;
    setTtsCompletedDurationsSec([]);
    setBatchTtsRunning(true);

    let cursor = 0;
    // Local TTS engines (BlueMagpie / Ming-3.0) serialize inference on a single model lock;
    // firing 6 concurrent requests causes later scenes to wait >300s in the HTTP queue and time out.
    const usesLocalTts = queue.some(({ s }) => s.tts.provider === 'openformosa' || s.tts.provider === 'ming-3.0');
    const workerCount = usesLocalTts ? 1 : 6;

    const worker = async () => {
      while (cursor < queue.length) {
        if (activeProjectIdRef.current !== targetProjectId || ttsRunIdRef.current !== runId) return;
        const item = queue[cursor++];
        if (!item) return;
        const { s, idx } = item;
        const itemStartedAt = Date.now();

        setProject((prev) => {
          if (prev.id !== targetProjectId) return prev;
          return {
            ...prev,
            scenes: prev.scenes.map((sc, i) =>
              i === idx ? { ...sc, tts: { ...sc.tts, status: 'generating', error: undefined } } : sc
            ),
          };
        });

        try {
          const resp = await fetch('/api/tts/synthesize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              sceneId: s.id,
              text: s.script,
              provider: s.tts.provider,
              voiceId: s.tts.voiceId,
              language: languageSnapshot || DEFAULT_CONTENT_LANGUAGE,
              speed: s.tts.speed,
              durationSeconds: s.durationSeconds,
              openformosa: ttsConfigSnapshot.openformosa,
              mingTts: ttsConfigSnapshot.mingTts,
              customVoice: ttsConfigSnapshot.customVoice,
            }),
          });
          const data = await resp.json();
          if (activeProjectIdRef.current !== targetProjectId || ttsRunIdRef.current !== runId) return;
          if (resp.ok && data.audioUrl) {
            const wallSec = (Date.now() - itemStartedAt) / 1000;
            if (data.mode !== 'cached' && wallSec >= 0.5) {
              setTtsCompletedDurationsSec((prev) => [...prev.slice(-11), wallSec]);
            }
            const actualDur =
              typeof data.durationSec === 'number' && data.durationSec > 0
                ? data.durationSec
                : undefined;
            setProject((prev) => {
              if (prev.id !== targetProjectId) return prev;
              return {
                ...prev,
                scenes: prev.scenes.map((sc, i) =>
                  i === idx
                    ? {
                        ...sc,
                        durationSeconds: actualDur
                          ? Math.max(3, Math.ceil(actualDur + 0.5))
                          : sc.durationSeconds,
                        tts: {
                          ...sc.tts,
                          status: 'ready',
                          audioUrl: data.audioUrl,
                          actualDurationSec: actualDur ?? sc.tts.actualDurationSec,
                          error: data.note || undefined,
                        },
                      }
                    : sc
                ),
              };
            });
          } else {
            setProject((prev) => {
              if (prev.id !== targetProjectId) return prev;
              return {
                ...prev,
                scenes: prev.scenes.map((sc, i) =>
                  i === idx
                    ? {
                        ...sc,
                        tts: {
                          ...sc.tts,
                          status: 'error',
                          error: data?.error || 'TTS 合成失敗',
                        },
                      }
                    : sc
                ),
              };
            });
          }
        } catch (err) {
          if (
            controller.signal.aborted ||
            activeProjectIdRef.current !== targetProjectId ||
            ttsRunIdRef.current !== runId
          ) {
            return;
          }
          setProject((prev) => {
            if (prev.id !== targetProjectId) return prev;
            return {
              ...prev,
              scenes: prev.scenes.map((sc, i) =>
                i === idx
                  ? {
                      ...sc,
                      tts: {
                        ...sc.tts,
                        status: 'error',
                        error: err instanceof Error ? err.message : 'TTS 合成失敗',
                      },
                    }
                  : sc
              ),
            };
          });
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    if (activeProjectIdRef.current === targetProjectId && ttsRunIdRef.current === runId) {
      setBatchTtsRunning(false);
    }
  };

  const stopTtsGeneration = () => {
    ttsAbortControllerRef.current?.abort();
    sceneTtsAbortControllersRef.current.forEach((c) => c.abort());
    ttsRunIdRef.current += 1;
    setBatchTtsRunning(false);
    // Deferring keeps the stop in effect when the project is reopened.
    setProject((prev) => ({
      ...prev,
      ttsDeferred: true,
      scenes: prev.scenes.map((sc) =>
        sc.tts.status === 'generating'
          ? { ...sc, tts: { ...sc.tts, status: 'idle', error: undefined } }
          : sc
      ),
    }));
    setAiNotice('已停止 TTS 配音；已完成的場景語音會保留，需要時再按「全部配音」繼續。');
  };

  const switchRemainingToFastTts = () => {
    ttsAbortControllerRef.current?.abort();
    ttsRunIdRef.current += 1;
    setBatchTtsRunning(false);
    const updatedScenes: SceneSpec[] = project.scenes.map((sc) =>
      sc.tts.status === 'ready' && sc.tts.audioUrl
        ? sc
        : {
            ...sc,
            tts: {
              ...sc.tts,
              provider: 'browser-fallback',
              status: 'idle',
              error: undefined,
            },
          }
    );
    const updatedTtsConfig: TrainingProject['ttsConfig'] = {
      ...project.ttsConfig,
      customVoice: undefined,
    };
    setProject((prev) => ({
      ...prev,
      ttsConfig: updatedTtsConfig,
      scenes: updatedScenes,
    }));
    setAiNotice('已將尚未完成配音的場景切換為快速神經網路語音 (Edge TTS)，正在極速合成中...');
    void synthesizeScenesConcurrent(
      project.id,
      updatedScenes,
      updatedTtsConfig,
      project.language,
      true
    );
  };

  useEffect(() => {
    if (view !== 'editor') return;
    listVoiceProfiles()
      .then(setVoiceProfiles)
      .catch(() => setVoiceProfiles([]));
    fetch(`/api/tts/health?baseUrl=${encodeURIComponent(project.ttsConfig.openformosa.baseUrl || '')}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok?: boolean; device?: string } | null) => {
        setTtsDevice(data?.ok ? data.device || 'cpu' : null);
      })
      .catch(() => setTtsDevice(null));
  }, [view, project.ttsConfig.openformosa.baseUrl]);

  useEffect(() => {
    if (!isTtsRendering) {
      setTtsElapsedSec(0);
      return;
    }
    setTtsElapsedSec(0);
    const timer = setInterval(() => {
      setTtsElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isTtsRendering, activeGeneratingScene?.scene.id]);

  useEffect(() => {
    if (!isTtsRendering) {
      setTtsBatchElapsedSec(0);
      setTtsLiveStatus(null);
      setTtsServerAlive(false);
      return;
    }
    setTtsBatchElapsedSec(0);
    const batchTimer = setInterval(() => {
      setTtsBatchElapsedSec((prev) => prev + 1);
    }, 1000);

    let cancelled = false;
    const pollStatus = async () => {
      try {
        const baseUrl = project.ttsConfig.openformosa.baseUrl || '';
        const resp = await fetch(`/api/tts/status?baseUrl=${encodeURIComponent(baseUrl)}`);
        if (!resp.ok || cancelled) return;
        const data = (await resp.json()) as TtsLiveStatusResponse;
        if (cancelled) return;
        setTtsLiveStatus(data);
        setTtsServerAlive(true);
        if (data.engineStatus?.device) {
          setTtsDevice(data.engineStatus.device);
        }
      } catch {
        if (!cancelled) setTtsServerAlive(false);
      }
    };
    void pollStatus();
    const statusTimer = setInterval(() => {
      void pollStatus();
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(batchTimer);
      clearInterval(statusTimer);
    };
  }, [isTtsRendering, project.ttsConfig.openformosa.baseUrl]);

  useEffect(() => {
    if (view !== 'editor') return;
    if (!project.ttsDeferred) {
      void synthesizeScenesConcurrent(
        project.id,
        project.scenes,
        project.ttsConfig,
        project.language,
        true
      );
    }
    return () => {
      ttsAbortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, view]);

  const synthesizeAllScenes = async () => {
    setProject((prev) => (prev.ttsDeferred ? { ...prev, ttsDeferred: false } : prev));
    await synthesizeScenesConcurrent(
      project.id,
      project.scenes,
      project.ttsConfig,
      project.language,
      false
    );
  };

  const previewBrowserSpeech = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const sentences = splitScriptIntoSentences(text);
    for (const sentence of sentences) {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = getContentLanguage(project.language).value;
      utterance.rate = selectedScene?.tts.speed || 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const executePreviewStills = async (targetProject: TrainingProject) => {
    setQualityModal({ open: true, tab: 'stills' });
    setStillsState({
      active: true,
      status: 'bundling',
      progress: 5,
      totalScenes: project.scenes.length,
      completedScenes: 0,
      stills: [],
    });
    try {
      const resp = await fetch('/api/preview-stills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectTitle: targetProject.title,
          scenes: targetProject.scenes,
          captionStyle: targetProject.captionStyle,
          videoTheme: targetProject.videoTheme,
          technicalTermsWhitelist: targetProject.technicalTermsWhitelist?.terms,
        }),
      });
      const { jobId, error } = await resp.json();
      if (!resp.ok) throw new Error(error || '無法啟動場景靜態預覽');

      const timer = setInterval(async () => {
        try {
          const poll = await fetch(`/api/preview-stills/${jobId}`);
          const job = await poll.json();
          if (job.status === 'done') {
            clearInterval(timer);
            setStillsState({
              active: false,
              status: 'done',
              progress: 100,
              totalScenes: job.totalScenes || project.scenes.length,
              completedScenes: job.completedScenes || project.scenes.length,
              stills: Array.isArray(job.stills) ? job.stills : [],
            });
          } else if (job.status === 'error') {
            clearInterval(timer);
            setStillsState((prev) => ({
              ...prev,
              active: false,
              status: 'error',
              error: job.error || '場景預覽算圖失敗',
            }));
          } else {
            setStillsState({
              active: true,
              status: job.status || 'rendering',
              progress: job.progress || 10,
              totalScenes: job.totalScenes || project.scenes.length,
              completedScenes: job.completedScenes || 0,
              stills: Array.isArray(job.stills) ? job.stills : [],
            });
          }
        } catch {
          clearInterval(timer);
          setStillsState((prev) => ({
            ...prev,
            active: false,
            status: 'error',
            error: '輪詢場景預覽進度失敗',
          }));
        }
      }, 1000);
    } catch (err) {
      setStillsState((prev) => ({
        ...prev,
        active: false,
        status: 'error',
        error: err instanceof Error ? err.message : '場景預覽啟動失敗',
      }));
    }
  };

  const executeRender = async (
    previewOnlySceneIndex?: number,
    targetProject: TrainingProject = project
  ) => {
    setRenderState({ active: true, progress: 5, status: 'bundling' });
    try {
      const resp = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectTitle: targetProject.title,
          scenes: targetProject.scenes,
          previewOnlySceneIndex,
          project: targetProject,
        }),
      });
      const { jobId, error } = await resp.json();
      if (!resp.ok) throw new Error(error || '無法啟動 Remotion 輸出');
      setRenderState({ active: true, progress: 5, status: 'bundling', jobId });

      const timer = setInterval(async () => {
        try {
          const poll = await fetch(`/api/render/${jobId}`);
          const job = await poll.json();
          if (job.cancelled) {
            clearInterval(timer);
            setRenderState({ active: false, progress: 0, status: 'cancelled' });
          } else if (job.status === 'done') {
            clearInterval(timer);
            setRenderState({
              active: false,
              progress: 100,
              status: 'done',
              jobId,
              outputUrl: job.outputUrl,
              mediaQa: job.mediaQa,
            });
            void fetchSavedProjects();
          } else if (job.status === 'error') {
            clearInterval(timer);
            if (job.cancelled) {
              setRenderState({ active: false, progress: 0, status: 'cancelled' });
            } else {
              setRenderState({
                active: false,
                progress: 0,
                status: 'error',
                jobId,
                error: job.error,
              });
            }
          } else {
            setRenderState({
              active: true,
              progress: job.progress || 10,
              status: job.status,
              jobId,
            });
          }
        } catch {
          clearInterval(timer);
          setRenderState({ active: false, progress: 0, status: 'error', error: '輪詢進度失敗' });
        }
      }, 1200);
    } catch (err) {
      setRenderState({
        active: false,
        progress: 0,
        status: 'error',
        error: err instanceof Error ? err.message : '輸出失敗',
      });
    }
  };

  const requestRender = (previewOnlySceneIndex?: number) => {
    setQualityModal({ open: true, tab: 'quality', renderReview: previewOnlySceneIndex ?? null });
  };

  const continueRenderAfterQuality = (
    previewOnlySceneIndex: number | undefined,
    targetProject: TrainingProject = project
  ) => {
    if (!targetProject.technicalTermsWhitelist?.reviewedAt) {
      setPendingTechnicalTermsAction({ type: 'render', previewOnlySceneIndex });
      setIsTechnicalTermsOpen(true);
      return;
    }
    void executeRender(previewOnlySceneIndex, targetProject);
  };

  const cancelActiveRender = async () => {
    const jobId = renderState.jobId;
    if (!jobId) return;
    setRenderState((current) => ({ ...current, status: 'cancelling' }));
    try {
      const response = await fetch(`/api/render/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '無法取消輸出');
    } catch (err) {
      setRenderState((current) => ({
        ...current,
        status: 'error',
        active: false,
        error: err instanceof Error ? err.message : '無法取消輸出',
      }));
    }
  };

  const requestPreviewStills = () => {
    if (!project.technicalTermsWhitelist?.reviewedAt) {
      setPendingTechnicalTermsAction({ type: 'stills' });
      setIsTechnicalTermsOpen(true);
      return;
    }
    void executePreviewStills(project);
  };

  const approveTechnicalTerms = (terms: string[], generatedAt: string) => {
    const nextProject: TrainingProject = {
      ...project,
      technicalTermsWhitelist: {
        terms,
        generatedAt,
        reviewedAt: new Date().toISOString(),
      },
    };
    setProject(nextProject);
    void saveProjectToDisk(nextProject, false);
    setIsTechnicalTermsOpen(false);
    const pending = pendingTechnicalTermsAction;
    setPendingTechnicalTermsAction(null);
    if (pending?.type === 'render') {
      void executeRender(pending.previewOnlySceneIndex, nextProject);
    } else if (pending?.type === 'stills') {
      void executePreviewStills(nextProject);
    }
  };

  const isExactTargetDuration = totalSeconds === project.targetDurationSeconds;

  // Flush the debounced auto-save so reopening the project from disk shows the latest edits.
  const goToDashboard = async () => {
    if (view === 'editor' && isCurrentProjectSaved) {
      await saveProjectToDisk(project, false);
    }
    setView('dashboard');
    void fetchSavedProjects();
  };

  const openPlayerMode = async (projectId?: string) => {
    if (view === 'editor' && isCurrentProjectSaved) {
      await saveProjectToDisk(project, false);
    }
    setPlayerInitialProjectId(projectId ?? null);
    setView('player');
    void fetchSavedProjects();
  };

  const wizardModal = (
    <SourceWizardModal
      isOpen={isWizardOpen}
      onClose={() => setIsWizardOpen(false)}
      initialLlmConfig={project.llmConfig}
      onProjectCreated={async (created, notice) => {
        const newProj = applyTtsSettings(created, loadTtsSettings(), { preserveCustomVoice: true });
        await saveProjectToDisk(newProj, false, true);
        setProject(newProj);
        setSelectedSceneIdx(0);
        if (notice) setAiNotice(notice);
        playerRef.current?.seekTo(0);
        setView('editor');
      }}
    />
  );

  if (view === 'dashboard') {
    return (
      <>
        <ProjectDashboard
          projects={savedProjects}
          loading={savedProjectsLoading}
          onRefresh={() => void fetchSavedProjects()}
          onOpenProject={handleSelectSavedProject}
          onOpenPlayer={(projectId) => void openPlayerMode(projectId)}
          onDeleteProject={handleDeleteSavedProject}
          onCreateWithAi={() => setIsWizardOpen(true)}
        />
        {aiNotice && (
          <div
            role="status"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-lg px-4 py-2 rounded-lg bg-cyan-950 border border-cyan-500/40 text-xs text-cyan-200 flex items-center gap-3 shadow-xl"
          >
            <span className="break-all">{aiNotice}</span>
            <button
              type="button"
              onClick={() => setAiNotice(null)}
              className="px-1 rounded text-cyan-400 hover:text-white shrink-0"
            >
              關閉
            </button>
          </div>
        )}
        {wizardModal}
      </>
    );
  }

  if (view === 'player') {
    return (
      <VideoPlayerMode
        projects={savedProjects}
        loading={savedProjectsLoading}
        initialProjectId={playerInitialProjectId}
        onRefresh={() => void fetchSavedProjects()}
        onBackToDashboard={() => void goToDashboard()}
        onEditProject={handleSelectSavedProject}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0E0D0C] text-slate-100 overflow-hidden select-none">
      {/* Top Studio Header */}
      <header className="h-14 shrink-0 border-b border-slate-800/90 bg-[#151310] px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => void goToDashboard()}
            title="回到專案總覽，選擇其他專案編輯"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition shrink-0"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
            專案總覽
          </button>
          <button
            type="button"
            onClick={() => void openPlayerMode(isCurrentProjectSaved ? project.id : undefined)}
            title="切換至播放器模式，播放所有草稿與已輸出影片"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition shrink-0"
          >
            <Tv className="w-3.5 h-3.5 text-cyan-400" />
            播放器
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Film className="w-4 h-4 text-slate-950" />
          </div>
          <div className="min-w-0">
            <input
              type="text"
              aria-label="專案標題"
              value={project.title}
              onChange={(e) => setProject((p) => ({ ...p, title: e.target.value }))}
              className="bg-transparent text-sm font-bold text-white focus:outline-none focus:border-b focus:border-cyan-400 w-72 lg:w-96 truncate"
            />
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>Remotion 4.0 • 1920×1080 @ 30fps</span>
              <span>•</span>
              <span className="text-cyan-400 font-medium">{DOMAIN_META[project.domain].shortLabel}</span>
            </div>
          </div>
        </div>

        {/* Center Domain Quick Switcher */}
        <div className="hidden xl:flex items-center gap-2">
          {(Object.keys(DOMAIN_META) as TechDomain[]).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={project.domain === d}
              onClick={() => handleDomainSwitch(d)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                project.domain === d
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              {DOMAIN_META[d].shortLabel}
            </button>
          ))}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2.5">
          {/* Target Duration Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold tabular-nums ${
              isExactTargetDuration
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>
              {formatDuration(totalSeconds)} / {formatDuration(project.targetDurationSeconds)}
            </span>
          </div>

          <SavedProjectsMenu
            projects={savedProjects}
            loading={savedProjectsLoading}
            currentProjectId={project.id}
            onRefresh={() => void fetchSavedProjects()}
            onSelectProject={handleSelectSavedProject}
            onDeleteProject={handleDeleteSavedProject}
          />

          <button
            onClick={() => {
              deletedProjectIdsRef.current.delete(project.id);
              void saveProjectToDisk(project, true);
            }}
            disabled={savingProject}
            title="手動儲存目前專案至草稿庫"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {savingProject ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            ) : (
              <Save className="w-3.5 h-3.5 text-cyan-400" />
            )}
            儲存
          </button>

          <button
            onClick={() => setIsWizardOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
          >
            <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
            AI 主題生成 / 匯入
          </button>

          <button
            type="button"
            onClick={undoAiChange}
            disabled={projectHistory.length === 0 || sceneAiLoading !== null}
            title="還原最近一次 AI 場景更新"
            aria-label="還原最近一次 AI 場景更新"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition disabled:opacity-40"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsAiPipelineOpen(true)}
            title="檢視由主題到 Remotion JSON 的完整 AI 製作階段"
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
          >
            <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
            製作流程
          </button>

          <button
            type="button"
            onClick={() => {
              setPendingTechnicalTermsAction(null);
              setIsTechnicalTermsOpen(true);
            }}
            title="產生、稽核並編輯輸出時允許強調的技術術語"
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
          >
            <Tag className="w-3.5 h-3.5 text-cyan-400" />
            術語白名單
            <span className="text-[10px] text-slate-400">{project.technicalTermsWhitelist?.terms.length ?? 0}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsScriptReviewOpen(true)}
            title="檢視所有場景的標題、要點與旁白腳本，供配音前審閱"
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            檢視腳本
          </button>

          <button
            onClick={synthesizeAllScenes}
            disabled={isTtsRendering}
            className="px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-xs font-semibold text-indigo-200 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {isTtsRendering ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
            {isTtsRendering
              ? `配音中 (${readyTtsCount}/${project.scenes.length})`
              : readyTtsCount === project.scenes.length
              ? `語音就緒 (${readyTtsCount}/${project.scenes.length})`
              : `全部配音 (${readyTtsCount}/${project.scenes.length})`}
          </button>

          <button
            type="button"
            onClick={() => setQualityModal({ open: true, tab: 'quality' })}
            title="檢視專案品質檢查報告與逐場景靜態預覽"
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
              qualityReport.errorCount > 0
                ? 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/40 text-rose-200'
                : qualityReport.warningCount > 0
                ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-200'
                : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {qualityReport.errorCount > 0 || qualityReport.warningCount > 0 ? (
              <ShieldAlert className="w-3.5 h-3.5" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            品質
            {qualityReport.errorCount > 0
              ? ` (${qualityReport.errorCount}錯)`
              : qualityReport.warningCount > 0
              ? ` (${qualityReport.warningCount}警)`
              : ' OK'}
          </button>

          <button
            type="button"
            onClick={() => void downloadProjectPackage()}
            disabled={exportingPackage || project.scenes.length === 0}
            title="匯出可編輯專案、字幕、來源中繼資料與可用的最新 MP4"
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {exportingPackage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            專案包 ZIP
          </button>

          <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900/70">
            <button
              type="button"
              onClick={() => downloadCaptions('srt')}
              disabled={project.scenes.length === 0}
              title="下載 SubRip 字幕"
              className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white disabled:opacity-50"
            >
              SRT
            </button>
            <span className="h-4 w-px bg-slate-700" />
            <button
              type="button"
              onClick={() => downloadCaptions('vtt')}
              disabled={project.scenes.length === 0}
              title="下載 WebVTT 字幕"
              className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white disabled:opacity-50"
            >
              VTT
            </button>
          </div>

          <button
            onClick={() => requestRender(selectedSceneIdx)}
            disabled={renderState.active || isSelectedSceneTtsRendering}
            title={
              isSelectedSceneTtsRendering
                ? '此場景 TTS 語音尚在生成中，等待配音加入完成後即可輸出'
                : '快速輸出當前選取場景為 MP4 預覽'
            }
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {isSelectedSceneTtsRendering ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
            )}
            {isSelectedSceneTtsRendering ? '等待此幕 TTS' : '輸出單幕預覽'}
          </button>

          <button
            onClick={() => requestRender(undefined)}
            disabled={renderState.active || isTtsRendering}
            title={
              isTtsRendering
                ? 'TTS 語音尚在生成中，影片正等待語音加入完成後再輸出'
                : `輸出完整 ${formatDuration(totalSeconds)} MP4 影片`
            }
            className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {renderState.active ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                輸出中 {renderState.progress}%
              </>
            ) : isTtsRendering ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                等待 TTS 配音 ({readyTtsCount}/{project.scenes.length})
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                輸出 {formatDuration(totalSeconds)} MP4
              </>
            )}
          </button>
        </div>
      </header>

      {/* AI Notice Banner */}
      {aiNotice && (
        <div
          role="status"
          className="px-4 py-1.5 bg-cyan-950/60 border-b border-cyan-500/30 flex items-center justify-between gap-3 text-xs text-cyan-200"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="break-all select-text">{aiNotice}</span>
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setAiNotice(null)}
              className="px-1 rounded text-cyan-400 hover:text-white"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {/* TTS Rendering Status Banner */}
      {isTtsRendering && (
        <TtsProgressPanel
          scenes={project.scenes}
          readyCount={readyTtsCount}
          activeGeneratingScene={activeGeneratingScene}
          stage={resolvedTtsStage}
          metrics={ttsProgressMetrics}
          currentSceneElapsedSec={ttsElapsedSec}
          batchElapsedSec={ttsBatchElapsedSec}
          serverAlive={ttsServerAlive}
          customVoiceName={project.ttsConfig.customVoice?.name}
          canSwitchToFastTts={project.scenes.some(
            (s) =>
              (s.tts.status !== 'ready' || !s.tts.audioUrl) &&
              s.tts.provider !== 'browser-fallback'
          )}
          onSwitchToFastTts={switchRemainingToFastTts}
          onStop={stopTtsGeneration}
          onJumpToScene={jumpToScene}
        />
      )}

      {/* Render Status Banner */}
      {(renderState.active || renderState.outputUrl || renderState.error) && (
        <div
          role={renderState.error ? 'alert' : 'status'}
          className="px-4 py-2 bg-[#1A1713] border-b border-slate-800 flex items-center justify-between text-xs"
        >
          {renderState.active && (
            <div className="flex items-center gap-3 w-full">
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
              <span className="text-slate-200 font-medium">
                Remotion 正在
                {renderState.status === 'bundling'
                  ? '打包專案'
                  : renderState.status === 'qa'
                  ? '執行音訊品質驗證 (Audio QA)'
                  : '算圖編碼 H.264 MP4'}
                ... ({renderState.progress}%)
              </span>
              <div
                role="progressbar"
                aria-label="輸出進度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={renderState.progress}
                className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden max-w-md"
              >
                <div
                  className="h-full bg-cyan-400 transition-all duration-300"
                  style={{ width: `${renderState.progress}%` }}
                />
              </div>
              <button
                type="button"
                onClick={() => void cancelActiveRender()}
                disabled={renderState.status === 'cancelling'}
                className="ml-3 shrink-0 rounded-lg border border-rose-500/40 bg-rose-950/30 px-2.5 py-1.5 text-[11px] font-semibold text-rose-200 hover:bg-rose-900/40 disabled:opacity-50"
              >
                {renderState.status === 'cancelling' ? '停止中...' : '停止輸出'}
              </button>
            </div>
          )}
          {renderState.outputUrl && !renderState.active && (
            <div className="flex items-center justify-between w-full gap-3 text-emerald-300">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex items-center gap-2 font-semibold shrink-0">
                  <CheckCircle2 className="w-4 h-4" /> Remotion MP4 輸出完成！
                </span>
                {renderState.mediaQa && (
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-medium truncate ${
                      renderState.mediaQa.passed
                        ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                    }`}
                  >
                    {renderState.mediaQa.summary}
                  </span>
                )}
              </div>
              <a
                href={renderState.outputUrl}
                download
                className="px-3 py-1 rounded bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition shrink-0"
              >
                下載 MP4 影片
              </a>
            </div>
          )}
          {renderState.error && (
            <div className="flex items-center justify-between gap-3 w-full text-rose-300 font-medium">
              <span className="break-all select-text">輸出錯誤：{renderState.error}</span>
            </div>
          )}
        </div>
      )}

      {/* Main 3-Pane Studio Workspace */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT PANE: Scene Outline */}
        <aside className="w-52 2xl:w-72 shrink-0 border-r border-slate-800/90 bg-[#131110] flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Layers className="w-4 h-4 text-cyan-400" />
              場景大綱 ({project.scenes.length})
            </div>
            <button
              type="button"
              onClick={handleAddScene}
              aria-label="新增場景"
              className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 transition"
              title="新增場景"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {project.scenes.map((scene, idx) => {
              const active = idx === selectedSceneIdx;
              return (
                <div
                  key={scene.id}
                  role="button"
                  tabIndex={0}
                  aria-current={active ? 'true' : undefined}
                  aria-label={`場景 ${idx + 1}：${scene.title}`}
                  onClick={() => jumpToScene(idx)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      jumpToScene(idx);
                    }
                  }}
                  className={`group p-3 rounded-xl border cursor-pointer transition ${
                    active
                      ? 'bg-cyan-500/10 border-cyan-400/70 shadow-sm'
                      : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[11px] font-bold font-mono text-cyan-400">
                      SCENE {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {scene.tts.status === 'generating' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[10px] font-semibold text-amber-200 font-mono tabular-nums">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          配音中 {formatDuration(ttsElapsedSec)}
                        </span>
                      )}
                      {batchTtsRunning &&
                        scene.tts.status === 'idle' &&
                        !scene.tts.audioUrl && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-[10px] text-slate-400">
                            排隊中
                          </span>
                        )}
                      <span
                        className={`w-2 h-2 rounded-full ${
                          scene.tts.status === 'ready'
                            ? 'bg-emerald-400'
                            : scene.tts.status === 'generating'
                            ? 'bg-amber-400 animate-pulse'
                            : scene.tts.status === 'error'
                            ? 'bg-rose-400'
                            : 'bg-slate-600'
                        }`}
                        title={`TTS 狀態: ${scene.tts.status}`}
                      />
                      <span className="text-[11px] font-mono text-slate-400">
                        {scene.durationSeconds}s
                      </span>
                      {project.scenes.length > 2 && (
                        <button
                          type="button"
                          aria-label={`刪除場景 ${idx + 1}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteScene(idx);
                          }}
                          className="p-1 -m-1 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-slate-400 hover:text-rose-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-slate-100 line-clamp-2">
                    {scene.title}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{TEMPLATE_LABELS[scene.template]}</span>
                    <span>{scene.tts.provider === 'ming-3.0' ? 'Ming-3.0' : 'OpenFormosa'}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t border-slate-800/80 bg-[#0C0B0A]">
            <button
              onClick={handleAutoBalance}
              className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              自動平衡總長至 {formatDuration(project.targetDurationSeconds)} ({project.targetDurationSeconds}s)
            </button>
          </div>
        </aside>

        {/* CENTER PANE: Remotion Live Player + Timeline */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#0A0908]">
          {/* Video Title & Playback Context Bar */}
          <div className="shrink-0 px-5 py-2.5 border-b border-slate-800/80 bg-[#100F0D] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Film className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h2
                    className="text-sm font-bold text-white truncate select-text"
                    title={project.title}
                  >
                    {project.title}
                  </h2>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0 hidden sm:inline">
                    {project.id}
                  </span>
                </div>
                {selectedScene && (
                  <p className="text-[11px] text-slate-400 truncate">
                    S{selectedSceneIdx + 1}/{project.scenes.length} · {selectedScene.title}
                    {project.ttsConfig.customVoice?.name
                      ? ` · 聲線：${project.ttsConfig.customVoice.name}`
                      : ''}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isTtsRendering ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-[11px] font-semibold text-amber-200">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  等待 TTS 語音加入 ({readyTtsCount}/{project.scenes.length})
                </span>
              ) : readyTtsCount === project.scenes.length ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300">
                  <Volume2 className="w-3 h-3" />
                  配音 {readyTtsCount}/{project.scenes.length} 就緒
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] font-semibold text-amber-200">
                  <Volume2 className="w-3 h-3" />
                  配音 {readyTtsCount}/{project.scenes.length}（其餘場景尚未配音）
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center p-5 min-h-0">
            <div
              className="relative w-full max-w-5xl rounded-xl overflow-hidden border border-slate-800 shadow-2xl bg-black"
              style={{ aspectRatio: '16 / 9', maxHeight: '100%', minHeight: 0 }}
            >
              <Player
                ref={playerRef}
                component={TechTrainingVideo as unknown as React.FC<Record<string, unknown>>}
                inputProps={{
                  projectTitle: project.title,
                  scenes: project.scenes,
                  audioBaseUrl: '',
                  captionStyle: project.captionStyle,
                  videoTheme: project.videoTheme,
                  backgroundMusic: project.backgroundMusic,
                  technicalTermsWhitelist: project.technicalTermsWhitelist?.terms ?? [],
                }}
                durationInFrames={totalFrames}
                fps={VIDEO_FPS}
                compositionWidth={1920}
                compositionHeight={1080}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                controls={false}
                clickToPlay
                bufferStateDelayInMilliseconds={250}
                defaultPremountInSeconds={2}
                showPosterWhenBuffering
              />
              {isTtsRendering && (
                <div
                  role="status"
                  aria-live="polite"
                  className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-10 max-w-[92%] px-3.5 py-2 rounded-full bg-slate-950/90 backdrop-blur-md border border-amber-400/50 shadow-lg flex items-center gap-2 text-xs text-amber-100"
                >
                  <Loader2 className="w-3.5 h-3.5 text-amber-300 animate-spin shrink-0" />
                  <span className="font-semibold truncate">
                    {activeGeneratingScene ? `S${activeGeneratingScene.idx + 1} ` : ''}
                    {resolvedTtsStage.label}
                  </span>
                  <span className="font-mono text-[11px] text-amber-300 tabular-nums shrink-0">
                    {formatDuration(ttsElapsedSec)} · {ttsProgressMetrics.overallPct}% ({readyTtsCount}/{project.scenes.length})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Master Interactive Scene Timeline */}
          <div className="h-28 shrink-0 border-t border-slate-800/90 bg-[#100F0D] px-5 py-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300">
                {formatDuration(totalSeconds)} MASTER TIMELINE ({totalFrames.toLocaleString()} frames @ 30fps)
              </span>
              <span>點擊色塊可立即跳轉至該場景預覽</span>
            </div>
            <div className="flex h-11 gap-1 w-full rounded-lg overflow-hidden bg-slate-950 p-1 border border-slate-800">
              {project.scenes.map((s, idx) => {
                const widthPct = (s.durationSeconds / Math.max(1, totalSeconds)) * 100;
                const active = idx === playbackSceneIdx;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    aria-label={`跳轉至場景 ${idx + 1}：${s.title}（${s.durationSeconds} 秒）`}
                    onClick={() => jumpToScene(idx)}
                    title={`S${idx + 1}: ${s.title} (${s.durationSeconds}s)`}
                    style={{ width: `${widthPct}%` }}
                    className={`h-full min-w-[3px] rounded-sm px-0.5 flex flex-col justify-center text-left transition overflow-hidden ${
                      active
                        ? 'bg-cyan-400 text-slate-950'
                        : 'bg-slate-800/80 hover:bg-cyan-500/40 text-slate-300'
                    }`}
                  >
                    {project.scenes.length <= 24 && (
                      <>
                        <span className="text-[10px] font-bold truncate">S{idx + 1}: {s.title}</span>
                        <span
                          className={`text-[10px] font-mono ${active ? 'text-slate-800' : 'text-slate-400'}`}
                        >
                          {s.durationSeconds}s
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </main>

        {/* RIGHT PANE: Script, TTS & Motion Inspector */}
        <aside className="w-64 2xl:w-96 shrink-0 border-l border-slate-800/90 bg-[#131110] flex flex-col">
          {/* Inspector Tabs */}
          <div role="tablist" aria-label="場景編輯面板" className="grid grid-cols-3 border-b border-slate-800/90 bg-[#1A1713]">
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'script-tts'}
              onClick={() => setInspectorTab('script-tts')}
              className={`py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition ${
                inspectorTab === 'script-tts'
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Mic className="w-3.5 h-3.5" /> 腳本與 TTS
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'motion-visual'}
              onClick={() => setInspectorTab('motion-visual')}
              className={`py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition ${
                inspectorTab === 'motion-visual'
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" /> 動畫視覺
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'engine-config'}
              onClick={() => setInspectorTab('engine-config')}
              className={`py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition ${
                inspectorTab === 'engine-config'
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Settings className="w-3.5 h-3.5" /> TTS 設定
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {inspectorTab === 'script-tts' && selectedScene && (
              <>
                <div>
                  <label htmlFor="scene-title" className="block text-[11px] font-semibold text-slate-400 mb-1">
                    場景標題
                  </label>
                  <input
                    id="scene-title"
                    type="text"
                    value={selectedScene.title}
                    onChange={(e) => updateScene(selectedSceneIdx, { title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                    <label htmlFor="scene-duration" className="text-[11px] font-semibold text-slate-400">
                      場景秒數 (3–180秒)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        updateScene(selectedSceneIdx, {
                          durationSeconds: computeRichnessDuration(selectedScene),
                        })
                      }
                      className="text-[10px] text-cyan-400 hover:text-cyan-300"
                    >
                      依語音/內容重算
                    </button>
                  </div>
                  <input
                    id="scene-duration"
                    type="number"
                    min={3}
                    max={180}
                    value={selectedScene.durationSeconds}
                    onChange={(e) =>
                      updateScene(selectedSceneIdx, {
                        durationSeconds: Math.min(180, Math.max(3, Number(e.target.value) || 3)),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                  {selectedScene.tts.actualDurationSec ? (
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span
                        className={
                          selectedScene.durationSeconds < selectedScene.tts.actualDurationSec
                            ? 'text-amber-400 font-semibold'
                            : 'text-emerald-400'
                        }
                      >
                        語音實測: {selectedScene.tts.actualDurationSec.toFixed(1)}s
                        {selectedScene.durationSeconds < selectedScene.tts.actualDurationSec
                          ? ' (會截斷!)'
                          : ''}
                      </span>
                      {selectedScene.durationSeconds < selectedScene.tts.actualDurationSec && (
                        <button
                          type="button"
                          onClick={() =>
                            updateScene(selectedSceneIdx, {
                              durationSeconds: Math.max(
                                3,
                                Math.ceil((selectedScene.tts.actualDurationSec || 3) + 0.5)
                              ),
                            })
                          }
                          className="text-amber-300 underline hover:text-white"
                        >
                          對齊
                        </button>
                      )}
                    </div>
                  ) : null}
                  </div>
                  <div>
                    <label htmlFor="scene-tts-provider" className="block text-[11px] font-semibold text-slate-400 mb-1">
                      TTS 語音模型
                    </label>
                    <div className="flex gap-1.5">
                      <select
                        id="scene-tts-provider"
                        value={selectedScene.tts.provider}
                        onChange={(e) =>
                          updateScene(selectedSceneIdx, {
                            tts: { ...selectedScene.tts, provider: e.target.value as TtsProvider },
                          })
                        }
                        className="min-w-0 flex-1 px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                      >
                        <option value="openformosa">OpenFormosa (預設)</option>
                        <option value="ming-3.0">Ming-3.0-TTS (預設)</option>
                        <option value="browser-fallback">瀏覽器即時試聽</option>
                      </select>
                      <input
                        ref={voiceFileInputRef}
                        type="file"
                        accept=".wav,.mp3,.m4a,.ogg,.webm,audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) void uploadVoiceSample(f);
                        }}
                      />
                      {voiceRecorderOpen && (
                        <VoiceRecorderModal
                          language={project.language || DEFAULT_CONTENT_LANGUAGE}
                          initialProvider={
                            selectedScene.tts.provider === 'ming-3.0' ? 'ming-3.0' : 'openformosa'
                          }
                          uploading={voiceUploading}
                          serverError={voiceError}
                          onClose={() => setVoiceRecorderOpen(false)}
                          onUseRecording={async (sub: RecordedVoiceSubmission) => {
                            if (
                              await uploadVoiceSample(sub.file, {
                                name: sub.name,
                                provider: sub.provider,
                                trainNow: sub.trainNow,
                                referenceText: sub.referenceText,
                              })
                            ) {
                              setVoiceRecorderOpen(false);
                            }
                          }}
                          onPickFile={() => {
                            setVoiceRecorderOpen(false);
                            voiceFileInputRef.current?.click();
                          }}
                        />
                      )}
                      <button
                        type="button"
                        disabled={voiceUploading}
                        onClick={() => {
                          setVoiceError(null);
                          setVoiceRecorderOpen(true);
                        }}
                        title={
                          project.ttsConfig.customVoice
                            ? `自訂聲線：${project.ttsConfig.customVoice.name}（點擊重新錄製或上傳）`
                            : '錄製或上傳約 10 秒的人聲以自訂 TTS 聲線'
                        }
                        aria-label="錄製或上傳自訂聲線"
                        className={`shrink-0 px-2 rounded-lg border transition disabled:opacity-50 ${
                          project.ttsConfig.customVoice
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-400 hover:text-cyan-300'
                        }`}
                      >
                        {voiceUploading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Mic className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    {(voiceProfiles.length > 0 || project.ttsConfig.customVoice) && (
                      <div className="mt-1.5">
                        <label htmlFor="scene-voice-profile" className="sr-only">自訂聲線</label>
                        <select
                          id="scene-voice-profile"
                          value={project.ttsConfig.customVoice?.fileName ?? ''}
                          onChange={(e) => {
                            const picked = voiceProfiles.find((p) => p.fileName === e.target.value);
                            setCustomVoice(picked ? toCustomVoice(picked) : undefined);
                          }}
                          className="w-full px-2 py-1 rounded-md bg-slate-900 border border-slate-700 text-[11px] text-cyan-200 focus:outline-none focus:border-cyan-400"
                        >
                          <option value="">不使用自訂聲線</option>
                          {project.ttsConfig.customVoice &&
                            !voiceProfiles.some((p) => p.fileName === project.ttsConfig.customVoice?.fileName) && (
                              <option value={project.ttsConfig.customVoice.fileName}>
                                {project.ttsConfig.customVoice.name}
                              </option>
                            )}
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
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="scene-script" className="text-[11px] font-semibold text-slate-400">
                      TTS 旁白講稿 ({selectedScene.script.length} 字)
                    </label>
                    <button
                      type="button"
                      onClick={() => previewBrowserSpeech(selectedScene.script)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      <Volume2 className="w-3 h-3" /> 瀏覽器試聽
                    </button>
                  </div>
                  <textarea
                    id="scene-script"
                    rows={6}
                    value={selectedScene.script}
                    onChange={(e) => updateScene(selectedSceneIdx, { script: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 leading-relaxed focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPendingTechnicalTermsAction(null);
                      setIsTechnicalTermsOpen(true);
                    }}
                    className={`mt-2 w-full py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      project.technicalTermsWhitelist?.reviewedAt
                        ? 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/35 text-cyan-200'
                        : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/35 text-amber-200'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    編輯技術術語白名單
                    <span className="text-[10px] opacity-80">
                      {project.technicalTermsWhitelist?.reviewedAt
                        ? `(${project.technicalTermsWhitelist.terms.length} 項已核准)`
                        : '（需重新審核）'}
                    </span>
                  </button>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      type="button"
                      disabled={sceneAiLoading !== null}
                      onClick={() => regenerateSceneWithAi(selectedSceneIdx, 'sync-visual-to-script')}
                      className="py-1.5 px-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-[11px] font-semibold text-indigo-200 flex items-center justify-center gap-1 transition disabled:opacity-50"
                      title="根據目前修改的台詞，自動更新 Remotion 畫面模板、圖表與動畫特效"
                    >
                      {sceneAiLoading === 'sync-visual-to-script' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Wand2 className="w-3 h-3" />
                      )}
                      依台詞匹配畫面特效
                    </button>
                    <button
                      type="button"
                      disabled={sceneAiLoading !== null}
                      onClick={() => regenerateSceneWithAi(selectedSceneIdx, 'rewrite-script-no-read')}
                      className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold text-slate-200 flex items-center justify-center gap-1 transition disabled:opacity-50"
                      title="改寫台詞為口語因果解說，避免只是照唸畫面文字"
                    >
                      {sceneAiLoading === 'rewrite-script-no-read' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3 text-cyan-400" />
                      )}
                      改寫台詞(不照唸畫面)
                    </button>
                  </div>
                  {selectedScene.visualDescription && (
                    <div className="mt-2 px-2.5 py-1.5 rounded bg-slate-900/80 border border-slate-800 text-[10px] text-slate-400 leading-snug">
                      <span className="text-cyan-400 font-semibold">畫面對應：</span>
                      {selectedScene.visualDescription}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="scene-voice" className="block text-[11px] font-semibold text-slate-400 mb-1">
                      語音聲線 / Speaker
                    </label>
                    <input
                      id="scene-voice"
                      type="text"
                      value={selectedScene.tts.voiceId}
                      onChange={(e) =>
                        updateScene(selectedSceneIdx, {
                          tts: { ...selectedScene.tts, voiceId: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="scene-speed" className="block text-[11px] font-semibold text-slate-400 mb-1">
                      語速 ({selectedScene.tts.speed.toFixed(1)}x)
                    </label>
                    <input
                      id="scene-speed"
                      type="range"
                      min={0.7}
                      max={1.4}
                      step={0.1}
                      value={selectedScene.tts.speed}
                      onChange={(e) =>
                        updateScene(selectedSceneIdx, {
                          tts: { ...selectedScene.tts, speed: parseFloat(e.target.value) },
                        })
                      }
                      className="w-full mt-2 accent-cyan-400"
                    />
                  </div>
                </div>

                <button
                  onClick={() => synthesizeSceneTts(selectedSceneIdx)}
                  disabled={selectedScene.tts.status === 'generating'}
                  className="w-full py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  {selectedScene.tts.status === 'generating' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> 合成語音中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" /> 生成此場景 TTS 音軌
                    </>
                  )}
                </button>

                {selectedScene.tts.status === 'generating' && (
                  <div
                    role="status"
                    className="p-3 rounded-xl bg-amber-950/35 border border-amber-500/40 space-y-1"
                  >
                    <div className="text-[11px] font-semibold text-amber-200 flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      正在生成此場景 TTS 語音...
                    </div>
                    <p className="text-[11px] text-amber-200/80 leading-snug">
                      影片正等待語音合成完成後自動加入音軌並對齊場景時長，完成前此幕預覽暫無旁白。
                    </p>
                  </div>
                )}

                {selectedScene.tts.audioUrl && selectedScene.tts.status !== 'generating' && (
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                    <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 音軌已綁定至 Remotion &lt;Audio&gt;
                    </div>
                    <audio controls src={selectedScene.tts.audioUrl} className="w-full h-8" />
                    {selectedScene.tts.error && (
                      <div className="text-[10px] text-amber-300/90 leading-snug">
                        {selectedScene.tts.error}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {inspectorTab === 'motion-visual' && selectedScene && (
              <>
                <section className="rounded-lg border border-cyan-500/25 bg-cyan-500/[0.04] p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-200">
                        <Sliders className="w-3.5 h-3.5" /> 全片字幕樣式
                      </div>
                      <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                        變更會套用到所有場景並立即更新預覽。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProject((prev) => ({ ...prev, captionStyle: undefined }))}
                      className="text-[10px] font-semibold text-slate-400 hover:text-white transition"
                    >
                      重設
                    </button>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-300">
                      字幕大小
                      <output className="font-mono text-cyan-300">{project.captionStyle?.fontSize ?? 36}px</output>
                    </span>
                    <input
                      type="range"
                      min={24}
                      max={64}
                      step={1}
                      value={project.captionStyle?.fontSize ?? 36}
                      onChange={(e) => updateCaptionStyle({ fontSize: Number(e.target.value) })}
                      className="w-full accent-cyan-400"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2.5">
                    <label>
                      <span className="block text-[10px] font-semibold text-slate-400 mb-1">字重</span>
                      <select
                        value={project.captionStyle?.fontWeight ?? 600}
                        onChange={(e) => updateCaptionStyle({ fontWeight: Number(e.target.value) as VideoCaptionStyle['fontWeight'] })}
                        className="w-full px-2.5 py-2 rounded-md bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                      >
                        <option value={400}>Regular</option>
                        <option value={500}>Medium</option>
                        <option value={600}>Semibold</option>
                        <option value={700}>Bold</option>
                        <option value={800}>Extra bold</option>
                      </select>
                    </label>
                    <label>
                      <span className="block text-[10px] font-semibold text-slate-400 mb-1">底部距離</span>
                      <div className="flex items-center gap-2 rounded-md bg-slate-900 border border-slate-700 px-2.5">
                        <input
                          type="number"
                          min={20}
                          max={180}
                          value={project.captionStyle?.bottomOffset ?? 36}
                          onChange={(e) => updateCaptionStyle({ bottomOffset: Number(e.target.value) })}
                          className="min-w-0 w-full py-2 bg-transparent text-xs font-mono text-white focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-500">px</span>
                      </div>
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-300">
                      字幕寬度
                      <output className="font-mono text-cyan-300">{project.captionStyle?.maxWidth ?? 1480}px</output>
                    </span>
                    <input
                      type="range"
                      min={720}
                      max={1800}
                      step={20}
                      value={project.captionStyle?.maxWidth ?? 1480}
                      onChange={(e) => updateCaptionStyle({ maxWidth: Number(e.target.value) })}
                      className="w-full accent-cyan-400"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-300">
                      背景不透明度
                      <output className="font-mono text-cyan-300">{Math.round((project.captionStyle?.backgroundOpacity ?? 0.9) * 100)}%</output>
                    </span>
                    <input
                      type="range"
                      min={45}
                      max={100}
                      step={1}
                      value={Math.round((project.captionStyle?.backgroundOpacity ?? 0.9) * 100)}
                      onChange={(e) => updateCaptionStyle({ backgroundOpacity: Number(e.target.value) / 100 })}
                      className="w-full accent-cyan-400"
                    />
                  </label>
                </section>

                <div>
                  <label htmlFor="scene-template" className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Remotion 動態視覺模板
                  </label>
                  <select
                    id="scene-template"
                    value={selectedScene.template}
                    onChange={(e) => {
                      const nextTpl = e.target.value as VisualTemplate;
                      updateScene(selectedSceneIdx, {
                        template: nextTpl,
                        diagramData: getDefaultDiagramData(selectedScene.domain, nextTpl),
                      });
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                  >
                    {(Object.keys(TEMPLATE_LABELS) as VisualTemplate[]).map((tpl) => (
                      <option key={tpl} value={tpl}>
                        {TEMPLATE_LABELS[tpl]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="scene-motion" className="block text-[11px] font-semibold text-slate-400 mb-1">
                    動態物理曲線 (Spring Motion)
                  </label>
                  <select
                    id="scene-motion"
                    value={selectedScene.animation.motionStyle}
                    onChange={(e) =>
                      updateScene(selectedSceneIdx, {
                        animation: {
                          ...selectedScene.animation,
                          motionStyle: e.target.value as MotionStyle,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="spring-snappy">Spring Snappy (工程簡報俐落彈入)</option>
                    <option value="smooth-sweep">Smooth Sweep (平滑掃描過渡)</option>
                    <option value="step-reveal">Step Reveal (逐項拆解顯示)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="scene-effect" className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Remotion 動態特效 (配合台詞情境)
                  </label>
                  <select
                    id="scene-effect"
                    value={selectedScene.animation.effect || 'signal-pulse'}
                    onChange={(e) =>
                      updateScene(selectedSceneIdx, {
                        animation: {
                          ...selectedScene.animation,
                          effect: e.target.value as RemotionEffect,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                  >
                    {(Object.keys(EFFECT_LABELS) as RemotionEffect[]).map((eff) => (
                      <option key={eff} value={eff}>
                        {EFFECT_LABELS[eff]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="scene-visual-desc" className="block text-[11px] font-semibold text-slate-400 mb-1">
                    畫面設計與台詞對應說明
                  </label>
                  <input
                    id="scene-visual-desc"
                    type="text"
                    value={selectedScene.visualDescription || ''}
                    onChange={(e) =>
                      updateScene(selectedSceneIdx, { visualDescription: e.target.value })
                    }
                    placeholder="說明 Remotion 畫面與特效如何呼應旁白台詞"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label htmlFor="scene-keypoints" className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                    畫面精簡關鍵字 (僅視覺錨點，不與台詞重複)
                  </label>
                  <textarea
                    id="scene-keypoints"
                    rows={4}
                    value={selectedScene.keyPoints.join('\n')}
                    onChange={(e) =>
                      updateScene(selectedSceneIdx, {
                        keyPoints: e.target.value.split('\n').filter((l) => l.trim().length > 0),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 leading-relaxed focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-xs text-slate-200">顯示底部同步字幕條</span>
                    <input
                      type="checkbox"
                      checked={selectedScene.animation.showSubtitles}
                      onChange={(e) =>
                        updateScene(selectedSceneIdx, {
                          animation: { ...selectedScene.animation, showSubtitles: e.target.checked },
                        })
                      }
                      className="accent-cyan-400"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-xs text-slate-200">顯示右上角工程進度 HUD</span>
                    <input
                      type="checkbox"
                      checked={selectedScene.animation.showProgressHud}
                      onChange={(e) =>
                        updateScene(selectedSceneIdx, {
                          animation: { ...selectedScene.animation, showProgressHud: e.target.checked },
                        })
                      }
                      className="accent-cyan-400"
                    />
                  </label>
                </div>
              </>
            )}

            {inspectorTab === 'engine-config' && (
              <div className="space-y-4">
                <section className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
                      <FileAudio className="w-4 h-4" /> 背景音樂
                    </div>
                    {project.backgroundMusic && (
                      <button
                        type="button"
                        onClick={() => setProject((current) => ({ ...current, backgroundMusic: undefined }))}
                        className="text-[10px] font-semibold text-slate-400 hover:text-rose-300"
                      >
                        移除
                      </button>
                    )}
                  </div>
                  <input
                    ref={musicFileInputRef}
                    type="file"
                    accept=".mp3,.wav,.m4a,.ogg,.aac,audio/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadBackgroundMusic(file);
                      event.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => musicFileInputRef.current?.click()}
                    disabled={musicUploading}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:border-amber-400/60 hover:text-white disabled:opacity-50"
                  >
                    {musicUploading ? '正在匯入音樂...' : project.backgroundMusic ? '更換音樂檔案' : '匯入本機音樂'}
                  </button>
                  {project.backgroundMusic && (
                    <>
                      <div className="truncate text-[11px] text-slate-300">{project.backgroundMusic.fileName}</div>
                      <audio controls src={project.backgroundMusic.url} className="h-8 w-full" />
                      <label className="block">
                        <span className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-400">
                          音量
                          <output className="font-mono text-amber-200">{Math.round(project.backgroundMusic.volume * 100)}%</output>
                        </span>
                        <input
                          type="range"
                          min={0.02}
                          max={0.4}
                          step={0.01}
                          value={project.backgroundMusic.volume}
                          onChange={(event) => setProject((current) => ({
                            ...current,
                            backgroundMusic: current.backgroundMusic
                              ? { ...current.backgroundMusic, volume: Number(event.target.value) }
                              : undefined,
                          }))}
                          className="w-full accent-amber-400"
                        />
                      </label>
                      <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-xs text-slate-300">
                        全片循環播放
                        <input
                          type="checkbox"
                          checked={project.backgroundMusic.loop}
                          onChange={(event) => setProject((current) => ({
                            ...current,
                            backgroundMusic: current.backgroundMusic
                              ? { ...current.backgroundMusic, loop: event.target.checked }
                              : undefined,
                          }))}
                          className="accent-amber-400"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[11px] font-semibold text-slate-400">授權來源 / 備註</span>
                        <textarea
                          rows={2}
                          value={project.backgroundMusic.licenseNote || ''}
                          onChange={(event) => setProject((current) => ({
                            ...current,
                            backgroundMusic: current.backgroundMusic
                              ? { ...current.backgroundMusic, licenseNote: event.target.value }
                              : undefined,
                          }))}
                          placeholder="例如：由使用者持有商用授權的音樂"
                          className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-amber-400 focus:outline-none"
                        />
                      </label>
                    </>
                  )}
                  {musicError && <div className="text-[11px] text-rose-300">{musicError}</div>}
                </section>

                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                      <Wand2 className="w-4 h-4" /> Intel GNAI LLM 引擎
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {project.llmConfig?.apiKey
                        ? '已儲存於本機'
                        : envLlmConfigured
                        ? '已由本機 .env 載入'
                        : '未設定 Token'}
                    </span>
                  </div>
                  <div>
                    <label htmlFor="cfg-llm-provider" className="block text-[11px] text-slate-400 mb-1">文字模型供應商</label>
                    <select
                      id="cfg-llm-provider"
                      value={project.llmConfig?.provider || 'openai-compatible'}
                      onChange={(event) => {
                        const provider = event.target.value as keyof typeof LLM_PROVIDER_PRESETS;
                        const next = {
                          ...LLM_PROVIDER_PRESETS[provider],
                          apiKey: project.llmConfig?.apiKey || '',
                        };
                        saveStoredLlmConfig(next);
                        setProject((current) => ({ ...current, llmConfig: next }));
                      }}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                    >
                      <option value="intel-gnai">Intel GNAI</option>
                      <option value="openai-compatible">OpenAI-compatible</option>
                      <option value="local">Local OpenAI-compatible</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="cfg-llm-url" className="block text-[11px] text-slate-400 mb-1">Base URL</label>
                    <input
                      id="cfg-llm-url"
                      type="text"
                      value={project.llmConfig?.baseUrl ?? DEFAULT_GNAI_CONFIG.baseUrl}
                      onChange={(e) => {
                        const next = {
                          provider: project.llmConfig?.provider || 'openai-compatible',
                          baseUrl: e.target.value,
                          apiKey: project.llmConfig?.apiKey || '',
                          model: project.llmConfig?.model || DEFAULT_GNAI_CONFIG.model,
                        };
                        saveStoredLlmConfig(next);
                        setProject((p) => ({ ...p, llmConfig: next }));
                      }}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="cfg-llm-token" className="block text-[11px] text-slate-400 mb-1">API Key (本機儲存)</label>
                      <input
                        id="cfg-llm-token"
                        type="password"
                        placeholder="貼上供應商 API Key"
                        value={project.llmConfig?.apiKey || ''}
                        onChange={(e) => {
                          const next = {
                            provider: project.llmConfig?.provider || 'openai-compatible',
                            baseUrl: project.llmConfig?.baseUrl || DEFAULT_GNAI_CONFIG.baseUrl,
                            apiKey: e.target.value,
                            model: project.llmConfig?.model || DEFAULT_GNAI_CONFIG.model,
                          };
                          saveStoredLlmConfig(next);
                          setProject((p) => ({ ...p, llmConfig: next }));
                        }}
                        className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="cfg-llm-model" className="block text-[11px] text-slate-400 mb-1">Model</label>
                      <input
                        id="cfg-llm-model"
                        type="text"
                        value={project.llmConfig?.model ?? DEFAULT_GNAI_CONFIG.model}
                        onChange={(e) => {
                          const next = {
                            provider: project.llmConfig?.provider || 'openai-compatible',
                            baseUrl: project.llmConfig?.baseUrl || DEFAULT_GNAI_CONFIG.baseUrl,
                            apiKey: project.llmConfig?.apiKey || '',
                            model: e.target.value,
                          };
                          saveStoredLlmConfig(next);
                          setProject((p) => ({ ...p, llmConfig: next }));
                        }}
                        className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                    <Sliders className="w-4 h-4" /> OpenFormosa TTS (openformosa.com)
                  </div>
                  <div>
                    <label htmlFor="cfg-of-endpoint" className="block text-[11px] text-slate-400 mb-1">API Endpoint</label>
                    <input
                      id="cfg-of-endpoint"
                      type="text"
                      value={project.ttsConfig.openformosa.baseUrl}
                      onChange={(e) =>
                        setProject((p) => ({
                          ...p,
                          ttsConfig: {
                            ...p.ttsConfig,
                            openformosa: { ...p.ttsConfig.openformosa, baseUrl: e.target.value },
                          },
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="cfg-of-key" className="block text-[11px] text-slate-400 mb-1">API Key</label>
                    <input
                      id="cfg-of-key"
                      type="password"
                      placeholder="填入 OpenFormosa API Key"
                      value={project.ttsConfig.openformosa.apiKey}
                      onChange={(e) =>
                        setProject((p) => ({
                          ...p,
                          ttsConfig: {
                            ...p.ttsConfig,
                            openformosa: { ...p.ttsConfig.openformosa, apiKey: e.target.value },
                          },
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                    <Cpu className="w-4 h-4" /> Ming-3.0-TTS (inclusionAI/Ming-3.0-tts)
                  </div>
                  <div>
                    <label htmlFor="cfg-ming-url" className="block text-[11px] text-slate-400 mb-1">推論伺服器 URL</label>
                    <input
                      id="cfg-ming-url"
                      type="text"
                      value={project.ttsConfig.mingTts.baseUrl}
                      onChange={(e) =>
                        setProject((p) => ({
                          ...p,
                          ttsConfig: {
                            ...p.ttsConfig,
                            mingTts: { ...p.ttsConfig.mingTts, baseUrl: e.target.value },
                          },
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="cfg-ming-speaker" className="block text-[11px] text-slate-400 mb-1">Speaker / Style</label>
                    <input
                      id="cfg-ming-speaker"
                      type="text"
                      value={project.ttsConfig.mingTts.speaker}
                      onChange={(e) =>
                        setProject((p) => ({
                          ...p,
                          ttsConfig: {
                            ...p.ttsConfig,
                            mingTts: { ...p.ttsConfig.mingTts, speaker: e.target.value },
                          },
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-900/50 p-3 rounded-lg border border-slate-800/80">
                  提示：若尚未填入 OpenFormosa Key 或啟動本地 Ming-3.0-TTS 伺服器，系統會自動生成相容的本地時序音軌供 Remotion 預覽與輸出測試，確保流程不中斷。
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      <QualityPreviewModal
        isOpen={qualityModal.open}
        initialTab={qualityModal.tab}
        onClose={() => setQualityModal((prev) => ({ ...prev, open: false, renderReview: undefined }))}
        qualityReport={qualityReport}
        renderReviewActive={qualityModal.renderReview !== undefined}
        onContinueRender={qualityReport.errorCount > 0 ? undefined : () => {
          const previewOnlySceneIndex = qualityModal.renderReview ?? undefined;
          setQualityModal((current) => ({ ...current, open: false, renderReview: undefined }));
          continueRenderAfterQuality(previewOnlySceneIndex, project);
        }}
        stillsState={stillsState}
        onGenerateStills={requestPreviewStills}
        onJumpToScene={(idx) => {
          setSelectedSceneIdx(idx);
          const frameOffset = project.scenes
            .slice(0, idx)
            .reduce((sum, s) => sum + Math.max(30, Math.round(s.durationSeconds * VIDEO_FPS)), 0);
          playerRef.current?.seekTo(frameOffset);
        }}
      />

      <AiPipelineReviewModal
        isOpen={isAiPipelineOpen}
        onClose={() => setIsAiPipelineOpen(false)}
        project={project}
        onApplyProject={(nextProject) => {
          setProject({ ...nextProject, technicalTermsWhitelist: undefined });
          setSelectedSceneIdx(0);
          playerRef.current?.seekTo(0);
          void saveProjectToDisk({ ...nextProject, technicalTermsWhitelist: undefined }, false);
        }}
      />

      <TechnicalTermsWhitelistModal
        isOpen={isTechnicalTermsOpen}
        project={project}
        renderLabel={pendingTechnicalTermsAction?.type === 'stills'
          ? '場景預覽'
          : pendingTechnicalTermsAction?.type === 'render'
          ? pendingTechnicalTermsAction.previewOnlySceneIndex !== undefined
            ? '單幕輸出'
            : '完整影片輸出'
          : undefined}
        onClose={() => {
          setIsTechnicalTermsOpen(false);
          setPendingTechnicalTermsAction(null);
        }}
        onApprove={approveTechnicalTerms}
      />

      <ScriptReviewModal
        isOpen={isScriptReviewOpen}
        onClose={() => setIsScriptReviewOpen(false)}
        projectTitle={project.title}
        scenes={project.scenes}
        onEditScene={(idx) => {
          setIsScriptReviewOpen(false);
          setInspectorTab('script-tts');
          jumpToScene(idx);
        }}
      />

      {wizardModal}
    </div>
  );
}

export default App;
