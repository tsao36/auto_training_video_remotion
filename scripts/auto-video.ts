import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import pdfParse from 'pdf-parse';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { getAudioDurationSec } from '../server/audioDuration';
import { generateVideoPlanWithLlm } from '../server/llmGenerator';
import { loadLocalEnv } from '../server/loadEnv';
import { inspectRenderedMedia } from '../server/mediaQa';
import { parsePptxBuffer } from '../server/pptxParser';
import {
  ContentLanguage,
  DEFAULT_CONTENT_LANGUAGE,
  DOMAIN_META,
  getContentLanguage,
  PptxSlideData,
  SavedProjectRecord,
  SceneSpec,
  TechDomain,
  TrainingProject,
  TtsProvider,
  VIDEO_FPS,
} from '../src/types/training';
import { evaluateProjectQuality } from '../src/utils/qualityLinter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
loadLocalEnv(ROOT_DIR);
const AUDIO_DIR = path.join(ROOT_DIR, 'public', 'audio');
const PPTX_MEDIA_DIR = path.join(ROOT_DIR, 'public', 'pptx-media');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const PREVIEW_STILLS_DIR = path.join(OUTPUT_DIR, 'previews');
const PROJECTS_DIR = path.join(ROOT_DIR, 'projects');

fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(PPTX_MEDIA_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(PREVIEW_STILLS_DIR, { recursive: true });
fs.mkdirSync(PROJECTS_DIR, { recursive: true });

interface CliOptions {
  input?: string;
  topic?: string;
  domain: TechDomain | 'auto';
  duration: number;
  language: ContentLanguage;
  tts: TtsProvider;
  out?: string;
  skipTts: boolean;
  skipPreviews: boolean;
  skipRender: boolean;
  strict: boolean;
  help: boolean;
}

function printUsage() {
  console.log(`
Remotion Technical Training — Automated Video Pipeline

Usage:
  npm run train:auto -- [options]

Options:
  --input <path>        Input file (.pptx, .pdf, .md, .txt, or saved project .json)
  --topic <text>        Topic title (required if --input is not provided)
  --domain <domain>     auto | debug-logic | wifi | bluetooth | rf  (default: auto)
  --duration <sec>      Target duration in seconds           (default: 120)
  --language <lang>     zh-TW | en-US | zh-CN | ja-JP | ko-KR (default: zh-TW)
  --tts <provider>      openformosa | ming-3.0 | browser-fallback (default: openformosa)
  --out <path.mp4>      Output MP4 path                      (default: output/<id>.mp4)
  --skip-tts            Skip TTS synthesis
  --skip-previews       Skip per-scene midpoint PNG preview generation
  --skip-render         Stop before MP4 rendering (validate + TTS + previews only)
  --strict              Fail immediately if Quality Linter reports any blocking errors
  -h, --help            Show this help message

Examples:
  npm run train:auto -- --input slides/wifi7-mlo.pptx --domain wifi --duration 180
  npm run train:auto -- --topic "PCIe Gen5 Link Training Debug" --domain debug-logic --duration 90
  npm run train:auto -- --input projects/proj-123.json --skip-tts --skip-render
`);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    domain: 'auto',
    duration: 120,
    language: DEFAULT_CONTENT_LANGUAGE,
    tts: 'openformosa',
    skipTts: false,
    skipPreviews: false,
    skipRender: false,
    strict: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (arg === '--input' && argv[i + 1]) {
      opts.input = argv[++i];
    } else if (arg === '--topic' && argv[i + 1]) {
      opts.topic = argv[++i];
    } else if (arg === '--domain' && argv[i + 1]) {
      const d = argv[++i];
      if (d === 'auto' || ['debug-logic', 'wifi', 'bluetooth', 'rf'].includes(d)) {
        opts.domain = d as TechDomain | 'auto';
      }
    } else if (arg === '--duration' && argv[i + 1]) {
      opts.duration = Math.max(15, Number(argv[++i]) || 120);
    } else if (arg === '--language' && argv[i + 1]) {
      opts.language = getContentLanguage(argv[++i]).value;
    } else if (arg === '--tts' && argv[i + 1]) {
      const p = argv[++i] as TtsProvider;
      if (['openformosa', 'ming-3.0', 'browser-fallback'].includes(p)) opts.tts = p;
    } else if (arg === '--out' && argv[i + 1]) {
      opts.out = argv[++i];
    } else if (arg === '--skip-tts') {
      opts.skipTts = true;
    } else if (arg === '--skip-previews') {
      opts.skipPreviews = true;
    } else if (arg === '--skip-render') {
      opts.skipRender = true;
    } else if (arg === '--strict') {
      opts.strict = true;
    } else if (!arg.startsWith('-') && !opts.input) {
      opts.input = arg;
    }
  }

  return opts;
}

