import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Series, useCurrentFrame, useVideoConfig } from 'remotion';
import { BackgroundMusicConfig, SceneSpec, VideoCaptionStyle, VideoThemeId } from '../types/training';
import { generateCaptionsFromScript } from '../utils/captions';
import { getVideoTheme, getVideoThemeStyle } from '../utils/videoThemes';
import { HudOverlay } from './components/HudOverlay';
import { ScenePrimitiveLayer } from './components/ScenePrimitiveLayer';
import {
  CAPTION_BAND_HEIGHT,
  getSceneStageStyle,
} from './lib/scene-layout-policy';
import { SceneRenderer } from './scenes/SceneRenderer';

export interface TechTrainingVideoProps {
  projectTitle: string;
  scenes: SceneSpec[];
  audioBaseUrl?: string;
  captionStyle?: Partial<VideoCaptionStyle>;
  videoTheme?: VideoThemeId;
  backgroundMusic?: BackgroundMusicConfig;
  technicalTermsWhitelist?: string[];
}

export const TechTrainingVideo: React.FC<TechTrainingVideoProps> = ({
  projectTitle,
  scenes,
  audioBaseUrl = '',
  captionStyle,
  videoTheme,
  backgroundMusic,
  technicalTermsWhitelist,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const globalFrame = useCurrentFrame();
  const approvedTechnicalTerms = technicalTermsWhitelist ?? [];
  const resolvedMusicUrl = backgroundMusic?.url
    ? backgroundMusic.url.startsWith('http')
      ? backgroundMusic.url
      : `${audioBaseUrl}${backgroundMusic.url}`
    : undefined;
  const normalizedScenes = useMemo(() => scenes.map((scene) => {
    const effectiveDuration = scene.tts.actualDurationSec && scene.tts.actualDurationSec > 0
      ? scene.tts.actualDurationSec
      : scene.durationSeconds;
    return {
      ...scene,
      captions: scene.captions?.length
        ? scene.captions
        : generateCaptionsFromScript(scene.script, effectiveDuration),
    };
  }), [fps, scenes]);

  return (
    <AbsoluteFill style={getVideoThemeStyle(videoTheme, globalFrame)}>
      <Series>
        {normalizedScenes.map((scene) => {
          const effectiveDuration = scene.tts.actualDurationSec && scene.tts.actualDurationSec > 0
            ? scene.tts.actualDurationSec
            : scene.durationSeconds;
          const sceneFrames = Math.max(30, Math.round(effectiveDuration * fps));
          const resolvedAudio =
            scene.tts.audioUrl && scene.tts.status === 'ready'
              ? scene.tts.audioUrl.startsWith('http')
                ? scene.tts.audioUrl
                : `${audioBaseUrl}${scene.tts.audioUrl}`
              : undefined;

          return (
            <Series.Sequence key={scene.id} durationInFrames={sceneFrames}>
              <AbsoluteFill>
                <div
                  style={{
                    position: 'absolute',
                    inset: `0 0 ${CAPTION_BAND_HEIGHT}px 0`,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={getSceneStageStyle()}
                  >
                    <SceneRenderer
                      scene={scene}
                      assetBaseUrl={audioBaseUrl}
                      videoTheme={videoTheme}
                      technicalTermsWhitelist={approvedTechnicalTerms}
                    />
                    <ScenePrimitiveLayer
                      scene={scene}
                      accentColor={scene.animation.accentColor || getVideoTheme(videoTheme).accentColor}
                      audioUrl={resolvedAudio}
                    />
                  </div>
                </div>
                <HudOverlay
                  projectTitle={projectTitle}
                  scene={scene}
                  totalScenes={scenes.length}
                  globalFrame={globalFrame}
                  totalFrames={durationInFrames}
                  captionStyle={captionStyle}
                  videoTheme={videoTheme}
                  technicalTermsWhitelist={approvedTechnicalTerms}
                />
                {resolvedAudio && <Audio src={resolvedAudio} />}
              </AbsoluteFill>
            </Series.Sequence>
          );
        })}
      </Series>
      {resolvedMusicUrl && (
        <Audio
          src={resolvedMusicUrl}
          loop={backgroundMusic?.loop ?? true}
          volume={Math.max(0, Math.min(1, backgroundMusic?.volume ?? 0.12))}
        />
      )}
    </AbsoluteFill>
  );
};
