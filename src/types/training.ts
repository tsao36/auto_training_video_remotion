export type TechDomain = 'debug-logic' | 'wifi' | 'bluetooth' | 'rf';

export type VisualTemplate =
  | 'title-hero'
  | 'architecture-flow'
  | 'signal-waveform'
  | 'protocol-timeline'
  | 'comparison-matrix'
  | 'debug-checklist'
  | 'summary-takeaways';

export type TtsProvider = 'openformosa' | 'ming-3.0' | 'browser-fallback';

export const CONTENT_LANGUAGES = [
  {
    value: 'en-US',
    label: 'English',
    promptName: 'English',
    edgeVoice: 'en-US-JennyNeural',
    charsPerSecond: 14,
  },
  {
    value: 'zh-TW',
    label: '繁體中文（台灣）',
    promptName: 'Traditional Chinese as used in Taiwan',
    edgeVoice: 'zh-TW-HsiaoChenNeural',
    charsPerSecond: 4,
  },
  {
    value: 'zh-CN',
    label: '简体中文（中国）',
    promptName: 'Simplified Chinese as used in mainland China',
    edgeVoice: 'zh-CN-XiaoxiaoNeural',
    charsPerSecond: 4,
  },
  {
    value: 'ja-JP',
    label: '日本語',
    promptName: 'Japanese',
    edgeVoice: 'ja-JP-NanamiNeural',
    charsPerSecond: 7,
  },
  {
    value: 'ko-KR',
    label: '한국어',
    promptName: 'Korean',
    edgeVoice: 'ko-KR-SunHiNeural',
    charsPerSecond: 7,
  },
] as const;

export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number]['value'];
export const DEFAULT_CONTENT_LANGUAGE: ContentLanguage = 'zh-TW';

export function getContentLanguage(language?: string) {
  return CONTENT_LANGUAGES.find((item) => item.value === language) || CONTENT_LANGUAGES[1];
}

export type MotionStyle = 'spring-snappy' | 'smooth-sweep' | 'step-reveal';

export type RemotionEffect =
  | 'signal-pulse'
  | 'glitch-alert'
  | 'cascade-reveal'
  | 'zoom-focus'
  | 'sweep-scan';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface DiagramNode {
  id: string;
  label: string;
  sublabel?: string;
  color?: string;
}

export interface ProtocolStep {
  actor: string;
  target: string;
  message: string;
  timing?: string;
}

export interface ComparisonRow {
  metric: string;
  optionA: string;
  optionB: string;
  highlight?: 'A' | 'B' | 'both';
}

export interface SceneDiagramData {
  nodes?: DiagramNode[];
  waveformFreqHz?: number;
  waveformChannels?: { label: string; color: string; type: 'clock' | 'data' | 'rf-sine' | 'ofdma' }[];
  protocolSteps?: ProtocolStep[];
  comparisonHeaders?: [string, string];
  comparisonRows?: ComparisonRow[];
  badgeText?: string;
  highlightNodeIndex?: number;
  faultChannelIndex?: number;
  activeStepIndex?: number;
  visualCaption?: string;
}

export interface SceneTtsState {
  provider: TtsProvider;
  voiceId: string;
  speed: number;
  audioUrl?: string;
  status: 'idle' | 'generating' | 'ready' | 'error';
  actualDurationSec?: number;
  error?: string;
}

export interface SceneAnimationConfig {
  motionStyle: MotionStyle;
  effect?: RemotionEffect;
  accentColor: string;
  showSubtitles: boolean;
  showProgressHud: boolean;
}

export interface SentenceEffectCue {
  id: string;
  beatIndex: number;
  sentences: string[];
  startRatio: number;
  endRatio: number;
  effect: RemotionEffect;
  targetIndex?: number;
  rationale: string;
}

export interface SceneSpec {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  domain: TechDomain;
  template: VisualTemplate;
  durationSeconds: number;
  keyPoints: string[];
  script: string;
  visualDescription?: string;
  diagramData?: SceneDiagramData;
  tts: SceneTtsState;
  animation: SceneAnimationConfig;
  sentenceCues?: SentenceEffectCue[];
}

export interface TtsEngineConfig {
  defaultProvider: 'openformosa' | 'ming-3.0';
  openformosa: {
    baseUrl: string;
    apiKey: string;
    model: string;
    voice: string;
  };
  mingTts: {
    baseUrl: string;
    apiKey: string;
    model: string;
    speaker: string;
    style: string;
  };
}

