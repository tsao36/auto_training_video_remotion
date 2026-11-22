import React from 'react';
import { fitText } from '@remotion/layout-utils';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { DOMAIN_META, EFFECT_LABELS, SceneSpec } from '../../types/training';

const HEADLINE_FONT_FAMILY = 'Inter, "Noto Sans TC", system-ui, sans-serif';

function computeFittedFontSize(
  text: string,
  withinWidth: number,
  fontWeight: number,
  minPx: number,
  maxPx: number
): number {
  const cleaned = (text || '').trim();
  if (!cleaned) return maxPx;
  try {
    const fitted = fitText({
      text: cleaned,
      withinWidth,
      fontFamily: HEADLINE_FONT_FAMILY,
      fontWeight,
    });
    if (Number.isFinite(fitted.fontSize) && fitted.fontSize > 0) {
      return Math.max(minPx, Math.min(maxPx, Math.floor(fitted.fontSize)));
    }
  } catch {
    // Fallback to heuristic if canvas text measurement is unavailable
  }
  return maxPx;
}
import { getActiveSentenceCue } from '../../utils/sentenceEffects';
import {
  AnimatedComparisonBar,
  AnimatedMetricText,
  CameraRig,
  LiveTelemetryWidget,
  SceneTransitionWrapper,
  SvgFlowConnector,
} from '../components/DynamicPrimitives';
import { PptxSlideRenderer } from './PptxSlideRenderer';
import { WIRELESS_TEMPLATES, WirelessTemplateRenderer } from './WirelessTemplates';

interface SceneRendererProps {
  scene: SceneSpec;
  assetBaseUrl?: string;
}

