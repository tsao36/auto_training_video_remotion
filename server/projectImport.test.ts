import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/utils/planGenerator';
import { importProjectPackage } from './projectImport';

const tempDirs: string[] = [];

function createSceneProject() {
  const project = createEmptyProject('debug-logic');
  project.scenes = [{
    id: 'scene-round-trip', index: 0, title: 'Round trip', subtitle: '', domain: 'debug-logic',
    template: 'title-hero', durationSeconds: 5, keyPoints: ['Portable project'], script: 'This project travels with its assets.',
    tts: { provider: 'openformosa', voiceId: 'voice', speed: 1, status: 'ready', audioUrl: '/audio/voice.wav' },
    animation: { motionStyle: 'step-reveal', accentColor: '#00C2FF', showSubtitles: true, showProgressHud: true },
  }];
  project.backgroundMusic = { url: '/music/bed.mp3', fileName: 'bed.mp3', volume: 0.12, loop: true };
  project.llmConfig = { provider: 'openai-compatible', baseUrl: 'https://api.example.com/v1', apiKey: 'packaged-secret', model: 'test' };
  project.ttsConfig.openformosa.apiKey = 'tts-secret';
  return project;
}

async function makePackage(includeMusic = true) {
  const project = createSceneProject();
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify(project));
  zip.file('assets/audio/voice.wav', 'voice-data');
  if (includeMusic) zip.file('assets/music/bed.mp3', 'music-data');
  zip.file('manifest.json', JSON.stringify({
    formatVersion: 1,
    assets: [
      { originalUrl: '/audio/voice.wav', archivePath: 'assets/audio/voice.wav', bytes: 10 },
      ...(includeMusic ? [{ originalUrl: '/music/bed.mp3', archivePath: 'assets/music/bed.mp3', bytes: 10 }] : []),
    ],
  }));
  return zip.generateAsync({ type: 'nodebuffer' });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('importProjectPackage', () => {
  it('rewrites imported media to project-scoped local URLs', async () => {
    const importedMediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'training-import-'));
    tempDirs.push(importedMediaDir);
    const result = await importProjectPackage({ buffer: await makePackage(), importedMediaDir });

    expect(result.assetCount).toBe(2);
    expect(result.project.llmConfig?.apiKey).toBe('');
    expect(result.project.ttsConfig.openformosa.apiKey).toBe('');
    expect(result.project.scenes[0].tts.audioUrl).toMatch(new RegExp(`^/imported/${result.project.id}/audio/`));
    expect(result.project.backgroundMusic?.url).toMatch(new RegExp(`^/imported/${result.project.id}/music/`));
    expect(fs.existsSync(path.join(importedMediaDir, result.project.id))).toBe(true);
  });

  it('rejects malformed scene payloads', async () => {
    const importedMediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'training-import-'));
    tempDirs.push(importedMediaDir);
    const project = createSceneProject();
    project.scenes[0].durationSeconds = 0;
    project.scenes[0].tts.audioUrl = undefined;
    project.backgroundMusic = undefined;
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project));
    zip.file('manifest.json', JSON.stringify({ formatVersion: 1, assets: [] }));

    await expect(importProjectPackage({
      buffer: await zip.generateAsync({ type: 'nodebuffer' }),
      importedMediaDir,
    })).rejects.toThrow(/scene 1 is malformed/i);
  });

  it('rejects packages with unresolved local media references', async () => {
    const importedMediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'training-import-'));
    tempDirs.push(importedMediaDir);

    await expect(importProjectPackage({ buffer: await makePackage(false), importedMediaDir }))
      .rejects.toThrow(/missing .*referenced asset/i);
    expect(fs.readdirSync(importedMediaDir)).toHaveLength(0);
  });
});
