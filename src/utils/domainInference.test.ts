import { describe, expect, it } from 'vitest';
import { inferDomainFromText, isTechDomain } from './domainInference';

describe('inferDomainFromText', () => {
  it('classifies a Wi-Fi protocol topic as wifi', () => {
    expect(inferDomainFromText('WiFi 連線protocol').domain).toBe('wifi');
  });

  it('classifies bluetooth and rf topics', () => {
    expect(inferDomainFromText('BLE HCI UART coexistence').domain).toBe('bluetooth');
    expect(inferDomainFromText('筆電天線 S11 與 SAR 量測').domain).toBe('rf');
  });

  it('falls back to debug-logic when the topic is ambiguous', () => {
    const result = inferDomainFromText('新員工入門課程');
    expect(result.domain).toBe('debug-logic');
    expect(result.scores['debug-logic']).toBe(0);
  });

  it('recognizes explicit domain ids', () => {
    expect(isTechDomain('wifi')).toBe(true);
    expect(isTechDomain('auto')).toBe(false);
  });
});