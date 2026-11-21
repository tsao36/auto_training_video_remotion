import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLocalEnv, parseEnvContent } from './loadEnv';

describe('loadLocalEnv', () => {
  it('parses quoted values, export prefixes, and ignores comments', () => {
    const parsed = parseEnvContent(`
      # comment
      GNAI_URL=https://gnai.intel.com/api/providers/openai/v1
      export GNAI_TOKEN="abc-123-token"
      GNAI_MODEL='gpt-5-mini'
    `);
    expect(parsed.GNAI_URL).toBe('https://gnai.intel.com/api/providers/openai/v1');
    expect(parsed.GNAI_TOKEN).toBe('abc-123-token');
    expect(parsed.GNAI_MODEL).toBe('gpt-5-mini');
  });

  it('lets .env.local override .env without overwriting existing shell env', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    try {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'GNAI_TOKEN=from-env\nGNAI_MODEL=gpt-4o\n', 'utf8');
      fs.writeFileSync(path.join(tmpDir, '.env.local'), 'GNAI_TOKEN=from-local\n', 'utf8');

      const target: NodeJS.ProcessEnv = { GNAI_MODEL: 'from-shell' };
      const loaded = loadLocalEnv(tmpDir, target);

      expect(loaded).toEqual(['.env', '.env.local']);
      expect(target.GNAI_TOKEN).toBe('from-local');
      expect(target.GNAI_MODEL).toBe('from-shell');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