export interface TrainingProject {
  id: string;
  title: string;
  subtitle: string;
  language?: ContentLanguage;
  topic?: string;
  domain: TechDomain;
  targetDurationSeconds: number;
  fps: number; // 30
  width: number; // 1920
  height: number; // 1080
  sourceType: 'topic-llm' | 'pptx' | 'pdf' | 'research-text' | 'preset';
  sourceFileName?: string;
  rawSourceText: string;
  llmConfig?: LlmConfig;
  ttsConfig: TtsEngineConfig;
  scenes: SceneSpec[];
}

export interface RenderedVideoRecord {
  jobId: string;
  outputUrl: string;
  renderedAt: string;
  durationSeconds: number;
  sceneCount: number;
  isPreview?: boolean;
  previewSceneIndex?: number;
}

export interface SavedProjectSummary {
  id: string;
  title: string;
  subtitle: string;
  domain: TechDomain;
  sceneCount: number;
  totalDurationSeconds: number;
  updatedAt: string;
  latestVideoUrl?: string;
  latestRenderedAt?: string;
  renders: RenderedVideoRecord[];
}

export interface SavedProjectRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  renders: RenderedVideoRecord[];
  project: TrainingProject;
}

export const TARGET_VIDEO_DURATION_SECONDS = 600; // 10 minutes
export const VIDEO_FPS = 30;
export const TARGET_TOTAL_FRAMES = TARGET_VIDEO_DURATION_SECONDS * VIDEO_FPS; // 18,000 frames

export const DOMAIN_META: Record<
  TechDomain,
  {
    label: string;
    shortLabel: string;
    accentColor: string;
    secondaryColor: string;
    description: string;
    badge: string;
  }
> = {
  'debug-logic': {
    label: 'Debug Common Logic (PC/Laptop)',
    shortLabel: 'Debug Logic',
    accentColor: '#00C2FF',
    secondaryColor: '#0071C5',
    description: 'EC/BIOS POST 時序、Power Rail 異常排查、PCIe/I2C/SPI 邏輯分析與 Root-Cause 決策樹',
    badge: 'PC DEBUG & BRING-UP',
  },
  wifi: {
    label: 'Wi-Fi Technology (802.11ax/be)',
    shortLabel: 'Wi-Fi Tech',
    accentColor: '#38BDF8',
    secondaryColor: '#0284C7',
    description: '筆電 CNVi / M.2 PCIe 無線架構、Wi-Fi 6E/7 OFDMA、320MHz 頻寬、MLO 多鏈路與天線隔離',
    badge: 'WI-FI 6E / 7 ARCHITECTURE',
  },
  bluetooth: {
    label: 'Bluetooth Technology (Classic / BLE)',
    shortLabel: 'Bluetooth',
    accentColor: '#60A5FA',
    secondaryColor: '#2563EB',
    description: 'BT Classic 與 BLE / LE Audio 協定棧、HCI UART/USB 傳輸、2.4GHz Wi-Fi/BT 共存機制',
    badge: 'BLUETOOTH & COEXISTENCE',
  },
  rf: {
    label: 'Radio Frequency (RF) Engineering',
    shortLabel: 'RF Tech',
    accentColor: '#A78BFA',
    secondaryColor: '#7C3AED',
    description: '筆電金屬機殼天線調諧、S11/S21 參數量測、USB3/DDR EMI 去敏化 (Desense) 與 SAR 法規測試',
    badge: 'RF & ANTENNA SYSTEM',
  },
};

export const TEMPLATE_LABELS: Record<VisualTemplate, string> = {
  'title-hero': '課程開場 Hero',
  'architecture-flow': '系統架構動態流',
  'signal-waveform': '訊號波形與時序',
  'protocol-timeline': '協定互動時間軸',
  'comparison-matrix': '技術規格對照表',
  'debug-checklist': '除錯決策檢查表',
  'summary-takeaways': '重點總結與實作',
};

export const EFFECT_LABELS: Record<RemotionEffect, string> = {
  'signal-pulse': '訊號脈衝傳輸 (Signal Pulse)',
  'glitch-alert': '異常抖動/雜訊警示 (Glitch Alert)',
  'cascade-reveal': '逐級時序推進 (Cascade Reveal)',
  'zoom-focus': '關鍵節點聚焦 (Zoom Focus)',
  'sweep-scan': '掃描線檢測 (Sweep Scan)',
};
