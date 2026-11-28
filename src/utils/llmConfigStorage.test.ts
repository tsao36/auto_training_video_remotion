import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_GNAI_CONFIG,
  GNAI_STORAGE_KEY,
  LLM_PROVIDER_PRESETS,
  loadStoredLlmConfig,
  sanitizeTokenInput,
  saveStoredLlmConfig,
} from './llmConfigStorage';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

describe('llmConfigStorage', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('strips env prefixes, quotes, and Bearer prefix from tokens', () => {
    expect(sanitizeTokenInput('  GNAI_TOKEN="Bearer my-secret-token"  ')).toBe('my-secret-token');
    expect(sanitizeTokenInput("Bearer 'abc123'")).toBe("'abc123'");
    expect(sanitizeTokenInput('')).toBe('');
  });

  it('returns default config when localStorage is unavailable or malformed', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(loadStoredLlmConfig()).toEqual(DEFAULT_GNAI_CONFIG);

    const localStorage = createMemoryStorage();
    localStorage.setItem(GNAI_STORAGE_KEY, '{bad-json');
    (globalThis as { window?: unknown }).window = { localStorage };
    expect(loadStoredLlmConfig()).toEqual(DEFAULT_GNAI_CONFIG);
  });

  it('saves and reloads provider-aware config with sanitized token', () => {
    const localStorage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = { localStorage };

    saveStoredLlmConfig({
      ...LLM_PROVIDER_PRESETS.local,
      apiKey: 'Bearer local-token',
    });

    expect(loadStoredLlmConfig()).toEqual({
      provider: 'local',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'local-token',
      model: 'qwen2.5:14b',
    });
  });

  it('infers local provider for legacy entries without provider field', () => {
    const localStorage = createMemoryStorage();
    localStorage.setItem(
      GNAI_STORAGE_KEY,
      JSON.stringify({ baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '', model: 'llama3' })
    );
    (globalThis as { window?: unknown }).window = { localStorage };

    expect(loadStoredLlmConfig().provider).toBe('local');
  });
});
