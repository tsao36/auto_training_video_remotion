import { describe, expect, it } from 'vitest';
import { getAudioDurationSec, getMp3DurationSec, getWavDurationSec } from './audioDuration';

function buildWavBuffer(durationSec: number, sampleRate = 16000, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const dataSize = Math.round(durationSec * byteRate);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, Buffer.alloc(dataSize)]);
}

function buildMp3Frames(frameCount: number, includeId3 = false): Buffer {
  // MPEG1 Layer III, 128 kbps (brIdx=9), 44100 Hz (srIdx=0), no padding => frameSize = floor(144 * 128000 / 44100) = 417
  const frameSize = 417;
  const frame = Buffer.alloc(frameSize);
  frame[0] = 0xff;
  frame[1] = 0xfb; // sync + MPEG1 (3) + Layer III (1) + no CRC
  frame[2] = 0x90; // 128 kbps (9 << 4) + 44100 Hz (0 << 2) + pad=0
  frame[3] = 0x00;

  const chunks: Buffer[] = [];
  if (includeId3) {
    const id3 = Buffer.alloc(14);
    id3.write('ID3', 0, 'ascii');
    id3[9] = 4; // 4-byte syncsafe tag payload
    chunks.push(id3);
  }
  for (let i = 0; i < frameCount; i++) {
    chunks.push(frame);
  }
  return Buffer.concat(chunks);
}

describe('audioDuration', () => {
  it('measures exact WAV duration from RIFF header and data chunk', () => {
    const wav = buildWavBuffer(3.5);
    expect(getWavDurationSec(wav)).toBe(3.5);
    expect(getAudioDurationSec(wav, 'audio/wav')).toBe(3.5);
  });

  it('returns null for truncated or non-WAV buffers', () => {
    expect(getWavDurationSec(Buffer.alloc(20))).toBeNull();
    expect(getWavDurationSec(Buffer.from('NOT_A_WAV_HEADER_000000000000000000000000000000'))).toBeNull();
  });

  it('measures MP3 frame duration with and without ID3v2 header', () => {
    // 100 frames * 1152 / 44100 = 2.6122s -> 2.61
    const plainMp3 = buildMp3Frames(100, false);
    const taggedMp3 = buildMp3Frames(100, true);
    expect(getMp3DurationSec(plainMp3)).toBe(2.61);
    expect(getMp3DurationSec(taggedMp3)).toBe(2.61);
    expect(getAudioDurationSec(taggedMp3, '.mp3')).toBe(2.61);
  });

  it('auto-detects format when extension or mime is unknown', () => {
    const wav = buildWavBuffer(2);
    const mp3 = buildMp3Frames(50);
    expect(getAudioDurationSec(wav, 'application/octet-stream')).toBe(2);
    expect(getAudioDurationSec(mp3, 'unknown')).toBe(1.31);
    expect(getAudioDurationSec(Buffer.from('garbage'), 'unknown')).toBeNull();
  });
});
