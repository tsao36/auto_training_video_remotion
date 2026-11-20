import https from 'node:https';
import {
  ContentLanguage,
  DEFAULT_CONTENT_LANGUAGE,
  DOMAIN_META,
  getContentLanguage,
  LlmConfig,
  RemotionEffect,
  SceneDiagramData,
  SceneSpec,
  TechDomain,
  TtsProvider,
  VisualTemplate,
} from '../src/types/training';

export interface GeneratePlanParams {
  topic: string;
  durationSeconds: number;
  domain: TechDomain;
  rawText?: string;
  defaultTtsProvider?: TtsProvider;
  language?: ContentLanguage;
  llmConfig?: Partial<LlmConfig>;
}

export interface RegenerateSceneParams {
  topic: string;
  scene: SceneSpec;
  action: 'sync-visual-to-script' | 'rewrite-script-no-read' | 'regenerate-both';
  language?: ContentLanguage;
  llmConfig?: Partial<LlmConfig>;
}

interface LlmScenePayload {
  title: string;
  subtitle?: string;
  durationSeconds: number;
  template: VisualTemplate;
  effect: RemotionEffect;
  visualDescription: string;
  keyPoints: string[];
  script: string;
  diagramData?: SceneDiagramData;
}

interface LlmPlanPayload {
  title: string;
  subtitle: string;
  scenes: LlmScenePayload[];
}

const VALID_TEMPLATES: VisualTemplate[] = [
  'title-hero',
  'architecture-flow',
  'signal-waveform',
  'protocol-timeline',
  'comparison-matrix',
  'debug-checklist',
  'summary-takeaways',
];

const VALID_EFFECTS: RemotionEffect[] = [
  'signal-pulse',
  'glitch-alert',
  'cascade-reveal',
  'zoom-focus',
  'sweep-scan',
];

const DEFAULT_GNAI_URL = 'https://gnai.intel.com/api/providers/openai/v1';
const DEFAULT_GNAI_MODEL = 'gpt-5-mini';

function sanitizeApiKey(raw?: string): string {
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

function resolveLlmConfig(override?: Partial<LlmConfig>): LlmConfig {
  return {
    baseUrl: (
      override?.baseUrl ||
      process.env.GNAI_URL ||
      process.env.LLM_BASE_URL ||
      DEFAULT_GNAI_URL
    ).replace(/\/+$/, ''),
    apiKey: sanitizeApiKey(
      override?.apiKey ||
        process.env.GNAI_TOKEN ||
        process.env.LLM_API_KEY ||
        process.env.OPENAI_API_KEY ||
        ''
    ),
    model:
      override?.model ||
      process.env.GNAI_MODEL ||
      process.env.LLM_MODEL ||
      DEFAULT_GNAI_MODEL,
  };
}

function isLocalLlmEndpoint(baseUrl: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(baseUrl);
}

function extractJsonObject(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  }
  return JSON.parse(cleaned);
}

function clampTemplate(tpl: unknown, idx: number, total: number): VisualTemplate {
  if (typeof tpl === 'string' && VALID_TEMPLATES.includes(tpl as VisualTemplate)) {
    return tpl as VisualTemplate;
  }
  if (idx === 0) return 'title-hero';
  if (idx === total - 1) return 'summary-takeaways';
  return 'architecture-flow';
}

function clampEffect(effect: unknown, template: VisualTemplate, script: string): RemotionEffect {
  if (typeof effect === 'string' && VALID_EFFECTS.includes(effect as RemotionEffect)) {
    return effect as RemotionEffect;
  }
  return inferEffectFromScriptAndTemplate(script, template);
}

export function inferEffectFromScriptAndTemplate(script: string, template: VisualTemplate): RemotionEffect {
  const s = script.toLowerCase();
  if (/異常|雜訊|干擾|抖動|droop|jitter|desense|fail|glitch|noise|mismatch|超標|逾時|卡死|崩潰/.test(s)) {
    return 'glitch-alert';
  }
  if (/掃描|示波器|量測|逐一|檢查|排查|probe|oscilloscope|scan|checklist|確認/.test(s)) {
    return 'sweep-scan';
  }
  if (/順序|時序|步驟|毫秒|階段|交握|handshake|sequence|boot|timeline|依序|先.*再/.test(s)) {
    return 'cascade-reveal';
  }
  if (/比較|差異|對照|倍增|提升|關鍵|重點|聚焦|focus|vs|compare|優勢/.test(s)) {
    return 'zoom-focus';
  }
  if (template === 'signal-waveform') return 'sweep-scan';
  if (template === 'protocol-timeline') return 'cascade-reveal';
  if (template === 'comparison-matrix') return 'zoom-focus';
  return 'signal-pulse';
}

