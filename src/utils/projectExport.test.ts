import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './planGenerator';
import { buildProjectExportZip } from './projectExport';

describe('buildProjectExportZip', () => {
  it('packages editable project data, captions, and an honest manifest', async () => {
    const project = createEmptyProject('debug-logic');
    project.title = 'Export Test';
    project.llmConfig = { provider: 'openai-compatible', baseUrl: 'https://api.example.com/v1', apiKey: 'secret-key', model: 'test-model' };
    project.ttsConfig.openformosa.apiKey = 'secret-tts-key';
    project.scenes = [{
      ...project.scenes[0],
      script: 'First lesson sentence.',
      durationSeconds: 6,
    }];

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
    expect(manifest.included).toEqual({ editableProject: true, captions: true, renderedVideo: false });
    expect(manifest.files).toEqual(expect.arrayContaining(['project.json', 'captions/project.srt', 'captions/project.vtt', 'manifest.json']));
  });
});
