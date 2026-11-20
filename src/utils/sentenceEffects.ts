import {
  EFFECT_LABELS,
  RemotionEffect,
  SentenceEffectCue,
  VisualTemplate,
} from '../types/training';

/**
 * Split a scene narration script into individual sentences while preserving
 * decimal numbers, version strings (802.11ax, 3.3V, Ming-3.0, M.2), etc.
 */
export function splitScriptIntoSentences(script: string): string[] {
  const cleaned = (script || '').replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];

  // Protect periods inside numbers/versions like 3.3, 802.11, M.2, v1.0
  const DOT_TOKEN = '__DOT_NUM__';
  const protectedText = cleaned.replace(/([A-Za-z0-9])\.([0-9])/g, `$1${DOT_TOKEN}$2`);

  const rawParts = protectedText
    .split(/(?<=[。！？!?]|\.(?=\s|$)|\n+)/)
    .map((part) => part.replaceAll(DOT_TOKEN, '.').trim())
    .filter((part) => part.length > 0);

  if (rawParts.length === 0) return [cleaned];
  return rawParts;
}

/**
 * Group sentences into pairs (every 2 sentences).
 */
export function groupSentencesInPairs(sentences: string[]): string[][] {
  const pairs: string[][] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    pairs.push(sentences.slice(i, i + 2));
  }
  return pairs;
}

/**
 * Split sentences into high-frequency micro-beats (1 sentence or sub-clause per beat,
 * targeting ~3-6 seconds per visual beat for dynamic Remotion pacing).
 */
export function groupSentencesForDynamicBeats(sentences: string[]): string[][] {
  const beats: string[][] = [];
  for (const sentence of sentences) {
    if (sentence.length > 48) {
      const clauses = sentence
        .split(/(?<=[，；;])\s*|(?<=,)\s+/)
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (clauses.length >= 2) {
        // Merge very short clauses (<12 chars) with their neighbor
        const merged: string[] = [];
        for (const cl of clauses) {
          if (merged.length > 0 && (cl.length < 12 || merged[merged.length - 1].length < 12)) {
            merged[merged.length - 1] = `${merged[merged.length - 1]} ${cl}`.trim();
          } else {
            merged.push(cl);
          }
        }
        for (const m of merged) {
          beats.push([m]);
        }
        continue;
      }
    }
    beats.push([sentence]);
  }
  return beats;
}

export function analyzeSentencePairEffect(
  pairText: string,
  beatIndex: number,
  template: VisualTemplate,
  fallbackEffect: RemotionEffect = 'signal-pulse'
): { effect: RemotionEffect; rationale: string; targetIndex: number } {
  const s = pairText.toLowerCase();

  if (
    /異常|雜訊|干擾|抖動|壓降|故障|失敗|當機|重開|風險|超標|逾時|卡死|崩潰|反射|損耗|droop|jitter|desense|fail|glitch|noise|mismatch|timeout|error|spike|ripple/.test(
      s
    )
  ) {
    return {
      effect: 'glitch-alert',
      targetIndex: (beatIndex + 1) % 4,
      rationale: '此組句子描述異常、雜訊、壓降或失敗風險，以 Glitch Alert 突顯故障熱區與波形擾動。',
    };
  }

  if (
    /量測|示波器|探棒|掃描|檢查|排查|驗證|確認|測試|隔離|二分法|存檔|probe|oscilloscope|scan|check|verify|measure|triage|sop|test/.test(
      s
    )
  ) {
    return {
      effect: 'sweep-scan',
      targetIndex: beatIndex % 4,
      rationale: '此組句子說明儀器量測、掃描檢查或除錯驗證步驟，以 Sweep Scan 呈現逐項掃描推進。',
    };
  }

  if (
    /順序|時序|步驟|毫秒|階段|交握|握手|喚醒|起振|重置|依序|先.*再|直到|接著|最後|sequence|boot|post|handshake|timeline|ms|stage|phase/.test(
      s
    )
  ) {
    return {
      effect: 'cascade-reveal',
      targetIndex: beatIndex % 4,
      rationale: '此組句子解釋前後級依賴與時間順序，以 Cascade Reveal 依序展開各階段節點。',
    };
  }

  if (
    /比較|差異|對照|倍增|提升|關鍵|核心|重點|聚焦|原則|優勢|換來|差距|比對|vs|compare|margin|focus|key|benefit|advantage/.test(
      s
    )
  ) {
    return {
      effect: 'zoom-focus',
      targetIndex: beatIndex % 4,
      rationale: '此組句子強調核心差異、關鍵指標或設計優勢，以 Zoom Focus 放大聚焦重點。',
    };
  }

  if (
    /訊號|流向|傳輸|發出|經過|進入|驅動|耦合|總線|鏈路|拓撲|架構|匯流排|signal|flow|bus|link|tx|rx|path|drive|mac|phy/.test(
      s
    )
  ) {
    return {
      effect: 'signal-pulse',
      targetIndex: beatIndex % 4,
      rationale: '此組句子說明訊號傳遞路徑與架構互動，以 Signal Pulse 呈現脈衝流動方向。',
    };
  }

  // Template-aware default rotation if no explicit keyword matched
  const templateFallback: Record<VisualTemplate, RemotionEffect> = {
    'title-hero': beatIndex === 0 ? 'zoom-focus' : 'cascade-reveal',
    'architecture-flow': beatIndex % 2 === 0 ? 'signal-pulse' : 'zoom-focus',
    'signal-waveform': beatIndex % 2 === 0 ? 'sweep-scan' : 'signal-pulse',
    'protocol-timeline': 'cascade-reveal',
    'comparison-matrix': 'zoom-focus',
    'debug-checklist': 'sweep-scan',
    'summary-takeaways': beatIndex === 0 ? 'cascade-reveal' : 'zoom-focus',
    'pptx-slide': 'zoom-focus',
  };

  const chosen = templateFallback[template] || fallbackEffect;
  return {
    effect: chosen,
    targetIndex: beatIndex % 4,
    rationale: `依場景模板與語意節奏自動搭配 ${EFFECT_LABELS[chosen]}。`,
  };
}

