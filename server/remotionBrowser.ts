import path from 'node:path';
import fs from 'node:fs';

export function resolveRemotionBrowserExecutable(params: {
  override?: string;
  env?: NodeJS.ProcessEnv;
  exists?: (filePath: string) => boolean;
} = {}): string | undefined {
  const env = params.env || process.env;
  const exists = params.exists || fs.existsSync;
  const override = params.override?.trim();
  if (override) {
    if (!exists(override)) throw new Error(`REMOTION_BROWSER_EXECUTABLE does not exist: ${override}`);
    return override;
  }
  const candidates = [
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)']!, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find(exists);
}
