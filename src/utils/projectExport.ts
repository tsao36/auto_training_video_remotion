import type { RenderedVideoRecord, TrainingProject } from '../types/training';
import { generateProjectCaptions, serializeCaptions } from './captions';

export interface ProjectExportManifest {
  formatVersion: 1;
  exportedAt: string;
  project: {
    id: string;
    title: string;
    sceneCount: number;
    durationSeconds: number;
  };
  files: string[];
  assets: Array<{ originalUrl: string; archivePath: string; bytes: number }>;
  included: {
    editableProject: true;
    captions: true;
    renderedVideo: boolean;
    assets: boolean;
  };
}

const LOCAL_ASSET_PREFIXES = ['/audio/', '/music/', '/pptx-media/'] as const;

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

export async function buildProjectExportZip(params: {
  project: TrainingProject;
  renderedVideo?: Blob;
  latestRender?: RenderedVideoRecord;
}): Promise<Blob> {
  const { project, renderedVideo, latestRender } = params;
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const captions = generateProjectCaptions(project.scenes);
  const exportProject: TrainingProject = {
    ...project,
    llmConfig: project.llmConfig ? { ...project.llmConfig, apiKey: '' } : undefined,
    ttsConfig: {
      ...project.ttsConfig,
      openformosa: { ...project.ttsConfig.openformosa, apiKey: '' },
      mingTts: { ...project.ttsConfig.mingTts, apiKey: '' },
    },
  };
  const projectJson = JSON.stringify(exportProject, null, 2);
  const srt = serializeCaptions(captions, 'srt');
  const vtt = serializeCaptions(captions, 'vtt');
  const files = ['project.json', 'captions/project.srt', 'captions/project.vtt'];

  zip.file('project.json', projectJson);
  zip.file('captions/project.srt', srt);
  zip.file('captions/project.vtt', vtt);

  const assetRecords: ProjectExportManifest['assets'] = [];
  for (const [index, assetUrl] of [...collectLocalAssetUrls(exportProject)].entries()) {
    const response = await fetch(assetUrl);
    if (!response.ok) throw new Error(`Unable to package referenced asset: ${assetUrl}`);
    const blob = await response.blob();
    const prefix = assetUrl.startsWith('/audio/') ? 'audio' : assetUrl.startsWith('/music/') ? 'music' : 'pptx-media';
    const originalName = assetUrl.split('/').pop() || `asset-${index}`;
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const archivePath = `assets/${prefix}/${String(index + 1).padStart(3, '0')}-${safeName}`;
    zip.file(archivePath, blob);
    files.push(archivePath);
    assetRecords.push({ originalUrl: assetUrl, archivePath, bytes: blob.size });
  }

  if (renderedVideo) {
    zip.file('video/project.mp4', renderedVideo);
    files.push('video/project.mp4');
  }

  const manifest: ProjectExportManifest = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      title: project.title,
      sceneCount: project.scenes.length,
      durationSeconds: project.scenes.reduce((sum, scene) =>
        sum + (scene.tts?.actualDurationSec && scene.tts.actualDurationSec > 0
          ? scene.tts.actualDurationSec
          : scene.durationSeconds), 0),
    },
    files: [...files, 'manifest.json'],
    assets: assetRecords,
    included: {
      editableProject: true,
      captions: true,
      renderedVideo: Boolean(renderedVideo),
      assets: assetRecords.length > 0,
    },
  };
  if (latestRender) {
    zip.file('metadata/render.json', JSON.stringify(latestRender, null, 2));
    manifest.files.push('metadata/render.json');
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
