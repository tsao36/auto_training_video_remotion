import fs from 'node:fs';
import path from 'node:path';

export function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const line = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;

    const key = line.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    } else {
      const commentIdx = value.indexOf(' #');
      if (commentIdx >= 0) {
        value = value.slice(0, commentIdx).trim();
      }
    }

    result[key] = value;
  }

  return result;
}

/**
 * Loads `.env` and `.env.local` from `rootDir` into `process.env`.
 * `.env.local` overrides `.env`, while already-set non-empty shell environment variables win.
 */
export function loadLocalEnv(rootDir: string, targetEnv: NodeJS.ProcessEnv = process.env): string[] {
  const loadedFiles: string[] = [];
  const merged: Record<string, string> = {};

  for (const fileName of ['.env', '.env.local']) {
    const fullPath = path.join(rootDir, fileName);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const parsed = parseEnvContent(fs.readFileSync(fullPath, 'utf8'));
      Object.assign(merged, parsed);
      loadedFiles.push(fileName);
    } catch {
      // Ignore unreadable env files
    }
  }

  for (const [key, value] of Object.entries(merged)) {
    if (!targetEnv[key] || targetEnv[key]?.trim() === '') {
      targetEnv[key] = value;
    }
  }

  return loadedFiles;
}
