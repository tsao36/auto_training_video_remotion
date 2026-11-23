import React, { useEffect, useState } from 'react';
import {
  ChartColumn,
  Layers3,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Text,
  Trash2,
  Timer,
  WandSparkles,
} from 'lucide-react';
import { EFFECT_LABELS, RemotionEffect, TEMPLATE_LABELS, VisualTemplate } from '../types/training';
import { fetchRandomBrandPalette } from '../utils/colorPaletteApi';

type PlaygroundCategory = 'motion' | 'bottom-captions' | 'critical-captions' | 'charts' | 'transitions' | 'templates';
type PlaygroundItem = RemotionEffect | VisualTemplate | 'caption-highlight' | 'karaoke-captions' | 'srt-caption-track' | 'donut-chart' | 'gauge-dial' | 'comparison-bars' | 'blur-reveal' | 'directional-wipe' | 'spatial-push' | 'transition-blinds';

interface CatalogItem {
  id: PlaygroundItem;
  label: string;
  description: string;
  aiUse: string;
}

const CATEGORIES: { key: PlaygroundCategory; label: string; description: string }[] = [
  { key: 'motion', label: '動態效果', description: 'AI 為場景選擇的六種內容動態模式' },
  { key: 'bottom-captions', label: '畫面下方字幕', description: '持續顯示於畫面下方的逐字或外部字幕軌道' },
  { key: 'critical-captions', label: '關鍵資訊字幕', description: '只在重點資訊出現時強調的文字與高亮字幕' },
  { key: 'charts', label: '圖表與儀表', description: '圓餅圖、儀表、比較條與指標卡' },
  { key: 'transitions', label: '場景轉場', description: '模糊、掃掠、推移與百葉窗轉場' },
  { key: 'templates', label: '場景模板', description: 'AI 可組裝的完整視覺場景類型' },
];

const MOTION_DESCRIPTIONS: Record<RemotionEffect, { description: string; aiUse: string }> = {
  'signal-pulse': { description: '在節點之間傳遞脈衝，表現訊號、資料或控制流程方向。', aiUse: '訊號傳輸、資料流、架構連線' },
  'glitch-alert': { description: '加入抖動、雜訊與警示色，突出異常或失敗狀態。', aiUse: '異常偵測、錯誤狀態、干擾警示' },
  'cascade-reveal': { description: '依序啟動階段，讓時序、步驟或交握流程逐級呈現。', aiUse: '協定時序、操作步驟、階層流程' },
  'zoom-focus': { description: '聚焦環與放大呼吸效果吸引注意力到關鍵節點。', aiUse: '核心差異、關鍵參數、重點結論' },
  'sweep-scan': { description: '掃描線來回量測畫面，表現偵測或逐項檢查。', aiUse: '量測動作、程式碼檢查、故障樹' },
  'packet-traffic': { description: '在裝置 A 與 B 間持續投放封包，表現雙向傳輸。', aiUse: '封包模擬、多通道傳輸、收發流程' },
};

const TEMPLATE_DESCRIPTIONS: Record<VisualTemplate, string> = {
  'title-hero': '課程名稱、領域與核心主題的開場版型。',
  'architecture-flow': '節點與連線構成的系統架構流程。',
  'signal-waveform': '量測波形、訊號變化與時間軌跡。',
  'protocol-timeline': '協定參與者之間的互動時間軸。',
  'comparison-matrix': '規格、優劣或產品差異的對照表。',
  'debug-checklist': '除錯步驟與判定條件的檢查表。',
  'packet-frame': '封包欄位、位元長度與數值拆解。',
  'state-machine': '狀態節點與轉移條件圖。',
  'code-log': '程式碼、CLI 或診斷 Log 判讀。',
  'kpi-metrics': '多項效能指標與門檻卡片。',
  'fault-tree': '症狀、檢查與根因決策樹。',
  'packet-simulator': '多通道封包收發與重送模擬。',
  'ofdm-spectrum': '副載波、頻譜與 RU 分配。',
  'beamforming-array': '天線陣列與波束方向。',
  'qam-constellation': '星座圖、EVM 與干擾變動。',
  'mlo-multilink': 'Wi-Fi 7 多鏈路聚合時序。',
  'rf-link-budget': '鏈路增益、損耗與 SNR 預算。',
  'summary-takeaways': '重點結論與實作清單。',
  'pptx-slide': '保留原始投影片版面與內容。',
};

