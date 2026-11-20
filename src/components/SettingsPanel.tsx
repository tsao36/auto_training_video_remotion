import React, { useEffect, useRef, useState } from 'react';
import { Check, Cpu, Loader2, Mic, Pencil, Sliders, Sparkles, Star, Trash2, Upload, X } from 'lucide-react';
import {
  CONTENT_LANGUAGES,
  ContentLanguage,
  DEFAULT_CONTENT_LANGUAGE,
  VoiceProfile,
  VoiceProfileProvider,
} from '../types/training';
import { loadTtsSettings, saveTtsSettings, TtsSettings } from '../utils/ttsSettingsStorage';
import {
  createVoiceProfile,
  deleteVoiceProfile,
  listVoiceProfiles,
  renameVoiceProfile,
  toCustomVoice,
  trainVoiceProfile,
  voiceProfileAudioUrl,
} from '../utils/voiceProfiles';
import { RecordedVoiceSubmission, VoiceRecorderModal } from './VoiceRecorderModal';

const inputCls =
  'w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400';
const labelCls = 'block text-[11px] text-slate-400 mb-1';

const formatCreatedAt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const SettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<TtsSettings>(() => loadTtsSettings());
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [scriptLanguage, setScriptLanguage] = useState<ContentLanguage>(DEFAULT_CONTENT_LANGUAGE);
  const [trainProvider, setTrainProvider] = useState<VoiceProfileProvider>(() => loadTtsSettings().defaultProvider);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [trainingId, setTrainingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [ofHealth, setOfHealth] = useState<{ checking: boolean; ok?: boolean; detail?: string }>({
    checking: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkOpenFormosaHealth = async (baseUrl = settings.openformosa.baseUrl) => {
    setOfHealth({ checking: true });
    try {
      const resp = await fetch(`/api/tts/health?baseUrl=${encodeURIComponent(baseUrl)}`);
      const data = await resp.json();
      if (data.ok) {
        const mode = data.centroid_supported ? '支援語者向量抽取' : '參考音檔克隆模式';
        setOfHealth({ checking: false, ok: true, detail: `已連線 (${data.device || 'cpu'} · ${mode})` });
      } else {
        setOfHealth({ checking: false, ok: false, detail: data.error || '無法連線' });
      }
    } catch {
      setOfHealth({ checking: false, ok: false, detail: '無法檢查連線狀態' });
    }
  };

  useEffect(() => {
    void checkOpenFormosaHealth(settings.openformosa.baseUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSettings = (patch: Partial<TtsSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveTtsSettings(next);
      return next;
    });
  };

  useEffect(() => {
    listVoiceProfiles()
      .then(setProfiles)
      .catch((err) => setMessage({ kind: 'error', text: err instanceof Error ? err.message : '無法載入聲線列表' }))
      .finally(() => setLoading(false));
  }, []);

  const addProfile = async (
    file: File,
    opts?: { name?: string; provider?: VoiceProfileProvider; trainNow?: boolean; referenceText?: string }
  ): Promise<boolean> => {
    setCreating(true);
    setMessage(null);
    const chosenProvider = opts?.provider ?? trainProvider;
    const chosenName = opts?.name ?? newName;
    try {
      let profile = await createVoiceProfile(file, {
        name: chosenName,
        provider: chosenProvider,
        referenceText: opts?.referenceText,
      });
      if (opts?.trainNow !== false) {
        profile = await trainVoiceProfile(profile.id, {
          provider: chosenProvider,
          openformosa: settings.openformosa,
          mingTts: settings.mingTts,
          referenceText: opts?.referenceText,
          language: scriptLanguage,
        });
      }
      setProfiles((prev) => [...prev, profile]);
      setNewName('');
      setMessage({
        kind: 'ok',
        text: profile.trainingNote
          ? `已建立聲線「${profile.name}」：${profile.trainingNote}`
          : `已建立聲線「${profile.name}」`,
      });
      return true;
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : '建立聲線失敗' });
      return false;
    } finally {
      setCreating(false);
    }
  };

  const handleTrainExisting = async (profile: VoiceProfile, provider: VoiceProfileProvider) => {
    setTrainingId(profile.id);
    setMessage(null);
    try {
      const updated = await trainVoiceProfile(profile.id, {
        provider,
        openformosa: settings.openformosa,
        mingTts: settings.mingTts,
        referenceText: profile.referenceText,
        language: scriptLanguage,
      });
      setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (settings.defaultVoice?.profileId === updated.id) {
        updateSettings({ defaultVoice: toCustomVoice(updated) });
      }
      setMessage({
        kind: 'ok',
        text: `聲線「${updated.name}」：${updated.trainingNote || '已完成訓練'}`,
      });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : '訓練聲線失敗' });
    } finally {
      setTrainingId(null);
    }
  };

  const commitRename = async (profile: VoiceProfile) => {
    const name = editingName.trim();
    setEditingId(null);
    if (!name || name === profile.name) return;
    try {
      const updated = await renameVoiceProfile(profile.id, name);
      setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (settings.defaultVoice?.profileId === updated.id) {
        updateSettings({ defaultVoice: toCustomVoice(updated) });
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : '重新命名失敗' });
    }
  };

  const removeProfile = async (profile: VoiceProfile) => {
    if (!window.confirm(`確定要刪除聲線「${profile.name}」嗎？使用此聲線的專案將改用預設語音。`)) return;
    try {
      await deleteVoiceProfile(profile.id);
      setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
      if (settings.defaultVoice?.profileId === profile.id) updateSettings({ defaultVoice: undefined });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : '刪除失敗' });
    }
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="settings-tts" className="space-y-4">
        <div>
          <h2 id="settings-tts" className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" /> TTS 設定
          </h2>
          <p className="mt-1 text-[11px] text-slate-400">
            這些設定會套用到之後新建立的專案；既有專案可在編輯器的「引擎設定」分頁個別調整。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 max-w-sm">
            <label htmlFor="set-provider" className={labelCls}>預設 TTS 語音模型</label>
            <select
              id="set-provider"
              value={settings.defaultProvider}
              onChange={(e) => updateSettings({ defaultProvider: e.target.value as TtsSettings['defaultProvider'] })}
              className={inputCls}
            >
              <option value="openformosa">OpenFormosa</option>
              <option value="ming-3.0">Ming-3.0-TTS</option>
            </select>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                <Sliders className="w-4 h-4" /> OpenFormosa (BlueMagpie-TTS)
              </div>
              <button
                type="button"
                disabled={ofHealth.checking}
                onClick={() => void checkOpenFormosaHealth()}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] text-slate-200 transition disabled:opacity-50"
              >
                {ofHealth.checking ? '檢查中...' : '檢查連線'}
              </button>
            </div>
            {ofHealth.detail && (
              <div className={`text-[10px] ${ofHealth.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
                {ofHealth.detail}
              </div>
            )}
            <div>
              <label htmlFor="set-of-endpoint" className={labelCls}>本地推論伺服器 URL</label>
              <input
                id="set-of-endpoint"
                type="text"
                value={settings.openformosa.baseUrl}
                onChange={(e) => updateSettings({ openformosa: { ...settings.openformosa, baseUrl: e.target.value } })}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="set-of-key" className={labelCls}>API Key（本機儲存）</label>
              <input
                id="set-of-key"
                type="password"
                autoComplete="off"
                value={settings.openformosa.apiKey}
                onChange={(e) => updateSettings({ openformosa: { ...settings.openformosa, apiKey: e.target.value } })}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="set-of-model" className={labelCls}>Model</label>
                <input
                  id="set-of-model"
                  type="text"
                  value={settings.openformosa.model}
                  onChange={(e) => updateSettings({ openformosa: { ...settings.openformosa, model: e.target.value } })}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="set-of-voice" className={labelCls}>預設聲線 ID</label>
                <input
                  id="set-of-voice"
                  type="text"
                  value={settings.openformosa.voice}
                  onChange={(e) => updateSettings({ openformosa: { ...settings.openformosa, voice: e.target.value } })}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
              <Cpu className="w-4 h-4" /> Ming-3.0-TTS
            </div>
            <div>
              <label htmlFor="set-ming-url" className={labelCls}>推論伺服器 URL</label>
              <input
                id="set-ming-url"
                type="text"
                value={settings.mingTts.baseUrl}
                onChange={(e) => updateSettings({ mingTts: { ...settings.mingTts, baseUrl: e.target.value } })}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="set-ming-key" className={labelCls}>API Key（選填，本機儲存）</label>
              <input
                id="set-ming-key"
                type="password"
                autoComplete="off"
                value={settings.mingTts.apiKey}
                onChange={(e) => updateSettings({ mingTts: { ...settings.mingTts, apiKey: e.target.value } })}
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="set-ming-model" className={labelCls}>Model</label>
                <input
                  id="set-ming-model"
                  type="text"
                  value={settings.mingTts.model}
                  onChange={(e) => updateSettings({ mingTts: { ...settings.mingTts, model: e.target.value } })}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="set-ming-speaker" className={labelCls}>Speaker</label>
                <input
                  id="set-ming-speaker"
                  type="text"
                  value={settings.mingTts.speaker}
                  onChange={(e) => updateSettings({ mingTts: { ...settings.mingTts, speaker: e.target.value } })}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="set-ming-style" className={labelCls}>Style</label>
                <input
                  id="set-ming-style"
                  type="text"
                  value={settings.mingTts.style}
                  onChange={(e) => updateSettings({ mingTts: { ...settings.mingTts, style: e.target.value } })}
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="settings-voices" className="space-y-4">
        <div>
          <h2 id="settings-voices" className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Mic className="w-4 h-4 text-cyan-400" /> 自訂聲線管理
          </h2>
          <p className="mt-1 text-[11px] text-slate-400">
            上傳或錄製約 10–15 秒的人聲並選擇 TTS 模型訓練專屬聲線；標為「預設」的聲線會套用到新專案，也可在編輯器中跨專案重複使用。
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-end gap-3">
          <div className="w-52">
            <label htmlFor="new-voice-name" className={labelCls}>聲線名稱</label>
            <input
              id="new-voice-name"
              type="text"
              maxLength={40}
              placeholder="例如：Jonathan 的聲音"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="w-40">
            <label htmlFor="new-voice-lang" className={labelCls}>朗讀稿語言</label>
            <select
              id="new-voice-lang"
              value={scriptLanguage}
              onChange={(e) => setScriptLanguage(e.target.value as ContentLanguage)}
              className={inputCls}
            >
              {CONTENT_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <label htmlFor="new-voice-provider" className={labelCls}>訓練用 TTS 模型</label>
            <select
              id="new-voice-provider"
              value={trainProvider}
              onChange={(e) => setTrainProvider(e.target.value as VoiceProfileProvider)}
              className={inputCls}
            >
              <option value="openformosa">OpenFormosa</option>
              <option value="ming-3.0">Ming-3.0-TTS</option>
            </select>
          </div>
          <button
            type="button"
            disabled={creating}
            onClick={() => {
              setMessage(null);
              setRecorderOpen(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <Mic className="w-3.5 h-3.5" /> 錄製聲線
          </button>
          <button
            type="button"
            disabled={creating}
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            上傳音檔
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,.m4a,.ogg,.webm,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void addProfile(f);
            }}
          />
        </div>

        {message && (
          <div
            role="status"
            className={`text-[11px] ${message.kind === 'error' ? 'text-red-300' : 'text-emerald-300'}`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> 載入聲線中...
          </div>
        ) : profiles.length === 0 ? (
          <div className="py-10 text-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-400">
            尚無自訂聲線。錄製或上傳約 10 秒的人聲即可建立。
          </div>
        ) : (
          <ul className="space-y-2">
            {profiles.map((p) => {
              const isDefault = settings.defaultVoice?.profileId === p.id;
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-slate-800 bg-[#131110]"
                >
                  <div className="min-w-0 flex-1 basis-48">
                    {editingId === p.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          aria-label="聲線名稱"
                          maxLength={40}
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename(p);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className={inputCls}
                        />
                        <button
                          type="button"
                          aria-label="確認名稱"
                          onClick={() => void commitRename(p)}
                          className="p-1.5 rounded text-emerald-300 hover:bg-slate-800"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="取消"
                          onClick={() => setEditingId(null)}
                          className="p-1.5 rounded text-slate-400 hover:bg-slate-800"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-100 truncate" title={p.name}>{p.name}</span>
                        {p.provider && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-200 shrink-0">
                            {p.provider === 'ming-3.0' ? 'Ming-3.0-TTS' : 'OpenFormosa'}
                          </span>
                        )}
                        {p.trainingStatus === 'trained' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 shrink-0">
                            已訓練
                          </span>
                        )}
                        {p.trainingStatus === 'reference-only' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 shrink-0">
                            參考聲線
                          </span>
                        )}
                        {isDefault && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 shrink-0">
                            預設
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {p.durationSec ? `${p.durationSec.toFixed(1)} 秒 · ` : ''}建立於 {formatCreatedAt(p.createdAt)}
                      {p.remoteVoiceId ? ` · ID: ${p.remoteVoiceId}` : ''}
                    </div>
                    {p.trainingNote && (
                      <div className="mt-0.5 text-[10px] text-slate-500 line-clamp-1" title={p.trainingNote}>
                        {p.trainingNote}
                      </div>
                    )}
                  </div>

                  <audio controls preload="none" src={voiceProfileAudioUrl(p.id)} className="h-8 w-56 max-w-full" />

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={trainingId === p.id}
                      onClick={() => void handleTrainExisting(p, trainProvider)}
                      title={`使用 ${trainProvider === 'ming-3.0' ? 'Ming-3.0-TTS' : 'OpenFormosa'} 訓練此聲線`}
                      className="px-2 py-1.5 rounded-md text-[11px] font-semibold flex items-center gap-1 border bg-indigo-500/15 border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/25 transition disabled:opacity-50"
                    >
                      {trainingId === p.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      {p.trainingStatus === 'trained' ? '重訓' : '訓練'}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSettings({ defaultVoice: isDefault ? undefined : toCustomVoice(p) })}
                      aria-pressed={isDefault}
                      title={isDefault ? '取消預設' : '設為新專案預設聲線'}
                      className={`px-2 py-1.5 rounded-md text-[11px] font-semibold flex items-center gap-1 border transition ${
                        isDefault
                          ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      <Star className="w-3 h-3" /> {isDefault ? '預設中' : '設為預設'}
                    </button>
                    <button
                      type="button"
                      aria-label={`重新命名 ${p.name}`}
                      onClick={() => {
                        setEditingId(p.id);
                        setEditingName(p.name);
                      }}
                      className="p-2 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`刪除聲線 ${p.name}`}
                      onClick={() => void removeProfile(p)}
                      className="p-2 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {recorderOpen && (
        <VoiceRecorderModal
          language={scriptLanguage}
          initialName={newName}
          initialProvider={trainProvider}
          uploading={creating}
          serverError={message?.kind === 'error' ? message.text : null}
          onClose={() => setRecorderOpen(false)}
          onUseRecording={async (sub: RecordedVoiceSubmission) => {
            if (
              await addProfile(sub.file, {
                name: sub.name,
                provider: sub.provider,
                trainNow: sub.trainNow,
                referenceText: sub.referenceText,
              })
            ) {
              setRecorderOpen(false);
            }
          }}
          onPickFile={() => {
            setRecorderOpen(false);
            fileInputRef.current?.click();
          }}
        />
      )}
    </div>
  );
};
