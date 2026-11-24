import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export type PopBadgeProps = {
  label: string;
  icon?: React.ReactNode;
  startFrame?: number;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  direction?: "left" | "right" | "top" | "bottom";
  frame?: number;
};

export const PopBadge: React.FC<PopBadgeProps> = ({
  label,
  icon,
  startFrame = 0,
  accentColor = "#ff6b00",
  backgroundColor = "rgba(10,16,28,0.96)",
  textColor = "#ffffff",
  fontSize = 24,
  direction = "top",
  frame: frameOverride,
}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const { fps } = useVideoConfig();
  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 12, stiffness: 180, mass: 0.65 },
  });
  const offsets = {
    left: `translateX(${-18 * (1 - progress)}px)`,
    right: `translateX(${18 * (1 - progress)}px)`,
    top: `translateY(${-18 * (1 - progress)}px)`,
    bottom: `translateY(${18 * (1 - progress)}px)`,
  };

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        minHeight: 48,
        padding: "8px 14px",
        border: `1px solid ${accentColor}`,
        borderRadius: 8,
        backgroundColor,
        color: textColor,
        fontSize,
        fontWeight: 800,
        letterSpacing: 0,
        boxShadow: `0 8px 24px ${accentColor}33, inset 0 0 16px ${accentColor}12`,
        transform: `${offsets[direction]} scale(${progress})`,
        transformOrigin: "center center",
        opacity: Math.min(1, progress * 1.5),
      }}
    >
      {icon ? <span style={{ display: "inline-flex", color: accentColor }}>{icon}</span> : null}
      <span>{label}</span>
    </div>
  );
};
