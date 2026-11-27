import { describe, expect, it } from 'vitest';
import { applyRenderProgress } from './renderState';

describe('applyRenderProgress', () => {
  it('maps renderer progress into the encoding stage', () => {
    const job = { progress: 20 };
    applyRenderProgress(job, 0.5);
    expect(job.progress).toBe(58);
  });

  it('ignores late progress callbacks after cancellation', () => {
    const job = { progress: 35, cancelled: true };
    applyRenderProgress(job, 1);
    expect(job.progress).toBe(35);
  });
});
