import https from 'node:https';
import {
  ContentLanguage,
  DEFAULT_CONTENT_LANGUAGE,
  DOMAIN_META,
  getContentLanguage,
  LlmConfig,
  PptxSlideData,
  RemotionEffect,
  RemotionPrimitive,
  SceneDiagramData,
  SceneSpec,
  TechDomain,
  TtsProvider,
  VisualTemplate,
} from '../src/types/training';
import { inferDomainFromText, isTechDomain } from '../src/utils/domainInference';
import { generateCaptionsFromScript } from '../src/utils/captions';
import {
  applyDeterministicRegionalFixes,
  collectSceneTextForTermCheck,
  findRegionalTermMatches,
  getRegionalTerminologyPromptGuidance,
} from '../src/utils/regionalTerms';

export interface GeneratePlanParams {
  topic: string;
  durationSeconds: number;
  domain?: TechDomain | 'auto';
  rawText?: string;
  pptxSlides?: PptxSlideData[];
  defaultTtsProvider?: TtsProvider;
  language?: ContentLanguage;
  odmMode?: boolean;
  colorPalette?: string[];
  llmConfig?: Partial<LlmConfig>;
}

type ResolvedGeneratePlanParams = Omit<GeneratePlanParams, 'domain'> & { domain: TechDomain };

export interface RegenerateSceneParams {
  topic: string;
  rawText?: string;
  scene: SceneSpec;
  action: 'sync-visual-to-script' | 'rewrite-script-no-read' | 'regenerate-both';
  language?: ContentLanguage;
  odmMode?: boolean;
  llmConfig?: Partial<LlmConfig>;
}

interface LlmScenePayload {
  title: string;
  subtitle?: string;
  durationSeconds: number;
  template: VisualTemplate;
  effect: RemotionEffect;
  visualDescription: string;
  remotionPrimitives?: RemotionPrimitive[];
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
  'packet-frame',
  'state-machine',
  'code-log',
  'kpi-metrics',
  'fault-tree',
  'packet-simulator',
  'ofdm-spectrum',
  'beamforming-array',
  'qam-constellation',
  'mlo-multilink',
  'rf-link-budget',
  'summary-takeaways',
];

