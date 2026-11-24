import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Animates numbers embedded inside text (e.g. "48.1%", "2.4x", "-35%", "T0 + 25ms", "517").
 * Re-triggers smoothly when `triggerFrame` is passed (e.g. start of a beat or scene).
 */
export const AnimatedMetricText: React.FC<{
  text: string;
  triggerFrame?: number;
  durationFrames?: number;
  highlightColor?: string;
}> = ({ text, triggerFrame = 0, durationFrames = 24, highlightColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = Math.max(0, frame - triggerFrame);
  const progress = spring({
    frame: localFrame,
    fps,
    config: { damping: 18, stiffness: 120, mass: 0.7 },
    durationInFrames: durationFrames,
  });

  // Match first numeric token (optional sign, digits with optional commas/decimals)
  const match = text.match(/([+-]?\d[\d,]*(?:\.\d+)?)/);
  if (!match || match.index === undefined) {
    return <span>{text}</span>;
  }

  const rawNumStr = match[1];
  const numericVal = parseFloat(rawNumStr.replace(/,/g, ''));
  if (!Number.isFinite(numericVal)) {
    return <span>{text}</span>;
  }

  const decimalMatch = rawNumStr.match(/\.(\d+)/);
  const decimals = decimalMatch ? decimalMatch[1].length : 0;
  const hasCommas = rawNumStr.includes(',');
  const hasPlus = rawNumStr.startsWith('+');

  const currentVal = interpolate(progress, [0, 1], [0, numericVal]);
  let formatted = currentVal.toFixed(decimals);
  if (hasCommas) {
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    formatted = parts.join('.');
  }
  if (hasPlus && currentVal > 0) {
    formatted = `+${formatted}`;
  }

  const before = text.slice(0, match.index);
  const after = text.slice(match.index + rawNumStr.length);

  return (
    <span>
      {before}
      <span
        style={{
          color: highlightColor,
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 800,
        }}
      >
        {formatted}
      </span>
      {after}
    </span>
  );
};

/**
 * Animated SVG circuit/bus connector with path draw-in and travelling signal packets.
 */
export const SvgFlowConnector: React.FC<{
  nodeCount: number;
  accentColor: string;
  isAlert: boolean;
  cueProgress: number;
  targetIndex: number;
}> = ({ nodeCount, accentColor, isAlert, cueProgress, targetIndex }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const drawSpring = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 90 },
  });

  const strokeColor = isAlert ? '#F59E0B' : accentColor;
  const totalWidth = 1360;
  const pathLen = totalWidth;
  const dashOffset = interpolate(drawSpring, [0, 1], [pathLen, 0]);

  // 3 travelling packets spaced evenly
  const packets = [0, 0.33, 0.66].map((offset) => ((frame * 0.016 + offset) % 1));
  const activeSegmentX =
    ((targetIndex % Math.max(1, nodeCount)) / Math.max(1, nodeCount - 1)) * (totalWidth - 80) + 40;

  return (
    <svg
      viewBox={`0 0 ${totalWidth} 60`}
      style={{
        position: 'absolute',
        left: 140,
        right: 140,
        top: '50%',
        width: 'calc(100% - 280px)',
        height: 60,
        transform: 'translateY(-50%)',
        zIndex: 1,
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <filter id="pulse-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Base subtle track */}
      <line
        x1={0}
        y1={30}
        x2={totalWidth}
        y2={30}
        stroke="rgba(148, 163, 184, 0.2)"
        strokeWidth={4}
        strokeDasharray="8 8"
      />

      {/* Animated draw-in bus line */}
      <line
        x1={0}
        y1={30}
        x2={totalWidth}
        y2={30}
        stroke={strokeColor}
        strokeOpacity={0.55}
        strokeWidth={4}
        strokeDasharray={pathLen}
        strokeDashoffset={dashOffset}
      />

      {/* Travelling glowing signal packets */}
      {packets.map((p, idx) => {
        const cx = p * totalWidth;
        return (
          <g key={idx} filter="url(#pulse-glow)">
            <rect
              x={cx - 18}
              y={24}
              width={36}
              height={12}
              rx={6}
              fill={strokeColor}
              opacity={0.95 - idx * 0.2}
            />
          </g>
        );
      })}

      {/* Beat-synced focus beacon on the bus */}
      <circle
        cx={activeSegmentX}
        cy={30}
        r={10 + Math.sin(cueProgress * Math.PI * 2) * 3}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2.5}
        opacity={0.75}
      />
    </svg>
  );
};

