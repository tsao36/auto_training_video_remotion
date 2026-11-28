export const COMPOSITION_WIDTH = 1920;
export const COMPOSITION_HEIGHT = 1080;
export const CAPTION_BAND_HEIGHT = 176;
export const SCENE_STAGE_SCALE = 0.82;
export const SCENE_STAGE_LEFT = 173;
export const SCENE_STAGE_TOP = 8;
export const SCENE_STAGE_WIDTH = COMPOSITION_WIDTH;
export const SCENE_STAGE_HEIGHT = COMPOSITION_HEIGHT;

export type LayoutRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const PERSISTENT_PRIMITIVE_IDS = new Set([
  'aurora-bg',
  'grain-gradient-bg',
  'dither-field-bg',
  'notebook-paper',
]);

export const FULL_VIEWPORT_PRIMITIVE_IDS = new Set([
  'device-mockup-zoom',
  'multi-device-lineup',
  'card-stack-3d',
  'text-extrude-3d',
  'code-reveal',
  'caption-bumper',
]);

export const STRUCTURED_DIAGRAM_TEMPLATES = new Set([
  'title-hero',
  'architecture-flow',
  'signal-waveform',
  'protocol-timeline',
  'comparison-matrix',
  'debug-checklist',
  'packet-frame',
  'state-machine',
  'code-log',
  'kpi-metrics',
  'fault-tree',
  'packet-simulator',
  'ofdm-spectrum',
  'beamforming-array',
  'qam-constellation',
  'mlo-multilink',
  'rf-link-budget',
  'summary-takeaways',
  'pptx-slide',
]);

export function isFullViewportPrimitive(id: string): boolean {
  return FULL_VIEWPORT_PRIMITIVE_IDS.has(canonicalizePrimitiveId(id));
}

export function isStructuredDiagramTemplate(template?: string): boolean {
  return Boolean(template && STRUCTURED_DIAGRAM_TEMPLATES.has(template));
}

export const NON_RUNTIME_PRIMITIVE_IDS = new Set([
  'absolute-fill',
  'cabinet',
  'filing',
  'interactive-style',
  'popping-word-captions',
  'rf',
  'split-screen',
]);

export const SUPPORTED_PRIMITIVE_IDS = new Set([
  'animated-counter',
  'arrow-annotate',
  'audio-pulse',
  'beat-pulse-grid',
  'camera-pan-zoom',
  'caption-bumper',
  'caption-highlight',
  'card-stack-3d',
  'code-log',
  'code-reveal',
  'comparison-bars',
  'connector-lines',
  'device-mockup-zoom',
  'kinetic-caption',
  'multi-device-lineup',
  'pop-badge',
  'shape-layer',
  'srt-caption-track',
  'state-card',
  'svg-trace-path',
  'text-animator',
  'text-extrude-3d',
  'typewriter',
  ...PERSISTENT_PRIMITIVE_IDS,
]);

const PRIMITIVE_ID_ALIASES: Record<string, string> = {
  'donut-chart': 'comparison-bars',
  'gauge-dial': 'animated-counter',
  'horizontal-bar-chart': 'comparison-bars',
  'number-counter': 'animated-counter',
  'vertical-bar-chart': 'comparison-bars',
};

export function canonicalizePrimitiveId(id: string): string {
  const normalized = id
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
  return PRIMITIVE_ID_ALIASES[normalized] || normalized;
}

export function getPrimitiveRenderPlan(
  primitiveIds: readonly string[] | undefined,
  frame: number,
  sceneFrames: number,
): { persistentIds: string[]; activeForegroundId?: string } {
  const normalizedIds = [...new Set((primitiveIds || []).map(canonicalizePrimitiveId))]
    .filter((id) => SUPPORTED_PRIMITIVE_IDS.has(id));
  const persistentIds = normalizedIds.filter((id) => PERSISTENT_PRIMITIVE_IDS.has(id));
  const foregroundIds = normalizedIds.filter((id) => !PERSISTENT_PRIMITIVE_IDS.has(id));
  if (foregroundIds.length === 0) return { persistentIds };

  const progress = Math.min(1, Math.max(0, frame / Math.max(1, sceneFrames)));
  const activeIndex = Math.min(
    foregroundIds.length - 1,
    Math.floor(progress * foregroundIds.length),
  );
  return { persistentIds, activeForegroundId: foregroundIds[activeIndex] };
}

export const PRIMITIVE_SLOT_RECTS = {
  focusFrame: { left: 112, top: 214, width: 1696, height: 690 },
  traceLane: { left: 150, top: 540, width: 1180, height: 92 },
  topRail: { left: 112, top: 214, width: 1696, height: 76 },
  rightCallout: { left: 1394, top: 316, width: 430, height: 150 },
  rightHighlight: { left: 1394, top: 486, width: 430, height: 92 },
  rightMetric: { left: 1418, top: 690, width: 390, height: 214 },
  leftMetric: { left: 112, top: 690, width: 390, height: 214 },
  centerBadge: { left: 710, top: 116, width: 500, height: 70 },
  bottomAccent: { left: 112, top: 908, width: 1696, height: 4 },
  codeDock: { left: 112, top: 500, width: 560, height: 160 },
} as const satisfies Record<string, LayoutRect>;

export function rectsOverlap(a: LayoutRect, b: LayoutRect): boolean {
  return a.left < b.left + b.width
    && a.left + a.width > b.left
    && a.top < b.top + b.height
    && a.top + a.height > b.top;
}

export function isRectInsideStage(rect: LayoutRect): boolean {
  return rect.left >= 0
    && rect.top >= 0
    && rect.left + rect.width <= SCENE_STAGE_WIDTH
    && rect.top + rect.height <= SCENE_STAGE_HEIGHT;
}

export function getScaledStageBounds() {
  return {
    left: SCENE_STAGE_LEFT,
    top: SCENE_STAGE_TOP,
    right: SCENE_STAGE_LEFT + SCENE_STAGE_WIDTH * SCENE_STAGE_SCALE,
    bottom: SCENE_STAGE_TOP + SCENE_STAGE_HEIGHT * SCENE_STAGE_SCALE,
  };
}

export function getSceneStageStyle() {
  return {
    position: 'absolute' as const,
    left: SCENE_STAGE_LEFT,
    top: SCENE_STAGE_TOP,
    width: SCENE_STAGE_WIDTH,
    height: SCENE_STAGE_HEIGHT,
    transform: `scale(${SCENE_STAGE_SCALE})`,
    transformOrigin: 'top left' as const,
  };
}
