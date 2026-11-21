import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface ResolveRevealTargetInput {
  kind: 'output' | 'project';
  outputUrl?: string;
  projectId?: string;
  outputDir: string;
  projectsDir: string;
}

export interface ResolveRevealTargetResult {
  filePath: string;
  fileName: string;
}

export function resolveRevealTarget(input: ResolveRevealTargetInput): ResolveRevealTargetResult {
  if (input.kind === 'output') {
    const rawUrl = String(input.outputUrl || '').trim();
    if (!rawUrl) {
      throw new Error('缺少影片路徑');
    }
    const withoutQuery = rawUrl.split(/[?#]/)[0] || '';
    const stripped = withoutQuery.replace(/^\/?output\/+/i, '');
    if (!stripped) {
      throw new Error('無效的影片路徑');
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(stripped);
    } catch {
      throw new Error('影片路徑編碼無效');
    }
    const baseDir = path.resolve(input.outputDir);
    const resolved = path.resolve(baseDir, decoded);
    const relative = path.relative(baseDir, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('不允許存取輸出目錄以外的檔案');
    }
    return {
      filePath: resolved,
      fileName: path.basename(resolved),
    };
  }

  if (input.kind === 'project') {
    const safeId = String(input.projectId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeId) {
      throw new Error('無效的專案 ID');
    }
    const baseDir = path.resolve(input.projectsDir);
    const resolved = path.resolve(baseDir, `${safeId}.json`);
    const relative = path.relative(baseDir, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('不允許存取專案目錄以外的檔案');
    }
    return {
      filePath: resolved,
      fileName: path.basename(resolved),
    };
  }

  throw new Error('不支援的檔案類型');
}

export function revealInFileExplorer(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error('找不到實際檔案，可能已被移動或刪除');
  }

  if (process.platform === 'win32') {
    const child = spawn('explorer.exe', [`/select,"${filePath}"`], {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true,
    });
    child.unref();
    return;
  }

  if (process.platform === 'darwin') {
    const child = spawn('open', ['-R', filePath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return;
  }

  const child = spawn('xdg-open', [path.dirname(filePath)], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}
