export interface RenderProgressState {
  progress: number;
  cancelled?: boolean;
}

export function applyRenderProgress(state: RenderProgressState, progress: number): void {
  if (state.cancelled) return;
  state.progress = 20 + Math.round(Math.max(0, Math.min(1, progress)) * 75);
}
