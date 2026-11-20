import { LlmConfig } from '../types/training';

export const GNAI_STORAGE_KEY = 'remotion_training_gnai_config_v1';

export const DEFAULT_GNAI_CONFIG: LlmConfig = {
  baseUrl: 'https://gnai.intel.com/api/providers/openai/v1',
  apiKey: '',
  model: 'gpt-5-mini',
};

export function sanitizeTokenInput(raw?: string): string {
  if (!raw) return '';
  let token = raw.trim();
  if (/^GNAI_TOKEN=/i.test(token)) {
    token = token.replace(/^GNAI_TOKEN=/i, '').trim();
  }
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    token = token.slice(1, -1).trim();
  }
  if (/^Bearer\s+/i.test(token)) {
    token = token.replace(/^Bearer\s+/i, '').trim();
  }
  return token;
}

export function loadStoredLlmConfig(): LlmConfig {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ...DEFAULT_GNAI_CONFIG };
    }
    const raw = window.localStorage.getItem(GNAI_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GNAI_CONFIG };
    const parsed = JSON.parse(raw) as Partial<LlmConfig>;
    return {
      baseUrl: parsed.baseUrl?.trim() || DEFAULT_GNAI_CONFIG.baseUrl,
      apiKey: sanitizeTokenInput(parsed.apiKey),
      model: parsed.model?.trim() || DEFAULT_GNAI_CONFIG.model,
    };
  } catch {
    return { ...DEFAULT_GNAI_CONFIG };
  }
}

export function saveStoredLlmConfig(config: LlmConfig): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(
      GNAI_STORAGE_KEY,
      JSON.stringify({
        baseUrl: config.baseUrl?.trim() || DEFAULT_GNAI_CONFIG.baseUrl,
        apiKey: sanitizeTokenInput(config.apiKey),
        model: config.model?.trim() || DEFAULT_GNAI_CONFIG.model,
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}
