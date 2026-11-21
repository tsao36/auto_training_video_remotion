import { TechDomain } from '../types/training';

export type DomainChoice = TechDomain | 'auto';

const DOMAIN_KEYWORDS: Record<TechDomain, string[]> = {
  wifi: [
    'wifi',
    'wi-fi',
    'wlan',
    '802.11',
    'ofdma',
    'mlo',
    'cnvi',
    '6e',
    'wifi 7',
    'wi-fi 7',
    '無線',
    '連線協議',
    '連線protocol',
  ],
  bluetooth: [
    'bluetooth',
    '藍牙',
    'ble',
    'le audio',
    'hci',
    'classic bt',
    '共存',
  ],
  rf: [
    'radio frequency',
    '射頻',
    '天線',
    'antenna',
    's11',
    's21',
    'sar',
    'desense',
    '去敏',
    'emi',
  ],
  'debug-logic': [
    'debug',
    '除錯',
    '排查',
    'pcie',
    'bios',
    'post',
    'power rail',
    'i2c',
    'spi',
    'ec/',
    'bring-up',
    'bring up',
  ],
};

export function isTechDomain(value: unknown): value is TechDomain {
  return value === 'debug-logic' || value === 'wifi' || value === 'bluetooth' || value === 'rf';
}

export function inferDomainFromText(text: string): {
  domain: TechDomain;
  reason: string;
  scores: Record<TechDomain, number>;
} {
  const haystack = text.toLowerCase();
  const scores: Record<TechDomain, number> = {
    wifi: 0,
    bluetooth: 0,
    rf: 0,
    'debug-logic': 0,
  };

  (Object.keys(DOMAIN_KEYWORDS) as TechDomain[]).forEach((domain) => {
    for (const keyword of DOMAIN_KEYWORDS[domain]) {
      if (haystack.includes(keyword.toLowerCase())) {
        scores[domain] += keyword.length >= 6 ? 3 : 2;
      }
    }
  });

  const ranked = (Object.keys(scores) as TechDomain[]).sort((a, b) => scores[b] - scores[a]);
  const best = ranked[0];
  if (scores[best] === 0) {
    return {
      domain: 'debug-logic',
      reason: '主題沒有明確領域關鍵字，使用 Debug Logic 作為預設視覺風格',
      scores,
    };
  }

  return {
    domain: best,
    reason: `依主題關鍵字判斷為 ${best}`,
    scores,
  };
}