const TEMPLATE_AI_USE: Record<VisualTemplate, string> = {
  'title-hero': '課程開場', 'architecture-flow': '系統架構', 'signal-waveform': '示波器與時序',
  'protocol-timeline': '握手協定', 'comparison-matrix': '規格比較', 'debug-checklist': '故障排查',
  'packet-frame': '封包結構', 'state-machine': '狀態與轉移', 'code-log': '錯誤日誌',
  'kpi-metrics': '效能指標', 'fault-tree': '根因分析', 'packet-simulator': '無線收發模擬',
  'ofdm-spectrum': 'OFDM 頻譜', 'beamforming-array': '天線與波束', 'qam-constellation': '調變與干擾',
  'mlo-multilink': 'MLO 時序', 'rf-link-budget': 'RF 鏈路預算', 'summary-takeaways': '課程總結',
  'pptx-slide': '匯入投影片',
};

const CATALOG: Record<PlaygroundCategory, CatalogItem[]> = {
  motion: (Object.keys(EFFECT_LABELS) as RemotionEffect[]).map((id) => ({
    id,
    label: EFFECT_LABELS[id],
    description: MOTION_DESCRIPTIONS[id].description,
    aiUse: MOTION_DESCRIPTIONS[id].aiUse,
  })),
  'bottom-captions': [
    { id: 'srt-caption-track', label: 'SRT / VTT 下方字幕', description: '由既有字幕檔載入時間碼，以穩定軌道持續顯示在畫面下方。', aiUse: '外部配音、投影片逐字稿、多語字幕' },
    { id: 'karaoke-captions', label: 'Karaoke 下方逐字字幕', description: '畫面下方依時間軌道逐字縮放或畫線，形成朗讀節奏。', aiUse: '逐句解說、教學步驟、口頭重點' },
  ],
  'critical-captions': [
    { id: 'caption-highlight', label: '關鍵資訊 Highlight', description: '只在關鍵數值、協定名稱或重要術語出現時，短暫突顯於畫面資訊層。', aiUse: '警示數值、術語、指令、重要結論' },
  ],
  charts: [
    { id: 'donut-chart', label: '圓環圖 / Pie Chart', description: '分段掃入並同步更新中心總值，適合展示占比與組成。', aiUse: '頻譜占比、頻道分配、資源構成' },
    { id: 'gauge-dial', label: 'Gauge 儀表盤', description: '指針與數值同步掃向目標，適合表現門檻或裕量。', aiUse: 'SNR、S11、功率餘裕、風險指標' },
    { id: 'comparison-bars', label: '前後對照條', description: '成對長條依序成長並標示變化幅度。', aiUse: '產品規格比較、最佳化前後對照' },
  ],
  transitions: [
    { id: 'blur-reveal', label: '模糊淡入轉場', description: '由模糊與縮放進入或退出下一幕。', aiUse: '概念切換、主題切換、柔和過場' },
    { id: 'directional-wipe', label: '方向性 Wipe', description: '由指定方向擦除畫面，保留輕微視差深度。', aiUse: '流程前進、資料流方向、橫向章節' },
    { id: 'spatial-push', label: '空間推移 Push', description: '兩個場景在同一空間軸上推入與推出。', aiUse: '前後場景、分支結果、步驟切換' },
    { id: 'transition-blinds', label: '百葉窗轉場', description: '畫面分成多條帶狀區塊依序揭開。', aiUse: '節奏強烈的章節切換、偵錯流程' },
  ],
  templates: (Object.keys(TEMPLATE_LABELS) as VisualTemplate[]).map((id) => ({
    id,
    label: TEMPLATE_LABELS[id],
    description: TEMPLATE_DESCRIPTIONS[id],
    aiUse: TEMPLATE_AI_USE[id],
  })),
};

