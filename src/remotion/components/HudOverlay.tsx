import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { DOMAIN_META, SceneSpec, VideoCaptionStyle, VideoThemeId } from '../../types/training';
import {
  getActiveCaption,
  getTimedTechnicalTerms,
  shouldUsePoppingTechnicalTerms,
} from '../../utils/captions';
import { getActiveSentenceCue } from '../../utils/sentenceEffects';
import { getVideoTheme } from '../../utils/videoThemes';
import { CAPTION_BAND_HEIGHT } from '../lib/caption-layout';
import { PoppingTechnicalText } from '../primitives/popping-technical-text';
import { TechnicalTermOverlay } from '../primitives/technical-term-overlay';

interface HudOverlayProps {
  projectTitle: string;
  scene: SceneSpec;
  totalScenes: number;
  globalFrame: number;
  totalFrames: number;
  captionStyle?: Partial<VideoCaptionStyle>;
  videoTheme?: VideoThemeId;
  technicalTermsWhitelist?: string[];
}

const ThemeLayoutFrame: React.FC<{ themeId?: VideoThemeId }> = ({ themeId }) => {
  const { width, height } = useVideoConfig();
  const theme = getVideoTheme(themeId);

  if (theme.layout === 'instrument-dock') {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, opacity: 0.42 }}>
        <path d={`M70 150 V70 H160 M${width - 70} 150 V70 H${width - 160} M70 ${height - 150} V${height - 70} H160 M${width - 70} ${height - 150} V${height - 70} H${width - 160}`} fill="none" stroke={theme.accentColor} strokeWidth={2} />
        <line x1={70} x2={width - 70} y1={112} y2={112} stroke={theme.panelBorder} />
      </svg>
    );
  }

  if (theme.layout === 'drafting-sheet') {
    return (
      <div style={{ position: 'absolute', inset: 0, opacity: 0.46 }}>
        <div style={{ position: 'absolute', left: 78, top: 86, bottom: 110, width: 1, background: theme.accentColor }} />
        <div style={{ position: 'absolute', left: 48, top: 118, bottom: 140, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: theme.accentColor, fontFamily: theme.labelFontFamily, fontSize: 13 }}>
          {['00', '20', '40', '60', '80'].map((tick) => <span key={tick}>{tick}</span>)}
        </div>
        <div style={{ position: 'absolute', right: 52, bottom: 94, padding: '7px 12px', border: `1px solid ${theme.panelBorder}`, color: theme.accentColor, fontFamily: theme.labelFontFamily, fontSize: 12 }}>{theme.patternLabel}</div>
      </div>
    );
  }

  if (theme.layout === 'split-console') {
    return (
      <div style={{ position: 'absolute', inset: 0, opacity: 0.38 }}>
        <div style={{ position: 'absolute', left: 58, top: 90, bottom: 116, width: 116, borderRight: `1px solid ${theme.panelBorder}` }}>
          <div style={{ height: 92, borderBottom: `1px solid ${theme.panelBorder}` }} />
          <div style={{ margin: '22px 14px', height: 6, background: theme.secondaryAccent }} />
          <div style={{ margin: '12px 14px', height: 1, background: theme.panelBorder }} />
          <div style={{ margin: '12px 14px', height: 1, width: '56%', background: theme.panelBorder }} />
        </div>
        <div style={{ position: 'absolute', right: 50, top: 102, width: 220, height: 2, background: theme.accentColor }} />
      </div>
    );
  }

  if (theme.layout === 'flow-canvas') {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, opacity: 0.16 }}>
        <ellipse cx={width * 0.2} cy={height * 0.7} rx={width * 0.28} ry={height * 0.16} fill="none" stroke={theme.accentColor} strokeWidth={2} transform={`rotate(-12 ${width * 0.2} ${height * 0.7})`} />
        <ellipse cx={width * 0.78} cy={height * 0.34} rx={width * 0.24} ry={height * 0.13} fill="none" stroke={theme.secondaryAccent} strokeWidth={2} transform={`rotate(14 ${width * 0.78} ${height * 0.34})`} />
      </svg>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: 0.38 }}>
      <div style={{ position: 'absolute', left: 104, top: 78, bottom: 104, width: 2, background: theme.secondaryAccent }} />
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} style={{ position: 'absolute', left: 88, top: 160 + index * 154, width: 34, height: 1, background: theme.accentColor }} />
      ))}
      <div style={{ position: 'absolute', left: 86, bottom: 98, color: theme.accentColor, fontFamily: theme.labelFontFamily, fontSize: 12, rotate: '-90deg', transformOrigin: 'left bottom' }}>{theme.patternLabel}</div>
    </div>
  );
};

