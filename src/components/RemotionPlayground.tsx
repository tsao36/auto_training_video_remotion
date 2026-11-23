import React, { useState } from 'react';
import {
  ChartColumn,
  Layers3,
  Sparkles,
  Text,
  Timer,
  WandSparkles,
} from 'lucide-react';
import { EFFECT_LABELS, RemotionEffect, TEMPLATE_LABELS, VisualTemplate } from '../types/training';

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

export const RemotionPlayground: React.FC = () => {
  const [category, setCategory] = useState<PlaygroundCategory>('motion');
  const [selected, setSelected] = useState<PlaygroundItem>('signal-pulse');
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
    </section>
  );
};
