import JSZip from 'jszip';
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
  included: {
    editableProject: true;
    captions: true;
    renderedVideo: boolean;
  };
}

export async function buildProjectExportZip(params: {
  project: TrainingProject;
  renderedVideo?: Blob;
  latestRender?: RenderedVideoRecord;
}): Promise<Blob> {
  const { project, renderedVideo, latestRender } = params;
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
    included: {
      editableProject: true,
      captions: true,
      renderedVideo: Boolean(renderedVideo),
    },
  };
  if (latestRender) {
    zip.file('metadata/render.json', JSON.stringify(latestRender, null, 2));
    manifest.files.push('metadata/render.json');
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
