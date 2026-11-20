import cors from 'cors';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { getAudioDurationSec } from './audioDuration';
import { generateVideoPlanWithLlm, regenerateSceneWithLlm } from './llmGenerator';
import { parsePptxBuffer } from './pptxParser';
import { DEFAULT_CONTENT_LANGUAGE, getContentLanguage } from '../src/types/training';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const AUDIO_DIR = path.join(ROOT_DIR, 'public', 'audio');
const PPTX_MEDIA_DIR = path.join(ROOT_DIR, 'public', 'pptx-media');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');

fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(PPTX_MEDIA_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/audio', express.static(AUDIO_DIR));
app.use('/pptx-media', express.static(PPTX_MEDIA_DIR));
app.use('/output', express.static(OUTPUT_DIR));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

interface RenderJob {
  id: string;
  status: 'bundling' | 'rendering' | 'done' | 'error';
  progress: number;
  outputUrl?: string;
  error?: string;
}

const renderJobs = new Map<string, RenderJob>();

function extractXmlText(xml: string): string {
  const matches = xml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) || [];
  return matches
    .map((m) =>
      m
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim()
    )
    .filter(Boolean)
    .join(' ');
}

function createSilentOrToneWav(durationSec: number, filepath: string) {
  const sampleRate = 22050;
  const numSamples = Math.max(sampleRate, Math.round(durationSec * sampleRate));
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Subtle soft chime at start of scene (0.25s) followed by clean silence
  const chimeSamples = Math.min(numSamples, Math.round(0.25 * sampleRate));
  for (let i = 0; i < chimeSamples; i++) {
    const env = Math.sin((i / chimeSamples) * Math.PI);
    const val = Math.sin((2 * Math.PI * 528 * i) / sampleRate) * 0.08 * env;
    buffer.writeInt16LE(Math.round(val * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filepath, buffer);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'remotion-tech-training-api' });
});

// LLM Auto-Generate full video script + matching Remotion graphics & effects
app.post('/api/llm/generate-plan', async (req, res) => {
  try {
    const { topic, durationSeconds, domain, rawText, pptxSlides, defaultTtsProvider, language, llmConfig } = req.body;
    if (!topic || String(topic).trim().length < 2) {
      res.status(400).json({ error: '請輸入影片主題 (topic)' });
      return;
    }
    const result = await generateVideoPlanWithLlm({
      topic: String(topic).trim(),
      durationSeconds: Number(durationSeconds) || 60,
      domain: domain || 'debug-logic',
      rawText,
      pptxSlides,
      defaultTtsProvider: defaultTtsProvider || 'openformosa',
      language: getContentLanguage(language || DEFAULT_CONTENT_LANGUAGE).value,
      llmConfig,
    });
    res.json(result);
  } catch (err) {
    console.error('LLM generate-plan error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate plan' });
  }
});

// LLM Edit Logic: sync Remotion graphics/effects to edited script, or rewrite script without reading graphic
app.post('/api/llm/regenerate-scene', async (req, res) => {
  try {
    const { topic, scene, action, language, llmConfig } = req.body;
    if (!scene) {
      res.status(400).json({ error: 'Missing scene payload' });
      return;
    }
    const result = await regenerateSceneWithLlm({
      topic: topic || scene.title || 'Technical Training',
      scene,
      action: action || 'sync-visual-to-script',
      language: getContentLanguage(language || DEFAULT_CONTENT_LANGUAGE).value,
      llmConfig,
    });
    res.json(result);
  } catch (err) {
    console.error('LLM regenerate-scene error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to regenerate scene' });
  }
});

// Parse PPTX or PDF upload into structured slides
app.post('/api/parse-document', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const baseTitle = path.basename(req.file.originalname, ext);

    if (ext === '.pptx') {
      const parsedPptx = await parsePptxBuffer(req.file.buffer, req.file.originalname, PPTX_MEDIA_DIR);
      res.json({
        title: parsedPptx.title,
        slides: parsedPptx.slides,
        rawText: parsedPptx.rawText,
        isPptx: true,
      });
      return;
    }

    if (ext === '.pdf') {
      const parsed = await pdfParse(req.file.buffer);
      const rawText = parsed.text || '';
      const chunks = rawText
        .split(/\n{2,}/)
        .map((c) => c.trim())
        .filter((c) => c.length > 20);

      const slides = chunks.slice(0, 10).map((chunk, i) => {
        const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
        return {
          title: lines[0]?.slice(0, 64) || `PDF Section ${i + 1}`,
          body: lines.slice(1).join(' ') || lines[0] || '',
        };
      });

      res.json({ title: baseTitle, slides, rawText });
      return;
    }

    res.status(400).json({ error: 'Unsupported file type. Please upload .pptx or .pdf' });
  } catch (err) {
    console.error('Parse error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to parse document' });
  }
});

