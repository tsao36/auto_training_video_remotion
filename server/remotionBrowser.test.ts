import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRemotionBrowserExecutable } from './remotionBrowser';

describe('resolveRemotionBrowserExecutable', () => {
  it('prefers a valid explicit override', () => {
    expect(resolveRemotionBrowserExecutable({
      override: 'C:\\custom\\chrome.exe',
      env: {},
      exists: (candidate) => candidate === 'C:\\custom\\chrome.exe',
    })).toBe('C:\\custom\\chrome.exe');
  });

  it('rejects an invalid explicit override instead of silently downloading', () => {
    expect(() => resolveRemotionBrowserExecutable({ override: 'missing.exe', exists: () => false }))
      .toThrow(/does not exist/i);
  });

  it('detects Edge before Chrome from standard Windows paths', () => {
    const env = { 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramFiles: 'C:\\Program Files' };
    const edge = path.join(env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe');
    const chrome = path.join(env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe');
    expect(resolveRemotionBrowserExecutable({ env, exists: (candidate) => candidate === edge || candidate === chrome }))
      .toBe(edge);
  });
});
