import {
  ContentLanguage,
  TrainingProject,
  TtsEngineConfig,
  VoiceProfile,
  VoiceProfileProvider,
} from '../types/training';

async function parseOrThrow<T>(resp: Response, fallbackMsg: string): Promise<T> {
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((data as { error?: string }).error || fallbackMsg);
  return data as T;
}

export async function listVoiceProfiles(): Promise<VoiceProfile[]> {
  const resp = await fetch('/api/voice-profiles');
  return (await parseOrThrow<{ profiles: VoiceProfile[] }>(resp, '無法載入聲線列表')).profiles;
}

export async function createVoiceProfile(
  file: File,
  opts?: string | { name?: string; provider?: VoiceProfileProvider; referenceText?: string }
): Promise<VoiceProfile> {
  const options = typeof opts === 'string' ? { name: opts } : opts || {};
  const form = new FormData();
  // Recorder files have a generated filename, so give them a readable default name.
  const label =
    options.name?.trim() ||
    (file.name.startsWith('my-voice-')
      ? `錄音 ${new Date().toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
      : '');
  if (label) form.append('name', label);
  if (options.provider) form.append('provider', options.provider);
  if (options.referenceText?.trim()) form.append('referenceText', options.referenceText.trim());
  form.append('file', file);
  const resp = await fetch('/api/voice-profiles', { method: 'POST', body: form });
  return (await parseOrThrow<{ profile: VoiceProfile }>(resp, '上傳失敗')).profile;
}

export async function trainVoiceProfile(
  id: string,
  params: {
    provider: VoiceProfileProvider;
    openformosa?: TtsEngineConfig['openformosa'];
    mingTts?: TtsEngineConfig['mingTts'];
    referenceText?: string;
    language?: ContentLanguage;
  }
): Promise<VoiceProfile> {
  const resp = await fetch(`/api/voice-profiles/${id}/train`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return (await parseOrThrow<{ profile: VoiceProfile }>(resp, '訓練聲線失敗')).profile;
}

export async function renameVoiceProfile(id: string, name: string): Promise<VoiceProfile> {
  const resp = await fetch(`/api/voice-profiles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return (await parseOrThrow<{ profile: VoiceProfile }>(resp, '重新命名失敗')).profile;
}

export async function deleteVoiceProfile(id: string): Promise<void> {
  const resp = await fetch(`/api/voice-profiles/${id}`, { method: 'DELETE' });
  await parseOrThrow(resp, '刪除失敗');
}

export function voiceProfileAudioUrl(id: string): string {
  return `/api/voice-profiles/${id}/audio`;
}

export function toCustomVoice(p: VoiceProfile): NonNullable<TrainingProject['ttsConfig']['customVoice']> {
  return {
    profileId: p.id,
    fileName: p.fileName,
    name: p.name,
    durationSec: p.durationSec,
    provider: p.provider,
    remoteVoiceId: p.remoteVoiceId,
  };
}
