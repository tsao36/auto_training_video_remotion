import React, { type CSSProperties } from "react";
import {
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { formatCompactNumber } from "@/remotion/lib/chart-utils";

export type ChartElementDatum = {
  label: string;
  value: number;
  color?: string;
  foreground?: string;
  highlighted?: boolean;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const growthEasing = Easing.out(Easing.cubic);

export type HorizontalBarChartProps = {
  data: ChartElementDatum[];
  width?: number;
  rowHeight?: number;
  gap?: number;
  highlightColor?: string;
  mutedColor?: string;
  foreground?: string;
  mutedForeground?: string;
  durationInFrames?: number;
  staggerInFrames?: number;
  valueFormatter?: (value: number) => string;
  style?: CSSProperties;
  frame?: number;
};

export const HorizontalBarChart: React.FC<HorizontalBarChartProps> = ({
  data,
  width = 900,
  rowHeight = 84,
  gap = 20,
  highlightColor = "#2563eb",
  mutedColor = "#d1d5db",
  foreground = "#ffffff",
  mutedForeground = "#111827",
  durationInFrames = 32,
  staggerInFrames = 6,
  valueFormatter = formatCompactNumber,
  style,
  frame: frameOverride,
}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const maximum = Math.max(1, ...data.map((item) => item.value));

  return (
    <div style={{ display: "grid", gap, width, ...style }}>
      {data.map((item, index) => {
        const progress = interpolate(
          frame,
          [index * staggerInFrames, index * staggerInFrames + durationInFrames],
          [0, 1],
          {
            easing: growthEasing,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        );
        const highlighted = item.highlighted ?? index === 0;
        const color = item.color ?? (highlighted ? highlightColor : mutedColor);
        const ink = item.foreground ?? (highlighted ? foreground : mutedForeground);

        return (
          <div
            key={item.label}
            style={{
              alignItems: "center",
              display: "flex",
              height: rowHeight,
              width: "100%",
            }}
          >
            <div
              style={{
                alignItems: "center",
                background: color,
                borderRadius: rowHeight * 0.12,
                boxSizing: "border-box",
                color: ink,
                display: "flex",
                height: "100%",
                justifyContent: "space-between",
                overflow: "hidden",
                padding: `0 ${rowHeight * 0.3}px`,
                width: `${(item.value / maximum) * 100 * progress}%`,
              }}
            >
              <span
                style={{
                  fontSize: rowHeight * 0.27,
                  fontWeight: 700,
                  opacity: clamp01((progress - 0.5) / 0.3),
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </span>
              <span
                style={{
                  fontSize: rowHeight * 0.32,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  opacity: clamp01((progress - 0.7) / 0.3),
                  whiteSpace: "nowrap",
                }}
              >
                {valueFormatter(item.value)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export type LineChartProps = {
  data: ChartElementDatum[];
  width?: number;
  height?: number;
  lineColor?: string;
  gridColor?: string;
  labelColor?: string;
  pointColor?: string;
  suffix?: string;
  durationInFrames?: number;
  pointStaggerInFrames?: number;
  valueFormatter?: (value: number) => string;
  style?: CSSProperties;
  frame?: number;
};

export const LineChart: React.FC<LineChartProps> = ({
  data,
  width = 960,
  height = 420,
  lineColor = "#2563eb",
  gridColor = "#d1d5db",
  labelColor = "#4b5563",
  pointColor = "#ffffff",
  suffix = "K",
  durationInFrames = 44,
  pointStaggerInFrames = 6,
  valueFormatter = (value) => `${formatCompactNumber(value)}${suffix}`,
  style,
  frame: frameOverride,
}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const padding = 24;
  const labelSpace = 54;
  const chartWidth = width - padding * 2;
  const chartHeight = height - labelSpace;
  const values = data.map((item) => item.value);
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 1;
  const range = Math.max(1, maximum - minimum);
  const points = data.map((item, index) => ({
    ...item,
    x:
      padding +
      (data.length <= 1 ? chartWidth / 2 : (index / (data.length - 1)) * chartWidth),
    y: padding + ((maximum - item.value) / range) * (chartHeight - padding * 2),
  }));
  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const drawProgress = interpolate(frame, [0, durationInFrames], [0, 1], {
    easing: growthEasing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const latest = points.at(-1);

  return (
    <div style={{ height, position: "relative", width, ...style }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
        {[0, 1, 2, 3].map((index) => {
          const y = padding + (index / 3) * (chartHeight - padding * 2);
          return (
            <line
              key={index}
              x1={padding}
              x2={width - padding}
              y1={y}
              y2={y}
              stroke={gridColor}
              strokeWidth={2}
            />
          );
        })}
        {points.length ? (
          <path
            d={path}
            fill="none"
            pathLength={1}
            stroke={lineColor}
            strokeDasharray="1 1"
            strokeDashoffset={1 - drawProgress}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={8}
          />
        ) : null}
        {points.map((point, index) => {
          const radius = interpolate(
            frame,
            [index * pointStaggerInFrames, index * pointStaggerInFrames + 10],
            [0, 7],
            {
              easing: Easing.out(Easing.cubic),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );
          return (
            <circle
              key={point.label}
              cx={point.x}
              cy={point.y}
              r={radius}
              fill={pointColor}
              stroke={point.color ?? lineColor}
              strokeWidth={5}
            />
          );
        })}
        {points.map((point, index) =>
          index % 2 === 0 ? (
            <text
              key={`${point.label}-label`}
              x={point.x}
              y={height - 8}
              fill={labelColor}
              fontSize={24}
              fontWeight={700}
              textAnchor="middle"
            >
              {point.label}
            </text>
          ) : null,
        )}
      </svg>
      {latest ? (
        <div
          style={{
            background: lineColor,
            borderRadius: 8,
            color: "#ffffff",
            fontSize: 28,
            fontWeight: 800,
            left: latest.x,
            opacity: clamp01((drawProgress - 0.8) / 0.2),
            padding: "10px 14px",
            position: "absolute",
            scale: interpolate(drawProgress, [0.8, 1], [0.8, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            top: latest.y,
            translate: "-50% -130%",
            whiteSpace: "nowrap",
          }}
        >
          {valueFormatter(latest.value)}
        </div>
      ) : null}
    </div>
  );
};

export type NumberCounterProps = {
  from?: number;
  to: number;
  durationInFrames?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  fontSize?: number;
  fontWeight?: number | string;
  color?: string;
  locale?: string;
  style?: CSSProperties;
  frame?: number;
};

export const NumberCounter: React.FC<NumberCounterProps> = ({
  from = 0,
  to,
  durationInFrames,
  decimals = 0,
  prefix = "",
  suffix = "",
  fontSize = 150,
  fontWeight = 800,
  color = "#171717",
  locale = "en-US",
  style,
  frame: frameOverride,
}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const { durationInFrames: compositionDuration } = useVideoConfig();
  const duration = durationInFrames ?? compositionDuration * 0.75;
  const progress = interpolate(frame, [0, duration], [0, 1], {
    easing: Easing.out(Easing.exp),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const value = from + (to - from) * progress;
  const formatted = value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span
      style={{
        color,
        fontSize,
        fontVariantNumeric: "tabular-nums",
        fontWeight,
        lineHeight: 1,
        ...style,
      }}
    >
      {prefix}{formatted}{suffix}
    </span>
  );
};

export type PieChartProps = {
  data: ChartElementDatum[];
  size?: number;
  colors?: string[];
  trackColor?: string;
  showLegend?: boolean;
  durationInFrames?: number;
  valueFormatter?: (value: number) => string;
  style?: CSSProperties;
  frame?: number;
};

const slicePath = (
  center: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) => {
  if (endAngle <= startAngle) return `M ${center} ${center}`;
  const startRadians = ((startAngle - 90) * Math.PI) / 180;
  const endRadians = ((endAngle - 90) * Math.PI) / 180;
  const startX = center + radius * Math.cos(startRadians);
  const startY = center + radius * Math.sin(startRadians);
  const endX = center + radius * Math.cos(endRadians);
  const endY = center + radius * Math.sin(endRadians);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${center} ${center} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`;
};

export const PieChart: React.FC<PieChartProps> = ({
  data,
  size = 520,
  colors = ["#2563eb", "#6b7280", "#9ca3af", "#d1d5db"],
  trackColor = "#e5e7eb",
  showLegend = true,
  durationInFrames = 52,
  valueFormatter = (value) => `${value}%`,
  style,
  frame: frameOverride,
}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  const revealAngle = interpolate(frame, [0, durationInFrames], [0, 360], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  let angle = 0;

  return (
    <div style={{ alignItems: "center", display: "flex", gap: size * 0.1, ...style }}>
      <svg width={size} height={size} viewBox="0 0 600 600">
        <circle cx={300} cy={300} r={284} fill={trackColor} />
        {data.map((item, index) => {
          const startAngle = angle;
          const endAngle = angle + (item.value / total) * 360;
          angle = endAngle;
          return (
            <path
              key={item.label}
              d={slicePath(300, 284, startAngle, Math.min(endAngle, revealAngle))}
              fill={item.color ?? colors[index % colors.length]}
            />
          );
        })}
      </svg>
      {showLegend ? (
        <div style={{ display: "grid", gap: size * 0.025, minWidth: size * 0.55 }}>
          {data.map((item, index) => {
            const background = item.color ?? colors[index % colors.length];
            return (
              <div
                key={item.label}
                style={{
                  alignItems: "center",
                  background,
                  borderRadius: size * 0.015,
                  color: item.foreground ?? "#ffffff",
                  display: "flex",
                  fontSize: size * 0.05,
                  fontWeight: 700,
                  justifyContent: "space-between",
                  opacity: clamp01(frame / 30),
                  padding: `${size * 0.03}px ${size * 0.045}px`,
                }}
              >
                <span>{item.label}</span>
                <span>{valueFormatter(item.value)}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export type VerticalBarChartProps = {
  data: ChartElementDatum[];
  width?: number;
  height?: number;
  highlightColor?: string;
  mutedColor?: string;
  labelColor?: string;
  durationInFrames?: number;
  staggerInFrames?: number;
  valueFormatter?: (value: number) => string;
  style?: CSSProperties;
  frame?: number;
};

export const VerticalBarChart: React.FC<VerticalBarChartProps> = ({
  data,
  width = 900,
  height = 520,
  highlightColor = "#2563eb",
  mutedColor = "#b9c0ca",
  labelColor = "#111827",
  durationInFrames = 24,
  staggerInFrames = 18,
  valueFormatter = formatCompactNumber,
  style,
  frame: frameOverride,
}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const maximum = Math.max(1, ...data.map((item) => item.value));
  const labelHeight = 56;

  return (
    <div
      style={{
        borderBottom: "3px solid #c5cad2",
        display: "flex",
        gap: width * 0.05,
        height,
        justifyContent: "space-around",
        width,
        ...style,
      }}
    >
      {data.map((item, index) => {
        const start = index * staggerInFrames;
        const progress = interpolate(frame, [start, start + durationInFrames], [0, 1], {
          easing: Easing.inOut(Easing.cubic),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const highlighted = item.highlighted ?? index === data.length - 1;

        return (
          <div
            key={item.label}
            style={{
              alignItems: "center",
              display: "flex",
              flex: 1,
              flexDirection: "column",
              justifyContent: "flex-end",
              maxWidth: 220,
            }}
          >
            <div
              style={{
                alignItems: "center",
                color: labelColor,
                display: "flex",
                flex: 1,
                flexDirection: "column",
                justifyContent: "flex-end",
                width: "100%",
              }}
            >
              <span
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  marginBottom: 12,
                  opacity: clamp01((progress - 0.65) / 0.35),
                  transformOrigin: "bottom center",
                  whiteSpace: "nowrap",
                }}
              >
                {valueFormatter(item.value)}
              </span>
              <div
                style={{
                  background: item.color ?? (highlighted ? highlightColor : mutedColor),
                  borderRadius: "10px 10px 0 0",
                  height: `${(item.value / maximum) * (height - labelHeight) * progress}px`,
                  maxHeight: height - labelHeight,
                  width: "100%",
                }}
              />
            </div>
            <span
              style={{
                color: labelColor,
                flex: `0 0 ${labelHeight}px`,
                fontSize: 28,
                fontWeight: 700,
                lineHeight: `${labelHeight}px`,
                textAlign: "center",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};
