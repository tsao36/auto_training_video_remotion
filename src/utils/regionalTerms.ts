import { ContentLanguage, DEFAULT_CONTENT_LANGUAGE, getContentLanguage, SceneSpec } from '../types/training';

export interface RegionalTermRule {
  /** Term that does not match the target region's standard engineering terminology. */
  wrong: string;
  /** Preferred regional technical term. */
  preferred: string;
  /** Optional short explanation shown in quality warnings. */
  reason?: string;
}

export interface RegionalTermMatch {
  wrong: string;
  preferred: string;
  count: number;
  reason?: string;
}

/**
 * Unambiguous technical terminology mappings for zh-TW (Taiwan engineering Traditional Chinese).
 * Targets common Mainland China (zh-CN) technical translations that LLMs frequently mix into zh-TW output.
 */
const ZH_TW_TERM_RULES: readonly RegionalTermRule[] = [
  { wrong: '派生', preferred: '衍生', reason: '台灣密碼學與工程用語為「衍生」（derive），非中國大陸用語「派生」' },
  { wrong: '字段', preferred: '欄位' },
  { wrong: '鑰匙', preferred: '金鑰', reason: '資訊安全與 Wi-Fi 加密情境下台灣工程用語為「金鑰」（key）' },
  { wrong: '數據包', preferred: '封包' },
  { wrong: '報文', preferred: '封包' },
  { wrong: '網絡', preferred: '網路' },
  { wrong: '信息', preferred: '訊息' },
  { wrong: '內存', preferred: '記憶體' },
  { wrong: '緩存', preferred: '快取' },
  { wrong: '寬帶', preferred: '頻寬' },
  { wrong: '調試', preferred: '除錯' },
  { wrong: '硬件', preferred: '硬體' },
  { wrong: '軟件', preferred: '軟體' },
  { wrong: '固件', preferred: '韌體' },
  { wrong: '芯片', preferred: '晶片' },
  { wrong: '總線', preferred: '匯流排' },
  { wrong: '服務器', preferred: '伺服器' },
  { wrong: '驅動程序', preferred: '驅動程式' },
  { wrong: '協議', preferred: '協定' },
  { wrong: '接口', preferred: '介面' },
  { wrong: '線程', preferred: '執行緒' },
  { wrong: '進程', preferred: '行程' },
  { wrong: '內核', preferred: '核心' },
  { wrong: '代碼', preferred: '程式碼' },
  { wrong: '默認', preferred: '預設' },
  { wrong: '兼容', preferred: '相容' },
  { wrong: '字節', preferred: '位元組' },
  { wrong: '比特', preferred: '位元' },
  { wrong: '信道', preferred: '通道' },
  { wrong: '視頻', preferred: '影片' },
  { wrong: '音頻', preferred: '音訊' },
  { wrong: '報錯', preferred: '回報錯誤' },
  { wrong: '延時', preferred: '延遲' },
  { wrong: '校驗', preferred: '驗證' },
  { wrong: '鏈路', preferred: '連結' },
];

/**
 * Unambiguous technical terminology mappings for zh-CN (Mainland China engineering Simplified Chinese).
 */
const ZH_CN_TERM_RULES: readonly RegionalTermRule[] = [
  { wrong: '記憶體', preferred: '内存' },
  { wrong: '快取', preferred: '缓存' },
  { wrong: '伺服器', preferred: '服务器' },
  { wrong: '硬體', preferred: '硬件' },
  { wrong: '軟體', preferred: '软件' },
  { wrong: '韌體', preferred: '固件' },
  { wrong: '晶片', preferred: '芯片' },
  { wrong: '除錯', preferred: '调试' },
  { wrong: '封包', preferred: '数据包' },
  { wrong: '匯流排', preferred: '总线' },
  { wrong: '介面', preferred: '接口' },
  { wrong: '執行緒', preferred: '线程' },
  { wrong: '程式碼', preferred: '代码' },
  { wrong: '網路', preferred: '网络' },
  { wrong: '金鑰', preferred: '密钥' },
  { wrong: '欄位', preferred: '字段' },
  { wrong: '訊息', preferred: '信息' },
  { wrong: '協定', preferred: '协议' },
  { wrong: '頻寬', preferred: '带宽' },
  { wrong: '預設', preferred: '默认' },
  { wrong: '位元組', preferred: '字节' },
];

export function getRegionalTermRules(language?: string): readonly RegionalTermRule[] {
  const code = getContentLanguage(language || DEFAULT_CONTENT_LANGUAGE).value;
  if (code === 'zh-TW') return ZH_TW_TERM_RULES;
  if (code === 'zh-CN') return ZH_CN_TERM_RULES;
  return [];
}

