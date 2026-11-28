import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

async function main() {
const projectId = process.argv[2] || 'proj-1795680751445';
const root = process.cwd();
const record = JSON.parse(
  fs.readFileSync(path.join(root, 'projects', `${projectId}.json`), 'utf8')
) as { project: { title: string; scenes: unknown[]; captionStyle?: unknown; videoTheme?: string; technicalTermsWhitelist?: { terms: string[] } } };
const auditDir = process.argv[3]
  ? path.resolve(root, process.argv[3])
  : path.join(root, 'output', 'frame-audit', projectId, `run-${Date.now()}`);
fs.mkdirSync(auditDir, { recursive: true });

const serveUrl = await bundle({
  entryPoint: path.join(root, 'src', 'remotion', 'index.ts'),
  webpackOverride: (current) => ({
    ...current,
    resolve: {
      ...current.resolve,
      alias: {
        ...current.resolve?.alias,
        '@': path.join(root, 'src'),
      },
    },
  }),
});
const browserExecutable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let totalFrames = 0;
const renderScene = async (index: number) => {
  const scene = record.project.scenes[index] as { id: string; durationSeconds: number };
  const outputLocation = path.join(auditDir, `scene-${String(index + 1).padStart(3, '0')}.mp4`);
  if (fs.existsSync(outputLocation) && fs.statSync(outputLocation).size > 0) {
    totalFrames += Math.round(scene.durationSeconds * 30);
    console.log(`Skipped completed ${outputLocation}`);
    return;
  }
  const inputProps = {
    projectTitle: record.project.title,
    scenes: [{ ...scene, index: 0 }],
    audioBaseUrl: '',
    captionStyle: record.project.captionStyle,
    videoTheme: record.project.videoTheme,
    technicalTermsWhitelist: record.project.technicalTermsWhitelist?.terms ?? [],
  };
  const composition = await selectComposition({
    serveUrl,
    id: 'TechTrainingVideo',
    inputProps,
    browserExecutable,
    chromeMode: 'chrome-for-testing',
  });
  await renderMedia({
    composition,
    serveUrl,
    outputLocation,
    inputProps,
    codec: 'h264',
    scale: 0.1,
    muted: true,
    browserExecutable,
    chromeMode: 'chrome-for-testing',
    logLevel: 'error',
    onProgress: ({ progress }) => {
      process.stdout.write(`\rScene ${index + 1}/${record.project.scenes.length} ${Math.round(progress * 100)}%`);
    },
  });
  totalFrames += composition.durationInFrames;
  console.log(`\nRendered ${outputLocation}`);
};

for (let index = 0; index < record.project.scenes.length; index += 8) {
  await Promise.all(Array.from(
    { length: Math.min(8, record.project.scenes.length - index) },
    (_, offset) => renderScene(index + offset)
  ));
}

console.log(`\nauditDirectory=${auditDir}`);
console.log(`durationFrames=${totalFrames}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
