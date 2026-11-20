import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { DOMAIN_META, SceneSpec } from '../../types/training';
import { getActiveSentenceCue } from '../../utils/sentenceEffects';

interface HudOverlayProps {
  projectTitle: string;
  scene: SceneSpec;
  totalScenes: number;
  globalFrame: number;
  totalFrames: number;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  projectTitle,
  scene,
  totalScenes,
  globalFrame,
  totalFrames,
}) => {
  const { fps } = useVideoConfig();
  const localFrame = useCurrentFrame();
  const meta = DOMAIN_META[scene.domain];
  const accent = scene.animation.accentColor || meta.accentColor;

  const currentSec = Math.floor(globalFrame / fps);
  const totalSec = Math.floor(totalFrames / fps);
  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const progressPct = Math.min(100, Math.max(0, (globalFrame / Math.max(1, totalFrames)) * 100));

  // Subtle animated grid drift
  const gridOffset = (localFrame * 0.4) % 48;

  // Beat-synchronized subtitle computation
  const sceneTotalFrames = Math.max(30, Math.round(scene.durationSeconds * fps));
  const sceneProgress = Math.min(1, localFrame / sceneTotalFrames);
  const { cue: activeCue, cueProgress } = getActiveSentenceCue(
    scene.sentenceCues,
    sceneProgress,
    scene.script,
    scene.template,
    scene.animation.effect || 'signal-pulse'
  );
  const cueStartFrame = Math.round(activeCue.startRatio * sceneTotalFrames);
  const cueLocalFrame = Math.max(0, localFrame - cueStartFrame);
  const subSpring = spring({
    frame: cueLocalFrame,
    fps,
    config: { damping: 18, stiffness: 220, mass: 0.6 },
  });
  const subY = interpolate(subSpring, [0, 1], [14, 0]);
  const subOpacity = interpolate(cueLocalFrame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  const activeSubtitleText = activeCue.sentences.join(' ').trim() || scene.script;

  const renderHighlightedSubtitle = (text: string) => {
    const parts = text.split(/(\b\d+(?:\.\d+)?(?:%|x|ms|ns|GHz|MHz|V|dB|dBm)?\b|\b(?:PCIe|BIOS|EC|SPI|I2C|OFDMA|MU-MIMO|SNR|RF|BLE|PHY|MAC)\b)/g);
    return parts.map((part, idx) => {
      if (!part) return null;
      const isHighlight = /^(\d+(?:\.\d+)?(?:%|x|ms|ns|GHz|MHz|V|dB|dBm)?|PCIe|BIOS|EC|SPI|I2C|OFDMA|MU-MIMO|SNR|RF|BLE|PHY|MAC)$/.test(part);
      return isHighlight ? (
        <span key={idx} style={{ color: accent, fontWeight: 800 }}>
          {part}
        </span>
      ) : (
        <React.Fragment key={idx}>{part}</React.Fragment>
      );
    });
  };

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Tech Grid Background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#070B14',
          backgroundImage: `
            linear-gradient(to right, rgba(56, 189, 248, 0.045) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(56, 189, 248, 0.045) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          backgroundPosition: `${gridOffset}px ${gridOffset}px`,
          zIndex: 0,
        }}
      />

      {/* Ambient Radial Glow */}
      <div
        style={{
          position: 'absolute',
          top: -220,
          right: -180,
          width: 720,
          height: 720,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
          zIndex: 0,
        }}
      />

      {/* Top HUD Bar */}
      {scene.animation.showProgressHud && (
        <div
          style={{
            position: 'absolute',
            top: 28,
            left: 48,
            right: 48,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 20,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                backgroundColor: `${accent}1A`,
                border: `1px solid ${accent}66`,
                color: accent,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '0.08em',
              }}
            >
              {meta.badge}
            </div>
            <div style={{ color: '#94A3B8', fontSize: 16, fontWeight: 500 }}>
              {projectTitle}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                backgroundColor: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                color: '#E2E8F0',
                fontSize: 15,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              SCENE {scene.index + 1} / {totalScenes}
            </div>
            <div
              style={{
                padding: '6px 16px',
                borderRadius: 6,
                backgroundColor: 'rgba(15, 23, 42, 0.85)',
                border: `1px solid ${accent}55`,
                color: accent,
                fontSize: 16,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatTime(currentSec)} / {formatTime(totalSec)}
            </div>
          </div>
        </div>
      )}

      {/* Synchronized Narration Subtitle Bar (Per-Beat Dynamic) */}
      {scene.animation.showSubtitles && activeSubtitleText && (
        <div
          style={{
            position: 'absolute',
            bottom: 36,
            left: 110,
            right: 110,
            display: 'flex',
            justifyContent: 'center',
            zIndex: 20,
            opacity: subOpacity,
            transform: `translateY(${subY}px)`,
          }}
        >
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              backgroundColor: 'rgba(7, 11, 20, 0.90)',
              border: `1px solid ${accent}44`,
              borderRadius: 14,
              padding: '14px 30px 18px',
              color: '#F1F5F9',
              fontSize: 24,
              fontWeight: 500,
              lineHeight: 1.45,
              textAlign: 'center',
              maxWidth: 1480,
              boxShadow: `0 10px 32px rgba(0, 0, 0, 0.55), 0 0 20px ${accent}18`,
              fontFamily: 'Inter, "Noto Sans TC", system-ui, sans-serif',
            }}
          >
            <div>
              {renderHighlightedSubtitle(
                activeSubtitleText.length > 130
                  ? `${activeSubtitleText.slice(0, 128)}...`
                  : activeSubtitleText
              )}
            </div>
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 3,
                backgroundColor: 'rgba(148, 163, 184, 0.16)',
              }}
            >
              <div
                style={{
                  width: `${Math.round(cueProgress * 100)}%`,
                  height: '100%',
                  backgroundColor: accent,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Bottom 10-Min Master Progress Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 6,
          backgroundColor: 'rgba(30, 41, 59, 0.8)',
          zIndex: 30,
        }}
      >
        <div
          style={{
            width: `${progressPct}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${meta.secondaryColor}, ${accent})`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