export function findRegionalTermMatches(text: string, language?: string): RegionalTermMatch[] {
  if (!text) return [];
  const rules = getRegionalTermRules(language);
  const matches: RegionalTermMatch[] = [];

  for (const rule of rules) {
    let count = 0;
    let idx = 0;
    while (true) {
      const found = text.indexOf(rule.wrong, idx);
      if (found === -1) break;
      count += 1;
      idx = found + rule.wrong.length;
    }
    if (count > 0) {
      matches.push({
        wrong: rule.wrong,
        preferred: rule.preferred,
        count,
        reason: rule.reason,
      });
    }
  }

  return matches;
}

export function applyDeterministicRegionalFixes(
  text: string,
  language?: string
): { text: string; replacements: RegionalTermMatch[] } {
  if (!text) return { text, replacements: [] };
  const rules = getRegionalTermRules(language);
  let next = text;
  const replacements: RegionalTermMatch[] = [];

  for (const rule of rules) {
    if (!next.includes(rule.wrong)) continue;
    const parts = next.split(rule.wrong);
    const count = parts.length - 1;
    next = parts.join(rule.preferred);
    replacements.push({
      wrong: rule.wrong,
      preferred: rule.preferred,
      count,
      reason: rule.reason,
    });
  }

  return { text: next, replacements };
}

export function getRegionalTerminologyPromptGuidance(language?: string): string {
  const lang = getContentLanguage(language || DEFAULT_CONTENT_LANGUAGE);
  switch (lang.value as ContentLanguage) {
    case 'zh-TW':
      return `REGIONAL TERMINOLOGY (Traditional Chinese — Taiwan engineering standard):
- Use authentic Taiwan hardware/network/software engineering terminology, NEVER Mainland China terms.
- Examples: 衍生/推導 (NOT 派生), 金鑰 (NOT 鑰匙/密钥), 欄位 (NOT 字段), 訊息 (NOT 信息), 封包 (NOT 數據包/報文), 網路 (NOT 網絡), 協定 (NOT 協議), 除錯 (NOT 調試), 記憶體 (NOT 內存), 快取 (NOT 緩存), 硬體/軟體/韌體 (NOT 硬件/軟件/固件), 晶片 (NOT 芯片), 匯流排 (NOT 總線), 伺服器 (NOT 服務器), 介面 (NOT 接口), 執行緒 (NOT 線程), 預設 (NOT 默認), 頻寬 (NOT 寬帶), 位元/位元組 (NOT 比特/字節).
- Keep standard English acronyms and protocol names intact (e.g., EAPOL, PTK, PMK, MIC, PCIe, OFDMA).`;
    case 'zh-CN':
      return `REGIONAL TERMINOLOGY (Simplified Chinese — Mainland China engineering standard):
- Use standard Mainland China technical terminology consistently (e.g., 密钥, 字段, 信息, 数据包/报文, 网络, 协议, 调试, 内存, 缓存, 硬件/软件/固件, 芯片, 总线, 服务器, 接口, 线程, 默认, 带宽). Do NOT mix Taiwan-specific Traditional Chinese terms.
- Keep standard English acronyms and protocol names intact.`;
    case 'en-US':
      return `REGIONAL TERMINOLOGY (US English engineering standard):
- Use standard IEEE/IETF/industry US English engineering terminology (e.g., derive/key derivation, frame, packet, field, handshake, latency, bandwidth, memory, cache, firmware).`;
    case 'ja-JP':
      return `REGIONAL TERMINOLOGY (Japanese engineering standard):
- Use standard Japanese IT/telecom engineering terminology (e.g., 鍵導出/派生鍵, フィールド, パケット, フレーム, プロトコル, デバッグ, メモリ, キャッシュ, ファームウェア) naturally in polite technical Japanese.`;
    case 'ko-KR':
      return `REGIONAL TERMINOLOGY (Korean engineering standard):
- Use standard Korean IT/telecom engineering terminology (e.g., 키 유도, 필드, 패킷, 프레임, 프로토콜, 디버깅, 메모리, 캐시, 펌웨어) naturally in technical Korean.`;
    default:
      return `Use standard regional engineering terminology for ${lang.promptName}.`;
  }
}

export function collectSceneTextForTermCheck(scene: SceneSpec): string {
  const parts: string[] = [
    scene.title || '',
    scene.subtitle || '',
    scene.script || '',
    ...(Array.isArray(scene.keyPoints) ? scene.keyPoints : []),
    scene.diagramData?.visualCaption || '',
  ];
  return parts.filter(Boolean).join('\n');
}
