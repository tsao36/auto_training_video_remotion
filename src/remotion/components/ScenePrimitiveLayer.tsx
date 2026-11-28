import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { SceneSpec } from '../../types/training';
import { KineticCaption } from '../primitives/kinetic-caption';
import { PopBadge } from '../primitives/pop-badge';
import { StateCard } from '../primitives/state-card';
import { SvgTracePath } from '../primitives/svg-trace-path';
import { Typewriter } from '../primitives/typewriter';
import { AuroraBg } from '../primitives/aurora-bg';
import { AudioPulse } from '../primitives/audio-pulse';
import { BeatPulseGrid } from '../primitives/beat-pulse-grid';
import { ArrowAnnotate } from '../primitives/arrow-annotate';
import { ConnectorLines } from '../primitives/connector-lines';
import { MultiDeviceLineup } from '../primitives/multi-device-lineup';
import { GrainGradientBg } from '../primitives/grain-gradient-bg';
import { DitherFieldBg } from '../primitives/dither-field-bg';
import { TextAnimator } from '../primitives/text-animator';
import { ShapeLayer } from '../primitives/shape-layer';
import { DeviceMockupZoom } from '../scenes/device-mockup-zoom';
import { CardStack3d } from '../scenes/card-stack-3d';
import { TextExtrude3d } from '../scenes/text-extrude-3d';
import { CodeReveal } from '../scenes/code-reveal';
import { CaptionBumper } from '../scenes/caption-bumper';
import {
  PRIMITIVE_SLOT_RECTS,
  getPrimitiveRenderPlan,
  isStructuredDiagramTemplate,
  type LayoutRect,
} from '../lib/scene-layout-policy';

interface ScenePrimitiveLayerProps {
  scene: SceneSpec;
  accentColor: string;
  audioUrl?: string;
}

function slotStyle(slot: LayoutRect): React.CSSProperties {
  return {
    left: slot.left,
    top: slot.top,
    width: slot.width,
    height: slot.height,
  };
}

const FullSceneViewport: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.focusFrame), overflow: 'hidden', zIndex: 8, background: 'rgba(3, 7, 18, 0.12)' }}>
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 1920,
        height: 1080,
        transform: 'translate(-50%, -50%) scale(0.63)',
        transformOrigin: 'center',
      }}
    >
      {children}
    </div>
  </div>
);

function firstNumericMetric(scene: SceneSpec): { label: string; value: number; suffix: string } | null {
  for (const metric of scene.diagramData?.kpiMetrics || []) {
    const match = metric.value.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      return {
        label: metric.label,
        value: Number(match[0]),
        suffix: metric.value.replace(match[0], '').trim(),
      };
    }
  }
  return null;
}

