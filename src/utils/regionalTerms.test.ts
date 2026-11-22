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

  it('replaces Mainland China multimedia terminology in zh-TW scripts', () => {
    const sample = '請選擇高清解析度進行影片播放。';
    expect(findRegionalTermMatches(sample, 'zh-TW').map((m) => m.wrong)).toContain('高清');

    const fixed = applyDeterministicRegionalFixes(sample, 'zh-TW');
    expect(fixed.text).toBe('請選擇高畫質解析度進行影片播放。');
  });

  it('fixes additional zh-TW system and multimedia terminology', () => {
    const sample = '函數透過陣列與佇列處理變數，使用者可在檔案中儲存即時影像並查看效能。';
    const fixed = applyDeterministicRegionalFixes(sample, 'zh-TW');

    expect(fixed.text).toBe('函式透過陣列與佇列處理變數，使用者可在檔案中儲存即時影像並查看效能。');
  });

  it('does not globally replace ambiguous traditional Chinese terms', () => {
    const sample = '校驗序列與鏈路診斷是必要的，並保留比特流。';
    expect(applyDeterministicRegionalFixes(sample, 'zh-TW').text).toBe(sample);
  });

  it('detects and fixes Taiwan technical terms when zh-CN is selected', () => {
    const sample = '透過記憶體快取與匯流排介面除錯網路封包。';
    const fixed = applyDeterministicRegionalFixes(sample, 'zh-CN');
    expect(fixed.text).toBe('透過内存缓存与总线接口调试网络数据包。'.replace('与', '與').replace('调试', '调试'));
    expect(fixed.text).toContain('内存');
    expect(fixed.text).toContain('缓存');
    expect(fixed.text).toContain('总线');
    expect(fixed.text).toContain('数据包');

    const reciprocal = applyDeterministicRegionalFixes(
      '函式透過陣列與佇列處理變數，使用者可查看高畫質影像檔案並評估效能。',
      'zh-CN'
    ).text;
    expect(reciprocal).toContain('函数');
    expect(reciprocal).toContain('数组');
    expect(reciprocal).toContain('队列');
    expect(reciprocal).toContain('变量');
    expect(reciprocal).toContain('用户');
    expect(reciprocal).toContain('高清');
    expect(reciprocal).toContain('图像');
    expect(reciprocal).toContain('文件');
    expect(reciprocal).toContain('性能');
  });

  it('leaves English technical scripts unchanged', () => {
    const sample = 'The authenticator and supplicant derive the PTK during the 4-way handshake.';
    expect(findRegionalTermMatches(sample, 'en-US')).toEqual([]);
    expect(applyDeterministicRegionalFixes(sample, 'en-US').text).toBe(sample);
  });

  it('allows natural Taiwan English technical terminology', () => {
    const sample = '請透過 API、SDK 與 firmware 抓取 packet，並用 debug 與 latency 量測 cache 效能。';
    expect(applyDeterministicRegionalFixes(sample, 'zh-TW').text).toBe(sample);

    const guidance = getRegionalTerminologyPromptGuidance('zh-TW');
    expect(guidance).toContain('API');
    expect(guidance).toContain('English');
  });

  it('provides regional terminology prompt guidance per language', () => {
    expect(getRegionalTerminologyPromptGuidance('zh-TW')).toContain('衍生');
    expect(getRegionalTerminologyPromptGuidance('zh-TW')).toContain('派生');
    expect(getRegionalTerminologyPromptGuidance('zh-CN')).toContain('密钥');
    expect(getRegionalTerminologyPromptGuidance('ja-JP')).toContain('Japanese');
  });
});
