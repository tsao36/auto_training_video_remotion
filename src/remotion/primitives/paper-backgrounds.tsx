import React, { useId, type CSSProperties, type ReactNode } from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export type PaperBackgroundProps = {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  contentStyle?: CSSProperties;
  backgroundColor?: string;
  textureColor?: string;
  textureOpacity?: number;
  textureScale?: number;
  seed?: number;
};

const PaperGrain: React.FC<{
  color: string;
  opacity: number;
  scale: number;
  seed: number;
}> = ({ color, opacity, scale, seed }) => {
  const filterId = `paper-grain-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 1920 1080"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, opacity, pointerEvents: 'none' }}
    >
      <defs>
        <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency={`${0.72 / Math.max(0.25, scale)} ${0.88 / Math.max(0.25, scale)}`}
          numOctaves={3}
          seed={Math.round(seed)}
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncR type="linear" slope="0.7" intercept="0.2" />
          <feFuncG type="linear" slope="0.7" intercept="0.2" />
          <feFuncB type="linear" slope="0.7" intercept="0.2" />
        </feComponentTransfer>
        </filter>
      </defs>
      <rect width="1920" height="1080" fill={color} filter={`url(#${filterId})`} />
    </svg>
  );
};

export type NotebookPaperProps = PaperBackgroundProps & {
  gridSize?: number;
  gridColor?: string;
  gridWidth?: number;
  marginColor?: string;
  marginOffset?: number;
  showMargin?: boolean;
  marginWidth?: number;
};

export const NotebookPaper: React.FC<NotebookPaperProps> = ({
  children,
  className,
  style,
  contentStyle,
  backgroundColor = '#fbfbf8',
  textureColor = '#687b91',
  textureOpacity = 0.08,
  textureScale = 1,
  seed = 24,
  gridSize = 54,
  gridColor = 'rgba(76, 101, 128, 0.16)',
  gridWidth = 1.5,
  marginColor = 'rgba(213, 91, 91, 0.34)',
  marginOffset = 148,
  showMargin = false,
  marginWidth = 2,
}) => (
  <AbsoluteFill
    className={className}
    style={{
      backgroundColor,
      overflow: 'hidden',
      ...style,
    }}
  >
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `linear-gradient(to right, ${gridColor} ${gridWidth}px, transparent ${gridWidth}px), linear-gradient(to bottom, ${gridColor} ${gridWidth}px, transparent ${gridWidth}px)`,
        backgroundSize: `${gridSize}px ${gridSize}px`,
      }}
    />
    {showMargin ? (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: marginOffset,
          top: 0,
          bottom: 0,
          width: marginWidth,
          backgroundColor: marginColor,
        }}
      />
    ) : null}
    <PaperGrain color={textureColor} opacity={textureOpacity} scale={textureScale} seed={seed} />
    <div style={{ position: 'relative', width: '100%', height: '100%', ...contentStyle }}>
      {children}
    </div>
  </AbsoluteFill>
);

export type PaperTextureProps = PaperBackgroundProps & {
  animate?: boolean;
  posterizeFrames?: number;
  shadowColor?: string;
  edgeShade?: number;
};

export function getPaperTextureSeed(
  frame: number,
  durationInFrames: number,
  seed: number,
  animate: boolean,
  posterizeFrames: number,
) {
  if (!animate) return seed;
  return interpolate(frame, [0, Math.max(1, durationInFrames)], [seed, seed + 1000], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    posterize: posterizeFrames,
  });
}

export const PaperTexture: React.FC<PaperTextureProps> = ({
  children,
  className,
  style,
  contentStyle,
  backgroundColor = '#f7f5ef',
  textureColor = '#6f6a61',
  textureOpacity = 0.14,
  textureScale = 1,
  seed = 0,
  animate = true,
  posterizeFrames = 30,
  shadowColor = 'rgba(82, 68, 48, 0.16)',
  edgeShade = 0.12,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const animatedSeed = getPaperTextureSeed(
    frame,
    durationInFrames,
    seed,
    animate,
    posterizeFrames,
  );

  return (
    <AbsoluteFill
      className={className}
      style={{
        backgroundColor,
        overflow: 'hidden',
        ...style,
      }}
    >
      <PaperGrain
        color={textureColor}
        opacity={textureOpacity}
        scale={textureScale}
        seed={animatedSeed}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 46%, transparent 54%, ${shadowColor} 100%)`,
          opacity: edgeShade,
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', width: '100%', height: '100%', ...contentStyle }}>
        {children}
      </div>
    </AbsoluteFill>
  );
};
