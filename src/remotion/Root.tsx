import React from 'react';
import { Composition } from 'remotion';
import { TARGET_TOTAL_FRAMES, VIDEO_FPS } from '../types/training';
import { createPresetProject } from '../utils/planGenerator';
import { TechTrainingVideo, TechTrainingVideoProps } from './TechTrainingVideo';

const defaultPreset = createPresetProject('debug-logic');

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
        projectTitle: defaultPreset.title,
        scenes: defaultPreset.scenes,
        audioBaseUrl: '',
      }}
      calculateMetadata={({ props }) => {
        const typed = props as unknown as TechTrainingVideoProps;
        const totalSec = (typed.scenes || []).reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
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
