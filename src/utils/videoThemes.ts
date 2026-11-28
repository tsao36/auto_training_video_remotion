import type { CSSProperties } from 'react';
import type { TechDomain, VideoThemeId } from '../types/training';

export type VideoThemeChoice = VideoThemeId | 'auto';

export interface VideoThemeDefinition {
  id: VideoThemeId;
  name: string;
  description: string;
  previewColors: [string, string, string];
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize: string;
  accentColor: string;
  secondaryAccent: string;
  panelSurface: string;
  panelBorder: string;
  hudSurface: string;
  captionSurface: string;
  titleFontFamily: string;
  labelFontFamily: string;
  titleWeight: number;
  titleLetterSpacing: string;
  patternLabel: string;
  motion: 'grid-scan' | 'drafting-reticle' | 'carbon-sweep' | 'aurora-flow' | 'thermal-trace';
  layout: 'instrument-dock' | 'drafting-sheet' | 'split-console' | 'flow-canvas' | 'lab-notebook';
  scenePadding: string;
  panelRadius: number;
  gridDrift?: number;
}

export const VIDEO_THEMES: VideoThemeDefinition[] = [
  {
    id: 'signal-grid',
    name: '精密訊號網格',
    description: 'OLED 深色底，理性網格與冷光焦點',
    previewColors: ['#030712', '#38bdf8', '#0ea5e9'],
    backgroundColor: '#030712',
    backgroundImage: 'radial-gradient(circle at 76% 28%, rgba(14,165,233,.16), transparent 24%), linear-gradient(rgba(56,189,248,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.045) 1px, transparent 1px)',
    backgroundSize: 'auto, 48px 48px, 48px 48px',
    accentColor: '#38bdf8',
    secondaryAccent: '#0ea5e9',
    panelSurface: 'rgba(7,16,30,.84)',
    panelBorder: 'rgba(56,189,248,.34)',
    hudSurface: 'rgba(3,7,18,.9)',
    captionSurface: 'rgba(3,7,18,.94)',
    titleFontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
    labelFontFamily: 'JetBrains Mono, Consolas, monospace',
    titleWeight: 800,
    titleLetterSpacing: '-0.02em',
    patternLabel: 'GRID / 48 PX',
    motion: 'grid-scan',
    layout: 'instrument-dock',
    scenePadding: '108px 72px 138px',
    panelRadius: 12,
    gridDrift: 48,
  },
  {
    id: 'blueprint',
    name: '光學工程藍圖',
    description: '深藍製圖紙、量測尺與雙層網格',
    previewColors: ['#061a33', '#a5f3fc', '#60a5fa'],
    backgroundColor: '#061a33',
    backgroundImage: 'radial-gradient(circle at 50% 48%, rgba(96,165,250,.12), transparent 32%), linear-gradient(rgba(165,243,252,.11) 1px, transparent 1px), linear-gradient(90deg, rgba(165,243,252,.11) 1px, transparent 1px), linear-gradient(rgba(165,243,252,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(165,243,252,.03) 1px, transparent 1px)',
    backgroundSize: 'auto, 160px 160px, 160px 160px, 20px 20px, 20px 20px',
    accentColor: '#a5f3fc',
    secondaryAccent: '#60a5fa',
    panelSurface: 'rgba(4,30,58,.82)',
    panelBorder: 'rgba(165,243,252,.4)',
    hudSurface: 'rgba(6,26,51,.9)',
    captionSurface: 'rgba(3,20,39,.94)',
    titleFontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
    labelFontFamily: 'JetBrains Mono, Consolas, monospace',
    titleWeight: 750,
    titleLetterSpacing: '0em',
    patternLabel: 'DWG / REV.04',
    motion: 'drafting-reticle',
    layout: 'drafting-sheet',
    scenePadding: '96px 110px 144px 150px',
    panelRadius: 4,
    gridDrift: 20,
  },
  {
    id: 'carbon-lines',
    name: '石墨切面',
    description: '碳纖斜紋、檸檬光標與硬體質感',
    previewColors: ['#0b0d0c', '#d7ff55', '#68736c'],
    backgroundColor: '#0b0d0c',
    backgroundImage: 'linear-gradient(112deg, rgba(215,255,85,.07), transparent 34%), repeating-linear-gradient(135deg, rgba(255,255,255,.025) 0 1px, transparent 1px 10px), repeating-linear-gradient(45deg, rgba(255,255,255,.018) 0 1px, transparent 1px 10px)',
    backgroundSize: 'auto, auto, auto',
    accentColor: '#d7ff55',
    secondaryAccent: '#8fa39a',
    panelSurface: 'rgba(15,19,17,.9)',
    panelBorder: 'rgba(215,255,85,.28)',
    hudSurface: 'rgba(11,13,12,.92)',
    captionSurface: 'rgba(8,10,9,.95)',
    titleFontFamily: 'IBM Plex Sans, "Noto Sans TC", system-ui, sans-serif',
    labelFontFamily: 'JetBrains Mono, Consolas, monospace',
    titleWeight: 700,
    titleLetterSpacing: '0.01em',
    patternLabel: 'CARBON / 3K',
    motion: 'carbon-sweep',
    layout: 'split-console',
    scenePadding: '112px 64px 132px 210px',
    panelRadius: 2,
  },
  {
    id: 'aurora-flow',
    name: '資料極光',
    description: '深綠流場與青藍光帶，適合系統架構',
    previewColors: ['#031513', '#5eead4', '#60a5fa'],
    backgroundColor: '#031513',
    backgroundImage: 'linear-gradient(118deg, rgba(45,212,191,.18), transparent 30%), radial-gradient(ellipse at 80% 26%, rgba(96,165,250,.18), transparent 28%), radial-gradient(ellipse at 20% 78%, rgba(45,212,191,.1), transparent 34%)',
    backgroundSize: 'auto, auto, auto',
    accentColor: '#5eead4',
    secondaryAccent: '#60a5fa',
    panelSurface: 'rgba(4,26,23,.8)',
    panelBorder: 'rgba(94,234,212,.3)',
    hudSurface: 'rgba(3,21,19,.88)',
    captionSurface: 'rgba(2,17,15,.93)',
    titleFontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
    labelFontFamily: 'IBM Plex Sans, sans-serif',
    titleWeight: 750,
    titleLetterSpacing: '-0.015em',
    patternLabel: 'FLOW / LIVE',
    motion: 'aurora-flow',
    layout: 'flow-canvas',
    scenePadding: '108px 92px 148px',
    panelRadius: 28,
  },
  {
    id: 'thermal-paper',
    name: '銅色實驗室',
    description: '暖炭紙面、量測刻度與琥珀警示',
    previewColors: ['#18100c', '#f6bd6b', '#d56a4a'],
    backgroundColor: '#18100c',
    backgroundImage: 'radial-gradient(circle at 80% 22%, rgba(213,106,74,.14), transparent 26%), linear-gradient(90deg, rgba(246,189,107,.05) 1px, transparent 1px), linear-gradient(rgba(246,189,107,.05) 1px, transparent 1px)',
    backgroundSize: 'auto, 72px 72px, 72px 72px',
    accentColor: '#f6bd6b',
    secondaryAccent: '#d56a4a',
    panelSurface: 'rgba(38,24,17,.84)',
    panelBorder: 'rgba(246,189,107,.32)',
    hudSurface: 'rgba(24,16,12,.92)',
    captionSurface: 'rgba(20,13,9,.94)',
    titleFontFamily: 'IBM Plex Sans, "Noto Sans TC", system-ui, sans-serif',
    labelFontFamily: 'JetBrains Mono, Consolas, monospace',
    titleWeight: 700,
    titleLetterSpacing: '0em',
    patternLabel: 'LAB / CAL.01',
    motion: 'thermal-trace',
    layout: 'lab-notebook',
    scenePadding: '100px 92px 144px 128px',
    panelRadius: 8,
  },
];

