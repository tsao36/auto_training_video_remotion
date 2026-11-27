import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from './planGenerator';
import { buildProjectExportZip } from './projectExport';

describe('buildProjectExportZip', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('packages editable project data, captions, media assets, and an honest manifest', async () => {
    const project = createEmptyProject('debug-logic');
    project.title = 'Export Test';
    project.llmConfig = { provider: 'openai-compatible', baseUrl: 'https://api.example.com/v1', apiKey: 'secret-key', model: 'test-model' };
    project.ttsConfig.openformosa.apiKey = 'secret-tts-key';
    project.scenes = [{
      ...(createEmptyProject('debug-logic').scenes[0] || {}),
      script: 'First lesson sentence.',
      durationSeconds: 6,
      tts: {
        provider: 'openformosa', voiceId: 'voice', speed: 1, status: 'ready',
        audioUrl: '/audio/voice.wav',
      },
    } as any];
    project.backgroundMusic = { url: '/music/bed.mp3', fileName: 'bed.mp3', volume: 0.12, loop: true };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(url.endsWith('voice.wav') ? 'voice' : 'music', { status: 200 })));

    const blob = await buildProjectExportZip({ project });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    const projectJson = JSON.parse(await zip.file('project.json')!.async('string'));

    expect(projectJson.title).toBe('Export Test');
    expect(projectJson.llmConfig.apiKey).toBe('');
    expect(projectJson.ttsConfig.openformosa.apiKey).toBe('');
    expect(JSON.stringify(projectJson)).not.toContain('secret-key');
    expect(zip.file('captions/project.srt')).not.toBeNull();
    expect(zip.file('captions/project.vtt')).not.toBeNull();
    expect(zip.file('video/project.mp4')).toBeNull();
    expect(manifest.assets).toHaveLength(2);
    expect(manifest.assets.every((asset: { archivePath: string }) => zip.file(asset.archivePath))).toBe(true);
    expect(manifest.included).toEqual({ editableProject: true, captions: true, renderedVideo: false, assets: true });
    expect(manifest.files).toEqual(expect.arrayContaining(['project.json', 'captions/project.srt', 'captions/project.vtt', 'manifest.json']));
  });
});
