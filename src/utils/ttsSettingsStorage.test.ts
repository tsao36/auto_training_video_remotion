import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from './planGenerator';
import {
  applyTtsSettings,
  DEFAULT_TTS_SETTINGS,
  loadTtsSettings,
  saveTtsSettings,
  TTS_SETTINGS_STORAGE_KEY,
} from './ttsSettingsStorage';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe('ttsSettingsStorage', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('migrates legacy openformosa URL, model, and voice on load', () => {
    const localStorage = createMemoryStorage();
    localStorage.setItem(
      TTS_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        defaultProvider: 'openformosa',
        openformosa: {
          baseUrl: 'https://openformosa.com/api/v1/tts',
          apiKey: 'k',
          model: 'formosa-tts-v1',
          voice: 'formosa-pro-tw',
        },
      })
    );
    (globalThis as { window?: unknown }).window = { localStorage };

    const loaded = loadTtsSettings();
    expect(loaded.openformosa.baseUrl).toBe(DEFAULT_TTS_SETTINGS.openformosa.baseUrl);
    expect(loaded.openformosa.model).toBe(DEFAULT_TTS_SETTINGS.openformosa.model);
    expect(loaded.openformosa.voice).toBe(DEFAULT_TTS_SETTINGS.openformosa.voice);
  });

  it('saves and reloads ming-3.0 provider and custom default voice', () => {
    const localStorage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = { localStorage };

    saveTtsSettings({
      ...DEFAULT_TTS_SETTINGS,
      defaultProvider: 'ming-3.0',
      defaultVoice: { fileName: 'voice-1.wav', name: 'Trainer' },
    });

    const loaded = loadTtsSettings();
    expect(loaded.defaultProvider).toBe('ming-3.0');
    expect(loaded.defaultVoice).toEqual({ fileName: 'voice-1.wav', name: 'Trainer' });
  });

  it('applies TTS settings to project scenes while preserving browser-fallback scenes', () => {
    const base = createEmptyProject('debug-logic');
    base.scenes = [
      {
        id: 's1',
        index: 0,
        title: 'Scene 1',
        subtitle: '',
        domain: 'debug-logic',
        template: 'title-hero',
        durationSeconds: 10,
        keyPoints: [],
        script: 'Test',
        tts: { provider: 'openformosa', voiceId: 'old', speed: 1, status: 'idle' },
        animation: { motionStyle: 'step-reveal', accentColor: '#00C2FF', showSubtitles: true, showProgressHud: true },
      },
      {
        id: 's2',
        index: 1,
        title: 'Scene 2',
        subtitle: '',
        domain: 'debug-logic',
        template: 'title-hero',
        durationSeconds: 10,
        keyPoints: [],
        script: 'Test 2',
        tts: { provider: 'browser-fallback', voiceId: 'edge', speed: 1, status: 'idle' },
        animation: { motionStyle: 'step-reveal', accentColor: '#00C2FF', showSubtitles: true, showProgressHud: true },
      },
    ];

    const updated = applyTtsSettings(
      base,
      {
        ...DEFAULT_TTS_SETTINGS,
        defaultProvider: 'ming-3.0',
        mingTts: { ...DEFAULT_TTS_SETTINGS.mingTts, speaker: 'custom-speaker' },
      },
      { overrideProvider: true }
    );

    expect(updated.ttsConfig.defaultProvider).toBe('ming-3.0');
    expect(updated.scenes[0].tts.provider).toBe('ming-3.0');
    expect(updated.scenes[0].tts.voiceId).toBe('custom-speaker');
    expect(updated.scenes[1].tts.provider).toBe('ming-3.0');
  });
});
