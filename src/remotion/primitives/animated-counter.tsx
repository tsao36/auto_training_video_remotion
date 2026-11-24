import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

export type AnimatedCounterProps = {
  from?: number;
  to: number;
  startFrame?: number;
  durationInFrames?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  fontSize?: number;
  fontWeight?: number | string;
  color?: string;
  tabularNums?: boolean;
  frame?: number;
};

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  from = 0,
  to,
  startFrame = 0,
  durationInFrames = 45,
  decimals = 0,
  prefix = "",
  suffix = "",
  fontSize = 64,
  fontWeight = 800,
  color = "#ffffff",
  tabularNums = true,
  frame: frameOverride,
}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const progress = interpolate(frame, [startFrame, startFrame + durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const value = from + (to - from) * progress;
  const displayValue = Number.isFinite(value)
    ? decimals === 0
      ? String(Math.round(value))
      : value.toFixed(decimals)
    : "0";

  return (
    <span
      style={{
        color,
        fontSize,
        fontWeight,
        letterSpacing: 0,
        fontVariantNumeric: tabularNums ? "tabular-nums" : undefined,
      }}
    >
      {prefix}{displayValue}{suffix}
    </span>
  );
};
