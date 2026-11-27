import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import type { TrainingProject } from '../src/types/training';

interface ImportManifest {
  formatVersion: number;
  assets?: Array<{ originalUrl: string; archivePath: string; bytes: number }>;
}

const LOCAL_ASSET_PREFIXES = ['/audio/', '/music/', '/pptx-media/'] as const;
const MAX_ENTRIES = 250;
const MAX_EXTRACTED_BYTES = 500 * 1024 * 1024;
const MAX_JSON_BYTES = 10 * 1024 * 1024;
const MAX_SCENES = 500;
const SAFE_ARCHIVE_PATH = /^assets\/(audio|music|pptx-media)\/[a-zA-Z0-9._-]+$/;

function collectLocalAssetUrls(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === 'string' && LOCAL_ASSET_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    found.add(value.split(/[?#]/)[0]);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectLocalAssetUrls(item, found));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectLocalAssetUrls(item, found));
  }
  return found;
}

function rewriteAssetUrls(value: unknown, mapping: Map<string, string>): unknown {
  if (typeof value === 'string') {
    const base = value.split(/[?#]/)[0];
    const replacement = mapping.get(base);
    return replacement || value;
  }
  if (Array.isArray(value)) return value.map((item) => rewriteAssetUrls(item, mapping));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteAssetUrls(item, mapping)]));
  }
  return value;
}

function assertValidProject(value: unknown): asserts value is TrainingProject {
  if (!value || typeof value !== 'object') throw new Error('Package project.json is not an object.');
  const project = value as Partial<TrainingProject>;
  if (typeof project.title !== 'string' || !Array.isArray(project.scenes) || project.scenes.length === 0) {
    throw new Error('Package project.json is missing a title or scenes.');
  }
  if (!project.ttsConfig || typeof project.targetDurationSeconds !== 'number' ||
      typeof project.width !== 'number' || typeof project.height !== 'number') {
    throw new Error('Package project.json is missing required render settings.');
  }
  if (project.scenes.length > MAX_SCENES || project.width !== 1920 || project.height !== 1080 ||
      !Number.isFinite(project.targetDurationSeconds) || project.targetDurationSeconds < 1 ||
      project.targetDurationSeconds > 3600) {
    throw new Error('Package project settings exceed supported limits.');
  }
  project.scenes.forEach((scene, index) => {
    if (!scene || typeof scene.id !== 'string' || typeof scene.title !== 'string' ||
        typeof scene.script !== 'string' || !Number.isFinite(scene.durationSeconds) ||
        scene.durationSeconds < 1 || scene.durationSeconds > 600 || !scene.tts || !scene.animation) {
      throw new Error(`Package scene ${index + 1} is malformed.`);
    }
  });
}

export async function importProjectPackage(params: {
  buffer: Buffer;
  importedMediaDir: string;
}): Promise<{ project: TrainingProject; assetCount: number }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(params.buffer, { checkCRC32: true });
  } catch {
    throw new Error('The selected file is not a valid project ZIP package.');
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > MAX_ENTRIES) throw new Error(`Project package contains too many files (limit ${MAX_ENTRIES}).`);
  const declaredSize = entries.reduce((sum, entry) => sum + Number((entry as any)._data?.uncompressedSize || 0), 0);
  if (declaredSize > MAX_EXTRACTED_BYTES) throw new Error('Project package expands beyond the 500 MB safety limit.');

  const manifestFile = zip.file('manifest.json');
  const projectFile = zip.file('project.json');
  if (!manifestFile || !projectFile) throw new Error('Package must contain manifest.json and project.json.');
  const manifestSize = Number((manifestFile as any)._data?.uncompressedSize || 0);
  const projectSize = Number((projectFile as any)._data?.uncompressedSize || 0);
  if (manifestSize > MAX_JSON_BYTES || projectSize > MAX_JSON_BYTES) {
    throw new Error('Package JSON exceeds the 10 MB safety limit.');
  }

  let manifest: ImportManifest;
  let project: unknown;
  try {
    const cleanJson = (value: string) => value.replace(/^\uFEFF/, '');
    manifest = JSON.parse(cleanJson(await manifestFile.async('string'))) as ImportManifest;
    project = JSON.parse(cleanJson(await projectFile.async('string')));
  } catch {
    throw new Error('Package manifest or project JSON is invalid.');
  }
  if (manifest.formatVersion !== 1) throw new Error(`Unsupported project package version: ${manifest.formatVersion}.`);
  assertValidProject(project);

  const projectId = `proj-import-${Date.now()}-${crypto.createHash('sha256').update(params.buffer).digest('hex').slice(0, 8)}`;
  const targetRoot = path.join(params.importedMediaDir, projectId);
  const assetMapping = new Map<string, string>();
  const filesCreated: string[] = [];

  try {
    for (const asset of manifest.assets || []) {
      if (!asset || typeof asset.originalUrl !== 'string' || typeof asset.archivePath !== 'string') {
        throw new Error('Package contains an invalid asset mapping.');
      }
      if (!SAFE_ARCHIVE_PATH.test(asset.archivePath) || path.posix.basename(asset.archivePath).startsWith('.')) {
        throw new Error(`Unsafe archive asset path: ${asset.archivePath}`);
      }
      const archiveFile = zip.file(asset.archivePath) || zip.file(asset.archivePath.replaceAll('/', '\\'));
      if (!archiveFile) throw new Error(`Mapped package asset is missing: ${asset.archivePath}`);
      const contents = await archiveFile.async('nodebuffer');
      if (asset.bytes > 100 * 1024 * 1024 || contents.length > 100 * 1024 * 1024) {
        throw new Error(`Package asset exceeds the 100 MB limit: ${asset.archivePath}`);
      }
      const category = asset.archivePath.split('/')[1];
      const fileName = path.posix.basename(asset.archivePath);
      const destinationDir = path.join(targetRoot, category);
      fs.mkdirSync(destinationDir, { recursive: true });
      const destination = path.join(destinationDir, fileName);
      fs.writeFileSync(destination, contents);
      filesCreated.push(destination);
      assetMapping.set(asset.originalUrl.split(/[?#]/)[0], `/imported/${projectId}/${category}/${fileName}`);
    }

    const rewritten = rewriteAssetUrls(project, assetMapping) as TrainingProject;
    const missing = [...collectLocalAssetUrls(rewritten)].filter((url) => !url.startsWith('/imported/'));
    if (missing.length > 0) {
      throw new Error(`Package is missing ${missing.length} referenced asset(s), including ${missing[0]}.`);
    }
    const importedProject: TrainingProject = {
      ...rewritten,
      id: projectId,
      llmConfig: rewritten.llmConfig ? { ...rewritten.llmConfig, apiKey: '' } : undefined,
      ttsConfig: {
        ...rewritten.ttsConfig,
        openformosa: { ...rewritten.ttsConfig.openformosa, apiKey: '' },
        mingTts: { ...rewritten.ttsConfig.mingTts, apiKey: '' },
      },
    };
    return { project: importedProject, assetCount: assetMapping.size };
  } catch (error) {
    filesCreated.forEach((file) => fs.rmSync(file, { force: true }));
    fs.rmSync(targetRoot, { recursive: true, force: true });
    throw error;
  }
}