export function inferTemplateFromScript(script: string, current?: VisualTemplate): VisualTemplate {
  const s = script.toLowerCase();
  if (/波形|示波器|頻譜|眼圖|雜訊|漣波|時脈|waveform|clock|ripple|jitter|s11|ofdma|qam/.test(s)) {
    return 'signal-waveform';
  }
  if (/時序|毫秒|交握|握手|步驟|流程|階段|boot|post|handshake|timeline|ms/.test(s)) {
    return 'protocol-timeline';
  }
  if (/比較|對照|差異|世代|優劣|vs|compare|matrix|倍|規格/.test(s)) {
    return 'comparison-matrix';
  }
  if (/排查|檢查|步驟|清單|二分法|隔離|checklist|triage|sop|debug/.test(s)) {
    return 'debug-checklist';
  }
  if (/架構|拓撲|模組|晶片|總線|傳輸|連接|soc|ec|pmic|pcie|antenna|fem|mac/.test(s)) {
    return 'architecture-flow';
  }
  return current || 'architecture-flow';
}

function normalizeDurationsToTarget(scenes: LlmScenePayload[], targetSeconds: number): number[] {
  const count = scenes.length;
  if (count === 0) return [];
  const minPerScene = 3;
  const maxPerScene = Math.max(25, Math.ceil(targetSeconds / count) + 6);
  const clampedTarget = Math.max(count * minPerScene, Math.round(targetSeconds));

  const durations = scenes.map((s) =>
    Math.max(minPerScene, Math.min(maxPerScene, Math.round(s.durationSeconds || clampedTarget / count)))
  );
  let sum = durations.reduce((a, b) => a + b, 0);
  let guard = 0;

  while (sum !== clampedTarget && guard < 3000) {
    guard++;
    if (sum < clampedTarget) {
      let moved = false;
      for (let i = 0; i < count && sum < clampedTarget; i++) {
        if (durations[i] < maxPerScene) {
          durations[i]++;
          sum++;
          moved = true;
        }
      }
      if (!moved) break;
    } else {
      let moved = false;
      for (let i = count - 1; i >= 0 && sum > clampedTarget; i--) {
        if (durations[i] > minPerScene) {
          durations[i]--;
          sum--;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
  return durations;
}

async function postJsonWithTlsFallback(
  urlStr: string,
  headers: Record<string, string>,
  body: string
): Promise<{ status: number; ok: boolean; text: string }> {
  try {
    const resp = await fetch(urlStr, {
      method: 'POST',
      headers,
      body,
    });
    const text = await resp.text();
    return { status: resp.status, ok: resp.ok, text };
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
    const code = cause?.code || '';
    const isTlsChainError =
      /SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT|CERT_/i.test(
        code
      ) || /gnai\.intel\.com/i.test(urlStr);

    if (isTlsChainError && urlStr.startsWith('https://')) {
      return await new Promise((resolve, reject) => {
        const parsed = new URL(urlStr);
        const req = https.request(
          {
            hostname: parsed.hostname,
            port: parsed.port || 443,
            path: `${parsed.pathname}${parsed.search}`,
            method: 'POST',
            headers: {
              ...headers,
              'Content-Length': Buffer.byteLength(body),
            },
            rejectUnauthorized: false,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            res.on('end', () => {
              const status = res.statusCode || 500;
              resolve({
                status,
                ok: status >= 200 && status < 300,
                text: Buffer.concat(chunks).toString('utf8'),
              });
            });
          }
        );
        req.on('error', reject);
        req.write(body);
        req.end();
      });
    }

    const detail = cause?.message ? `${(err as Error).message} (${cause.message})` : (err as Error).message;
    throw new Error(detail);
  }
}

async function callChatCompletionJson(
  cfg: LlmConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  }

  const isFixedTempModel = /^(gpt-5|o1|o3|o4)/i.test(cfg.model.trim());
  const buildBody = (useJsonMode: boolean, includeTemp: boolean) => {
    const payload: Record<string, unknown> = {
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };
    if (includeTemp) payload.temperature = 0.7;
    if (useJsonMode) payload.response_format = { type: 'json_object' };
    return JSON.stringify(payload);
  };

  const urlStr = `${cfg.baseUrl}/chat/completions`;
  let resp = await postJsonWithTlsFallback(urlStr, headers, buildBody(true, !isFixedTempModel));

  if (resp.status === 400) {
    // Retry without response_format / temperature in case provider or model restricts them
    resp = await postJsonWithTlsFallback(urlStr, headers, buildBody(false, false));
  }

  if (!resp.ok) {
    if (resp.status === 401) {
      throw new Error(
        `LLM HTTP 401 (驗證失敗)：GNAI Token 無效、已過期，或權限不足。請至 gnai.intel.com 重新取得 Token 並貼入 GNAI_TOKEN（已自動過濾引號與 Bearer 前綴）。`
      );
    }
    throw new Error(`LLM HTTP ${resp.status}: ${resp.text.slice(0, 200)}`);
  }

  const json = JSON.parse(resp.text) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response');
  }
  return extractJsonObject(content);
}

function buildSmartFallbackDiagram(
  topic: string,
  domain: TechDomain,
  template: VisualTemplate,
  effect: RemotionEffect,
  script: string
): SceneDiagramData {
  const shortTopic = topic.slice(0, 20);
  if (template === 'architecture-flow') {
    const isFault = effect === 'glitch-alert';
    return {
      visualCaption: isFault ? `⚠ 異常耦合焦點：${shortTopic}` : `訊號鏈路流向：${shortTopic}`,
      highlightNodeIndex: isFault ? 2 : 1,
      nodes: [
        { id: 'n1', label: 'Host / SoC', sublabel: `${shortTopic} 主控端`, color: '#0071C5' },
        { id: 'n2', label: 'Controller / MAC', sublabel: '協定與時序仲裁', color: '#00C2FF' },
        {
          id: 'n3',
          label: isFault ? '關鍵瓶頸點' : 'Front-End / PHY',
          sublabel: isFault ? '雜訊 / 壓降熱區' : '類比前端驅動',
          color: isFault ? '#F59E0B' : '#38BDF8',
        },
        { id: 'n4', label: 'Physical I/O', sublabel: '實機負載輸出', color: '#10B981' },
      ],
    };
  }

  if (template === 'signal-waveform') {
    const isFault = effect === 'glitch-alert';
    return {
      visualCaption: isFault ? '示波器異常觸發：邊緣抖動 / 漣波超標' : '即時示波器波形掃描',
      faultChannelIndex: isFault ? 1 : undefined,
      waveformFreqHz: 3.0,
      waveformChannels: [
        { label: `CH1: ${shortTopic} CLK / Ref`, color: '#00C2FF', type: 'clock' },
        {
          label: isFault ? 'CH2: 異常擾動訊號 (Jitter/Droop)' : 'CH2: 調變與資料封包',
          color: isFault ? '#F59E0B' : '#10B981',
          type: domain === 'debug-logic' ? 'data' : 'ofdma',
        },
        { label: 'CH3: 系統穩定度包絡線', color: '#A78BFA', type: 'rf-sine' },
      ],
    };
  }

  if (template === 'protocol-timeline') {
    return {
      visualCaption: '毫秒級狀態機與交握時序',
      activeStepIndex: effect === 'glitch-alert' ? 2 : undefined,
      protocolSteps: [
        { actor: 'INIT', target: 'CTRL', message: `${shortTopic} 喚醒與供電就緒`, timing: 'T0 + 5ms' },
        { actor: 'CTRL', target: 'PHY', message: '時脈鎖定與參數協商', timing: 'T0 + 18ms' },
        { actor: 'PHY', target: 'LINK', message: '通道訓練 / 校準驗證', timing: 'T0 + 42ms' },
        { actor: 'LINK', target: 'HOST', message: '進入低延遲穩定傳輸', timing: 'T0 + 80ms' },
      ],
    };
  }

  if (template === 'comparison-matrix') {
    return {
      visualCaption: '設計基準 vs 優化目標',
      comparisonHeaders: ['傳統 / 異常基準', `${shortTopic} 優化指標`],
      comparisonRows: [
        { metric: '訊號餘裕 (Margin)', optionA: '臨界邊緣', optionB: '+35% 抗干擾餘裕', highlight: 'B' },
        { metric: '響應延遲', optionA: '高重試率', optionB: '單次鎖定 (< 20ms)', highlight: 'B' },
        { metric: '功耗與熱效率', optionA: '持續滿載耗電', optionB: '動態節能調節', highlight: 'B' },
      ],
    };
  }

  return {
    visualCaption: /排查|除錯|檢查/.test(script) ? '逐步隔離驗證 SOP' : `${shortTopic} 核心架構`,
  };
}

function generateFallbackPlan(params: GeneratePlanParams): LlmPlanPayload {
  const { topic, durationSeconds, domain, rawText } = params;
  const meta = DOMAIN_META[domain];
  const sceneCount = Math.max(3, Math.min(16, Math.round(durationSeconds / 12)));

  const blueprints: {
    title: string;
    template: VisualTemplate;
    effect: RemotionEffect;
    visualDescription: string;
    keyPoints: string[];
    script: string;
  }[] = [
    {
      title: `${topic}：為什麼工程團隊必須重視？`,
      template: 'title-hero',
      effect: 'zoom-focus',
      visualDescription: '聚焦展示課程主題徽章與三個精簡工程維度卡片，作為視覺錨點。',
      keyPoints: ['系統穩定度門檻', '硬體訊號鏈邊界', 'EVT/DVT 驗證標準'],
      script: `很多工程師在面對「${topic}」時，往往等到測試失敗才回頭找原因。其實只要先掌握系統背後的物理限制，就能在設計早期避開八成以上的重工風險。`,
    },
    {
      title: `${topic} 的底層訊號與硬體拓撲`,
      template: 'architecture-flow',
      effect: 'signal-pulse',
      visualDescription: '四節點硬體方塊圖搭配移動的訊號脈衝，顯示資料與控制流向。',
      keyPoints: ['Host 主控端', 'Controller 仲裁', 'PHY 類比前端', 'Physical I/O'],
      script: `當指令從主控端發出後，並不是直接到達終端，而是必須經過中間控制器的時序仲裁與前端驅動轉換。只要其中一級阻抗不匹配，能量就會在這裡被反射消耗掉。`,
    },
    {
      title: '示波器下的真實波形與干擾瞬間',
      template: 'signal-waveform',
      effect: 'glitch-alert',
      visualDescription: '多通道示波器波形圖，第二通道標示出異常抖動與電壓驟降警示區。',
      keyPoints: ['CH1 參考時脈', 'CH2 Jitter/Droop 警示', 'CH3 包絡線響應'],
      script: `把探棒接上去就會發現，系統之所以偶發當機，通常是因為高頻切換瞬間拉低了供電軌，讓原本方正的時脈邊緣產生肉眼難辨的抖動。`,
    },
    {
      title: '毫秒級交握時序與逾時風險',
      template: 'protocol-timeline',
      effect: 'cascade-reveal',
      visualDescription: '由上而下逐級亮起的時序時間軸，呈現各階段毫秒級依賴關係。',
      keyPoints: ['T0+5ms 供電鎖定', 'T0+18ms 參數協商', 'T0+42ms 通道訓練'],
      script: `更關鍵的是時間順序。如果前級電源還沒完全爬升到目標電壓，後級就搶先發出重置訊號，整個狀態機就會卡在半路，重試幾次後直接判定失敗。`,
    },
    {
      title: '基準設計與優化方案的關鍵差距',
      template: 'comparison-matrix',
      effect: 'zoom-focus',
      visualDescription: '雙欄對照矩陣並聚焦高亮右側優化後的工程指標。',
      keyPoints: ['+35% 抗干擾餘裕', '< 20ms 單次鎖定', '動態節能調節'],
      script: `從實測數據來看，把佈線隔離與去耦電容做對之後，我們換來的不只是帳面速度變快，而是系統在高低溫極限下依然能一次鎖定、不再反覆重連。`,
    },
    {
      title: '現場除錯 SOP：如何快速縮小範圍',
      template: 'debug-checklist',
      effect: 'sweep-scan',
      visualDescription: '除錯檢查清單搭配掃描線動畫，模擬逐項量測驗證的過程。',
      keyPoints: ['電源漣波 < 25mVpp', '晶振起振頻偏確認', '二分法隔離外設'],
      script: `下次遇到異常，千萬別急著拆晶片。先用示波器確認供電乾淨、再看參考時脈有沒有起振，最後透過二分法把外設逐一斷開，十分鐘內就能鎖定真正的罪魁禍首。`,
    },
    {
      title: `${topic} 實戰總結與驗收準則`,
      template: 'summary-takeaways',
      effect: 'zoom-focus',
      visualDescription: '總結卡片聚焦呈現量產前必須存檔的三項核心驗收指標。',
      keyPoints: ['先電源後時脈', '波形存檔留證', 'EVT 邊界壓測'],
      script: `記住一個核心原則：看懂波形背後的因果關係，比背誦規格表更重要。把今天這套驗證邏輯帶進你的下一次板階除錯，祝你一次過關！`,
    },
  ];

  const selected: LlmScenePayload[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const bp =
      i === 0
        ? blueprints[0]
        : i === sceneCount - 1
        ? blueprints[blueprints.length - 1]
        : blueprints[1 + ((i - 1) % (blueprints.length - 2))];

    const contextHint =
      rawText && rawText.trim().length > 10 && i === 1
        ? `結合您提供的技術筆記重點，${bp.script}`
        : bp.script;

    selected.push({
      title: bp.title,
      subtitle: `${meta.badge} • SCENE ${i + 1}`,
      durationSeconds: Math.round(durationSeconds / sceneCount),
      template: bp.template,
      effect: bp.effect,
      visualDescription: bp.visualDescription,
      keyPoints: bp.keyPoints,
      script: contextHint,
      diagramData: buildSmartFallbackDiagram(topic, domain, bp.template, bp.effect, contextHint),
    });
  }

  const balanced = normalizeDurationsToTarget(selected, durationSeconds);
  selected.forEach((s, idx) => {
    s.durationSeconds = balanced[idx];
  });

  return {
    title: topic || `${meta.shortLabel} 技術培訓課程`,
    subtitle: `${meta.shortLabel} • ${durationSeconds}s AI 動態視覺課程`,
    scenes: selected,
  };
}

function toSceneSpecs(
  payload: LlmPlanPayload,
  domain: TechDomain,
  defaultTtsProvider: TtsProvider,
  topic: string
): SceneSpec[] {
  const meta = DOMAIN_META[domain];
  const voiceId = defaultTtsProvider === 'ming-3.0' ? 'ming-tech-zh-en' : 'formosa-pro-tw';
  const total = payload.scenes.length;
  const now = Date.now();

  return payload.scenes.map((raw, idx) => {
    const template = clampTemplate(raw.template, idx, total);
    const script = (raw.script || raw.title || '').trim();
    const effect = clampEffect(raw.effect, template, script);
    const diagramData =
      raw.diagramData && Object.keys(raw.diagramData).length > 0
        ? raw.diagramData
        : buildSmartFallbackDiagram(topic, domain, template, effect, script);

    return {
      id: `scene-${now}-${idx}`,
      index: idx,
      title: raw.title || `Scene ${idx + 1}`,
      subtitle: raw.subtitle || `${meta.badge} • SCENE ${idx + 1}`,
      domain,
      template,
      durationSeconds: Math.max(3, Math.round(raw.durationSeconds || 8)),
      keyPoints: Array.isArray(raw.keyPoints) && raw.keyPoints.length > 0
        ? raw.keyPoints.slice(0, 4).map((k) => String(k).slice(0, 48))
        : ['核心架構指標', '實機量測驗證'],
      script,
      visualDescription: raw.visualDescription || `Remotion ${template} 搭配 ${effect} 特效`,
      diagramData,
      tts: {
        provider: defaultTtsProvider,
        voiceId,
        speed: 1.05,
        status: 'idle',
      },
      animation: {
        motionStyle: idx % 2 === 0 ? 'spring-snappy' : 'step-reveal',
        effect,
        accentColor: meta.accentColor,
        showSubtitles: true,
        showProgressHud: true,
      },
    };
  });
}

export async function generateVideoPlanWithLlm(params: GeneratePlanParams): Promise<{
  title: string;
  subtitle: string;
  scenes: SceneSpec[];
  mode: 'llm' | 'smart-fallback';
  note: string;
}> {
  const cfg = resolveLlmConfig(params.llmConfig);
  const provider = params.defaultTtsProvider || 'openformosa';
  const language = getContentLanguage(params.language || DEFAULT_CONTENT_LANGUAGE);
  const targetDuration = Math.max(15, Math.min(1800, Math.round(params.durationSeconds || 60)));
  const recommendedScenes = Math.max(3, Math.min(24, Math.round(targetDuration / 10)));

  const canCallLlm = Boolean(cfg.apiKey || isLocalLlmEndpoint(cfg.baseUrl));

  if (!canCallLlm && language.value !== DEFAULT_CONTENT_LANGUAGE) {
    throw new Error('其他語言需要可用的 LLM。請先設定 GNAI Token 或本機 LLM 服務。');
  }

  if (canCallLlm) {
    try {
      const systemPrompt = `You are a senior technical video director and Remotion motion-graphics designer.
Given a topic, total video duration (in seconds), and optional reference notes, generate a complete multi-scene Remotion training video plan as strict JSON.

CRITICAL RULES:
1. Total sum of all scenes' durationSeconds MUST equal ${targetDuration} seconds. Aim for ~${recommendedScenes} scenes (each 5–20 seconds).
2. LANGUAGE AND SPEECH PACING (VERY IMPORTANT):
  - Write ALL video content in ${language.promptName}: titles, subtitles, narration, key points, visual descriptions, and diagram labels. Translate reference notes when necessary. Preserve technical acronyms, model numbers, units, and product names.
  - Spoken ${language.promptName} runs at approximately ${language.charsPerSecond} characters per second. Keep each script near ${Math.round(language.charsPerSecond * 0.9)} characters per second of scene duration so the narration finishes cleanly.
3. SCRIPT vs GRAPHIC SEPARATION (VERY IMPORTANT):
   - "keyPoints" and "diagramData" labels MUST be short, scannable visual anchors (keywords, component names, metrics, 2–8 words max).
  - "script" (spoken narration) MUST NOT simply read out the text on the graphic! Instead, explain the WHY, HOW, physical intuition, cause-and-effect, or real-world engineering story that complements the visual.
3. EFFECT-TO-SCRIPT ALIGNMENT:
   - Every scene MUST choose the best "template" from: ["title-hero", "architecture-flow", "signal-waveform", "protocol-timeline", "comparison-matrix", "debug-checklist", "summary-takeaways"].
   - Every scene MUST choose a matching "effect" from: ["signal-pulse", "glitch-alert", "cascade-reveal", "zoom-focus", "sweep-scan"] that directly animates what the 台詞 (script) is describing (e.g., if script talks about noise/droop/failure, use "glitch-alert" + "signal-waveform" with faultChannelIndex; if script talks about signal flow, use "signal-pulse" + "architecture-flow"; if script talks about step-by-step timing, use "cascade-reveal" + "protocol-timeline"; if script talks about comparing options, use "zoom-focus" + "comparison-matrix"; if script talks about probing/checking, use "sweep-scan").
   - Provide topic-specific "diagramData" matching the template:
     * architecture-flow: { nodes: [{id, label, sublabel, color}], highlightNodeIndex, visualCaption }
     * signal-waveform: { waveformChannels: [{label, color, type: "clock"|"data"|"rf-sine"|"ofdma"}], faultChannelIndex, visualCaption }
     * protocol-timeline: { protocolSteps: [{actor, target, message, timing}], activeStepIndex, visualCaption }
     * comparison-matrix: { comparisonHeaders: [string, string], comparisonRows: [{metric, optionA, optionB, highlight: "A"|"B"}], visualCaption }
     * title-hero / debug-checklist / summary-takeaways: { visualCaption }

Return JSON schema:
{
  "title": "string",
  "subtitle": "string",
  "scenes": [
    {
      "title": "string",
      "subtitle": "string",
      "durationSeconds": number,
      "template": "title-hero|architecture-flow|signal-waveform|protocol-timeline|comparison-matrix|debug-checklist|summary-takeaways",
      "effect": "signal-pulse|glitch-alert|cascade-reveal|zoom-focus|sweep-scan",
      "visualDescription": "string describing what the Remotion graphic + effect shows and why it matches the script",
      "keyPoints": ["short visual anchor 1", "short visual anchor 2", "short visual anchor 3"],
      "script": "Natural spoken Traditional Chinese narration that explains the concept without reading the graphic verbatim",
      "diagramData": { ... }
    }
  ]
}`;

      const userPrompt = `Output language: ${language.promptName}
    Topic: ${params.topic}
Target Duration: ${targetDuration} seconds
Domain: ${DOMAIN_META[params.domain].label}
${params.rawText ? `Reference Notes:\n${params.rawText.slice(0, 3000)}` : ''}`;

      const rawResult = (await callChatCompletionJson(cfg, systemPrompt, userPrompt)) as LlmPlanPayload;
      if (rawResult && Array.isArray(rawResult.scenes) && rawResult.scenes.length > 0) {
        const balanced = normalizeDurationsToTarget(rawResult.scenes, targetDuration);
        rawResult.scenes.forEach((s, i) => {
          s.durationSeconds = balanced[i];
        });
        return {
          title: rawResult.title || params.topic,
          subtitle: rawResult.subtitle || DOMAIN_META[params.domain].description,
          scenes: toSceneSpecs(rawResult, params.domain, provider, params.topic),
          mode: 'llm',
          note: `已由 LLM (${cfg.model}) 自動生成台詞與對應 Remotion 動態圖表`,
        };
      }
    } catch (err) {
      console.warn('LLM plan generation failed, falling back to smart generator:', err);
      if (language.value !== DEFAULT_CONTENT_LANGUAGE) {
        throw new Error(`無法以${language.label}生成內容，請確認 LLM 服務可用後重試。`);
      }
      const fallback = generateFallbackPlan({ ...params, durationSeconds: targetDuration });
      return {
        title: fallback.title,
        subtitle: fallback.subtitle,
        scenes: toSceneSpecs(fallback, params.domain, provider, params.topic),
        mode: 'smart-fallback',
        note: `LLM 連線失敗 (${err instanceof Error ? err.message : 'error'})，已自動切換為智慧規則引擎生成`,
      };
    }
  }

  const fallback = generateFallbackPlan({ ...params, durationSeconds: targetDuration });
  return {
    title: fallback.title,
    subtitle: fallback.subtitle,
    scenes: toSceneSpecs(fallback, params.domain, provider, params.topic),
    mode: 'smart-fallback',
    note: '未設定 LLM API Key，已使用內建智慧引擎生成（可於設定中填入 OpenAI / 本地 Ollama 金鑰以啟用雲端 LLM）',
  };
}

export async function regenerateSceneWithLlm(params: RegenerateSceneParams): Promise<{
  scenePatch: Partial<SceneSpec>;
  mode: 'llm' | 'smart-fallback';
  note: string;
}> {
  const { topic, scene, action } = params;
  const cfg = resolveLlmConfig(params.llmConfig);
  const language = getContentLanguage(params.language || DEFAULT_CONTENT_LANGUAGE);
  const canCallLlm = Boolean(cfg.apiKey || isLocalLlmEndpoint(cfg.baseUrl));

  if (!canCallLlm && language.value !== DEFAULT_CONTENT_LANGUAGE) {
    throw new Error('其他語言的腳本重寫需要可用的 LLM。請先設定 GNAI Token 或本機 LLM 服務。');
  }

  if (canCallLlm) {
    try {
      const systemPrompt = `You are a Remotion motion-graphics director and technical scriptwriter.
Return strict JSON updating a single scene.
CRITICAL:
- Write any regenerated narration and visual text in ${language.promptName}. Preserve technical acronyms and identifiers.
- The spoken "script" (台詞) MUST NOT just read the "keyPoints" or diagram labels. Script explains WHY/HOW; graphics show concise visual anchors.
- The "template", "effect", and "diagramData" MUST visually match what the "script" is describing.
Valid templates: ["title-hero","architecture-flow","signal-waveform","protocol-timeline","comparison-matrix","debug-checklist","summary-takeaways"]
Valid effects: ["signal-pulse","glitch-alert","cascade-reveal","zoom-focus","sweep-scan"]

Return JSON:
{
  "template": "...",
  "effect": "...",
  "visualDescription": "...",
  "keyPoints": ["..."],
  "script": "...",
  "diagramData": { ... }
}`;

      const userPrompt = `Output language: ${language.promptName}
    Action: ${action}
Video Topic: ${topic}
Scene Title: ${scene.title}
Current Script (台詞): ${scene.script}
Current Template: ${scene.template}
Current KeyPoints: ${JSON.stringify(scene.keyPoints)}
Current DiagramData: ${JSON.stringify(scene.diagramData || {})}

Instructions:
${
  action === 'sync-visual-to-script'
    ? 'Keep the current script mostly intact, and redesign template, effect, visualDescription, keyPoints (concise visual labels, NOT repeating script), and diagramData so the Remotion graphic and animation effect match what the script is describing.'
    : action === 'rewrite-script-no-read'
    ? 'Keep the current graphic/template/diagramData, and rewrite ONLY the script (Traditional Chinese + English terms) so it explains the story/causality behind the graphic instead of reading the graphic text verbatim.'
    : 'Regenerate both a fresh explanatory script and matching Remotion graphic/effect/diagramData.'
}`;

      const res = (await callChatCompletionJson(cfg, systemPrompt, userPrompt)) as Partial<LlmScenePayload>;
      const nextTemplate = clampTemplate(res.template, scene.index, scene.index + 2);
      const nextScript =
        action === 'sync-visual-to-script' ? scene.script : (res.script || scene.script).trim();
      const nextEffect = clampEffect(res.effect, nextTemplate, nextScript);

      return {
        scenePatch: {
          template: action === 'rewrite-script-no-read' ? scene.template : nextTemplate,
          script: nextScript,
          visualDescription: res.visualDescription || scene.visualDescription,
          keyPoints:
            action === 'rewrite-script-no-read'
              ? scene.keyPoints
              : Array.isArray(res.keyPoints) && res.keyPoints.length > 0
              ? res.keyPoints.slice(0, 4)
              : scene.keyPoints,
          diagramData:
            action === 'rewrite-script-no-read'
              ? scene.diagramData
              : res.diagramData || buildSmartFallbackDiagram(topic, scene.domain, nextTemplate, nextEffect, nextScript),
          animation: {
            ...scene.animation,
            effect: action === 'rewrite-script-no-read' ? scene.animation.effect : nextEffect,
          },
        },
        mode: 'llm',
        note: `已透過 LLM (${cfg.model}) 完成更新`,
      };
    } catch (err) {
      if (language.value !== DEFAULT_CONTENT_LANGUAGE) {
        throw new Error(`無法以${language.label}更新場景，請確認 LLM 服務可用後重試。`);
      }
      console.warn('LLM scene regenerate failed, using smart fallback:', err);
    }
  }

  // Smart fallback for edit actions
  if (action === 'sync-visual-to-script') {
    const nextTemplate = inferTemplateFromScript(scene.script, scene.template);
    const nextEffect = inferEffectFromScriptAndTemplate(scene.script, nextTemplate);
    const nextDiagram = buildSmartFallbackDiagram(
      scene.title || topic,
      scene.domain,
      nextTemplate,
      nextEffect,
      scene.script
    );
    return {
      scenePatch: {
        template: nextTemplate,
        visualDescription: `依台詞自動匹配：${nextTemplate} + ${nextEffect} 特效`,
        diagramData: nextDiagram,
        animation: {
          ...scene.animation,
          effect: nextEffect,
        },
      },
      mode: 'smart-fallback',
      note: '已依台詞語意自動匹配 Remotion 圖表與動畫特效',
    };
  }

  if (action === 'rewrite-script-no-read') {
    const rewritten = `在「${scene.title}」這個環節中，畫面上標示的只是關鍵量測指標；真正決定系統成敗的，是訊號在極限負載下的邊界餘裕與前後級時序配合，這也是我們在除錯時最需要優先釐清的因果關鍵。`;
    return {
      scenePatch: {
        script: rewritten,
      },
      mode: 'smart-fallback',
      note: '已改寫為不照唸畫面的因果解說台詞',
    };
  }

  const nextTemplate = inferTemplateFromScript(scene.title, scene.template);
  const nextEffect = inferEffectFromScriptAndTemplate(scene.title, nextTemplate);
  const nextScript = `針對「${scene.title}」，請觀察畫面上的結構關係：我們關注的不只是靜態規格，而是動態切換瞬間是否會引發連鎖時序異常。`;
  return {
    scenePatch: {
      template: nextTemplate,
      script: nextScript,
      visualDescription: `重新生成：${nextTemplate} + ${nextEffect}`,
      diagramData: buildSmartFallbackDiagram(scene.title, scene.domain, nextTemplate, nextEffect, nextScript),
      animation: {
        ...scene.animation,
        effect: nextEffect,
      },
    },
    mode: 'smart-fallback',
    note: '已重新生成台詞與匹配的 Remotion 視覺特效',
  };
}
