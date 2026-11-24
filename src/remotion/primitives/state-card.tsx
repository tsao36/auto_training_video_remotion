import React from "react";
import { interpolateColors, useCurrentFrame } from "remotion";
import { AbsoluteFill } from "remotion";

export type StateCardProps = {
  active?: boolean;
  startFrame?: number;
  durationInFrames?: number;
  activeColor?: string;
  inactiveColor?: string;
  activeBackground?: string;
  inactiveBackground?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  frame?: number;
};

export const StateCard: React.FC<StateCardProps> = ({
  active = false,
  startFrame = 0,
  durationInFrames = 18,
  activeColor = "#ff6b00",
  inactiveColor = "rgba(148,163,184,0.24)",
  activeBackground = "rgba(255,107,0,0.08)",
  inactiveBackground = "rgba(15,23,42,0.72)",
  children,
  style,
  frame: frameOverride,
}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const progress = Math.min(1, Math.max(0, (frame - startFrame) / durationInFrames));
  const stateProgress = active ? progress : 1 - progress;
  const borderColor = interpolateColors(stateProgress, [0, 1], [inactiveColor, activeColor]);
  const backgroundColor = interpolateColors(stateProgress, [0, 1], [inactiveBackground, activeBackground]);

  return (
    <AbsoluteFill
      style={{
        padding: 12,
        boxSizing: "border-box",
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        backgroundColor,
        boxShadow: active
          ? `0 0 24px ${activeColor}44, inset 0 0 18px ${activeColor}18`
          : "none",
        opacity: active ? 1 : 0.48,
        filter: active ? "none" : "saturate(0.5)",
        transition: "none",
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
