import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import {
  AlertTriangle,
  Clock,
  Download,
  Edit3,
  FileCode2,
  FileVideo,
  Film,
  FolderOpen,
  Layers,
  LayoutGrid,
  ListVideo,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RefreshCw,
  Repeat,
  Search,
  SkipBack,
  SkipForward,
  Sparkles,
  Tv,
  Volume2,
} from 'lucide-react';
import { TechTrainingVideo } from '../remotion/TechTrainingVideo';
import {
  DOMAIN_META,
  RenderedVideoRecord,
  SavedProjectRecord,
  SavedProjectSummary,
  TrainingProject,
  VIDEO_FPS,
} from '../types/training';
import { formatDuration } from '../utils/planGenerator';
import {
  filterPlaylistProjects,
  getDisplayFileName,
  getNextProjectId,
  getPreferredRender,
  getPrevProjectId,
  getSceneIndexAtFrame,
  getSceneStartFrames,
  PlayerFilterMode,
} from '../utils/playerPlaylist';

interface VideoPlayerModeProps {
  projects: SavedProjectSummary[];
  loading: boolean;
  initialProjectId?: string | null;
  onRefresh: () => void;
  onBackToDashboard: () => void;
  onEditProject: (projectId: string) => Promise<void>;
}

const FILTERS: { key: PlayerFilterMode; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'rendered', label: '已輸出 MP4' },
  { key: 'draft', label: '草稿' },
];

