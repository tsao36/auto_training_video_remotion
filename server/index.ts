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
import {
  DEFAULT_CONTENT_LANGUAGE,
  getContentLanguage,
  RenderedVideoRecord,
  SavedProjectRecord,
  SavedProjectSummary,
  TrainingProject,
  VoiceProfile,
  VoiceProfileProvider,
} from '../src/types/training';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const AUDIO_DIR = path.join(ROOT_DIR, 'public', 'audio');
const PPTX_MEDIA_DIR = path.join(ROOT_DIR, 'public', 'pptx-media');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const PROJECTS_DIR = path.join(ROOT_DIR, 'projects');
// Not served statically: voice samples are private reference recordings.
const VOICE_SAMPLES_DIR = path.join(ROOT_DIR, 'voice-samples');
const VOICE_SAMPLE_FILE_RE = /^[a-f0-9]{16}\.(wav|mp3|m4a|ogg|webm)$/;

fs.mkdirSync(VOICE_SAMPLES_DIR, { recursive: true });
fs.mkdirSync(AUDIO_DIR, { recursive: true });
fs.mkdirSync(PPTX_MEDIA_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(PROJECTS_DIR, { recursive: true });

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

function sanitizeProjectId(id: string): string {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function getProjectFilePath(id: string): string {
  const safeId = sanitizeProjectId(id);
  if (!safeId) throw new Error('無效的專案 ID');
  return path.join(PROJECTS_DIR, `${safeId}.json`);
}

function readSavedProject(id: string): SavedProjectRecord | null {
  const filePath = getProjectFilePath(id);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as SavedProjectRecord;
}

function writeSavedProject(project: TrainingProject, newRender?: RenderedVideoRecord): SavedProjectRecord {
  const safeId = sanitizeProjectId(project.id);
  if (!safeId) throw new Error('無效的專案 ID');
  const existing = readSavedProject(safeId);
  const now = new Date().toISOString();

  // Strip sensitive API keys if any? Keep structure consistent with existing project files.
  const renders = existing?.renders ? [...existing.renders] : [];
  if (newRender) {
    renders.unshift(newRender);
  }

  const record: SavedProjectRecord = {
    id: safeId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    renders,
    project: {
      ...project,
      id: safeId,
    },
  };

  fs.writeFileSync(getProjectFilePath(safeId), JSON.stringify(record, null, 2), 'utf-8');
  return record;
}

function toProjectSummary(record: SavedProjectRecord): SavedProjectSummary {
  const scenes = record.project.scenes || [];
  const totalDurationSeconds = scenes.reduce((sum, s) => sum + (Number(s.durationSeconds) || 0), 0);
  const renders = record.renders || [];
  const latestFullRender = renders.find((r) => !r.isPreview) || renders[0];

  return {
    id: record.id,
    title: record.project.title || '未命名專案',
    subtitle: record.project.subtitle || '',
    domain: record.project.domain || 'debug-logic',
    sceneCount: scenes.length,
    totalDurationSeconds,
    updatedAt: record.updatedAt,
    latestVideoUrl: latestFullRender?.outputUrl,
    latestRenderedAt: latestFullRender?.renderedAt,
    renders,
  };
}

app.get('/api/projects', (_req, res) => {
  try {
    const files = fs.readdirSync(PROJECTS_DIR).filter((f) => f.endsWith('.json'));
    const summaries: SavedProjectSummary[] = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf-8');
        const record = JSON.parse(raw) as SavedProjectRecord;
        if (record?.id && record?.project) {
          summaries.push(toProjectSummary(record));
        }
      } catch (err) {
        console.warn(`Failed to parse project file ${file}:`, err);
      }
    }
    summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    res.json({ projects: summaries });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '無法讀取專案列表' });
  }
});

app.get('/api/projects/:id', (req, res) => {
  try {
    const record = readSavedProject(req.params.id);
    if (!record) {
      res.status(404).json({ error: '找不到指定的專案' });
      return;
    }
    res.json({ record });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '讀取專案失敗' });
  }
});