const VALID_EFFECTS: RemotionEffect[] = [
  'signal-pulse',
  'glitch-alert',
  'cascade-reveal',
  'zoom-focus',
  'sweep-scan',
  'packet-traffic',
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

export function getEnvLlmStatus(): {
  configured: boolean;
  source: 'env' | 'none';
  baseUrl: string;
  model: string;
} {
  const cfg = resolveLlmConfig();
  const configured = Boolean(cfg.apiKey);
  return {
    configured,
    source: configured ? 'env' : 'none',
    baseUrl: cfg.baseUrl,
    model: cfg.model,
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

function inferPrimitivesFromScript(script: string, visualDescription?: string): RemotionPrimitive[] {
  const context = `${script} ${visualDescription || ''}`.toLowerCase();
  const selected = new Set<RemotionPrimitive>();

  if (/標題|關鍵字|caption|headline|narrat|台詞|逐字|口語|karaoke/.test(context)) selected.add('kinetic-caption');
  if (/trace|tracepath|路徑|走線|pcb|頻率|rf|訊號|封包|波形|trace/.test(context)) selected.add('svg-trace-path');
  if (/警告|badge|重點|名詞|提示|gotcha|狀態|完成|成功|失敗/.test(context)) selected.add('pop-badge');
  if (/架構|比較|matrix|區塊|card|分層|stack|active|highlight|state/.test(context)) selected.add('state-card');
  if (/計數|秒|count|counter|timer|倍率|速度|hops|百分比|進度/.test(context)) selected.add('animated-counter');
  if (/zoom|pan|聚焦|放大|近觀|區域|quadrant|細節|camera/.test(context)) selected.add('camera-pan-zoom');
  if (/比較.*(長條|數值)|長條圖|bar chart|comparison bars/.test(context)) selected.add('comparison-bars');
  if (/圓餅|環形|donut|比例環/.test(context)) selected.add('donut-chart');
  if (/儀表|gauge|量表|分數/.test(context)) selected.add('gauge-dial');
  if (/筆記|工程紀錄|格線|notebook|grid paper|handwritten/.test(context)) selected.add('notebook-paper');
  if (/紙張|文件質感|白皮書|paper texture|document|report/.test(context)) selected.add('paper-texture');

  if (selected.size === 0) {
    selected.add('kinetic-caption');
    selected.add('pop-badge');
  }
  return [...selected];
}

function extractOutlinePrimitiveSuggestions(
  outlineText: string,
  sceneTitle: string,
  sceneIndex: number
): RemotionPrimitive[] {
  const outline = outlineText.trim();
  if (!outline) return [];

  const sceneChunks = outline
    .split(/(?=\n?Scene\s*\d+\s*:|\n?場景\s*\d+\s*[：:]?|^Scene\s*\d+\s*:)/im)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  let matchedChunk = sceneChunks.find((chunk, chunkIndex) => {
    const titleMatch = sceneTitle && chunk.toLowerCase().includes(sceneTitle.toLowerCase());
    const sceneNumberMatch = new RegExp(`(?:Scene\\s*${sceneIndex + 1}|場景\\s*${sceneIndex + 1})(?:\\s*[：:]|\\s|$)`, 'i').test(chunk);
    return titleMatch || sceneNumberMatch || (!titleMatch && chunkIndex === 0 && sceneIndex === 0);
  });

  if (!matchedChunk && sceneChunks.length > 0) {
    matchedChunk = sceneChunks[sceneIndex] || sceneChunks[sceneChunks.length - 1];
  }

  const chunk = matchedChunk || outline;
  const comboMatch = chunk.match(/(?:Element\s*Combo|元素\s*組合|Remotion\s*(?:Element|Primitive)s?|元素建議|Remotion\s*element\s*suggestions)[^\n:：]*[:：]\s*([^\n]+)/i);
  if (!comboMatch?.[1]) return [];
  const source = comboMatch[1];

  const candidates = new Set<RemotionPrimitive>();
  const identifierPattern = /[A-Z][A-Za-z0-9]*(?:-[A-Z_a-z][A-Za-z0-9_-]*)?|[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)+/g;
  for (const match of source.match(identifierPattern) || []) {
    const name = match.trim();
    if (!name) continue;
    if (/^(Scene|Element|Combo|Primitive|Remotion|Every|Frame|Second|Loop|Use|Show|The|With|For|and|or)$/i.test(name)) continue;
    if (/^\d+(?:\.\d+)?(?:s|fps|frames?)?$/i.test(name)) continue;
    candidates.add(name);
  }

  return [...candidates].slice(0, 4);
}

function resolveScenePrimitives(
  outlineText: string,
  sceneTitle: string,
  sceneIndex: number,
  llmValue: unknown,
  script: string,
  visualDescription?: string
): RemotionPrimitive[] {
  const outlineSuggestions = extractOutlinePrimitiveSuggestions(outlineText, sceneTitle, sceneIndex);
  if (outlineSuggestions.length > 0) return outlineSuggestions;
  return clampPrimitives(llmValue, script, visualDescription);
}

function clampPrimitives(value: unknown, script: string, visualDescription?: string): RemotionPrimitive[] {
  if (Array.isArray(value)) {
    const selected = [...new Set(value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0))].slice(0, 4);
    if (selected.length > 0) return selected;
  }
  return inferPrimitivesFromScript(script, visualDescription).slice(0, 4);
}

function limitDiagramDensity(diagramData: SceneDiagramData): SceneDiagramData {
  return {
    ...diagramData,
    nodes: diagramData.nodes?.slice(0, 5),
    waveformChannels: diagramData.waveformChannels?.slice(0, 3),
    protocolSteps: diagramData.protocolSteps?.slice(0, 4),
    comparisonRows: diagramData.comparisonRows?.slice(0, 4),
    packetFields: diagramData.packetFields?.slice(0, 6),
    stateNodes: diagramData.stateNodes?.slice(0, 5),
    stateTransitions: diagramData.stateTransitions?.slice(0, 5),
    codeLines: diagramData.codeLines?.slice(0, 6),
    kpiMetrics: diagramData.kpiMetrics?.slice(0, 4),
    faultBranches: diagramData.faultBranches?.slice(0, 3),
    simChannels: diagramData.simChannels?.slice(0, 3),
    simPackets: diagramData.simPackets?.slice(0, 6),
    ofdmRuBlocks: diagramData.ofdmRuBlocks?.slice(0, 6),
    mloLinks: diagramData.mloLinks?.slice(0, 3),
    rfLinkStages: diagramData.rfLinkStages?.slice(0, 6),
    visualCaption: diagramData.visualCaption?.slice(0, 90),
  };
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
  if (template === 'packet-frame') return 'sweep-scan';
  if (template === 'state-machine') return 'cascade-reveal';
  if (template === 'code-log') return 'sweep-scan';
  if (template === 'kpi-metrics') return 'zoom-focus';
  if (template === 'fault-tree') return 'cascade-reveal';
  if (template === 'packet-simulator') return 'packet-traffic';
  if (template === 'ofdm-spectrum') return 'sweep-scan';
  if (template === 'beamforming-array') return 'sweep-scan';
  if (template === 'qam-constellation') return 'zoom-focus';
  if (template === 'mlo-multilink') return 'cascade-reveal';
  if (template === 'rf-link-budget') return 'cascade-reveal';
  return 'signal-pulse';
}

export function inferTemplateFromScript(script: string, current?: VisualTemplate): VisualTemplate {
  const s = script.toLowerCase();
  if (/多通道.*封包|封包模擬|模擬傳輸|重傳.*通道|packet sim|multi-channel packet|channel.*packet/.test(s)) {
    return 'packet-simulator';
  }
  if (/ofdm|ofdma|副載波|subcarrier|resource unit|preamble puncturing|頻譜分配/.test(s)) {
    return 'ofdm-spectrum';
  }
  if (/波束成形|相控陣列|beamforming|phased array|null steering|陣列天線/.test(s)) {
    return 'beamforming-array';
  }
  if (/星座圖|qam|evm|constellation|i\/q|調變階數/.test(s)) {
    return 'qam-constellation';
  }
  if (/mlo|多鏈路|multi-link|emlsr|str.*link|三頻聚合/.test(s)) {
    return 'mlo-multilink';
  }
  if (/鏈路預算|link budget|fspl|路徑損耗|path loss|接收靈敏度|link margin/.test(s)) {
    return 'rf-link-budget';
  }
  if (/封包|訊框|標頭|欄位|packet|frame|header|payload|beacon|eapol|tlv|fcs/.test(s)) {
    return 'packet-frame';
  }
  if (/狀態機|狀態轉移|切換狀態|state machine|fsm|ltssm|transition/.test(s)) {
    return 'state-machine';
  }
  if (/程式碼|指令|暫存器|日誌|log|dmesg|register|cli|0x|trace/.test(s)) {
    return 'code-log';
  }
  if (/效能指標|量測數據|吞吐量|kpi|metric|throughput|latency|snr|evm|rssi|gbps/.test(s)) {
    return 'kpi-metrics';
  }
  if (/根因|決策樹|故障樹|分支排查|fault tree|root cause|decision tree|symptom/.test(s)) {
    return 'fault-tree';
  }
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
  const buildBody = (modelName: string, useJsonMode: boolean, includeTemp: boolean) => {
    const payload: Record<string, unknown> = {
      model: modelName,
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
  let activeModel = cfg.model;
  let resp = await postJsonWithTlsFallback(urlStr, headers, buildBody(activeModel, true, !isFixedTempModel));

  if (
    (resp.status === 404 || resp.status === 400) &&
    /not\s*found|unknown\s*model|invalid\s*model|does\s*not\s*exist/i.test(resp.text) &&
    activeModel.trim() !== DEFAULT_GNAI_MODEL
  ) {
    console.warn(
      `[LLM] Model "${activeModel}" unavailable on ${cfg.baseUrl} (HTTP ${resp.status}); retrying with default "${DEFAULT_GNAI_MODEL}".`
    );
    activeModel = DEFAULT_GNAI_MODEL;
    resp = await postJsonWithTlsFallback(urlStr, headers, buildBody(activeModel, true, false));
  }

  if (resp.status === 400) {
    // Retry without response_format / temperature in case provider or model restricts them
    resp = await postJsonWithTlsFallback(urlStr, headers, buildBody(activeModel, false, false));
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

  if (template === 'packet-frame') {
    return {
      visualCaption: `${shortTopic} 協定封包欄位結構`,
      packetFields: [
        { name: 'Header', bits: '2B', value: '0x0080', description: '協定控制位元與封包類型旗標', color: '#38BDF8', highlight: true },
        { name: 'Addr / ID', bits: '6B', value: 'SRC / DST', description: '來源與目的端識別位址', color: '#6366F1' },
        { name: 'Payload', bits: '0–1500B', value: `${shortTopic} IE`, description: '主要協商參數與資料負載', color: '#10B981', highlight: true },
        { name: 'CRC / FCS', bits: '4B', value: 'CRC-32', description: '整幀完整性校驗，錯誤即丟棄重傳', color: '#F59E0B' },
      ],
    };
  }

  if (template === 'state-machine') {
    return {
      visualCaption: `${shortTopic} 核心狀態機轉移流程`,
      stateNodes: [
        { id: 'init', label: 'INIT', sublabel: '掃描 / 偵測', status: 'normal' },
        { id: 'negotiate', label: 'NEGOTIATE', sublabel: '認證 / 參數協商', status: 'active' },
        { id: 'active', label: 'ACTIVE', sublabel: '穩定傳輸', status: 'success' },
        { id: 'recover', label: 'RECOVERY', sublabel: '逾時重試', status: 'error' },
      ],
      stateTransitions: [
        { from: 'init', to: 'negotiate', trigger: 'Detect OK' },
        { from: 'negotiate', to: 'active', trigger: 'Handshake OK' },
        { from: 'active', to: 'recover', trigger: 'Timeout / CRC Err', isErrorPath: true },
      ],
    };
  }

  if (template === 'code-log') {
    return {
      codeLanguage: 'log',
      codeTitle: `${shortTopic} 實機診斷日誌`,
      visualCaption: '關鍵 Log 判讀與異常觸發點',
      codeLines: [
        { lineNo: 1, text: `[00.120] ${shortTopic}: init handshake start`, level: 'normal' },
        { lineNo: 2, text: `[00.145] ${shortTopic}: capability negotiated OK`, level: 'success', annotation: '基礎能力協商完成' },
        { lineNo: 3, text: `[00.210] ${shortTopic}: timeout waiting for response (err=-110)`, level: 'error', annotation: '關鍵異常點：回應逾時，需檢查實體鏈路或參數設定' },
        { lineNo: 4, text: `[00.215] ${shortTopic}: fallback recovery triggered`, level: 'warn', annotation: '系統自動觸發降速或重連機制' },
      ],
    };
  }

  if (template === 'kpi-metrics') {
    return {
      visualCaption: `${shortTopic} 關鍵量測與效能指標`,
      kpiMetrics: [
        { label: 'Peak Throughput', value: '4.8 Gbps', delta: '+85%', target: '> 4.0 Gbps', status: 'good' },
        { label: 'P99 Latency', value: '3.2 ms', delta: '-60%', target: '< 5.0 ms', status: 'good' },
        { label: 'Error Rate', value: '0.35%', delta: '需關注', target: '< 0.1%', status: 'warn' },
        { label: 'Link Margin', value: '+12 dB', delta: 'PASS', target: '> +6 dB', status: 'good' },
      ],
    };
  }

  if (template === 'fault-tree') {
    return {
      visualCaption: `${shortTopic} 根因排查決策樹`,
      faultRoot: `${shortTopic} 連線不穩或效能未達標`,
      faultBranches: [
        { symptom: '實體訊號強度不足', check: '量測電源軌 / 天線 S11 與接頭', passAction: '硬體正常，轉查干擾', failRootCause: '阻抗失配或供電壓降', severity: 'high' },
        { symptom: '高重傳與封包遺失', check: '檢查鄰近高速匯流排 EMI 底噪', passAction: '底噪正常，轉查協定', failRootCause: 'USB3 / DDR 雜訊耦合導致去敏', severity: 'high' },
        { symptom: '交握階段逾時中斷', check: '抓包比對狀態機與驅動 Log', passAction: '協定正常，檢查上層網路', failRootCause: '韌體相容性或安全參數不符', severity: 'medium' },
      ],
    };
  }

  if (template === 'packet-simulator') {
    return {
      visualCaption: `${shortTopic} 多通道封包傳輸模擬 (A ↔ B)`,
      simDeviceA: { name: 'Device A (Wi-Fi 7 AP)', role: 'Transmitter / Scheduler', ipOrMac: 'AA:BB:CC:01:00:01' },
      simDeviceB: { name: 'Device B (Client STA)', role: 'Receiver / Multi-Link NIC', ipOrMac: 'DD:EE:FF:02:00:88' },
      simChannels: [
        { id: 'ch1', label: 'CH 1', band: '2.4 GHz', bandwidth: '40 MHz', color: '#F59E0B', interference: true },
        { id: 'ch36', label: 'CH 36', band: '5 GHz', bandwidth: '160 MHz', color: '#38BDF8', interference: false },
        { id: 'ch69', label: 'CH 69', band: '6 GHz', bandwidth: '320 MHz', color: '#34D399', interference: false },
      ],
      simPackets: [
        { seq: 1, channelId: 'ch1', direction: 'A->B', label: 'BEACON', sizeBytes: 128, status: 'ok' },
        { seq: 2, channelId: 'ch36', direction: 'A->B', label: 'DATA #01', sizeBytes: 1500, status: 'ok' },
        { seq: 3, channelId: 'ch69', direction: 'A->B', label: 'DATA #02', sizeBytes: 1500, status: 'ok' },
        { seq: 4, channelId: 'ch1', direction: 'A->B', label: 'DATA #03', sizeBytes: 1500, status: 'retry' },
        { seq: 5, channelId: 'ch36', direction: 'B->A', label: 'BA-ACK', sizeBytes: 64, status: 'ack' },
        { seq: 6, channelId: 'ch69', direction: 'A->B', label: 'DATA #03 RETX', sizeBytes: 1500, status: 'ok' },
        { seq: 7, channelId: 'ch69', direction: 'B->A', label: 'BA-ACK', sizeBytes: 64, status: 'ack' },
      ],
    };
  }

  if (template === 'ofdm-spectrum') {
    return {
      visualCaption: `${shortTopic} OFDMA 頻譜與 RU 分配`,
      ofdmBandwidthMhz: 320,
      ofdmRuBlocks: [
        { label: 'RU 484 • STA-1', tones: '484 tones', widthRatio: 0.28, color: '#38BDF8' },
        { label: 'PUNCTURED (Interferer)', tones: '20 MHz Notch', widthRatio: 0.16, color: '#EF4444', punctured: true },
        { label: 'RU 996 • STA-2', tones: '996 tones', widthRatio: 0.34, color: '#34D399' },
        { label: 'RU 242 • IoT', tones: '242 tones', widthRatio: 0.22, color: '#A78BFA' },
      ],
    };
  }

  if (template === 'beamforming-array') {
    return {
      visualCaption: `${shortTopic} 相控陣列與波束成形`,
      beamformingElements: 8,
      beamformingTargetAngleDeg: -16,
      beamformingTargetLabel: 'Target STA',
    };
  }

  if (template === 'qam-constellation') {
    return {
      visualCaption: `${shortTopic} QAM 星座圖與 EVM / SNR`,
      qamOrder: 64,
      qamSnrDb: 34.5,
      qamEvmDb: -35.2,
    };
  }

  if (template === 'mlo-multilink') {
    return {
      visualCaption: `${shortTopic} Wi-Fi 7 MLO 多鏈路排程`,
      mloLinks: [
        { band: '6 GHz Link', channel: 'CH 69', bandwidth: '320 MHz', color: '#34D399', throughputMbps: 4200, mode: 'STR' },
        { band: '5 GHz Link', channel: 'CH 36', bandwidth: '160 MHz', color: '#38BDF8', throughputMbps: 2100, mode: 'STR' },
        { band: '2.4 GHz Link', channel: 'CH 1', bandwidth: '40 MHz', color: '#F59E0B', throughputMbps: 450, mode: 'EMLSR' },
      ],
    };
  }

  if (template === 'rf-link-budget') {
    return {
      visualCaption: `${shortTopic} RF 鏈路預算與 SNR 餘裕`,
      rfSensitivityDbm: -78,
      rfLinkStages: [
        { label: 'TX Power', deltaDb: 20, note: 'PA Output', type: 'tx' },
        { label: 'TX Ant Gain', deltaDb: 4, note: 'MIMO Array', type: 'gain' },
        { label: 'FSPL', deltaDb: -72, note: 'Path Loss', type: 'loss' },
        { label: 'Wall Loss', deltaDb: -14, note: 'Attenuation', type: 'loss' },
        { label: 'RX Ant Gain', deltaDb: 2, note: 'Client Ant', type: 'gain' },
        { label: 'RX Power', deltaDb: -60, note: 'RSSI', type: 'rx' },
      ],
    };
  }

  return {
    visualCaption: /排查|除錯|檢查/.test(script) ? '逐步隔離驗證 SOP' : `${shortTopic} 核心架構`,
  };
}

function generateFallbackPlan(params: ResolvedGeneratePlanParams): LlmPlanPayload {
  const { topic, durationSeconds, domain, rawText } = params;
  const meta = DOMAIN_META[domain];
  const sceneCount = Math.max(3, Math.min(48, Math.round(durationSeconds / 10)));

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
    const spokenContext = params.odmMode
      ? `先用生活情境理解「${topic}」：把它想成一個有入口、規則、流量和例外狀況的系統。專業術語只是用來準確描述這些步驟。${contextHint}`
      : contextHint;

    selected.push({
      title: bp.title,
      subtitle: `${meta.badge} • SCENE ${i + 1}`,
      durationSeconds: Math.round(durationSeconds / sceneCount),
      template: bp.template,
      effect: bp.effect,
      visualDescription: bp.visualDescription,
      keyPoints: bp.keyPoints,
      script: spokenContext,
      diagramData: buildSmartFallbackDiagram(topic, domain, bp.template, bp.effect, spokenContext),
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

const DIVERSE_TEMPLATE_ROTATION: VisualTemplate[] = [
  'title-hero',
  'architecture-flow',
  'signal-waveform',
  'protocol-timeline',
  'comparison-matrix',
  'debug-checklist',
  'packet-frame',
  'state-machine',
  'code-log',
  'kpi-metrics',
  'fault-tree',
  'packet-simulator',
  'ofdm-spectrum',
  'beamforming-array',
  'qam-constellation',
  'mlo-multilink',
  'rf-link-budget',
  'summary-takeaways',
];

const DIVERSE_EFFECT_ROTATION: RemotionEffect[] = [
  'signal-pulse',
  'glitch-alert',
  'cascade-reveal',
  'zoom-focus',
  'sweep-scan',
  'packet-traffic',
];

function chooseDiverseTemplate(
  desired: VisualTemplate,
  idx: number,
  previousTemplates: VisualTemplate[]
): VisualTemplate {
  if (idx === 0) return desired === 'pptx-slide' ? 'title-hero' : desired;

  const recent = previousTemplates.slice(-3);
  if (!recent.includes(desired)) return desired;

  // Auto and manual domain labels do not control scene animation choices.
  // Rotate through the full template palette based on variety instead.
  const candidates = DIVERSE_TEMPLATE_ROTATION;
  const start = idx % candidates.length;
  for (let offset = 0; offset < candidates.length; offset++) {
    const candidate = candidates[(start + offset) % candidates.length];
    if (!recent.includes(candidate) && candidate !== 'pptx-slide') return candidate;
  }
  return desired;
}

function chooseDiverseEffect(
  desired: RemotionEffect,
  idx: number,
  previousEffects: RemotionEffect[]
): RemotionEffect {
  const recent = previousEffects.slice(-2);
  if (!recent.includes(desired)) return desired;

  const start = idx % DIVERSE_EFFECT_ROTATION.length;
  for (let offset = 0; offset < DIVERSE_EFFECT_ROTATION.length; offset++) {
    const candidate = DIVERSE_EFFECT_ROTATION[(start + offset) % DIVERSE_EFFECT_ROTATION.length];
    if (!recent.includes(candidate)) return candidate;
  }
  return desired;
}

function toSceneSpecs(
  payload: LlmPlanPayload,
  domain: TechDomain,
  defaultTtsProvider: TtsProvider,
  topic: string,
  colorPalette?: string[],
  outlineText?: string
): SceneSpec[] {
  const meta = DOMAIN_META[domain];
  const voiceId = defaultTtsProvider === 'ming-3.0' ? 'ming-tech-zh-en' : 'formosa-pro-tw';
  const total = payload.scenes.length;
  const now = Date.now();

  const previousTemplates: VisualTemplate[] = [];
  const previousEffects: RemotionEffect[] = [];

  return payload.scenes.map((raw, idx) => {
    const clampedTemplate = clampTemplate(raw.template, idx, total);
    const template = chooseDiverseTemplate(clampedTemplate, idx, previousTemplates);
    const script = (raw.script || raw.title || '').trim();
    const clampedEffect = clampEffect(raw.effect, template, script);
    const effect = chooseDiverseEffect(clampedEffect, idx, previousEffects);
    previousTemplates.push(template);
    previousEffects.push(effect);
    const diagramData = limitDiagramDensity(
      raw.diagramData && Object.keys(raw.diagramData).length > 0
        ? raw.diagramData
        : buildSmartFallbackDiagram(topic, domain, template, effect, script)
    );

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
      captions: generateCaptionsFromScript(script, Math.max(3, Math.round(raw.durationSeconds || 8))),
      visualDescription: raw.visualDescription || `Remotion ${template} 搭配 ${effect} 特效`,
      remotionPrimitives: resolveScenePrimitives(
        outlineText || '',
        raw.title || `Scene ${idx + 1}`,
        idx,
        raw.remotionPrimitives,
        script,
        raw.visualDescription
      ),
      diagramData,
      tts: {
        provider: defaultTtsProvider,
        voiceId,
        speed: 0.95,
        status: 'idle',
      },
      animation: {
        motionStyle: idx % 2 === 0 ? 'spring-snappy' : 'step-reveal',
        effect,
        accentColor: colorPalette?.[idx % colorPalette.length] || meta.accentColor,
        showSubtitles: true,
        showProgressHud: true,
      },
    };
  });
}

function buildPptxFallbackScript(slide: PptxSlideData): string {
  if (slide.notes && slide.notes.trim().length > 5) {
    return slide.notes.trim();
  }
  const bodyLines = slide.bodyText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && l !== slide.title);
  if (bodyLines.length === 0) {
    return slide.title;
  }
  return `${slide.title}。${bodyLines.join('；')}`;
}

function buildPptxKeyPoints(slide: PptxSlideData): string[] {
  const lines = slide.bodyText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && l !== slide.title);
  if (lines.length === 0) return [slide.title.slice(0, 48)];
  return lines.slice(0, 4).map((l) => l.slice(0, 48));
}

async function generatePptxPlan(
  params: ResolvedGeneratePlanParams,
  pptxSlides: PptxSlideData[],
  cfg: LlmConfig,
  canCallLlm: boolean
): Promise<{
  title: string;
  subtitle: string;
  scenes: SceneSpec[];
  mode: 'llm' | 'smart-fallback';
  note: string;
}> {
  const provider = params.defaultTtsProvider || 'openformosa';
  const language = getContentLanguage(params.language || DEFAULT_CONTENT_LANGUAGE);
  const meta = DOMAIN_META[params.domain];
  const voiceId = provider === 'ming-3.0' ? 'ming-tech-zh-en' : 'formosa-pro-tw';
  const targetDuration = Math.max(
    pptxSlides.length * 3,
    Math.min(1800, Math.round(params.durationSeconds || pptxSlides.length * 10))
  );

  let llmScripts: { slideNumber: number; script: string; durationSeconds?: number; effect?: RemotionEffect }[] = [];
  let mode: 'llm' | 'smart-fallback' = 'smart-fallback';
  let note = '已依 PowerPoint 原版投影片 1:1 還原視覺，並依投影片內容生成對應旁白腳本';

  if (canCallLlm) {
    try {
      const systemPrompt = `You are a technical presentation narrator and Remotion video director.
The user imported a PowerPoint (.pptx) deck. Remotion will render EVERY slide 100% identically to the PowerPoint slide.
Your job is to generate the spoken narration script for EACH slide in exact order.

${params.odmMode ? `ODM BEGINNER-MODE RULE:
- Teach as if the audience consists of entry-level engineers with very little topic background.
- Start from a concrete everyday metaphor or familiar example, then explain the technical concept it maps to.
- Define jargon immediately in plain language. Avoid unexplained acronyms and abstract leaps.
- Explain one cause-and-effect step at a time, while keeping every script strictly aligned to its exact slide content.
- Use short spoken sentences and one practical example or analogy per slide.
` : ''}CRITICAL RULES:
1. You MUST return exactly ${pptxSlides.length} items in "slides", one for each slide (slideNumber 1..${pptxSlides.length}).
2. STRICT CONTENT MATCHING: Every slide's "script" MUST accurately match, cover, and explain the exact content shown on THAT slide (title, bullets, tables, numbers, terminology, and speaker notes). Do NOT invent unrelated topics or skip the slide's key points.
3. If speaker notes ("notes") are provided for a slide, faithfully incorporate them into the spoken script.
4. Write all scripts in ${language.promptName}. Preserve technical acronyms, numbers, units, and product/component names as written on the slide.
5. Spoken ${language.promptName} runs at ~${language.charsPerSecond} characters per second. Aim for total duration across all slides near ${targetDuration} seconds (each slide >= 3 seconds).
6. Choose a matching subtle Remotion effect from: ["signal-pulse", "glitch-alert", "cascade-reveal", "zoom-focus", "sweep-scan"].

Return strict JSON:
{
  "title": "string",
  "subtitle": "string",
  "slides": [
    {
      "slideNumber": 1,
      "durationSeconds": number,
      "effect": "signal-pulse|glitch-alert|cascade-reveal|zoom-focus|sweep-scan|packet-traffic",
      "script": "Natural spoken narration matching this exact slide's content"
    }
  ]
}`;

      const slideSummaries = pptxSlides.map((s) => ({
        slideNumber: s.slideNumber,
        title: s.title,
        content: s.bodyText.slice(0, 1200),
        notes: s.notes ? s.notes.slice(0, 800) : undefined,
      }));

      const userPrompt = `Output language: ${language.promptName}
Deck Title: ${params.topic}
Target Total Duration: ${targetDuration} seconds
Slides:
${JSON.stringify(slideSummaries, null, 2)}`;

      const raw = (await callChatCompletionJson(cfg, systemPrompt, userPrompt)) as {
        title?: string;
        subtitle?: string;
        slides?: { slideNumber: number; script: string; durationSeconds?: number; effect?: RemotionEffect }[];
      };

      if (raw && Array.isArray(raw.slides) && raw.slides.length > 0) {
        llmScripts = raw.slides;
        mode = 'llm';
        note = `已由 LLM (${cfg.model}) 依每張 PowerPoint 投影片內容精準生成對應腳本，並 100% 還原投影片視覺`;
      }
    } catch (err) {
      console.warn('LLM PPTX script generation failed, using slide content fallback:', err);
      if (language.value !== DEFAULT_CONTENT_LANGUAGE) {
        throw new Error(`無法以${language.label}生成投影片腳本，請確認 LLM 服務可用後重試。`);
      }
      note = `LLM 連線失敗，已直接依 PowerPoint 投影片文字與備忘稿生成對應腳本`;
    }
  }

  const now = Date.now();
  const rawScenes = pptxSlides.map((slide, idx) => {
    const matched = llmScripts.find((item) => item.slideNumber === slide.slideNumber) || llmScripts[idx];
    const script = (matched?.script || buildPptxFallbackScript(slide)).trim();
    const estDuration = Math.max(3, Math.ceil(script.length / Math.max(1, language.charsPerSecond) + 1));
    const durationSeconds = matched?.durationSeconds
      ? Math.max(3, Math.round(matched.durationSeconds))
      : estDuration;
    const effect = clampEffect(matched?.effect, 'pptx-slide', script);

    return {
      slide,
      script,
      durationSeconds,
      effect,
    };
  });

  const balancedDurations = normalizeDurationsToTarget(
    rawScenes.map((r) => ({
      title: r.slide.title,
      durationSeconds: r.durationSeconds,
      template: 'pptx-slide',
      effect: r.effect,
      visualDescription: '',
      keyPoints: [],
      script: r.script,
    })),
    targetDuration
  );

  const scenes: SceneSpec[] = rawScenes.map((r, idx) => ({
    id: `scene-${now}-${idx}`,
    index: idx,
    title: r.slide.title,
    subtitle: `SLIDE ${r.slide.slideNumber} / ${pptxSlides.length}`,
    domain: params.domain,
    template: 'pptx-slide',
    durationSeconds: balancedDurations[idx],
    keyPoints: buildPptxKeyPoints(r.slide),
    script: r.script,
    captions: generateCaptionsFromScript(r.script, balancedDurations[idx]),
    visualDescription: `100% 還原 PowerPoint 第 ${r.slide.slideNumber} 頁原始版面、文字、圖形、表格與圖片`,
    pptxSlide: r.slide,
    pptxNotes: r.slide.notes,
    tts: {
      provider,
      voiceId,
      speed: 0.95,
      status: 'idle',
    },
    animation: {
      motionStyle: 'smooth-sweep',
      effect: r.effect,
      accentColor: meta.accentColor,
      showSubtitles: true,
      showProgressHud: true,
    },
  }));

  const checked = await runRegionalTerminologyCheckStage({
    title: params.topic || pptxSlides[0]?.title || `${meta.shortLabel} PowerPoint 課程`,
    subtitle: `${pptxSlides.length} 張投影片 • 100% 原版視覺還原`,
    scenes,
    language: language.value,
    cfg,
    canCallLlm: canCallLlm && mode === 'llm',
    preservePptxTitles: true,
  });

  return {
    title: checked.title,
    subtitle: checked.subtitle,
    scenes: checked.scenes,
    mode,
    note: checked.checkNote ? `${note} • ${checked.checkNote}` : note,
  };
}

const SKIP_DIAGRAM_KEYS = new Set([
  'id',
  'color',
  'type',
  'status',
  'highlight',
  'codeLanguage',
  'severity',
]);

function applyDeterministicFixesToDiagramData<T>(value: T, language: ContentLanguage): { value: T; count: number } {
  if (typeof value === 'string') {
    const res = applyDeterministicRegionalFixes(value, language);
    const count = res.replacements.reduce((sum, r) => sum + r.count, 0);
    return { value: res.text as unknown as T, count };
  }
  if (Array.isArray(value)) {
    let total = 0;
    const next = value.map((item) => {
      const fixed = applyDeterministicFixesToDiagramData(item, language);
      total += fixed.count;
      return fixed.value;
    });
    return { value: next as unknown as T, count: total };
  }
  if (value && typeof value === 'object') {
    let total = 0;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SKIP_DIAGRAM_KEYS.has(k)) {
        out[k] = v;
      } else {
        const fixed = applyDeterministicFixesToDiagramData(v, language);
        total += fixed.count;
        out[k] = fixed.value;
      }
    }
    return { value: out as T, count: total };
  }
  return { value, count: 0 };
}

async function runRegionalTerminologyCheckStage(params: {
  title: string;
  subtitle: string;
  scenes: SceneSpec[];
  language: ContentLanguage;
  cfg: LlmConfig;
  canCallLlm: boolean;
  preservePptxTitles?: boolean;
}): Promise<{
  title: string;
  subtitle: string;
  scenes: SceneSpec[];
  checkNote: string;
}> {
  const langMeta = getContentLanguage(params.language);
  let title = params.title;
  let subtitle = params.subtitle;
  let scenes = params.scenes.map((s) => ({ ...s }));
  let llmReviewed = false;
  let llmAdjustedCount = 0;

  if (params.canCallLlm && scenes.length > 0) {
    try {
      const flaggedExamples = Array.from(
        new Set(
          scenes.flatMap((s) =>
            findRegionalTermMatches(collectSceneTextForTermCheck(s), params.language).map(
              (m) => `${m.wrong} -> ${m.preferred}`
            )
          )
        )
      );

      const systemPrompt = `You are a technical localization editor and regional terminology reviewer for ${langMeta.promptName}.
Your ONLY job is to audit and refine the generated video script and on-screen labels so that EVERY technical term matches authentic ${langMeta.promptName} engineering conventions.

${getRegionalTerminologyPromptGuidance(params.language)}

STRICT RULES:
1. Keep the EXACT same number of scenes, order, meaning, and speaking length (do not expand or shorten scripts).
2. Fix cross-region technical wording and unnatural literal translations. In Taiwan zh-TW, use natural Taiwan English/Traditional-Chinese mixing instead of forcing Chinese translations. Prefer established English terms such as API, SDK, cache, firmware, chipset, server, packet/frame, field, register, debug, driver, latency, throughput, array, queue, stack, pointer, file, storage, performance, and interface when they are the common Taiwan engineering form.
3. Preserve all English acronyms, protocol names, product names, code identifiers, register names, numbers, and units verbatim (e.g., EAPOL, PTK, PMK, MIC, ANonce, SNonce, PCIe, 802.11ax/be).
4. If a field is already completely natural and accurate for ${langMeta.promptName}, return it unchanged.
${params.preservePptxTitles ? '5. Keep slide titles/subtitles/keyPoints unchanged; only review the spoken "script".' : ''}

Return strict JSON:
{
  "title": "reviewed project title",
  "subtitle": "reviewed project subtitle",
  "scenes": [
    {
      "index": 0,
      "title": "reviewed scene title",
      "subtitle": "reviewed scene subtitle",
      "keyPoints": ["..."],
      "script": "reviewed spoken narration",
      "visualCaption": "reviewed caption or empty string"
    }
  ]
}`;

      const reviewPayload = {
        language: langMeta.promptName,
        flaggedTermsDetected: flaggedExamples,
        title,
        subtitle,
        scenes: scenes.map((s, index) => ({
          index,
          title: s.title,
          subtitle: s.subtitle,
          keyPoints: s.keyPoints,
          script: s.script,
          visualCaption: s.diagramData?.visualCaption || '',
        })),
      };

      const reviewed = (await callChatCompletionJson(
        params.cfg,
        systemPrompt,
        JSON.stringify(reviewPayload)
      )) as {
        title?: string;
        subtitle?: string;
        scenes?: {
          index?: number;
          title?: string;
          subtitle?: string;
          keyPoints?: string[];
          script?: string;
          visualCaption?: string;
        }[];
      };

      if (reviewed && Array.isArray(reviewed.scenes) && reviewed.scenes.length > 0) {
        llmReviewed = true;
        if (!params.preservePptxTitles && typeof reviewed.title === 'string' && reviewed.title.trim()) {
          if (reviewed.title.trim() !== title) llmAdjustedCount += 1;
          title = reviewed.title.trim();
        }
        if (!params.preservePptxTitles && typeof reviewed.subtitle === 'string' && reviewed.subtitle.trim()) {
          if (reviewed.subtitle.trim() !== subtitle) llmAdjustedCount += 1;
          subtitle = reviewed.subtitle.trim();
        }

        scenes = scenes.map((scene, idx) => {
          const patch =
            reviewed.scenes?.find((item) => item.index === idx) || reviewed.scenes?.[idx];
          if (!patch) return scene;

          const nextScript =
            typeof patch.script === 'string' && patch.script.trim()
              ? patch.script.trim()
              : scene.script;
          if (nextScript !== scene.script) llmAdjustedCount += 1;

          if (params.preservePptxTitles) {
            return { ...scene, script: nextScript };
          }

          const nextTitle =
            typeof patch.title === 'string' && patch.title.trim() ? patch.title.trim() : scene.title;
          const nextSubtitle =
            typeof patch.subtitle === 'string' && patch.subtitle.trim()
              ? patch.subtitle.trim()
              : scene.subtitle;
          const nextKeyPoints =
            Array.isArray(patch.keyPoints) && patch.keyPoints.length > 0
              ? patch.keyPoints.map((kp) => String(kp).trim()).filter(Boolean)
              : scene.keyPoints;
          const nextDiagramData =
            scene.diagramData && typeof patch.visualCaption === 'string' && patch.visualCaption.trim()
              ? { ...scene.diagramData, visualCaption: patch.visualCaption.trim() }
              : scene.diagramData;

          if (nextTitle !== scene.title) llmAdjustedCount += 1;

          return {
            ...scene,
            title: nextTitle,
            subtitle: nextSubtitle,
            keyPoints: nextKeyPoints,
            script: nextScript,
            diagramData: nextDiagramData,
          };
        });
      }
    } catch (err) {
      console.warn('Regional terminology review stage failed, applying deterministic fallback:', err);
    }
  }

  // Deterministic safety net to guarantee known cross-region terms are normalized.
  let deterministicFixes = 0;
  if (!params.preservePptxTitles) {
    const fixedTitle = applyDeterministicRegionalFixes(title, params.language);
    title = fixedTitle.text;
    deterministicFixes += fixedTitle.replacements.reduce((sum, r) => sum + r.count, 0);

    const fixedSubtitle = applyDeterministicRegionalFixes(subtitle, params.language);
    subtitle = fixedSubtitle.text;
    deterministicFixes += fixedSubtitle.replacements.reduce((sum, r) => sum + r.count, 0);
  }

  scenes = scenes.map((scene) => {
    const fixedScript = applyDeterministicRegionalFixes(scene.script, params.language);
    deterministicFixes += fixedScript.replacements.reduce((sum, r) => sum + r.count, 0);

    if (params.preservePptxTitles) {
      return { ...scene, script: fixedScript.text };
    }

    const fixedTitle = applyDeterministicRegionalFixes(scene.title, params.language);
    const fixedSub = applyDeterministicRegionalFixes(scene.subtitle, params.language);
    deterministicFixes +=
      fixedTitle.replacements.reduce((sum, r) => sum + r.count, 0) +
      fixedSub.replacements.reduce((sum, r) => sum + r.count, 0);

    const fixedKeyPoints = scene.keyPoints.map((kp) => {
      const r = applyDeterministicRegionalFixes(kp, params.language);
      deterministicFixes += r.replacements.reduce((sum, m) => sum + m.count, 0);
      return r.text;
    });

    const fixedDiagram = scene.diagramData
      ? applyDeterministicFixesToDiagramData(scene.diagramData, params.language)
      : { value: scene.diagramData, count: 0 };
    deterministicFixes += fixedDiagram.count;

    return {
      ...scene,
      title: fixedTitle.text,
      subtitle: fixedSub.text,
      keyPoints: fixedKeyPoints,
      script: fixedScript.text,
      diagramData: fixedDiagram.value,
    };
  });

  const totalAdjustments = llmAdjustedCount + deterministicFixes;
  const checkNote = llmReviewed
    ? totalAdjustments > 0
      ? `已完成「${langMeta.label}」術語校對（修正 ${totalAdjustments} 處區域用語）`
      : `已通過「${langMeta.label}」技術術語校對`
    : deterministicFixes > 0
    ? `已依「${langMeta.label}」術語表自動修正 ${deterministicFixes} 處用語`
    : '';

  return { title, subtitle, scenes, checkNote };
}

export async function resolveTrainingDomain(params: {
  topic: string;
  rawText?: string;
  domain?: TechDomain | 'auto';
  llmConfig?: Partial<LlmConfig>;
}): Promise<{
  domain: TechDomain;
  domainSource: 'manual' | 'llm' | 'keywords';
  domainReason: string;
}> {
  if (isTechDomain(params.domain)) {
    return {
      domain: params.domain,
      domainSource: 'manual',
      domainReason: '使用手動指定的技術領域',
    };
  }

  if (params.domain === 'auto') {
    return {
      domain: 'debug-logic',
      domainSource: 'keywords',
      domainReason: 'AI 自動判斷：不套用領域預設視覺風格，逐場景依主題與腳本選擇 Remotion 元素',
    };
  }

  const brief = [params.topic, params.rawText || ''].filter(Boolean).join('\n');
  const cfg = resolveLlmConfig(params.llmConfig);
  const canCallLlm = Boolean(cfg.apiKey || isLocalLlmEndpoint(cfg.baseUrl));
  if (canCallLlm && brief.trim().length >= 2) {
    try {
      const classified = (await callChatCompletionJson(
        cfg,
        `Classify a technical training topic into exactly one domain.
Return strict JSON: {"domain":"debug-logic|wifi|bluetooth|rf","reason":"short reason"}.
debug-logic = PC/laptop debug, BIOS, power, PCIe, buses.
wifi = Wi-Fi / 802.11 / WLAN.
bluetooth = Bluetooth / BLE.
rf = antenna, RF parameters, SAR, EMI, desense.`,
        brief
      )) as { domain?: string; reason?: string };
      if (isTechDomain(classified?.domain)) {
        return {
          domain: classified.domain,
          domainSource: 'llm',
          domainReason: classified.reason || `已由 LLM (${cfg.model}) 判斷技術領域`,
        };
      }
    } catch (err) {
      console.warn('Domain classification failed, using keyword inference:', err);
    }
  }

  const inferred = inferDomainFromText(brief);
  return {
    domain: inferred.domain,
    domainSource: 'keywords',
    domainReason: inferred.reason,
  };
}

export async function generateVideoPlanWithLlm(input: GeneratePlanParams): Promise<{
  title: string;
  subtitle: string;
  scenes: SceneSpec[];
  mode: 'llm' | 'smart-fallback';
  note: string;
  domain: TechDomain;
  domainSource: 'manual' | 'llm' | 'keywords';
  domainReason: string;
}> {
  const resolvedDomain = await resolveTrainingDomain(input);
  const params: ResolvedGeneratePlanParams = { ...input, domain: resolvedDomain.domain };
  const cfg = resolveLlmConfig(params.llmConfig);
  const provider = params.defaultTtsProvider || 'openformosa';
  const language = getContentLanguage(params.language || DEFAULT_CONTENT_LANGUAGE);
  const targetDuration = Math.max(15, Math.min(1800, Math.round(params.durationSeconds || 60)));
  const recommendedScenes = Math.max(3, Math.min(48, Math.round(targetDuration / 10)));

  const canCallLlm = Boolean(cfg.apiKey || isLocalLlmEndpoint(cfg.baseUrl));

  if (!canCallLlm && language.value !== DEFAULT_CONTENT_LANGUAGE) {
    throw new Error('其他語言需要可用的 LLM。請先設定 GNAI Token 或本機 LLM 服務。');
  }

  // Dedicated 1:1 PowerPoint slide mode
  if (params.pptxSlides && params.pptxSlides.length > 0) {
    const pptxPlan = await generatePptxPlan(params, params.pptxSlides, cfg, canCallLlm);
    return { ...pptxPlan, ...resolvedDomain };
  }

  if (canCallLlm) {
    try {
      const systemPrompt = `You are a senior technical video director and Remotion motion-graphics designer.
Given a topic, total video duration (in seconds), and optional reference notes, generate a complete multi-scene Remotion training video plan as strict JSON.

${params.colorPalette?.length ? `CUSTOM COLOR PALETTE RULE:
- Use only these hex codes for accent/highlight/diagram/status colors: ${params.colorPalette.join(', ')}.
- Let visual and effect semantics decide which palette color fits each scene; do not always reuse the first color.
- Never introduce an unrelated hex color outside this palette.
` : ''}${params.odmMode ? `ODM BEGINNER-MODE RULE:
- Explain to entry-level engineers who have very little background on the topic.
- Use relatable metaphors and concrete everyday examples before technical details.
- Define jargon and acronyms immediately in plain language.
- Build cause-and-effect in small steps, use short spoken sentences, and include a simple real-world example in each scene when relevant.
- Do not weaken technical accuracy; make unfamiliar concepts understandable through analogy and familiar observations.
` : ''}CRITICAL RULES:
1. Total sum of all scenes' durationSeconds MUST equal ${targetDuration} seconds. Aim for ~${recommendedScenes} scenes (each 5–20 seconds).
2. LANGUAGE AND SPEECH PACING (VERY IMPORTANT):
  - Write ALL video content in ${language.promptName}: titles, subtitles, narration, key points, visual descriptions, and diagram labels. Translate reference notes when necessary. Preserve technical acronyms, model numbers, units, and product names.
  - Spoken ${language.promptName} runs at approximately ${language.charsPerSecond} characters per second. Keep each script near ${Math.round(language.charsPerSecond * 0.9)} characters per second of scene duration so the narration finishes cleanly.
  - ${getRegionalTerminologyPromptGuidance(language.value)}
3. SCRIPT vs GRAPHIC SEPARATION (VERY IMPORTANT):
   - "keyPoints" and "diagramData" labels MUST be short, scannable visual anchors (keywords, component names, metrics, 2–8 words max).
   - Keep one central idea per scene. Show 2–4 keyPoints, at most 1–4 Remotion primitives, and at most 6 primary diagram items. Put supporting detail, caveats, and explanation in the spoken script, not on screen.
   - Never fill every available area. Preserve clear negative space and prioritize adequate, readable information over exhaustive lists. If content needs more than one focused visual, split it across scenes.
  - "script" (spoken narration) MUST NOT simply read out the text on the graphic! Instead, explain the WHY, HOW, physical intuition, cause-and-effect, or real-world engineering story that complements the visual.
3. EFFECT-TO-SCRIPT ALIGNMENT:
   - Every scene MUST choose the best "template" from: ["title-hero", "architecture-flow", "signal-waveform", "protocol-timeline", "comparison-matrix", "debug-checklist", "packet-frame", "state-machine", "code-log", "kpi-metrics", "fault-tree", "packet-simulator", "ofdm-spectrum", "beamforming-array", "qam-constellation", "mlo-multilink", "rf-link-budget", "summary-takeaways"].
   - Use diverse templates across scenes! Prefer "packet-frame" for protocol headers/fields, "state-machine" for FSM/connection states, "code-log" for CLI/driver logs/registers, "kpi-metrics" for quantitative specs/benchmarks, "fault-tree" for root-cause decision branches, and for wireless/RF topics prefer "packet-simulator" (multi-channel Device A->B packet transfer simulation), "ofdm-spectrum" (OFDMA RU/subcarriers/puncturing), "beamforming-array" (phased array steering), "qam-constellation" (I/Q constellation & EVM/SNR), "mlo-multilink" (Wi-Fi 7 MLO concurrent links), and "rf-link-budget" (RF link budget waterfall & margin).
   - HARD VARIETY RULE: No template may repeat in three consecutive scenes. No effect may repeat in three consecutive scenes. For 20–30 minute videos, deliberately rotate among at least 8 different templates and at least 5 different effects across the whole course. Avoid using architecture-flow or signal-pulse for more than 25% of scenes unless the topic genuinely requires that exact graphic.
   - Every scene MUST choose a matching "effect" from: ["signal-pulse", "glitch-alert", "cascade-reveal", "zoom-focus", "sweep-scan"] that directly animates what the 台詞 (script) is describing (e.g., if script talks about noise/droop/failure, use "glitch-alert" + "signal-waveform" with faultChannelIndex; if script talks about signal flow, use "signal-pulse" + "architecture-flow"; if script talks about step-by-step timing, use "cascade-reveal" + "protocol-timeline" or "state-machine"; if script talks about comparing options or metrics, use "zoom-focus" + "comparison-matrix" or "kpi-metrics"; if script talks about probing/logs/fields, use "sweep-scan" + "code-log" or "packet-frame").
   - Primitive precedence: First use an explicit element/component suggestion from the Reference Notes outline for that scene. If the outline has no explicit Remotion element suggestion for that scene, independently choose the smallest effective set: 1–4 reusable Remotion elements total. Existing reusable components include ["kinetic-caption", "svg-trace-path", "pop-badge", "state-card", "animated-counter", "camera-pan-zoom", "caption-highlight", "karaoke-captions", "comparison-bars", "donut-chart", "gauge-dial", "srt-caption-track", "horizontal-bar-chart", "line-chart", "number-counter", "pie-chart", "vertical-bar-chart", "notebook-paper", "paper-texture"], but another precise component name or custom element identifier is allowed.
   - Provide topic-specific "diagramData" matching the template:
     * architecture-flow: { nodes: [{id, label, sublabel, color}], highlightNodeIndex, visualCaption }
     * signal-waveform: { waveformChannels: [{label, color, type: "clock"|"data"|"rf-sine"|"ofdma"}], faultChannelIndex, visualCaption }
     * protocol-timeline: { protocolSteps: [{actor, target, message, timing}], activeStepIndex, visualCaption }
     * comparison-matrix: { comparisonHeaders: [string, string], comparisonRows: [{metric, optionA, optionB, highlight: "A"|"B"}], visualCaption }
     * packet-frame: { packetFields: [{name, bits, value, description, color, highlight}], visualCaption }
     * state-machine: { stateNodes: [{id, label, sublabel, status: "normal"|"active"|"error"|"success"}], stateTransitions: [{from, to, trigger, isErrorPath}], visualCaption }
     * code-log: { codeLanguage, codeTitle, codeLines: [{lineNo, text, level: "normal"|"highlight"|"warn"|"error"|"success", annotation}], visualCaption }
     * kpi-metrics: { kpiMetrics: [{label, value, delta, target, status: "good"|"warn"|"bad"|"neutral"}], visualCaption }
     * fault-tree: { faultRoot, faultBranches: [{symptom, check, passAction, failRootCause, severity: "high"|"medium"|"low"}], visualCaption }
     * packet-simulator: { simDeviceA: {name, role, ipOrMac}, simDeviceB: {name, role, ipOrMac}, simChannels: [{id, label, band, bandwidth, color, interference}], simPackets: [{seq, channelId, direction: "A->B"|"B->A", label, sizeBytes, status: "ok"|"retry"|"drop"|"ack"}], visualCaption }
     * ofdm-spectrum: { ofdmBandwidthMhz, ofdmRuBlocks: [{label, tones, widthRatio, color, punctured}], visualCaption }
     * beamforming-array: { beamformingElements, beamformingTargetAngleDeg, beamformingTargetLabel, visualCaption }
     * qam-constellation: { qamOrder: 16|64|256|1024, qamSnrDb, qamEvmDb, visualCaption }
     * mlo-multilink: { mloLinks: [{band, channel, bandwidth, color, throughputMbps, mode: "STR"|"EMLSR"|"NSTR"}], visualCaption }
     * rf-link-budget: { rfSensitivityDbm, rfLinkStages: [{label, deltaDb, note, type: "tx"|"gain"|"loss"|"rx"}], visualCaption }
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
      "template": "title-hero|architecture-flow|signal-waveform|protocol-timeline|comparison-matrix|debug-checklist|packet-frame|state-machine|code-log|kpi-metrics|fault-tree|packet-simulator|ofdm-spectrum|beamforming-array|qam-constellation|mlo-multilink|rf-link-budget|summary-takeaways",
      "effect": "signal-pulse|glitch-alert|cascade-reveal|zoom-focus|sweep-scan|packet-traffic",
      "visualDescription": "string describing what the Remotion graphic + effect shows and why it matches the script",
      "remotionPrimitives": ["free-form Remotion component or element names; use every element needed by this scene"],
      "keyPoints": ["short visual anchor 1", "short visual anchor 2", "short visual anchor 3"],
      "script": "Natural spoken Traditional Chinese narration that explains the concept without reading the graphic verbatim",
      "diagramData": { ... }
    }
  ]
}`;

      const userPrompt = `Output language: ${language.promptName}
    Topic: ${params.topic}
Target Duration: ${targetDuration} seconds
Domain: ${input.domain === 'auto' ? 'AI Auto: Do not use a prepackaged technical-domain visual style. Choose every scene and Remotion primitive from the outline and per-scene script context.' : DOMAIN_META[params.domain].label}
${params.rawText ? `Reference Notes:\n${params.rawText}` : ''}`;

      const rawResult = (await callChatCompletionJson(cfg, systemPrompt, userPrompt)) as LlmPlanPayload;
      if (rawResult && Array.isArray(rawResult.scenes) && rawResult.scenes.length > 0) {
        const balanced = normalizeDurationsToTarget(rawResult.scenes, targetDuration);
        rawResult.scenes.forEach((s, i) => {
          s.durationSeconds = balanced[i];
        });
        const initialScenes = toSceneSpecs(rawResult, params.domain, provider, params.topic, params.colorPalette, params.rawText);
        const checked = await runRegionalTerminologyCheckStage({
          title: rawResult.title || params.topic,
          subtitle: rawResult.subtitle || DOMAIN_META[params.domain].description,
          scenes: initialScenes,
          language: language.value,
          cfg,
          canCallLlm: true,
        });
        const baseNote = `已由 LLM (${cfg.model}) 自動生成台詞與對應 Remotion 動態圖表`;
        return {
          title: checked.title,
          subtitle: checked.subtitle,
          scenes: checked.scenes,
          mode: 'llm',
          note: checked.checkNote ? `${baseNote} • ${checked.checkNote}` : baseNote,
          ...resolvedDomain,
        };
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('LLM plan generation failed:', detail);
      throw new Error(
        `LLM 生成課程失敗（${detail}）。請確認 GNAI_MODEL（例如 gpt-5-mini）與 GNAI_TOKEN 設定後重試，避免產生與主題無關的預設範本內容。`
      );
    }
  }

  const fallback = generateFallbackPlan({ ...params, durationSeconds: targetDuration });
  const fallbackScenes = toSceneSpecs(fallback, params.domain, provider, params.topic, params.colorPalette, params.rawText);
  const checkedFallback = await runRegionalTerminologyCheckStage({
    title: fallback.title,
    subtitle: fallback.subtitle,
    scenes: fallbackScenes,
    language: language.value,
    cfg,
    canCallLlm: false,
  });
  return {
    title: checkedFallback.title,
    subtitle: checkedFallback.subtitle,
    scenes: checkedFallback.scenes,
    mode: 'smart-fallback',
    note: '未設定 LLM API Key，已使用內建智慧引擎生成（可於設定中填入 OpenAI / 本地 Ollama 金鑰以啟用雲端 LLM）',
    ...resolvedDomain,
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

  // Keep PowerPoint 100% slide fidelity when regenerating a PPTX scene
  if (scene.template === 'pptx-slide' && scene.pptxSlide) {
    if (canCallLlm) {
      try {
        const systemPrompt = `You are a technical presentation narrator.
Return strict JSON rewriting the spoken narration script for this PowerPoint slide.
${params.odmMode ? `ODM BEGINNER-MODE:
- Explain for entry-level engineers with very little background.
- Start with a concrete everyday metaphor or familiar example, then connect it to the exact slide content.
- Define jargon and acronyms in plain language and explain cause-and-effect step by step.
` : ''}CRITICAL:
- Write in ${language.promptName}. Preserve acronyms, numbers, and product names.
- The script MUST strictly match and explain the exact content on this PowerPoint slide (title, bodyText, and speaker notes).`;
        const userPrompt = `Slide Title: ${scene.pptxSlide.title}
Slide Content: ${scene.pptxSlide.bodyText}
Speaker Notes: ${scene.pptxSlide.notes || 'None'}
Current Script: ${scene.script}
Return JSON: { "script": "..." }`;
        const res = (await callChatCompletionJson(cfg, systemPrompt, userPrompt)) as { script?: string };
        if (res?.script) {
          const fixedScript = applyDeterministicRegionalFixes(res.script.trim(), language.value).text;
          return {
            scenePatch: { script: fixedScript },
            mode: 'llm',
            note: `已依投影片原內容透過 LLM (${cfg.model}) 更新腳本（保留 100% 原版投影片視覺）`,
          };
        }
      } catch (err) {
        if (language.value !== DEFAULT_CONTENT_LANGUAGE) {
          throw new Error(`無法以${language.label}更新投影片腳本，請確認 LLM 服務可用後重試。`);
        }
        console.warn('LLM PPTX scene regenerate failed, using slide fallback:', err);
      }
    }
    const fixedFallbackScript = applyDeterministicRegionalFixes(
      buildPptxFallbackScript(scene.pptxSlide),
      language.value
    ).text;
    return {
      scenePatch: { script: fixedFallbackScript },
      mode: 'smart-fallback',
      note: '已依 PowerPoint 投影片原內容重設腳本（保留 100% 原版投影片視覺）',
    };
  }

  if (canCallLlm) {
    try {
      const systemPrompt = `You are a Remotion motion-graphics director and technical scriptwriter.
Return strict JSON updating a single scene.packet-simulator","ofdm-spectrum","beamforming-array","qam-constellation","mlo-multilink","rf-link-budget","
${params.odmMode ? `ODM BEGINNER-MODE:
- Use metaphors and concrete examples appropriate for entry-level engineers.
- Define unfamiliar terms immediately and explain cause-and-effect in small steps.
- Keep the narration accessible without losing technical accuracy.
` : ''}CRITICAL:
- Write any regenerated narration and visual text in ${language.promptName}. Preserve technical acronyms and identifiers.
- ${getRegionalTerminologyPromptGuidance(language.value)}
- The spoken "script" (台詞) MUST NOT just read the "keyPoints" or diagram labels. Script explains WHY/HOW; graphics show concise visual anchors.
- The "template", "effect", and "diagramData" MUST visually match what the "script" is describing.
- Keep one central idea per scene: 2–4 keyPoints, 1–4 Remotion primitives, and no more than 6 primary diagram items. Move detail into narration instead of crowding the screen.
Valid templates: ["title-hero","architecture-flow","signal-waveform","protocol-timeline","comparison-matrix","debug-checklist","packet-frame","state-machine","code-log","kpi-metrics","fault-tree","summary-takeaways"]
Valid effects: ["signal-pulse","glitch-alert","cascade-reveal","zoom-focus","sweep-scan","packet-traffic"]
Choose the smallest set of Remotion elements that communicates the scene clearly; never add decorative elements merely to fill space.

Return JSON:
{
  "template": "...",
  "effect": "...",
  "visualDescription": "...",
  "remotionPrimitives": ["..."],
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
    ? 'Keep the current graphic/template/diagramData, and rewrite ONLY the script so it explains the story/causality behind the graphic instead of reading the graphic text verbatim.'
    : 'Regenerate both a fresh explanatory script and matching Remotion graphic/effect/diagramData.'
}`;

      const res = (await callChatCompletionJson(cfg, systemPrompt, userPrompt)) as Partial<LlmScenePayload>;
      const nextTemplate = clampTemplate(res.template, scene.index, scene.index + 2);
      const rawScript =
        action === 'sync-visual-to-script' ? scene.script : (res.script || scene.script).trim();
      const nextScript = applyDeterministicRegionalFixes(rawScript, language.value).text;
      const nextEffect = clampEffect(res.effect, nextTemplate, nextScript);
      const rawKeyPoints =
        action === 'rewrite-script-no-read'
          ? scene.keyPoints
          : Array.isArray(res.keyPoints) && res.keyPoints.length > 0
          ? res.keyPoints.slice(0, 4).map((kp) => applyDeterministicRegionalFixes(String(kp), language.value).text)
          : scene.keyPoints;
      const rawDiagram =
        action === 'rewrite-script-no-read'
          ? scene.diagramData
          : limitDiagramDensity(
              applyDeterministicFixesToDiagramData(
                res.diagramData || buildSmartFallbackDiagram(topic, scene.domain, nextTemplate, nextEffect, nextScript),
                language.value
              ).value
            );
      const remotionPrimitives =
        action === 'rewrite-script-no-read'
          ? scene.remotionPrimitives
          : resolveScenePrimitives(
              params.rawText || '',
              scene.title,
              scene.index,
              res.remotionPrimitives,
              nextScript,
              res.visualDescription
            );

      return {
        scenePatch: {
          template: action === 'rewrite-script-no-read' ? scene.template : nextTemplate,
          script: nextScript,
          visualDescription: res.visualDescription || scene.visualDescription,
          remotionPrimitives,
          keyPoints: rawKeyPoints,
          diagramData: rawDiagram,
          animation: {
            ...scene.animation,
            effect: action === 'rewrite-script-no-read' ? scene.animation.effect : nextEffect,
          },
        },
        mode: 'llm',
        note: `已透過 LLM (${cfg.model}) 完成更新並套用「${language.label}」術語校對`,
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
        remotionPrimitives: resolveScenePrimitives(
          params.rawText || '',
          scene.title,
          scene.index,
          undefined,
          scene.script,
          `依台詞自動匹配：${nextTemplate} + ${nextEffect} 特效`
        ),
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
    const rewritten = applyDeterministicRegionalFixes(
      `在「${scene.title}」這個環節中，畫面上標示的只是關鍵量測指標；真正決定系統成敗的，是訊號在極限負載下的邊界餘裕與前後級時序配合，這也是我們在除錯時最需要優先釐清的因果關鍵。`,
      language.value
    ).text;
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
  const nextScript = applyDeterministicRegionalFixes(
    `針對「${scene.title}」，請觀察畫面上的結構關係：我們關注的不只是靜態規格，而是動態切換瞬間是否會引發連鎖時序異常。`,
    language.value
  ).text;
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
