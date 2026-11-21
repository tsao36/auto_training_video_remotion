import {
  DOMAIN_META,
  SceneSpec,
  TARGET_VIDEO_DURATION_SECONDS,
  TechDomain,
  TrainingProject,
  TtsProvider,
  VisualTemplate,
} from '../types/training';

export const MIN_SCENE_SECONDS = 3;
export const MAX_SCENE_SECONDS = 180;

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function getRequiredSceneSeconds(
  scene: Pick<SceneSpec, 'script'> & { tts?: Partial<SceneSpec['tts']> }
): number {
  if (scene.tts?.actualDurationSec && scene.tts.actualDurationSec > 0) {
    return Math.max(MIN_SCENE_SECONDS, Math.ceil(scene.tts.actualDurationSec + 0.5));
  }
  const scriptLen = (scene.script || '').trim().length;
  const speed = scene.tts?.speed || 1.0;
  // ~4.0 Traditional Chinese / mixed tech characters per second at 1.0x + 1s breathing buffer
  const estSpeechSec = scriptLen > 0 ? Math.ceil(scriptLen / (4.0 * speed) + 1.0) : MIN_SCENE_SECONDS;
  return Math.max(MIN_SCENE_SECONDS, Math.min(MAX_SCENE_SECONDS, estSpeechSec));
}

export function computeRichnessDuration(
  scene: Pick<SceneSpec, 'script' | 'keyPoints' | 'template' | 'diagramData'> & {
    tts?: Partial<SceneSpec['tts']>;
  }
): number {
  if (scene.tts?.actualDurationSec && scene.tts.actualDurationSec > 0) {
    return Math.max(MIN_SCENE_SECONDS, Math.ceil(scene.tts.actualDurationSec + 0.5));
  }
  const speechSec = getRequiredSceneSeconds(scene);
  const kpCount = (scene.keyPoints || []).length;
  const diagramCount =
    (scene.diagramData?.nodes?.length || 0) +
    (scene.diagramData?.protocolSteps?.length || 0) +
    (scene.diagramData?.comparisonRows?.length || 0) +
    (scene.diagramData?.waveformChannels?.length || 0) +
    (scene.diagramData?.packetFields?.length || 0) +
    (scene.diagramData?.stateNodes?.length || 0) +
    (scene.diagramData?.codeLines?.length || 0) +
    (scene.diagramData?.kpiMetrics?.length || 0) +
    (scene.diagramData?.faultBranches?.length || 0);

  const visualFloor = Math.round(MIN_SCENE_SECONDS + Math.min(4, kpCount * 0.7 + diagramCount * 0.4));
  return Math.max(MIN_SCENE_SECONDS, Math.min(MAX_SCENE_SECONDS, Math.max(speechSec, visualFloor)));
}

