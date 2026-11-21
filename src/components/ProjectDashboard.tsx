import React, { useMemo, useState } from 'react';
import {
  Clock,
  Cpu,
  Edit3,
  Film,
  FolderOpen,
  Layers,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Tv,
  Wand2,
} from 'lucide-react';
import { DOMAIN_META, SavedProjectSummary, TechDomain } from '../types/training';
import { formatDuration } from '../utils/planGenerator';
import { SettingsPanel } from './SettingsPanel';

interface ProjectDashboardProps {
  projects: SavedProjectSummary[];
  loading: boolean;
  onRefresh: () => void;
  onOpenProject: (projectId: string) => Promise<void>;
  onOpenPlayer: (projectId?: string) => void;
  onDeleteProject: (projectId: string) => Promise<void>;
  onCreateWithAi: () => void;
  onCreateFromPreset: (domain: TechDomain) => void;
}

type FilterMode = 'all' | 'rendered' | 'draft';

const FILTERS: { key: FilterMode; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'rendered', label: '已輸出影片' },
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

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  projects,
  loading,
  onRefresh,
  onOpenProject,
  onOpenPlayer,
  onDeleteProject,
  onCreateWithAi,
  onCreateFromPreset,
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [tab, setTab] = useState<'projects' | 'settings'>('projects');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      const rendered = p.renders.length > 0;
      if (filter === 'rendered' && !rendered) return false;
      if (filter === 'draft' && rendered) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        (DOMAIN_META[p.domain]?.shortLabel.toLowerCase().includes(q) ?? false)
      );
    });
  }, [projects, query, filter]);

  const handleOpen = async (id: string) => {
    setOpeningId(id);
    try {
      await onOpenProject(id);
    } finally {
      setOpeningId(null);
    }
  };

  const handleDelete = (item: SavedProjectSummary) => {
    if (!window.confirm(`確定要刪除「${item.title}」嗎？此動作無法復原。`)) return;
    void onDeleteProject(item.id);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0E0D0C] text-slate-100 overflow-hidden">
      <header className="h-14 shrink-0 border-b border-slate-800/90 bg-[#151310] px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Film className="w-4 h-4 text-slate-950" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-white tracking-wide leading-tight">Remotion Tech Training Studio</h1>
            <div className="text-[11px] text-slate-400">專案總覽</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onOpenPlayer()}
            disabled={projects.length === 0}
            title="進入播放器模式，連續播放所有草稿與已輸出影片"
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-40"
          >
            <Tv className="w-3.5 h-3.5 text-cyan-400" />
            播放器模式 ({projects.length})
          </button>
          <button
            type="button"
            onClick={onCreateWithAi}
            className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Wand2 className="w-3.5 h-3.5" />
            AI 主題生成 / 匯入
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
          <div role="tablist" aria-label="總覽分頁" className="flex items-center gap-1 border-b border-slate-800">
            {([
              { key: 'projects', label: '專案', icon: <FolderOpen className="w-3.5 h-3.5" /> },
              { key: 'settings', label: '設定', icon: <Settings className="w-3.5 h-3.5" /> },
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`px-3.5 py-2 -mb-px text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
                  tab === t.key
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'settings' ? (
            <SettingsPanel />
          ) : (
          <>
          <section aria-labelledby="dash-projects">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-cyan-400" />
                <h2 id="dash-projects" className="text-sm font-bold text-slate-100">
                  選擇要編輯的專案 ({projects.length})
                </h2>
                <button
                  type="button"
                  onClick={onRefresh}
                  aria-label="重新整理專案列表"
                  className="p-2 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2"
                  />
                  <input
                    type="text"
                    aria-label="搜尋專案"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜尋專案名稱..."
                    className="w-56 pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={filter === f.key}
                      onClick={() => setFilter(f.key)}
                      className={`px-2.5 py-1.5 rounded-md font-semibold transition ${
                        filter === f.key
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading && projects.length === 0 ? (
              <div className="py-16 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                載入專案列表中...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center space-y-2 rounded-xl border border-dashed border-slate-800">
                <Film className="w-8 h-8 text-slate-600 mx-auto" aria-hidden="true" />
                <div className="text-sm font-semibold text-slate-300">
                  {projects.length === 0 ? '尚無任何專案' : '找不到符合的專案'}
                </div>
                <div className="text-xs text-slate-400">
                  {projects.length === 0
                    ? '使用右上角「AI 主題生成 / 匯入」，或從下方範本開始。'
                    : '請嘗試其他搜尋關鍵字或篩選條件。'}
                </div>
              </div>
            ) : (
              <ul className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((item) => {
                  const meta = DOMAIN_META[item.domain] || DOMAIN_META['debug-logic'];
                  const rendered = item.renders.length > 0;
                  return (
                    <li
                      key={item.id}
                      className="flex flex-col rounded-xl border border-slate-800 bg-[#131110] hover:border-slate-600 transition p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="px-1.5 py-0.5 rounded text-[11px] font-bold"
                            style={{ backgroundColor: `${meta.accentColor}22`, color: meta.accentColor }}
                          >
                            {meta.shortLabel}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                              rendered
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {rendered ? `${item.renders.length} 個影片版本` : '草稿'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          aria-label={`刪除專案 ${item.title}`}
                          className="p-2 -m-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <h3 className="mt-3 text-sm font-semibold text-slate-100 line-clamp-2 min-h-[2.5rem]">
                        {item.title}
                      </h3>

                      <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" aria-hidden="true" />
                          {item.sceneCount} 幕
                        </span>
                        <span className="flex items-center gap-1 tabular-nums">
                          <Clock className="w-3 h-3" aria-hidden="true" />
                          {formatDuration(item.totalDurationSeconds)}
                        </span>
                        <span className="ml-auto">
                          {item.latestRenderedAt
                            ? `輸出於 ${formatTimestamp(item.latestRenderedAt)}`
                            : `儲存於 ${formatTimestamp(item.updatedAt)}`}
                        </span>
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={openingId === item.id}
                          onClick={() => void handleOpen(item.id)}
                          className="flex-1 py-2 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                        >
                          {openingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Edit3 className="w-3.5 h-3.5" />
                          )}
                          編輯專案
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenPlayer(item.id)}
                          title={rendered ? '在播放器模式觀看已輸出 MP4 或預覽草稿' : '在播放器模式即時播放此草稿'}
                          className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
                        >
                          <Play
                            className={`w-3.5 h-3.5 ${
                              rendered ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          />
                          {rendered ? '播放影片' : '播放草稿'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="dash-presets">
            <div className="flex items-center gap-2 mb-4">
              <Plus className="w-4 h-4 text-cyan-400" />
              <h2 id="dash-presets" className="text-sm font-bold text-slate-100">
                從範本開始
              </h2>
            </div>
            <ul className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
              {(Object.keys(DOMAIN_META) as TechDomain[]).map((d) => (
                <li key={d}>
                  <button
                    type="button"
                    onClick={() => onCreateFromPreset(d)}
                    className="w-full h-full text-left p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900 transition"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold" style={{ color: DOMAIN_META[d].accentColor }}>
                      <Cpu className="w-4 h-4" aria-hidden="true" />
                      {DOMAIN_META[d].shortLabel}
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed line-clamp-3">
                      {DOMAIN_META[d].description}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          </>
          )}
        </div>
      </main>
    </div>
  );
};