export const ScenePrimitiveLayer: React.FC<ScenePrimitiveLayerProps> = ({
  scene,
  accentColor,
  audioUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const effectiveDuration =
    scene.tts?.actualDurationSec && scene.tts.actualDurationSec > 0
      ? scene.tts.actualDurationSec
      : scene.durationSeconds;
  const sceneFrames = Math.max(30, Math.round(effectiveDuration * fps));
  const localProgress = Math.min(1, frame / sceneFrames);
  const activePoint = scene.keyPoints[Math.min(scene.keyPoints.length - 1, Math.floor(localProgress * Math.max(1, scene.keyPoints.length)))] || scene.title;
  const cards = scene.keyPoints.slice(0, 3);
  const metric = firstNumericMetric(scene);
  const renderPlan = getPrimitiveRenderPlan(scene.remotionPrimitives, frame, sceneFrames);
  const persistentIds = new Set(renderPlan.persistentIds);
  const isDiagramScene = isStructuredDiagramTemplate(scene.template);
  const show = (id: string) => persistentIds.has(id) || renderPlan.activeForegroundId === id;
  const showOverlay = (id: string) => !isDiagramScene && show(id);

  const metricProgress = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 120, mass: 0.7 },
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 30 }}>
      {show('notebook-paper') && (
        <div style={{ position: 'absolute', inset: 26, opacity: 0.12, backgroundImage: 'linear-gradient(rgba(148,163,184,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.28) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      )}

      {show('aurora-bg') && (
        <div style={{ position: 'absolute', inset: 0, opacity: 0.36, overflow: 'hidden' }}>
          <AuroraBg backgroundColor="transparent" colors={[accentColor, '#38BDF8', '#10B981']} intensity={0.6} />
        </div>
      )}
      {show('grain-gradient-bg') && (
        <div style={{ position: 'absolute', inset: 0, opacity: 0.18, overflow: 'hidden' }}>
          <GrainGradientBg backgroundColor="#050505" colors={[accentColor, '#F59E0B', '#10B981']} />
        </div>
      )}
      {show('dither-field-bg') && (
        <div style={{ position: 'absolute', inset: 0, opacity: 0.15, overflow: 'hidden' }}>
          <DitherFieldBg backgroundColor="#070605" inkColor={accentColor} />
        </div>
      )}

      {show('camera-pan-zoom') && (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.focusFrame), opacity: 0.55 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 32, height: 32, borderLeft: `2px solid ${accentColor}`, borderTop: `2px solid ${accentColor}` }} />
          <div style={{ position: 'absolute', right: 0, top: 0, width: 32, height: 32, borderRight: `2px solid ${accentColor}`, borderTop: `2px solid ${accentColor}` }} />
          <div style={{ position: 'absolute', left: 0, bottom: 0, width: 32, height: 32, borderLeft: `2px solid ${accentColor}`, borderBottom: `2px solid ${accentColor}` }} />
          <div style={{ position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRight: `2px solid ${accentColor}`, borderBottom: `2px solid ${accentColor}` }} />
        </div>
      )}

      {showOverlay('svg-trace-path') && (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.traceLane), opacity: 0.9 }}>
          <SvgTracePath path="M0 58 C180 58 220 18 400 18 S680 98 860 98 S1100 22 1320 58" viewBox="0 0 1320 116" durationInFrames={Math.min(90, sceneFrames)} color={accentColor} strokeWidth={5} />
        </div>
      )}

      {showOverlay('arrow-annotate') && (
        <div style={{ position: 'absolute', left: 760, top: 360, width: 360, height: 240 }}>
          <ArrowAnnotate width={360} height={240} label={activePoint} stroke={accentColor} durationInFrames={42} />
        </div>
      )}

      {showOverlay('connector-lines') && (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.traceLane) }}>
          <ConnectorLines width={1180} height={92} stroke={accentColor} dashed />
        </div>
      )}

      {showOverlay('shape-layer') && (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.traceLane), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShapeLayer
            width={420}
            height={92}
            shapes={[{ type: 'ellipse', size: [70, 70] }]}
            stroke={accentColor}
            strokeWidth={3}
          />
        </div>
      )}

      {showOverlay('typewriter') && (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.rightHighlight), padding: '16px 20px', background: 'rgba(9,14,28,.92)', borderLeft: `4px solid ${accentColor}` }}>
          <Typewriter text={activePoint} fontSize={32} charFrames={2} humanize color="#F8FAFC" />
        </div>
      )}

      {showOverlay('text-animator') && (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.rightCallout), padding: '14px 18px', background: 'rgba(9,14,28,.9)', borderRight: `4px solid ${accentColor}` }}>
          <TextAnimator text={activePoint} fontSize={34} fontWeight={800} color={accentColor} maxWidth={390} align="right" />
        </div>
      )}

      {showOverlay('kinetic-caption') && (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.rightCallout), maxWidth: 430, padding: '14px 18px', background: 'rgba(9,14,28,.9)', borderRight: `4px solid ${accentColor}`, zIndex: 2 }}>
          <KineticCaption text={activePoint} activeColor={accentColor} inactiveColor="#CBD5E1" fontSize={34} framesPerWord={8} startFrame={Math.floor(frame / 90) * 90} textAlign="right" />
        </div>
      )}

      {showOverlay('state-card') && cards.length > 0 && (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.topRail), display: 'flex', gap: 16 }}>
          {cards.map((card, index) => {
            const activeIndex = Math.floor(localProgress * cards.length) % cards.length;
            return (
              <div key={card} style={{ position: 'relative', flex: 1 }}>
                <StateCard active={index === activeIndex} startFrame={index * 18} activeColor={accentColor}>
                  <div style={{ display: 'flex', alignItems: 'center', height: '100%', color: '#F8FAFC', fontSize: 18, fontWeight: 800 }}>{card}</div>
                </StateCard>
              </div>
            );
          })}
        </div>
      )}

      {(showOverlay('comparison-bars') && scene.diagramData?.comparisonRows?.length) ? (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.rightMetric), display: 'grid', gap: 10, padding: 16, background: 'rgba(9,14,28,.94)', border: `1px solid ${accentColor}55`, borderRadius: 8 }}>
          {scene.diagramData.comparisonRows.slice(0, 3).map((row, index) => (
            <div key={row.metric}>
              <div style={{ color: '#E2E8F0', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{row.metric}</div>
              <div style={{ height: 7, background: 'rgba(148,163,184,.18)', overflow: 'hidden' }}>
                <div style={{ width: `${interpolate(metricProgress, [0, 1], [0, 54 + index * 16])}%`, height: '100%', background: accentColor }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {showOverlay('audio-pulse') && audioUrl && (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.leftMetric), display: 'grid', placeItems: 'center' }}>
          <AudioPulse src={audioUrl} size={180} color={accentColor} />
        </div>
      )}

      {showOverlay('beat-pulse-grid') && audioUrl && (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.rightMetric), display: 'grid', placeItems: 'center' }}>
          <BeatPulseGrid src={audioUrl} columns={8} rows={5} cellSize={22} gap={7} color={accentColor} />
        </div>
      )}

      {(showOverlay('animated-counter') && metric) ? (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.leftMetric), padding: '18px 22px', background: 'rgba(9,14,28,.94)', borderLeft: `5px solid ${accentColor}` }}>
          <div style={{ color: accentColor, fontSize: 48, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{(metric.value * metricProgress).toFixed(metric.value % 1 ? 1 : 0)} {metric.suffix}</div>
          <div style={{ color: '#CBD5E1', fontSize: 16, fontWeight: 700 }}>{metric.label}</div>
        </div>
      ) : null}

      {showOverlay('code-log') && scene.diagramData?.codeLines?.length ? (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.codeDock), padding: 14, background: 'rgba(2,6,23,.96)', border: `1px solid ${accentColor}66`, fontFamily: 'Consolas, monospace', fontSize: 14, color: '#A7F3D0' }}>
          {scene.diagramData.codeLines.slice(0, 3).map((line) => <div key={`${line.lineNo}-${line.text}`}>{String(line.lineNo || '›').padStart(2, '0')}  {line.text}</div>)}
        </div>
      ) : null}

      {showOverlay('device-mockup-zoom') && (
        <FullSceneViewport>
          <DeviceMockupZoom
            title={scene.title}
            subtitle={scene.keyPoints[0] || scene.subtitle}
            eyebrow={scene.subtitle}
            device="browser"
            accentColor={accentColor}
            backgroundColor="transparent"
          >
            <div style={{ width: '100%', height: '100%', background: '#0F172A', color: '#F8FAFC', display: 'grid', placeItems: 'center', padding: 60, textAlign: 'center', fontSize: 42, fontWeight: 800 }}>
              {activePoint}
            </div>
          </DeviceMockupZoom>
        </FullSceneViewport>
      )}

      {showOverlay('multi-device-lineup') && (
        <FullSceneViewport>
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
            <MultiDeviceLineup scale={1.1} phone={{ label: 'Phone' }} tablet={{ label: 'Tablet' }} laptop={{ label: 'Laptop' }}>
              <div style={{ width: '100%', height: '100%', padding: 16, color: '#F8FAFC', background: '#0F172A', fontSize: 18, fontWeight: 800 }}>
                {activePoint}
              </div>
            </MultiDeviceLineup>
          </div>
        </FullSceneViewport>
      )}

      {showOverlay('card-stack-3d') && (
        <FullSceneViewport>
          <CardStack3d count={Math.max(3, Math.min(5, cards.length || 3))} colors={[accentColor, '#0071C5', '#10B981', '#F59E0B']} accentColor={accentColor} backgroundColor="#07111F" floorColor="#07111F" />
        </FullSceneViewport>
      )}

      {showOverlay('text-extrude-3d') && (
        <FullSceneViewport>
          <TextExtrude3d text={activePoint.slice(0, 14).toUpperCase()} accentColor={accentColor} color="#F8FAFC" backgroundColor="transparent" />
        </FullSceneViewport>
      )}

      {showOverlay('code-reveal') && (
        <FullSceneViewport>
          <CodeReveal
            title={scene.diagramData?.codeTitle || `${scene.title}.log`}
            language={scene.diagramData?.codeLanguage || 'log'}
            code={(scene.diagramData?.codeLines || []).map((line) => line.text).join('\n') || activePoint}
            highlightedLines={[1, 2]}
            accentColor={accentColor}
            backgroundColor="transparent"
          />
        </FullSceneViewport>
      )}

      {showOverlay('caption-bumper') && (
        <FullSceneViewport>
          <CaptionBumper text={activePoint} eyebrow={scene.subtitle} accentColor={accentColor} backgroundColor="transparent" holdSeconds={effectiveDuration} />
        </FullSceneViewport>
      )}

      {showOverlay('pop-badge') && (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.centerBadge) }}>
          <PopBadge label={activePoint} accentColor={accentColor} startFrame={Math.floor(frame / 90) * 90} />
        </div>
      )}

      {showOverlay('caption-highlight') && (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.rightHighlight), padding: '10px 16px', border: `2px solid ${accentColor}`, background: `${accentColor}24`, color: '#FFFFFF', fontSize: 20, fontWeight: 900, boxShadow: `0 0 22px ${accentColor}44` }}>
          {activePoint}
        </div>
      )}

      {(show('srt-caption-track') || (isDiagramScene && Boolean(renderPlan.activeForegroundId))) && (
        <div style={{ position: 'absolute', ...slotStyle(PRIMITIVE_SLOT_RECTS.bottomAccent), background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`, opacity: interpolate(frame % Math.max(30, durationInFrames), [0, 15, 30], [0.15, 0.75, 0.15], { extrapolateRight: 'clamp' }) }} />
      )}
    </AbsoluteFill>
  );
};
