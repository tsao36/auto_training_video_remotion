import { describe, expect, it } from 'vitest';
import { SavedProjectSummary } from '../types/training';
import {
  filterPlaylistProjects,
  getDisplayFileName,
  getNextProjectId,
  getPreferredRender,
  getPrevProjectId,
  getSceneIndexAtFrame,
  getSceneStartFrames,
} from './playerPlaylist';

const sampleProjects: SavedProjectSummary[] = [
  {
    id: 'p-1',
    title: 'Wi-Fi 7 MLO Architecture',
    subtitle: '802.11be deep dive',
    domain: 'wifi',
    sceneCount: 8,
    totalDurationSeconds: 480,
    updatedAt: '2026-11-20T10:00:00Z',
    latestVideoUrl: '/output/wifi7.mp4',
    latestRenderedAt: '2026-11-20T10:05:00Z',
    renders: [
      {
        jobId: 'j-prev',
        outputUrl: '/output/wifi7-preview.mp4',
        renderedAt: '2026-11-20T10:06:00Z',
        durationSeconds: 30,
        sceneCount: 1,
        isPreview: true,
        previewSceneIndex: 0,
      },
      {
        jobId: 'j-full',
        outputUrl: '/output/wifi7.mp4',
        renderedAt: '2026-11-20T10:05:00Z',
        durationSeconds: 480,
        sceneCount: 8,
      },
    ],
  },
  {
    id: 'p-2',
    title: 'PC Bring-up Debug Draft',
    subtitle: 'Power sequence checklist',
    domain: 'debug-logic',
    sceneCount: 5,
    totalDurationSeconds: 300,
    updatedAt: '2026-11-21T08:00:00Z',
    renders: [],
  },
  {
    id: 'p-3',
    title: 'Bluetooth LE Audio',
    subtitle: 'Isochronous channels',
    domain: 'bluetooth',
    sceneCount: 6,
    totalDurationSeconds: 360,
    updatedAt: '2026-11-21T09:00:00Z',
    renders: [],
  },
];

describe('playerPlaylist utilities', () => {
  it('filters by rendered/draft and search query', () => {
    expect(filterPlaylistProjects(sampleProjects, 'all', '').map((p) => p.id)).toEqual([
      'p-1',
      'p-2',
      'p-3',
    ]);
    expect(filterPlaylistProjects(sampleProjects, 'rendered', '').map((p) => p.id)).toEqual(['p-1']);
    expect(filterPlaylistProjects(sampleProjects, 'draft', '').map((p) => p.id)).toEqual(['p-2', 'p-3']);
    expect(filterPlaylistProjects(sampleProjects, 'all', 'bring-up').map((p) => p.id)).toEqual(['p-2']);
    expect(filterPlaylistProjects(sampleProjects, 'all', 'bluetooth').map((p) => p.id)).toEqual(['p-3']);
  });

  it('prefers full non-preview render over preview render', () => {
    expect(getPreferredRender(sampleProjects[0])?.outputUrl).toBe('/output/wifi7.mp4');
    expect(getPreferredRender(sampleProjects[1])).toBeNull();
  });

  it('extracts display file name for rendered MP4 and draft project', () => {
    expect(getDisplayFileName(sampleProjects[0], getPreferredRender(sampleProjects[0]))).toBe(
      'wifi7.mp4'
    );
    expect(getDisplayFileName(sampleProjects[1], null)).toBe('p-2.json');
  });

  it('navigates next/prev with and without looping', () => {
    expect(getNextProjectId(sampleProjects, 'p-1', false)).toBe('p-2');
    expect(getNextProjectId(sampleProjects, 'p-3', false)).toBeNull();
    expect(getNextProjectId(sampleProjects, 'p-3', true)).toBe('p-1');

    expect(getPrevProjectId(sampleProjects, 'p-2', false)).toBe('p-1');
    expect(getPrevProjectId(sampleProjects, 'p-1', false)).toBeNull();
    expect(getPrevProjectId(sampleProjects, 'p-1', true)).toBe('p-3');
  });

  it('maps frames to scene start frames and active scene index', () => {
    const scenes = [{ durationSeconds: 10 }, { durationSeconds: 20 }, { durationSeconds: 15 }];
    expect(getSceneStartFrames(scenes, 30)).toEqual([0, 300, 900]);
    expect(getSceneIndexAtFrame(scenes, 0, 30)).toBe(0);
    expect(getSceneIndexAtFrame(scenes, 299, 30)).toBe(0);
    expect(getSceneIndexAtFrame(scenes, 300, 30)).toBe(1);
    expect(getSceneIndexAtFrame(scenes, 950, 30)).toBe(2);
    expect(getSceneIndexAtFrame(scenes, 5000, 30)).toBe(2);
  });
});