app.post('/api/projects', (req, res) => {
  try {
    const body = req.body as { project?: TrainingProject } | TrainingProject;
    const project = 'project' in body && body.project ? body.project : (body as TrainingProject);
    if (!project?.id || !Array.isArray(project.scenes)) {
      res.status(400).json({ error: '缺少有效的專案資料' });
      return;
    }
    const record = writeSavedProject(project);
    res.json({ record, summary: toProjectSummary(record) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '儲存專案失敗' });
  }
});

app.delete('/api/projects/:id', (req, res) => {
  try {
    const filePath = getProjectFilePath(req.params.id);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: '找不到指定的專案' });
      return;
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        fs.unlinkSync(filePath);
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err;
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'EACCES') throw err;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80);
      }
    }
    if (lastError) throw lastError;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '刪除專案失敗' });
  }
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

// Voice profiles: named ~10–15s reference recordings trained or used for voice cloning
const VOICE_PROFILES_FILE = path.join(VOICE_SAMPLES_DIR, 'profiles.json');

function readVoiceProfiles(): VoiceProfile[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(VOICE_PROFILES_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeVoiceProfiles(list: VoiceProfile[]) {
  fs.writeFileSync(VOICE_PROFILES_FILE, JSON.stringify(list, null, 2));
}

function cleanVoiceName(raw: unknown, fallback: string): string {
  const name = typeof raw === 'string' ? raw.trim().slice(0, 40) : '';
  return name || fallback;
}

const DEFAULT_OPENFORMOSA_URL = 'http://127.0.0.1:8001/v1/tts';

function resolveOpenFormosaUrl(raw?: string): string {
  const trimmed = (raw || '').trim();
  // Migrate legacy placeholder URL to the local OpenFormosa/BlueMagpie-TTS server.
  if (!trimmed || /^https?:\/\/openformosa\.com\/api\/v1\/tts\/?$/i.test(trimmed)) {
    return DEFAULT_OPENFORMOSA_URL;
  }
  return trimmed;
}

app.get('/api/tts/health', async (req, res) => {
  const rawUrl = typeof req.query.baseUrl === 'string' ? req.query.baseUrl : '';
  const baseUrl = resolveOpenFormosaUrl(rawUrl);
  const healthUrl = baseUrl.replace(/\/v1\/tts\/?$/i, '/health').replace(/\/+$/, '');
  try {
    const resp = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) {
      res.json({ ok: false, baseUrl, error: `HTTP ${resp.status}` });
      return;
    }
    const data = await resp.json().catch(() => ({}));
    res.json({ ok: true, baseUrl, ...data });
  } catch {
    res.json({
      ok: false,
      baseUrl,
      error: '本地 BlueMagpie-TTS 伺服器未啟動，請執行專案根目錄的 start-bluemagpie.bat',
    });
  }
});

app.get('/api/voice-profiles', (_req, res) => {
  res.json({ profiles: readVoiceProfiles() });
});

app.post('/api/voice-profiles', upload.single('file'), (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: '請選擇音檔' });
      return;
    }
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (!['wav', 'mp3', 'm4a', 'ogg', 'webm'].includes(ext)) {
      res.status(400).json({ error: '僅支援 WAV / MP3 / M4A / OGG / WEBM 音檔' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      res.status(400).json({ error: '音檔不可超過 10 MB' });
      return;
    }
    // Duration can only be parsed reliably for WAV/MP3; other containers would be misread.
    const durationSec = ext === 'wav' || ext === 'mp3' ? getAudioDurationSec(file.buffer, ext) : null;
    if (durationSec !== null && (durationSec < 3 || durationSec > 30)) {
      res.status(400).json({ error: `音檔長度需介於 3–30 秒（建議約 10 秒），目前為 ${durationSec.toFixed(1)} 秒` });
      return;
    }
    const id = crypto.randomBytes(8).toString('hex');
    const fileName = `${id}.${ext}`;
    fs.writeFileSync(path.join(VOICE_SAMPLES_DIR, fileName), file.buffer);
    const rawProvider = req.body?.provider;
    const provider: VoiceProfileProvider | undefined =
      rawProvider === 'openformosa' || rawProvider === 'ming-3.0' ? rawProvider : undefined;
    const referenceText =
      typeof req.body?.referenceText === 'string' && req.body.referenceText.trim()
        ? req.body.referenceText.trim().slice(0, 500)
        : undefined;
    const profile: VoiceProfile = {
      id,
      name: cleanVoiceName(req.body?.name, path.basename(file.originalname, path.extname(file.originalname))),
      fileName,
      durationSec: durationSec ?? undefined,
      createdAt: new Date().toISOString(),
      provider,
      trainingStatus: 'untrained',
      referenceText,
    };
    writeVoiceProfiles([...readVoiceProfiles(), profile]);
    res.json({ ok: true, profile });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '上傳失敗' });
  }
});