const formatTimestamp = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const VideoPlayerMode: React.FC<VideoPlayerModeProps> = ({
  projects,
  loading,
  initialProjectId,
  onRefresh,
  onBackToDashboard,
  onEditProject,
}) => {
  const [filter, setFilter] = useState<PlayerFilterMode>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (initialProjectId && projects.some((p) => p.id === initialProjectId)) {
      return initialProjectId;
    }
    return projects[0]?.id ?? null;
  });
  const [sourceSelection, setSourceSelection] = useState<'auto' | 'live' | string>('auto');
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [loopPlaylist, setLoopPlaylist] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(Boolean(initialProjectId));
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [loadedProject, setLoadedProject] = useState<TrainingProject | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mp4Error, setMp4Error] = useState<string | null>(null);
  const [revealingFile, setRevealingFile] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [activeSceneIdx, setActiveSceneIdx] = useState(0);
  const [openingEditor, setOpeningEditor] = useState(false);

  const projectCacheRef = useRef<Map<string, TrainingProject>>(new Map());
  const playerRef = useRef<PlayerRef>(null);

  const renderedCount = useMemo(
    () => projects.filter((p) => p.renders.length > 0).length,
    [projects]
  );
  const draftCount = projects.length - renderedCount;

  const playlist = useMemo(
    () => filterPlaylistProjects(projects, filter, query),
    [projects, filter, query]
  );

  // Sync initialProjectId or ensure selectedId points to a valid project.
  useEffect(() => {
    if (projects.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !projects.some((p) => p.id === selectedId)) {
      const next =
        (initialProjectId && projects.some((p) => p.id === initialProjectId)
          ? initialProjectId
          : playlist[0]?.id || projects[0]?.id) ?? null;
      setSelectedId(next);
    }
  }, [projects, selectedId, initialProjectId, playlist]);

  const currentSummary = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId]
  );

  // Reset per-video state when switching projects.
  useEffect(() => {
    setRevealError(null);
    setSourceSelection('auto');
    setMp4Error(null);
    setActiveSceneIdx(0);
  }, [selectedId]);

  const preferredRender = useMemo(
    () => (currentSummary ? getPreferredRender(currentSummary) : null),
    [currentSummary]
  );

  const activeRender: RenderedVideoRecord | null = useMemo(() => {
    if (!currentSummary) return null;
    if (sourceSelection === 'live') return null;
    if (sourceSelection === 'auto') return preferredRender;
    return currentSummary.renders.find((r) => r.outputUrl === sourceSelection) ?? preferredRender;
  }, [currentSummary, sourceSelection, preferredRender]);

  const isPlayingMp4 = Boolean(activeRender && !mp4Error);

  // Load full TrainingProject JSON whenever we need Live Remotion Preview.
  useEffect(() => {
    if (!selectedId || isPlayingMp4) {
      setLoadingProject(false);
      setLoadError(null);
      return;
    }

    const cached = projectCacheRef.current.get(selectedId);
    if (cached) {
      setLoadedProject(cached);
      setLoadingProject(false);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setLoadingProject(true);
    setLoadError(null);
    setLoadedProject(null);

    fetch(`/api/projects/${encodeURIComponent(selectedId)}`)
      .then(async (resp) => {
        if (!resp.ok) throw new Error('無法載入此草稿專案內容');
        const data = (await resp.json()) as { record?: SavedProjectRecord };
        if (!data.record?.project) throw new Error('專案資料格式不完整');
        return data.record.project;
      })
      .then((proj) => {
        if (cancelled) return;
        projectCacheRef.current.set(selectedId, proj);
        setLoadedProject(proj);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : '載入專案失敗');
      })
      .finally(() => {
        if (!cancelled) setLoadingProject(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, isPlayingMp4]);

  const selectProject = useCallback((id: string, autoPlay = true) => {
    setSelectedId(id);
    setShouldAutoPlay(autoPlay);
  }, []);

  const nextId = useMemo(
    () => getNextProjectId(playlist, selectedId, loopPlaylist),
    [playlist, selectedId, loopPlaylist]
  );
  const prevId = useMemo(
    () => getPrevProjectId(playlist, selectedId, loopPlaylist),
    [playlist, selectedId, loopPlaylist]
  );

  const handlePrev = useCallback(() => {
    if (prevId) selectProject(prevId, true);
  }, [prevId, selectProject]);

  const handleNext = useCallback(() => {
    if (nextId) selectProject(nextId, true);
  }, [nextId, selectProject]);

  const handleVideoEnded = useCallback(() => {
    if (!autoAdvance) return;
    if (nextId) {
      selectProject(nextId, true);
    }
  }, [autoAdvance, nextId, selectProject]);

  // Listen to Remotion Player events (ended + active chapter tracking).
  useEffect(() => {
    if (isPlayingMp4 || !loadedProject) return;
    const player = playerRef.current;
    if (!player) return;

    const onEnded = () => {
      handleVideoEnded();
    };
    const onFrameUpdate = (e: { detail: { frame: number } }) => {
      const idx = getSceneIndexAtFrame(loadedProject.scenes, e.detail.frame, VIDEO_FPS);
      setActiveSceneIdx((prev) => (prev === idx ? prev : idx));
    };

    player.addEventListener('ended', onEnded);
    player.addEventListener('frameupdate', onFrameUpdate);
    return () => {
      player.removeEventListener('ended', onEnded);
      player.removeEventListener('frameupdate', onFrameUpdate);
    };
  }, [isPlayingMp4, loadedProject, handleVideoEnded]);

  // Keyboard shortcuts: Shift+N (next), Shift+P (prev).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNext();
      } else if (e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNext, handlePrev]);

  const totalSeconds = useMemo(() => {
    if (!loadedProject) return currentSummary?.totalDurationSeconds ?? 0;
    return loadedProject.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  }, [loadedProject, currentSummary]);

  const totalFrames = Math.max(VIDEO_FPS, Math.round(totalSeconds * VIDEO_FPS));

  const sceneStartFrames = useMemo(
    () => (loadedProject ? getSceneStartFrames(loadedProject.scenes, VIDEO_FPS) : []),
    [loadedProject]
  );

  const readyTtsCount = useMemo(
    () =>
      loadedProject
        ? loadedProject.scenes.filter((s) => s.tts.status === 'ready' && s.tts.audioUrl).length
        : 0,
    [loadedProject]
  );

  const handleRefresh = () => {
    projectCacheRef.current.clear();
    onRefresh();
  };

  const handleEditCurrent = async () => {
    if (!currentSummary) return;
    setOpeningEditor(true);
    try {
      await onEditProject(currentSummary.id);
    } finally {
      setOpeningEditor(false);
    }
  };

  const currentFileName = useMemo(
    () => (currentSummary ? getDisplayFileName(currentSummary, isPlayingMp4 ? activeRender : null) : null),
    [currentSummary, isPlayingMp4, activeRender]
  );

  const handleRevealInExplorer = async () => {
    if (!currentSummary) return;
    setRevealingFile(true);
    setRevealError(null);
    try {
      const payload =
        isPlayingMp4 && activeRender
          ? { kind: 'output' as const, outputUrl: activeRender.outputUrl }
          : { kind: 'project' as const, projectId: currentSummary.id };
      const resp = await fetch('/api/files/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const body = (await resp.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || '無法開啟檔案總管');
      }
    } catch (err) {
      setRevealError(err instanceof Error ? err.message : '無法開啟檔案總管');
    } finally {
      setRevealingFile(false);
    }
  };

  const currentMeta = currentSummary
    ? DOMAIN_META[currentSummary.domain] || DOMAIN_META['debug-logic']
    : null;

  const currentPlaylistIndex = selectedId
    ? playlist.findIndex((p) => p.id === selectedId)
    : -1;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0E0D0C] text-slate-100 overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 shrink-0 border-b border-slate-800/90 bg-[#151310] px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition shrink-0"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
            專案總覽
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
            <Tv className="w-4 h-4 text-slate-950" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white truncate">播放器模式</h1>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-semibold text-cyan-300">
                已輸出 {renderedCount} · 草稿 {draftCount}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              連續播放所有草稿即時預覽與已輸出 MP4 影片
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {currentSummary && (
            <button
              type="button"
              disabled={openingEditor}
              onClick={() => void handleEditCurrent()}
              className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {openingEditor ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Edit3 className="w-3.5 h-3.5" />
              )}
              編輯此專案
            </button>
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? '收合播放清單（劇院模式）' : '展開播放清單'}
            aria-label={sidebarOpen ? '收合播放清單' : '展開播放清單'}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
          >
            {sidebarOpen ? (
              <>
                <PanelRightClose className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden md:inline">收合清單</span>
              </>
            ) : (
              <>
                <PanelRightOpen className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden md:inline">播放清單 ({playlist.length})</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Theater Stage */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-[#0B0A09]">
          {!currentSummary ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <Film className="w-12 h-12 text-slate-600" />
              <div className="text-base font-semibold text-slate-200">
                {loading ? '載入影片清單中...' : '尚無可播放的草稿或影片'}
              </div>
              <p className="text-xs text-slate-400 max-w-md">
                先在專案總覽建立或儲存草稿專案，或輸出 MP4 影片，即可在此處連續播放所有內容。
              </p>
              <button
                type="button"
                onClick={onBackToDashboard}
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition"
              >
                前往專案總覽
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col max-w-6xl w-full mx-auto px-5 py-4 gap-4">
              {/* Video Viewport */}
              <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-800 bg-black shadow-2xl">
                {isPlayingMp4 && activeRender ? (
                  <video
                    key={activeRender.outputUrl}
                    src={activeRender.outputUrl}
                    controls
                    autoPlay={shouldAutoPlay}
                    playsInline
                    onEnded={handleVideoEnded}
                    onError={() =>
                      setMp4Error('MP4 檔案無法載入（可能已被移動或刪除），可切換至草稿即時預覽。')
                    }
                    className="w-full h-full object-contain bg-black"
                  />
                ) : loadingProject ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-300">
                    <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                    <div className="text-xs font-medium">正在載入草稿場景資料...</div>
                  </div>
                ) : loadError || !loadedProject ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-400" />
                    <div className="text-sm font-semibold text-slate-200">
                      {loadError || '無法載入此草稿'}
                    </div>
                    <button
                      type="button"
                      onClick={handleRefresh}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                    >
                      重新整理
                    </button>
                  </div>
                ) : (
                  <Player
                    key={loadedProject.id}
                    ref={playerRef}
                    component={TechTrainingVideo as unknown as React.FC<Record<string, unknown>>}
                    inputProps={{
                      projectTitle: loadedProject.title,
                      scenes: loadedProject.scenes,
                      audioBaseUrl: '',
                    }}
                    durationInFrames={totalFrames}
                    fps={VIDEO_FPS}
                    compositionWidth={1920}
                    compositionHeight={1080}
                    style={{ width: '100%', height: '100%' }}
                    controls
                    clickToPlay
                    autoPlay={shouldAutoPlay}
                    spaceKeyToPlayOrPause
                    showPlaybackRateControl
                  />
                )}

                {/* Mode overlay badge (top-left, non-blocking) */}
                <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold backdrop-blur-md border ${
                      isPlayingMp4
                        ? 'bg-emerald-950/80 border-emerald-400/40 text-emerald-200'
                        : 'bg-amber-950/80 border-amber-400/40 text-amber-200'
                    }`}
                  >
                    {isPlayingMp4
                      ? activeRender?.isPreview
                        ? `單幕預覽 MP4 (S${(activeRender.previewSceneIndex ?? 0) + 1})`
                        : '已輸出完整 MP4'
                      : '草稿即時預覽'}
                  </span>
                  {currentPlaylistIndex >= 0 && (
                    <span className="px-2 py-1 rounded-full bg-slate-950/75 border border-slate-700/70 text-[11px] font-semibold text-slate-300 tabular-nums backdrop-blur-md">
                      {currentPlaylistIndex + 1} / {playlist.length}
                    </span>
                  )}
                </div>
              </div>

              {/* MP4 Load Error Notice */}
              {mp4Error && (
                <div className="px-3.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    {mp4Error}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMp4Error(null);
                      setSourceSelection('live');
                    }}
                    className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 font-semibold shrink-0"
                  >
                    使用草稿即時預覽
                  </button>
                </div>
              )}

              {/* Transport & Metadata Bar */}
              <div className="rounded-xl border border-slate-800/90 bg-[#151310] p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {currentMeta && (
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-bold"
                          style={{
                            backgroundColor: `${currentMeta.accentColor}22`,
                            color: currentMeta.accentColor,
                          }}
                        >
                          {currentMeta.shortLabel}
                        </span>
                      )}
                      <h2 className="text-base font-bold text-white truncate">
                        {currentSummary.title}
                      </h2>
                    </div>
                    {currentSummary.subtitle && (
                      <p className="text-xs text-slate-400 line-clamp-2">{currentSummary.subtitle}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-0.5">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-slate-500" />
                        {currentSummary.sceneCount} 幕
                      </span>
                      <span className="flex items-center gap-1 tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {formatDuration(currentSummary.totalDurationSeconds)}
                      </span>
                      {!isPlayingMp4 && loadedProject && (
                        <span className="flex items-center gap-1">
                          <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                          配音 {readyTtsCount}/{loadedProject.scenes.length} 就緒
                        </span>
                      )}
                      <span>
                        {currentSummary.latestRenderedAt
                          ? `輸出於 ${formatTimestamp(currentSummary.latestRenderedAt)}`
                          : `更新於 ${formatTimestamp(currentSummary.updatedAt)}`}
                      </span>
                    </div>

                    {currentFileName && (
                      <div className="flex flex-wrap items-center gap-2 pt-1.5">
                        <span
                          title={
                            isPlayingMp4
                              ? `output/${currentFileName}`
                              : `projects/${currentFileName}`
                          }
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-slate-300 max-w-full"
                        >
                          {isPlayingMp4 ? (
                            <FileVideo className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <FileCode2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          )}
                          <span className="truncate">{currentFileName}</span>
                        </span>
                        <button
                          type="button"
                          disabled={revealingFile}
                          onClick={() => void handleRevealInExplorer()}
                          title="在 Windows 檔案總管中選取此檔案"
                          className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold text-slate-200 flex items-center gap-1.5 transition disabled:opacity-50 shrink-0"
                        >
                          {revealingFile ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                          ) : (
                            <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                          )}
                          在檔案總管中顯示
                        </button>
                        {revealError && (
                          <span className="text-[11px] text-rose-300 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            {revealError}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Playback Transport Controls */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={!prevId}
                      onClick={handlePrev}
                      title="上一部 (Shift+P)"
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1 transition disabled:opacity-40"
                    >
                      <SkipBack className="w-3.5 h-3.5" />
                      上一部
                    </button>
                    <button
                      type="button"
                      disabled={!nextId}
                      onClick={handleNext}
                      title="下一部 (Shift+N)"
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1 transition disabled:opacity-40"
                    >
                      下一部
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      aria-pressed={autoAdvance}
                      onClick={() => setAutoAdvance((v) => !v)}
                      title="影片播畢後自動播放清單中的下一部"
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
                        autoAdvance
                          ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <ListVideo className="w-3.5 h-3.5" />
                      連續播放
                    </button>

                    <button
                      type="button"
                      aria-pressed={loopPlaylist}
                      onClick={() => setLoopPlaylist((v) => !v)}
                      title="播放完最後一部後回到第一部"
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
                        loopPlaylist
                          ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      循環
                    </button>

                    {isPlayingMp4 && activeRender && (
                      <a
                        href={activeRender.outputUrl}
                        download
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-xs font-semibold text-emerald-200 flex items-center gap-1.5 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        下載 MP4
                      </a>
                    )}
                  </div>
                </div>

                {/* Source / Version Switcher (for projects with MP4 renders) */}
                {currentSummary.renders.length > 0 && (
                  <div className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-slate-400 font-semibold">播放來源：</span>
                    {currentSummary.renders.map((r, idx) => {
                      const active = isPlayingMp4 && activeRender?.outputUrl === r.outputUrl;
                      return (
                        <button
                          key={r.jobId || r.outputUrl}
                          type="button"
                          onClick={() => {
                            setMp4Error(null);
                            setSourceSelection(r.outputUrl);
                            setShouldAutoPlay(true);
                          }}
                          className={`px-2.5 py-1 rounded-md border font-semibold transition ${
                            active
                              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {r.isPreview
                            ? `單幕預覽 S${(r.previewSceneIndex ?? 0) + 1}`
                            : idx === 0
                            ? '最新完整 MP4'
                            : `完整 MP4 #${idx + 1}`}{' '}
                          ({formatTimestamp(r.renderedAt)})
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setMp4Error(null);
                        setSourceSelection('live');
                        setShouldAutoPlay(true);
                      }}
                      className={`px-2.5 py-1 rounded-md border font-semibold flex items-center gap-1 transition ${
                        !isPlayingMp4
                          ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      即時預覽 (最新草稿)
                    </button>
                  </div>
                )}

                {/* Chapter / Scene Strip in Live Preview Mode */}
                {!isPlayingMp4 && loadedProject && loadedProject.scenes.length > 0 && (
                  <div className="pt-2.5 border-t border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300">
                        章節快速跳轉 · 目前：S{activeSceneIdx + 1} {loadedProject.scenes[activeSceneIdx]?.title}
                      </span>
                      <span className="tabular-nums">
                        共 {loadedProject.scenes.length} 幕 ({formatDuration(totalSeconds)})
                      </span>
                    </div>
                    <div className="flex h-9 gap-1 w-full rounded-lg overflow-hidden bg-slate-950 p-1 border border-slate-800">
                      {loadedProject.scenes.map((scene, idx) => {
                        const widthPct = (scene.durationSeconds / Math.max(1, totalSeconds)) * 100;
                        const active = idx === activeSceneIdx;
                        return (
                          <button
                            key={scene.id}
                            type="button"
                            onClick={() => {
                              setActiveSceneIdx(idx);
                              playerRef.current?.seekTo(sceneStartFrames[idx] ?? 0);
                            }}
                            title={`S${idx + 1}: ${scene.title} (${scene.durationSeconds}s)`}
                            style={{ width: `${widthPct}%` }}
                            className={`h-full min-w-[4px] rounded-sm px-1 flex items-center text-left transition overflow-hidden ${
                              active
                                ? 'bg-cyan-400 text-slate-950 font-bold'
                                : 'bg-slate-800/80 hover:bg-cyan-500/35 text-slate-300'
                            }`}
                          >
                            {loadedProject.scenes.length <= 20 && (
                              <span className="text-[10px] truncate">
                                S{idx + 1}: {scene.title}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Right Playlist Sidebar */}
        {sidebarOpen && (
          <aside
            aria-label="影片與草稿播放清單"
            className="w-80 xl:w-96 shrink-0 border-l border-slate-800/90 bg-[#12100E] flex flex-col min-h-0"
          >
            <div className="px-3.5 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
                <ListVideo className="w-4 h-4 text-cyan-400" />
                播放清單 ({playlist.length}/{projects.length})
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                aria-label="重新整理播放清單"
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="p-3 border-b border-slate-800/80 space-y-2.5 bg-[#0F0D0B]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="搜尋播放清單"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜尋影片或草稿名稱..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                {FILTERS.map((f) => {
                  const count =
                    f.key === 'all'
                      ? projects.length
                      : f.key === 'rendered'
                      ? renderedCount
                      : draftCount;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={filter === f.key}
                      onClick={() => setFilter(f.key)}
                      className={`flex-1 py-1 px-2 rounded-md font-semibold transition ${
                        filter === f.key
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {f.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {loading && projects.length === 0 ? (
                <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  載入中...
                </div>
              ) : playlist.length === 0 ? (
                <div className="py-12 px-4 text-center text-xs text-slate-500">
                  沒有符合篩選條件的草稿或影片
                </div>
              ) : (
                playlist.map((item, idx) => {
                  const active = item.id === selectedId;
                  const hasRender = item.renders.length > 0;
                  const meta = DOMAIN_META[item.domain] || DOMAIN_META['debug-logic'];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={active ? 'true' : undefined}
                      onClick={() => selectProject(item.id, true)}
                      className={`w-full text-left p-2.5 rounded-xl border transition flex items-start gap-2.5 ${
                        active
                          ? 'bg-cyan-500/12 border-cyan-400/60 shadow-sm'
                          : 'bg-[#151310] border-slate-800/80 hover:border-slate-600 hover:bg-slate-900/70'
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold tabular-nums ${
                          active
                            ? 'bg-cyan-400 text-slate-950'
                            : 'bg-slate-800/90 text-slate-400'
                        }`}
                      >
                        {active ? <Play className="w-3 h-3 fill-current" /> : idx + 1}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              hasRender
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-amber-500/15 text-amber-300'
                            }`}
                          >
                            {hasRender ? 'MP4' : '草稿'}
                          </span>
                          <span
                            className="px-1.5 py-0.2 rounded text-[10px] font-semibold"
                            style={{
                              backgroundColor: `${meta.accentColor}1E`,
                              color: meta.accentColor,
                            }}
                          >
                            {meta.shortLabel}
                          </span>
                        </div>

                        <div
                          className={`text-xs font-semibold line-clamp-2 leading-snug ${
                            active ? 'text-white' : 'text-slate-200'
                          }`}
                        >
                          {item.title}
                        </div>

                        <div
                          className="text-[10px] font-mono text-slate-400 truncate"
                          title={getDisplayFileName(item, getPreferredRender(item))}
                        >
                          {getDisplayFileName(item, getPreferredRender(item))}
                        </div>

                        <div className="flex items-center gap-2.5 text-[10px] text-slate-400 tabular-nums">
                          <span>{item.sceneCount} 幕</span>
                          <span>•</span>
                          <span>{formatDuration(item.totalDurationSeconds)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