/**
 * Build deterministic per-2-sentence Remotion effect cues from a script.
 * If existing/LLM cues are provided, preserves their custom effect/rationale/targetIndex
 * while recalculating exact character-weighted startRatio/endRatio.
 */
export function buildSentenceEffectCues(
  script: string,
  template: VisualTemplate,
  fallbackEffect: RemotionEffect = 'signal-pulse',
  existingCues?: Partial<SentenceEffectCue>[]
): SentenceEffectCue[] {
  const sentences = splitScriptIntoSentences(script);
  const pairs =
    sentences.length > 0
      ? groupSentencesForDynamicBeats(sentences)
      : [[(script || '').trim() || '']];

  const weights = pairs.map((pair) => Math.max(8, pair.join(' ').length));
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  let cursor = 0;
  return pairs.map((pair, idx) => {
    const startRatio = idx === 0 ? 0 : cursor;
    const span = weights[idx] / totalWeight;
    const endRatio = idx === pairs.length - 1 ? 1 : Math.min(1, cursor + span);
    cursor = endRatio;

    const pairText = pair.join(' ');
    const analyzed = analyzeSentencePairEffect(pairText, idx, template, fallbackEffect);
    const existing = existingCues?.[idx];

    const effect = existing?.effect || analyzed.effect;
    const rationale = existing?.rationale || analyzed.rationale;
    const targetIndex =
      typeof existing?.targetIndex === 'number' ? existing.targetIndex : analyzed.targetIndex;

    return {
      id: existing?.id || `cue-${idx}`,
      beatIndex: idx,
      sentences: pair,
      startRatio: Number(startRatio.toFixed(4)),
      endRatio: Number(endRatio.toFixed(4)),
      effect,
      targetIndex,
      rationale,
    };
  });
}

export function getActiveSentenceCue(
  cues: SentenceEffectCue[] | undefined,
  sceneProgress: number,
  script: string,
  template: VisualTemplate,
  fallbackEffect: RemotionEffect = 'signal-pulse'
): { cue: SentenceEffectCue; cues: SentenceEffectCue[]; cueProgress: number } {
  const resolvedCues =
    cues && cues.length > 0
      ? cues
      : buildSentenceEffectCues(script, template, fallbackEffect);

  const clamped = Math.max(0, Math.min(1, sceneProgress));
  const found =
    resolvedCues.find((c, idx) =>
      idx === resolvedCues.length - 1
        ? clamped >= c.startRatio
        : clamped >= c.startRatio && clamped < c.endRatio
    ) || resolvedCues[0];

  const span = Math.max(0.01, found.endRatio - found.startRatio);
  const cueProgress = Math.max(0, Math.min(1, (clamped - found.startRatio) / span));

  return { cue: found, cues: resolvedCues, cueProgress };
}
