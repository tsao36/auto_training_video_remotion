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
    baseUrl: 'https://openformosa.com/api/v1/tts',
    apiKey: '',
    model: 'formosa-tts-v1',
    voice: 'formosa-pro-tw',
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
    return {
      defaultProvider: parsed.defaultProvider === 'ming-3.0' ? 'ming-3.0' : 'openformosa',
      openformosa: { ...DEFAULT_TTS_SETTINGS.openformosa, ...parsed.openformosa },
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
  opts: { overrideProvider?: boolean } = {}
): TrainingProject {
  const provider = opts.overrideProvider ? settings.defaultProvider : project.ttsConfig.defaultProvider;
  return {
    ...project,
    ttsConfig: {
      ...project.ttsConfig,
      defaultProvider: provider,
      openformosa: { ...settings.openformosa },
      mingTts: { ...settings.mingTts },
      customVoice: settings.defaultVoice ? { ...settings.defaultVoice } : undefined,
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
