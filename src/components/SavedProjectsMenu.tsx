import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Clock,
  Download,
  Edit3,
  Film,
  FolderOpen,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { DOMAIN_META, SavedProjectSummary } from '../types/training';
import { formatDuration } from '../utils/planGenerator';

interface SavedProjectsMenuProps {
  projects: SavedProjectSummary[];
  loading: boolean;
  currentProjectId: string;
  onRefresh: () => void;
  onSelectProject: (projectId: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
}

export const SavedProjectsMenu: React.FC<SavedProjectsMenuProps> = ({
  projects,
  loading,
  currentProjectId,
  onRefresh,
  onSelectProject,
  onDeleteProject,
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'rendered' | 'draft'>('all');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<{ title: string; url: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      const hasRender = p.renders.length > 0;
      if (filterMode === 'rendered' && !hasRender) return false;
      if (filterMode === 'draft' && hasRender) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        DOMAIN_META[p.domain]?.shortLabel.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q)
      );
    });
  }, [projects, searchQuery, filterMode]);

  const handleLoad = async (id: string) => {
    setLoadingId(id);
    try {
      await onSelectProject(id);
      setOpen(false);
    } finally {
      setLoadingId(null);
    }
  };

  const formatTimestamp = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <>
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next) onRefresh();
          }}
          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
            open
              ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200'
              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
          }`}
          title="選擇已儲存的草稿或已輸出影片的專案進行編輯與算圖"
        >
          <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
          <span>專案 / 草稿庫</span>
          <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold tabular-nums">
            {projects.length}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-[430px] max-w-[92vw] rounded-xl bg-[#0F1624] border border-slate-700/90 shadow-2xl shadow-black/60 z-50 overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between bg-[#131C30]">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
                <Film className="w-4 h-4 text-cyan-400" />
                專案與草稿庫 ({projects.length})
              </div>
              <button
                type="button"
                onClick={onRefresh}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition cursor-pointer"
                title="重新整理專案列表"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="p-2.5 border-b border-slate-800/80 bg-[#0C1220] space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋專案或草稿名稱..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                {(
                  [
                    { key: 'all', label: '全部' },
                    { key: 'rendered', label: '已輸出影片' },
                    { key: 'draft', label: '草稿' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setFilterMode(tab.key)}
                    className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                      filterMode === tab.key
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/70">
              {loading && projects.length === 0 ? (
                <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  載入專案列表中...
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-10 px-6 text-center space-y-1.5">
                  <Film className="w-7 h-7 text-slate-600 mx-auto" />
                  <div className="text-xs font-semibold text-slate-300">
                    {projects.length === 0 ? '尚無已輸出影片的專案' : '找不到符合的專案'}
                  </div>
                  <div className="text-[11px] text-slate-500 leading-relaxed">
                    {projects.length === 0
                      ? '點擊右上角「輸出 MP4」完成算圖後，專案會自動儲存於此，方便日後載入編輯與重新輸出。'
                      : '請嘗試其他搜尋關鍵字。'}
                  </div>
                </div>
              ) : (
                filtered.map((item) => {
                  const isCurrent = item.id === currentProjectId;
                  const meta = DOMAIN_META[item.domain] || DOMAIN_META['debug-logic'];
                  return (
                    <div
                      key={item.id}
                      className={`p-3 transition ${
                        isCurrent ? 'bg-cyan-500/10' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                              style={{
                                backgroundColor: `${meta.accentColor}22`,
                                color: meta.accentColor,
                              }}
                            >
                              {meta.shortLabel}
                            </span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
                                編輯中
                              </span>
                            )}
                            <span className="text-[10px] text-slate-500 font-mono">
                              {item.renders.length > 0
                                ? `${item.renders.length} 個影片版本`
                                : '草稿（尚未輸出 MP4）'}
                            </span>
                          </div>
                          <div className="mt-1 text-xs font-semibold text-slate-100 truncate">
                            {item.title}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <Layers className="w-3 h-3 text-slate-500" />
                              {item.sceneCount} 幕
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              {formatDuration(item.totalDurationSeconds)}
                            </span>
                            {item.latestRenderedAt ? (
                              <span className="text-slate-500">
                                輸出於 {formatTimestamp(item.latestRenderedAt)}
                              </span>
                            ) : (
                              <span className="text-slate-500">
                                儲存於 {formatTimestamp(item.updatedAt)}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void onDeleteProject(item.id);
                          }}
                          className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer shrink-0"
                          title="從專案庫移除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="mt-2.5 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={loadingId === item.id}
                          onClick={() => void handleLoad(item.id)}
                          className="flex-1 py-1.5 px-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[11px] font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                        >
                          {loadingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Edit3 className="w-3.5 h-3.5" />
                          )}
                          載入編輯並可重算
                        </button>

                        {item.latestVideoUrl && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewVideo({
                                  title: item.title,
                                  url: item.latestVideoUrl!,
                                })
                              }
                              className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                              title="預覽已算圖影片"
                            >
                              <Play className="w-3 h-3 text-emerald-400" />
                              預覽
                            </button>
                            <a
                              href={item.latestVideoUrl}
                              download
                              className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition"
                              title="下載最新 MP4"
                            >
                              <Download className="w-3 h-3" />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Video Preview Modal */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-[#0F1624] border border-slate-700 overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-white truncate">
                <Film className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="truncate">{previewVideo.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewVideo.url}
                  download
                  className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1 transition"
                >
                  <Download className="w-3.5 h-3.5" /> 下載 MP4
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewVideo(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="bg-black aspect-video">
              <video
                src={previewVideo.url}
                controls
                autoPlay
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