// Train / enroll a voice profile against the user's chosen TTS model (with local zero-shot fallback)
app.post('/api/voice-profiles/:id/train', async (req, res) => {
  try {
    const list = readVoiceProfiles();
    const profile = list.find((p) => p.id === req.params.id);
    if (!profile || !VOICE_SAMPLE_FILE_RE.test(profile.fileName)) {
      res.status(404).json({ error: '找不到此聲線' });
      return;
    }
    const samplePath = path.join(VOICE_SAMPLES_DIR, profile.fileName);
    if (!fs.existsSync(samplePath)) {
      res.status(404).json({ error: '找不到聲線音檔' });
      return;
    }

    const {
      provider = 'openformosa',
      openformosa,
      mingTts,
      referenceText,
      language = DEFAULT_CONTENT_LANGUAGE,
    } = req.body as {
      provider?: VoiceProfileProvider;
      openformosa?: { baseUrl?: string; apiKey?: string; model?: string; voice?: string };
      mingTts?: { baseUrl?: string; apiKey?: string; model?: string; speaker?: string; style?: string };
      referenceText?: string;
      language?: string;
    };

    const chosenProvider: VoiceProfileProvider = provider === 'ming-3.0' ? 'ming-3.0' : 'openformosa';
    const audioBase64 = fs.readFileSync(samplePath).toString('base64');
    const audioFormat = path.extname(samplePath).slice(1);
    const refText = (typeof referenceText === 'string' && referenceText.trim()) || profile.referenceText || undefined;
    const ttsLanguage = getContentLanguage(language).value;

    const modelName =
      chosenProvider === 'ming-3.0'
        ? mingTts?.model || 'inclusionAI/Ming-3.0-tts'
        : openformosa?.model || 'OpenFormosa/BlueMagpie-TTS';

    let remoteVoiceId: string | undefined;
    let trainingStatus: VoiceProfile['trainingStatus'] = 'reference-only';
    let trainingNote = '';

    const baseUrl =
      chosenProvider === 'ming-3.0'
        ? mingTts?.baseUrl?.trim()
        : resolveOpenFormosaUrl(openformosa?.baseUrl);
    const apiKey = chosenProvider === 'ming-3.0' ? mingTts?.apiKey?.trim() : openformosa?.apiKey?.trim();

    if (baseUrl) {
      const cloneUrl = `${baseUrl.replace(/\/+$/, '')}/voices/clone`;
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        const body =
          chosenProvider === 'ming-3.0'
            ? {
                name: profile.name,
                speaker_name: profile.name,
                model: modelName,
                language: ttsLanguage,
                reference_audio: audioBase64,
                reference_audio_format: audioFormat,
                ...(refText ? { reference_text: refText } : {}),
              }
            : {
                voice_id: `bm-${profile.id}`,
                name: profile.name,
                model: modelName,
                language: ttsLanguage,
                audio: audioBase64,
                audio_format: audioFormat,
                reference_audio: audioBase64,
                reference_audio_format: audioFormat,
                ...(refText ? { reference_text: refText } : {}),
              };
        const resp = await fetch(cloneUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60000),
        });
        if (resp.ok) {
          const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
          const returnedId =
            (typeof data.voice_id === 'string' && data.voice_id) ||
            (typeof data.speaker_id === 'string' && data.speaker_id) ||
            (typeof data.voice === 'string' && data.voice) ||
            (typeof data.id === 'string' && data.id) ||
            undefined;
          remoteVoiceId = returnedId || `vp-${profile.id}`;
          trainingStatus = 'trained';
          trainingNote =
            (typeof data.note === 'string' && data.note) ||
            `已透過 ${chosenProvider === 'ming-3.0' ? 'Ming-3.0-TTS' : 'OpenFormosa (BlueMagpie-TTS)'} 完成聲線訓練`;
        } else {
          const errData = (await resp.json().catch(() => ({}))) as { error?: string };
          trainingNote = `${chosenProvider === 'ming-3.0' ? 'Ming-3.0-TTS' : 'OpenFormosa (BlueMagpie-TTS)'} 訓練端點回應 HTTP ${resp.status}${errData.error ? ` (${errData.error})` : ''}，已改用本地參考聲線模式`;
        }
      } catch {
        trainingNote =
          chosenProvider === 'openformosa'
            ? `無法連線至本地 BlueMagpie-TTS (${baseUrl})，請先執行 start-bluemagpie.bat；目前暫存為本地參考聲線`
            : `無法連線至 Ming-3.0-TTS 訓練端點 (${baseUrl})，已改用本地參考聲線模式`;
      }
    } else {
      trainingNote = '尚未設定 TTS API 端點，已建立本地參考聲線（設定端點後合成時將自動附帶錄音）';
    }

    profile.provider = chosenProvider;
    profile.model = modelName;
    profile.trainingStatus = trainingStatus;
    profile.remoteVoiceId = remoteVoiceId;
    profile.trainedAt = new Date().toISOString();
    profile.trainingNote = trainingNote;
    if (refText) profile.referenceText = refText;

    writeVoiceProfiles(list);
    res.json({ ok: true, profile });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '訓練聲線失敗' });
  }
});

