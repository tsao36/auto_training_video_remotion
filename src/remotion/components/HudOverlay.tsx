import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { DOMAIN_META, SceneSpec, VideoCaptionStyle } from '../../types/training';
import { getActiveSentenceCue } from '../../utils/sentenceEffects';

interface HudOverlayProps {
  projectTitle: string;
  scene: SceneSpec;
  totalScenes: number;
  globalFrame: number;
  totalFrames: number;
  captionStyle?: Partial<VideoCaptionStyle>;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  projectTitle,
  scene,
  totalScenes,
  globalFrame,
  totalFrames,
  captionStyle,
}) => {
  const { fps } = useVideoConfig();
  const localFrame = useCurrentFrame();
  const meta = DOMAIN_META[scene.domain];
  const accent = scene.animation.accentColor || meta.accentColor;
  const captionFontSize = Math.min(52, Math.max(18, captionStyle?.fontSize ?? 24));
  const captionFontWeight = captionStyle?.fontWeight ?? 500;
  const captionBottomOffset = Math.min(180, Math.max(20, captionStyle?.bottomOffset ?? 36));
  const captionMaxWidth = Math.min(1800, Math.max(720, captionStyle?.maxWidth ?? 1480));
  const captionBackgroundOpacity = Math.min(1, Math.max(0.45, captionStyle?.backgroundOpacity ?? 0.9));

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

  const isPptxSlide = scene.template === 'pptx-slide' && Boolean(scene.pptxSlide);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: isPptxSlide ? 20 : undefined }}>
      {/* Tech Grid Background (hidden on 1:1 PowerPoint slides) */}
      {!isPptxSlide && (
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
      )}

      {/* Ambient Radial Glow (hidden on 1:1 PowerPoint slides) */}
      {!isPptxSlide && (
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
      )}

      {/* Top HUD Bar (hidden on 1:1 PowerPoint slides so slide content is 100% unobstructed) */}
      {!isPptxSlide && scene.animation.showProgressHud && (
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

      {/* Packet-Traffic Effect Overlay (Device A -> Device B multi-channel mini simulator on any template) */}
      {!isPptxSlide && scene.template !== 'packet-simulator' && activeCue.effect === 'packet-traffic' && (
        <div
          style={{
            position: 'absolute',
            left: 110,
            right: 110,
            bottom: scene.animation.showSubtitles && activeSubtitleText ? 128 : 42,
            zIndex: 18,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 1280,
              borderRadius: 14,
              backgroundColor: 'rgba(9, 14, 28, 0.90)',
              border: `1.5px solid ${accent}66`,
              padding: '10px 18px',
              display: 'grid',
              gridTemplateColumns: '150px 1fr 150px',
              gap: 14,
              alignItems: 'center',
              boxShadow: `0 8px 28px rgba(0, 0, 0, 0.5), 0 0 18px ${accent}22`,
              fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: accent, boxShadow: `0 0 10px ${accent}` }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: '#F8FAFC' }}>DEVICE A</div>
                <div style={{ fontSize: 10, color: '#94A3B8' }}>TX / AP</div>
              </div>
            </div>

            <svg viewBox="0 0 880 54" style={{ width: '100%', height: 52, overflow: 'visible' }}>
              {[
                { label: 'CH1 2.4G', y: 11, color: '#F59E0B', offset: 0 },
                { label: 'CH36 5G', y: 27, color: '#38BDF8', offset: 0.34 },
                { label: 'CH69 6G', y: 43, color: '#34D399', offset: 0.67 },
              ].map((ch, idx) => {
                const cycle = ((localFrame * 0.022 + ch.offset) % 1);
                const px = 92 + cycle * 760;
                const pktSeq = Math.floor(localFrame * 0.022 + ch.offset) * 3 + idx + 1;
                return (
                  <g key={ch.label}>
                    <text x={0} y={ch.y + 4} fill={ch.color} fontSize={10} fontWeight={800}>
                      {ch.label}
                    </text>
                    <line x1={82} y1={ch.y} x2={868} y2={ch.y} stroke={`${ch.color}44`} strokeWidth={2} strokeDasharray="4 4" />
                    <line x1={Math.max(82, px - 42)} y1={ch.y} x2={px} y2={ch.y} stroke={ch.color} strokeWidth={3.5} opacity={0.5} />
                    <rect x={px - 28} y={ch.y - 7} width={56} height={14} rx={5} fill="#0F172A" stroke={ch.color} strokeWidth={1.8} />
                    <text x={px} y={ch.y + 3.5} textAnchor="middle" fill="#F8FAFC" fontSize={8.5} fontWeight={800}>
                      PKT #{pktSeq}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: '#34D399' }}>DEVICE B</div>
                <div style={{ fontSize: 10, color: '#94A3B8' }}>RX / STA</div>
              </div>
              <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: '#34D399', boxShadow: '0 0 10px #34D399' }} />
            </div>
          </div>
        </div>
      )}

      {/* Synchronized Narration Subtitle Bar (Per-Beat Dynamic) */}
      {scene.animation.showSubtitles && activeSubtitleText && (
        <div
          style={{
            position: 'absolute',
            bottom: captionBottomOffset,
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
              backgroundColor: `rgba(7, 11, 20, ${captionBackgroundOpacity})`,
              border: `1px solid ${accent}44`,
              borderRadius: 14,
              padding: '14px 30px 18px',
              color: '#F1F5F9',
              fontSize: captionFontSize,
              fontWeight: captionFontWeight,
              lineHeight: 1.45,
              textAlign: 'center',
              maxWidth: captionMaxWidth,
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
