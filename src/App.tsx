import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import {
  Activity,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Download,
  Eye,
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
  Trash2,
  Upload,
  Volume2,
  Wand2,
} from 'lucide-react';
import { SavedProjectsMenu } from './components/SavedProjectsMenu';
import { ProjectDashboard } from './components/ProjectDashboard';
import { PreviewStillsState, QualityPreviewModal } from './components/QualityPreviewModal';
import { SourceWizardModal } from './components/SourceWizardModal';
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
  VisualTemplate,
  VoiceProfile,
  VoiceProfileProvider,
} from './types/training';
import { evaluateProjectQuality } from './utils/qualityLinter';
import { applyTtsSettings, loadTtsSettings } from './utils/ttsSettingsStorage';
import { createVoiceProfile, listVoiceProfiles, toCustomVoice, trainVoiceProfile } from './utils/voiceProfiles';
import {
  DEFAULT_GNAI_CONFIG,
  loadStoredLlmConfig,
  saveStoredLlmConfig,
} from './utils/llmConfigStorage';
import {
  balanceScenesToDuration,
  computeRichnessDuration,
  createPresetProject,
  formatDuration,
  getDefaultDiagramData,
} from './utils/planGenerator';

type InspectorTab = 'script-tts' | 'motion-visual' | 'engine-config';

