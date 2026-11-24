import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  PptxElement,
  PptxFill,
  PptxSlideData,
  PptxTextParagraph,
} from '../../types/training';

interface PptxSlideRendererProps {
  slide: PptxSlideData;
  assetBaseUrl?: string;
  progressiveReveal?: boolean;
  getItemRevealFrame: (itemIndex: number, itemCount: number, defaultFrame: number) => number;
}

function resolveAssetUrl(url: string | undefined, assetBaseUrl = ''): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  return `${assetBaseUrl}${url}`;
}

function fillToCss(fill: PptxFill | undefined): React.CSSProperties {
  if (!fill || fill.type === 'none') {
    return { backgroundColor: 'transparent' };
  }
  if (fill.type === 'solid') {
    if (fill.opacity !== undefined && fill.opacity < 1 && fill.color?.startsWith('#')) {
      const hex = fill.color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16) || 0;
      const g = parseInt(hex.slice(2, 4), 16) || 0;
      const b = parseInt(hex.slice(4, 6), 16) || 0;
      return { backgroundColor: `rgba(${r}, ${g}, ${b}, ${fill.opacity})` };
    }
    return { backgroundColor: fill.color || 'transparent' };
  }
  if (fill.type === 'gradient' && fill.gradientStops && fill.gradientStops.length > 0) {
    const stops = fill.gradientStops.map((s) => `${s.color} ${s.position}%`).join(', ');
    return {
      backgroundImage: `linear-gradient(${fill.gradientAngleDeg ?? 180}deg, ${stops})`,
    };
  }
  return {};
}

