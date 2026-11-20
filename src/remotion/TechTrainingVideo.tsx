import React from 'react';
import { AbsoluteFill, Audio, Series, useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneSpec } from '../types/training';
import { HudOverlay } from './components/HudOverlay';
import { SceneRenderer } from './scenes/SceneRenderer';

export interface TechTrainingVideoProps {
  projectTitle: string;
  scenes: SceneSpec[];
  audioBaseUrl?: string;
}

export const TechTrainingVideo: React.FC<TechTrainingVideoProps> = ({
  projectTitle,
  scenes,
  audioBaseUrl = '',
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const globalFrame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: '#070B14' }}>
      <Series>
        {scenes.map((scene) => {
          const sceneFrames = Math.max(30, Math.round(scene.durationSeconds * fps));
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
