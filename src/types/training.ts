import type { Caption } from '@remotion/captions';

export type TechDomain = 'debug-logic' | 'wifi' | 'bluetooth' | 'rf';

export type VisualTemplate =
  | 'title-hero'
  | 'architecture-flow'
  | 'signal-waveform'
  | 'protocol-timeline'
  | 'comparison-matrix'
  | 'debug-checklist'
  | 'packet-frame'
  | 'state-machine'
  | 'code-log'
  | 'kpi-metrics'
  | 'fault-tree'
  | 'packet-simulator'
  | 'ofdm-spectrum'
  | 'beamforming-array'
  | 'qam-constellation'
  | 'mlo-multilink'
  | 'rf-link-budget'
  | 'summary-takeaways'
  | 'pptx-slide';

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
  | 'sweep-scan'
  | 'packet-traffic';

export type RemotionPrimitive = string;

export type LlmProvider = 'intel-gnai' | 'openai-compatible' | 'local';

export interface LlmConfig {
  provider?: LlmProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface TrainingBrief {
  audience: string;
  objective: string;
  tone: 'calm-instructional' | 'editorial' | 'technical-documentary';
  sourceUrls: string[];
}

export interface ResearchSourceRecord {
  url: string;
  requestedUrl?: string;
  title: string;
  chars: number;
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

export interface PacketField {
  name: string;
  bits: string;
  value?: string;
  description?: string;
  color?: string;
  highlight?: boolean;
}

export interface StateMachineNode {
  id: string;
  label: string;
  sublabel?: string;
  status?: 'normal' | 'active' | 'error' | 'success';
}

export interface StateMachineTransition {
  from: string;
  to: string;
  trigger: string;
  isErrorPath?: boolean;
}

export interface CodeLogLine {
  lineNo?: number;
  text: string;
  level?: 'normal' | 'highlight' | 'warn' | 'error' | 'success';
  annotation?: string;
}

export interface KpiMetricItem {
  label: string;
  value: string;
  delta?: string;
  target?: string;
  status?: 'good' | 'warn' | 'bad' | 'neutral';
}

export interface FaultTreeBranch {
  symptom: string;
  check: string;
  passAction: string;
  failRootCause: string;
  severity?: 'high' | 'medium' | 'low';
}

export interface PacketSimChannel {
  id: string;
  label: string;
  band: string;
  bandwidth?: string;
  color: string;
  interference?: boolean;
}

export interface PacketSimEvent {
  seq: number;
  channelId: string;
  direction: 'A->B' | 'B->A';
  label: string;
  sizeBytes?: number;
  status?: 'ok' | 'retry' | 'drop' | 'ack';
}

export interface OfdmRuBlock {
  label: string;
  tones: string;
  widthRatio: number;
  color: string;
  punctured?: boolean;
}

export interface MloLinkLane {
  band: string;
  channel: string;
  bandwidth: string;
  color: string;
  throughputMbps: number;
  mode?: 'STR' | 'EMLSR' | 'NSTR';
}

export interface RfLinkBudgetStage {
  label: string;
  deltaDb: number;
  note?: string;
  type: 'tx' | 'gain' | 'loss' | 'rx';
}

export interface SceneDiagramData {
  nodes?: DiagramNode[];
  waveformFreqHz?: number;
  waveformChannels?: { label: string; color: string; type: 'clock' | 'data' | 'rf-sine' | 'ofdma' }[];
  protocolSteps?: ProtocolStep[];
  comparisonHeaders?: [string, string];
  comparisonRows?: ComparisonRow[];
  packetFields?: PacketField[];
  stateNodes?: StateMachineNode[];
  stateTransitions?: StateMachineTransition[];
  codeLanguage?: string;
  codeTitle?: string;
  codeLines?: CodeLogLine[];
  kpiMetrics?: KpiMetricItem[];
  faultRoot?: string;
  faultBranches?: FaultTreeBranch[];
  // Wireless-heavy template data
  simDeviceA?: { name: string; role: string; ipOrMac?: string };
  simDeviceB?: { name: string; role: string; ipOrMac?: string };
  simChannels?: PacketSimChannel[];
  simPackets?: PacketSimEvent[];
  ofdmBandwidthMhz?: number;
  ofdmRuBlocks?: OfdmRuBlock[];
  beamformingElements?: number;
  beamformingTargetAngleDeg?: number;
  beamformingTargetLabel?: string;
  qamOrder?: 16 | 64 | 256 | 1024;
  qamSnrDb?: number;
  qamEvmDb?: number;
  mloLinks?: MloLinkLane[];
  rfLinkStages?: RfLinkBudgetStage[];
  rfSensitivityDbm?: number;
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

export interface PptxFill {
  type: 'solid' | 'gradient' | 'image' | 'none';
  color?: string;
  opacity?: number;
  gradientAngleDeg?: number;
  gradientStops?: { position: number; color: string }[];
  imageUrl?: string;
}

export interface PptxTextRun {
  text: string;
  fontSizePx?: number;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

export interface PptxTextParagraph {
  align?: 'left' | 'center' | 'right' | 'justify';
  bullet?: string;
  level?: number;
  spaceBeforePx?: number;
  spaceAfterPx?: number;
  lineHeight?: number;
  runs: PptxTextRun[];
}

export interface PptxTableCell {
  textParagraphs: PptxTextParagraph[];
  fill?: PptxFill;
  borderColor?: string;
  borderWidthPx?: number;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  colSpan?: number;
  rowSpan?: number;
  skip?: boolean;
}

export interface PptxElement {
  id: string;
  kind: 'shape' | 'image' | 'table' | 'connector';
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg?: number;
  flipH?: boolean;
  flipV?: boolean;
  shapeType?: string;
  fill?: PptxFill;
  strokeColor?: string;
  strokeWidthPx?: number;
  strokeDash?: string;
  headArrow?: boolean;
  tailArrow?: boolean;
  imageUrl?: string;
  cropRect?: { left: number; top: number; right: number; bottom: number };
  paragraphs?: PptxTextParagraph[];
  verticalAlign?: 'top' | 'middle' | 'bottom';
  paddingPx?: { top: number; right: number; bottom: number; left: number };
  tableColWidths?: number[];
  tableRows?: { height: number; cells: PptxTableCell[] }[];
}

export interface PptxSlideData {
  slideNumber: number;
  slideWidthPx: number;
  slideHeightPx: number;
  background: PptxFill;
  elements: PptxElement[];
  title: string;
  bodyText: string;
  notes?: string;
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
  remotionPrimitives?: RemotionPrimitive[];
  diagramData?: SceneDiagramData;
  pptxSlide?: PptxSlideData;
  pptxNotes?: string;
  tts: SceneTtsState;
  animation: SceneAnimationConfig;
  sentenceCues?: SentenceEffectCue[];
  captions?: Caption[];
}

export interface BackgroundMusicConfig {
  url: string;
  fileName: string;
  volume: number;
  loop: boolean;
  licenseNote?: string;
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
  customVoice?: {
    profileId?: string;
    fileName: string;
    name: string;
    durationSec?: number;
    provider?: 'openformosa' | 'ming-3.0';
    remoteVoiceId?: string;
  };
}

export type VoiceProfileProvider = 'openformosa' | 'ming-3.0';
export type VoiceProfileTrainingStatus = 'untrained' | 'trained' | 'reference-only' | 'failed';

export interface VoiceProfile {
  id: string;
  name: string;
  fileName: string;
  durationSec?: number;
  createdAt: string;
  provider?: VoiceProfileProvider;
  model?: string;
  trainingStatus?: VoiceProfileTrainingStatus;
  remoteVoiceId?: string;
  trainedAt?: string;
  trainingNote?: string;
  referenceText?: string;
}

export interface VideoCaptionStyle {
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700 | 800;
  bottomOffset: number;
  maxWidth: number;
  backgroundOpacity: number;
}

export type VideoThemeId =
  | 'signal-grid'
  | 'blueprint'
  | 'carbon-lines'
  | 'aurora-flow'
  | 'thermal-paper';

export interface TrainingProject {
  id: string;
  title: string;
  subtitle: string;
  language?: ContentLanguage;
  topic?: string;
  odmMode?: boolean;
  brief?: TrainingBrief;
  domain: TechDomain;
  targetDurationSeconds: number;
  fps: number; // 30
  width: number; // 1920
  height: number; // 1080
  sourceType: 'topic-llm' | 'pptx' | 'pdf' | 'research-text';
  sourceFileName?: string;
  rawSourceText: string;
  researchSources?: ResearchSourceRecord[];
  backgroundMusic?: BackgroundMusicConfig;
  captionStyle?: Partial<VideoCaptionStyle>;
  videoTheme?: VideoThemeId;
  technicalTermsWhitelist?: {
    terms: string[];
    generatedAt?: string;
    reviewedAt?: string;
  };
  llmConfig?: LlmConfig;
  ttsConfig: TtsEngineConfig;
  // When true, TTS is not auto-generated on open; the user starts it after reviewing the script.
  ttsDeferred?: boolean;
  colorScheme?: {
    preset: 'domain' | 'champagne' | 'blueprint' | 'sage' | 'coral' | 'mono' | 'custom';
    primary: string;
    secondary: string;
    surface: string;
    palette?: string[];
  };
  aiGenerationStages?: {
    input: {
      topic: string;
      rawText: string;
      sourceType: TrainingProject['sourceType'];
      sourceFileName?: string;
      odmMode?: boolean;
      language?: ContentLanguage;
      targetDurationSeconds?: number;
      fps?: number;
      width?: number;
      height?: number;
    };
    source: {
      topic: string;
      rawText: string;
      pptxSlideCount?: number;
      usedSources?: Array<{ kind: 'topic' | 'research' | 'pptx' | 'pdf'; label: string; chars: number }>;
      logicNotes?: string[];
    };
    outline: { title: string; subtitle: string; domain: TechDomain; scenes: Array<Partial<SceneSpec>> };
    remotionJson: { json: string };
  };
  scenes: SceneSpec[];
}

export interface MediaQaResult {
  audioExpected: boolean;
  audioStream: boolean;
  maxVolumeDb: number | null;
  passed: boolean;
  summary: string;
}

export type QualityIssueLevel = 'error' | 'warning' | 'info';

export interface QualityIssue {
  level: QualityIssueLevel;
  code: string;
  message: string;
  sceneIndex?: number;
  sceneId?: string;
}

export interface QualityReport {
  passed: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  issues: QualityIssue[];
}

export interface ScenePreviewStill {
  sceneIndex: number;
  sceneId: string;
  title: string;
  frame: number;
  imageUrl: string;
}

export interface RenderedVideoRecord {
  jobId: string;
  outputUrl: string;
  renderedAt: string;
  durationSeconds: number;
  sceneCount: number;
  isPreview?: boolean;
  previewSceneIndex?: number;
  mediaQa?: MediaQaResult;
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
  'packet-frame': '封包 / 訊框欄位拆解',
  'state-machine': '狀態機轉移圖',
  'code-log': '程式碼 / CLI / Log 判讀',
  'kpi-metrics': '關鍵效能指標卡',
  'fault-tree': '根因排查決策樹',
  'packet-simulator': '無線封包多通道模擬器 (A→B)',
  'ofdm-spectrum': 'OFDM 頻譜與副載波分配',
  'beamforming-array': '相控陣列與波束成形 (Beamforming)',
  'qam-constellation': 'QAM 星座圖與 EVM / SNR 干擾',
  'mlo-multilink': 'Wi-Fi 7 MLO 多鏈路聚合時序',
  'rf-link-budget': 'RF 鏈路預算與 SNR 餘裕儀表',
  'summary-takeaways': '重點總結與實作',
  'pptx-slide': 'PowerPoint 原版投影片',
};

export const EFFECT_LABELS: Record<RemotionEffect, string> = {
  'signal-pulse': '訊號脈衝傳輸 (Signal Pulse)',
  'glitch-alert': '異常抖動/雜訊警示 (Glitch Alert)',
  'cascade-reveal': '逐級時序推進 (Cascade Reveal)',
  'zoom-focus': '關鍵節點聚焦 (Zoom Focus)',
  'sweep-scan': '掃描線檢測 (Sweep Scan)',
  'packet-traffic': '網路模擬器封包流 (Packet Traffic A→B)',
};