const ITEM_ICONS: Record<PlaygroundCategory, React.ComponentType<{ className?: string }>> = {
  motion: WandSparkles,
  'bottom-captions': Text,
  'critical-captions': Sparkles,
  charts: ChartColumn,
  transitions: Layers3,
  templates: Timer,
};

const ItemVisual: React.FC<{ item: PlaygroundItem; large?: boolean }> = ({ item, large = false }) => {
  if (typeof item === 'string' && item in EFFECT_LABELS) {
    const effect = item as RemotionEffect;
    return (
      <div className={`effect-preview ${large ? 'playground-effect-preview' : ''} effect-preview-${effect}`} aria-hidden="true">
        {effect === 'signal-pulse' && <><span className="effect-node effect-node-a" /><span className="effect-line" /><span className="effect-node effect-node-b" /></>}
        {effect === 'glitch-alert' && <><span className="effect-glitch-line effect-glitch-a" /><span className="effect-glitch-line effect-glitch-b" /><span className="effect-glitch-line effect-glitch-c" /></>}
        {effect === 'cascade-reveal' && <><span className="effect-cascade effect-cascade-a" /><span className="effect-cascade effect-cascade-b" /><span className="effect-cascade effect-cascade-c" /></>}
        {effect === 'zoom-focus' && <><span className="effect-focus-ring" /><span className="effect-focus-dot" /></>}
        {effect === 'sweep-scan' && <><span className="effect-sweep-grid" /><span className="effect-sweep-beam" /></>}
        {effect === 'packet-traffic' && <><span className="effect-device effect-device-a">A</span><span className="effect-packet effect-packet-a" /><span className="effect-packet effect-packet-b" /><span className="effect-device effect-device-b">B</span></>}
      </div>
    );
  }

  const visualClass = `catalog-visual ${large ? 'playground-effect-preview' : ''} catalog-visual-${item}`;
  if (item === 'donut-chart') return <div className={visualClass} aria-hidden="true"><span className="catalog-donut" /><span className="catalog-donut-copy">68%</span></div>;
  if (item === 'gauge-dial') return <div className={visualClass} aria-hidden="true"><span className="catalog-gauge-arc" /><span className="catalog-gauge-needle" /><span className="catalog-gauge-value">72 dB</span></div>;
  if (item === 'comparison-bars') return <div className={visualClass} aria-hidden="true"><span className="catalog-bar catalog-bar-a" /><span className="catalog-bar catalog-bar-b" /><span className="catalog-bar catalog-bar-c" /></div>;
  if (item === 'caption-highlight') return <div className={visualClass} aria-hidden="true"><span className="catalog-critical-label">重要資訊</span><span className="catalog-critical-value">SNR +12 dB</span></div>;
  if (item === 'srt-caption-track') return <div className={visualClass} aria-hidden="true"><span className="catalog-bottom-caption">The PHY link is stable</span><span className="catalog-caption-track" /></div>;
  if (item === 'karaoke-captions') return <div className={visualClass} aria-hidden="true"><span className="catalog-bottom-caption catalog-karaoke-line">PHY link is <strong>stable</strong></span><span className="catalog-caption-track" /></div>;
  if (item === 'blur-reveal') return <div className={visualClass} aria-hidden="true"><span className="catalog-blur-panel" /><span className="catalog-blur-orb" /></div>;
  if (item === 'directional-wipe') return <div className={visualClass} aria-hidden="true"><span className="catalog-wipe-panel" /><span className="catalog-wipe-edge" /></div>;
  if (item === 'spatial-push') return <div className={visualClass} aria-hidden="true"><span className="catalog-push-a" /><span className="catalog-push-b" /></div>;
  if (item === 'transition-blinds') return <div className={visualClass} aria-hidden="true">{[0, 1, 2, 3, 4].map((n) => <span key={n} className="catalog-blind" />)}</div>;
  return <div className={visualClass} aria-hidden="true"><span className="catalog-template-bar" /><span className="catalog-template-node catalog-template-node-a" /><span className="catalog-template-node catalog-template-node-b" /><span className="catalog-template-node catalog-template-node-c" /></div>;
};

