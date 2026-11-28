import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneSpec } from '../src/types/training';
import {
  generateVideoPlanWithLlm,
  getEnvLlmStatus,
  inferEffectFromScriptAndTemplate,
  inferTemplateFromScript,
  regenerateSceneWithLlm,
  resolveTrainingDomain,
} from './llmGenerator';

const ORIGINAL_ENV = {
  GNAI_URL: process.env.GNAI_URL,
  GNAI_TOKEN: process.env.GNAI_TOKEN,
  GNAI_MODEL: process.env.GNAI_MODEL,
  LLM_BASE_URL: process.env.LLM_BASE_URL,
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_MODEL: process.env.LLM_MODEL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

function clearLlmEnv() {
  delete process.env.GNAI_URL;
  delete process.env.GNAI_TOKEN;
  delete process.env.GNAI_MODEL;
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_MODEL;
  delete process.env.OPENAI_API_KEY;
}

function restoreLlmEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function makeScene(overrides: Partial<SceneSpec> = {}): SceneSpec {
  return {
    id: 'scene-1',
    index: 0,
    title: 'PCIe Clock Debug',
    subtitle: 'DEBUG',
    domain: 'debug-logic',
    template: 'architecture-flow',
    durationSeconds: 12,
    keyPoints: ['REFCLK 100MHz', 'PERST#'],
    script: '檢查 100MHz 時脈是否出現抖動或雜訊。',
    tts: {
      provider: 'openformosa',
      voiceId: 'hung_yi_lee',
      speed: 1,
      status: 'idle',
    },
    animation: {
      motionStyle: 'spring-snappy',
      effect: 'signal-pulse',
      accentColor: '#00C2FF',
      showSubtitles: true,
      showProgressHud: true,
    },
    ...overrides,
  };
}

describe('llmGenerator', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    restoreLlmEnv();
  });

  it('infers matching effects and templates from technical narration', () => {
    expect(inferEffectFromScriptAndTemplate('示波器抓到電源雜訊與 jitter 超標', 'architecture-flow')).toBe('glitch-alert');
    expect(inferEffectFromScriptAndTemplate('依序完成 handshake 時序步驟', 'architecture-flow')).toBe('cascade-reveal');
    expect(inferEffectFromScriptAndTemplate('一般系統訊號路徑', 'packet-simulator')).toBe('packet-traffic');

    expect(inferTemplateFromScript('Wi-Fi 7 MLO 多鏈路與 EMLSR 切換')).toBe('mlo-multilink');
    expect(inferTemplateFromScript('使用 OFDMA 副載波與 preamble puncturing')).toBe('ofdm-spectrum');
    expect(inferTemplateFromScript('解析 802.11 MAC header 與 EAPOL 封包欄位')).toBe('packet-frame');
  });

  it('reports env LLM status accurately without exposing keys', () => {
    clearLlmEnv();
    expect(getEnvLlmStatus().configured).toBe(false);

    process.env.GNAI_TOKEN = 'Bearer "test-token"';
    process.env.GNAI_MODEL = 'gpt-5-mini';
    const status = getEnvLlmStatus();
    expect(status.configured).toBe(true);
    expect(status.source).toBe('env');
    expect(status.model).toBe('gpt-5-mini');
  });

  it('resolves explicit manual domain without calling LLM', async () => {
    clearLlmEnv();
    const result = await resolveTrainingDomain({ topic: 'Wi-Fi 7 MLO', domain: 'rf' });
    expect(result.domain).toBe('rf');
    expect(result.domainSource).toBe('manual');
  });

  it('generates a balanced smart-fallback plan in zh-TW when no LLM key is configured', async () => {
    clearLlmEnv();
    const result = await generateVideoPlanWithLlm({
      topic: 'PCIe Gen5 訊號完整性除錯',
      durationSeconds: 300,
      domain: 'debug-logic',
      language: 'zh-TW',
    });

    const total = result.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
    expect(result.mode).toBe('smart-fallback');
    expect(result.scenes.length).toBeGreaterThan(0);
    expect(total).toBe(300);
  });

  it('rejects non-default language plan generation when no LLM is available', async () => {
    clearLlmEnv();
    await expect(
      generateVideoPlanWithLlm({
        topic: 'TCP Congestion Control',
        durationSeconds: 300,
        domain: 'debug-logic',
        language: 'en-US',
      })
    ).rejects.toThrow(/LLM/);
  });

  it('uses mocked OpenAI-compatible provider response and balances scene durations to target', async () => {
    clearLlmEnv();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: 'TCP Latency Course',
                    subtitle: 'Practical Congestion Control',
                    scenes: [
                      {
                        title: 'Objective',
                        subtitle: 'Overview',
                        durationSeconds: 40,
                        template: 'title-hero',
                        effect: 'cascade-reveal',
                        keyPoints: ['Slow Start', 'CWND'],
                        script: 'Understand how TCP congestion windows shape application tail latency.',
                      },
                      {
                        title: 'Packet Loss Recovery',
                        subtitle: 'Retransmission',
                        durationSeconds: 40,
                        template: 'protocol-timeline',
                        effect: 'glitch-alert',
                        keyPoints: ['Fast Retransmit', 'RTO'],
                        script: 'Packet loss triggers window reduction and retransmission delays.',
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    const result = await generateVideoPlanWithLlm({
      topic: 'TCP Latency',
      durationSeconds: 120,
      domain: 'debug-logic',
      language: 'en-US',
      llmConfig: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'unit-test-key',
        model: 'test-model',
      },
    });

    const total = result.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
    expect(result.mode).toBe('llm');
    expect(result.title).toBe('TCP Latency Course');
    expect(result.scenes).toHaveLength(2);
    expect(total).toBe(120);
  });

  it('regenerates a scene via smart-fallback when no LLM key is configured', async () => {
    clearLlmEnv();
    const res = await regenerateSceneWithLlm({
      topic: 'PCIe Debug',
      scene: makeScene(),
      action: 'sync-visual-to-script',
      language: 'zh-TW',
    });

    expect(res.mode).toBe('smart-fallback');
    expect(res.scenePatch.animation?.effect).toBe('glitch-alert');
  });

  it('supports element-composed scenes with full-viewport Remotion elements and AI auto videoTheme', async () => {
    clearLlmEnv();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: 'Modern Web Architecture',
                    subtitle: 'AI Element-Composed Walkthrough',
                    videoTheme: 'aurora-flow',
                    videoThemeReason: '動態資料流與現代介面示範適合資料極光主題',
                    scenes: [
                      {
                        title: 'Dashboard Walkthrough',
                        subtitle: 'UI Overview',
                        durationSeconds: 30,
                        template: 'element-composed',
                        effect: 'zoom-focus',
                        remotionPrimitives: ['aurora-bg', 'device-mockup-zoom', 'arrow-annotate'],
                        keyPoints: ['Live Telemetry', 'Filter Pipeline'],
                        script: 'Inspect the live dashboard layout and how telemetry flows into the interface.',
                      },
                      {
                        title: 'Config Snippet',
                        subtitle: 'Code Reveal',
                        durationSeconds: 30,
                        template: 'element-composed',
                        effect: 'cascade-reveal',
                        remotionPrimitives: ['code-reveal', 'typewriter'],
                        keyPoints: ['Zero-config Setup'],
                        script: 'Walk through the minimal configuration block line by line.',
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    const result = await generateVideoPlanWithLlm({
      topic: 'Modern Web Architecture',
      durationSeconds: 60,
      domain: 'auto',
      videoTheme: 'auto',
      language: 'en-US',
      llmConfig: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'unit-test-key',
        model: 'test-model',
      },
    });

    expect(result.videoTheme).toBe('aurora-flow');
    expect(result.videoThemeSource).toBe('llm');
    expect(result.videoThemeReason).toContain('資料極光');
    expect(result.scenes[0].template).toBe('element-composed');
    expect(result.scenes[0].remotionPrimitives).toContain('device-mockup-zoom');
    expect(result.scenes[0].remotionPrimitives).toContain('aurora-bg');
    expect(result.scenes[1].template).toBe('element-composed');
    expect(result.scenes[1].remotionPrimitives).toContain('code-reveal');
  });
});
