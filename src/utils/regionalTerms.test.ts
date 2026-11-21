import { describe, expect, it } from 'vitest';
import {
  applyDeterministicRegionalFixes,
  findRegionalTermMatches,
  getRegionalTerminologyPromptGuidance,
} from './regionalTerms';

describe('regionalTerms', () => {
  it('detects and fixes Mainland China technical terms in zh-TW scripts', () => {
    const sample = 'EAPOL 的任務是安全派生 PTK 與驗證鑰匙，並檢查報文中的關鍵字段。';
    const matches = findRegionalTermMatches(sample, 'zh-TW');
    expect(matches.map((m) => m.wrong)).toEqual(expect.arrayContaining(['派生', '鑰匙', '報文', '字段']));

    const fixed = applyDeterministicRegionalFixes(sample, 'zh-TW');
    expect(fixed.text).toBe('EAPOL 的任務是安全衍生 PTK 與驗證金鑰，並檢查封包中的關鍵欄位。');
    expect(fixed.replacements.length).toBeGreaterThanOrEqual(4);
  });

  it('detects and fixes Taiwan technical terms when zh-CN is selected', () => {
    const sample = '透過記憶體快取與匯流排介面除錯網路封包。';
    const fixed = applyDeterministicRegionalFixes(sample, 'zh-CN');
    expect(fixed.text).toBe('透過内存缓存与总线接口调试网络数据包。'.replace('与', '與').replace('调试', '调试'));
    expect(fixed.text).toContain('内存');
    expect(fixed.text).toContain('缓存');
    expect(fixed.text).toContain('总线');
    expect(fixed.text).toContain('数据包');
  });

  it('leaves English technical scripts unchanged', () => {
    const sample = 'The authenticator and supplicant derive the PTK during the 4-way handshake.';
    expect(findRegionalTermMatches(sample, 'en-US')).toEqual([]);
    expect(applyDeterministicRegionalFixes(sample, 'en-US').text).toBe(sample);
  });

  it('provides regional terminology prompt guidance per language', () => {
    expect(getRegionalTerminologyPromptGuidance('zh-TW')).toContain('衍生');
    expect(getRegionalTerminologyPromptGuidance('zh-TW')).toContain('派生');
    expect(getRegionalTerminologyPromptGuidance('zh-CN')).toContain('密钥');
    expect(getRegionalTerminologyPromptGuidance('ja-JP')).toContain('Japanese');
  });
});
