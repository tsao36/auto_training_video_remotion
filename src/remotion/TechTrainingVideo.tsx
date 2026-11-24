import React from 'react';
import { AbsoluteFill, Audio, Series, useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneSpec, VideoCaptionStyle } from '../types/training';
import { HudOverlay } from './components/HudOverlay';
import { SceneRenderer } from './scenes/SceneRenderer';

export interface TechTrainingVideoProps {
  projectTitle: string;
  scenes: SceneSpec[];
  audioBaseUrl?: string;
  captionStyle?: Partial<VideoCaptionStyle>;
}

export const TechTrainingVideo: React.FC<TechTrainingVideoProps> = ({
  projectTitle,
  scenes,
  audioBaseUrl = '',
  captionStyle,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const globalFrame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: '#070B14' }}>
      <Series>
        {scenes.map((scene) => {
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
                <HudOverlay
                  projectTitle={projectTitle}
                  scene={scene}
                  totalScenes={scenes.length}
                  globalFrame={globalFrame}
                  totalFrames={durationInFrames}
                  captionStyle={captionStyle}
                />
                <SceneRenderer scene={scene} assetBaseUrl={audioBaseUrl} />
                {resolvedAudio && <Audio src={resolvedAudio} />}
              </AbsoluteFill>
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
