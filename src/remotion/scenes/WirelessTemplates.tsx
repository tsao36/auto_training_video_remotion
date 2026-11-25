import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  MloLinkLane,
  OfdmRuBlock,
  PacketSimChannel,
  PacketSimEvent,
  RemotionEffect,
  RfLinkBudgetStage,
  SceneSpec,
  SentenceEffectCue,
} from '../../types/training';
import { AnimatedMetricText, SceneTransitionWrapper } from '../components/DynamicPrimitives';

const CameraRig: React.FC<{
  zoom: number;
  shakeIntensity?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ zoom, shakeIntensity = 0, style, children }) => {
  const frame = useCurrentFrame();
  const dx = shakeIntensity > 0 ? Math.sin(frame * 1.9) * shakeIntensity : 0;
  const dy = shakeIntensity > 0 ? Math.cos(frame * 2.3) * shakeIntensity * 0.7 : 0;
  return (
    <div
      style={{
        ...style,
        transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${zoom.toFixed(4)})`,
        transformOrigin: 'center center',
      }}
    >
      {children}
    </div>
  );
};

export interface WirelessTemplateProps {
  scene: SceneSpec;
  renderHeader: () => React.ReactNode;
  accent: string;
  activeCue: SentenceEffectCue;
  allCues: SentenceEffectCue[];
  cueProgress: number;
  effect: RemotionEffect;
  targetIndex: number;
  beatSpring: number;
  cameraBreath: number;
  sceneTotalFrames: number;
  scenePadding: string;
  getItemRevealFrame: (itemIndex: number, itemCount: number, defaultFrame: number) => number;
}

const FONT_FAMILY = 'Inter, "Noto Sans TC", system-ui, sans-serif';
const MONO_FONT = '"JetBrains Mono", "Fira Code", Consolas, monospace';

// Deterministic pseudo-random helper so Remotion frame renders are 100% reproducible
function seededNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export const WIRELESS_TEMPLATES = new Set([
  'packet-simulator',
  'ofdm-spectrum',
  'beamforming-array',
  'qam-constellation',
  'mlo-multilink',
  'rf-link-budget',
]);

export const WirelessTemplateRenderer: React.FC<WirelessTemplateProps> = (props) => {
  const { scene } = props;
  if (scene.template === 'packet-simulator') return <PacketSimulatorScene {...props} />;
  if (scene.template === 'ofdm-spectrum') return <OfdmSpectrumScene {...props} />;
  if (scene.template === 'beamforming-array') return <BeamformingArrayScene {...props} />;
  if (scene.template === 'qam-constellation') return <QamConstellationScene {...props} />;
  if (scene.template === 'mlo-multilink') return <MloMultilinkScene {...props} />;
  if (scene.template === 'rf-link-budget') return <RfLinkBudgetScene {...props} />;
  return null;
};

/* ============================================================================
 * 1. PACKET SIMULATOR (Device A <-> Device B multi-channel packet-by-packet)
 * ========================================================================== */
const PacketSimulatorScene: React.FC<WirelessTemplateProps> = ({
  scene,
  scenePadding,
  renderHeader,
  accent,
  cueProgress,
  effect,
  targetIndex,
  cameraBreath,
  sceneTotalFrames,
  getItemRevealFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const deviceA = scene.diagramData?.simDeviceA || {
    name: 'Device A (Wi-Fi 7 AP)',
    role: 'Transmitter / Coordinator',
    ipOrMac: 'AA:BB:CC:01:00:01',
  };
  const deviceB = scene.diagramData?.simDeviceB || {
    name: 'Device B (Laptop STA)',
    role: 'Receiver / Client',
    ipOrMac: 'DD:EE:FF:02:00:88',
  };

  const channels: PacketSimChannel[] =
    scene.diagramData?.simChannels && scene.diagramData.simChannels.length > 0
      ? scene.diagramData.simChannels.slice(0, 4)
      : [
          { id: 'ch1', label: 'CH 1', band: '2.4 GHz', bandwidth: '40 MHz', color: '#F59E0B', interference: true },
          { id: 'ch36', label: 'CH 36', band: '5 GHz', bandwidth: '160 MHz', color: '#38BDF8', interference: false },
          { id: 'ch69', label: 'CH 69', band: '6 GHz', bandwidth: '320 MHz', color: '#34D399', interference: false },
        ];

  const packets: PacketSimEvent[] =
    scene.diagramData?.simPackets && scene.diagramData.simPackets.length > 0
      ? scene.diagramData.simPackets
      : [
          { seq: 1, channelId: channels[0].id, direction: 'A->B', label: 'BEACON', sizeBytes: 128, status: 'ok' },
          { seq: 2, channelId: channels[1]?.id || channels[0].id, direction: 'A->B', label: 'DATA #01', sizeBytes: 1500, status: 'ok' },
          { seq: 3, channelId: channels[2]?.id || channels[0].id, direction: 'A->B', label: 'DATA #02', sizeBytes: 1500, status: 'ok' },
          { seq: 4, channelId: channels[0].id, direction: 'A->B', label: 'DATA #03', sizeBytes: 1500, status: 'retry' },
          { seq: 5, channelId: channels[1]?.id || channels[0].id, direction: 'B->A', label: 'BA-ACK', sizeBytes: 64, status: 'ack' },
          { seq: 6, channelId: channels[2]?.id || channels[0].id, direction: 'A->B', label: 'DATA #03 (RETX)', sizeBytes: 1500, status: 'ok' },
          { seq: 7, channelId: channels[2]?.id || channels[0].id, direction: 'B->A', label: 'BA-ACK', sizeBytes: 64, status: 'ack' },
          { seq: 8, channelId: channels[1]?.id || channels[0].id, direction: 'A->B', label: 'DATA #04', sizeBytes: 1500, status: 'ok' },
        ];

  // Schedule packets sequentially one by one across the scene duration
  const flightFrames = Math.max(24, Math.min(48, Math.round(fps * 1.15)));
  const usableWindow = Math.max(flightFrames + 12, sceneTotalFrames - 18);
  const stagger = Math.max(12, Math.floor((usableWindow - flightFrames) / Math.max(1, packets.length - 1)));

  let txCount = 0;
  let rxCount = 0;
  let retryCount = 0;
  let totalBytesDelivered = 0;

  const activePackets = packets.map((pkt, idx) => {
    const startFrame = getItemRevealFrame(idx, packets.length, 10 + idx * stagger);
    const rawProgress = (frame - startFrame) / flightFrames;
    const isLaunched = rawProgress >= 0;
    const isInFlight = rawProgress >= 0 && rawProgress <= 1;
    const isCompleted = rawProgress > 1;
    const isAlertDrop = (pkt.status === 'retry' || pkt.status === 'drop') || (effect === 'glitch-alert' && idx % 3 === 1);

    if (isLaunched && pkt.direction === 'A->B') txCount++;
    if (isCompleted) {
      if (isAlertDrop) {
        retryCount++;
      } else {
        rxCount++;
        totalBytesDelivered += pkt.sizeBytes || 1500;
      }
    }

    const chIndex = Math.max(
      0,
      channels.findIndex((c) => c.id === pkt.channelId)
    );
    return { pkt, idx, chIndex, startFrame, rawProgress, isLaunched, isInFlight, isCompleted, isAlertDrop };
  });

  const activeInFlight = activePackets.filter((p) => p.isInFlight);
  const recentLog = activePackets.filter((p) => p.isLaunched).slice(-4).reverse();
  const txBlink = activeInFlight.some((p) => p.pkt.direction === 'A->B' && p.rawProgress < 0.25);
  const rxBlink = activeInFlight.some((p) => p.pkt.direction === 'A->B' && p.rawProgress > 0.78);

  const svgW = 1040;
  const svgH = 470;
  const laneTop = 58;
  const laneSpacing = channels.length > 1 ? Math.floor((svgH - 110) / (channels.length - 1)) : 0;

  return (
    <SceneTransitionWrapper sceneIndex={scene.index} sceneTotalFrames={sceneTotalFrames} accentColor={accent}>
      <AbsoluteFill
        style={{
          padding: scenePadding,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: FONT_FAMILY,
          zIndex: 10,
        }}
      >
        {renderHeader()}

        <CameraRig
          zoom={effect === 'zoom-focus' ? 1.02 : cameraBreath}
          shakeIntensity={effect === 'glitch-alert' ? 2.5 : 0}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}
        >
          {/* Main Simulation Stage: Device A | Multi-Channel RF Lanes | Device B */}
          <div
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: '280px 1fr 280px',
              gap: 18,
              alignItems: 'stretch',
            }}
          >
            {/* DEVICE A CARD */}
            <div
              style={{
                borderRadius: 20,
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                border: `2px solid ${txBlink ? accent : `${accent}66`}`,
                boxShadow: txBlink ? `0 0 36px ${accent}44` : 'none',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      backgroundColor: `${accent}22`,
                      color: accent,
                      fontSize: 13,
                      fontWeight: 800,
                      fontFamily: MONO_FONT,
                    }}
                  >
                    NODE A • TX
                  </span>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: txBlink ? '#34D399' : '#334155',
                      boxShadow: txBlink ? '0 0 12px #34D399' : 'none',
                    }}
                  />
                </div>
                <div style={{ fontSize: 23, fontWeight: 800, color: '#F8FAFC', lineHeight: 1.25 }}>
                  {deviceA.name}
                </div>
                <div style={{ fontSize: 15, color: '#94A3B8', marginTop: 6 }}>{deviceA.role}</div>
                {deviceA.ipOrMac && (
                  <div style={{ fontSize: 13, color: '#64748B', fontFamily: MONO_FONT, marginTop: 8 }}>
                    MAC {deviceA.ipOrMac}
                  </div>
                )}
              </div>

              {/* Antenna & Radio Visual */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '14px 0' }}>
                <svg width="120" height="90" viewBox="0 0 120 90">
                  <rect x="24" y="42" width="72" height="36" rx="8" fill="#1E293B" stroke={accent} strokeWidth="2.5" />
                  <line x1="42" y1="42" x2="42" y2="16" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
                  <line x1="60" y1="42" x2="60" y2="12" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
                  <line x1="78" y1="42" x2="78" y2="16" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
                  {[0, 1, 2].map((r) => {
                    const wavePhase = ((frame * 0.05 + r * 0.33) % 1);
                    return (
                      <circle
                        key={r}
                        cx="60"
                        cy="16"
                        r={6 + wavePhase * 28}
                        fill="none"
                        stroke={accent}
                        strokeWidth="2"
                        opacity={1 - wavePhase}
                      />
                    );
                  })}
                  <circle cx="42" cy="60" r="4" fill={txBlink ? '#34D399' : '#475569'} />
                  <circle cx="56" cy="60" r="4" fill="#38BDF8" />
                  <circle cx="70" cy="60" r="4" fill={accent} />
                </svg>
              </div>

              <div
                style={{
                  borderTop: '1px solid rgba(148,163,184,0.2)',
                  paddingTop: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: '#64748B', fontFamily: MONO_FONT }}>TX QUEUED</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: accent, fontFamily: MONO_FONT }}>
                    {txCount} / {packets.filter((p) => p.direction === 'A->B').length}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#64748B', fontFamily: MONO_FONT }}>RETRIES</div>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 900,
                      color: retryCount > 0 ? '#F59E0B' : '#34D399',
                      fontFamily: MONO_FONT,
                    }}
                  >
                    {retryCount}
                  </div>
                </div>
              </div>
            </div>

            {/* CENTER MULTI-CHANNEL RF SIMULATION STAGE */}
            <div
              style={{
                borderRadius: 20,
                backgroundColor: 'rgba(9, 14, 28, 0.94)',
                border: `1.5px solid ${effect === 'glitch-alert' ? '#F59E0B88' : `${accent}44`}`,
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  left: 20,
                  right: 20,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  zIndex: 3,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 800, color: '#94A3B8', fontFamily: MONO_FONT }}>
                  MULTI-CHANNEL WIRELESS MEDIUM SIMULATOR • {channels.length} CHANNELS ACTIVE
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: accent, fontFamily: MONO_FONT }}>
                  SIM T = {(frame / fps).toFixed(2)}s
                </span>
              </div>

              <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: '100%' }}>
                <defs>
                  <filter id="pkt-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Subtle vertical timing grid */}
                {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
                  <line
                    key={ratio}
                    x1={svgW * ratio}
                    y1={42}
                    x2={svgW * ratio}
                    y2={svgH - 22}
                    stroke="rgba(148,163,184,0.1)"
                    strokeDasharray="4 6"
                  />
                ))}

                {/* Channel Lanes */}
                {channels.map((ch, cIdx) => {
                  const y = channels.length === 1 ? svgH / 2 : laneTop + cIdx * laneSpacing + 30;
                  const isFocusedChannel = cIdx === targetIndex % channels.length;
                  const hasInterference = ch.interference || (effect === 'glitch-alert' && cIdx === 0);

                  // Carrier shimmer path
                  const wavePoints: string[] = [];
                  for (let x = 24; x <= svgW - 24; x += 16) {
                    const amp = hasInterference ? 6 : 3;
                    const wy = y + Math.sin(x * 0.045 - frame * 0.25 + cIdx) * amp;
                    wavePoints.push(`${x === 24 ? 'M' : 'L'} ${x} ${wy.toFixed(1)}`);
                  }

                  return (
                    <g
                      key={ch.id}
                      opacity={spring({
                        frame: Math.max(
                          0,
                          frame - getItemRevealFrame(cIdx, channels.length, cIdx * 4)
                        ),
                        fps,
                        config: { damping: 16, stiffness: 180 },
                      })}
                    >
                      {/* Lane band backdrop */}
                      <rect
                        x={16}
                        y={y - 44}
                        width={svgW - 32}
                        height={88}
                        rx={14}
                        fill={isFocusedChannel ? `${ch.color}14` : 'rgba(15, 23, 42, 0.55)'}
                        stroke={isFocusedChannel ? `${ch.color}77` : `${ch.color}33`}
                        strokeWidth={isFocusedChannel ? 2 : 1}
                      />

                      {/* Channel Label Badge */}
                      <rect x={28} y={y - 34} width={220} height={26} rx={6} fill={`${ch.color}22`} />
                      <text
                        x={38}
                        y={y - 16}
                        fill={ch.color}
                        fontSize={14}
                        fontWeight={800}
                        fontFamily={MONO_FONT}
                      >
                        {ch.label} • {ch.band} {ch.bandwidth ? `(${ch.bandwidth})` : ''}
                      </text>

                      {/* Carrier wave baseline */}
                      <path d={wavePoints.join(' ')} fill="none" stroke={`${ch.color}44`} strokeWidth={2} />

                      {/* RF Interference Zone */}
                      {hasInterference && (
                        <g>
                          <rect
                            x={svgW * 0.45}
                            y={y - 36}
                            width={140}
                            height={72}
                            rx={10}
                            fill="rgba(245, 158, 11, 0.14)"
                            stroke="#F59E0B"
                            strokeWidth={1.5}
                            strokeDasharray="5 4"
                          />
                          <text
                            x={svgW * 0.45 + 70}
                            y={y - 18}
                            textAnchor="middle"
                            fill="#FCD34D"
                            fontSize={12}
                            fontWeight={800}
                            fontFamily={MONO_FONT}
                          >
                            RF NOISE / CCI
                          </text>
                        </g>
                      )}

                      {/* Endpoint ports */}
                      <circle cx={24} cy={y} r={6} fill={ch.color} />
                      <circle cx={svgW - 24} cy={y} r={6} fill={ch.color} />
                    </g>
                  );
                })}

                {/* Travelling Packets (one by one!) */}
                {activeInFlight.map(({ pkt, chIndex, rawProgress, isAlertDrop }) => {
                  const ch = channels[chIndex];
                  const y = channels.length === 1 ? svgH / 2 : laneTop + chIndex * laneSpacing + 30;
                  const startX = pkt.direction === 'A->B' ? 40 : svgW - 40;
                  const endX = pkt.direction === 'A->B' ? svgW - 40 : 40;

                  // If packet hits interference & drops/retries, stall and flash at midpoint
                  const effectiveProgress = isAlertDrop ? Math.min(0.54, rawProgress) : rawProgress;
                  const px = interpolate(effectiveProgress, [0, 1], [startX, endX]);
                  const py = isAlertDrop && rawProgress > 0.48
                    ? y + Math.sin(frame * 1.8) * 6
                    : y;

                  const pktColor =
                    isAlertDrop && rawProgress > 0.48
                      ? '#EF4444'
                      : pkt.status === 'ack'
                      ? '#34D399'
                      : ch.color;

                  const trailLen = pkt.direction === 'A->B' ? -72 : 72;
                  const pillOpacity = isAlertDrop && rawProgress > 0.75
                    ? interpolate(rawProgress, [0.75, 1], [1, 0])
                    : 1;

                  return (
                    <g key={pkt.seq} opacity={pillOpacity}>
                      {/* Glowing packet trail */}
                      <line
                        x1={px}
                        y1={py}
                        x2={px + trailLen}
                        y2={py}
                        stroke={pktColor}
                        strokeWidth={5}
                        strokeLinecap="round"
                        opacity={0.45}
                      />
                      {/* Packet pill */}
                      <rect
                        x={px - 68}
                        y={py - 18}
                        width={136}
                        height={36}
                        rx={10}
                        fill="#0F172A"
                        stroke={pktColor}
                        strokeWidth={2.5}
                        filter="url(#pkt-glow)"
                      />
                      <text
                        x={px}
                        y={py - 2}
                        textAnchor="middle"
                        fill="#F8FAFC"
                        fontSize={13}
                        fontWeight={900}
                        fontFamily={MONO_FONT}
                      >
                        {pkt.direction === 'A->B' ? '▶ ' : '◀ '}#{String(pkt.seq).padStart(2, '0')} {pkt.label}
                      </text>
                      <text
                        x={px}
                        y={py + 12}
                        textAnchor="middle"
                        fill={pktColor}
                        fontSize={10}
                        fontWeight={700}
                        fontFamily={MONO_FONT}
                      >
                        {isAlertDrop && rawProgress > 0.48
                          ? 'COLLISION → RETRY'
                          : `${pkt.sizeBytes || 1500}B • ${ch.label}`}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* DEVICE B CARD */}
            <div
              style={{
                borderRadius: 20,
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                border: `2px solid ${rxBlink ? '#34D399' : `${accent}66`}`,
                boxShadow: rxBlink ? '0 0 36px rgba(52, 211, 153, 0.35)' : 'none',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      backgroundColor: 'rgba(52, 211, 153, 0.16)',
                      color: '#34D399',
                      fontSize: 13,
                      fontWeight: 800,
                      fontFamily: MONO_FONT,
                    }}
                  >
                    NODE B • RX
                  </span>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: rxBlink ? '#34D399' : '#334155',
                      boxShadow: rxBlink ? '0 0 12px #34D399' : 'none',
                    }}
                  />
                </div>
                <div style={{ fontSize: 23, fontWeight: 800, color: '#F8FAFC', lineHeight: 1.25 }}>
                  {deviceB.name}
                </div>
                <div style={{ fontSize: 15, color: '#94A3B8', marginTop: 6 }}>{deviceB.role}</div>
                {deviceB.ipOrMac && (
                  <div style={{ fontSize: 13, color: '#64748B', fontFamily: MONO_FONT, marginTop: 8 }}>
                    MAC {deviceB.ipOrMac}
                  </div>
                )}
              </div>

              {/* Client Laptop Icon */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '14px 0' }}>
                <svg width="120" height="90" viewBox="0 0 120 90">
                  <rect x="22" y="18" width="76" height="48" rx="6" fill="#1E293B" stroke="#34D399" strokeWidth="2.5" />
                  <rect x="12" y="66" width="96" height="10" rx="4" fill="#334155" stroke="#34D399" strokeWidth="1.5" />
                  <polyline
                    points="34,46 46,46 52,32 60,54 68,38 74,46 86,46"
                    fill="none"
                    stroke={rxBlink ? '#34D399' : accent}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <div
                style={{
                  borderTop: '1px solid rgba(148,163,184,0.2)',
                  paddingTop: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: '#64748B', fontFamily: MONO_FONT }}>DELIVERED</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#34D399', fontFamily: MONO_FONT }}>
                    {rxCount} PKT
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#64748B', fontFamily: MONO_FONT }}>PAYLOAD</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#F8FAFC', fontFamily: MONO_FONT }}>
                    {(totalBytesDelivered / 1000).toFixed(1)} KB
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Live Packet Trace + NS-3 Style Real-Time Traffic Graph */}
          <div
            style={{
              borderRadius: 16,
              backgroundColor: 'rgba(15, 23, 42, 0.92)',
              border: '1px solid rgba(148, 163, 184, 0.22)',
              padding: '12px 20px',
              display: 'grid',
              gridTemplateColumns: '1.15fr 1.15fr 0.65fr',
              gap: 18,
              alignItems: 'center',
            }}
          >
            {/* Left: Live Packet Event Trace */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#64748B', fontFamily: MONO_FONT, marginBottom: 8 }}>
                LIVE PACKET TRACE (A ↔ B)
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {recentLog.length === 0 ? (
                  <span style={{ fontSize: 13, color: '#94A3B8', fontFamily: MONO_FONT }}>
                    Initializing multi-channel medium access...
                  </span>
                ) : (
                  recentLog.slice(0, 3).map(({ pkt, chIndex, isInFlight, isAlertDrop }) => {
                    const ch = channels[chIndex];
                    const badgeColor = isAlertDrop ? '#F59E0B' : isInFlight ? '#38BDF8' : '#34D399';
                    return (
                      <div
                        key={pkt.seq}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          backgroundColor: `${badgeColor}18`,
                          border: `1px solid ${badgeColor}66`,
                          fontSize: 12,
                          fontFamily: MONO_FONT,
                          color: '#E2E8F0',
                        }}
                      >
                        <strong style={{ color: ch.color }}>#{String(pkt.seq).padStart(2, '0')}</strong> {pkt.direction}{' '}
                        {pkt.label} [{ch.label}] •{' '}
                        <span style={{ color: badgeColor, fontWeight: 800 }}>
                          {isInFlight ? 'TX' : isAlertDrop ? 'RETRY' : 'ACK'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Middle: NS-3 / Wireshark IO Style Live Traffic Graph */}
            <div
              style={{
                borderRadius: 12,
                backgroundColor: 'rgba(7, 11, 20, 0.85)',
                border: `1px solid ${accent}33`,
                padding: '8px 12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: accent, fontFamily: MONO_FONT }}>
                  SIMULATOR TRAFFIC GRAPH (MBPS / PKT BURST)
                </span>
                <span style={{ fontSize: 11, color: '#94A3B8', fontFamily: MONO_FONT }}>
                  {activeInFlight.length} IN-FLIGHT
                </span>
              </div>
              <svg viewBox="0 0 420 68" style={{ width: '100%', height: 64, display: 'block' }}>
                {/* Grid lines */}
                {[16, 36, 56].map((gy) => (
                  <line key={gy} x1={0} y1={gy} x2={420} y2={gy} stroke="rgba(148,163,184,0.12)" strokeDasharray="3 4" />
                ))}
                {/* Per-channel live traffic curves sampled across time window */}
                {channels.map((ch, cIdx) => {
                  const pts: string[] = [];
                  const samples = 42;
                  for (let s = 0; s <= samples; s++) {
                    const sampleFrame = (s / samples) * sceneTotalFrames;
                    const x = (s / samples) * 420;
                    if (sampleFrame > frame) break;
                    // Sum Gaussian bursts for packets on this channel near sampleFrame
                    let load = 0.08;
                    for (const ap of activePackets) {
                      if (ap.chIndex !== cIdx) continue;
                      const mid = ap.startFrame + flightFrames * 0.5;
                      const dist = (sampleFrame - mid) / (flightFrames * 0.45);
                      if (Math.abs(dist) < 2.2) {
                        load += Math.exp(-dist * dist) * (ap.isAlertDrop ? 0.35 : 0.72);
                      }
                    }
                    const y = Math.max(8, 60 - Math.min(1, load) * 48);
                    pts.push(`${s === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
                  }
                  return pts.length > 1 ? (
                    <path
                      key={ch.id}
                      d={pts.join(' ')}
                      fill="none"
                      stroke={ch.color}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null;
                })}
                {/* Current time cursor */}
                <line
                  x1={(frame / Math.max(1, sceneTotalFrames)) * 420}
                  y1={4}
                  x2={(frame / Math.max(1, sceneTotalFrames)) * 420}
                  y2={64}
                  stroke="#F8FAFC"
                  strokeWidth={1.5}
                />
              </svg>
            </div>

            {/* Right: Aggregate Telemetry */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 18 }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748B', fontFamily: MONO_FONT }}>THROUGHPUT</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: accent, fontFamily: MONO_FONT }}>
                  <AnimatedMetricText text={`${(2.4 + cueProgress * 1.8).toFixed(1)} Gbps`} highlightColor={accent} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#64748B', fontFamily: MONO_FONT }}>AVG RTT</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#34D399', fontFamily: MONO_FONT }}>
                  {(1.4 + (retryCount > 0 ? 0.6 : 0)).toFixed(1)} ms
                </div>
              </div>
            </div>
          </div>
        </CameraRig>
      </AbsoluteFill>
    </SceneTransitionWrapper>
  );
};