export const VALID_VIDEO_THEME_IDS: VideoThemeId[] = VIDEO_THEMES.map((theme) => theme.id);

export const isVideoThemeId = (value: unknown): value is VideoThemeId =>
  typeof value === 'string' && VALID_VIDEO_THEME_IDS.includes(value as VideoThemeId);

export const inferVideoThemeFromContext = (
  topic: string,
  rawText?: string,
  domain?: TechDomain,
): { videoTheme: VideoThemeId; videoThemeReason: string } => {
  const text = `${topic} ${rawText || ''}`.toLowerCase();
  if (/pcb|schematic|layout|cad|blueprint|製圖|電路圖|封裝|機械|結構設計|腳位|pinout|架構圖/.test(text)) {
    return {
      videoTheme: 'blueprint',
      videoThemeReason: '主題偏向硬體架構、製圖與系統拓撲，搭配光學工程藍圖最清晰。',
    };
  }
  if (/thermal|熱管理|散熱|power|電源|量測|示波器|oscilloscope|calibration|校正|類比|analog|audio|聲學|實驗/.test(text)) {
    return {
      videoTheme: 'thermal-paper',
      videoThemeReason: '主題涉及量測實驗、電源或熱分析，搭配銅色實驗室風格更貼近儀器筆記感。',
    };
  }
  if (/ai|llm|agent|cloud|data|資料|雲端|軟體|ui|ux|product|wi-?fi|mlo|bluetooth|無線|串流|網路|flow/.test(text) || domain === 'wifi' || domain === 'bluetooth') {
    return {
      videoTheme: 'aurora-flow',
      videoThemeReason: '主題著重動態資料流、無線協作或現代軟體介面，搭配資料極光最具流場層次。',
    };
  }
  if (/kernel|linux|driver|cli|security|資安|效能|benchmark|gpu|cpu|compiler|韌體|firmware|碳/.test(text)) {
    return {
      videoTheme: 'carbon-lines',
      videoThemeReason: '主題聚焦底層系統、效能調校或命令列實務，搭配石墨切面高對比最俐落。',
    };
  }
  return {
    videoTheme: 'signal-grid',
    videoThemeReason: '主題涵蓋綜合工程與訊號分析，搭配精密訊號網格可兼顧圖表與 Remotion 元件可讀性。',
  };
};

export const getVideoTheme = (id?: VideoThemeId): VideoThemeDefinition =>
  VIDEO_THEMES.find((theme) => theme.id === id) ?? VIDEO_THEMES[0];

export const getVideoThemeStyle = (
  id?: VideoThemeId,
  frame = 0,
): CSSProperties => {
  const theme = getVideoTheme(id);
  const drift = theme.gridDrift ? (frame * 0.4) % theme.gridDrift : 0;
  return {
    backgroundColor: theme.backgroundColor,
    backgroundImage: theme.backgroundImage,
    backgroundSize: theme.backgroundSize,
    backgroundPosition: drift ? `${drift}px ${drift}px` : undefined,
  };
};
