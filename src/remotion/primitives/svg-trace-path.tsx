import React from "react";
import { evolvePath, getLength, getPointAtLength } from "@remotion/paths";
import { interpolate, useCurrentFrame } from "remotion";

export type SvgTracePathProps = {
  path: string;
  viewBox: string;
  width?: number | string;
  height?: number | string;
  startFrame?: number;
  durationInFrames?: number;
  color?: string;
  trackColor?: string;
  strokeWidth?: number;
  dotRadius?: number;
  showDot?: boolean;
  frame?: number;
};

export const SvgTracePath: React.FC<SvgTracePathProps> = ({
  path,
  viewBox,
  width = "100%",
  height = "100%",
  startFrame = 0,
  durationInFrames = 45,
  color = "#00c2ff",
  trackColor = "rgba(148,163,184,0.18)",
  strokeWidth = 4,
  dotRadius = 7,
  showDot = true,
  frame: frameOverride,
}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const progress = interpolate(frame, [startFrame, startFrame + durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const evolved = evolvePath(progress, path);
  const pathLength = getLength(path);
  const dot = getPointAtLength(path, pathLength * progress);

  return (
    <svg width={width} height={height} viewBox={viewBox} style={{ overflow: "visible" }}>
      <defs>
        <filter id="svg-trace-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d={path} fill="none" stroke={trackColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={evolved.strokeDasharray}
        strokeDashoffset={evolved.strokeDashoffset}
        filter="url(#svg-trace-glow)"
      />
      {showDot && dot ? (
        <g transform={`translate(${dot.x} ${dot.y})`} filter="url(#svg-trace-glow)">
          <circle r={dotRadius * 2.2} fill={color} opacity={0.16} />
          <circle r={dotRadius} fill="#ffffff" stroke={color} strokeWidth={3} />
        </g>
      ) : null}
    </svg>
  );
};
