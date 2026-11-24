import React from "react";
import { interpolate, interpolateColors, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type KineticCaptionProps = {
  text: string;
  highlightWords?: string[];
  startFrame?: number;
  framesPerWord?: number;
  activeColor?: string;
  inactiveColor?: string;
  fontSize?: number;
  fontWeight?: number | string;
  textAlign?: "left" | "center" | "right";
  frame?: number;
};

export const KineticCaption: React.FC<KineticCaptionProps> = ({
  text,
  highlightWords,
  startFrame = 0,
  framesPerWord = 24,
  activeColor = "#ff6b00",
  inactiveColor = "#b6bcc7",
  fontSize = 64,
  fontWeight = 800,
  textAlign = "center",
  frame: frameOverride,
}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const { fps } = useVideoConfig();
  const words = text.trim().split(/\s+/).filter(Boolean);
  const highlights = highlightWords?.map((word) => word.toLowerCase().replace(/[^a-z0-9]/gi, ""));

  return (
    <div
      style={{
        color: inactiveColor,
        fontSize,
        fontWeight,
        letterSpacing: 0,
        lineHeight: 1.12,
        textAlign,
        whiteSpace: "pre-wrap",
      }}
    >
      {words.map((word, index) => {
        const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/gi, "");
        const shouldHighlight = highlights
          ? highlights.includes(cleanWord)
          : index >= 0;
        const wordStart = startFrame + index * framesPerWord;
        const emphasis = spring({
          frame: frame - wordStart,
          fps,
          config: { damping: 14, stiffness: 210, mass: 0.7 },
          from: 0,
          to: 1,
        });
        const localProgress = shouldHighlight
          ? Math.min(1, Math.max(0, emphasis))
          : 0;
        const y = interpolate(localProgress, [0, 1], [14, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        return (
          <React.Fragment key={`${index}-${word}`}>
            {index > 0 ? " " : null}
            <span
              style={{
                display: "inline-block",
                color: shouldHighlight
                  ? interpolateColors(localProgress, [0, 1], [inactiveColor, activeColor])
                  : inactiveColor,
                transform: `translateY(${y}px) scale(${interpolate(localProgress, [0, 1], [0.96, 1])})`,
                transformOrigin: "center bottom",
                textShadow: shouldHighlight && localProgress > 0.5
                  ? `0 0 18px ${activeColor}55`
                  : "none",
              }}
            >
              {word}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
};