function getSvgPolygonPoints(shapeType: string, w: number, h: number): string | null {
  switch (shapeType) {
    case 'triangle':
      return `${w / 2},0 ${w},${h} 0,${h}`;
    case 'rtTriangle':
      return `0,0 ${w},${h} 0,${h}`;
    case 'diamond':
      return `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;
    case 'rightArrow':
      return `0,${h * 0.25} ${w * 0.65},${h * 0.25} ${w * 0.65},0 ${w},${h / 2} ${w * 0.65},${h} ${w * 0.65},${h * 0.75} 0,${h * 0.75}`;
    case 'leftArrow':
      return `${w},${h * 0.25} ${w * 0.35},${h * 0.25} ${w * 0.35},0 0,${h / 2} ${w * 0.35},${h} ${w * 0.35},${h * 0.75} ${w},${h * 0.75}`;
    case 'upArrow':
      return `${w / 2},0 ${w},${h * 0.35} ${w * 0.75},${h * 0.35} ${w * 0.75},${h} ${w * 0.25},${h} ${w * 0.25},${h * 0.35} 0,${h * 0.35}`;
    case 'downArrow':
      return `${w * 0.25},0 ${w * 0.75},0 ${w * 0.75},${h * 0.65} ${w},${h * 0.65} ${w / 2},${h} 0,${h * 0.65} ${w * 0.25},${h * 0.65}`;
    case 'chevron':
      return `0,0 ${w * 0.75},0 ${w},${h / 2} ${w * 0.75},${h} 0,${h} ${w * 0.25},${h / 2}`;
    case 'hexagon':
      return `${w * 0.25},0 ${w * 0.75},0 ${w},${h / 2} ${w * 0.75},${h} ${w * 0.25},${h} 0,${h / 2}`;
    default:
      return null;
  }
}

const ParagraphList: React.FC<{ paragraphs: PptxTextParagraph[] }> = ({ paragraphs }) => (
  <>
    {paragraphs.map((p, pIdx) => {
      const hasContent = p.runs.some((r) => r.text.length > 0);
      if (!hasContent) {
        return <div key={pIdx} style={{ height: '0.6em' }} />;
      }
      const indentPx = (p.level || 0) * 28;
      return (
        <div
          key={pIdx}
          style={{
            textAlign: p.align || 'left',
            paddingLeft: indentPx > 0 ? indentPx : undefined,
            marginBottom: p.spaceAfterPx ?? 4,
            marginTop: p.spaceBeforePx ?? 0,
            lineHeight: p.lineHeight ?? 1.28,
            wordBreak: 'break-word',
          }}
        >
          {p.bullet && (
            <span
              style={{
                marginRight: 10,
                color: p.runs[0]?.color || '#0F172A',
                fontSize: p.runs[0]?.fontSizePx || 24,
                fontWeight: p.runs[0]?.bold ? 700 : 400,
              }}
            >
              {p.bullet}
            </span>
          )}
          {p.runs.map((r, rIdx) => {
            const decorations: string[] = [];
            if (r.underline) decorations.push('underline');
            if (r.strike) decorations.push('line-through');
            return (
              <span
                key={rIdx}
                style={{
                  fontSize: r.fontSizePx || 24,
                  fontFamily: r.fontFamily
                    ? `"${r.fontFamily}", "Noto Sans TC", Arial, sans-serif`
                    : 'Calibri, "Noto Sans TC", Arial, sans-serif',
                  color: r.color || '#0F172A',
                  fontWeight: r.bold ? 700 : 400,
                  fontStyle: r.italic ? 'italic' : 'normal',
                  textDecoration: decorations.length > 0 ? decorations.join(' ') : 'none',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {r.text}
              </span>
            );
          })}
        </div>
      );
    })}
  </>
);

const SlideElementView: React.FC<{ el: PptxElement; assetBaseUrl: string }> = ({
  el,
  assetBaseUrl,
}) => {
  const transforms: string[] = [];
  if (el.rotationDeg) transforms.push(`rotate(${el.rotationDeg}deg)`);
  if (el.flipH) transforms.push('scaleX(-1)');
  if (el.flipV) transforms.push('scaleY(-1)');
  const transformCss = transforms.length > 0 ? transforms.join(' ') : undefined;

  if (el.kind === 'image' && el.imageUrl) {
    const src = resolveAssetUrl(el.imageUrl, assetBaseUrl);
    const crop = el.cropRect;
    const clipPath = crop
      ? `inset(${crop.top * 100}% ${crop.right * 100}% ${crop.bottom * 100}% ${crop.left * 100}%)`
      : undefined;

    return (
      <div
        style={{
          position: 'absolute',
          left: el.x,
          top: el.y,
          width: el.width,
          height: el.height,
          transform: transformCss,
          overflow: 'hidden',
        }}
      >
        <Img
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            clipPath,
          }}
        />
      </div>
    );
  }

  if (el.kind === 'connector') {
    const w = Math.max(2, el.width);
    const h = Math.max(2, el.height);
    const x1 = el.flipH ? w : 0;
    const y1 = el.flipV ? h : 0;
    const x2 = el.flipH ? 0 : w;
    const y2 = el.flipV ? 0 : h;
    const stroke = el.strokeColor || '#334155';
    const sw = el.strokeWidthPx || 2;
    const dashArray = el.strokeDash === 'dash' ? '10 6' : el.strokeDash === 'dot' ? '3 4' : undefined;
    const markerId = `arrow-${el.id}`;

    return (
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{
          position: 'absolute',
          left: el.x,
          top: el.y,
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        {(el.headArrow || el.tailArrow) && (
          <defs>
            <marker
              id={markerId}
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill={stroke} />
            </marker>
          </defs>
        )}
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={stroke}
          strokeWidth={sw}
          strokeDasharray={dashArray}
          markerStart={el.headArrow ? `url(#${markerId})` : undefined}
          markerEnd={el.tailArrow ? `url(#${markerId})` : undefined}
        />
      </svg>
    );
  }

  if (el.kind === 'table' && el.tableRows) {
    return (
      <div
        style={{
          position: 'absolute',
          left: el.x,
          top: el.y,
          width: el.width,
          height: el.height,
          overflow: 'hidden',
        }}
      >
        <table
          style={{
            width: '100%',
            height: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
          }}
        >
          {el.tableColWidths && el.tableColWidths.length > 0 && (
            <colgroup>
              {el.tableColWidths.map((cw, idx) => (
                <col key={idx} style={{ width: cw }} />
              ))}
            </colgroup>
          )}
          <tbody>
            {el.tableRows.map((row, rIdx) => (
              <tr key={rIdx} style={{ height: row.height }}>
                {row.cells.map((cell, cIdx) => {
                  if (cell.skip) return null;
                  const cellFill = fillToCss(cell.fill);
                  return (
                    <td
                      key={cIdx}
                      colSpan={cell.colSpan}
                      rowSpan={cell.rowSpan}
                      style={{
                        ...cellFill,
                        border: `${cell.borderWidthPx || 1}px solid ${cell.borderColor || '#CBD5E1'}`,
                        verticalAlign: cell.verticalAlign || 'middle',
                        padding: '8px 12px',
                      }}
                    >
                      <ParagraphList paragraphs={cell.textParagraphs} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Default: shape / text box
  const polyPoints = el.shapeType ? getSvgPolygonPoints(el.shapeType, el.width, el.height) : null;
  const isEllipse = el.shapeType === 'ellipse';
  const isRoundRect = el.shapeType === 'roundRect';
  const borderRadius = isEllipse
    ? '50%'
    : isRoundRect
    ? Math.min(el.width, el.height) * 0.12
    : 0;

  const justifyMap: Record<string, string> = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
  };

  const pad = el.paddingPx || { top: 6, right: 10, bottom: 6, left: 10 };
  const strokeStyle =
    el.strokeColor && el.strokeWidthPx
      ? `${el.strokeWidthPx}px ${el.strokeDash === 'dash' ? 'dashed' : 'solid'} ${el.strokeColor}`
      : undefined;

  return (
    <div
      style={{
        position: 'absolute',
        left: el.x,
        top: el.y,
        width: el.width,
        height: el.height,
        transform: transformCss,
        borderRadius: polyPoints ? undefined : borderRadius,
        border: polyPoints ? undefined : strokeStyle,
        ...(polyPoints ? {} : fillToCss(el.fill)),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justifyMap[el.verticalAlign || 'top'] || 'flex-start',
        padding: `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
        boxSizing: 'border-box',
        overflow: 'visible',
      }}
    >
      {polyPoints && (
        <svg
          width={el.width}
          height={el.height}
          viewBox={`0 0 ${el.width} ${el.height}`}
          style={{ position: 'absolute', inset: 0, zIndex: 0 }}
        >
          <polygon
            points={polyPoints}
            fill={el.fill?.type === 'solid' ? el.fill.color : 'transparent'}
            stroke={el.strokeColor || 'none'}
            strokeWidth={el.strokeWidthPx || 0}
          />
        </svg>
      )}
      {el.paragraphs && el.paragraphs.length > 0 && (
        <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
          <ParagraphList paragraphs={el.paragraphs} />
        </div>
      )}
    </div>
  );
};

export const PptxSlideRenderer: React.FC<PptxSlideRendererProps> = ({
  slide,
  assetBaseUrl = '',
  progressiveReveal = false,
  getItemRevealFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const leadInFrames = progressiveReveal ? 6 : 0;
  const fadeOpacity = interpolate(frame, [leadInFrames, leadInFrames + 6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const slideLeft = Math.round((1920 - slide.slideWidthPx) / 2);
  const slideTop = Math.round((1080 - slide.slideHeightPx) / 2);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000000',
        opacity: fadeOpacity,
        zIndex: 5,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: slideLeft,
          top: slideTop,
          width: slide.slideWidthPx,
          height: slide.slideHeightPx,
          overflow: 'hidden',
          ...fillToCss(slide.background),
        }}
      >
        {slide.background.type === 'image' && slide.background.imageUrl && (
          <Img
            src={resolveAssetUrl(slide.background.imageUrl, assetBaseUrl)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: 0,
            }}
          />
        )}
        {slide.elements.map((el, elementIndex) => {
          const reveal = spring({
            frame: Math.max(
              0,
              frame - getItemRevealFrame(elementIndex, slide.elements.length, elementIndex * 3)
            ),
            fps,
            config: { damping: 16, stiffness: 180 },
          });
          return (
            <div
              key={el.id}
              style={{
                position: 'absolute',
                inset: 0,
                opacity: reveal,
                transform: `translateY(${interpolate(reveal, [0, 1], [18, 0])}px)`,
                pointerEvents: 'none',
              }}
            >
              <SlideElementView el={el} assetBaseUrl={assetBaseUrl} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