// Synthesize TTS using OpenFormosa or Ming-3.0-TTS (with local WAV fallback for offline preview)
app.post('/api/tts/synthesize', async (req, res) => {
  try {
    const {
      sceneId,
      text,
      provider,
      voiceId,
      language = DEFAULT_CONTENT_LANGUAGE,
      speed = 1.0,
      durationSeconds = 60,
      openformosa,
      mingTts,
    } = req.body as {
      sceneId: string;
      text: string;
      provider: 'openformosa' | 'ming-3.0' | 'browser-fallback';
      voiceId?: string;
      language?: string;
      speed?: number;
      durationSeconds?: number;
      openformosa?: { baseUrl?: string; apiKey?: string; model?: string; voice?: string };
      mingTts?: { baseUrl?: string; apiKey?: string; model?: string; speaker?: string; style?: string };
    };

    const ttsLanguage = getContentLanguage(language).value;
    const safeId = (sceneId || `scene-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
    const cacheHash = crypto
      .createHash('sha1')
      .update(`${provider}|${ttsLanguage}|${voiceId || ''}|${speed}|${text || ''}`)
      .digest('hex')
      .slice(0, 14);
    const cachedMp3 = `tts-${cacheHash}.mp3`;
    const cachedMp3Path = path.join(AUDIO_DIR, cachedMp3);
    if (fs.existsSync(cachedMp3Path) && fs.statSync(cachedMp3Path).size > 512) {
      const cachedBuf = fs.readFileSync(cachedMp3Path);
      const measuredDuration = getAudioDurationSec(cachedBuf, 'mp3') ?? durationSeconds;
      res.json({
        ok: true,
        mode: 'cached',
        note: '使用快取語音音軌',
        audioUrl: `/audio/${cachedMp3}`,
        durationSec: measuredDuration,
      });
      return;
    }

    const wavFileName = `${safeId}-${cacheHash}.wav`;
    const wavFilePath = path.join(AUDIO_DIR, wavFileName);
    const mp3FileName = cachedMp3;
    const mp3FilePath = cachedMp3Path;

    let finalFileName = wavFileName;
    let mode: 'openformosa' | 'ming-3.0' | 'neural-fallback' | 'local-fallback' = 'local-fallback';
    let note = '';

    if (
      provider === 'openformosa' &&
      openformosa?.baseUrl &&
      (ttsLanguage === 'zh-TW' || ttsLanguage === 'en-US')
    ) {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (openformosa.apiKey) headers.Authorization = `Bearer ${openformosa.apiKey}`;
        const resp = await fetch(openformosa.baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: openformosa.model || 'formosa-tts-v1',
            voice: voiceId || openformosa.voice || 'formosa-pro-tw',
            input: text,
            speed,
            response_format: 'wav',
          }),
        });
        if (resp.ok) {
          const arr = Buffer.from(await resp.arrayBuffer());
          fs.writeFileSync(wavFilePath, arr);
          mode = 'openformosa';
        } else {
          note = `OpenFormosa HTTP ${resp.status} — 已使用神經網路語音合成`;
        }
      } catch (e) {
        note = `OpenFormosa 無法連線 (${e instanceof Error ? e.message : 'network'}) — 已使用神經網路語音合成`;
      }
    } else if (provider === 'ming-3.0' && mingTts?.baseUrl) {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (mingTts.apiKey) headers.Authorization = `Bearer ${mingTts.apiKey}`;
        const resp = await fetch(mingTts.baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: mingTts.model || 'inclusionAI/Ming-3.0-tts',
            text,
            speaker: voiceId || mingTts.speaker || 'ming-tech-zh-en',
            style: mingTts.style || 'professional-training',
            language: ttsLanguage,
            speed,
          }),
        });
        if (resp.ok) {
          const arr = Buffer.from(await resp.arrayBuffer());
          fs.writeFileSync(wavFilePath, arr);
          mode = 'ming-3.0';
        } else {
          note = `Ming-3.0-TTS HTTP ${resp.status} — 已使用神經網路語音合成`;
        }
      } catch (e) {
        note = `Ming-3.0-TTS 本地端點未啟動 — 已使用神經網路語音合成`;
      }
    } else {
      note =
        provider === 'openformosa'
          ? ttsLanguage === 'zh-TW' || ttsLanguage === 'en-US'
            ? 'OpenFormosa API 未設定或無法連線，已切換至所選語言的神經網路語音'
            : 'OpenFormosa 不支援此語言，已切換至對應的神經網路語音'
          : 'Ming-3.0-TTS 本地端點未連線，已切換至所選語言的神經網路語音';
    }

    if (mode === 'local-fallback') {
      try {
        const edgeVoice = getContentLanguage(ttsLanguage).edgeVoice;
        const tts = new MsEdgeTTS();
        await tts.setMetadata(edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const ratePct = Math.round((speed - 1) * 100);
        const rateStr = ratePct >= 0 ? `+${ratePct}%` : `${ratePct}%`;
        const sanitizedText = (text || '')
          .replace(/</g, ' ')
          .replace(/>/g, ' ')
          .trim() || '請輸入旁白內容';
        const { audioStream } = tts.toStream(sanitizedText, { rate: rateStr });
        const chunks: Buffer[] = [];
        for await (const chunk of audioStream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const audioBuf = Buffer.concat(chunks);
        if (audioBuf.length > 0) {
          fs.writeFileSync(mp3FilePath, audioBuf);
          finalFileName = mp3FileName;
          mode = 'neural-fallback';
        } else {
          throw new Error('Empty audio stream');
        }
      } catch (edgeErr) {
        console.warn('Neural TTS fallback failed, using local silent WAV:', edgeErr);
        const wordCount = Math.max(10, text.length);
        const estDuration = Math.min(durationSeconds, Math.max(5, Math.round(wordCount / 5)));
        createSilentOrToneWav(estDuration, wavFilePath);
        note += ' (離線模式：已生成靜音時序軌)';
      }
    }

    const finalFilePath = path.join(AUDIO_DIR, finalFileName);
    let measuredDuration = durationSeconds;
    if (fs.existsSync(finalFilePath)) {
      const finalBuf = fs.readFileSync(finalFilePath);
      measuredDuration =
        getAudioDurationSec(finalBuf, path.extname(finalFileName)) ?? durationSeconds;
    }

    res.json({
      ok: true,
      mode,
      note,
      audioUrl: `/audio/${finalFileName}`,
      durationSec: measuredDuration,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'TTS synthesis failed' });
  }
});

// Start Remotion MP4 Render Job
app.post('/api/render', async (req, res) => {
  try {
    const { projectTitle, scenes, previewOnlySceneIndex } = req.body as {
      projectTitle: string;
      scenes: unknown[];
      previewOnlySceneIndex?: number;
    };

    const jobId = `render-${Date.now()}`;
    renderJobs.set(jobId, { id: jobId, status: 'bundling', progress: 0 });
    res.json({ jobId });

    // Run async render in background
    (async () => {
      try {
        const entry = path.join(ROOT_DIR, 'src', 'remotion', 'index.ts');
        const bundleLocation = await bundle({
          entryPoint: entry,
          onProgress: (p) => {
            const job = renderJobs.get(jobId);
            if (job) job.progress = Math.round(p * 20);
          },
        });

        const selectedScenes =
          typeof previewOnlySceneIndex === 'number' && scenes[previewOnlySceneIndex]
            ? [scenes[previewOnlySceneIndex]]
            : scenes;

        const inputProps = {
          projectTitle,
          scenes: selectedScenes,
          audioBaseUrl: 'http://localhost:3001',
        };

        const composition = await selectComposition({
          serveUrl: bundleLocation,
          id: 'TechTrainingVideo',
          inputProps,
        });

        const outFile = `${jobId}.mp4`;
        const outputLocation = path.join(OUTPUT_DIR, outFile);

        renderJobs.set(jobId, { id: jobId, status: 'rendering', progress: 20 });

        await renderMedia({
          composition,
          serveUrl: bundleLocation,
          codec: 'h264',
          outputLocation,
          inputProps,
          onProgress: ({ progress }) => {
            const job = renderJobs.get(jobId);
            if (job) job.progress = 20 + Math.round(progress * 80);
          },
        });

        renderJobs.set(jobId, {
          id: jobId,
          status: 'done',
          progress: 100,
          outputUrl: `/output/${outFile}`,
        });
      } catch (err) {
        console.error('Remotion render failed:', err);
        renderJobs.set(jobId, {
          id: jobId,
          status: 'error',
          progress: 0,
          error: err instanceof Error ? err.message : 'Render failed',
        });
      }
    })();
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to start render' });
  }
});

app.get('/api/render/:jobId', (req, res) => {
  const job = renderJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Remotion Tech Training API running at http://localhost:${PORT}`);
});