const ThemeMotionLayer: React.FC<{ themeId?: VideoThemeId }> = ({ themeId }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const theme = getVideoTheme(themeId);
  const scanFrame = frame % 240;
  const scanX = interpolate(scanFrame, [0, 240], [-width * 0.12, width * 1.12], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const scanOpacity = interpolate(scanFrame, [0, 16, 180, 240], [0, 0.18, 0.18, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (theme.motion === 'grid-scan') {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            insetBlock: 0,
            left: scanX,
            width: 2,
            background: theme.accentColor,
            boxShadow: `0 0 34px ${theme.accentColor}`,
            opacity: scanOpacity,
          }}
        />
      </div>
    );
  }

  if (theme.motion === 'drafting-reticle') {
    const reticleX = interpolate(frame % 300, [0, 150, 300], [width * 0.2, width * 0.76, width * 0.2], {
      easing: Easing.inOut(Easing.sin),
    });
    const reticleY = interpolate(frame % 300, [0, 150, 300], [height * 0.66, height * 0.28, height * 0.66], {
      easing: Easing.inOut(Easing.sin),
    });
    return (
      <div
        style={{
          position: 'absolute',
          left: reticleX,
          top: reticleY,
          width: 120,
          height: 120,
          border: `1px solid ${theme.accentColor}`,
          borderRadius: '50%',
          opacity: 0.16,
          translate: '-50% -50%',
          rotate: `${frame % 360}deg`,
        }}
      >
        <span style={{ position: 'absolute', left: '50%', top: -28, width: 1, height: 176, background: theme.accentColor }} />
        <span style={{ position: 'absolute', top: '50%', left: -28, width: 176, height: 1, background: theme.accentColor }} />
      </div>
    );
  }

  if (theme.motion === 'carbon-sweep') {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            top: -height * 0.25,
            bottom: -height * 0.25,
            left: scanX - 420,
            width: 420,
            rotate: '18deg',
            background: `linear-gradient(90deg, transparent, ${theme.accentColor}14 45%, ${theme.accentColor}28 50%, transparent)`,
            opacity: scanOpacity * 0.9,
          }}
        />
      </div>
    );
  }

  if (theme.motion === 'aurora-flow') {
    const flowX = interpolate(frame % 360, [0, 360], [-width * 0.22, width * 0.22], {
      easing: Easing.inOut(Easing.sin),
    });
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.24 }}>
        <div
          style={{
            position: 'absolute',
            top: height * 0.08,
            left: flowX,
            width: width * 0.9,
            height: height * 0.38,
            borderRadius: '50%',
            filter: 'blur(70px)',
            rotate: '-12deg',
            background: `linear-gradient(90deg, transparent, ${theme.accentColor}55, ${theme.secondaryAccent}44, transparent)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: flowX * 0.7,
            bottom: height * 0.06,
            width: width * 0.72,
            height: height * 0.28,
            borderRadius: '50%',
            filter: 'blur(64px)',
            rotate: '8deg',
            background: `linear-gradient(90deg, transparent, ${theme.secondaryAccent}44, ${theme.accentColor}33, transparent)`,
          }}
        />
      </div>
    );
  }

  const traceOffset = interpolate(frame % 180, [0, 180], [-80, 80], {
    easing: Easing.inOut(Easing.sin),
  });
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.15 }}>
      <svg width={width + 160} height={160} viewBox="0 0 2080 160" style={{ position: 'absolute', left: -80 + traceOffset, bottom: height * 0.16 }}>
        <path d="M0 100 L140 100 L190 54 L248 124 L330 100 L520 100 L585 34 L650 130 L728 100 L920 100 L970 74 L1030 116 L1100 100 L1310 100 L1370 44 L1442 126 L1510 100 L1700 100 L1762 68 L1830 114 L1900 100 L2080 100" fill="none" stroke={theme.accentColor} strokeWidth={3} />
        <circle cx="585" cy="34" r="7" fill={theme.secondaryAccent} />
        <circle cx="1370" cy="44" r="7" fill={theme.secondaryAccent} />
      </svg>
    </div>
  );
};

export const HudOverlay: React.FC<HudOverlayProps> = ({
  projectTitle,
  scene,
  totalScenes,
  globalFrame,
  totalFrames,
  captionStyle,
  videoTheme,
  technicalTermsWhitelist,
}) => {
  const { fps } = useVideoConfig();
  const localFrame = useCurrentFrame();
  const meta = DOMAIN_META[scene.domain];
  const theme = getVideoTheme(videoTheme);
  const accent = scene.animation.accentColor || meta.accentColor;
  const captionFontSize = Math.min(44, Math.max(24, captionStyle?.fontSize ?? 36));
  const captionFontWeight = captionStyle?.fontWeight ?? 600;
  const captionBottomOffset = Math.min(20, Math.max(12, captionStyle?.bottomOffset ?? 16));
  const captionMaxWidth = Math.min(1800, Math.max(720, captionStyle?.maxWidth ?? 1480));
  const captionBackgroundOpacity = Math.min(1, Math.max(0.45, captionStyle?.backgroundOpacity ?? 0.9));

  const currentSec = Math.floor(globalFrame / fps);
  const totalSec = Math.floor(totalFrames / fps);
  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const progressPct = Math.min(100, Math.max(0, (globalFrame / Math.max(1, totalFrames)) * 100));

  // Beat-synchronized subtitle computation
  const effectiveDurationSec =
    scene.tts?.actualDurationSec && scene.tts.actualDurationSec > 0
      ? scene.tts.actualDurationSec
      : scene.durationSeconds;
  const sceneTotalFrames = Math.max(30, Math.round(effectiveDurationSec * fps));
  const sceneProgress = Math.min(1, localFrame / sceneTotalFrames);
  const { cue: activeCue, cueProgress } = getActiveSentenceCue(
    scene.sentenceCues,
    sceneProgress,
    scene.script,
    scene.template,
    scene.animation.effect || 'signal-pulse'
  );
  const currentMs = (localFrame / fps) * 1000;
  const activeCaption = getActiveCaption(scene.captions || [], currentMs);
  const poppingTermsEnabled = shouldUsePoppingTechnicalTerms(scene);
  const timedTechnicalTerms = poppingTermsEnabled
    ? getTimedTechnicalTerms(scene.captions || [], currentMs, technicalTermsWhitelist)
    : [];
  const cueStartFrame = activeCaption
    ? Math.round((activeCaption.startMs / 1000) * fps)
    : Math.round(activeCue.startRatio * sceneTotalFrames);
  const activeSubtitleText = activeCaption?.text.trim() || activeCue.sentences[0]?.trim() || scene.script;
  const visibleSubtitleText = activeSubtitleText;
  const sentenceLocalFrame = Math.max(0, localFrame - cueStartFrame);
  const subSpring = spring({
    frame: sentenceLocalFrame,
    fps,
    config: { damping: 18, stiffness: 220, mass: 0.6 },
  });
  const subY = interpolate(subSpring, [0, 1], [14, 0]);
  const subOpacity = interpolate(sentenceLocalFrame, [0, 6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const visibleCueProgress = activeCaption
    ? Math.min(1, Math.max(0, (currentMs - activeCaption.startMs) / Math.max(1, activeCaption.endMs - activeCaption.startMs)))
    : cueProgress;

  const isPptxSlide = scene.template === 'pptx-slide' && Boolean(scene.pptxSlide);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: isPptxSlide ? 20 : undefined }}>
      {!isPptxSlide && <ThemeLayoutFrame themeId={videoTheme} />}
      {!isPptxSlide && <ThemeMotionLayer themeId={videoTheme} />}

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
            background: `radial-gradient(circle, ${theme.accentColor}26 0%, transparent 70%)`,
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
            fontFamily: theme.labelFontFamily,
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
              backgroundColor: theme.hudSurface,
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
              backgroundColor: theme.hudSurface,
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

      {/* Packet-Traffic Effect Overlay (only for wireless domains on non-occluding templates) */}
      {!isPptxSlide &&
        (scene.domain === 'wifi' || scene.domain === 'bluetooth' || scene.domain === 'rf') &&
        scene.template !== 'packet-simulator' &&
        scene.template !== 'kpi-metrics' &&
        scene.template !== 'fault-tree' &&
        scene.template !== 'debug-checklist' &&
        scene.template !== 'summary-takeaways' &&
        activeCue.effect === 'packet-traffic' && (
        <div
          style={{
            position: 'absolute',
            left: 110,
            right: 110,
            bottom: CAPTION_BAND_HEIGHT + 24,
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
              fontFamily: theme.labelFontFamily,
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

      <TechnicalTermOverlay
        captions={scene.captions || []}
        accentColor={accent}
        enabled={poppingTermsEnabled}
        allowedTerms={technicalTermsWhitelist}
      />

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: CAPTION_BAND_HEIGHT,
          zIndex: 19,
          background: `linear-gradient(180deg, ${theme.backgroundColor}F2 0%, ${theme.backgroundColor} 38%)`,
          borderTop: `1px solid ${accent}33`,
          boxShadow: `0 -12px 32px ${theme.backgroundColor}99`,
        }}
      />

      {/* Synchronized Narration Subtitle Bar (Per-Beat Dynamic) */}
      {scene.animation.showSubtitles && activeSubtitleText && (
        <div
          style={{
            position: 'absolute',
            bottom: captionBottomOffset,
            left: 58,
            right: 58,
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
              backgroundColor: theme.captionSurface.replace(/\.[0-9]+\)/, `.${Math.round(captionBackgroundOpacity * 100)})`),
              border: `1px solid ${accent}44`,
              borderRadius: 8,
              padding: '10px 26px 12px',
              color: '#F1F5F9',
              fontSize: captionFontSize,
              fontWeight: captionFontWeight,
              lineHeight: 1.45,
              textAlign: 'center',
              maxWidth: captionMaxWidth,
              boxShadow: `0 10px 32px rgba(0, 0, 0, 0.55), 0 0 20px ${accent}18`,
              fontFamily: theme.titleFontFamily,
            }}
          >
            <div>
              <PoppingTechnicalText
                text={visibleSubtitleText}
                terms={timedTechnicalTerms}
                currentMs={currentMs}
                fps={fps}
                accentColor={accent}
                inactiveColor="#F1F5F9"
              />
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
                  width: `${Math.round(visibleCueProgress * 100)}%`,
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
