import React from 'react';
import { interpolate } from 'remotion';
import {
  findTechnicalTermMatches,
  type TimedTechnicalTerm,
} from '../../utils/captions';

interface PoppingTechnicalTextProps {
  text: string;
  terms: TimedTechnicalTerm[];
  currentMs: number;
  fps: number;
  accentColor: string;
  inactiveColor?: string;
}

export const PoppingTechnicalText: React.FC<PoppingTechnicalTextProps> = ({
  text,
  terms,
  currentMs,
  fps,
  accentColor,
  inactiveColor,
}) => {
  const matches = findTechnicalTermMatches(text, terms);
  if (matches.length === 0) return <>{text}</>;

  const pieces: React.ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start < cursor) return;
    if (match.start > cursor) pieces.push(text.slice(cursor, match.start));

    const ageMs = currentMs - match.startMs;
    const popIn = interpolate(ageMs, [0, (1000 / fps) * 4, 260, 520], [0, 1, 1, 0.55], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const isActive = currentMs >= match.startMs && currentMs <= match.endMs;

    pieces.push(
      <span
        key={`${match.start}-${index}`}
        style={{
          display: 'inline-block',
          color: isActive ? accentColor : inactiveColor,
          fontWeight: isActive ? 800 : undefined,
          transform: `scale(${isActive ? 1 + popIn * 0.12 : 1})`,
          textShadow: isActive ? `0 0 ${8 + popIn * 10}px ${accentColor}88` : undefined,
          transformOrigin: 'center bottom',
        }}
      >
        {text.slice(match.start, match.end)}
      </span>
    );
    cursor = match.end;
  });

  if (cursor < text.length) pieces.push(text.slice(cursor));
  return <>{pieces}</>;
};