async function synthesizeSceneAudio(
  scene: SceneSpec,
  language: ContentLanguage,
  provider: TtsProvider
): Promise<{ audioUrl: string; durationSec: number; mode: string }> {
  const text = (scene.script || '').trim();
  const safeId = (scene.id || `scene-${scene.index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '');
  const hash = crypto
    .createHash('sha1')
    .update(`${provider}|${language}|${scene.tts.voiceId}|${scene.tts.speed}|${text}`)
    .digest('hex')
    .slice(0, 14);

  if (provider === 'openformosa' && (language === 'zh-TW' || language === 'en-US')) {
    const openformosaUrl = process.env.OPENFORMOSA_URL || 'http://127.0.0.1:8001/v1/tts';
    try {
      const resp = await fetch(openformosaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'OpenFormosa/BlueMagpie-TTS',
          voice: scene.tts.voiceId || 'hung_yi_lee',
          input: text,
          speed: scene.tts.speed || 1.0,
          response_format: 'wav',
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        const fileName = `${safeId}-${hash}.wav`;
        fs.writeFileSync(path.join(AUDIO_DIR, fileName), buf);
        const dur = getAudioDurationSec(buf, 'wav') ?? scene.durationSeconds;
        return { audioUrl: `/audio/${fileName}`, durationSec: dur, mode: 'openformosa' };
      }
    } catch {
      // Fallback to Edge neural TTS below
    }
  }

  const mp3FileName = `tts-${hash}.mp3`;
  const mp3Path = path.join(AUDIO_DIR, mp3FileName);
  if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 512) {
    const buf = fs.readFileSync(mp3Path);
    const dur = getAudioDurationSec(buf, 'mp3') ?? scene.durationSeconds;
    return { audioUrl: `/audio/${mp3FileName}`, durationSec: dur, mode: 'cached' };
  }

  const edgeVoice = getContentLanguage(language).edgeVoice;
  const tts = new MsEdgeTTS();
  await tts.setMetadata(edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const speed = scene.tts.speed || 1.0;
  const ratePct = Math.round((speed - 1) * 100);
  const rateStr = ratePct >= 0 ? `+${ratePct}%` : `${ratePct}%`;
  const sanitizedText = text.replace(/</g, ' ').replace(/>/g, ' ').trim() || '請輸入旁白內容';
  const { audioStream } = tts.toStream(sanitizedText, { rate: rateStr });
  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const audioBuf = Buffer.concat(chunks);
  fs.writeFileSync(mp3Path, audioBuf);
  const dur = getAudioDurationSec(audioBuf, 'mp3') ?? scene.durationSeconds;
  return { audioUrl: `/audio/${mp3FileName}`, durationSec: dur, mode: 'edge-neural' };
}

async function startAssetServer(): Promise<{ server: http.Server; baseUrl: string }> {
  const app = express();
  app.use('/audio', express.static(AUDIO_DIR));
  app.use('/pptx-media', express.static(PPTX_MEDIA_DIR));
  app.use('/output', express.static(OUTPUT_DIR));

  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to bind ephemeral asset server'));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
    server.on('error', reject);
  });
}

function planToProject(
  result: Awaited<ReturnType<typeof generateVideoPlanWithLlm>>,
  opts: CliOptions,
  extras: {
    topic: string;
    rawText: string;
    sourceType: TrainingProject['sourceType'];
    sourceFileName?: string;
  }
): TrainingProject {
  const meta = DOMAIN_META[result.domain];
  console.log(
    `      計畫來源：${result.mode}（${meta.shortLabel} / ${result.domainSource}）${result.note ? ` ${result.note}` : ''}`
  );
  if (result.domainReason) console.log(`      領域判斷：${result.domainReason}`);
  return {
    id: `proj-${Date.now()}`,
    title: result.title,
    subtitle: result.subtitle || meta.description,
    language: opts.language,
    topic: extras.topic,
    domain: result.domain,
    targetDurationSeconds: opts.duration,
    fps: VIDEO_FPS,
    width: 1920,
    height: 1080,
    sourceType: extras.sourceType,
    sourceFileName: extras.sourceFileName,
    rawSourceText: extras.rawText,
    ttsConfig: {
      defaultProvider: opts.tts === 'ming-3.0' ? 'ming-3.0' : 'openformosa',
      openformosa: {
        baseUrl: 'http://127.0.0.1:8001/v1/tts',
        apiKey: '',
        model: 'OpenFormosa/BlueMagpie-TTS',
        voice: 'hung_yi_lee',
      },
      mingTts: {
        baseUrl: 'http://localhost:8000/v1/tts',
        apiKey: '',
        model: 'inclusionAI/Ming-3.0-tts',
        speaker: 'ming-tech-zh-en',
        style: 'professional-training',
      },
    },
    scenes: result.scenes,
  };
}

async function loadOrBuildProject(opts: CliOptions): Promise<TrainingProject> {
  if (opts.input) {
    const absInput = path.resolve(opts.input);
    if (!fs.existsSync(absInput)) {
      throw new Error(`找不到輸入檔案：${absInput}`);
    }
    const ext = path.extname(absInput).toLowerCase();
    const baseName = path.basename(absInput, ext);

    if (ext === '.json') {
      const parsed = JSON.parse(fs.readFileSync(absInput, 'utf8')) as
        | SavedProjectRecord
        | TrainingProject;
      const proj = 'project' in parsed && parsed.project ? parsed.project : (parsed as TrainingProject);
      if (!proj || !Array.isArray(proj.scenes)) {
        throw new Error('JSON 檔案不是有效的 TrainingProject 或 SavedProjectRecord 格式');
      }
      console.log(`[1/6] 已載入現有專案 JSON：${proj.title} (${proj.scenes.length} 幕)`);
      return proj;
    }

    let rawText = '';
    let pptxSlides: PptxSlideData[] | undefined;
    let topic = opts.topic || baseName;

    if (ext === '.pptx') {
      console.log(`[1/6] 解析 PowerPoint：${absInput}`);
      const parsedPptx = await parsePptxBuffer(
        fs.readFileSync(absInput),
        path.basename(absInput),
        PPTX_MEDIA_DIR
      );
      topic = opts.topic || parsedPptx.title || baseName;
      rawText = parsedPptx.rawText;
      pptxSlides = parsedPptx.slides;
    } else if (ext === '.pdf') {
      console.log(`[1/6] 解析 PDF：${absInput}`);
      const parsedPdf = await pdfParse(fs.readFileSync(absInput));
      rawText = parsedPdf.text || '';
    } else {
      console.log(`[1/6] 讀取文字檔：${absInput}`);
      rawText = fs.readFileSync(absInput, 'utf8');
    }

    console.log(`[1/6] 產生課程腳本與 Remotion 場景（主題：${topic}，語言：${opts.language}）...`);
    const result = await generateVideoPlanWithLlm({
      topic,
      durationSeconds: opts.duration,
      domain: opts.domain,
      rawText,
      pptxSlides,
      defaultTtsProvider: opts.tts,
      language: opts.language,
    });
    const sourceType: TrainingProject['sourceType'] =
      ext === '.pptx' ? 'pptx' : ext === '.pdf' ? 'pdf' : 'research-text';
    return planToProject(result, opts, {
      topic,
      rawText,
      sourceType,
      sourceFileName: path.basename(absInput),
    });
  }

  if (!opts.topic) {
    throw new Error('請提供 --input <檔案> 或 --topic "<主題>"（執行 --help 查看說明）');
  }

  console.log(`[1/6] 依主題產生課程計畫：${opts.topic}（領域：${opts.domain}，時長：${opts.duration}s）...`);
  const result = await generateVideoPlanWithLlm({
    topic: opts.topic,
    durationSeconds: opts.duration,
    domain: opts.domain,
    defaultTtsProvider: opts.tts,
    language: opts.language,
  });
  return planToProject(result, opts, {
    topic: opts.topic,
    rawText: '',
    sourceType: 'topic-llm',
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  const project = await loadOrBuildProject(opts);

  // Stage 2: Batch TTS synthesis
  if (!opts.skipTts) {
    console.log(`[2/6] 開始批次合成語音（共 ${project.scenes.length} 幕，引擎：${opts.tts}）...`);
    for (let i = 0; i < project.scenes.length; i++) {
      const scene = project.scenes[i];
      if (!scene.script?.trim()) continue;
      if (scene.tts.status === 'ready' && scene.tts.audioUrl) {
        console.log(`      #${i + 1} 已有音軌，略過`);
        continue;
      }
      const res = await synthesizeSceneAudio(
        scene,
        project.language || opts.language,
        opts.tts
      );
      scene.tts = {
        ...scene.tts,
        provider: opts.tts,
        status: 'ready',
        audioUrl: res.audioUrl,
        actualDurationSec: res.durationSec,
      };
      scene.durationSeconds = Math.max(3, Math.ceil(res.durationSec + 0.5));
      console.log(`      #${i + 1} ${scene.title} → ${res.mode} (${res.durationSec.toFixed(1)}s)`);
    }
  } else {
    console.log('[2/6] 已略過語音合成 (--skip-tts)');
  }

  // Stage 3: Quality Linter
  console.log('[3/6] 執行品質檢查 (Quality Linter)...');
  const report = evaluateProjectQuality(project, { requireAudio: !opts.skipTts });
  for (const issue of report.issues) {
    const loc = typeof issue.sceneIndex === 'number' ? ` [Scene ${issue.sceneIndex + 1}]` : '';
    console.log(`      ${issue.level.toUpperCase()} [${issue.code}]${loc} ${issue.message}`);
  }
  console.log(
    `      結果：${report.errorCount} 錯誤 / ${report.warningCount} 警告 / ${report.infoCount} 提示`
  );
  if (opts.strict && !report.passed) {
    throw new Error('品質檢查未通過 (--strict 模式已中止)');
  }

  // Persist project JSON so it is immediately accessible in the Webapp dashboard
  const safeId = project.id.replace(/[^a-zA-Z0-9_-]/g, '') || `auto-${Date.now()}`;
  project.id = safeId;
  const projectFilePath = path.join(PROJECTS_DIR, `${safeId}.json`);
  const now = new Date().toISOString();
  const savedRecord: SavedProjectRecord = {
    id: safeId,
    createdAt: now,
    updatedAt: now,
    renders: [],
    project,
  };
  fs.writeFileSync(projectFilePath, JSON.stringify(savedRecord, null, 2), 'utf8');
  console.log(`      已儲存專案檔：${projectFilePath}`);

  if (opts.skipPreviews && opts.skipRender) {
    console.log('已完成驗證與專案儲存（已略過預覽與算圖）。');
    return;
  }

  // Stage 4 & 5: Bundle Remotion once + render midpoint stills + render MP4
  const { server, baseUrl } = await startAssetServer();
  try {
    console.log('[4/6] 打包 Remotion 專案...');
    const entry = path.join(ROOT_DIR, 'src', 'remotion', 'index.ts');
    const bundleLocation = await bundle({ entryPoint: entry });
    const inputProps = {
      projectTitle: project.title,
      scenes: project.scenes,
      audioBaseUrl: baseUrl,
    };
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'TechTrainingVideo',
      inputProps,
    });

    if (!opts.skipPreviews) {
      const previewDir = path.join(PREVIEW_STILLS_DIR, safeId);
      fs.mkdirSync(previewDir, { recursive: true });
      console.log(`[4/6] 產出逐場景中點 PNG 預覽 → ${previewDir}`);
      let cursor = 0;
      for (let i = 0; i < project.scenes.length; i++) {
        const scene = project.scenes[i];
        const frames = Math.max(30, Math.round((Number(scene.durationSeconds) || 5) * VIDEO_FPS));
        const midpoint = cursor + Math.floor(frames / 2);
        cursor += frames;
        const safeSceneId = (scene.id || `scene-${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '');
        const outPng = path.join(previewDir, `${String(i + 1).padStart(2, '0')}-${safeSceneId}.png`);
        await renderStill({
          composition,
          serveUrl: bundleLocation,
          output: outPng,
          frame: midpoint,
          inputProps,
          imageFormat: 'png',
        });
      }
      console.log(`      已產出 ${project.scenes.length} 張場景預覽圖`);
    } else {
      console.log('[4/6] 已略過逐場景靜態預覽 (--skip-previews)');
    }

    if (opts.skipRender) {
      console.log('[5/6] 已略過 MP4 算圖 (--skip-render)');
      return;
    }

    const outputPath = path.resolve(opts.out || path.join(OUTPUT_DIR, `${safeId}.mp4`));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    console.log(`[5/6] 開始算圖 H.264 MP4 → ${outputPath}`);
    let lastPct = -1;
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps,
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 10) * 10;
        if (pct > lastPct) {
          lastPct = pct;
          console.log(`      算圖進度：${pct}%`);
        }
      },
    });

    // Stage 6: Post-render Audio QA
    console.log('[6/6] 執行渲染後音訊驗證 (Audio QA)...');
    const expectAudio = project.scenes.some(
      (s) => Boolean(s.tts?.audioUrl && s.tts?.status === 'ready')
    );
    const mediaQa = inspectRenderedMedia(outputPath, { expectAudio });
    console.log(`      ${mediaQa.summary}`);

    const totalSec = project.scenes.reduce((sum, s) => sum + (Number(s.durationSeconds) || 0), 0);
    savedRecord.renders.unshift({
      jobId: safeId,
      outputUrl: `/output/${path.basename(outputPath)}`,
      renderedAt: new Date().toISOString(),
      durationSeconds: totalSec,
      sceneCount: project.scenes.length,
      mediaQa,
    });
    fs.writeFileSync(projectFilePath, JSON.stringify(savedRecord, null, 2), 'utf8');

    if (!mediaQa.passed) {
      throw new Error(`Audio QA 未通過：${mediaQa.summary}`);
    }
    console.log(`\n完成！影片已輸出並通過驗證：${outputPath}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((err) => {
  console.error('\n[train:auto 失敗]', err instanceof Error ? err.message : err);
  process.exit(1);
});
