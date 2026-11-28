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
  { wrong: '寄存器', preferred: '暫存器', reason: '台灣硬體與韌體工程用語為「暫存器」（register），非中國大陸用語「寄存器」' },
  { wrong: '邏輯分析器', preferred: '邏輯分析儀' },
  { wrong: '信道', preferred: '通道' },
  { wrong: '視頻', preferred: '影片' },
  { wrong: '高清', preferred: '高畫質', reason: '台灣工程與多媒體用語為「高畫質」（high definition），非中國大陸用語「高清」' },
  { wrong: '音頻', preferred: '音訊' },
  { wrong: '報錯', preferred: '回報錯誤' },
  { wrong: '延時', preferred: '延遲' },
  { wrong: '函數', preferred: '函式' },
  { wrong: '變量', preferred: '變數' },
  { wrong: '數組', preferred: '陣列' },
  { wrong: '字符串', preferred: '字串' },
  { wrong: '隊列', preferred: '佇列' },
  { wrong: '堆棧', preferred: '堆疊' },
  { wrong: '用戶', preferred: '使用者' },
  { wrong: '實時', preferred: '即時' },
  { wrong: '圖像', preferred: '影像' },
  { wrong: '鼠標', preferred: '滑鼠' },
  { wrong: '打印機', preferred: '印表機' },
  { wrong: '文件', preferred: '檔案' },
  { wrong: '存儲', preferred: '儲存' },
  { wrong: '性能', preferred: '效能' },
  { wrong: '交換機', preferred: '交換器' },
  { wrong: '指針', preferred: '指標' },
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
  { wrong: '位元', preferred: '比特' },
  { wrong: '衍生', preferred: '派生' },
  { wrong: '函式', preferred: '函数' },
  { wrong: '變數', preferred: '变量' },
  { wrong: '陣列', preferred: '数组' },
  { wrong: '字串', preferred: '字符串' },
  { wrong: '佇列', preferred: '队列' },
  { wrong: '堆疊', preferred: '堆栈' },
  { wrong: '使用者', preferred: '用户' },
  { wrong: '即時', preferred: '实时' },
  { wrong: '影像', preferred: '图像' },
  { wrong: '圖片', preferred: '图片' },
  { wrong: '高畫質', preferred: '高清' },
  { wrong: '影片', preferred: '视频' },
  { wrong: '音訊', preferred: '音频' },
  { wrong: '滑鼠', preferred: '鼠标' },
  { wrong: '印表機', preferred: '打印机' },
  { wrong: '檔案', preferred: '文件' },
  { wrong: '儲存', preferred: '存储' },
  { wrong: '效能', preferred: '性能' },
  { wrong: '交換器', preferred: '交换机' },
  { wrong: '指標', preferred: '指针' },
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
- Cryptography example: use 金鑰 and 衍生/derive (NOT 鑰匙 or 派生). Keep PTK, PMK, MIC, EAPOL, and ANonce unchanged.
- Taiwan technical writing commonly mixes English and Traditional Chinese. English-first wording is natural when it is standard in Taiwan engineering, including API, SDK, cache, firmware, chipset, server, packet/frame, field, register, debug, driver, latency, throughput, array, queue, stack, pointer, file, storage, performance, interface, and cloud/AI product terms.
- Prefer the exact English term or code identifier when it is the established engineering label. Do not force an awkward Chinese translation or remove a short English term for consistency.
- Multimedia examples: 高畫質/HD (NOT 高清), 影片/video (NOT 視頻), 音訊/audio (NOT 音頻).
- Common system terms: 函式 (NOT 函數), 變數 (NOT 變量), 陣列/array (NOT 數組), 字串/string (NOT 字符串), 佇列/queue (NOT 隊列), 堆疊/stack (NOT 堆棧), 使用者/user (NOT 用戶), 即時/realtime (NOT 實時), 影像/圖片/image (NOT 圖像), 檔案/file (NOT 文件), 儲存/storage (NOT 存儲), 效能/performance (NOT 性能), 指標/pointer (NOT 指針).
- Keep standard English acronyms and protocol names intact (e.g., EAPOL, PTK, PMK, MIC, PCIe, OFDMA, API, SDK, CPU, GPU, RAM, DMA, I/O, USB, TCP, UDP, HTTP, DNS, TLS, AES).
- When a Mainland China term is clear, replace it with the natural Taiwan equivalent or established English term; do not translate already-English names unless Taiwan engineers commonly do so.`;
    case 'zh-CN':
      return `REGIONAL TERMINOLOGY (Simplified Chinese — Mainland China engineering standard):
- Common system terms: 函数 (NOT 函式), 变量 (NOT 變數), 数组 (NOT 陣列), 字符串 (NOT 字串), 队列 (NOT 佇列), 堆栈 (NOT 堆疊), 用户 (NOT 使用者), 实时 (NOT 即時), 图像/图片 (NOT 影像/圖片), 视频/高清 (NOT 影片/高畫質), 文件 (NOT 檔案), 存储 (NOT 儲存), 性能 (NOT 效能), 指针 (NOT 指標).
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