/**
 * Animated comparison bar for numeric values in comparison-matrix.
 */
export const AnimatedComparisonBar: React.FC<{
  labelA: string;
  labelB: string;
  accentColor: string;
  triggerFrame: number;
  highlight?: 'A' | 'B' | 'both';
}> = ({ labelA, labelB, accentColor, triggerFrame, highlight }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const barSpring = spring({
    frame: Math.max(0, frame - triggerFrame),
    fps,
    config: { damping: 16, stiffness: 140 },
  });

  const numA = parseFloat((labelA.match(/(\d+(?:\.\d+)?)/) || [])[1] || '45');
  const numB = parseFloat((labelB.match(/(\d+(?:\.\d+)?)/) || [])[1] || '85');
  const maxVal = Math.max(numA, numB, 1);

  const pctA = highlight === 'A' ? 88 : Math.max(24, Math.min(92, (numA / maxVal) * 85));
  const pctB = highlight === 'B' ? 92 : Math.max(24, Math.min(92, (numB / maxVal) * 85));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      <div style={{ height: 6, borderRadius: 999, backgroundColor: 'rgba(148,163,184,0.16)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${pctA * barSpring}%`,
            height: '100%',
            borderRadius: 999,
            backgroundColor: highlight === 'A' ? '#10B981' : '#64748B',
          }}
        />
      </div>
      <div style={{ height: 6, borderRadius: 999, backgroundColor: 'rgba(148,163,184,0.16)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${pctB * barSpring}%`,
            height: '100%',
            borderRadius: 999,
            backgroundColor: highlight === 'B' ? accentColor : '#94A3B8',
            boxShadow: highlight === 'B' ? `0 0 10px ${accentColor}88` : 'none',
          }}
        />
      </div>
    </div>
  );
};

/**
 * Per-scene entrance & exit cinematic transition wrapper (preserves exact <Series> audio sync).
 */