export function App() {
  const [project, setProject] = useState<TrainingProject>(() => ({
    ...createPresetProject('debug-logic'),
    llmConfig: loadStoredLlmConfig(),
  }));
  const [selectedSceneIdx, setSelectedSceneIdx] = useState(0);
  const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('script-tts');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [batchTtsRunning, setBatchTtsRunning] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const voiceFileInputRef = useRef<HTMLInputElement>(null);
  const [voiceRecorderOpen, setVoiceRecorderOpen] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [sceneAiLoading, setSceneAiLoading] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [copiedDebugKey, setCopiedDebugKey] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<{
    active: boolean;
    progress: number;
    status: string;
    outputUrl?: string;
    mediaQa?: MediaQaResult;
    error?: string;
  }>({ active: false, progress: 0, status: 'idle' });
  const [qualityModal, setQualityModal] = useState<{
    open: boolean;
    tab: 'quality' | 'stills';
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

  const qualityReport = useMemo(() => evaluateProjectQuality(project), [project]);

  const playerRef = useRef<PlayerRef>(null);
  const activeProjectIdRef = useRef<string>(project.id);
  const deletedProjectIdsRef = useRef<Set<string>>(new Set());
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
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

  const saveProjectToDisk = (targetProject: TrainingProject, showNotice = false) => {
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
    setProject({
      ...loaded,
      llmConfig: loaded.llmConfig || loadStoredLlmConfig(),
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
          ...createPresetProject(prev.domain),
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
    // Unsaved presets (page load, or the placeholder left after a delete) must not be written to disk.
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
    const frame = sceneStartFrames[idx] ?? 0;
    playerRef.current?.seekTo(frame);
  };

  const updateScene = (idx: number, patch: Partial<SceneSpec>) => {
    setProject((prev) => ({
      ...prev,
      scenes: prev.scenes.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const handleDomainSwitch = (domain: TechDomain) => {
    setProject((prev) => ({
      ...createPresetProject(domain),
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
          language: project.language || DEFAULT_CONTENT_LANGUAGE,
          llmConfig: project.llmConfig,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'AI 更新失敗');
      updateScene(idx, data.scenePatch);
      if (data.note) setAiNotice(data.note);
    } catch (err) {
      setAiNotice(err instanceof Error ? err.message : 'AI 更新失敗');
    } finally {
      setSceneAiLoading(null);
    }
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
        accentColor: meta.accentColor,
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

  const synthesizeSceneTts = async (idx: number) => {
    const scene = project.scenes[idx];
    if (!scene) return;
    updateScene(idx, { tts: { ...scene.tts, status: 'generating', error: undefined } });

    try {
      const resp = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    setBatchTtsRunning(true);

    let cursor = 0;
    const workerCount = 6;

    const worker = async () => {
      while (cursor < queue.length) {
        if (activeProjectIdRef.current !== targetProjectId) return;
        const item = queue[cursor++];
        if (!item) return;
        const { s, idx } = item;

        try {
          const resp = await fetch('/api/tts/synthesize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
          if (activeProjectIdRef.current !== targetProjectId) return;
          if (resp.ok && data.audioUrl) {
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
          }
        } catch {
          // Keep going for remaining scenes
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    if (activeProjectIdRef.current === targetProjectId) {
      setBatchTtsRunning(false);
    }
  };

  useEffect(() => {
    if (view !== 'editor') return;
    listVoiceProfiles()
      .then(setVoiceProfiles)
      .catch(() => setVoiceProfiles([]));
  }, [view]);

  useEffect(() => {
    if (view !== 'editor') return;
    void synthesizeScenesConcurrent(
      project.id,
      project.scenes,
      project.ttsConfig,
      project.language,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, view]);

  const synthesizeAllScenes = async () => {
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
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = getContentLanguage(project.language).value;
    utter.rate = selectedScene?.tts.speed || 1.0;
    window.speechSynthesis.speak(utter);
  };

  const startPreviewStills = async () => {
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
          projectTitle: project.title,
          scenes: project.scenes,
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

  const startRender = async (previewOnlySceneIndex?: number) => {
    setRenderState({ active: true, progress: 5, status: 'bundling' });
    try {
      const resp = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectTitle: project.title,
          scenes: project.scenes,
          previewOnlySceneIndex,
          project,
        }),
      });
      const { jobId, error } = await resp.json();
      if (!resp.ok) throw new Error(error || '無法啟動 Remotion 輸出');

      const timer = setInterval(async () => {
        try {
          const poll = await fetch(`/api/render/${jobId}`);
          const job = await poll.json();
          if (job.status === 'done') {
            clearInterval(timer);
            setRenderState({
              active: false,
              progress: 100,
              status: 'done',
              outputUrl: job.outputUrl,
              mediaQa: job.mediaQa,
            });
            void fetchSavedProjects();
          } else if (job.status === 'error') {
            clearInterval(timer);
            setRenderState({
              active: false,
              progress: 0,
              status: 'error',
              error: job.error,
            });
          } else {
            setRenderState({
              active: true,
              progress: job.progress || 10,
              status: job.status,
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

  const copyDebugMessage = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDebugKey(key);
      setTimeout(() => setCopiedDebugKey((curr) => (curr === key ? null : curr)), 2000);
    } catch {
      // Clipboard API may be blocked in non-HTTPS contexts
    }
  };

  const isExactTargetDuration = totalSeconds === project.targetDurationSeconds;

  // Flush the debounced auto-save so reopening the project from disk shows the latest edits.
  const goToDashboard = async () => {
    if (isCurrentProjectSaved) {
      await saveProjectToDisk(project, false);
    }
    setView('dashboard');
    void fetchSavedProjects();
  };

  const handleCreateFromPreset = (domain: TechDomain) => {
    const next: TrainingProject = applyTtsSettings(
      {
        ...createPresetProject(domain),
        language: DEFAULT_CONTENT_LANGUAGE,
        llmConfig: project.llmConfig || loadStoredLlmConfig(),
      },
      loadTtsSettings(),
      { overrideProvider: true }
    );
    setProject(next);
    setSelectedSceneIdx(0);
    playerRef.current?.seekTo(0);
    void saveProjectToDisk(next, false);
    setView('editor');
  };

  const wizardModal = (
    <SourceWizardModal
      isOpen={isWizardOpen}
      onClose={() => setIsWizardOpen(false)}
      initialLlmConfig={project.llmConfig}
      onProjectCreated={(created, notice) => {
        const newProj = applyTtsSettings(created, loadTtsSettings());
        setProject(newProj);
        setSelectedSceneIdx(0);
        if (notice) setAiNotice(notice);
        playerRef.current?.seekTo(0);
        void saveProjectToDisk(newProj, false);
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
          onDeleteProject={handleDeleteSavedProject}
          onCreateWithAi={() => setIsWizardOpen(true)}
          onCreateFromPreset={handleCreateFromPreset}
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
            {!isExactTargetDuration && (
              <button
                onClick={handleAutoBalance}
                className="ml-1 underline hover:text-white"
                title={`自動平衡各場景時間至目標時長 (${project.targetDurationSeconds}秒)`}
              >
                校正時長
              </button>
            )}
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
            onClick={synthesizeAllScenes}
            disabled={batchTtsRunning}
            className="px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-xs font-semibold text-indigo-200 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {batchTtsRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
            {batchTtsRunning
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
            onClick={() => void startPreviewStills()}
            disabled={stillsState.active}
            title="一次輸出每一幕的中點 PNG 截圖，快速檢查排版"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {stillsState.active ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            ) : (
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
            )}
            靜態預覽
          </button>

          <button
            onClick={() => startRender(selectedSceneIdx)}
            disabled={renderState.active}
            title="快速輸出當前選取場景為 MP4 預覽"
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            輸出單幕預覽
          </button>

          <button
            onClick={() => startRender(undefined)}
            disabled={renderState.active}
            className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {renderState.active ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                輸出中 {renderState.progress}%
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
              onClick={() => void copyDebugMessage('ai-notice', aiNotice)}
              className="px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 hover:text-white flex items-center gap-1 transition cursor-pointer"
              title="複製除錯訊息"
            >
              {copiedDebugKey === 'ai-notice' ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" /> 已複製
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" /> 複製訊息
                </>
              )}
            </button>
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
              <button
                type="button"
                onClick={() => void copyDebugMessage('render-error', renderState.error || '')}
                className="px-2 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 flex items-center gap-1 shrink-0 transition cursor-pointer"
              >
                {copiedDebugKey === 'render-error' ? (
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
      )}

      {/* Main 3-Pane Studio Workspace */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT PANE: Scene Outline */}
        <aside className="w-72 shrink-0 border-r border-slate-800/90 bg-[#131110] flex flex-col">
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
          <div className="flex-1 flex items-center justify-center p-5 min-h-0">
            <div className="w-full max-w-5xl aspect-video rounded-xl overflow-hidden border border-slate-800 shadow-2xl bg-black">
              <Player
                ref={playerRef}
                component={TechTrainingVideo as unknown as React.FC<Record<string, unknown>>}
                inputProps={{
                  projectTitle: project.title,
                  scenes: project.scenes,
                  audioBaseUrl: '',
                }}
                durationInFrames={totalFrames}
                fps={VIDEO_FPS}
                compositionWidth={1920}
                compositionHeight={1080}
                style={{ width: '100%', height: '100%' }}
                controls
                clickToPlay
              />
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
                const active = idx === selectedSceneIdx;
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
        <aside className="w-96 shrink-0 border-l border-slate-800/90 bg-[#131110] flex flex-col">
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

                {selectedScene.tts.audioUrl && (
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
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                      <Wand2 className="w-4 h-4" /> Intel GNAI LLM 引擎
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {project.llmConfig?.apiKey ? '已儲存於本機' : '未設定 Token'}
                    </span>
                  </div>
                  <div>
                    <label htmlFor="cfg-gnai-url" className="block text-[11px] text-slate-400 mb-1">GNAI_URL</label>
                    <input
                      id="cfg-gnai-url"
                      type="text"
                      value={project.llmConfig?.baseUrl ?? DEFAULT_GNAI_CONFIG.baseUrl}
                      onChange={(e) => {
                        const next = {
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
                      <label htmlFor="cfg-gnai-token" className="block text-[11px] text-slate-400 mb-1">GNAI_TOKEN (本機儲存)</label>
                      <input
                        id="cfg-gnai-token"
                        type="password"
                        placeholder="貼上 GNAI Token"
                        value={project.llmConfig?.apiKey || ''}
                        onChange={(e) => {
                          const next = {
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
                      <label htmlFor="cfg-gnai-model" className="block text-[11px] text-slate-400 mb-1">GNAI_MODEL</label>
                      <input
                        id="cfg-gnai-model"
                        type="text"
                        value={project.llmConfig?.model ?? DEFAULT_GNAI_CONFIG.model}
                        onChange={(e) => {
                          const next = {
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
      <QualityPreviewModal
        isOpen={qualityModal.open}
        initialTab={qualityModal.tab}
        onClose={() => setQualityModal((prev) => ({ ...prev, open: false }))}
        qualityReport={qualityReport}
        stillsState={stillsState}
        onGenerateStills={() => void startPreviewStills()}
        onJumpToScene={(idx) => {
          setSelectedSceneIdx(idx);
          const frameOffset = project.scenes
            .slice(0, idx)
            .reduce((sum, s) => sum + Math.max(30, Math.round(s.durationSeconds * VIDEO_FPS)), 0);
          playerRef.current?.seekTo(frameOffset);
        }}
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

      {wizardModal}
    </div>
  );
}

export default App;
