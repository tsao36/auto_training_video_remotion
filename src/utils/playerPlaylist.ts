import {
  DOMAIN_META,
  RenderedVideoRecord,
  SavedProjectSummary,
  SceneSpec,
  VIDEO_FPS,
} from '../types/training';

export type PlayerFilterMode = 'all' | 'rendered' | 'draft';

export function filterPlaylistProjects(
  projects: SavedProjectSummary[],
  filter: PlayerFilterMode,
  query: string
): SavedProjectSummary[] {
  const q = query.trim().toLowerCase();
  return projects.filter((p) => {
    const hasRender = p.renders.length > 0;
    if (filter === 'rendered' && !hasRender) return false;
    if (filter === 'draft' && hasRender) return false;
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      p.subtitle.toLowerCase().includes(q) ||
      (DOMAIN_META[p.domain]?.shortLabel.toLowerCase().includes(q) ?? false)
    );
  });
}

export function getPreferredRender(project: SavedProjectSummary): RenderedVideoRecord | null {
  if (!project.renders || project.renders.length === 0) return null;
  return project.renders.find((r) => !r.isPreview) || project.renders[0] || null;
}

export function getDisplayFileName(
  project: SavedProjectSummary,
  activeRender: RenderedVideoRecord | null
): string {
  if (activeRender?.outputUrl) {
    const clean = activeRender.outputUrl.split(/[?#]/)[0] || '';
    const last = clean.split('/').filter(Boolean).pop();
    if (last) {
      try {
        return decodeURIComponent(last);
      } catch {
        return last;
      }
    }
  }
  return `${project.id}.json`;
}

export function getNextProjectId(
  playlist: SavedProjectSummary[],
  currentId: string | null,
  loop: boolean
): string | null {
  if (playlist.length === 0) return null;
  const idx = currentId ? playlist.findIndex((p) => p.id === currentId) : -1;
  if (idx === -1) return playlist[0].id;
  if (idx + 1 < playlist.length) return playlist[idx + 1].id;
  return loop ? playlist[0].id : null;
}

export function getPrevProjectId(
  playlist: SavedProjectSummary[],
  currentId: string | null,
  loop: boolean
): string | null {
  if (playlist.length === 0) return null;
  const idx = currentId ? playlist.findIndex((p) => p.id === currentId) : -1;
  if (idx === -1) return playlist[0].id;
  if (idx - 1 >= 0) return playlist[idx - 1].id;
  return loop ? playlist[playlist.length - 1].id : null;
}

export function getSceneStartFrames(scenes: Pick<SceneSpec, 'durationSeconds'>[], fps = VIDEO_FPS): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const s of scenes) {
    starts.push(acc);
    acc += Math.max(1, Math.round(s.durationSeconds * fps));
  }
  return starts;
}

export function getSceneIndexAtFrame(
  scenes: Pick<SceneSpec, 'durationSeconds'>[],
  frame: number,
  fps = VIDEO_FPS
): number {
  if (scenes.length === 0) return 0;
  const clampedFrame = Math.max(0, frame);
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) {
    acc += Math.max(1, Math.round(scenes[i].durationSeconds * fps));
    if (clampedFrame < acc) return i;
  }
  return scenes.length - 1;
}