export const SceneTransitionWrapper: React.FC<{
  sceneIndex: number;
  sceneTotalFrames: number;
  accentColor: string;
  children: React.ReactNode;
}> = ({ sceneIndex, sceneTotalFrames, accentColor, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const blankLeadInFrames = sceneIndex % 2 === 1 ? 6 : 0;
  const entranceFrame = Math.max(0, frame - blankLeadInFrames);

  const enterSpring = spring({
    frame: entranceFrame,
    fps,
    config: { damping: 18, stiffness: 210, mass: 0.7 },
  });

  // Alternate entrance direction by sceneIndex
  const mode = sceneIndex % 3;
  const enterX = mode === 0 ? interpolate(enterSpring, [0, 1], [60, 0]) : 0;
  const enterY = mode === 1 ? interpolate(enterSpring, [0, 1], [45, 0]) : 0;
  const enterScale = mode === 2 ? interpolate(enterSpring, [0, 1], [0.94, 1]) : 1;

  // Subtle exit pull in final 8 frames
  const exitStart = Math.max(15, sceneTotalFrames - 8);
  const exitOpacity = interpolate(frame, [exitStart, sceneTotalFrames], [1, 0.15], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exitScale = interpolate(frame, [exitStart, sceneTotalFrames], [1, 0.985], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Laser wipe bar across screen during first 14 frames
  const wipeX = interpolate(entranceFrame, [0, 14], [-10, 110], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const wipeOpacity = interpolate(entranceFrame, [0, 4, 14], [0, 0.85, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `translate(${enterX}px, ${enterY}px) scale(${enterScale * exitScale})`,
        opacity: Math.min(
          interpolate(entranceFrame, [0, 6], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          exitOpacity
        ),
      }}
    >
      {children}
      {entranceFrame < 16 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${wipeX}%`,
            width: 6,
            background: `linear-gradient(180deg, transparent, ${accentColor}, transparent)`,
            boxShadow: `0 0 28px ${accentColor}`,
            opacity: wipeOpacity,
            zIndex: 50,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
};

/**
 * Virtual Camera Rig: smoothly pans and zooms toward the active target on beat changes,
 * alternating between overview and close-up framing.
 */
export const CameraRig: React.FC<{
  focusIndex: number;
  totalTargets: number;
  triggerFrame: number;
  zoomScale?: number;
  layoutMode?: 'horizontal' | 'grid2x2';
  children: React.ReactNode;
}> = ({
  focusIndex,
  totalTargets,
  triggerFrame,
  zoomScale = 1.06,
  layoutMode = 'horizontal',
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = Math.max(0, frame - triggerFrame);
  const camSpring = spring({
    frame: localFrame,
    fps,
    config: { damping: 20, stiffness: 110, mass: 0.9 },
  });

  const safeTotal = Math.max(1, totalTargets);
  const idx = focusIndex % safeTotal;

  let targetX = 0;
  let targetY = 0;
  if (layoutMode === 'horizontal' && safeTotal > 1) {
    const norm = idx / (safeTotal - 1) - 0.5; // -0.5 .. +0.5
    targetX = -norm * 90;
    targetY = -6;
  } else if (layoutMode === 'grid2x2') {
    const col = idx % 2;
    const row = Math.floor(idx / 2) % 2;
    targetX = col === 0 ? 28 : -28;
    targetY = row === 0 ? 18 : -18;
  }

  const scale = interpolate(camSpring, [0, 1], [1.0, zoomScale]);
  const tx = interpolate(camSpring, [0, 1], [0, targetX]);
  const ty = interpolate(camSpring, [0, 1], [0, targetY]);

  return (
    <div
      style={{
        transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        transformOrigin: 'center center',
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  );
};

/**
 * Live Telemetry / Register Trace micro-widget to break up static text cards
 * with continuous frame-by-frame hardware/protocol activity.
 */
export const LiveTelemetryWidget: React.FC<{
  title: string;
  accentColor: string;
  effect: string;
  beatIndex: number;
  activeLabel: string;
}> = ({ title, accentColor, effect, beatIndex, activeLabel }) => {
  const frame = useCurrentFrame();
  const isAlert = effect === 'glitch-alert';
  const statusColor = isAlert ? '#F59E0B' : accentColor;

  const bars = Array.from({ length: 14 }, (_, i) => {
    const wave = Math.abs(Math.sin((frame * 0.18) + i * 0.65 + beatIndex));
    const h = Math.round(18 + wave * 68);
    return h;
  });

  const tick = Math.floor(frame / 12);
  const hexAddr = (0x4a00 + ((tick + beatIndex * 7) % 64) * 16).toString(16).toUpperCase();
  const regVal = (0x8f00 + ((frame * 3 + beatIndex * 19) % 255)).toString(16).toUpperCase();

  const logLines = [
    `[${String(tick).padStart(3, '0')}] TARGET=${activeLabel.slice(0, 18)}`,
    `[REG 0x${hexAddr}] VAL=0x${regVal} • ${isAlert ? 'ERR_MARGIN_LOW' : 'CRC_OK'}`,
    `[BUS] ${effect.toUpperCase()} • BEAT #${beatIndex + 1}`,
  ];

  return (
    <div
      style={{
        backgroundColor: 'rgba(9, 14, 28, 0.94)',
        border: `1px solid ${statusColor}55`,
        borderRadius: 14,
        padding: '18px 22px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 12,
        boxShadow: `0 0 24px ${statusColor}22`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: statusColor, fontSize: 13, fontWeight: 800, letterSpacing: '0.08em' }}>
          ● {title}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 6,
            backgroundColor: `${statusColor}22`,
            color: statusColor,
          }}
        >
          {isAlert ? 'ANOMALY' : 'LIVE 30FPS'}
        </span>
      </div>

      {/* Mini live spectrum / bus activity bars */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56, paddingTop: 4 }}>
        {bars.map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h}%`,
              borderRadius: 3,
              backgroundColor: i % 5 === 0 && isAlert ? '#EF4444' : statusColor,
              opacity: 0.45 + (i / bars.length) * 0.55,
            }}
          />
        ))}
      </div>

      {/* Scrolling terminal-style trace */}
      <div
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 13,
          lineHeight: 1.5,
          color: '#CBD5E1',
          backgroundColor: 'rgba(2, 6, 23, 0.75)',
          borderRadius: 8,
          padding: '10px 12px',
          border: '1px solid rgba(148,163,184,0.14)',
        }}
      >
        {logLines.map((line, i) => (
          <div key={i} style={{ color: i === 1 && isAlert ? '#FBBF24' : '#CBD5E1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
};
