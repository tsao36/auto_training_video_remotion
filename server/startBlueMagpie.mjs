import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const HOST = process.env.BLUEMAGPIE_HOST || '127.0.0.1';
const PORT = Number(process.env.BLUEMAGPIE_PORT || 8001);
const SERVER_SCRIPT = path.join(ROOT_DIR, 'server', 'bluemagpie_server.py');

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: HOST, port: PORT, path: '/health', timeout: 1500 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function findPythonExecutable() {
  const candidates = [
    process.env.BLUEMAGPIE_PYTHON,
    path.join(ROOT_DIR, '.venv312', 'Scripts', 'python.exe'),
    path.join(ROOT_DIR, '.venv312', 'bin', 'python'),
    path.join(ROOT_DIR, '..', 'bluemagpie_project', '.venv312', 'Scripts', 'python.exe'),
    path.join(ROOT_DIR, '..', 'bluemagpie_project', '.venv312', 'bin', 'python'),
    'C:\\whisper_ov\\.venv312\\Scripts\\python.exe',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function main() {
  if (await checkHealth()) {
    console.log(`[BlueMagpie] Already running on http://${HOST}:${PORT}`);
    return;
  }

  const pythonExe = findPythonExecutable();
  if (!pythonExe) {
    console.warn(
      '[BlueMagpie] Python 3.12 virtualenv (.venv312) not found. Run start-bluemagpie.bat once to install dependencies.',
    );
    return;
  }

  console.log(`[BlueMagpie] Starting local TTS server on http://${HOST}:${PORT} ...`);

  const child = spawn(
    pythonExe,
    [SERVER_SCRIPT, '--host', HOST, '--port', String(PORT)],
    {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        NO_PROXY: '127.0.0.1,localhost',
        no_proxy: '127.0.0.1,localhost',
        PYTHONUNBUFFERED: '1',
      },
    },
  );

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('error', (err) => {
    console.error(`[BlueMagpie] Failed to launch: ${err.message}`);
  });

  child.on('exit', (code, signal) => {
    if (code && code !== 0 && !signal) {
      console.warn(
        `[BlueMagpie] Server exited with code ${code}. Run start-bluemagpie.bat to inspect or install dependencies.`,
      );
    }
  });
}

main();