export const SceneRenderer: React.FC<SceneRendererProps> = ({ scene, assetBaseUrl = '' }) => {
  if (scene.template === 'pptx-slide' && scene.pptxSlide) {
    return <PptxSlideRenderer slide={scene.pptxSlide} assetBaseUrl={assetBaseUrl} />;
  }

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const meta = DOMAIN_META[scene.domain];
  const accent = scene.animation.accentColor || meta.accentColor;
  const sceneTotalFrames = Math.max(30, Math.round(scene.durationSeconds * fps));
  const sceneProgress = Math.min(1, frame / sceneTotalFrames);

  const { cue: activeCue, cues: allCues, cueProgress } = getActiveSentenceCue(
    scene.sentenceCues,
    sceneProgress,
    scene.script,
    scene.template,
    scene.animation.effect || 'signal-pulse'
  );
  const effect = activeCue.effect;
  const targetIndex = activeCue.targetIndex ?? activeCue.beatIndex;
  const effectShortName = EFFECT_LABELS[effect].split(' (')[0];

  const springConfig =
    scene.animation.motionStyle === 'spring-snappy'
      ? { damping: 16, stiffness: 260, mass: 0.6 }
      : { damping: 18, stiffness: 200, mass: 0.7 };

  // Re-triggerable beat spring (fires on every beat change!)
  const cueStartFrame = Math.round(activeCue.startRatio * sceneTotalFrames);
  const cueLocalFrame = Math.max(0, frame - cueStartFrame);
  const beatSpring = spring({
    frame: cueLocalFrame,
    fps,
    config: { damping: 15, stiffness: 220, mass: 0.65 },
  });

  // Subtle continuous camera breathing so no frame is ever completely static
  const cameraBreath = 1 + Math.sin((frame / fps) * 0.9) * 0.006;

  const headerProgress = spring({ frame, fps, config: springConfig });
  const headerY = interpolate(headerProgress, [0, 1], [18, 0]);
  const headerOpacity = interpolate(frame, [0, 7], [0, 1], { extrapolateRight: 'clamp' });

  const headerTitleFontSize = computeFittedFontSize(scene.title, 1180, 800, 32, 52);
  const heroTitleFontSize = computeFittedFontSize(scene.title, 1450, 900, 44, 74);

  const renderHeader = () => (
    <div
      style={{
        transform: `translateY(${headerY}px)`,
        opacity: headerOpacity,
        marginBottom: 34,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: 24,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            color: accent,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          {scene.subtitle}
        </div>
        <div
          style={{
            color: '#F8FAFC',
            fontSize: headerTitleFontSize,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
          }}
        >
          {scene.title}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            backgroundColor:
              effect === 'glitch-alert' ? 'rgba(245, 158, 11, 0.16)' : 'rgba(15, 23, 42, 0.85)',
            border: `1px solid ${effect === 'glitch-alert' ? '#F59E0B88' : `${accent}55`}`,
            color: effect === 'glitch-alert' ? '#FCD34D' : '#E2E8F0',
            fontSize: 15,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          BEAT {activeCue.beatIndex + 1}/{allCues.length} • {effectShortName}
        </div>
        {scene.diagramData?.visualCaption && (
          <div
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              backgroundColor: effect === 'glitch-alert' ? 'rgba(245, 158, 11, 0.16)' : `${accent}18`,
              border: `1px solid ${effect === 'glitch-alert' ? '#F59E0B88' : `${accent}66`}`,
              color: effect === 'glitch-alert' ? '#FCD34D' : accent,
              fontSize: 18,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {scene.diagramData.visualCaption}
          </div>
        )}
      </div>
    </div>
  );

  // WIRELESS-HEAVY TEMPLATES (Packet Simulator, OFDM Spectrum, Beamforming, QAM, MLO, RF Link Budget)
  if (WIRELESS_TEMPLATES.has(scene.template)) {
    return (
      <WirelessTemplateRenderer
        scene={scene}
        renderHeader={renderHeader}
        accent={accent}
        activeCue={activeCue}
        allCues={allCues}
        cueProgress={cueProgress}
        effect={effect}
        targetIndex={targetIndex}
        beatSpring={beatSpring}
        cameraBreath={cameraBreath}
        sceneTotalFrames={sceneTotalFrames}
      />
    );
  }

  // 1. TITLE HERO
  if (scene.template === 'title-hero') {
    const heroScale = spring({ frame, fps, config: { damping: 16, stiffness: 100 } });
    return (
      <SceneTransitionWrapper
        sceneIndex={scene.index}
        sceneTotalFrames={sceneTotalFrames}
        accentColor={accent}
      >
        <AbsoluteFill
          style={{
            padding: '130px 110px 150px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            fontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
            zIndex: 10,
            transform: `scale(${cameraBreath})`,
          }}
        >
          <div
            style={{
              transform: `scale(${interpolate(heroScale, [0, 1], [0.94, 1])})`,
              opacity: headerOpacity,
            }}
          >
            <div
              style={{
                display: 'inline-block',
                padding: '10px 22px',
                borderRadius: 999,
                backgroundColor: `${accent}20`,
                border: `1px solid ${accent}88`,
                color: accent,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: '0.1em',
                marginBottom: 28,
              }}
            >
              {meta.label} • BEAT {activeCue.beatIndex + 1}/{allCues.length}
            </div>
            <h1
              style={{
                fontSize: heroTitleFontSize,
                fontWeight: 900,
                color: '#FFFFFF',
                lineHeight: 1.12,
                margin: 0,
                marginBottom: 28,
                maxWidth: 1450,
              }}
            >
              {scene.title}
            </h1>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 24,
                marginTop: 42,
              }}
            >
              {scene.keyPoints.slice(0, 3).map((pt, i) => {
                const cardSpring = spring({
                  frame: Math.max(0, frame - (4 + i * 4)),
                  fps,
                  config: springConfig,
                });
                const isFocusedCard =
                  allCues.length > 1 && i === targetIndex % Math.max(1, Math.min(3, scene.keyPoints.length));
                const cardBorder =
                  isFocusedCard && effect === 'glitch-alert'
                    ? '#F59E0B'
                    : isFocusedCard
                    ? accent
                    : `${accent}44`;
                const focusScale = isFocusedCard
                  ? interpolate(beatSpring, [0, 1], [0.98, 1.05])
                  : allCues.length > 1
                  ? 0.96
                  : 1;
                const cardOpacity = isFocusedCard || allCues.length <= 1 ? cardSpring : cardSpring * 0.5;
                return (
                  <div
                    key={i}
                    style={{
                      transform: `translateY(${interpolate(cardSpring, [0, 1], [40, 0])}px) scale(${focusScale})`,
                      opacity: cardOpacity,
                      backgroundColor: isFocusedCard ? 'rgba(15, 30, 58, 0.94)' : 'rgba(15, 23, 42, 0.78)',
                      border: `${isFocusedCard ? 2 : 1}px solid ${cardBorder}`,
                      boxShadow: isFocusedCard ? `0 0 30px ${cardBorder}55` : 'none',
                      borderRadius: 16,
                      padding: '26px 28px',
                    }}
                  >
                    <div style={{ color: isFocusedCard && effect === 'glitch-alert' ? '#FBBF24' : accent, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
                      MODULE 0{i + 1} {isFocusedCard ? `• ${effectShortName} ▶` : ''}
                    </div>
                    <div style={{ color: '#E2E8F0', fontSize: 24, fontWeight: 600, lineHeight: 1.4 }}>
                      <AnimatedMetricText
                        text={pt}
                        triggerFrame={isFocusedCard ? cueStartFrame : 4 + i * 4}
                        highlightColor={isFocusedCard ? accent : undefined}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </AbsoluteFill>
      </SceneTransitionWrapper>
    );
  }

  // 2. SIGNAL WAVEFORM (Oscilloscope / Logic Analyzer / RF Carrier)
  if (scene.template === 'signal-waveform') {
    const channels = scene.diagramData?.waveformChannels || [
      { label: 'CH1: CLK / Carrier', color: '#00C2FF', type: 'clock' as const },
      { label: 'CH2: DATA / OFDMA', color: '#10B981', type: 'ofdma' as const },
      { label: 'CH3: RF Envelope', color: '#A78BFA', type: 'rf-sine' as const },
    ];
    const faultIdx =
      effect === 'glitch-alert'
        ? (scene.diagramData?.faultChannelIndex ?? targetIndex % channels.length)
        : -1;
    const scanX =
      effect === 'sweep-scan'
        ? Math.round(cueProgress * 920)
        : (frame * 12) % 920;

    return (
      <SceneTransitionWrapper
        sceneIndex={scene.index}
        sceneTotalFrames={sceneTotalFrames}
        accentColor={accent}
      >
        <AbsoluteFill
          style={{
            padding: '105px 80px 140px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
            zIndex: 10,
          }}
        >
          {renderHeader()}
          <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 36, flex: 1 }}>
          {/* Animated Oscilloscope Panel */}
          <div
            style={{
              position: 'relative',
              backgroundColor: 'rgba(11, 17, 32, 0.92)',
              border: `1px solid ${effect === 'glitch-alert' ? '#F59E0B88' : `${accent}44`}`,
              borderRadius: 20,
              padding: 28,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94A3B8', fontSize: 16 }}>
              <span>LIVE LOGIC &amp; RF ANALYZER</span>
              <span style={{ color: effect === 'glitch-alert' ? '#FBBF24' : accent }}>
                {effect === 'glitch-alert'
                  ? '⚠ ANOMALY TRIGGER: JITTER / DROOP'
                  : effect === 'sweep-scan'
                  ? 'SCANNING SIGNAL INTEGRITY • 30 FPS'
                  : 'TRIGGER: RISING EDGE • 30 FPS'}
              </span>
            </div>

            {channels.map((ch, chIdx) => {
              const isFaultChannel = chIdx === faultIdx;
              const points: string[] = [];
              const width = 920;
              const midY = 64;
              for (let x = 0; x <= width; x += 6) {
                const t = (x + frame * 7) * 0.035;
                let y = midY;
                if (ch.type === 'clock') {
                  y = Math.sin(t * 2.2) >= 0 ? midY - 34 : midY + 34;
                } else if (ch.type === 'rf-sine') {
                  y = midY + Math.sin(t * 4.5) * Math.cos(t * 0.45) * 38;
                } else if (ch.type === 'ofdma') {
                  y =
                    midY +
                    (Math.sin(t * 1.8) * 18 + Math.sin(t * 3.7) * 14 + Math.cos(t * 5.2) * 10);
                } else {
                  const bit = Math.floor((x + frame * 5) / 48) % 5;
                  y = bit === 0 || bit === 2 ? midY - 30 : midY + 30;
                }

                // Inject glitch/droop spike when glitch-alert is active on this channel
                if (isFaultChannel && effect === 'glitch-alert') {
                  const spikePos = (frame * 14) % width;
                  if (Math.abs(x - spikePos) < 55) {
                    y += Math.sin(x * 0.9 + frame) * 26;
                  }
                }
                points.push(`${x},${y.toFixed(1)}`);
              }

              const strokeColor = isFaultChannel && effect === 'glitch-alert' ? '#F59E0B' : ch.color;

              return (
                <div
                  key={chIdx}
                  style={{
                    backgroundColor:
                      isFaultChannel && effect === 'glitch-alert'
                        ? 'rgba(120, 53, 15, 0.25)'
                        : 'rgba(15, 23, 42, 0.75)',
                    borderRadius: 12,
                    padding: '12px 18px',
                    border:
                      isFaultChannel && effect === 'glitch-alert'
                        ? '1px solid rgba(245, 158, 11, 0.55)'
                        : '1px solid rgba(148,163,184,0.14)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      color: strokeColor,
                      fontSize: 16,
                      fontWeight: 700,
                      marginBottom: 6,
                    }}
                  >
                    <span>{ch.label}</span>
                    {isFaultChannel && effect === 'glitch-alert' && (
                      <span style={{ color: '#FCD34D', fontSize: 13 }}>GLITCH / NOISE ZONE</span>
                    )}
                  </div>
                  <svg width="100%" height="128" viewBox="0 0 920 128">
                    <line x1="0" y1="64" x2="920" y2="64" stroke="rgba(148,163,184,0.18)" strokeDasharray="6 6" />
                    {effect === 'sweep-scan' && (
                      <line
                        x1={scanX}
                        y1="0"
                        x2={scanX}
                        y2="128"
                        stroke={accent}
                        strokeWidth="3"
                        strokeOpacity="0.65"
                      />
                    )}
                    <polyline
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth="3.5"
                      strokeLinejoin="round"
                      points={points.join(' ')}
                    />
                  </svg>
                </div>
              );
            })}
          </div>

          {/* Animated Key Points */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, justifyContent: 'center' }}>
            {scene.keyPoints.map((pt, i) => {
              const p = spring({ frame: Math.max(0, frame - i * 4), fps, config: springConfig });
              const isFocusedPt = i === targetIndex % Math.max(1, scene.keyPoints.length);
              const ptAccent = isFocusedPt && effect === 'glitch-alert' ? '#F59E0B' : accent;
              const focusScale = isFocusedPt
                ? interpolate(beatSpring, [0, 1], [0.98, 1.035])
                : 0.97;
              return (
                <div
                  key={i}
                  style={{
                    transform: `translateX(${interpolate(p, [0, 1], [50, 0])}px) scale(${focusScale})`,
                    opacity: isFocusedPt ? p : p * 0.5,
                    backgroundColor: isFocusedPt ? 'rgba(15, 30, 58, 0.94)' : 'rgba(15, 23, 42, 0.85)',
                    borderLeft: `5px solid ${ptAccent}`,
                    boxShadow: isFocusedPt ? `0 0 24px ${ptAccent}44` : 'none',
                    borderRadius: 12,
                    padding: '22px 24px',
                    color: '#F1F5F9',
                    fontSize: 23,
                    lineHeight: 1.45,
                  }}
                >
                  <AnimatedMetricText
                    text={pt}
                    triggerFrame={isFocusedPt ? cueStartFrame : i * 4}
                    highlightColor={isFocusedPt ? ptAccent : undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
      </SceneTransitionWrapper>
    );
  }

  // 3. ARCHITECTURE FLOW (Animated Block Diagram + Moving Signal Pulses)
  if (scene.template === 'architecture-flow') {
    const nodes = scene.diagramData?.nodes || [
      { id: 'n1', label: 'SoC / PCH', sublabel: 'Host Interface', color: '#0071C5' },
      { id: 'n2', label: 'Controller', sublabel: 'MAC / Logic', color: '#00C2FF' },
      { id: 'n3', label: 'Front-End', sublabel: 'Driver / FEM', color: '#38BDF8' },
      { id: 'n4', label: 'I/O / Antenna', sublabel: 'Physical Link', color: '#10B981' },
    ];

    const pulsePos = (frame % 90) / 90;
    const isSplitMicroLayout = allCues.length >= 3 && activeCue.beatIndex % 2 === 1;
    const activeNode = nodes[targetIndex % nodes.length];
    const focusedPtIdx = targetIndex % Math.max(1, scene.keyPoints.length);
    const focusedPt = scene.keyPoints[focusedPtIdx] || scene.title;

    return (
      <SceneTransitionWrapper
        sceneIndex={scene.index}
        sceneTotalFrames={sceneTotalFrames}
        accentColor={accent}
      >
        <AbsoluteFill
          style={{
            padding: '105px 80px 140px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
            zIndex: 10,
          }}
        >
          {renderHeader()}

          {/* Horizontal Animated Hardware Block Diagram with Virtual Camera Rig */}
          <CameraRig
            focusIndex={targetIndex}
            totalTargets={nodes.length}
            triggerFrame={cueStartFrame}
            zoomScale={isSplitMicroLayout ? 1.07 : 1.0}
            layoutMode="horizontal"
          >
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'rgba(11, 17, 32, 0.88)',
                border: `1px solid ${effect === 'glitch-alert' ? '#F59E0B88' : `${accent}44`}`,
                borderRadius: 20,
                padding: '46px 56px',
                marginBottom: 34,
                overflow: 'hidden',
              }}
            >
              {effect === 'sweep-scan' && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${cueProgress * 100}%`,
                    width: 4,
                    backgroundColor: accent,
                    boxShadow: `0 0 24px ${accent}`,
                    zIndex: 3,
                  }}
                />
              )}
              {/* Animated SVG Signal Bus Connector */}
              <SvgFlowConnector
                nodeCount={nodes.length}
                accentColor={accent}
                isAlert={effect === 'glitch-alert'}
                cueProgress={cueProgress}
                targetIndex={targetIndex}
              />

              {nodes.map((node, i) => {
                const p = spring({ frame: Math.max(0, frame - i * 3), fps, config: springConfig });
                const highlightIdx =
                  allCues.length > 1
                    ? targetIndex % nodes.length
                    : scene.diagramData?.highlightNodeIndex;
                const pulseActiveIdx = Math.floor(pulsePos * nodes.length);
                const isHighlighted =
                  highlightIdx !== undefined ? i === highlightIdx : i === pulseActiveIdx;
                const isAlertNode = effect === 'glitch-alert' && isHighlighted;
                const nodeColor = isAlertNode ? '#F59E0B' : node.color || accent;
                const focusScale = isHighlighted
                  ? interpolate(beatSpring, [0, 1], [0.98, 1.07])
                  : 0.96;
                return (
                  <div
                    key={node.id}
                    style={{
                      position: 'relative',
                      zIndex: 2,
                      width: 310,
                      transform: `scale(${interpolate(p, [0, 1], [0.85, focusScale])})`,
                      opacity: isHighlighted ? p : p * 0.55,
                      backgroundColor: isAlertNode ? '#1E1B18' : '#0F172A',
                      border: `${isHighlighted ? 3 : 2}px solid ${nodeColor}`,
                      borderRadius: 18,
                      padding: '28px 24px',
                      textAlign: 'center',
                      boxShadow: isHighlighted
                        ? `0 0 36px ${nodeColor}66`
                        : `0 12px 32px rgba(0,0,0,0.45)`,
                    }}
                  >
                    <div style={{ color: nodeColor, fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
                      {isAlertNode ? '⚠ BOTTLENECK' : isHighlighted ? `ACTIVE • 0${i + 1}` : `BLOCK 0${i + 1}`}
                    </div>
                    <div style={{ color: '#FFFFFF', fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
                      {node.label}
                    </div>
                    {node.sublabel && (
                      <div style={{ color: '#94A3B8', fontSize: 18 }}>{node.sublabel}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </CameraRig>

          {/* Dynamic Micro-Layout: alternates between 2x2 Grid Overview and Spotlight + Live Telemetry Split */}
          {isSplitMicroLayout ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 24, flex: 1 }}>
              <div
                style={{
                  transform: `translateY(${interpolate(beatSpring, [0, 1], [18, 0])}px) scale(${interpolate(beatSpring, [0, 1], [0.97, 1])})`,
                  opacity: interpolate(beatSpring, [0, 1], [0.4, 1]),
                  backgroundColor: 'rgba(15, 30, 58, 0.94)',
                  border: `2px solid ${effect === 'glitch-alert' ? '#F59E0B' : accent}`,
                  boxShadow: `0 0 28px ${effect === 'glitch-alert' ? '#F59E0B33' : `${accent}33`}`,
                  borderRadius: 16,
                  padding: '26px 30px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 10,
                }}
              >
                <div style={{ color: effect === 'glitch-alert' ? '#FBBF24' : accent, fontSize: 15, fontWeight: 800, letterSpacing: '0.08em' }}>
                  SPOTLIGHT FOCUS • {activeNode.label} ({effectShortName})
                </div>
                <div style={{ color: '#F8FAFC', fontSize: 28, fontWeight: 700, lineHeight: 1.4 }}>
                  <AnimatedMetricText
                    text={focusedPt}
                    triggerFrame={cueStartFrame}
                    highlightColor={effect === 'glitch-alert' ? '#FBBF24' : accent}
                  />
                </div>
              </div>
              <LiveTelemetryWidget
                title="BUS / SIGNAL TELEMETRY"
                accentColor={accent}
                effect={effect}
                beatIndex={activeCue.beatIndex}
                activeLabel={activeNode.label}
              />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 22 }}>
              {scene.keyPoints.slice(0, 4).map((pt, i) => {
                const p = spring({ frame: Math.max(0, frame - (6 + i * 4)), fps, config: springConfig });
                const isFocusedPt = i === targetIndex % Math.max(1, Math.min(4, scene.keyPoints.length));
                const ptScale = isFocusedPt ? interpolate(beatSpring, [0, 1], [0.98, 1.025]) : 0.98;
                return (
                  <div
                    key={i}
                    style={{
                      transform: `translateY(${interpolate(p, [0, 1], [24, 0])}px) scale(${ptScale})`,
                      opacity: isFocusedPt ? p : p * 0.52,
                      backgroundColor: isFocusedPt ? 'rgba(15, 30, 58, 0.92)' : 'rgba(15, 23, 42, 0.8)',
                      border: `1px solid ${isFocusedPt ? `${accent}88` : 'rgba(148,163,184,0.2)'}`,
                      boxShadow: isFocusedPt ? `0 0 20px ${accent}28` : 'none',
                      borderRadius: 14,
                      padding: '22px 26px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: accent,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ color: '#E2E8F0', fontSize: 23, lineHeight: 1.4 }}>
                      <AnimatedMetricText
                        text={pt}
                        triggerFrame={isFocusedPt ? cueStartFrame : 6 + i * 4}
                        highlightColor={isFocusedPt ? accent : undefined}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AbsoluteFill>
      </SceneTransitionWrapper>
    );
  }

  // 4. PROTOCOL TIMELINE
  if (scene.template === 'protocol-timeline') {
    const steps = scene.diagramData?.protocolSteps || [
      { actor: 'HOST', target: 'DEVICE', message: 'Initialize & Handshake', timing: 'T0 + 10ms' },
      { actor: 'DEVICE', target: 'HOST', message: 'Capabilities Ack', timing: 'T0 + 25ms' },
      { actor: 'HOST', target: 'DEVICE', message: 'Config & Link Up', timing: 'T0 + 60ms' },
      { actor: 'DEVICE', target: 'HOST', message: 'Data Transfer Ready', timing: 'T0 + 100ms' },
    ];

    return (
      <SceneTransitionWrapper
        sceneIndex={scene.index}
        sceneTotalFrames={sceneTotalFrames}
        accentColor={accent}
      >
        <AbsoluteFill
          style={{
            padding: '105px 80px 140px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
            zIndex: 10,
          }}
        >
          {renderHeader()}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1, justifyContent: 'center' }}>
            {steps.map((st, i) => {
              const delay = effect === 'cascade-reveal' ? Math.round((i / Math.max(1, steps.length)) * sceneTotalFrames * 0.25) : i * 4;
              const p = spring({ frame: Math.max(0, frame - delay), fps, config: springConfig });
              const currentActiveIdx =
                allCues.length > 1
                  ? targetIndex % steps.length
                  : scene.diagramData?.activeStepIndex ??
                    Math.min(steps.length - 1, Math.floor(sceneProgress * steps.length));
              const isAlertStep = effect === 'glitch-alert' && i === currentActiveIdx;
              const isActiveStep = i === currentActiveIdx;
              const isPassed = i < currentActiveIdx;
              const rowScale = isActiveStep
                ? interpolate(beatSpring, [0, 1], [0.985, 1.025])
                : 0.98;

              return (
                <div
                  key={i}
                  style={{
                    transform: `translateX(${interpolate(p, [0, 1], [-60, 0])}px) scale(${rowScale})`,
                    opacity: isActiveStep ? p : p * 0.52,
                    display: 'grid',
                    gridTemplateColumns: '170px 190px 1fr 190px',
                    alignItems: 'center',
                    gap: 24,
                    backgroundColor: isAlertStep
                      ? 'rgba(120, 53, 15, 0.35)'
                      : isActiveStep
                      ? 'rgba(15, 30, 58, 0.96)'
                      : 'rgba(15, 23, 42, 0.86)',
                    border: `${isActiveStep ? 2 : 1}px solid ${isAlertStep ? '#F59E0B' : isActiveStep ? accent : `${accent}44`}`,
                    borderRadius: 16,
                    padding: '24px 32px',
                    boxShadow: isActiveStep ? `0 0 28px ${isAlertStep ? '#F59E0B44' : `${accent}44`}` : 'none',
                  }}
                >
                  <div style={{ color: isAlertStep ? '#FBBF24' : accent, fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {st.timing || `STEP ${i + 1}`}
                  </div>
                  <div
                    style={{
                      backgroundColor: `${accent}20`,
                      border: `1px solid ${accent}66`,
                      borderRadius: 8,
                      padding: '8px 14px',
                      color: '#FFFFFF',
                      fontSize: 20,
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  >
                    {st.actor} → {st.target}
                  </div>
                  <div style={{ color: '#F1F5F9', fontSize: 25, fontWeight: 600 }}>
                    <AnimatedMetricText
                      text={st.message}
                      triggerFrame={isActiveStep ? cueStartFrame : delay}
                      highlightColor={isActiveStep ? accent : undefined}
                    />
                  </div>
                  <div
                    style={{
                      color: isAlertStep ? '#FBBF24' : isPassed || !isActiveStep ? '#10B981' : accent,
                      fontSize: 18,
                      fontWeight: 700,
                      textAlign: 'right',
                    }}
                  >
                    {isAlertStep ? 'TIMEOUT RISK ⚠' : isActiveStep ? 'ACTIVE ▶' : 'VERIFIED ✓'}
                  </div>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      </SceneTransitionWrapper>
    );
  }

  // 5. COMPARISON MATRIX
  if (scene.template === 'comparison-matrix') {
    const headers = scene.diagramData?.comparisonHeaders || ['Baseline Spec', 'Target / Next-Gen'];
    const rows = scene.diagramData?.comparisonRows || [
      { metric: 'Bandwidth / Throughput', optionA: 'Standard', optionB: '2.4x Enhanced', highlight: 'B' as const },
      { metric: 'Signal Integrity', optionA: 'Nominal', optionB: 'Low Jitter / High SNR', highlight: 'B' as const },
      { metric: 'Power Efficiency', optionA: 'Baseline', optionB: '-35% Active Power', highlight: 'B' as const },
    ];

    return (
      <SceneTransitionWrapper
        sceneIndex={scene.index}
        sceneTotalFrames={sceneTotalFrames}
        accentColor={accent}
      >
        <AbsoluteFill
          style={{
            padding: '105px 80px 140px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
            zIndex: 10,
          }}
        >
          {renderHeader()}
          <div
            style={{
              backgroundColor: 'rgba(11, 17, 32, 0.9)',
              border: `1px solid ${accent}44`,
              borderRadius: 20,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.1fr 1fr 1fr',
                backgroundColor: 'rgba(15, 23, 42, 0.98)',
                padding: '22px 34px',
                borderBottom: `2px solid ${accent}55`,
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              <div style={{ color: '#94A3B8' }}>ENGINEERING METRIC</div>
              <div style={{ color: '#E2E8F0' }}>{headers[0]}</div>
              <div style={{ color: accent }}>{headers[1]}</div>
            </div>

            {rows.map((r, i) => {
              const p = spring({ frame: Math.max(0, frame - (4 + i * 4)), fps, config: springConfig });
              const isRowFocused = i === targetIndex % Math.max(1, rows.length);
              const rowAccent = effect === 'glitch-alert' && isRowFocused ? '#F59E0B' : accent;
              const rowScale = isRowFocused
                ? interpolate(beatSpring, [0, 1], [0.99, 1.015])
                : 0.99;
              return (
                <div
                  key={i}
                  style={{
                    opacity: isRowFocused ? p : p * 0.55,
                    transform: `translateY(${interpolate(p, [0, 1], [18, 0])}px) scale(${rowScale})`,
                    display: 'grid',
                    gridTemplateColumns: '1.1fr 1fr 1fr',
                    padding: '24px 34px',
                    backgroundColor: isRowFocused ? `${rowAccent}18` : 'transparent',
                    borderLeft: isRowFocused ? `6px solid ${rowAccent}` : '6px solid transparent',
                    borderBottom: '1px solid rgba(148,163,184,0.14)',
                    fontSize: 24,
                    alignItems: 'center',
                    gap: 18,
                  }}
                >
                  <div>
                    <div style={{ color: '#F8FAFC', fontWeight: 700 }}>{r.metric}</div>
                    <AnimatedComparisonBar
                      labelA={r.optionA}
                      labelB={r.optionB}
                      accentColor={rowAccent}
                      triggerFrame={isRowFocused ? cueStartFrame : 4 + i * 4}
                      highlight={r.highlight}
                    />
                  </div>
                  <div style={{ color: r.highlight === 'A' ? '#10B981' : '#CBD5E1', fontWeight: r.highlight === 'A' ? 700 : 400 }}>
                    <AnimatedMetricText
                      text={r.optionA}
                      triggerFrame={isRowFocused ? cueStartFrame : 4 + i * 4}
                    />
                  </div>
                  <div style={{ color: r.highlight === 'B' ? rowAccent : '#CBD5E1', fontWeight: r.highlight === 'B' ? 800 : 400 }}>
                    <AnimatedMetricText
                      text={r.optionB}
                      triggerFrame={isRowFocused ? cueStartFrame : 4 + i * 4}
                      highlightColor={r.highlight === 'B' ? rowAccent : undefined}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      </SceneTransitionWrapper>
    );
  }

  // 5b. PACKET / FRAME BIT-FIELD DISSECTION
  if (scene.template === 'packet-frame') {
    const fields = scene.diagramData?.packetFields || [
      { name: 'Frame Ctrl', bits: '2B', value: '0x0080', description: '協定類型與控制旗標', color: '#38BDF8', highlight: true },
      { name: 'Addr / ID', bits: '6B', value: 'RA / TA', description: '來源與目的端位址', color: '#6366F1' },
      { name: 'Payload', bits: '0–2312B', value: 'Data / IE', description: '主要協商資訊與負載', color: '#10B981', highlight: true },
      { name: 'FCS / CRC', bits: '4B', value: 'CRC-32', description: '整幀完整性校驗碼', color: '#F59E0B' },
    ];
    const activeFieldIdx =
      allCues.length > 1
        ? targetIndex % Math.max(1, fields.length)
        : Math.min(fields.length - 1, Math.floor(sceneProgress * fields.length));
    const activeField = fields[activeFieldIdx] || fields[0];
    const scanProgress = (frame % 75) / 75;

    return (
      <SceneTransitionWrapper
        sceneIndex={scene.index}
        sceneTotalFrames={sceneTotalFrames}
        accentColor={accent}
      >
        <AbsoluteFill
          style={{
            padding: '105px 80px 140px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
            zIndex: 10,
          }}
        >
          {renderHeader()}
          <div
            style={{
              backgroundColor: 'rgba(11, 17, 32, 0.92)',
              border: `1px solid ${accent}44`,
              borderRadius: 20,
              padding: '30px 34px',
              display: 'flex',
              flexDirection: 'column',
              gap: 28,
              flex: 1,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Bitstream bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 15, color: '#94A3B8', fontWeight: 700, letterSpacing: '0.08em' }}>
                <span>FRAME BITSTREAM LAYOUT • {fields.length} FIELDS</span>
                <span style={{ color: accent }}>ACTIVE FIELD: {activeField.name}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  position: 'relative',
                  padding: 10,
                  borderRadius: 16,
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  border: '1px solid rgba(148,163,184,0.2)',
                }}
              >
                {fields.map((f, i) => {
                  const p = spring({ frame: Math.max(0, frame - i * 4), fps, config: springConfig });
                  const isFocused = i === activeFieldIdx;
                  const fieldColor = f.color || accent;
                  const flexWeight = /payload|body|addr/i.test(f.name) ? 1.8 : 1;
                  return (
                    <div
                      key={i}
                      style={{
                        flex: flexWeight,
                        opacity: isFocused ? p : p * 0.62,
                        transform: `translateY(${interpolate(p, [0, 1], [16, 0])}px) scale(${
                          isFocused ? interpolate(beatSpring, [0, 1], [0.99, 1.03]) : 0.98
                        })`,
                        backgroundColor: isFocused ? `${fieldColor}26` : 'rgba(15, 23, 42, 0.9)',
                        border: `2px solid ${isFocused ? fieldColor : `${fieldColor}55`}`,
                        boxShadow: isFocused ? `0 0 28px ${fieldColor}44` : 'none',
                        borderRadius: 12,
                        padding: '18px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: 132,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: fieldColor,
                            backgroundColor: `${fieldColor}1F`,
                            padding: '3px 8px',
                            borderRadius: 6,
                          }}
                        >
                          {f.bits}
                        </span>
                        {isFocused && (
                          <span style={{ fontSize: 12, fontWeight: 800, color: '#F8FAFC' }}>FOCUS</span>
                        )}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#F8FAFC', marginTop: 10 }}>
                        {f.name}
                      </div>
                      <div style={{ fontSize: 15, color: '#CBD5E1', fontFamily: 'ui-monospace, Consolas, monospace', marginTop: 6 }}>
                        {f.value || '—'}
                      </div>
                    </div>
                  );
                })}
                {/* Moving packet scan pulse */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${scanProgress * 100}%`,
                    width: 4,
                    background: `linear-gradient(180deg, transparent, ${accent}, transparent)`,
                    boxShadow: `0 0 18px ${accent}`,
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>

            {/* Active field spotlight detail */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 22, flex: 1 }}>
              <div
                style={{
                  backgroundColor: 'rgba(15, 30, 58, 0.94)',
                  border: `2px solid ${activeField.color || accent}`,
                  boxShadow: `0 0 30px ${(activeField.color || accent)}33`,
                  borderRadius: 16,
                  padding: '26px 30px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 800, color: activeField.color || accent, letterSpacing: '0.08em', marginBottom: 10 }}>
                  FIELD INSPECTOR • {activeField.bits} • {activeField.value || 'BIT FIELD'}
                </div>
                <div style={{ fontSize: 34, fontWeight: 800, color: '#F8FAFC', marginBottom: 12 }}>
                  {activeField.name}
                </div>
                <div style={{ fontSize: 23, color: '#CBD5E1', lineHeight: 1.48 }}>
                  {activeField.description || scene.keyPoints[activeFieldIdx] || scene.visualDescription}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
                {scene.keyPoints.slice(0, 3).map((pt, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: 'rgba(15, 23, 42, 0.85)',
                      border: `1px solid ${idx === activeFieldIdx % Math.max(1, scene.keyPoints.length) ? accent : 'rgba(148,163,184,0.2)'}`,
                      borderLeft: `4px solid ${accent}`,
                      borderRadius: 12,
                      padding: '14px 18px',
                      fontSize: 19,
                      color: '#E2E8F0',
                      fontWeight: 600,
                    }}
                  >
                    {pt}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AbsoluteFill>
      </SceneTransitionWrapper>
    );
  }

  // 5c. STATE MACHINE TRANSITION DIAGRAM
  if (scene.template === 'state-machine') {
    const states = scene.diagramData?.stateNodes || [
      { id: 's1', label: 'INIT', sublabel: '掃描 / 偵測', status: 'normal' as const },
      { id: 's2', label: 'AUTH', sublabel: '身分驗證', status: 'normal' as const },
      { id: 's3', label: 'NEGOTIATE', sublabel: '參數協商', status: 'active' as const },
      { id: 's4', label: 'ACTIVE', sublabel: '高速傳輸', status: 'success' as const },
    ];
    const transitions = scene.diagramData?.stateTransitions || [
      { from: states[0]?.id || 's1', to: states[1]?.id || 's2', trigger: 'Detect OK' },
      { from: states[1]?.id || 's2', to: states[2]?.id || 's3', trigger: 'Auth OK' },
      { from: states[2]?.id || 's3', to: states[3]?.id || 's4', trigger: 'Link Up' },
    ];
    const activeStateIdx =
      allCues.length > 1
        ? targetIndex % Math.max(1, states.length)
        : Math.min(states.length - 1, Math.floor(sceneProgress * states.length));
    const errorTransitions = transitions.filter((t) => t.isErrorPath);

    return (
      <SceneTransitionWrapper
        sceneIndex={scene.index}
        sceneTotalFrames={sceneTotalFrames}
        accentColor={accent}
      >
        <AbsoluteFill
          style={{
            padding: '105px 80px 140px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
            zIndex: 10,
          }}
        >
          {renderHeader()}
          <div
            style={{
              backgroundColor: 'rgba(11, 17, 32, 0.92)',
              border: `1px solid ${accent}44`,
              borderRadius: 20,
              padding: '34px 36px',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 24,
            }}
          >
            {/* Horizontal State Chain */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
              {states.map((st, i) => {
                const p = spring({ frame: Math.max(0, frame - i * 5), fps, config: springConfig });
                const isFocused = i === activeStateIdx;
                const statusColor =
                  st.status === 'error'
                    ? '#F59E0B'
                    : st.status === 'success'
                    ? '#10B981'
                    : isFocused
                    ? accent
                    : '#64748B';
                const nextTransition = transitions.find(
                  (t) => !t.isErrorPath && t.from === st.id && t.to === states[i + 1]?.id
                );
                return (
                  <React.Fragment key={st.id || i}>
                    <div
                      style={{
                        flex: 1,
                        opacity: isFocused ? p : p * 0.65,
                        transform: `translateY(${interpolate(p, [0, 1], [22, 0])}px) scale(${
                          isFocused ? interpolate(beatSpring, [0, 1], [0.98, 1.05]) : 0.97
                        })`,
                        backgroundColor: isFocused ? `${statusColor}24` : 'rgba(15, 23, 42, 0.94)',
                        border: `2px solid ${isFocused ? statusColor : `${statusColor}66`}`,
                        boxShadow: isFocused ? `0 0 34px ${statusColor}44` : 'none',
                        borderRadius: 18,
                        padding: '24px 18px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800, color: statusColor, letterSpacing: '0.1em', marginBottom: 8 }}>
                        STATE 0{i + 1} {isFocused ? '• ACTIVE' : ''}
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: '#F8FAFC' }}>{st.label}</div>
                      {st.sublabel && (
                        <div style={{ fontSize: 16, color: '#CBD5E1', marginTop: 8 }}>{st.sublabel}</div>
                      )}
                    </div>
                    {i < states.length - 1 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 92 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: i === activeStateIdx ? accent : '#94A3B8',
                            marginBottom: 6,
                            textAlign: 'center',
                          }}
                        >
                          {nextTransition?.trigger || 'NEXT'}
                        </div>
                        <div
                          style={{
                            width: 76,
                            height: 3,
                            backgroundColor: i <= activeStateIdx ? accent : 'rgba(148,163,184,0.35)',
                            position: 'relative',
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              right: -2,
                              top: -5,
                              width: 0,
                              height: 0,
                              borderTop: '6px solid transparent',
                              borderBottom: '6px solid transparent',
                              borderLeft: `10px solid ${i <= activeStateIdx ? accent : 'rgba(148,163,184,0.5)'}`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Error / Recovery Return Path Banner */}
            {errorTransitions.length > 0 && (
              <div
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  border: '1px dashed rgba(245, 158, 11, 0.65)',
                  borderRadius: 14,
                  padding: '16px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: '#FBBF24', fontSize: 16, fontWeight: 800, letterSpacing: '0.06em' }}>
                  ⚠ EXCEPTION / RECOVERY PATH
                </span>
                <span style={{ color: '#FDE68A', fontSize: 19, fontWeight: 700 }}>
                  {errorTransitions.map((e) => `${e.from.toUpperCase()} ──(${e.trigger})──▶ ${e.to.toUpperCase()}`).join('   |   ')}
                </span>
              </div>
            )}

            {/* Bottom Key Points */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, scene.keyPoints.length))}, 1fr)`, gap: 16 }}>
              {scene.keyPoints.slice(0, 3).map((pt, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.86)',
                    border: `1px solid ${idx === activeStateIdx % Math.max(1, scene.keyPoints.length) ? accent : 'rgba(148,163,184,0.2)'}`,
                    borderRadius: 12,
                    padding: '16px 20px',
                    fontSize: 19,
                    color: '#E2E8F0',
                    fontWeight: 600,
                  }}
                >
                  {pt}
                </div>
              ))}
            </div>
          </div>
        </AbsoluteFill>
      </SceneTransitionWrapper>
    );
  }

  // 5d. CODE / CLI / LOG INSPECTOR
  if (scene.template === 'code-log') {
    const lines = scene.diagramData?.codeLines || [
      { lineNo: 1, text: '[00.012] INIT: system interface online', level: 'normal' as const },
      { lineNo: 2, text: '[00.048] HANDSHAKE: capability negotiated OK', level: 'success' as const, annotation: '基礎協商完成' },
      { lineNo: 3, text: '[00.194] ERROR: link training timeout (err=-110)', level: 'error' as const, annotation: '關鍵異常點：需檢查時脈與實體鏈路' },
    ];
    const activeLineIdx =
      allCues.length > 1
        ? targetIndex % Math.max(1, lines.length)
        : Math.min(lines.length - 1, Math.floor(sceneProgress * lines.length));
    const activeLine = lines[activeLineIdx] || lines[0];
    const levelColorMap: Record<string, string> = {
      normal: '#94A3B8',
      highlight: accent,
      warn: '#F59E0B',
      error: '#EF4444',
      success: '#10B981',
    };

    return (
      <SceneTransitionWrapper
        sceneIndex={scene.index}
        sceneTotalFrames={sceneTotalFrames}
        accentColor={accent}
      >
        <AbsoluteFill
          style={{
            padding: '105px 80px 140px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
            zIndex: 10,
          }}
        >
          {renderHeader()}
          <div style={{ display: 'grid', gridTemplateColumns: '1.65fr 1fr', gap: 24, flex: 1 }}>
            {/* Terminal Window */}
            <div
              style={{
                backgroundColor: '#070C18',
                border: `1px solid ${accent}44`,
                borderRadius: 18,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.96)',
                  borderBottom: '1px solid rgba(148,163,184,0.18)',
                  padding: '14px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: '#EF4444' }} />
                  <span style={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: '#F59E0B' }} />
                  <span style={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: '#10B981' }} />
                  <span style={{ marginLeft: 12, color: '#E2E8F0', fontSize: 16, fontWeight: 700, fontFamily: 'ui-monospace, Consolas, monospace' }}>
                    {scene.diagramData?.codeTitle || 'diagnostic-trace.log'}
                  </span>
                </div>
                <span style={{ color: accent, fontSize: 13, fontWeight: 800, letterSpacing: '0.08em' }}>
                  {(scene.diagramData?.codeLanguage || 'LOG').toUpperCase()}
                </span>
              </div>

              <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1, justifyContent: 'center' }}>
                {lines.map((line, i) => {
                  const p = spring({ frame: Math.max(0, frame - i * 4), fps, config: springConfig });
                  const isFocused = i === activeLineIdx;
                  const lineColor = levelColorMap[line.level || 'normal'] || '#94A3B8';
                  return (
                    <div
                      key={i}
                      style={{
                        opacity: isFocused ? p : p * 0.62,
                        transform: `translateX(${interpolate(p, [0, 1], [-14, 0])}px)`,
                        backgroundColor: isFocused ? `${lineColor}20` : 'rgba(15, 23, 42, 0.45)',
                        borderLeft: `5px solid ${isFocused ? lineColor : 'transparent'}`,
                        borderRadius: 10,
                        padding: '14px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        fontFamily: 'ui-monospace, Consolas, monospace',
                      }}
                    >
                      <span style={{ color: '#64748B', fontSize: 15, minWidth: 28, textAlign: 'right' }}>
                        {String(line.lineNo ?? i + 1).padStart(2, '0')}
                      </span>
                      <span
                        style={{
                          color: line.level === 'error' ? '#FCA5A5' : line.level === 'warn' ? '#FDE68A' : line.level === 'success' ? '#6EE7B7' : '#F1F5F9',
                          fontSize: 18,
                          fontWeight: isFocused ? 700 : 500,
                          lineHeight: 1.4,
                          wordBreak: 'break-word',
                        }}
                      >
                        {line.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Annotation Callout */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(15, 30, 58, 0.94)',
                  border: `2px solid ${levelColorMap[activeLine.level || 'highlight'] || accent}`,
                  borderRadius: 18,
                  padding: '28px 26px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    color: levelColorMap[activeLine.level || 'highlight'] || accent,
                    fontSize: 15,
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    marginBottom: 12,
                  }}
                >
                  LINE {String(activeLine.lineNo ?? activeLineIdx + 1).padStart(2, '0')} • {(activeLine.level || 'INFO').toUpperCase()}
                </div>
                <div style={{ color: '#F8FAFC', fontSize: 26, fontWeight: 700, lineHeight: 1.45 }}>
                  {activeLine.annotation || scene.keyPoints[activeLineIdx % Math.max(1, scene.keyPoints.length)] || activeLine.text}
                </div>
              </div>
              <LiveTelemetryWidget
                title="TRACE ANALYZER"
                accentColor={accent}
                effect={effect}
                beatIndex={activeCue.beatIndex}
                activeLabel={`LINE ${String(activeLine.lineNo ?? activeLineIdx + 1).padStart(2, '0')}`}
              />
            </div>
          </div>
        </AbsoluteFill>
      </SceneTransitionWrapper>
    );
  }

  // 5e. KPI METRICS SCORECARD
  if (scene.template === 'kpi-metrics') {
    const metrics = scene.diagramData?.kpiMetrics || [
      { label: 'Throughput', value: '4.8 Gbps', delta: '+85%', target: '> 4.0 Gbps', status: 'good' as const },
      { label: 'P99 Latency', value: '3.2 ms', delta: '-60%', target: '< 5.0 ms', status: 'good' as const },
      { label: 'Error Rate', value: '0.42%', delta: '需關注', target: '< 0.1%', status: 'warn' as const },
      { label: 'Active Power', value: '1.85 W', delta: '-22%', target: '< 2.2 W', status: 'good' as const },
    ];
    const activeMetricIdx =
      allCues.length > 1
        ? targetIndex % Math.max(1, metrics.length)
        : Math.min(metrics.length - 1, Math.floor(sceneProgress * metrics.length));
    const statusColorMap: Record<string, string> = {
      good: '#10B981',
      warn: '#F59E0B',
      bad: '#EF4444',
      neutral: accent,
    };

    return (
      <SceneTransitionWrapper
        sceneIndex={scene.index}
        sceneTotalFrames={sceneTotalFrames}
        accentColor={accent}
      >
        <AbsoluteFill
          style={{
            padding: '105px 80px 140px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
            zIndex: 10,
          }}
        >
          {renderHeader()}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, flex: 1 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(4, Math.max(2, metrics.length))}, minmax(0, 1fr))`,
                gap: 22,
                flex: 1,
              }}
            >
              {metrics.slice(0, 4).map((m, i) => {
                const p = spring({ frame: Math.max(0, frame - i * 4), fps, config: springConfig });
                const isFocused = i === activeMetricIdx;
                const badgeColor = statusColorMap[m.status || 'neutral'] || accent;
                return (
                  <div
                    key={i}
                    style={{
                      opacity: isFocused ? p : p * 0.68,
                      transform: `translateY(${interpolate(p, [0, 1], [24, 0])}px) scale(${
                        isFocused ? interpolate(beatSpring, [0, 1], [0.98, 1.04]) : 0.97
                      })`,
                      backgroundColor: isFocused ? 'rgba(15, 30, 58, 0.96)' : 'rgba(11, 17, 32, 0.9)',
                      border: `2px solid ${isFocused ? badgeColor : 'rgba(148,163,184,0.22)'}`,
                      boxShadow: isFocused ? `0 0 34px ${badgeColor}40` : 'none',
                      borderRadius: 20,
                      padding: '28px 24px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 17, fontWeight: 700, color: '#94A3B8' }}>{m.label}</span>
                      {m.delta && (
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: badgeColor,
                            backgroundColor: `${badgeColor}20`,
                            padding: '4px 10px',
                            borderRadius: 999,
                          }}
                        >
                          {m.delta}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 48, fontWeight: 900, color: '#F8FAFC', letterSpacing: '-0.02em', margin: '18px 0' }}>
                      <AnimatedMetricText
                        text={m.value}
                        triggerFrame={isFocused ? cueStartFrame : 4 + i * 4}
                        highlightColor={badgeColor}
                      />
                    </div>
                    <div style={{ borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 14, fontSize: 15, color: '#CBD5E1' }}>
                      TARGET: <span style={{ color: badgeColor, fontWeight: 700 }}>{m.target || 'SPEC'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <LiveTelemetryWidget
              title="BENCHMARK TELEMETRY"
              accentColor={accent}
              effect={effect}
              beatIndex={activeCue.beatIndex}
              activeLabel={metrics[activeMetricIdx]?.label || 'KPI'}
            />
          </div>
        </AbsoluteFill>
      </SceneTransitionWrapper>
    );
  }

  // 5f. FAULT TREE ROOT-CAUSE DECISION DIAGRAM
  if (scene.template === 'fault-tree') {
    const faultRoot = scene.diagramData?.faultRoot || scene.title;
    const branches = scene.diagramData?.faultBranches || [
      { symptom: '供電軌壓降', check: '量測 VR 輸出與 PWRGD', passAction: '進入時脈驗證', failRootCause: 'PMIC 保護或負載短路', severity: 'high' as const },
      { symptom: '時脈偏移 / 重置卡死', check: '量測 RefClk 與 PLT_RST#', passAction: '轉查協定層', failRootCause: '晶振異常或 EC 時序中斷', severity: 'high' as const },
      { symptom: '協定逾時 / 降速', check: '檢視 AER / 驅動日誌', passAction: '檢查上層系統', failRootCause: 'SI 走線失配或韌體相容性', severity: 'medium' as const },
    ];
    const activeBranchIdx =
      allCues.length > 1
        ? targetIndex % Math.max(1, branches.length)
        : Math.min(branches.length - 1, Math.floor(sceneProgress * branches.length));

    return (
      <SceneTransitionWrapper
        sceneIndex={scene.index}
        sceneTotalFrames={sceneTotalFrames}
        accentColor={accent}
      >
        <AbsoluteFill
          style={{
            padding: '105px 80px 140px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
            zIndex: 10,
          }}
        >
          {renderHeader()}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
            {/* Top Root Symptom Node */}
            <div
              style={{
                alignSelf: 'center',
                minWidth: 680,
                backgroundColor: 'rgba(239, 68, 68, 0.14)',
                border: '2px solid #EF4444',
                boxShadow: '0 0 28px rgba(239, 68, 68, 0.25)',
                borderRadius: 16,
                padding: '18px 34px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: '#FCA5A5', letterSpacing: '0.12em', marginBottom: 4 }}>
                ROOT SYMPTOM • 異常現象起點
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#F8FAFC' }}>{faultRoot}</div>
            </div>

            {/* Branch Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, branches.length))}, minmax(0, 1fr))`,
                gap: 22,
                flex: 1,
              }}
            >
              {branches.slice(0, 3).map((b, i) => {
                const p = spring({ frame: Math.max(0, frame - (5 + i * 5)), fps, config: springConfig });
                const isFocused = i === activeBranchIdx;
                const sevColor = b.severity === 'high' ? '#F59E0B' : b.severity === 'low' ? '#38BDF8' : accent;
                return (
                  <div
                    key={i}
                    style={{
                      opacity: isFocused ? p : p * 0.62,
                      transform: `translateY(${interpolate(p, [0, 1], [22, 0])}px) scale(${
                        isFocused ? interpolate(beatSpring, [0, 1], [0.98, 1.03]) : 0.97
                      })`,
                      backgroundColor: isFocused ? 'rgba(15, 30, 58, 0.96)' : 'rgba(11, 17, 32, 0.9)',
                      border: `2px solid ${isFocused ? sevColor : 'rgba(148,163,184,0.22)'}`,
                      boxShadow: isFocused ? `0 0 30px ${sevColor}38` : 'none',
                      borderRadius: 18,
                      padding: '22px 24px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 14,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: sevColor, letterSpacing: '0.08em', marginBottom: 6 }}>
                        BRANCH 0{i + 1} • {(b.severity || 'medium').toUpperCase()} PRIORITY
                      </div>
                      <div style={{ fontSize: 23, fontWeight: 800, color: '#F8FAFC', marginBottom: 10 }}>
                        {b.symptom}
                      </div>
                      <div
                        style={{
                          backgroundColor: 'rgba(15, 23, 42, 0.9)',
                          border: '1px solid rgba(148,163,184,0.2)',
                          borderRadius: 10,
                          padding: '12px 14px',
                          fontSize: 17,
                          color: '#CBD5E1',
                        }}
                      >
                        <strong style={{ color: accent }}>量測檢查：</strong>
                        {b.check}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div
                        style={{
                          backgroundColor: 'rgba(16, 185, 129, 0.12)',
                          borderLeft: '4px solid #10B981',
                          borderRadius: 8,
                          padding: '10px 14px',
                          fontSize: 16,
                          color: '#A7F3D0',
                        }}
                      >
                        <strong>PASS → </strong>
                        {b.passAction}
                      </div>
                      <div
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.14)',
                          borderLeft: '4px solid #EF4444',
                          borderRadius: 8,
                          padding: '10px 14px',
                          fontSize: 16,
                          color: '#FECACA',
                        }}
                      >
                        <strong>FAIL 根因 → </strong>
                        {b.failRootCause}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </AbsoluteFill>
      </SceneTransitionWrapper>
    );
  }

  // 6. DEBUG CHECKLIST / 7. SUMMARY TAKEAWAYS
  const activeCardIdx =
    allCues.length > 1
      ? targetIndex % Math.max(1, scene.keyPoints.length)
      : Math.min(
          Math.max(0, scene.keyPoints.length - 1),
          Math.floor(sceneProgress * Math.max(1, scene.keyPoints.length))
        );
  const isChecklistSplit =
    allCues.length >= 3 && activeCue.beatIndex % 2 === 1 && scene.keyPoints.length >= 2;
  const activePointText = scene.keyPoints[activeCardIdx] || scene.title;
  const activeCardAccent = effect === 'glitch-alert' ? '#F59E0B' : accent;

  return (
    <SceneTransitionWrapper
      sceneIndex={scene.index}
      sceneTotalFrames={sceneTotalFrames}
      accentColor={accent}
    >
      <AbsoluteFill
        style={{
          padding: '105px 80px 140px',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
          zIndex: 10,
        }}
      >
        {renderHeader()}
        {isChecklistSplit ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 28, flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div
                style={{
                  flex: 1,
                  transform: `translateY(${interpolate(beatSpring, [0, 1], [16, 0])}px) scale(${interpolate(beatSpring, [0, 1], [0.97, 1])})`,
                  opacity: interpolate(beatSpring, [0, 1], [0.45, 1]),
                  backgroundColor: 'rgba(15, 30, 58, 0.96)',
                  border: `2px solid ${activeCardAccent}`,
                  boxShadow: `0 0 34px ${activeCardAccent}44`,
                  borderRadius: 20,
                  padding: '34px 38px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div style={{ color: activeCardAccent, fontSize: 18, fontWeight: 800, marginBottom: 14, letterSpacing: '0.06em' }}>
                  {scene.template === 'debug-checklist'
                    ? `ACTIVE TRIAGE STEP 0${activeCardIdx + 1} • ${effectShortName} ▶`
                    : `SPOTLIGHT TAKEAWAY 0${activeCardIdx + 1} • ${effectShortName} ▶`}
                </div>
                <div style={{ color: '#F8FAFC', fontSize: 34, fontWeight: 700, lineHeight: 1.42 }}>
                  <AnimatedMetricText
                    text={activePointText}
                    triggerFrame={cueStartFrame}
                    highlightColor={activeCardAccent}
                  />
                </div>
              </div>
              <LiveTelemetryWidget
                title={scene.template === 'debug-checklist' ? 'DIAGNOSTIC TRACE' : 'KEY METRIC MONITOR'}
                accentColor={accent}
                effect={effect}
                beatIndex={activeCue.beatIndex}
                activeLabel={`STEP 0${activeCardIdx + 1}`}
              />
            </div>

            {/* Compact Step Index List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
              {scene.keyPoints.map((pt, i) => {
                const isFocused = i === activeCardIdx;
                return (
                  <div
                    key={i}
                    style={{
                      backgroundColor: isFocused ? 'rgba(15, 30, 58, 0.94)' : 'rgba(15, 23, 42, 0.72)',
                      border: `1px solid ${isFocused ? activeCardAccent : 'rgba(148,163,184,0.18)'}`,
                      borderLeft: `5px solid ${isFocused ? activeCardAccent : 'rgba(148,163,184,0.28)'}`,
                      borderRadius: 12,
                      padding: '16px 20px',
                      opacity: isFocused ? 1 : 0.55,
                      transform: `scale(${isFocused ? 1.02 : 0.98})`,
                    }}
                  >
                    <div style={{ color: isFocused ? activeCardAccent : '#94A3B8', fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
                      0{i + 1} {isFocused ? '• ACTIVE' : ''}
                    </div>
                    <div style={{ color: '#E2E8F0', fontSize: 19, fontWeight: isFocused ? 700 : 500, lineHeight: 1.35 }}>
                      {pt}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <CameraRig
            focusIndex={activeCardIdx}
            totalTargets={scene.keyPoints.length}
            triggerFrame={cueStartFrame}
            zoomScale={allCues.length > 1 ? 1.03 : 1.0}
            layoutMode="grid2x2"
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 26, flex: 1 }}>
              {scene.keyPoints.map((pt, i) => {
                const p = spring({ frame: Math.max(0, frame - i * 4), fps, config: springConfig });
                const isFocused = i === activeCardIdx;
                const cardAccent = isFocused && effect === 'glitch-alert' ? '#F59E0B' : accent;
                const cardScale = isFocused
                  ? interpolate(beatSpring, [0, 1], [0.98, 1.035])
                  : 0.96;
                return (
                  <div
                    key={i}
                    style={{
                      transform: `scale(${interpolate(p, [0, 1], [0.92, cardScale])})`,
                      opacity: isFocused ? p : p * 0.5,
                      backgroundColor: isFocused ? 'rgba(15, 30, 58, 0.94)' : 'rgba(15, 23, 42, 0.86)',
                      border: `${isFocused ? 2 : 1}px solid ${isFocused ? cardAccent : `${accent}55`}`,
                      boxShadow: isFocused ? `0 0 30px ${cardAccent}44` : 'none',
                      borderRadius: 18,
                      padding: '30px 32px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                    }}
                  >
                    <div style={{ color: cardAccent, fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
                      {scene.template === 'debug-checklist'
                        ? `STEP 0${i + 1} • ${isFocused ? `${effectShortName} ▶` : 'TRIAGE CHECK'}`
                        : `KEY TAKEAWAY 0${i + 1}${isFocused ? ` • ${effectShortName}` : ''}`}
                    </div>
                    <div style={{ color: '#F8FAFC', fontSize: 27, fontWeight: 600, lineHeight: 1.4 }}>
                      <AnimatedMetricText
                        text={pt}
                        triggerFrame={isFocused ? cueStartFrame : i * 4}
                        highlightColor={isFocused ? cardAccent : undefined}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CameraRig>
        )}
      </AbsoluteFill>
    </SceneTransitionWrapper>
  );
};