export function balanceScenesToDuration(
  scenes: SceneSpec[],
  targetSeconds: number = TARGET_VIDEO_DURATION_SECONDS
): SceneSpec[] {
  if (scenes.length === 0) return scenes;

  const minAllowedPerScene = scenes.map((s) =>
    s.tts?.actualDurationSec && s.tts.actualDurationSec > 0
      ? Math.max(MIN_SCENE_SECONDS, Math.ceil(s.tts.actualDurationSec + 0.5))
      : MIN_SCENE_SECONDS
  );
  const maxAllowed = Math.max(MAX_SCENE_SECONDS, Math.ceil(targetSeconds / scenes.length) + 5);
  const durations = scenes.map((s, idx) =>
    Math.max(
      minAllowedPerScene[idx],
      Math.min(maxAllowed, Math.round(s.durationSeconds || computeRichnessDuration(s)))
    )
  );

  const minPossible = minAllowedPerScene.reduce((a, b) => a + b, 0);
  const maxPossible = scenes.length * maxAllowed;
  const target = Math.max(minPossible, Math.min(maxPossible, Math.round(targetSeconds)));

  let current = durations.reduce((a, b) => a + b, 0);
  let guard = 0;

  while (current !== target && guard < 4000) {
    guard++;
    if (current < target) {
      let progressed = false;
      for (let i = 0; i < durations.length && current < target; i++) {
        if (durations[i] < maxAllowed) {
          durations[i]++;
          current++;
          progressed = true;
        }
      }
      if (!progressed) break;
    } else {
      let progressed = false;
      for (let i = durations.length - 1; i >= 0 && current > target; i--) {
        if (durations[i] > minAllowedPerScene[i]) {
          durations[i]--;
          current--;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
  }

  return scenes.map((s, idx) => ({
    ...s,
    index: idx,
    durationSeconds: durations[idx],
  }));
}

export function balanceScenesTo10Minutes(scenes: SceneSpec[]): SceneSpec[] {
  return balanceScenesToDuration(scenes, TARGET_VIDEO_DURATION_SECONDS);
}

function inferTemplateFromText(text: string, index: number, total: number): VisualTemplate {
  if (index === 0) return 'title-hero';
  if (index === total - 1) return 'summary-takeaways';
  const lower = text.toLowerCase();
  if (/packet|frame|header|payload|beacon|eapol|tlv|mac header|fcs|封包|訊框|標頭|欄位/.test(lower)) {
    return 'packet-frame';
  }
  if (/state machine|fsm|ltssm|transition|state|scan.*auth|狀態機|狀態轉移|切換狀態/.test(lower)) {
    return 'state-machine';
  }
  if (/log|dmesg|register|cli|command|hex|0x|trace|程式碼|指令|暫存器|日誌/.test(lower)) {
    return 'code-log';
  }
  if (/kpi|metric|throughput|latency|snr|evm|rssi|margin|dbm|gbps|效能指標|量測數據|吞吐量/.test(lower)) {
    return 'kpi-metrics';
  }
  if (/fault tree|root cause|decision tree|branch|symptom|isolate|根因|決策樹|故障樹|分支排查/.test(lower)) {
    return 'fault-tree';
  }
  if (/waveform|oscilloscope|clock|spi|i2c|sine|s11|s21|spectrum|frequency|波形|頻譜|時脈|眼圖|漣波/.test(lower)) {
    return 'signal-waveform';
  }
  if (/handshake|sequence|boot|post|timeline|pairing|mlo|coex|時序|握手|開機|流程|仲裁/.test(lower)) {
    return 'protocol-timeline';
  }
  if (/vs|compare|comparison|matrix|difference|6e|wifi 7|ble|classic|對照|比較|差異|規格/.test(lower)) {
    return 'comparison-matrix';
  }
  if (/debug|troubleshoot|triage|checklist|issue|fail|除錯|排查|異常|檢查/.test(lower)) {
    return 'debug-checklist';
  }
  return 'architecture-flow';
}

const MICRO_BEAT_ANGLES: {
  suffix: string;
  template: VisualTemplate;
  prompt: (t: string, b: string) => string;
}[] = [
  {
    suffix: '核心痛點',
    template: 'title-hero',
    prompt: (t, b) => `${t} 是筆電研發關鍵。${b.slice(0, 24)}`,
  },
  {
    suffix: '硬體拓撲圖',
    template: 'architecture-flow',
    prompt: (t) => `觀察 ${t} 硬體訊號鏈，從主控端延伸至實體介面。`,
  },
  {
    suffix: '波形與時域特徵',
    template: 'signal-waveform',
    prompt: (t) => `示波器量測 ${t}，務必鎖定上升緣與訊號雜訊比。`,
  },
  {
    suffix: '交握與時序門檻',
    template: 'protocol-timeline',
    prompt: (t) => `追蹤 ${t} 毫秒級交握時序，逾時將觸發系統重置。`,
  },
  {
    suffix: '規格指標對照',
    template: 'comparison-matrix',
    prompt: (t) => `比對正常板與異常板在 ${t} 的電氣指標差異。`,
  },
  {
    suffix: '除錯排查 SOP',
    template: 'debug-checklist',
    prompt: (t) => `面對 ${t} 異常，以二分法隔離電源、時脈與週邊。`,
  },
  {
    suffix: 'EVT/DVT 檢查點',
    template: 'summary-takeaways',
    prompt: (t) => `EVT 與 DVT 階段務必完成 ${t} 邊界測試與存檔。`,
  },
];

function expandSectionsToMicroBeats(
  sections: { title: string; body: string; notes?: string }[],
  targetSceneCount = 90
) {
  const beats: { title: string; body: string; notes?: string; template?: VisualTemplate }[] = [];
  if (sections.length === 0) return beats;
  const perSection = Math.max(2, Math.ceil(targetSceneCount / sections.length));

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    const sourceText = `${sec.body} ${sec.notes || ''}`.trim();
    const sentences = sourceText
      .split(/[。.!?\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 6);

    for (let bIdx = 0; bIdx < perSection; bIdx++) {
      const angle = MICRO_BEAT_ANGLES[(sIdx + bIdx) % MICRO_BEAT_ANGLES.length];
      const sentence = sentences[bIdx % Math.max(1, sentences.length)] || sec.body;
      const shortSnippet = sentence.length > 42 ? `${sentence.slice(0, 40)}。` : sentence;

      const tpl: VisualTemplate =
        beats.length === 0
          ? 'title-hero'
          : bIdx === 0
          ? inferTemplateFromText(`${sec.title} ${shortSnippet}`, beats.length, targetSceneCount)
          : angle.template;

      const script =
        bIdx === 0 && sentences[0]
          ? `${sec.title}：${shortSnippet}`
          : angle.prompt(sec.title, shortSnippet);

      beats.push({
        title: bIdx === 0 ? sec.title : `${sec.title}｜${angle.suffix}`,
        body: shortSnippet || sec.title,
        notes: script,
        template: tpl,
      });

      if (beats.length >= targetSceneCount) break;
    }
    if (beats.length >= targetSceneCount) break;
  }

  return beats;
}

export function buildPlanFromSource(params: {
  title: string;
  domain: TechDomain;
  sourceType: 'pptx' | 'pdf' | 'research-text';
  sourceFileName?: string;
  rawText: string;
  slides?: { title: string; body: string; notes?: string }[];
  defaultTtsProvider: TtsProvider;
}): TrainingProject {
  const meta = DOMAIN_META[params.domain];
  const voiceId = params.defaultTtsProvider === 'ming-3.0' ? 'ming-tech-zh-en' : 'formosa-pro-tw';

  let baseSections: { title: string; body: string; notes?: string }[] = [];

  if (params.slides && params.slides.length > 0) {
    baseSections = params.slides;
  } else {
    const blocks = params.rawText
      .split(/\n{2,}|(?=^#{1,3}\s)/m)
      .map((b) => b.trim())
      .filter((b) => b.length > 15);

    if (blocks.length >= 4) {
      baseSections = blocks.slice(0, 14).map((block, i) => {
        const lines = block.split('\n').map((l) => l.replace(/^#+\s*/, '').trim());
        const heading = lines[0]?.slice(0, 60) || `章節 ${i + 1}`;
        const body = lines.slice(1).join('。') || lines[0];
        return { title: heading, body };
      });
    } else {
      const coreTopic = params.title || meta.label;
      const snippet = params.rawText.trim().slice(0, 320);
      baseSections = [
        { title: `${coreTopic} 導論`, body: snippet },
        { title: '筆電平台硬體架構', body: '主機板 SoC、PCH、EC 與高速介面訊號拓撲。' },
        { title: '電源與時脈穩定度', body: 'Power Rail 漣波、參考時脈起振與電源時序檢查。' },
        { title: '實體層訊號波形量測', body: '示波器與邏輯分析儀關鍵波形與眼圖判讀。' },
        { title: '協定交握與狀態機', body: '初始化交握流程、重試機制與 Timeout 門檻。' },
        { title: '世代規格與設計權衡', body: '吞吐量、延遲、功耗與 PCB 佈線成本比較。' },
        { title: '實務除錯決策樹', body: '二分法故障域收斂與關鍵元件隔離驗證。' },
        { title: 'EMI/RFI 共存與去敏化', body: '高速匯流排雜訊耦合抑制與屏蔽接地實務。' },
        { title: '高低溫與邊界應力測試', body: 'Thermal、Vmin/Vmax 與間歇性失效捕捉。' },
        { title: 'EVT/DVT 量產檢查總結', body: '完成全機驗證指標與波形存檔準則。' },
      ];
    }
  }

  const microBeats = expandSectionsToMicroBeats(baseSections, 90);
  const rawScenes: SceneSpec[] = microBeats.map((sec, idx) => {
    const template = sec.template || inferTemplateFromText(`${sec.title} ${sec.body}`, idx, microBeats.length);
    const sentences = sec.body
      .split(/[。.!?\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3);

    const keyPoints =
      sentences.length > 0
        ? sentences.slice(0, 3).map((s) => (s.length > 48 ? `${s.slice(0, 46)}...` : s))
        : [`${sec.title} 核心指標`, '筆電平台量測驗證'];

    const script = (sec.notes || sec.body || sec.title).trim();
    const diagramData = getDefaultDiagramData(params.domain, template);
    const durationSeconds = computeRichnessDuration({
      script,
      keyPoints,
      template,
      diagramData,
    });

    return {
      id: `scene-${Date.now()}-${idx}`,
      index: idx,
      title: sec.title,
      subtitle: `${meta.badge} • BEAT ${idx + 1}`,
      domain: params.domain,
      template,
      durationSeconds,
      keyPoints,
      script,
      diagramData,
      tts: {
        provider: params.defaultTtsProvider,
        voiceId,
        speed: 1.05,
        status: 'idle',
      },
      animation: {
        motionStyle: idx % 2 === 0 ? 'spring-snappy' : 'step-reveal',
        accentColor: meta.accentColor,
        showSubtitles: true,
        showProgressHud: true,
      },
    };
  });

  const balanced = balanceScenesTo10Minutes(rawScenes);

  return {
    id: `proj-${Date.now()}`,
    title: params.title || `${meta.shortLabel} 技術培訓課程`,
    subtitle: meta.description,
    domain: params.domain,
    targetDurationSeconds: TARGET_VIDEO_DURATION_SECONDS,
    fps: 30,
    width: 1920,
    height: 1080,
    sourceType: params.sourceType,
    sourceFileName: params.sourceFileName,
    rawSourceText: params.rawText,
    ttsConfig: {
      defaultProvider: params.defaultTtsProvider === 'browser-fallback' ? 'openformosa' : params.defaultTtsProvider,
      openformosa: {
        baseUrl: 'http://127.0.0.1:8001/v1/tts',
        apiKey: '',
        model: 'OpenFormosa/BlueMagpie-TTS',
        voice: 'hung_yi_lee',
      },
      mingTts: {
        baseUrl: 'http://localhost:8000/v1/tts',
        apiKey: '',
        model: 'inclusionAI/Ming-3.0-tts',
        speaker: 'ming-tech-zh-en',
        style: 'professional-training',
      },
    },
    scenes: balanced,
  };
}

export function getDefaultDiagramData(domain: TechDomain, template: VisualTemplate) {
  if (template === 'signal-waveform') {
    if (domain === 'debug-logic') {
      return {
        waveformFreqHz: 2.5,
        waveformChannels: [
          { label: 'SPI_CLK (48 MHz)', color: '#00C2FF', type: 'clock' as const },
          { label: 'SPI_MOSI (BIOS Fetch)', color: '#10B981', type: 'data' as const },
          { label: 'PLT_RST# (3.3V)', color: '#F59E0B', type: 'data' as const },
        ],
      };
    }
    return {
      waveformFreqHz: 3.2,
      waveformChannels: [
        { label: 'RF Carrier (5.8 / 6.5 GHz)', color: '#A78BFA', type: 'rf-sine' as const },
        { label: 'OFDMA Subcarriers (320 MHz)', color: '#00C2FF', type: 'ofdma' as const },
        { label: 'Baseband I/Q Envelope', color: '#10B981', type: 'data' as const },
      ],
    };
  }

  if (template === 'architecture-flow') {
    if (domain === 'wifi') {
      return {
        nodes: [
          { id: 'cpu', label: 'SoC / PCH', sublabel: 'CNVi2 / PCIe Gen4', color: '#0071C5' },
          { id: 'mac', label: 'Wi-Fi 7 MAC', sublabel: 'MLO & 4K-QAM', color: '#00C2FF' },
          { id: 'rfic', label: 'RF Front-End', sublabel: 'PA / LNA / Switch', color: '#38BDF8' },
          { id: 'ant', label: 'Laptop Antenna', sublabel: '2x2 MIMO Top-Bezel', color: '#10B981' },
        ],
      };
    }
    if (domain === 'bluetooth') {
      return {
        nodes: [
          { id: 'host', label: 'OS BT Stack', sublabel: 'L2CAP / GATT / LE Audio', color: '#2563EB' },
          { id: 'hci', label: 'HCI Transport', sublabel: 'USB / High-Speed UART', color: '#60A5FA' },
          { id: 'ctrl', label: 'BT Controller', sublabel: 'Baseband & PTA Coex', color: '#00C2FF' },
          { id: 'rf', label: '2.4GHz RF', sublabel: 'GFSK / Shared Antenna', color: '#10B981' },
        ],
      };
    }
    if (domain === 'rf') {
      return {
        nodes: [
          { id: 'transceiver', label: 'RF Transceiver', sublabel: '50Ω Differential', color: '#7C3AED' },
          { id: 'fem', label: 'FEM / Filter', sublabel: 'Bandpass & Diplexer', color: '#A78BFA' },
          { id: 'coax', label: 'Micro-Coax', sublabel: 'I-PEX / Hinge Routing', color: '#00C2FF' },
          { id: 'chassis', label: 'Chassis Antenna', sublabel: 'PIFA / Slot Tuning', color: '#10B981' },
        ],
      };
    }
    return {
      nodes: [
        { id: 'pmic', label: 'VR / PMIC', sublabel: 'S5 -> S0 Power Rails', color: '#F59E0B' },
        { id: 'ec', label: 'Embedded Ctrl', sublabel: 'Power Seq & Thermal', color: '#00C2FF' },
        { id: 'soc', label: 'x86 / ARM SoC', sublabel: 'BIOS SPI & Memory Init', color: '#0071C5' },
        { id: 'pcie', label: 'PCIe / USB4', sublabel: 'LTSSM Link Training', color: '#10B981' },
      ],
    };
  }

  if (template === 'protocol-timeline') {
    if (domain === 'debug-logic') {
      return {
        protocolSteps: [
          { actor: 'EC', target: 'PMIC', message: 'Assert RSMRST# & SLP_S5#', timing: 'T0 + 10ms' },
          { actor: 'PMIC', target: 'SoC', message: 'VCCIN_AUX & ALL_SYS_PWRGD', timing: 'T0 + 35ms' },
          { actor: 'SoC', target: 'SPI Flash', message: 'Fetch Bootblock (CS0# Low)', timing: 'T0 + 50ms' },
          { actor: 'BIOS', target: 'PCIe', message: 'PLT_RST# De-assert & Link Up', timing: 'T0 + 180ms' },
        ],
      };
    }
    return {
      protocolSteps: [
        { actor: 'STA', target: 'AP', message: 'Probe Request (MLO Capabilities)', timing: '0.0 ms' },
        { actor: 'AP', target: 'STA', message: 'Auth + Association (2.4 / 5 / 6 GHz)', timing: '4.2 ms' },
        { actor: 'AP', target: 'STA', message: '4-Way EAPOL Key Handshake', timing: '11.8 ms' },
        { actor: 'STA', target: 'AP', message: 'TID-to-Link Mapping & Data Tx', timing: '15.0 ms' },
      ],
    };
  }

  if (template === 'comparison-matrix') {
    if (domain === 'wifi') {
      return {
        comparisonHeaders: ['Wi-Fi 6E (802.11ax)', 'Wi-Fi 7 (802.11be)'] as [string, string],
        comparisonRows: [
          { metric: 'Max Channel Width', optionA: '160 MHz', optionB: '320 MHz (2x)', highlight: 'B' as const },
          { metric: 'Modulation', optionA: '1024-QAM', optionB: '4096-QAM (+20%)', highlight: 'B' as const },
          { metric: 'Multi-Link (MLO)', optionA: 'Single Band', optionB: 'Simultaneous 5+6GHz', highlight: 'B' as const },
          { metric: 'Typical Laptop PHY', optionA: '2.4 Gbps (2x2)', optionB: '5.8 Gbps (2x2)', highlight: 'B' as const },
        ],
      };
    }
    if (domain === 'bluetooth') {
      return {
        comparisonHeaders: ['Bluetooth Classic (BR/EDR)', 'BLE / LE Audio (5.3+)'] as [string, string],
        comparisonRows: [
          { metric: 'Audio Codec', optionA: 'SBC / AAC', optionB: 'LC3 (Low Complexity)', highlight: 'B' as const },
          { metric: 'Power Draw', optionA: '~15–30 mA', optionB: '< 5 mA (Duty Cycled)', highlight: 'B' as const },
          { metric: 'Broadcast Audio', optionA: 'Point-to-Point', optionB: 'Auracast Multi-Stream', highlight: 'B' as const },
          { metric: 'Wi-Fi Coex Impact', optionA: 'High (79 Channels)', optionB: 'Adaptive Hopping + PTA', highlight: 'B' as const },
        ],
      };
    }
    return {
      comparisonHeaders: ['Nominal Spec (Pass)', 'Degraded Board (Fail)'] as [string, string],
      comparisonRows: [
        { metric: 'S11 Return Loss', optionA: '< -10 dB', optionB: '-4.5 dB (Mismatch)', highlight: 'A' as const },
        { metric: 'Rx Desense (USB3)', optionA: '< 1.5 dB', optionB: '8.2 dB Noise Floor Rise', highlight: 'A' as const },
        { metric: 'Power Rail Ripple', optionA: '< 25 mVpp', optionB: '110 mVpp Droop', highlight: 'A' as const },
        { metric: 'Antenna Isolation', optionA: '> 18 dB', optionB: '9 dB Coupling', highlight: 'A' as const },
      ],
    };
  }

  if (template === 'packet-frame') {
    if (domain === 'wifi') {
      return {
        visualCaption: '802.11 Management / Data MAC Frame 欄位結構',
        packetFields: [
          { name: 'Frame Ctrl', bits: '2B', value: '0x0080', description: '協定版本、Frame Type (Mgmt/Ctrl/Data) 與旗標位元', color: '#38BDF8', highlight: true },
          { name: 'Duration/ID', bits: '2B', value: '0x013A', description: 'NAV 虛擬載波感測保護時間 (μs)', color: '#0EA5E9' },
          { name: 'Addr 1–3', bits: '18B', value: 'RA / TA / BSSID', description: '接收端、發送端與 AP BSSID 位址欄位', color: '#6366F1' },
          { name: 'Seq Ctrl', bits: '2B', value: 'Frag=0 Seq=42', description: '分片序號與重傳去重識別', color: '#8B5CF6' },
          { name: 'Frame Body', bits: '0–2312B', value: 'IEs / Payload', description: '能力資訊、MLO IE 或加密後上層封包', color: '#10B981', highlight: true },
          { name: 'FCS', bits: '4B', value: 'CRC-32', description: '整幀循環冗餘校驗，錯誤即丟棄', color: '#F59E0B' },
        ],
      };
    }
    if (domain === 'bluetooth') {
      return {
        visualCaption: 'BLE Link Layer PDU 封包拆解',
        packetFields: [
          { name: 'Preamble', bits: '1–2B', value: '0xAA / 0x55', description: '接收端頻率同步與 AGC 鎖定前導碼', color: '#60A5FA' },
          { name: 'Access Addr', bits: '4B', value: '0x8E89BED6', description: '廣播或連線專屬存取位址', color: '#3B82F6', highlight: true },
          { name: 'PDU Header', bits: '2B', value: 'LLID / Length', description: '區分資料/控制封包與負載長度', color: '#8B5CF6' },
          { name: 'Payload', bits: '0–251B', value: 'L2CAP / ATT', description: 'GATT 特徵值或 LE Audio ISO 資料', color: '#10B981', highlight: true },
          { name: 'CRC', bits: '3B', value: 'CRC-24', description: '鏈路層完整性校驗，失敗觸發重傳', color: '#F59E0B' },
        ],
      };
    }
    return {
      visualCaption: 'PCIe / 高速匯流排 TLP 封包結構',
      packetFields: [
        { name: 'STP / Seq', bits: '2B', value: 'Seq# 0x014', description: 'Data Link Layer 封包起始與序號保護', color: '#00C2FF' },
        { name: 'TLP Header', bits: '12–16B', value: 'Fmt / Type / Tag', description: '定義 Memory Read/Write、Requester ID 與位址', color: '#0071C5', highlight: true },
        { name: 'Data Payload', bits: '0–4KB', value: 'MPS 256B', description: '實際 DMA 傳輸資料負載', color: '#10B981' },
        { name: 'ECRC / LCRC', bits: '4B', value: 'CRC-32', description: '鏈路層錯誤偵測，異常觸發 Replay', color: '#F59E0B', highlight: true },
      ],
    };
  }

  if (template === 'state-machine') {
    if (domain === 'wifi') {
      return {
        visualCaption: '802.11 連線建立與漫遊狀態機',
        stateNodes: [
          { id: 'scan', label: 'SCAN', sublabel: 'Probe / Beacon', status: 'normal' as const },
          { id: 'auth', label: 'AUTH', sublabel: 'SAE / Open Auth', status: 'normal' as const },
          { id: 'assoc', label: 'ASSOC', sublabel: 'MLO & Capab IE', status: 'active' as const },
          { id: 'eapol', label: '4-WAY KEY', sublabel: 'PTK / GTK 安裝', status: 'normal' as const },
          { id: 'run', label: 'CONNECTED', sublabel: 'Data Tx/Rx', status: 'success' as const },
        ],
        stateTransitions: [
          { from: 'scan', to: 'auth', trigger: 'BSS Selected' },
          { from: 'auth', to: 'assoc', trigger: 'Auth OK' },
          { from: 'assoc', to: 'eapol', trigger: 'Assoc Resp' },
          { from: 'eapol', to: 'run', trigger: 'M4 ACK' },
          { from: 'eapol', to: 'scan', trigger: 'Deauth / Timeout', isErrorPath: true },
        ],
      };
    }
    return {
      visualCaption: 'PCIe LTSSM 鏈路訓練狀態機',
      stateNodes: [
        { id: 'detect', label: 'Detect', sublabel: 'Rx 終端阻抗偵測', status: 'normal' as const },
        { id: 'polling', label: 'Polling', sublabel: 'TS1/TS2 位元鎖定', status: 'normal' as const },
        { id: 'config', label: 'Config', sublabel: 'Lane 寬度與極性協商', status: 'active' as const },
        { id: 'l0', label: 'L0 Active', sublabel: '正常高速傳輸', status: 'success' as const },
        { id: 'recovery', label: 'Recovery', sublabel: '降速 / 重訓 EQ', status: 'error' as const },
      ],
      stateTransitions: [
        { from: 'detect', to: 'polling', trigger: 'Rx Detected' },
        { from: 'polling', to: 'config', trigger: 'TS2 Locked' },
        { from: 'config', to: 'l0', trigger: 'Link Up' },
        { from: 'l0', to: 'recovery', trigger: 'CRC / Framing Err', isErrorPath: true },
      ],
    };
  }

  if (template === 'code-log') {
    if (domain === 'wifi') {
      return {
        codeLanguage: 'log',
        codeTitle: 'iwlwifi / wpa_supplicant 連線除錯日誌',
        visualCaption: '從驅動 Log 定位 4-Way Handshake 逾時根因',
        codeLines: [
          { lineNo: 1, text: '[12.401] wlan0: authenticate with 4c:ed:fb:92:1a:20 (6GHz ch37)', level: 'normal' as const },
          { lineNo: 2, text: '[12.418] wlan0: associate with 4c:ed:fb:92:1a:20 (MLO 5+6GHz)', level: 'success' as const, annotation: 'Association 成功，雙鏈路能力協商完成' },
          { lineNo: 3, text: '[12.425] WPA: RX message 1 of 4-Way Handshake (ANonce OK)', level: 'highlight' as const, annotation: '已收到 AP 送出的 EAPOL M1' },
          { lineNo: 4, text: '[16.430] wlan0: WPA: 4-Way Handshake timeout — no M3 received', level: 'error' as const, annotation: '卡在 M2→M3：常見為密碼/PMF 設定或封包被干擾丟失' },
          { lineNo: 5, text: '[16.432] wlan0: deauthenticating (reason=15 4WAY_HANDSHAKE_TIMEOUT)', level: 'warn' as const, annotation: 'Reason 15 明確指向金鑰交握階段失敗' },
        ],
      };
    }
    return {
      codeLanguage: 'log',
      codeTitle: 'EC / BIOS POST & PCIe Bring-Up Trace',
      visualCaption: '透過暫存器與開機日誌快速定位卡關階段',
      codeLines: [
        { lineNo: 1, text: '[00.012] EC: RSMRST#=1, SLP_S5#=1, ALL_SYS_PWRGD=1', level: 'success' as const, annotation: '主要供電軌與 Power Good 皆已就緒' },
        { lineNo: 2, text: '[00.048] BIOS: POST 0x32 — MRC DDR5 Training Completed', level: 'normal' as const },
        { lineNo: 3, text: '[00.115] PCIE RP4: LTSSM Detect -> Polling -> Config (Gen5 x4)', level: 'highlight' as const, annotation: '進入高速鏈路訓練階段' },
        { lineNo: 4, text: '[00.194] PCIE RP4: EQ Phase 2 Timeout! Downgrade Gen5 -> Gen3', level: 'error' as const, annotation: '通道插入損耗或 RefClk Jitter 導致降速' },
        { lineNo: 5, text: '[00.201] PCIE RP4: AER Correctable=142, Receiver Error Flag=1', level: 'warn' as const, annotation: '檢查主機板走線阻抗與 AC 耦合電容' },
      ],
    };
  }

  if (template === 'kpi-metrics') {
    if (domain === 'rf') {
      return {
        visualCaption: 'RF 天線與系統去敏化關鍵量測指標',
        kpiMetrics: [
          { label: 'S11 Return Loss', value: '-14.2 dB', delta: 'PASS', target: '< -10 dB', status: 'good' as const },
          { label: 'Antenna Isolation', value: '21.5 dB', delta: '+3.5 dB', target: '> 18 dB', status: 'good' as const },
          { label: 'USB3 Rx Desense', value: '6.8 dB', delta: '超標警示', target: '< 1.5 dB', status: 'bad' as const },
          { label: 'SAR 1g Avg', value: '0.84 W/kg', delta: '餘裕 47%', target: '< 1.6 W/kg', status: 'good' as const },
        ],
      };
    }
    return {
      visualCaption: 'EVT / DVT 階段核心效能與穩定度 KPI',
      kpiMetrics: [
        { label: 'Peak Throughput', value: '4.8 Gbps', delta: '+92% vs 6E', target: '> 4.0 Gbps', status: 'good' as const },
        { label: 'P99 Latency', value: '3.2 ms', delta: '-68% 延遲', target: '< 5.0 ms', status: 'good' as const },
        { label: 'Packet Error Rate', value: '0.42%', delta: '輕微波動', target: '< 0.1%', status: 'warn' as const },
        { label: 'Active Power', value: '1.85 W', delta: '-22% 功耗', target: '< 2.2 W', status: 'good' as const },
      ],
    };
  }

  if (template === 'fault-tree') {
    if (domain === 'wifi') {
      return {
        visualCaption: 'Wi-Fi 斷線 / 低吞吐量根因排查決策樹',
        faultRoot: '筆電 Wi-Fi 6GHz 連線頻繁掉速或斷線',
        faultBranches: [
          {
            symptom: 'RSSI 過低 (< -75 dBm)',
            check: '量測天線埠 S11 與 I-PEX 接頭',
            passAction: '排除天線硬體，轉查 AP 覆蓋',
            failRootCause: '同軸線鬆脫或金屬機殼遮蔽導致失配',
            severity: 'high' as const,
          },
          {
            symptom: '高重傳率 / 低 MCS',
            check: '檢查 USB3 / DDR EMI 雜訊底噪',
            passAction: '底噪正常，轉查驅動與漫遊門檻',
            failRootCause: 'USB3 3.2GHz/6GHz 諧波造成 Rx Desense',
            severity: 'high' as const,
          },
          {
            symptom: '握手逾時 (Reason 15)',
            check: '抓包比對 EAPOL M1–M4 與 PMF',
            passAction: '金鑰流程正常，檢查 DHCP/DNS',
            failRootCause: 'AP 韌體 MLO/WPA3 相容性或驅動 Bug',
            severity: 'medium' as const,
          },
        ],
      };
    }
    return {
      visualCaption: '系統異常分層隔離決策樹 (二分法 SOP)',
      faultRoot: '平台開機無畫面 / 高速介面隨機失聯',
      faultBranches: [
        {
          symptom: 'Power Rail 壓降或無輸出',
          check: '量測 VR 輸出波形與 ALL_SYS_PWRGD',
          passAction: '供電穩定，進入時脈與重置檢查',
          failRootCause: 'PMIC 保護鎖定、負載短路或電容失效',
          severity: 'high' as const,
        },
        {
          symptom: '時脈偏移 / 重置卡死',
          check: '示波器抓取 100MHz RefClk 與 PLT_RST#',
          passAction: '時序正確，轉查匯流排協定',
          failRootCause: '晶振未起振或 EC 電源時序卡關',
          severity: 'high' as const,
        },
        {
          symptom: '匯流排降速或 CRC 暴增',
          check: '讀取 AER 錯誤暫存器與眼圖餘裕',
          passAction: 'SI 達標，聚焦 BIOS/驅動設定',
          failRootCause: '高速走線阻抗不連續或散熱降頻',
          severity: 'medium' as const,
        },
      ],
    };
  }

  return undefined;
}

export function createPresetProject(domain: TechDomain): TrainingProject {
  const presets: Record<TechDomain, { title: string; rawText: string; slides: { title: string; body: string; notes: string }[] }> = {
    'debug-logic': {
      title: 'PC/筆電硬體除錯共通邏輯：從 Power Sequence 到 Root-Cause',
      rawText: 'PC Laptop Hardware Debug Common Logic Training: Power Sequencing, EC/BIOS POST, SPI/I2C/PCIe probing, and systematic root-cause isolation.',
      slides: [
        {
          title: 'PC/筆電除錯共通邏輯與方法論',
          body: '建立標準化硬體除錯思維：從電源軌驗證、時脈確認、重置訊號到匯流排協定分析。',
          notes: '歡迎來到 PC 與筆電工程除錯培訓課程。在現代輕薄筆電的高密度主機板設計中，面對不開機或間歇性當機，我們需要一套嚴謹的共通除錯邏輯，而不是盲目更換元件。這十分鐘的課程將帶您走過從 Power Rail 到 PCIe Link Training 的完整排查流程。',
        },
        {
          title: '筆電開機供電與核心控制架構',
          body: '理解 AC_IN、3V/5V Always、Embedded Controller (EC) 與 SoC/PCH 之間的電源依賴鏈。',
          notes: '首先觀察筆電的供電拓撲。當電源接上後，Always-on 電源軌必須先穩定，接著由 EC 觸發 S5 到 S0 的狀態機轉換。任何一級 Power Good 訊號未拉高，都會導致後續時序卡死。',
        },
        {
          title: '邏輯分析儀與示波器關鍵波形判讀',
          body: '量測 SPI Flash BIOS 讀取時脈、I2C/SMBus PD 通訊以及 PLT_RST# 上升緣單調性。',
          notes: '當電源軌正常卻無畫面時，第一步是掛上邏輯分析儀觀察 SPI ROM 的 CS# 與 CLK。如果沒有看到 BIOS Bootblock 讀取封包，代表 SoC 根本尚未釋放重置或參考時脈異常。',
        },
        {
          title: 'S5 -> S0 開機時序與 POST 互動流程',
          body: '追蹤 RSMRST#、ALL_SYS_PWRGD、SPI Fetch 與 PCIe PLT_RST# 的毫秒級時序關係。',
          notes: '透過時間軸我們可以清楚看到：EC 發出 RSMRST# 後約 35 毫秒，PMIC 必須回報 ALL_SYS_PWRGD。隨後 SoC 在 50 毫秒內讀取 BIOS，並在 180 毫秒左右釋放 PLT_RST# 啟動 PCIe 設備。',
        },
        {
          title: '常見除錯工具與量測手段對照',
          body: '比較示波器類比量測、邏輯分析儀協定解碼與 Port 80 POST Code 的適用場景。',
          notes: '工程師必須選對工具：電源漣波與 Signal Integrity 必須看示波器類比波形；而 BIOS 卡在哪個階段，則要結合 Port 80 POST Code 與邏輯分析儀進行交叉比對。',
        },
        {
          title: 'No-Power / No-POST 五步排查決策樹',
          body: 'Step 1 確認大電流短路；Step 2 量測 3V/5V LDO；Step 3 檢查 Crystal 25MHz/32.768KHz；Step 4 驗證 SPI Flash；Step 5 隔離 PCIe 週邊。',
          notes: '實戰中最有效的五步排查法：先確認主電源無對地短路，再依序檢查待機電壓、晶振起振、BIOS 訊號與外設隔離。透過二分法快速縮小故障域。',
        },
        {
          title: '間歇性 Fail (Thermal / Marginal) 應力測試',
          body: '利用高低溫箱、Vmin/Vmax 電壓邊界測試與 Clock Jitter 分析捕捉邊際失效。',
          notes: '面對最棘手的間歇性異常，單純室溫量測往往正常。我們必須結合電壓 Margin 測試與溫升應力，觀察是否因 Power Droop 造成邏輯誤動作。',
        },
        {
          title: '工程除錯總結與 EVT/DVT 檢查清單',
          body: '建立完整量測波形存檔習慣，確保 Power Sequence、Reset 單調性與 Rail 漣波全數達標。',
          notes: '總結今天的核心觀念：先電源、後時脈、再重置、最後看協定。在 EVT 與 DVT 階段務必完整記錄每個關鍵訊號的量測數據，祝大家除錯順利！',
        },
      ],
    },
    wifi: {
      title: '筆電 Wi-Fi 6E / Wi-Fi 7 無線架構與性能調優實戰',
      rawText: 'Laptop Wi-Fi 6E/7 Architecture Training: CNVi vs PCIe M.2, OFDMA, 320MHz, MLO, Antenna Isolation and Desense.',
      slides: [
        {
          title: '筆電 Wi-Fi 6E / 7 系統架構總覽',
          body: '解析現代筆電如何透過 6GHz 頻段、320MHz 超寬頻與 MLO 實現有線級低延遲體驗。',
          notes: '歡迎來到筆電 Wi-Fi 技術培訓。隨著 Wi-Fi 6E 與 Wi-Fi 7 在筆電平台普及，無線吞吐量已突破 5Gbps。本課程將從系統架構、實體層波形、MLO 協定到筆電天線整合，進行十分鐘的深度解析。',
        },
        {
          title: '筆電 CNVi / PCIe M.2 無線模組架構',
          body: '從 SoC 整合 MAC/Baseband 到 M.2 2230 CRF 模組、RF 前端 FEM 與雙天線佈局。',
          notes: '在筆電主機板上，Wi-Fi 模組通常透過 M.2 Key E 插槽連接。採用 CNVi 架構時，MAC 層運算整合在 SoC 內部，大幅降低功耗與 PCB 走線複雜度，再透過微同軸線連接至螢幕上緣天線。',
        },
        {
          title: 'OFDMA 子載波與 320MHz 頻寬波形解析',
          body: '觀察 4096-QAM 調變密度提升與 Multi-RU 資源分配對高干擾環境的改善。',
          notes: '在實體層上，Wi-Fi 7 將通道頻寬倍增至 320MHz，並引入 4096-QAM。同時藉由 OFDMA 將頻寬切分為多個 RU，讓筆電在擁擠的辦公室環境中依然能維持極低延遲。',
        },
        {
          title: 'MLO (Multi-Link Operation) 連線時序',
          body: '筆電同時綁定 5GHz 與 6GHz 雙鏈路進行封包聚合與無縫切換 (STR / eMLSR)。',
          notes: 'MLO 是 Wi-Fi 7 最具革命性的特性。在連線交握階段，筆電與 AP 會協商雙頻鏈路。當 6GHz 訊號受阻時，封包可毫秒級無縫轉移至 5GHz 鏈路，徹底消除視訊會議卡頓。',
        },
        {
          title: 'Wi-Fi 6E 與 Wi-Fi 7 關鍵規格對照',
          body: '全面比較 160MHz vs 320MHz、1024-QAM vs 4096-QAM 與實測筆電吞吐量差異。',
          notes: '透過規格對照表可以看到，Wi-Fi 7 不僅將理論峰值速率翻倍，更重要的是透過 MLO 與 Preamble Puncturing 提升了真實環境下的穩定度。',
        },
        {
          title: '筆電 Throughput 異常排查清單',
          body: '檢查天線 Main/Aux 接頭、機殼開孔遮蔽、USB3 2.4GHz Desense 與省電模式設定。',
          notes: '當實測速率不達標時，請依序檢查：天線同軸線是否壓損、金屬機殼天線窗口是否足夠、以及附近 USB 3.2 高速傳輸是否造成接收靈敏度下降。',
        },
        {
          title: '總結與筆電 Wi-Fi 認證測試重點',
          body: '掌握 TRP/TIS 天線輻射指標、SAR 法規限制與吞吐量 Chamber 測試準則。',
          notes: '最後回顧筆電 Wi-Fi 設計的核心：良好的平台雜訊隔離與高效率天線，才是發揮 Wi-Fi 7 全部潛力的基礎。感謝您的聆聽。',
        },
      ],
    },
    bluetooth: {
      title: 'PC/筆電藍牙技術與 Wi-Fi 共存 (Coexistence) 深度解析',
      rawText: 'PC Bluetooth & LE Audio Training: HCI transport, Classic vs BLE, PTA Coexistence with 2.4GHz Wi-Fi.',
      slides: [
        {
          title: '筆電藍牙技術演進與應用生態',
          body: '從無線滑鼠鍵盤、多裝置無縫切換到低功耗高音質 LE Audio 與 Auracast 廣播。',
          notes: '歡迎參加筆電藍牙技術培訓。在現代工作流中，筆電必須同時穩定連接耳機、滑鼠與觸控筆。這十分鐘將深入探討藍牙協定棧、LE Audio 以及最關鍵的 Wi-Fi 2.4GHz 共存機制。',
        },
        {
          title: 'Windows / Linux 藍牙軟硬體架構',
          body: '解析 OS Bluetooth Stack、HCI (USB/UART) 介面、Controller 與共用 RF 天線。',
          notes: '在筆電架構中，作業系統透過 USB 或高速 UART 介面與 M.2 模組內的藍牙控制器進行 HCI 指令溝通，並最終與 Wi-Fi 2.4GHz 共享同一組 RF 前端與天線。',
        },
        {
          title: 'GFSK 調變與 2.4GHz 跳頻 (AFH) 機制',
          body: '藍牙如何在 79 個或 40 個頻道間以每秒 1600 次跳頻避開 Wi-Fi 干擾。',
          notes: '為了在擁擠的 2.4GHz 頻段生存，藍牙採用自適應跳頻技術 AFH，主動偵測並避開已被 Wi-Fi 佔用的子頻道，確保音訊封包不中斷。',
        },
        {
          title: 'PTA (Packet Traffic Arbitration) 共存時序',
          body: '當藍牙語音與 Wi-Fi 封包同時觸發時，硬體仲裁訊號如何毫秒級協調收發權。',
          notes: '由於藍牙與 Wi-Fi 常共用天線，若同時發射會導致前端燒毀或互相淹沒。硬體 PTA 介面會在微秒級內仲裁優先權，優先保護即時性高的藍牙語音封包。',
        },
        {
          title: 'Bluetooth Classic 與 BLE / LE Audio 對照',
          body: '比較傳統 BR/EDR 與新一代 LC3 編碼在音質、延遲與電池續航的顯著差異。',
          notes: 'LE Audio 引入全新的 LC3 編碼器，能在更低的位元率下提供優於傳統 SBC 的音質，同時大幅降低筆電與耳機端的功耗。',
        },
        {
          title: '藍牙斷線與音訊卡頓除錯 SOP',
          body: '利用 HCI Snoop Log、USB 休眠電源管理檢查與 2.4GHz 頻譜干擾定位問題。',
          notes: '遇到藍牙滑鼠延遲或耳機爆音時，第一時間應擷取 HCI Log 確認是空中封包遺失，還是主機端 USB Selective Suspend 造成的喚醒延遲。',
        },
        {
          title: '課程總結與筆電藍牙驗證準則',
          body: '確保多裝置併發連線穩定性、喚醒延遲與 Wi-Fi/BT 同時吞吐量指標達標。',
          notes: '掌握 HCI 傳輸與 PTA 共存邏輯，就能解決筆電上九成以上的藍牙異常問題。感謝您的參與！',
        },
      ],
    },
    rf: {
      title: '筆電 RF 射頻工程：天線調諧、S 參數與 EMI 去敏化實戰',
      rawText: 'Laptop RF Engineering Training: S11/S21, Smith Chart Antenna Tuning in Metal Chassis, USB3/DDR Desense, SAR.',
      slides: [
        {
          title: '筆電 RF 射頻與天線系統設計挑戰',
          body: '在全金屬機身、極窄邊框與高密度主機板的限制下，維持穩定無線訊號覆蓋。',
          notes: '歡迎來到筆電 RF 射頻工程培訓。輕薄筆電的金屬外殼與窄邊框設計，對射頻工程師而言是極大的物理挑戰。接下來十分鐘，我們將探討天線調諧、S 參數量測與平台 EMI 去敏化。',
        },
        {
          title: '筆電 RF 訊號鏈與機構整合架構',
          body: '從 Transceiver 50 歐姆差分線、FEM、Micro-Coax 轉軸走線到 PIFA/Slot 天線。',
          notes: '每一條射頻訊號都必須經過嚴格的 50 歐姆阻抗控制，穿過螢幕轉軸的極細同軸線進入天線輻射體。轉軸處的彎折半徑與接地品質直接決定了系統損耗。',
        },
        {
          title: 'S11 回波損耗與寬頻頻譜特徵解析',
          body: '判讀 2.4GHz / 5GHz / 6GHz 頻段的阻抗匹配深度與輻射效率曲線。',
          notes: '透過網路分析儀量測 S11 參數，我們要求目標頻段內的回波損耗必須優於負 10 dB，確保絕大部分能量有效輻射出去，而非反射回前端放大器造成發熱。',
        },
        {
          title: 'EMI / RFI 平台去敏化 (Desense) 排查流程',
          body: '定位來自 USB 3.2、DDR5 時脈與 eDP 面板排線的寬頻雜訊耦合路徑。',
          notes: '筆電內部充滿高速數位雜訊源。透過先關閉特定介面再觀察接收機底噪的隔離法，我們能精準抓出是 USB 3.2 連接器還是 eDP 排線干擾了 Wi-Fi 接收靈敏度。',
        },
        {
          title: '良率達標與異常板端 RF 指標對照',
          body: '比較正常板與異常板在 S11、Desense 雜訊抬升與天線隔離度 (>18dB) 的差異。',
          notes: '從對照表可見，當平台出現 8 dB 的 Desense 抬升時，筆電的實際無線傳輸距離將會縮水超過一半。這也是為什麼 EMI 屏蔽罩與導電泡棉接地如此重要。',
        },
        {
          title: 'SAR 法規與人體感測 (Proximity Sensor) 調校',
          body: '確保筆電放置於膝上或平板翻轉模式下，符合 FCC/CE 比吸收率安全規範。',
          notes: '在二合一或輕薄筆電上，當人體靠近天線時，Proximity Sensor 必須準確觸發並依規定降低發射功率，在通過 SAR 法規的同時避免誤觸發影響連網體驗。',
        },
        {
          title: 'RF 量產前驗證總結與檢查表',
          body: '確認 VNA 匹配測試、OTA Chamber TRP/TIS 量測與全機 Desense Scan 全數通過。',
          notes: 'RF 設計是一場與物理極限的平衡藝術。希望這十分鐘的架構與除錯心法，能協助各位在下一代筆電專案中一次過關！',
        },
      ],
    },
  };

  const p = presets[domain];
  return buildPlanFromSource({
    title: p.title,
    domain,
    sourceType: 'research-text',
    rawText: p.rawText,
    slides: p.slides,
    defaultTtsProvider: 'openformosa',
  });
}
