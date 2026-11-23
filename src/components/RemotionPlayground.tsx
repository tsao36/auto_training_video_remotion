import React, { useState } from 'react';
import { Activity, AlertTriangle, Radio, ScanLine, Sparkles, Target } from 'lucide-react';
import { EFFECT_LABELS, RemotionEffect } from '../types/training';

type EffectCategory = 'transport' | 'sequence' | 'inspection';

const EFFECT_CATEGORIES: {
  key: EffectCategory;
  label: string;
  description: string;
  effects: RemotionEffect[];
}[] = [
  {
    key: 'transport',
    label: '訊號與傳輸',
    description: '適合表現訊號流動、通訊或封包移動',
    effects: ['signal-pulse', 'packet-traffic'],
  },
  {
    key: 'sequence',
    label: '時序與聚焦',
    description: '適合逐步揭示流程、比較或關鍵節點',
    effects: ['cascade-reveal', 'zoom-focus'],
  },
  {
    key: 'inspection',
    label: '異常與掃描',
    description: '適合量測、偵錯、警示與檢查動作',
    effects: ['glitch-alert', 'sweep-scan'],
  },
];

const EFFECT_DETAILS: Record<RemotionEffect, {
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  useFor: string;
}> = {
  'signal-pulse': {
    icon: Activity,
    description: '在節點之間傳遞一個明顯脈衝，表現訊號、資料或控制流程的方向。',
    useFor: '訊號傳輸、資料流、架構連線',
  },
  'glitch-alert': {
    icon: AlertTriangle,
    description: '加入抖動、雜訊與警示色，突出異常、壓降或失敗狀態。',
    useFor: '異常偵測、錯誤狀態、干擾警示',
  },
  'cascade-reveal': {
    icon: Sparkles,
    description: '依序啟動三個階段，讓時序、步驟或交握流程逐級呈現。',
    useFor: '協定時序、操作步驟、階層流程',
  },
  'zoom-focus': {
    icon: Target,
    description: '以聚焦環與放大呼吸效果吸引注意力到單一關鍵節點或差異。',
    useFor: '核心差異、關鍵參數、重點結論',
  },
  'sweep-scan': {
    icon: ScanLine,
    description: '掃描線來回量測畫面，表現示波器、偵測或逐項檢查。',
    useFor: '量測動作、程式碼檢查、故障樹',
  },
  'packet-traffic': {
    icon: Radio,
    description: '在裝置 A 與 B 之間持續投放封包，表現雙向網路或無線傳輸。',
    useFor: '封包模擬、多通道傳輸、收發流程',
  },
};

const EffectVisual: React.FC<{ effect: RemotionEffect }> = ({ effect }) => (
  <div className={`effect-preview playground-effect-preview effect-preview-${effect}`} aria-hidden="true">
    {effect === 'signal-pulse' && (
      <><span className="effect-node effect-node-a" /><span className="effect-line" /><span className="effect-node effect-node-b" /></>
    )}
    {effect === 'glitch-alert' && (
      <><span className="effect-glitch-line effect-glitch-a" /><span className="effect-glitch-line effect-glitch-b" /><span className="effect-glitch-line effect-glitch-c" /></>
    )}
    {effect === 'cascade-reveal' && (
      <><span className="effect-cascade effect-cascade-a" /><span className="effect-cascade effect-cascade-b" /><span className="effect-cascade effect-cascade-c" /></>
    )}
    {effect === 'zoom-focus' && (
      <><span className="effect-focus-ring" /><span className="effect-focus-dot" /></>
    )}
    {effect === 'sweep-scan' && (
      <><span className="effect-sweep-grid" /><span className="effect-sweep-beam" /></>
    )}
    {effect === 'packet-traffic' && (
      <><span className="effect-device effect-device-a">A</span><span className="effect-packet effect-packet-a" /><span className="effect-packet effect-packet-b" /><span className="effect-device effect-device-b">B</span></>
    )}
  </div>
);

export const RemotionPlayground: React.FC = () => {
  const [category, setCategory] = useState<EffectCategory>('transport');
  const [selected, setSelected] = useState<RemotionEffect>('signal-pulse');

  const visibleEffects = EFFECT_CATEGORIES.find((item) => item.key === category)?.effects ?? [];

  return (
    <section aria-labelledby="remotion-playground-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h2 id="remotion-playground-heading" className="text-sm font-bold text-slate-100">Remotion Playground</h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">預覽 AI 可為場景選擇的動態效果與適用情境</p>
        </div>
        <div className="text-[11px] text-slate-500">共 {Object.keys(EFFECT_LABELS).length} 種效果</div>
      </div>

      <div role="tablist" aria-label="Remotion 效果分類" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {EFFECT_CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={category === item.key}
            onClick={() => {
              setCategory(item.key);
              setSelected(item.effects[0]);
            }}
            className={`text-left px-3.5 py-3 rounded-lg border transition ${
              category === item.key
                ? 'border-cyan-500/60 bg-cyan-500/10'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
            }`}
          >
            <div className={`text-xs font-bold ${category === item.key ? 'text-cyan-300' : 'text-slate-200'}`}>
              {item.label}
            </div>
            <div className="mt-1 text-[10px] text-slate-500">{item.description}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleEffects.map((effect) => {
            const detail = EFFECT_DETAILS[effect];
            const active = selected === effect;
            const Icon = detail.icon;
            return (
              <button
                key={effect}
                type="button"
                aria-pressed={active}
                onClick={() => setSelected(effect)}
                className={`group text-left rounded-xl border p-3 transition ${
                  active
                    ? 'border-cyan-400/70 bg-cyan-500/[0.07]'
                    : 'border-slate-800 bg-[#131110] hover:border-slate-600'
                }`}
              >
                <EffectVisual effect={effect} />
                <div className="mt-3 flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 ${active ? 'text-cyan-300' : 'text-slate-500'}`} />
                  <span className={`text-xs font-bold ${active ? 'text-cyan-300' : 'text-slate-200'}`}>
                    {EFFECT_LABELS[effect]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <aside className="rounded-xl border border-slate-800 bg-[#131110] p-4 min-h-[260px]">
          {(() => {
            const detail = EFFECT_DETAILS[selected];
            const Icon = detail.icon;
            return (
              <>
                <EffectVisual effect={selected} />
                <div className="mt-4 flex items-center gap-2">
                  <Icon className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">{EFFECT_LABELS[selected]}</h3>
                </div>
                <p className="mt-3 text-xs leading-6 text-slate-300">{detail.description}</p>
                <div className="mt-4 pt-3 border-t border-slate-800">
                  <div className="text-[10px] font-bold uppercase text-slate-500">AI 選用情境</div>
                  <div className="mt-1.5 text-xs text-cyan-200">{detail.useFor}</div>
                </div>
              </>
            );
          })()}
        </aside>
      </div>
    </section>
  );
};