interface TemplatePreset {
  id: string;
  name: string;
  selections: Record<PlaygroundCategory, PlaygroundItem[]>;
  palette: string[];
}

const PRESET_STORAGE_KEY = 'remotion-training:custom-template-presets';

export const RemotionPlayground: React.FC = () => {
  const [category, setCategory] = useState<PlaygroundCategory>('motion');
  const [selected, setSelected] = useState<PlaygroundItem>('signal-pulse');
  const [presetName, setPresetName] = useState('');
  const [paletteDraft, setPaletteDraft] = useState<string[]>(['#B56876', '#7DD0BC', '#EEEBB6', '#FCAEB2', '#F3667D']);
  const [paletteLoading, setPaletteLoading] = useState(false);
  const [paletteError, setPaletteError] = useState<string | null>(null);
  const [paletteSource, setPaletteSource] = useState<string | null>(null);
  const [presetSelections, setPresetSelections] = useState<Record<PlaygroundCategory, PlaygroundItem[]>>({
    motion: ['signal-pulse'],
    'bottom-captions': ['karaoke-captions'],
    'critical-captions': ['caption-highlight'],
    charts: ['comparison-bars'],
    transitions: ['directional-wipe'],
    templates: ['architecture-flow'],
  });
  const [presets, setPresets] = useState<TemplatePreset[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalized = parsed.map((preset: TemplatePreset & { selections: Record<PlaygroundCategory, PlaygroundItem | PlaygroundItem[]> }) => ({
          ...preset,
          palette: Array.isArray(preset.palette) ? preset.palette.slice(0, 5) : ['#B56876', '#7DD0BC', '#EEEBB6', '#FCAEB2', '#F3667D'],
          selections: Object.fromEntries(
            CATEGORIES.map(({ key }) => [
              key,
              Array.isArray(preset.selections[key])
                ? preset.selections[key]
                : [preset.selections[key]].filter(Boolean),
            ])
          ) as Record<PlaygroundCategory, PlaygroundItem[]>,
        }));
        setPresets(normalized);
      }
    } catch {
      setPresets([]);
    }
  }, []);

  const persistPresets = (next: TemplatePreset[]) => {
    setPresets(next);
    window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const preset: TemplatePreset = {
      id: `preset-${Date.now()}`,
      name,
      selections: { ...presetSelections },
      palette: paletteDraft.filter((color) => /^#[0-9A-Fa-f]{6}$/.test(color)).slice(0, 5),
    };
    persistPresets([preset, ...presets]);
    setPresetName('');
  };

  const loadPreset = (preset: TemplatePreset) => {
    setPresetSelections(preset.selections);
    setPaletteDraft(preset.palette?.length ? preset.palette.slice(0, 5) : ['#B56876', '#7DD0BC', '#EEEBB6', '#FCAEB2', '#F3667D']);
    setPresetName(preset.name);
  };

  const fetchRandomPalette = async () => {
    setPaletteLoading(true);
    setPaletteError(null);
    try {
      const result = await fetchRandomBrandPalette();
      setPaletteDraft([...result.colors].slice(0, 5));
      setPaletteSource(result.name);
    } catch (error) {
      setPaletteError(error instanceof Error ? error.message : '無法取得隨機配色');
    } finally {
      setPaletteLoading(false);
    }
  };

  const togglePresetSelection = (categoryKey: PlaygroundCategory, itemId: PlaygroundItem) => {
    setPresetSelections((current) => {
      const selectedItems = current[categoryKey];
      const nextItems = selectedItems.includes(itemId)
        ? selectedItems.filter((id) => id !== itemId)
        : [...selectedItems, itemId];
      return { ...current, [categoryKey]: nextItems };
    });
  };

  const resolvedCategory = CATALOG[category] ? category : 'motion';
  const visibleItems = CATALOG[resolvedCategory];
  const activeItem = visibleItems.find((item) => item.id === selected) ?? visibleItems[0];
  const CategoryIcon = ITEM_ICONS[resolvedCategory];
  const totalItems = CATEGORIES.reduce((sum, entry) => sum + CATALOG[entry.key].length, 0);

  return (
    <section aria-labelledby="remotion-playground-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h2 id="remotion-playground-heading" className="text-sm font-bold text-slate-100">Remotion Playground</h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">瀏覽與預覽 AI 可組合的動畫、字幕、圖表、轉場及場景模板</p>
        </div>
        <div className="text-[11px] text-slate-500">共 {totalItems} 個可用效果</div>
      </div>

      <div role="tablist" aria-label="Remotion 效果分類" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
        {CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={resolvedCategory === item.key}
            onClick={() => {
              setCategory(item.key);
              setSelected(CATALOG[item.key][0].id);
            }}
            className={`text-left px-3 py-2.5 rounded-lg border transition ${
              resolvedCategory === item.key
                ? 'border-cyan-500/60 bg-cyan-500/10'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
            }`}
          >
            <div className={`text-xs font-bold ${resolvedCategory === item.key ? 'text-cyan-300' : 'text-slate-200'}`}>{item.label}</div>
            <div className="mt-1 text-[10px] text-slate-500 leading-4">{item.description}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.45fr)]">
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleItems.map((item) => {
            const active = activeItem.id === item.id;
            const Icon = ITEM_ICONS[category];
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelected(item.id)}
                className={`group text-left rounded-xl border p-3 transition ${
                  active ? 'border-cyan-400/70 bg-cyan-500/[0.07]' : 'border-slate-800 bg-[#131110] hover:border-slate-600'
                }`}
              >
                <ItemVisual item={item.id} />
                <div className="mt-3 flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-cyan-300' : 'text-slate-500'}`} />
                  <span className={`text-xs font-bold ${active ? 'text-cyan-300' : 'text-slate-200'}`}>{item.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        <aside className="rounded-xl border border-slate-800 bg-[#131110] p-4 min-h-[260px]">
          <ItemVisual item={activeItem.id} large />
          <div className="mt-4 flex items-center gap-2">
            <CategoryIcon className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">{activeItem.label}</h3>
          </div>
          <p className="mt-3 text-xs leading-6 text-slate-300">{activeItem.description}</p>
          <div className="mt-4 pt-3 border-t border-slate-800">
            <div className="text-[10px] font-bold uppercase text-slate-500">AI 選用情境</div>
            <div className="mt-1.5 text-xs text-cyan-200">{activeItem.aiUse}</div>
          </div>
        </aside>
      </div>

      <section aria-labelledby="template-builder-heading" className="border-t border-slate-800 pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" />
              <h2 id="template-builder-heading" className="text-sm font-bold text-slate-100">建立自訂模板組合</h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">每個分類可選多項，組成可儲存的視覺預設。</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') savePreset();
              }}
              placeholder="例如：EC POST 排查版"
              aria-label="自訂模板名稱"
              className="h-9 min-w-0 flex-1 sm:w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={savePreset}
              disabled={!presetName.trim()}
              className="h-9 px-3 rounded-lg border border-cyan-500/50 bg-cyan-500/10 text-cyan-200 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" />
              儲存組合
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {CATEGORIES.map((itemCategory) => (
            <fieldset key={itemCategory.key} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5">
              <legend className="px-1 text-[10px] font-bold uppercase text-slate-500">{itemCategory.label}</legend>
              <div className="mt-1 grid max-h-44 gap-1 overflow-y-auto pr-1">
                {CATALOG[itemCategory.key].map((option) => {
                  const checked = presetSelections[itemCategory.key].includes(option.id);
                  return (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs transition ${
                        checked ? 'bg-cyan-500/10 text-cyan-100' : 'text-slate-300 hover:bg-slate-900'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePresetSelection(itemCategory.key, option.id)}
                        className="mt-0.5 accent-cyan-400"
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500">自訂配色方案（最多 5 色）</div>
              <p className="mt-1 text-[11px] text-slate-400">AI 會依效果語意，在這組色碼中分配主色、次色與警示色。</p>
            </div>
            <button
              type="button"
              onClick={() => void fetchRandomPalette()}
              disabled={paletteLoading}
              className="shrink-0 inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/15 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${paletteLoading ? 'animate-spin' : ''}`} />
              {paletteLoading ? '取得配色中' : '隨機配色'}
            </button>
          </div>
          {(paletteSource || paletteError) && (
            <div className={`mt-2 text-[11px] ${paletteError ? 'text-amber-300' : 'text-slate-500'}`}>
              {paletteError || `來源：${paletteSource}`}
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {paletteDraft.slice(0, 5).map((color, index) => (
              <label key={index} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-2 py-2">
                <input
                  type="color"
                  value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#000000'}
                  onChange={(event) => {
                    const next = [...paletteDraft];
                    next[index] = event.target.value.toUpperCase();
                    setPaletteDraft(next);
                  }}
                  aria-label={`配色 ${index + 1} 色塊`}
                  className="h-8 w-8 shrink-0 rounded border border-slate-700 bg-slate-950 p-1"
                />
                <input
                  type="text"
                  value={color}
                  maxLength={7}
                  aria-label={`配色代碼 ${index + 1}`}
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    const value = raw.startsWith('#') ? raw.toUpperCase() : `#${raw.toUpperCase()}`;
                    const next = [...paletteDraft];
                    next[index] = value.slice(0, 7);
                    setPaletteDraft(next);
                  }}
                  className="min-w-0 w-full bg-transparent text-xs font-semibold uppercase text-slate-100 outline-none"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] px-3 py-3">
          <div className="text-[10px] font-bold uppercase text-cyan-400">組合預覽</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {CATEGORIES.map((itemCategory, index) => {
              const presetItems = CATALOG[itemCategory.key].filter((option) => presetSelections[itemCategory.key].includes(option.id));
              return (
                <React.Fragment key={itemCategory.key}>
                  {index > 0 && <span className="text-slate-600" aria-hidden="true">/</span>}
                  {presetItems.length > 0 ? presetItems.map((presetItem) => (
                    <span key={presetItem.id} className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[11px] text-slate-200">
                      {presetItem.label}
                    </span>
                  )) : (
                    <span className="rounded-md border border-dashed border-slate-700 px-2.5 py-1.5 text-[11px] text-slate-500">
                      未選擇
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {presets.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] font-bold uppercase text-slate-500">已儲存組合</div>
            <div className="mt-2 grid gap-2">
              {presets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => loadPreset(preset)}
                    className="min-w-0 flex-1 text-left text-xs font-bold text-slate-200 hover:text-cyan-300"
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => persistPresets(presets.filter((item) => item.id !== preset.id))}
                    aria-label={`刪除 ${preset.name}`}
                    title="刪除組合"
                    className="w-8 h-8 rounded-md border border-slate-800 text-slate-500 hover:border-red-500/50 hover:text-red-300 inline-grid place-items-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </section>
  );
};
