import type { TikTokPage } from "@remotion/captions";
import React, {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  getAbsoluteTimeMs,
  getTokenEmphasis,
  getTokenRelativeFrames,
  isTokenActive,
} from "@/remotion/lib/caption-utils";
import { scaleFont } from "@/remotion/lib/layout";

export type CaptionElementProps = {
  page: TikTokPage;
  width?: number;
  style?: CSSProperties;
  className?: string;
  textColor?: string;
  highlightColor?: string;
  fontSize?: number;
  fontWeight?: number | string;
  frame?: number;
};

const splitTokenWhitespace = (text: string) => {
  const trimmed = text.trim();
  const start = trimmed ? text.indexOf(trimmed) : text.length;
  return {
    leading: text.slice(0, start),
    word: trimmed,
    trailing: trimmed ? text.slice(start + trimmed.length) : "",
  };
};

const CaptionElementFrame: React.FC<
  Pick<CaptionElementProps, "className" | "style" | "width"> & {
    children: React.ReactNode;
  }
> = ({ children, className, style, width }) => (
  <div
    className={className}
    style={{
      alignItems: "center",
      display: "flex",
      justifyContent: "center",
      width,
      ...style,
    }}
  >
    {children}
  </div>
);

export const BasicCaptions: React.FC<CaptionElementProps> = ({
  page,
  width,
  style,
  className,
  textColor = "#ffffff",
  fontSize: fontSizeProp,
  fontWeight = 400,
}) => {
  const { width: compositionWidth } = useVideoConfig();
  const fontSize = fontSizeProp ?? scaleFont(64, compositionWidth);

  return (
    <CaptionElementFrame className={className} style={style} width={width}>
      <div
        style={{
          backgroundColor: "rgba(64, 64, 64, 0.75)",
          color: textColor,
          fontSize,
          fontWeight,
          lineHeight: 1.2,
          padding: "0.22em 0.34em",
          textAlign: "center",
          whiteSpace: "pre-wrap",
        }}
      >
        {page.text.trim()}
      </div>
    </CaptionElementFrame>
  );
};

export const RoundedCaptions: React.FC<CaptionElementProps> = ({
  page,
  width,
  style,
  className,
  textColor = "#000000",
  fontSize: fontSizeProp,
  fontWeight = 700,
}) => {
  const { width: compositionWidth } = useVideoConfig();
  const fontSize = fontSizeProp ?? scaleFont(62, compositionWidth);

  return (
    <CaptionElementFrame className={className} style={style} width={width}>
      <div
        style={{
          color: textColor,
          fontSize,
          fontWeight,
          lineHeight: 1.5,
          maxWidth: "100%",
          textAlign: "center",
          whiteSpace: "pre-wrap",
        }}
      >
        <span
          style={{
            background: "#ffffff",
            borderRadius: "0.32em",
            boxDecorationBreak: "clone",
            padding: "0.08em 0.34em",
            WebkitBoxDecorationBreak: "clone",
          }}
        >
          {page.text.trim()}
        </span>
      </div>
    </CaptionElementFrame>
  );
};

type TokenLayout = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export const MovingPillCaptions: React.FC<CaptionElementProps> = ({
  page,
  width,
  style,
  className,
  textColor = "#ffffff",
  highlightColor = "#2563eb",
  fontSize: fontSizeProp,
  fontWeight = 700,
  frame: frameOverride,
}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const { fps, width: compositionWidth } = useVideoConfig();
  const fontSize = fontSizeProp ?? scaleFont(72, compositionWidth);
  const containerRef = useRef<HTMLDivElement>(null);
  const tokenRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [layouts, setLayouts] = useState<TokenLayout[]>([]);
  const absoluteTimeMs = getAbsoluteTimeMs(page, frame, fps);
  const activeIndex = page.tokens.findIndex((token) =>
    isTokenActive(token, absoluteTimeMs),
  );
  const latestStartedIndex = page.tokens.reduce(
    (latest, token, index) => (token.fromMs <= absoluteTimeMs ? index : latest),
    -1,
  );
  const pillIndex = activeIndex >= 0 ? activeIndex : latestStartedIndex;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      setLayouts(
        page.tokens.map((_, index) => {
          const token = tokenRefs.current[index];
          return token
            ? {
                height: token.offsetHeight,
                left: token.offsetLeft,
                top: token.offsetTop,
                width: token.offsetWidth,
              }
            : { height: 0, left: 0, top: 0, width: 0 };
        }),
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fontSize, page.tokens]);

  const currentLayout = layouts[pillIndex];
  const previousLayout = layouts[Math.max(0, pillIndex - 1)] ?? currentLayout;
  const token = page.tokens[pillIndex];
  const tokenStartFrame = token
    ? getTokenRelativeFrames(token, page, fps).startFrame
    : 0;
  const moveProgress = token
    ? spring({
        frame: frame - tokenStartFrame,
        fps,
        config: { damping: 100 },
        durationInFrames: 5,
      })
    : 1;
  const interpolateLayout = (property: keyof TokenLayout) =>
    currentLayout && previousLayout
      ? interpolate(
          moveProgress,
          [0, 1],
          [previousLayout[property], currentLayout[property]],
        )
      : 0;
  const horizontalPadding = fontSize * 0.15;
  const verticalPadding = fontSize * 0.1;

  return (
    <CaptionElementFrame className={className} style={style} width={width}>
      <div
        ref={containerRef}
        style={{
          color: textColor,
          fontSize,
          fontWeight,
          lineHeight: 1.5,
          position: "relative",
          textAlign: "center",
          textShadow: "0 1px 2px rgba(0,0,0,0.65)",
          width: "100%",
        }}
      >
        {currentLayout ? (
          <span
            style={{
              background: highlightColor,
              borderRadius: fontSize * 0.16,
              height: interpolateLayout("height") + verticalPadding * 2,
              left: interpolateLayout("left") - horizontalPadding,
              position: "absolute",
              top: interpolateLayout("top") - verticalPadding,
              width: interpolateLayout("width") + horizontalPadding * 2,
            }}
          />
        ) : null}
        {page.tokens.map((captionToken, index) => {
          const { leading, trailing, word } = splitTokenWhitespace(captionToken.text);
          return (
            <Fragment key={`${captionToken.fromMs}-${index}`}>
              {leading}
              <span
                ref={(element) => {
                  tokenRefs.current[index] = element;
                }}
                style={{ display: "inline-block", position: "relative", whiteSpace: "pre" }}
              >
                {word}
              </span>
              {trailing}
            </Fragment>
          );
        })}
      </div>
    </CaptionElementFrame>
  );
};

