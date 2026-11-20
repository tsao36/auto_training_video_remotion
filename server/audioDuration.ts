/**
 * Lightweight, zero-dependency audio duration parser for MP3 and WAV buffers.
 * Ensures TTS scene durations match actual synthesized audio so scripts never get cut off.
 */

const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000],  // MPEG 2.5
};

const BITRATES_V1_L1 = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448];
const BITRATES_V1_L2 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384];
const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L1 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256];
const BITRATES_V2_L23 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

function getBitrateKbps(ver: number, layer: number, brIdx: number): number {
  if (brIdx <= 0 || brIdx >= 15) return 0;
  if (ver === 3) {
    if (layer === 3) return BITRATES_V1_L1[brIdx];
    if (layer === 2) return BITRATES_V1_L2[brIdx];
    if (layer === 1) return BITRATES_V1_L3[brIdx];
  } else {
    if (layer === 3) return BITRATES_V2_L1[brIdx];
    if (layer === 2 || layer === 1) return BITRATES_V2_L23[brIdx];
  }
  return 0;
}

export function getMp3DurationSec(buf: Buffer): number | null {
  if (buf.length < 10) return null;

  let offset = 0;
  // Skip ID3v2 header if present
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f);
    offset = 10 + size;
  }

  let end = buf.length;
  if (
    end >= 128 &&
    buf[end - 128] === 0x54 &&
    buf[end - 127] === 0x41 &&
    buf[end - 126] === 0x47
  ) {
    end -= 128;
  }

  let totalSec = 0;
  let frameCount = 0;

  while (offset + 4 <= end) {
    if (buf[offset] !== 0xff || (buf[offset + 1] & 0xe0) !== 0xe0) {
      offset++;
      continue;
    }

    const b1 = buf[offset + 1];
    const b2 = buf[offset + 2];

    const ver = (b1 >> 3) & 0x03;
    const layer = (b1 >> 1) & 0x03;
    const brIdx = (b2 >> 4) & 0x0f;
    const srIdx = (b2 >> 2) & 0x03;
    const pad = (b2 >> 1) & 0x01;

    if (ver === 1 || layer === 0 || brIdx === 0 || brIdx === 15 || srIdx === 3) {
      offset++;
      continue;
    }

    const sampleRates = SAMPLE_RATES[ver];
    const bitrateKbps = getBitrateKbps(ver, layer, brIdx);
    if (!sampleRates || !bitrateKbps) {
      offset++;
      continue;
    }

    const sampleRate = sampleRates[srIdx];
    const bitrate = bitrateKbps * 1000;
    const samplesPerFrame = layer === 3 ? 384 : layer === 2 ? 1152 : ver === 3 ? 1152 : 576;

    const frameSize =
      layer === 3
        ? Math.floor(((12 * bitrate) / sampleRate + pad) * 4)
        : Math.floor(((samplesPerFrame / 8) * bitrate) / sampleRate) + pad;

    if (frameSize < 4 || offset + frameSize > end) {
      break;
    }

    totalSec += samplesPerFrame / sampleRate;
    frameCount++;
    offset += frameSize;
  }

  if (frameCount === 0) return null;
  return Number(totalSec.toFixed(2));
}

export function getWavDurationSec(buf: Buffer): number | null {
  if (buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }

  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ' && offset + 20 <= buf.length) {
      byteRate = buf.readUInt32LE(offset + 16);
    } else if (chunkId === 'data') {
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (byteRate <= 0 || dataSize <= 0) return null;
  return Number((dataSize / byteRate).toFixed(2));
}

export function getAudioDurationSec(buf: Buffer, extOrMime: string): number | null {
  const lower = extOrMime.toLowerCase();
  if (lower.includes('wav')) {
    return getWavDurationSec(buf);
  }
  if (lower.includes('mp3') || lower.includes('mpeg')) {
    return getMp3DurationSec(buf);
  }
  return getWavDurationSec(buf) ?? getMp3DurationSec(buf);
}
