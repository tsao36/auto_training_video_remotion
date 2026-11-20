import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { DOMAIN_META, EFFECT_LABELS, SceneSpec } from '../../types/training';
import { getActiveSentenceCue } from '../../utils/sentenceEffects';
import {
  AnimatedComparisonBar,
  AnimatedMetricText,
  CameraRig,
  LiveTelemetryWidget,
  SceneTransitionWrapper,
  SvgFlowConnector,
} from '../components/DynamicPrimitives';

interface SceneRendererProps {
  scene: SceneSpec;
}

export const SceneRenderer: React.FC<SceneRendererProps> = ({ scene }) => {
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
      <div>
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
            fontSize: 52,
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
                fontSize: 74,
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
