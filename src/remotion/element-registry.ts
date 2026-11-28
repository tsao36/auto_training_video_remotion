export type RemotionElementKind = 'primitive' | 'scene' | 'transition' | 'composition';
export type RemotionElementCategory =
  | 'primitives'
  | 'data-media'
  | 'paths-shapes'
  | 'maps-device'
  | '3d'
  | 'shaders'
  | 'motion-graphics'
  | 'scenes'
  | 'transitions'
  | 'compositions';

export interface RemotionElementDefinition {
  id: string;
  label: string;
  category: RemotionElementCategory;
  kind: RemotionElementKind;
  purpose: string;
  requiredData: string;
  sceneRuntime: boolean;
  requiresGl?: boolean;
}

export const REMOTION_ELEMENT_REGISTRY: RemotionElementDefinition[] = [
  { id: 'typewriter', label: 'Typewriter', category: 'primitives', kind: 'primitive', purpose: '逐字揭示短標題或關鍵結論', requiredData: '短文字', sceneRuntime: true },
  { id: 'aurora-bg', label: 'Aurora Background', category: 'primitives', kind: 'primitive', purpose: '科技或 RF 主題的柔和動態背景', requiredData: '色盤', sceneRuntime: true },
  { id: 'audio-pulse', label: 'Audio Pulse', category: 'data-media', kind: 'primitive', purpose: '依旁白或音訊低頻建立脈衝', requiredData: '可用 WAV 音訊 URL', sceneRuntime: true },
  { id: 'beat-pulse-grid', label: 'Beat Pulse Grid', category: 'data-media', kind: 'primitive', purpose: '以頻譜格點顯示音訊節拍', requiredData: '可用 WAV 音訊 URL', sceneRuntime: true },
  { id: 'arrow-annotate', label: 'Arrow Annotate', category: 'paths-shapes', kind: 'primitive', purpose: '從標註指向畫面區域', requiredData: '短標籤', sceneRuntime: true },
  { id: 'connector-lines', label: 'Connector Lines', category: 'paths-shapes', kind: 'primitive', purpose: '連接流程、架構或狀態節點', requiredData: '錨點與節點關係', sceneRuntime: true },
  { id: 'device-mockup-zoom', label: 'Device Mockup Zoom', category: 'maps-device', kind: 'scene', purpose: '展示裝置、儀表板或介面近景', requiredData: '標題；可選畫面圖片', sceneRuntime: true },
  { id: 'multi-device-lineup', label: 'Multi Device Lineup', category: 'maps-device', kind: 'primitive', purpose: '比較手機、平板與筆電的內容呈現', requiredData: '各裝置標籤或摘要', sceneRuntime: true },
  { id: 'card-stack-3d', label: 'Card Stack 3D', category: '3d', kind: 'scene', purpose: '以 3D 卡片呈現多項要點', requiredData: '3–7 個視覺要點', sceneRuntime: true, requiresGl: true },
  { id: 'text-extrude-3d', label: 'Text Extrude 3D', category: '3d', kind: 'scene', purpose: '以立體字揭示單一技術名詞', requiredData: '短字詞', sceneRuntime: true, requiresGl: true },
  { id: 'grain-gradient-bg', label: 'Grain Gradient Background', category: 'shaders', kind: 'primitive', purpose: '有質感的動態技術背景', requiredData: '色盤', sceneRuntime: true, requiresGl: true },
  { id: 'dither-field-bg', label: 'Dither Field Background', category: 'shaders', kind: 'primitive', purpose: '雙色像素化訊號或資料背景', requiredData: '背景與墨色', sceneRuntime: true, requiresGl: true },
  { id: 'text-animator', label: 'Text Animator', category: 'motion-graphics', kind: 'primitive', purpose: '逐字元/逐詞動畫關鍵文字', requiredData: '短文字', sceneRuntime: true },
  { id: 'shape-layer', label: 'Shape Layer', category: 'motion-graphics', kind: 'primitive', purpose: '建立重複、修剪或變形的向量圖形', requiredData: '抽象圖形狀態', sceneRuntime: true },
  { id: 'code-reveal', label: 'Code Reveal', category: 'scenes', kind: 'scene', purpose: '逐字顯示程式或設定並聚焦行', requiredData: '程式碼或設定文字', sceneRuntime: true },
  { id: 'caption-bumper', label: 'Caption Bumper', category: 'scenes', kind: 'scene', purpose: '章節間以一句重點建立停頓', requiredData: '重點句', sceneRuntime: true },
  { id: 'transition-card-flip', label: 'Card Flip Transition', category: 'transitions', kind: 'transition', purpose: '章節切換的整畫面翻轉', requiredData: '前後場景', sceneRuntime: false },
  { id: 'chromatic-aberration-wipe', label: 'Chromatic Aberration Wipe', category: 'transitions', kind: 'transition', purpose: '科技訊號切換的色差擦除', requiredData: '前後場景', sceneRuntime: false },
  { id: 'data-story', label: 'Data Story', category: 'compositions', kind: 'composition', purpose: '完整資料敘事影片模板', requiredData: '圖表資料、指標與時間步驟', sceneRuntime: false },
  { id: 'browser-flow', label: 'Browser Flow', category: 'compositions', kind: 'composition', purpose: '完整瀏覽器操作流程模板', requiredData: 'URL、提示與標題', sceneRuntime: false },
];

const LEGACY_RUNTIME_ELEMENTS = [
  'kinetic-caption', 'camera-pan-zoom', 'svg-trace-path', 'state-card',
  'code-log', 'pop-badge', 'comparison-bars', 'animated-counter',
  'caption-highlight', 'popping-word-captions', 'notebook-paper',
  'srt-caption-track',
] as const;

export function getSceneRuntimeElementIds(): string[] {
  return [
    ...LEGACY_RUNTIME_ELEMENTS,
    ...REMOTION_ELEMENT_REGISTRY.filter((item) => item.sceneRuntime).map((item) => item.id),
  ];
}

export function isSceneRuntimeElement(id: string): boolean {
  return new Set(getSceneRuntimeElementIds()).has(id);
}

export function isAiSelectableSceneElement(id: string): boolean {
  const installed = REMOTION_ELEMENT_REGISTRY.find((item) => item.id === id);
  return isSceneRuntimeElement(id) && (!installed || !installed.requiresGl);
}

export function getAiElementPrompt(): string {
  const items = REMOTION_ELEMENT_REGISTRY
    .filter((item) => item.sceneRuntime && !item.requiresGl)
    .map((item) => `${item.id}: ${item.purpose}；需要 ${item.requiredData}${item.requiresGl ? '；需要 WebGL/ANGLE' : ''}`);
  return [...LEGACY_RUNTIME_ELEMENTS, ...items].join('\n');
}