app.patch('/api/voice-profiles/:id', (req, res) => {
  const list = readVoiceProfiles();
  const profile = list.find((p) => p.id === req.params.id);
  if (!profile) {
    res.status(404).json({ error: '找不到此聲線' });
    return;
  }
  profile.name = cleanVoiceName(req.body?.name, profile.name);
  writeVoiceProfiles(list);
  res.json({ ok: true, profile });
});

app.delete('/api/voice-profiles/:id', (req, res) => {
  const list = readVoiceProfiles();
  const profile = list.find((p) => p.id === req.params.id);
  if (!profile) {
    res.status(404).json({ error: '找不到此聲線' });
    return;
  }
  fs.rmSync(path.join(VOICE_SAMPLES_DIR, profile.fileName), { force: true });
  writeVoiceProfiles(list.filter((p) => p.id !== profile.id));
  res.json({ ok: true });
});

app.get('/api/voice-profiles/:id/audio', (req, res) => {
  const profile = readVoiceProfiles().find((p) => p.id === req.params.id);
  if (!profile || !VOICE_SAMPLE_FILE_RE.test(profile.fileName)) {
    res.status(404).json({ error: '找不到此聲線' });
    return;
  }
  res.sendFile(path.join(VOICE_SAMPLES_DIR, profile.fileName));
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
      customVoice,
      skipCache = false,
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
      customVoice?: {
        profileId?: string;
        fileName?: string;
        provider?: VoiceProfileProvider;
        remoteVoiceId?: string;
      };
      skipCache?: boolean;
    };

    const storedProfile = customVoice?.profileId
      ? readVoiceProfiles().find((p) => p.id === customVoice.profileId)
      : undefined;
    const resolvedFileName = storedProfile?.fileName || customVoice?.fileName;
    const resolvedRemoteVoiceId =
      (storedProfile?.provider === provider ? storedProfile?.remoteVoiceId : undefined) ||
      (customVoice?.provider === provider ? customVoice?.remoteVoiceId : undefined);
    const resolvedRefText = storedProfile?.referenceText;

    const voiceSampleFile =
      resolvedFileName && VOICE_SAMPLE_FILE_RE.test(resolvedFileName)
        ? path.join(VOICE_SAMPLES_DIR, resolvedFileName)
        : null;
    const referenceAudio =
      voiceSampleFile && fs.existsSync(voiceSampleFile)
        ? {
            reference_audio: fs.readFileSync(voiceSampleFile).toString('base64'),
            reference_audio_format: path.extname(voiceSampleFile).slice(1),
            ...(resolvedRefText ? { reference_text: resolvedRefText } : {}),
          }
        : null;

    const ttsLanguage = getContentLanguage(language).value;
    const safeId = (sceneId || `scene-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
    const isVoicePreview = safeId.startsWith('voice-preview-');
    const cacheHash = crypto
      .createHash('sha1')
      .update(
        `${provider}|${ttsLanguage}|${resolvedRemoteVoiceId || voiceId || ''}|${referenceAudio ? resolvedFileName : ''}|${speed}|${text || ''}`
      )
      .digest('hex')
      .slice(0, 14);
    const cachedMp3 = `tts-${cacheHash}.mp3`;
    const cachedMp3Path = path.join(AUDIO_DIR, cachedMp3);
    // Only reuse cached Edge-TTS MP3 when browser-fallback was explicitly requested;
    // never let a stale fallback MP3 shadow OpenFormosa/Ming-3.0 or custom voice previews.
    if (
      !skipCache &&
      !isVoicePreview &&
      provider === 'browser-fallback' &&
      !referenceAudio &&
      !resolvedRemoteVoiceId &&
      fs.existsSync(cachedMp3Path) &&
      fs.statSync(cachedMp3Path).size > 512
    ) {
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

    const openformosaUrl = resolveOpenFormosaUrl(openformosa?.baseUrl);
    if (
      provider === 'openformosa' &&
      openformosaUrl &&
      (ttsLanguage === 'zh-TW' || ttsLanguage === 'en-US')
    ) {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (openformosa?.apiKey) headers.Authorization = `Bearer ${openformosa.apiKey}`;
        const resp = await fetch(openformosaUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: openformosa?.model || 'OpenFormosa/BlueMagpie-TTS',
            voice: resolvedRemoteVoiceId || voiceId || openformosa?.voice || 'hung_yi_lee',
            input: text,
            speed,
            response_format: 'wav',
            ...referenceAudio,
          }),
        });
        if (resp.ok) {
          const arr = Buffer.from(await resp.arrayBuffer());
          fs.writeFileSync(wavFilePath, arr);
          mode = 'openformosa';
        } else {
          note = `OpenFormosa (BlueMagpie-TTS) HTTP ${resp.status} — 已使用神經網路語音合成`;
        }
      } catch (e) {
        note = `OpenFormosa (BlueMagpie-TTS) 本地端點未啟動 (${openformosaUrl}) — 已使用神經網路語音合成`;
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
            speaker: resolvedRemoteVoiceId || voiceId || mingTts.speaker || 'ming-tech-zh-en',
            style: mingTts.style || 'professional-training',
            language: ttsLanguage,
            speed,
            ...referenceAudio,
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
          if (referenceAudio) note += ' (備援語音無法複製自訂聲線)';
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
    const { projectTitle, scenes, previewOnlySceneIndex, project } = req.body as {
      projectTitle: string;
      scenes: Array<{ durationSeconds?: number }>;
      previewOnlySceneIndex?: number;
      project?: TrainingProject;
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

        const isPreview = typeof previewOnlySceneIndex === 'number' && Boolean(scenes[previewOnlySceneIndex]);
        const selectedScenes = isPreview
          ? [scenes[previewOnlySceneIndex!]]
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

        const outputUrl = `/output/${outFile}`;
        if (project?.id) {
          try {
            const renderedDuration = selectedScenes.reduce(
              (sum, s) => sum + (Number(s?.durationSeconds) || 0),
              0
            );
            writeSavedProject(project, {
              jobId,
              outputUrl,
              renderedAt: new Date().toISOString(),
              durationSeconds: renderedDuration,
              sceneCount: selectedScenes.length,
              isPreview,
              previewSceneIndex: isPreview ? previewOnlySceneIndex : undefined,
            });
          } catch (saveErr) {
            console.warn('Failed to persist rendered project record:', saveErr);
          }
        }

        renderJobs.set(jobId, {
          id: jobId,
          status: 'done',
          progress: 100,
          outputUrl,
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
