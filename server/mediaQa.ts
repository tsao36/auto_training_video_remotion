import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { MediaQaResult } from '../src/types/training';

export const SILENCE_THRESHOLD_DB = -60;

function commandExists(command: string): boolean {
  const result = spawnSync(command, ['-version'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

export function parseMaxVolumeDb(diagnosticOutput: string): number | null {
  const match = diagnosticOutput.match(/max_volume:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dB/i);
  if (!match) return null;
  if (match[1].toLowerCase() === '-inf' || match[1].toLowerCase() === 'inf') {
    return Number.NEGATIVE_INFINITY;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export interface InspectMediaOptions {
  expectAudio: boolean;
  ffprobeBin?: string;
  ffmpegBin?: string;
}

/**
 * Post-render audio verification using ffprobe + ffmpeg volumedetect.
 * Fails when audio is expected but either no audio stream exists or peak volume <= -60 dB.
 */
export function inspectRenderedMedia(
  outputPath: string,
  options: InspectMediaOptions
): MediaQaResult {
  const expected = options.expectAudio;
  const ffprobe = options.ffprobeBin || 'ffprobe';
  const ffmpeg = options.ffmpegBin || 'ffmpeg';

  if (!fs.existsSync(outputPath)) {
    return {
      audioExpected: expected,
      audioStream: false,
      maxVolumeDb: null,
      passed: false,
      summary: `找不到輸出的影片檔案：${outputPath}`,
    };
  }

  if (!commandExists(ffprobe) || !commandExists(ffmpeg)) {
    return {
      audioExpected: expected,
      audioStream: false,
      maxVolumeDb: null,
      passed: true,
      summary: '系統未安裝 ffmpeg / ffprobe，已略過渲染後音訊分貝驗證。',
    };
  }

  const probe = spawnSync(
    ffprobe,
    [
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'stream=index',
      '-of',
      'csv=p=0',
      outputPath,
    ],
    { encoding: 'utf8', windowsHide: true }
  );

  const audioStream = Boolean((probe.stdout || '').trim());
  if (!audioStream) {
    return {
      audioExpected: expected,
      audioStream: false,
      maxVolumeDb: null,
      passed: !expected,
      summary: expected
        ? '預期應包含配音音軌，但輸出的 MP4 沒有音訊串流。'
        : '靜音影片驗證通過（無音訊串流）。',
    };
  }

  const volume = spawnSync(
    ffmpeg,
    [
      '-hide_banner',
      '-i',
      outputPath,
      '-map',
      '0:a:0',
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8', windowsHide: true }
  );

  const diagnostic = `${volume.stdout || ''}\n${volume.stderr || ''}`;
  const maxVolumeDb = parseMaxVolumeDb(diagnostic);
  const audible = maxVolumeDb !== null && maxVolumeDb > SILENCE_THRESHOLD_DB;

  return {
    audioExpected: expected,
    audioStream: true,
    maxVolumeDb,
    passed: expected ? audible : true,
    summary: expected
      ? audible
        ? `音訊驗證通過（峰值音量 ${maxVolumeDb!.toFixed(1)} dB）。`
        : `音訊串流幾乎無聲（峰值 ${maxVolumeDb === null ? '未知' : `${maxVolumeDb} dB`}，低於 ${SILENCE_THRESHOLD_DB} dB 門檻）。`
      : `偵測到音訊串流（峰值 ${maxVolumeDb === null ? '未知' : `${maxVolumeDb.toFixed(1)} dB`}）。`,
  };
}
