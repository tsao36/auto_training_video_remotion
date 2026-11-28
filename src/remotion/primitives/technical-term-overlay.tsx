import React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Caption } from '@remotion/captions';
import { getTechnicalTermOverlayQueue } from '../../utils/captions';
import { CAPTION_BAND_HEIGHT } from '../lib/caption-layout';

interface TechnicalTermOverlayProps {
  captions: Caption[];
  accentColor: string;
  enabled: boolean;
  allowedTerms?: string[];
}

export const TechnicalTermOverlay: React.FC<TechnicalTermOverlayProps> = ({
  captions,
  accentColor,
  enabled,
  allowedTerms,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;
  const terms = enabled ? getTechnicalTermOverlayQueue(captions, currentMs, 3, allowedTerms) : [];

  if (terms.length === 0) return null;

  const overlayScale = terms.length === 1 ? 1 : terms.length === 2 ? 0.94 : 0.86;
  return (
    <div
      style={{
        position: 'absolute',
        inset: `0 0 ${CAPTION_BAND_HEIGHT}px 0`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        zIndex: 24,
        pointerEvents: 'none',
        transform: `scale(${overlayScale})`,
        transformOrigin: 'center',
      }}
    >
      {terms.map((term, index) => {
        const ageFrames = Math.max(0, frame - (term.startMs / 1000) * fps);
        const nameCrop = interpolate(ageFrames, [0, 20], [1, 0], {
          easing: Easing.bezier(0.65, 0, 0.35, 1),
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const titleCrop = interpolate(ageFrames, [4, 24], [1, 0], {
          easing: Easing.bezier(0.65, 0, 0.35, 1),
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const termFontSize = Math.min(64, Math.max(32, 72 - term.text.length * 1.15));

        return (
          <div
            key={`${term.startMs}-${term.text}`}
            style={{
              width: 1040,
              height: 150,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              boxSizing: 'border-box',
              filter: `drop-shadow(0 16px 24px rgba(0, 0, 0, 0.42)) drop-shadow(0 0 18px ${accentColor}33)`,
            }}
          >
            <div
              style={{
                width: '100%',
                height: 88,
                display: 'flex',
                alignItems: 'center',
                padding: '0 30px',
                boxSizing: 'border-box',
                overflow: 'hidden',
                clipPath: `inset(0 ${nameCrop * 100}% 0 0)`,
                backgroundColor: index === terms.length - 1 ? accentColor : `${accentColor}D9`,
                color: '#FFFFFF',
                fontFamily: 'Inter, "Noto Sans TC", sans-serif',
                fontSize: termFontSize,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: 0,
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}
            >
              {term.text}
            </div>
            <div
              style={{
                width: '74%',
                height: 62,
                display: 'flex',
                alignItems: 'center',
                padding: '0 30px',
                boxSizing: 'border-box',
                overflow: 'hidden',
                clipPath: `inset(0 ${titleCrop * 100}% 0 0)`,
                backgroundColor: '#18181B',
                color: '#FFFFFF',
                fontFamily: 'Inter, "Noto Sans TC", sans-serif',
                fontSize: 24,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: 0.5,
                whiteSpace: 'nowrap',
              }}
            >
              KEY TECHNICAL TERM {index + 1} / {terms.length}
            </div>
          </div>
        );
      })}
    </div>
  );
};
