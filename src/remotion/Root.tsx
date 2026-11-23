import React from 'react';
import { Composition } from 'remotion';
import { TARGET_TOTAL_FRAMES, VIDEO_FPS } from '../types/training';
import { createEmptyProject } from '../utils/planGenerator';
import { TechTrainingVideo, TechTrainingVideoProps } from './TechTrainingVideo';

const defaultProject = createEmptyProject('debug-logic');

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="TechTrainingVideo"
      component={TechTrainingVideo as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={TARGET_TOTAL_FRAMES}
      fps={VIDEO_FPS}
      width={1920}
      height={1080}
      defaultProps={{
        projectTitle: defaultProject.title,
        scenes: defaultProject.scenes,
        audioBaseUrl: '',
      }}
      calculateMetadata={({ props }) => {
        const typed = props as unknown as TechTrainingVideoProps;
        const totalSec = (typed.scenes || []).reduce((sum, scene) => {
          const actualDuration = scene.tts?.actualDurationSec;
          const effectiveDuration = actualDuration && actualDuration > 0
            ? actualDuration
            : scene.durationSeconds || 0;
          return sum + effectiveDuration;
        }, 0);
        return {
          durationInFrames: Math.max(VIDEO_FPS, Math.round((totalSec || 600) * VIDEO_FPS)),
          fps: VIDEO_FPS,
          width: 1920,
          height: 1080,
        };
      }}
    />
  );
};