/* ============================================================================
 * 2. OFDM SPECTRUM & RESOURCE UNIT (RU) ALLOCATION
 * ========================================================================== */
const OfdmSpectrumScene: React.FC<WirelessTemplateProps> = ({
  scene,
  scenePadding,
  renderHeader,
  accent,
  effect,
  targetIndex,
  cameraBreath,
  sceneTotalFrames,
  getItemRevealFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bwMhz = scene.diagramData?.ofdmBandwidthMhz || 320;
  const ruBlocks: OfdmRuBlock[] =
    scene.diagramData?.ofdmRuBlocks && scene.diagramData.ofdmRuBlocks.length > 0
      ? scene.diagramData.ofdmRuBlocks
      : [
          { label: 'RU 484 • STA-1 (Video)', tones: '484 tones', widthRatio: 0.28, color: '#38BDF8' },
          { label: 'PUNCTURED (DFS/Interferer)', tones: '20 MHz Notch', widthRatio: 0.16, color: '#EF4444', punctured: true },
          { label: 'RU 996 • STA-2 (VR/Gaming)', tones: '996 tones', widthRatio: 0.34, color: '#34D399' },
          { label: 'RU 242 • IoT/Voice', tones: '242 tones', widthRatio: 0.22, color: '#A78BFA' },
        ];

  const totalTones = 72;
  const svgW = 1480;
  const svgH = 440;
  const barAreaW = svgW - 140;
  const baseLineY = 340;
  const scanX = 70 + ((frame * 11) % barAreaW);

  // Map each subcarrier index to an RU block
  const cumulative: { start: number; end: number; ru: OfdmRuBlock; idx: number }[] = [];
  let cursor = 0;
  const totalRatio = ruBlocks.reduce((acc, r) => acc + r.widthRatio, 0) || 1;
  ruBlocks.forEach((ru, idx) => {
    const start = cursor;
    const end = cursor + ru.widthRatio / totalRatio;
    cumulative.push({ start, end, ru, idx });
    cursor = end;
  });

  return (
    <SceneTransitionWrapper sceneIndex={scene.index} sceneTotalFrames={sceneTotalFrames} accentColor={accent}>
      <AbsoluteFill
        style={{
          padding: scenePadding,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: FONT_FAMILY,
          zIndex: 10,
        }}
      >
        {renderHeader()}

        <CameraRig
          zoom={effect === 'zoom-focus' ? 1.02 : cameraBreath}
          shakeIntensity={effect === 'glitch-alert' ? 2.5 : 0}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}
        >
          {/* Main Spectrum Analyzer Canvas */}
          <div
            style={{
              flex: 1,
              borderRadius: 20,
              backgroundColor: 'rgba(9, 14, 28, 0.94)',
              border: `1.5px solid ${accent}55`,
              padding: '18px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: accent, fontFamily: MONO_FONT }}>
                OFDMA FREQUENCY-DOMAIN SPECTRUM • {bwMhz} MHz CHANNEL
              </span>
              <span style={{ fontSize: 14, color: '#94A3B8', fontFamily: MONO_FONT }}>
                Δf = 78.125 kHz • GI = 0.8 µs • PREAMBLE PUNCTURING ENABLED
              </span>
            </div>

            <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: '100%' }}>
              {/* Horizontal dBm grid */}
              {[-20, -40, -60, -80, -100].map((dbm, i) => {
                const y = 60 + i * 70;
                return (
                  <g key={dbm}>
                    <line x1={70} y1={y} x2={svgW - 70} y2={y} stroke="rgba(148,163,184,0.14)" strokeDasharray="4 6" />
                    <text x={58} y={y + 5} textAnchor="end" fill="#64748B" fontSize={13} fontFamily={MONO_FONT}>
                      {dbm} dBm
                    </text>
                  </g>
                );
              })}

              {/* RU Region Brackets */}
              {cumulative.map(({ start, end, ru, idx }) => {
                const x1 = 70 + start * barAreaW;
                const x2 = 70 + end * barAreaW;
                const isFocused = idx === targetIndex % cumulative.length;
                const reveal = spring({
                  frame: Math.max(0, frame - getItemRevealFrame(idx, cumulative.length, idx * 4)),
                  fps,
                  config: { damping: 16, stiffness: 180 },
                });
                return (
                  <g key={ru.label} opacity={reveal}>
                    <rect
                      x={x1 + 4}
                      y={42}
                      width={Math.max(20, x2 - x1 - 8)}
                      height={baseLineY - 42}
                      rx={10}
                      fill={ru.punctured ? 'rgba(239, 68, 68, 0.10)' : `${ru.color}${isFocused ? '1A' : '0B'}`}
                      stroke={ru.punctured ? '#EF444488' : isFocused ? ru.color : `${ru.color}44`}
                      strokeWidth={isFocused ? 2 : 1}
                      strokeDasharray={ru.punctured ? '6 4' : undefined}
                    />
                    <text
                      x={(x1 + x2) / 2}
                      y={66}
                      textAnchor="middle"
                      fill={ru.punctured ? '#FCA5A5' : ru.color}
                      fontSize={15}
                      fontWeight={800}
                      fontFamily={MONO_FONT}
                    >
                      {ru.label}
                    </text>
                    <text
                      x={(x1 + x2) / 2}
                      y={374}
                      textAnchor="middle"
                      fill="#94A3B8"
                      fontSize={13}
                      fontFamily={MONO_FONT}
                    >
                      {ru.tones}
                    </text>
                  </g>
                );
              })}

              {/* Subcarrier Comb Bars */}
              {Array.from({ length: totalTones }).map((_, i) => {
                const ratio = (i + 0.5) / totalTones;
                const seg = cumulative.find((c) => ratio >= c.start && ratio <= c.end) || cumulative[0];
                const x = 70 + ratio * barAreaW;
                const isDcNull = Math.abs(ratio - 0.5) < 0.015;
                const isPilot = i % 9 === 4 && !seg.ru.punctured && !isDcNull;

                const reveal = spring({
                  frame: Math.max(
                    0,
                    frame - getItemRevealFrame(seg.idx, cumulative.length, Math.floor(i * 0.35))
                  ),
                  fps,
                  config: { damping: 16, stiffness: 180 },
                });

                const noiseSpike =
                  seg.ru.punctured
                    ? 18 + Math.abs(Math.sin(frame * 0.25 + i * 0.8)) * (effect === 'glitch-alert' ? 75 : 32)
                    : 0;
                const rawH = isDcNull
                  ? 8
                  : seg.ru.punctured
                  ? noiseSpike
                  : isPilot
                  ? 235
                  : 175 + Math.sin(frame * 0.14 + i * 0.55) * 28 + seededNoise(i) * 18;
                const h = Math.max(8, rawH * reveal);
                const color = isDcNull
                  ? '#475569'
                  : seg.ru.punctured
                  ? '#EF4444'
                  : isPilot
                  ? '#FACC15'
                  : seg.ru.color;

                return (
                  <g key={i}>
                    <rect
                      x={x - 5}
                      y={baseLineY - h}
                      width={10}
                      height={h}
                      rx={3}
                      fill={color}
                      opacity={seg.ru.punctured ? 0.65 : 0.92}
                    />
                    {isPilot && (
                      <circle cx={x} cy={baseLineY - h - 8} r={4} fill="#FACC15" />
                    )}
                  </g>
                );
              })}

              {/* Sweep Scan Marker */}
              {effect === 'sweep-scan' && (
                <line x1={scanX} y1={42} x2={scanX} y2={baseLineY} stroke="#38BDF8" strokeWidth={2.5} opacity={0.85} />
              )}

              {/* Frequency Axis */}
              <line x1={70} y1={baseLineY} x2={svgW - 70} y2={baseLineY} stroke="#64748B" strokeWidth={2} />
              <text x={70} y={405} fill="#94A3B8" fontSize={14} fontFamily={MONO_FONT}>
                -{bwMhz / 2} MHz (Guard Band)
              </text>
              <text x={svgW / 2} y={405} textAnchor="middle" fill="#F8FAFC" fontSize={14} fontWeight={700} fontFamily={MONO_FONT}>
                fc (DC Null)
              </text>
              <text x={svgW - 70} y={405} textAnchor="end" fill="#94A3B8" fontSize={14} fontFamily={MONO_FONT}>
                +{bwMhz / 2} MHz (Guard Band)
              </text>
            </svg>
          </div>

          {/* Bottom Key Points */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
            {(scene.keyPoints.length > 0
              ? scene.keyPoints.slice(0, 3)
              : ['OFDMA 多用戶同時分配不同 RU 副載波', 'Preamble Puncturing 精準避開雷達/窄頻干擾', 'Pilot Tones 持續追蹤相位與通道估測']
            ).map((pt, i) => (
              <div
                key={i}
                style={{
                  padding: '16px 20px',
                  borderRadius: 14,
                  backgroundColor: 'rgba(15, 23, 42, 0.88)',
                  border: `1px solid ${i === targetIndex % 3 ? accent : 'rgba(148,163,184,0.2)'}`,
                  color: '#F1F5F9',
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                <span style={{ color: accent, fontWeight: 900, marginRight: 10 }}>0{i + 1}</span>
                {pt}
              </div>
            ))}
          </div>
        </CameraRig>
      </AbsoluteFill>
    </SceneTransitionWrapper>
  );
};

/* ============================================================================
 * 3. PHASED ARRAY & BEAMFORMING
 * ========================================================================== */
const BeamformingArrayScene: React.FC<WirelessTemplateProps> = ({
  scene,
  scenePadding,
  renderHeader,
  accent,
  effect,
  targetIndex,
  cameraBreath,
  sceneTotalFrames,
  getItemRevealFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const numElements = Math.max(4, Math.min(8, scene.diagramData?.beamformingElements || 8));
  const baseAngle = scene.diagramData?.beamformingTargetAngleDeg ?? -18;
  const targetLabel = scene.diagramData?.beamformingTargetLabel || 'Target STA (Client)';

  // Smooth beam steering sweep across the scene
  const steerAngleDeg =
    baseAngle + Math.sin((frame / fps) * 0.85) * (effect === 'sweep-scan' ? 24 : 10);
  const steerRad = (steerAngleDeg * Math.PI) / 180;

  const svgW = 1480;
  const svgH = 510;
  const arrayX = 250;
  const centerY = svgH / 2;
  const elementGap = 44;
  const arrayStartY = centerY - ((numElements - 1) * elementGap) / 2;

  const targetDist = 860;
  const targetX = arrayX + Math.cos(steerRad) * targetDist;
  const targetY = centerY + Math.sin(steerRad) * targetDist;

  // Compute polar radiation pattern (Array Factor) for main lobe & side lobes
  const lobePoints: string[] = [];
  for (let deg = -80; deg <= 80; deg += 2) {
    const rad = (deg * Math.PI) / 180;
    const psi = Math.PI * (Math.sin(rad) - Math.sin(steerRad));
    const af =
      Math.abs(psi) < 0.001
        ? 1
        : Math.abs(Math.sin((numElements * psi) / 2) / (numElements * Math.sin(psi / 2)));
    const r = 120 + af * 690;
    const x = arrayX + Math.cos(rad) * r;
    const y = centerY + Math.sin(rad) * r;
    lobePoints.push(`${deg === -80 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  lobePoints.push(`L ${arrayX} ${centerY} Z`);

  const arrayGainDb = (10 * Math.log10(numElements)).toFixed(1);

  return (
    <SceneTransitionWrapper sceneIndex={scene.index} sceneTotalFrames={sceneTotalFrames} accentColor={accent}>
      <AbsoluteFill
        style={{
          padding: scenePadding,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: FONT_FAMILY,
          zIndex: 10,
        }}
      >
        {renderHeader()}

        <CameraRig
          zoom={effect === 'zoom-focus' ? 1.02 : cameraBreath}
          shakeIntensity={effect === 'glitch-alert' ? 2 : 0}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}
        >
          <div
            style={{
              flex: 1,
              borderRadius: 20,
              backgroundColor: 'rgba(9, 14, 28, 0.94)',
              border: `1.5px solid ${accent}55`,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: '100%' }}>
              {/* Polar range rings */}
              {[220, 440, 660, 880].map((r) => (
                <path
                  key={r}
                  d={`M ${arrayX} ${centerY - r} A ${r} ${r} 0 0 1 ${arrayX} ${centerY + r}`}
                  fill="none"
                  stroke="rgba(148,163,184,0.12)"
                  strokeDasharray="4 6"
                />
              ))}

              {/* Main Lobe & Side Lobes Radiation Pattern */}
              <path
                d={lobePoints.join(' ')}
                fill={`${accent}24`}
                stroke={accent}
                strokeWidth={2.5}
              />

              {/* Constructive Wavefront Arcs along steering direction */}
              {[0, 1, 2, 3, 4].map((w) => {
                const phase = ((frame * 0.028 + w * 0.2) % 1);
                const r = 90 + phase * 760;
                const spread = 0.24;
                const x1 = arrayX + Math.cos(steerRad - spread) * r;
                const y1 = centerY + Math.sin(steerRad - spread) * r;
                const x2 = arrayX + Math.cos(steerRad + spread) * r;
                const y2 = centerY + Math.sin(steerRad + spread) * r;
                return (
                  <path
                    key={w}
                    d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`}
                    fill="none"
                    stroke={accent}
                    strokeWidth={3}
                    opacity={(1 - phase) * 0.85}
                  />
                );
              })}

              {/* Antenna Array Backbone & Phase Shifters */}
              <rect x={64} y={arrayStartY - 26} width={196} height={(numElements - 1) * elementGap + 52} rx={14} fill="#0F172A" stroke={`${accent}66`} strokeWidth={2} />
              <text x={162} y={arrayStartY - 40} textAnchor="middle" fill={accent} fontSize={14} fontWeight={800} fontFamily={MONO_FONT}>
                {numElements}-ELEMENT ULA (λ/2)
              </text>

              {Array.from({ length: numElements }).map((_, idx) => {
                const ey = arrayStartY + idx * elementGap;
                const phaseDeg = Math.round(((idx * 180 * Math.sin(steerRad)) % 360 + 360) % 360);
                return (
                  <g
                    key={idx}
                    opacity={spring({
                      frame: Math.max(0, frame - getItemRevealFrame(idx, numElements, idx * 4)),
                      fps,
                      config: { damping: 16, stiffness: 180 },
                    })}
                  >
                    {/* Phase shifter box */}
                    <rect x={80} y={ey - 13} width={96} height={26} rx={6} fill="#1E293B" stroke={`${accent}44`} />
                    <text x={128} y={ey + 4} textAnchor="middle" fill="#E2E8F0" fontSize={12} fontWeight={700} fontFamily={MONO_FONT}>
                      φ{idx + 1}: {phaseDeg}°
                    </text>
                    {/* Feedline & Dipole element */}
                    <line x1={176} y1={ey} x2={arrayX} y2={ey} stroke={accent} strokeWidth={2.5} />
                    <circle cx={arrayX} cy={ey} r={7} fill={accent} />
                  </g>
                );
              })}

              {/* Steering axis line */}
              <line
                x1={arrayX}
                y1={centerY}
                x2={targetX}
                y2={targetY}
                stroke="#34D399"
                strokeWidth={2}
                strokeDasharray="8 6"
              />

              {/* Target STA Node */}
              <g transform={`translate(${targetX}, ${targetY})`}>
                <circle r={34} fill="rgba(52, 211, 153, 0.18)" stroke="#34D399" strokeWidth={2.5} />
                <circle r={12} fill="#34D399" />
                <text x={0} y={-44} textAnchor="middle" fill="#34D399" fontSize={16} fontWeight={800} fontFamily={MONO_FONT}>
                  {targetLabel}
                </text>
                <text x={0} y={54} textAnchor="middle" fill="#E2E8F0" fontSize={13} fontFamily={MONO_FONT}>
                  θ = {steerAngleDeg.toFixed(1)}° • LOCKED
                </text>
              </g>

              {/* Interferer / Null Steering Node */}
              <g transform={`translate(${arrayX + 680}, ${centerY + (steerAngleDeg > 0 ? -155 : 155)})`}>
                <circle r={22} fill="rgba(239, 68, 68, 0.14)" stroke="#EF4444" strokeWidth={2} strokeDasharray="4 3" />
                <text x={0} y={-30} textAnchor="middle" fill="#FCA5A5" fontSize={13} fontWeight={800} fontFamily={MONO_FONT}>
                  INTERFERER (NULL -24 dB)
                </text>
              </g>

              {/* Telemetry Overlay Card */}
              <g transform={`translate(${svgW - 340}, 28)`}>
                <rect width={310} height={138} rx={14} fill="rgba(15, 23, 42, 0.92)" stroke={`${accent}55`} strokeWidth={1.5} />
                <text x={20} y={32} fill="#94A3B8" fontSize={13} fontWeight={800} fontFamily={MONO_FONT}>
                  BEAMFORMING TELEMETRY
                </text>
                <text x={20} y={66} fill="#F8FAFC" fontSize={18} fontWeight={800} fontFamily={MONO_FONT}>
                  Steering Angle: {steerAngleDeg.toFixed(1)}°
                </text>
                <text x={20} y={96} fill="#34D399" fontSize={18} fontWeight={800} fontFamily={MONO_FONT}>
                  Array Gain: +{arrayGainDb} dBi
                </text>
                <text x={20} y={124} fill={accent} fontSize={14} fontWeight={700} fontFamily={MONO_FONT}>
                  CSI Feedback: Explicit NDP Sounding
                </text>
              </g>
            </svg>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
            {(scene.keyPoints.length > 0
              ? scene.keyPoints.slice(0, 3)
              : ['各天線單元施加線性相位差 Δφ 控制主波束方向', '建設性干涉集中能量，提升目標端 SNR 與覆蓋距離', '零點導向 (Null Steering) 抑制同頻干擾源']
            ).map((pt, i) => (
              <div
                key={i}
                style={{
                  padding: '15px 20px',
                  borderRadius: 14,
                  backgroundColor: 'rgba(15, 23, 42, 0.88)',
                  border: `1px solid ${i === targetIndex % 3 ? accent : 'rgba(148,163,184,0.2)'}`,
                  color: '#F1F5F9',
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                <span style={{ color: accent, fontWeight: 900, marginRight: 10 }}>0{i + 1}</span>
                {pt}
              </div>
            ))}
          </div>
        </CameraRig>
      </AbsoluteFill>
    </SceneTransitionWrapper>
  );
};

/* ============================================================================
 * 4. QAM CONSTELLATION & EVM / SNR INTERFERENCE
 * ========================================================================== */
const QamConstellationScene: React.FC<WirelessTemplateProps> = ({
  scene,
  scenePadding,
  renderHeader,
  accent,
  effect,
  targetIndex,
  cameraBreath,
  sceneTotalFrames,
  getItemRevealFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const qamOrder = scene.diagramData?.qamOrder || 64;
  const gridDim = qamOrder === 16 ? 4 : qamOrder === 64 ? 8 : 8; // Render 8x8 clean visual grid even for 256/1024-QAM
  const isNoisy = effect === 'glitch-alert';
  const baseSnr = scene.diagramData?.qamSnrDb ?? 34;
  const liveSnr = isNoisy ? Math.max(14, baseSnr - 13 + Math.sin(frame * 0.25) * 1.5) : baseSnr + Math.sin(frame * 0.1) * 0.6;
  const liveEvm = isNoisy ? -18.4 + Math.sin(frame * 0.3) * 1.4 : (scene.diagramData?.qamEvmDb ?? -35.2);
  const scatterRadius = isNoisy ? 22 : 6.5;

  const size = 500;
  const pad = 52;
  const inner = size - pad * 2;
  const step = inner / (gridDim - 1);

  return (
    <SceneTransitionWrapper sceneIndex={scene.index} sceneTotalFrames={sceneTotalFrames} accentColor={accent}>
      <AbsoluteFill
        style={{
          padding: scenePadding,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: FONT_FAMILY,
          zIndex: 10,
        }}
      >
        {renderHeader()}

        <CameraRig
          zoom={effect === 'zoom-focus' ? 1.02 : cameraBreath}
          shakeIntensity={isNoisy ? 2.5 : 0}
          style={{ flex: 1, display: 'grid', gridTemplateColumns: '560px 1fr', gap: 28, alignItems: 'stretch' }}
        >
          {/* Left: I/Q Constellation Plot */}
          <div
            style={{
              borderRadius: 20,
              backgroundColor: 'rgba(9, 14, 28, 0.95)',
              border: `2px solid ${isNoisy ? '#F59E0B' : `${accent}66`}`,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: accent, fontFamily: MONO_FONT }}>
                {qamOrder}-QAM I/Q CONSTELLATION
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: isNoisy ? '#F59E0B' : '#34D399',
                  fontFamily: MONO_FONT,
                }}
              >
                {isNoisy ? 'HIGH EVM / NOISE' : 'SYMBOL LOCK OK'}
              </span>
            </div>

            <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxHeight: 460 }}>
              {/* Axes */}
              <line x1={pad - 18} y1={size / 2} x2={size - pad + 18} y2={size / 2} stroke="#475569" strokeWidth={1.5} />
              <line x1={size / 2} y1={pad - 18} x2={size / 2} y2={size - pad + 18} stroke="#475569" strokeWidth={1.5} />
              <text x={size - 16} y={size / 2 - 8} textAnchor="end" fill="#94A3B8" fontSize={14} fontWeight={800} fontFamily={MONO_FONT}>
                I (In-Phase)
              </text>
              <text x={size / 2 + 10} y={24} fill="#94A3B8" fontSize={14} fontWeight={800} fontFamily={MONO_FONT}>
                Q (Quadrature)
              </text>

              {/* Constellation Ideal Points + Animated Sample Clouds */}
              {Array.from({ length: gridDim }).map((_, gx) =>
                Array.from({ length: gridDim }).map((__, gy) => {
                  const cx = pad + gx * step;
                  const cy = pad + gy * step;
                  const pointIdx = gx * gridDim + gy;
                  const reveal = spring({
                    frame: Math.max(0, frame - Math.floor(pointIdx * 0.25)),
                    fps,
                    config: { damping: 16, stiffness: 180 },
                  });

                  return (
                    <g key={`${gx}-${gy}`} opacity={reveal}>
                      {/* Ideal target crosshair */}
                      <circle cx={cx} cy={cy} r={2.2} fill="#94A3B8" opacity={0.5} />
                      {/* 4 sampled symbols per constellation point */}
                      {[0, 1, 2, 3].map((s) => {
                        const seed = pointIdx * 17 + s * 31 + Math.floor(frame / 3) * 7;
                        const dx = seededNoise(seed) * scatterRadius;
                        const dy = seededNoise(seed + 101) * scatterRadius;
                        const isOutlier = Math.hypot(dx, dy) > step * 0.42;
                        return (
                          <circle
                            key={s}
                            cx={cx + dx}
                            cy={cy + dy}
                            r={isNoisy ? 3.2 : 2.8}
                            fill={isOutlier ? '#EF4444' : isNoisy ? '#F59E0B' : accent}
                            opacity={0.85}
                          />
                        );
                      })}
                    </g>
                  );
                })
              )}
            </svg>
          </div>

          {/* Right: Live RF Signal Quality Metrics & Engineering Key Points */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, justifyContent: 'space-between' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
              {[
                {
                  label: 'MODULATION ORDER',
                  val: `${qamOrder}-QAM`,
                  sub: `${Math.round(Math.log2(qamOrder))} bits / symbol`,
                  color: accent,
                },
                {
                  label: 'MEASURED EVM',
                  val: `${liveEvm.toFixed(1)} dB`,
                  sub: isNoisy ? 'EXCEEDS -32 dB LIMIT' : 'PASS (Target < -32 dB)',
                  color: isNoisy ? '#EF4444' : '#34D399',
                },
                {
                  label: 'EFFECTIVE SNR',
                  val: `${liveSnr.toFixed(1)} dB`,
                  sub: isNoisy ? 'Desense / Phase Noise Impact' : 'Clean RF Margin',
                  color: isNoisy ? '#F59E0B' : '#38BDF8',
                },
                {
                  label: 'PACKET ERROR RATE',
                  val: isNoisy ? '8.4%' : '0.02%',
                  sub: isNoisy ? 'MCS Fallback Triggered' : 'MCS 13 Stable',
                  color: isNoisy ? '#EF4444' : '#34D399',
                },
              ].map((card, i) => (
                <div
                  key={card.label}
                  style={{
                    borderRadius: 16,
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    border: `1.5px solid ${i === targetIndex % 4 ? card.color : 'rgba(148,163,184,0.22)'}`,
                    padding: '20px 22px',
                    opacity: spring({
                      frame: Math.max(0, frame - getItemRevealFrame(i, 4, i * 4)),
                      fps,
                      config: { damping: 16, stiffness: 180 },
                    }),
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#94A3B8', fontFamily: MONO_FONT }}>
                    {card.label}
                  </div>
                  <div style={{ fontSize: 38, fontWeight: 900, color: card.color, fontFamily: MONO_FONT, marginTop: 6 }}>
                    {card.val}
                  </div>
                  <div style={{ fontSize: 14, color: '#CBD5E1', marginTop: 6 }}>{card.sub}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                flex: 1,
                borderRadius: 16,
                backgroundColor: 'rgba(15, 23, 42, 0.88)',
                border: '1px solid rgba(148,163,184,0.2)',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 12,
              }}
            >
              {(scene.keyPoints.length > 0
                ? scene.keyPoints.slice(0, 3)
                : ['高階 QAM 縮短星座點間距，對相位雜訊與 EVM 極度敏感', 'PA 非線性失真或鄰頻干擾會造成點群發散與誤碼率飆升', '需確保鏈路 SNR 足夠以維持高 MCS 速率不降階']
              ).map((pt, i) => (
                <div key={i} style={{ fontSize: 19, color: '#F1F5F9', fontWeight: 600, display: 'flex', gap: 12 }}>
                  <span style={{ color: accent, fontWeight: 900 }}>▸</span>
                  <span>{pt}</span>
                </div>
              ))}
            </div>
          </div>
        </CameraRig>
      </AbsoluteFill>
    </SceneTransitionWrapper>
  );
};

/* ============================================================================
 * 5. WI-FI 7 MLO (MULTI-LINK OPERATION) CONCURRENT SCHEDULING TIMELINE
 * ========================================================================== */
const MloMultilinkScene: React.FC<WirelessTemplateProps> = ({
  scene,
  scenePadding,
  renderHeader,
  accent,
  effect,
  targetIndex,
  cameraBreath,
  sceneTotalFrames,
  getItemRevealFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const links: MloLinkLane[] =
    scene.diagramData?.mloLinks && scene.diagramData.mloLinks.length > 0
      ? scene.diagramData.mloLinks.slice(0, 3)
      : [
          { band: '6 GHz Link', channel: 'CH 69', bandwidth: '320 MHz', color: '#34D399', throughputMbps: 4200, mode: 'STR' },
          { band: '5 GHz Link', channel: 'CH 36', bandwidth: '160 MHz', color: '#38BDF8', throughputMbps: 2100, mode: 'STR' },
          { band: '2.4 GHz Link', channel: 'CH 1', bandwidth: '40 MHz', color: '#F59E0B', throughputMbps: 450, mode: 'EMLSR' },
        ];

  const totalMbps = links.reduce((sum, l) => sum + l.throughputMbps, 0);
  const playheadRatio = ((frame % Math.max(60, sceneTotalFrames)) / Math.max(60, sceneTotalFrames));

  const frameBlocks = [
    { start: 0.04, width: 0.22, label: 'A-MPDU #1', type: 'tx' },
    { start: 0.28, width: 0.07, label: 'BA', type: 'ack' },
    { start: 0.39, width: 0.26, label: 'A-MPDU #2', type: 'tx' },
    { start: 0.67, width: 0.07, label: 'BA', type: 'ack' },
    { start: 0.78, width: 0.18, label: 'A-MPDU #3', type: 'tx' },
  ];

  return (
    <SceneTransitionWrapper sceneIndex={scene.index} sceneTotalFrames={sceneTotalFrames} accentColor={accent}>
      <AbsoluteFill
        style={{
          padding: scenePadding,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: FONT_FAMILY,
          zIndex: 10,
        }}
      >
        {renderHeader()}

        <CameraRig
          zoom={effect === 'zoom-focus' ? 1.02 : cameraBreath}
          shakeIntensity={effect === 'glitch-alert' ? 2 : 0}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}
        >
          {/* Top Aggregate Telemetry Banner */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 16,
            }}
          >
            <div style={{ padding: '16px 22px', borderRadius: 14, backgroundColor: 'rgba(15, 23, 42, 0.9)', border: `1px solid ${accent}55` }}>
              <div style={{ fontSize: 12, color: '#94A3B8', fontFamily: MONO_FONT }}>MLO AGGREGATE THROUGHPUT</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: accent, fontFamily: MONO_FONT }}>
                <AnimatedMetricText text={`${(totalMbps / 1000).toFixed(2)} Gbps`} highlightColor={accent} />
              </div>
            </div>
            <div style={{ padding: '16px 22px', borderRadius: 14, backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(52,211,153,0.4)' }}>
              <div style={{ fontSize: 12, color: '#94A3B8', fontFamily: MONO_FONT }}>WORST-CASE P99 LATENCY</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#34D399', fontFamily: MONO_FONT }}>
                1.8 ms <span style={{ fontSize: 16, color: '#94A3B8' }}>(-74% vs SLO)</span>
              </div>
            </div>
            <div style={{ padding: '16px 22px', borderRadius: 14, backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(56,189,248,0.4)' }}>
              <div style={{ fontSize: 12, color: '#94A3B8', fontFamily: MONO_FONT }}>ACTIVE MLO MODE</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#38BDF8', fontFamily: MONO_FONT }}>
                STR + EMLSR DYNAMIC
              </div>
            </div>
          </div>

          {/* Multi-Link Swimlanes */}
          <div
            style={{
              flex: 1,
              borderRadius: 20,
              backgroundColor: 'rgba(9, 14, 28, 0.94)',
              border: `1.5px solid ${accent}44`,
              padding: '22px 26px',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-around',
              gap: 16,
            }}
          >
            {/* Moving time playhead */}
            <div
              style={{
                position: 'absolute',
                top: 18,
                bottom: 18,
                left: `calc(280px + (100% - 310px) * ${playheadRatio})`,
                width: 3,
                backgroundColor: '#F8FAFC',
                boxShadow: `0 0 14px ${accent}`,
                zIndex: 5,
              }}
            />

            {links.map((link, lIdx) => {
              const isFocused = lIdx === targetIndex % links.length;
              const laneShift = lIdx * 0.05;
              const isBusyConflict = effect === 'glitch-alert' && lIdx === links.length - 1;

              return (
                <div
                  key={link.band}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '250px 1fr',
                    gap: 18,
                    alignItems: 'center',
                    opacity: spring({
                      frame: Math.max(0, frame - getItemRevealFrame(lIdx, links.length, lIdx * 5)),
                      fps,
                      config: { damping: 16, stiffness: 180 },
                    }),
                  }}
                >
                  {/* Link Info Column */}
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: 14,
                      backgroundColor: isFocused ? `${link.color}20` : 'rgba(15, 23, 42, 0.9)',
                      border: `1.5px solid ${isFocused ? link.color : `${link.color}55`}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 18, fontWeight: 900, color: link.color }}>{link.band}</span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          backgroundColor: `${link.color}22`,
                          color: link.color,
                          fontSize: 11,
                          fontWeight: 800,
                          fontFamily: MONO_FONT,
                        }}
                      >
                        {link.mode || 'STR'}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#CBD5E1', fontFamily: MONO_FONT, marginTop: 6 }}>
                      {link.channel} • {link.bandwidth} • {link.throughputMbps} Mbps
                    </div>
                  </div>

                  {/* Time-Axis Frame Schedule */}
                  <div
                    style={{
                      height: 82,
                      borderRadius: 14,
                      backgroundColor: 'rgba(15, 23, 42, 0.72)',
                      border: '1px solid rgba(148, 163, 184, 0.16)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {frameBlocks.map((blk, bIdx) => {
                      const leftPct = Math.min(0.84, blk.start + (bIdx % 2 === 0 ? laneShift : 0)) * 100;
                      const widthPct = blk.width * 100;
                      const activeNow = playheadRatio >= leftPct / 100 && playheadRatio <= (leftPct + widthPct) / 100;
                      const reveal = spring({
                        frame: Math.max(
                          0,
                          frame - getItemRevealFrame(lIdx, links.length, lIdx * 5 + bIdx * 4)
                        ),
                        fps,
                        config: { damping: 16, stiffness: 160 },
                      });
                      const isBlocked = isBusyConflict && bIdx === 2;
                      const fill = isBlocked
                        ? '#EF4444'
                        : blk.type === 'ack'
                        ? '#34D399'
                        : link.color;

                      return (
                        <div
                          key={bIdx}
                          style={{
                            position: 'absolute',
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            top: 14,
                            bottom: 14,
                            borderRadius: 10,
                            backgroundColor: activeNow ? `${fill}44` : `${fill}22`,
                            border: `2px solid ${activeNow ? '#FFFFFF' : fill}`,
                            transform: `scaleX(${reveal})`,
                            transformOrigin: 'left center',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#F8FAFC',
                            fontSize: 14,
                            fontWeight: 800,
                            fontFamily: MONO_FONT,
                          }}
                        >
                          {isBlocked ? 'CCA BUSY' : blk.label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CameraRig>
      </AbsoluteFill>
    </SceneTransitionWrapper>
  );
};

/* ============================================================================
 * 6. RF LINK BUDGET & SNR WATERFALL GAUGE
 * ========================================================================== */
const RfLinkBudgetScene: React.FC<WirelessTemplateProps> = ({
  scene,
  scenePadding,
  renderHeader,
  accent,
  effect,
  targetIndex,
  cameraBreath,
  sceneTotalFrames,
  getItemRevealFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stages: RfLinkBudgetStage[] =
    scene.diagramData?.rfLinkStages && scene.diagramData.rfLinkStages.length > 0
      ? scene.diagramData.rfLinkStages
      : [
          { label: 'TX Power', deltaDb: 20, note: 'AP PA Output', type: 'tx' },
          { label: 'TX Ant Gain', deltaDb: 4, note: '2x2 MIMO', type: 'gain' },
          { label: 'FSPL (15m)', deltaDb: -72, note: '6 GHz Free Space', type: 'loss' },
          { label: 'Wall / Body', deltaDb: -14, note: 'Partition Loss', type: 'loss' },
          { label: 'RX Ant Gain', deltaDb: 2, note: 'Laptop Antenna', type: 'gain' },
          { label: 'RX Power', deltaDb: -60, note: 'Received RSSI', type: 'rx' },
        ];

  const sensitivityDbm = scene.diagramData?.rfSensitivityDbm ?? -78;
  const extraDesense = effect === 'glitch-alert' ? -11 : 0;

  // Compute running dBm waterfall
  let running = 0;
  const computed = stages.map((st, idx) => {
    if (st.type === 'tx') {
      running = st.deltaDb;
      return { ...st, startDbm: 0, endDbm: running, idx };
    }
    if (st.type === 'rx') {
      const rxVal = running + extraDesense;
      return { ...st, deltaDb: rxVal, startDbm: rxVal, endDbm: rxVal, idx };
    }
    const startDbm = running;
    running += st.deltaDb;
    return { ...st, startDbm, endDbm: running, idx };
  });

  const finalRxDbm = computed[computed.length - 1]?.endDbm ?? -60;
  const linkMarginDb = finalRxDbm - sensitivityDbm;
  const marginHealthy = linkMarginDb >= 10;

  // Map dBm [-100, +30] to SVG Y [390, 50]
  const dbmToY = (dbm: number) => interpolate(dbm, [-100, 30], [390, 50], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const svgW = 1040;
  const svgH = 450;
  const colW = (svgW - 120) / computed.length;

  return (
    <SceneTransitionWrapper sceneIndex={scene.index} sceneTotalFrames={sceneTotalFrames} accentColor={accent}>
      <AbsoluteFill
        style={{
          padding: scenePadding,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: FONT_FAMILY,
          zIndex: 10,
        }}
      >
        {renderHeader()}

        <CameraRig
          zoom={effect === 'zoom-focus' ? 1.02 : cameraBreath}
          shakeIntensity={effect === 'glitch-alert' ? 2 : 0}
          style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 390px', gap: 24, alignItems: 'stretch' }}
        >
          {/* Left: Waterfall Bar Chart */}
          <div
            style={{
              borderRadius: 20,
              backgroundColor: 'rgba(9, 14, 28, 0.94)',
              border: `1.5px solid ${accent}55`,
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: accent, fontFamily: MONO_FONT }}>
              RF LINK BUDGET WATERFALL (dBm / dB)
            </div>

            <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: '100%' }}>
              {/* Horizontal dBm lines */}
              {[20, 0, -20, -40, -60, -80, -100].map((dbm) => {
                const y = dbmToY(dbm);
                return (
                  <g key={dbm}>
                    <line x1={76} y1={y} x2={svgW - 24} y2={y} stroke="rgba(148,163,184,0.14)" strokeDasharray="4 6" />
                    <text x={66} y={y + 4} textAnchor="end" fill="#64748B" fontSize={12} fontFamily={MONO_FONT}>
                      {dbm}
                    </text>
                  </g>
                );
              })}

              {/* RX Sensitivity threshold line */}
              <line
                x1={76}
                y1={dbmToY(sensitivityDbm)}
                x2={svgW - 24}
                y2={dbmToY(sensitivityDbm)}
                stroke="#F59E0B"
                strokeWidth={2}
                strokeDasharray="8 5"
              />
              <text
                x={svgW - 28}
                y={dbmToY(sensitivityDbm) - 8}
                textAnchor="end"
                fill="#FCD34D"
                fontSize={13}
                fontWeight={800}
                fontFamily={MONO_FONT}
              >
                RX SENSITIVITY ({sensitivityDbm} dBm)
              </text>

              {/* Waterfall Columns */}
              {computed.map((item, i) => {
                const reveal = spring({
                  frame: Math.max(0, frame - getItemRevealFrame(i, computed.length, i * 6)),
                  fps,
                  config: { damping: 16, stiffness: 140 },
                });

                const x = 90 + i * colW;
                const barW = Math.min(104, colW - 28);
                const yStart = item.type === 'tx' || item.type === 'rx' ? dbmToY(-100) : dbmToY(item.startDbm);
                const yEnd = dbmToY(item.endDbm);
                const topY = Math.min(yStart, yEnd);
                const rawH = Math.max(10, Math.abs(yEnd - yStart));
                const h = rawH * reveal;

                const color =
                  item.type === 'loss'
                    ? '#EF4444'
                    : item.type === 'gain'
                    ? '#34D399'
                    : item.type === 'rx'
                    ? marginHealthy
                      ? '#38BDF8'
                      : '#F59E0B'
                    : accent;
                const isFocused = i === targetIndex % computed.length;

                return (
                  <g key={item.label}>
                    <rect
                      x={x}
                      y={item.type === 'loss' ? topY : topY + (rawH - h)}
                      width={barW}
                      height={h}
                      rx={8}
                      fill={`${color}${isFocused ? 'DD' : 'AA'}`}
                      stroke={isFocused ? '#FFFFFF' : color}
                      strokeWidth={isFocused ? 2.5 : 1.5}
                    />
                    <text
                      x={x + barW / 2}
                      y={topY - 10}
                      textAnchor="middle"
                      fill="#F8FAFC"
                      fontSize={15}
                      fontWeight={900}
                      fontFamily={MONO_FONT}
                    >
                      {item.type === 'tx' || item.type === 'rx'
                        ? `${item.endDbm} dBm`
                        : `${item.deltaDb > 0 ? '+' : ''}${item.deltaDb} dB`}
                    </text>
                    <text
                      x={x + barW / 2}
                      y={420}
                      textAnchor="middle"
                      fill="#E2E8F0"
                      fontSize={13}
                      fontWeight={700}
                    >
                      {item.label}
                    </text>
                    {item.note && (
                      <text x={x + barW / 2} y={438} textAnchor="middle" fill="#64748B" fontSize={11}>
                        {item.note}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Right: Link Margin Gauge & Key Points */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div
              style={{
                borderRadius: 20,
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                border: `2px solid ${marginHealthy ? '#34D399' : '#EF4444'}`,
                padding: '24px 22px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: '#94A3B8', fontFamily: MONO_FONT }}>
                EFFECTIVE LINK MARGIN
              </div>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 900,
                  color: marginHealthy ? '#34D399' : '#EF4444',
                  fontFamily: MONO_FONT,
                  marginTop: 8,
                }}
              >
                {linkMarginDb >= 0 ? '+' : ''}
                {linkMarginDb.toFixed(0)} dB
              </div>
              <div
                style={{
                  display: 'inline-block',
                  marginTop: 10,
                  padding: '6px 14px',
                  borderRadius: 999,
                  backgroundColor: marginHealthy ? 'rgba(52,211,153,0.16)' : 'rgba(239,68,68,0.18)',
                  color: marginHealthy ? '#34D399' : '#FCA5A5',
                  fontSize: 14,
                  fontWeight: 800,
                  fontFamily: MONO_FONT,
                }}
              >
                {marginHealthy ? 'PASS • STABLE HIGH MCS' : 'WARNING • DESENSE / LOW MARGIN'}
              </div>
              <div
                style={{
                  marginTop: 18,
                  paddingTop: 14,
                  borderTop: '1px solid rgba(148,163,184,0.2)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 14,
                  fontFamily: MONO_FONT,
                  color: '#CBD5E1',
                }}
              >
                <span>RX: {finalRxDbm} dBm</span>
                <span>Sens: {sensitivityDbm} dBm</span>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                borderRadius: 20,
                backgroundColor: 'rgba(15, 23, 42, 0.88)',
                border: '1px solid rgba(148,163,184,0.2)',
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 14,
              }}
            >
              {(scene.keyPoints.length > 0
                ? scene.keyPoints.slice(0, 3)
                : ['6 GHz 自由空間路徑損耗高於 2.4/5 GHz，需靠天線增益補償', '機殼 EMI 去敏化 (Desense) 會直接抬升底噪並壓縮餘裕', '保留 ≥ 10 dB 鏈路餘裕以應對人體遮蔽與多路徑衰落']
              ).map((pt, i) => (
                <div key={i} style={{ fontSize: 17, color: '#F1F5F9', fontWeight: 600, display: 'flex', gap: 10 }}>
                  <span style={{ color: accent, fontWeight: 900 }}>▸</span>
                  <span>{pt}</span>
                </div>
              ))}
            </div>
          </div>
        </CameraRig>
      </AbsoluteFill>
    </SceneTransitionWrapper>
  );
};
