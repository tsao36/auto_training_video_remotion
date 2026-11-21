import { TrainingProject, TtsEngineConfig } from '../types/training';

export const TTS_SETTINGS_STORAGE_KEY = 'remotion_training_tts_settings_v1';

export interface TtsSettings {
  defaultProvider: TtsEngineConfig['defaultProvider'];
  openformosa: TtsEngineConfig['openformosa'];
  mingTts: TtsEngineConfig['mingTts'];
  defaultVoice?: TtsEngineConfig['customVoice'];
}

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  defaultProvider: 'openformosa',
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
};

export function loadTtsSettings(): TtsSettings {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage?.getItem(TTS_SETTINGS_STORAGE_KEY) : null;
    if (!raw) return structuredClone(DEFAULT_TTS_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<TtsSettings>;
    const of = { ...DEFAULT_TTS_SETTINGS.openformosa, ...parsed.openformosa };
    if (/^https?:\/\/openformosa\.com\/api\/v1\/tts\/?$/i.test(of.baseUrl)) {
      of.baseUrl = DEFAULT_TTS_SETTINGS.openformosa.baseUrl;
    }
    if (of.model === 'formosa-tts-v1') of.model = DEFAULT_TTS_SETTINGS.openformosa.model;
    if (of.voice === 'formosa-pro-tw') of.voice = DEFAULT_TTS_SETTINGS.openformosa.voice;
    return {
      defaultProvider: parsed.defaultProvider === 'ming-3.0' ? 'ming-3.0' : 'openformosa',
      openformosa: of,
      mingTts: { ...DEFAULT_TTS_SETTINGS.mingTts, ...parsed.mingTts },
      defaultVoice: parsed.defaultVoice?.fileName ? parsed.defaultVoice : undefined,
    };
  } catch {
    return structuredClone(DEFAULT_TTS_SETTINGS);
  }
}

export function saveTtsSettings(settings: TtsSettings): void {
  try {
    window.localStorage?.setItem(TTS_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

/** Applies the user's saved TTS defaults to a newly created project. */
export function applyTtsSettings(
  project: TrainingProject,
  settings: TtsSettings,
  opts: { overrideProvider?: boolean; preserveCustomVoice?: boolean } = {}
): TrainingProject {
  const provider = opts.overrideProvider ? settings.defaultProvider : project.ttsConfig.defaultProvider;
  const customVoice = opts.preserveCustomVoice
    ? project.ttsConfig.customVoice
    : settings.defaultVoice
    ? { ...settings.defaultVoice }
    : undefined;
  return {
    ...project,
    ttsConfig: {
      ...project.ttsConfig,
      defaultProvider: provider,
      openformosa: { ...settings.openformosa },
      mingTts: { ...settings.mingTts },
      customVoice,
    },
    scenes: project.scenes.map((s) => {
      const sceneProvider = opts.overrideProvider ? provider : s.tts.provider;
      if (sceneProvider === 'browser-fallback') return s;
      return {
        ...s,
        tts: {
          ...s.tts,
          provider: sceneProvider,
          voiceId: sceneProvider === 'ming-3.0' ? settings.mingTts.speaker : settings.openformosa.voice,
        },
      };
    }),
  };
}
