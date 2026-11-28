import React from 'react';
import { Composition } from 'remotion';
import { TARGET_TOTAL_FRAMES, VIDEO_FPS } from '../types/training';
import { createEmptyProject } from '../utils/planGenerator';
import { TechTrainingVideo, TechTrainingVideoProps } from './TechTrainingVideo';
import { DataStory } from '../compositions/data-story';
import { BrowserFlow } from '../compositions/browser-flow';

const defaultProject = createEmptyProject('debug-logic');

export const RemotionRoot: React.FC = () => {
  return (
    <>
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
        videoTheme: defaultProject.videoTheme,
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
    <Composition
      id="DataStory"
      component={DataStory}
      durationInFrames={420}
      fps={VIDEO_FPS}
      width={1920}
      height={1080}
      defaultProps={{
        title: 'Wi-Fi 性能資料故事',
        subtitle: '把量測結果轉成可掃描的工程敘事',
        barData: [
          { label: 'Baseline', value: 100 },
          { label: 'NPCA', value: 125 },
          { label: 'Optimized', value: 138 },
        ],
        metrics: [
          { label: 'Throughput', value: 125, suffix: ' Mbps', delta: '+25%', trend: [88, 96, 101, 112, 125] },
          { label: 'Collision risk', value: 6, suffix: '%', delta: '-8%', trend: [14, 12, 10, 8, 6] },
          { label: 'Sync window', value: 3, suffix: ' ms', delta: '+1 ms', trend: [2, 2, 2.4, 2.8, 3] },
        ],
        steps: [
          { title: 'Detect', description: '確認主頻道受阻' },
          { title: 'Sense', description: '評估非主頻道空閒' },
          { title: 'Grant', description: 'AP 授權指定 STA' },
        ],
      }}
    />
    <Composition
      id="BrowserFlow"
      component={BrowserFlow}
      durationInFrames={168}
      fps={VIDEO_FPS}
      width={1920}
      height={1080}
      defaultProps={{
        url: 'remotionui.com/docs/components',
        title: 'Remotion 元素瀏覽流程',
      }}
    />
    </>
  );
};
