import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { AbsoluteFill } from "remotion";

export type CameraPanZoomProps = {
  startFrame?: number;
  durationInFrames?: number;
  holdFrames?: number;
  exitFrames?: number;
  scale?: number;
  translateX?: number;
  translateY?: number;
  children: React.ReactNode;
  frame?: number;
};

export const CameraPanZoom: React.FC<CameraPanZoomProps> = ({
  startFrame = 0,
  durationInFrames = 36,
  holdFrames = 60,
  exitFrames = 24,
  scale = 1.35,
  translateX = 0,
  translateY = 0,
  children,
  frame: frameOverride,
}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const easing = Easing.bezier(0.45, 0, 0.55, 1);
  const enter = interpolate(frame, [startFrame, startFrame + durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
  const exitStart = startFrame + durationInFrames + holdFrames;
  const exit = interpolate(frame, [exitStart, exitStart + exitFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
  const progress = exit < enter ? exit : enter;

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${1 + (scale - 1) * progress}) translate(${translateX * progress}px, ${translateY * progress}px)`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
