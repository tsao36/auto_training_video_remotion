import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRevealTarget } from './revealFile';

const OUTPUT_DIR = path.resolve('output');
const PROJECTS_DIR = path.resolve('projects');

describe('resolveRevealTarget', () => {
  it('resolves valid output MP4 urls inside outputDir', () => {
    const res = resolveRevealTarget({
      kind: 'output',
      outputUrl: '/output/wifi-training-123.mp4',
      outputDir: OUTPUT_DIR,
      projectsDir: PROJECTS_DIR,
    });
    expect(res.filePath).toBe(path.join(OUTPUT_DIR, 'wifi-training-123.mp4'));
    expect(res.fileName).toBe('wifi-training-123.mp4');
  });

  it('decodes URI-encoded output filenames and strips query strings', () => {
    const res = resolveRevealTarget({
      kind: 'output',
      outputUrl: '/output/my%20video.mp4?t=123',
      outputDir: OUTPUT_DIR,
      projectsDir: PROJECTS_DIR,
    });
    expect(res.fileName).toBe('my video.mp4');
  });

  it('rejects path traversal attempts for output files', () => {
    expect(() =>
      resolveRevealTarget({
        kind: 'output',
        outputUrl: '/output/../../secret.txt',
        outputDir: OUTPUT_DIR,
        projectsDir: PROJECTS_DIR,
      })
    ).toThrow();
  });

  it('resolves valid project draft json inside projectsDir', () => {
    const res = resolveRevealTarget({
      kind: 'project',
      projectId: 'proj-1795250643622',
      outputDir: OUTPUT_DIR,
      projectsDir: PROJECTS_DIR,
    });
    expect(res.filePath).toBe(path.join(PROJECTS_DIR, 'proj-1795250643622.json'));
    expect(res.fileName).toBe('proj-1795250643622.json');
  });

  it('rejects empty project id', () => {
    expect(() =>
      resolveRevealTarget({
        kind: 'project',
        projectId: '../..',
        outputDir: OUTPUT_DIR,
        projectsDir: PROJECTS_DIR,
      })
    ).toThrow();
  });
});