export const PoppingWordCaptions: React.FC<CaptionElementProps> = ({
  page,
  width,
  style,
  className,
  textColor = "#ffffff",
  highlightColor = "#2563eb",
  fontSize: fontSizeProp,
  fontWeight = 700,
  frame: frameOverride,
}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const { fps, width: compositionWidth } = useVideoConfig();
  const fontSize = fontSizeProp ?? scaleFont(72, compositionWidth);

  return (
    <CaptionElementFrame className={className} style={style} width={width}>
      <div
        style={{
          color: textColor,
          fontSize,
          fontWeight,
          lineHeight: 1.5,
          textAlign: "center",
          textShadow: `-${fontSize / 14}px -${fontSize / 14}px 0 #000, ${fontSize / 14}px ${fontSize / 14}px 0 #000`,
          whiteSpace: "pre-wrap",
        }}
      >
        {page.tokens.map((token, index) => {
          const { leading, trailing, word } = splitTokenWhitespace(token.text);
          const emphasis = getTokenEmphasis(frame, token, page, fps, {
            enterFrames: 3,
            exitFrames: 4,
          });
          return (
            <Fragment key={`${token.fromMs}-${index}`}>
              {leading}
              <span
                style={{
                  color: emphasis > 0.5 ? highlightColor : textColor,
                  display: "inline-block",
                  transform: `scale(${1 + emphasis * 0.12})`,
                  transformOrigin: "center bottom",
                  whiteSpace: "pre",
                }}
              >
                {word}
              </span>
              {trailing}
            </Fragment>
          );
        })}
      </div>
    </CaptionElementFrame>
  );
};

export const WordHighlightCaptions: React.FC<CaptionElementProps> = ({
  page,
  width,
  style,
  className,
  textColor = "#ffffff",
  highlightColor = "#2563eb",
  fontSize: fontSizeProp,
  fontWeight = 700,
  frame: frameOverride,
}) => {
  const localFrame = useCurrentFrame();
  const frame = frameOverride ?? localFrame;
  const { fps, width: compositionWidth } = useVideoConfig();
  const fontSize = fontSizeProp ?? scaleFont(72, compositionWidth);
  const absoluteTimeMs = getAbsoluteTimeMs(page, frame, fps);

  return (
    <CaptionElementFrame className={className} style={style} width={width}>
      <div
        style={{
          color: textColor,
          fontSize,
          fontWeight,
          lineHeight: 1.5,
          textAlign: "center",
          textShadow: `-${fontSize / 14}px -${fontSize / 14}px 0 #000, ${fontSize / 14}px ${fontSize / 14}px 0 #000`,
          whiteSpace: "pre-wrap",
        }}
      >
        {page.tokens.map((token, index) => {
          const { leading, trailing, word } = splitTokenWhitespace(token.text);
          return (
            <Fragment key={`${token.fromMs}-${index}`}>
              {leading}
              <span
                style={{
                  color: isTokenActive(token, absoluteTimeMs)
                    ? highlightColor
                    : textColor,
                  display: "inline-block",
                  whiteSpace: "pre",
                }}
              >
                {word}
              </span>
              {trailing}
            </Fragment>
          );
        })}
      </div>
    </CaptionElementFrame>
  );
};
