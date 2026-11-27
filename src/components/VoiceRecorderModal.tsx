import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, RefreshCw, Sparkles, Square, Upload, X } from 'lucide-react';
import { ContentLanguage, VoiceProfileProvider } from '../types/training';
import { useDialogFocus } from '../hooks/useDialogFocus';

const MAX_RECORD_SECONDS = 15;
const MIN_RECORD_SECONDS = 3;

// Each script is ~15s at a natural pace and mixes tones/vowels/consonants and a number for TTS cloning.
export const READING_SCRIPTS: Record<ContentLanguage, string> = {
  'zh-TW':
    '今天天氣很好，我想跟大家分享一個小故事。清晨六點，陽光穿過窗簾，咖啡的香氣慢慢散開。無論遇到什麼挑戰，只要保持耐心，一步一步來，總能找到解決的辦法。',
  'zh-CN':
    '今天天气很好，我想跟大家分享一个小故事。清晨六点，阳光穿过窗帘，咖啡的香气慢慢散开。无论遇到什么挑战，只要保持耐心，一步一步来，总能找到解决的办法。',
  'en-US':
    'The quick brown fox jumps over the lazy dog near the old stone bridge. At six in the morning, the sun rises slowly and the city begins to wake up. Whatever challenge you face, stay patient, take it one step at a time, and you will find a way through.',
  'ja-JP':
    '今日はとても良い天気ですね。朝六時、窓から差し込む光とコーヒーの香りで一日が始まります。どんな困難があっても、焦らずに一歩ずつ進めば、きっと解決の道が見つかります。',
  'ko-KR':
    '오늘은 날씨가 정말 좋네요. 아침 여섯 시, 창문으로 햇살이 들어오고 커피 향이 천천히 퍼집니다. 어떤 어려움이 있어도 차분하게 한 걸음씩 나아가면 반드시 해결책을 찾을 수 있습니다.',
};

export interface RecordedVoiceSubmission {
  file: File;
  name: string;
  provider: VoiceProfileProvider;
  trainNow: boolean;
  referenceText: string;
}

interface VoiceRecorderModalProps {
  language: ContentLanguage;
  initialName?: string;
  initialProvider?: VoiceProfileProvider;
  uploading: boolean;
  serverError?: string | null;
  onClose: () => void;
  onUseRecording: (submission: RecordedVoiceSubmission) => Promise<void> | void;
  onPickFile: () => void;
}

type Phase = 'idle' | 'recording' | 'recorded';

export const VoiceRecorderModal: React.FC<VoiceRecorderModalProps> = ({
  language,
  initialName = '',
  initialProvider = 'openformosa',
  uploading,
  serverError,
  onClose,
  onUseRecording,
  onPickFile,
}) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<{ file: File; url: string } | null>(null);
  const [profileName, setProfileName] = useState(initialName);
  const [provider, setProvider] = useState<VoiceProfileProvider>(initialProvider);
  const [trainNow, setTrainNow] = useState(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  const dialogRef = useDialogFocus(true, onClose);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.onstop = null;
        rec.stop();
      }
      stopStream();
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('此瀏覽器不支援錄音，請改用上傳檔案');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stopStream();
        const mime = recorder.mimeType || 'audio/webm';
        const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(chunks, { type: mime });
        if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
        const url = URL.createObjectURL(blob);
        recordingUrlRef.current = url;
        setRecording({ file: new File([blob], `my-voice-${Date.now()}.${ext}`, { type: mime }), url });
        setPhase('recorded');
      };
      recorderRef.current = recorder;
      recorder.start();
      setElapsed(0);
      setPhase('recording');
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        const sec = (Date.now() - startedAt) / 1000;
        setElapsed(Math.min(sec, MAX_RECORD_SECONDS));
        if (sec >= MAX_RECORD_SECONDS) stopRecording();
      }, 100);
    } catch {
      stopStream();
      setError('無法使用麥克風，請確認瀏覽器已允許麥克風權限');
    }
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  };

  const retake = () => {
    setRecording(null);
    setElapsed(0);
    setPhase('idle');
  };

  const tooShort = phase === 'recorded' && elapsed < MIN_RECORD_SECONDS;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-recorder-title"
    >
      <div ref={dialogRef} tabIndex={-1} className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 id="voice-recorder-title" className="text-sm font-bold text-white flex items-center gap-2">
            <Mic className="w-4 h-4 text-cyan-400" /> 錄製自訂聲線
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-slate-400 mb-2">
          請在安靜環境，以自然語速朗讀下列文字（最長 {MAX_RECORD_SECONDS} 秒，至少 {MIN_RECORD_SECONDS} 秒）：
        </p>
        <div className="rounded-lg border border-cyan-500/30 bg-slate-950 px-4 py-3 text-base leading-relaxed text-slate-100 select-text">
          {READING_SCRIPTS[language]}
        </div>

        <div className="mt-4">
          <div
            className="h-1.5 rounded-full bg-slate-800 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={MAX_RECORD_SECONDS}
            aria-valuenow={Math.round(elapsed)}
          >
            <div
              className={`h-full transition-[width] duration-100 ${phase === 'recording' ? 'bg-red-400' : 'bg-cyan-400'}`}
              style={{ width: `${(elapsed / MAX_RECORD_SECONDS) * 100}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
            {elapsed.toFixed(1)} / {MAX_RECORD_SECONDS}s
            {phase === 'recording' && <span className="ml-2 text-red-300">錄音中…</span>}
          </div>
        </div>

        {recording && phase === 'recorded' && (
          <>
            <audio controls src={recording.url} className="mt-3 w-full h-9" />
            <div className="mt-3 p-3 rounded-lg bg-slate-950/90 border border-slate-800 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="rec-voice-name" className="block text-[11px] text-slate-400 mb-1">
                    聲線名稱（供跨專案重複使用）
                  </label>
                  <input
                    id="rec-voice-name"
                    type="text"
                    maxLength={40}
                    placeholder="例如：Jonathan 教學聲線"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label htmlFor="rec-tts-model" className="block text-[11px] text-slate-400 mb-1">
                    訓練用 TTS 模型
                  </label>
                  <select
                    id="rec-tts-model"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as VoiceProfileProvider)}
                    className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="openformosa">OpenFormosa</option>
                    <option value="ming-3.0">Ming-3.0-TTS</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={trainNow}
                  onChange={(e) => setTrainNow(e.target.checked)}
                  className="accent-cyan-400 rounded"
                />
                立即使用所選 TTS 模型訓練並建立專屬聲線檔案
              </label>
            </div>
          </>
        )}
        {tooShort && (
          <p className="mt-2 text-[11px] text-amber-300">錄音少於 {MIN_RECORD_SECONDS} 秒，請重錄。</p>
        )}
        {(error || serverError) && <p className="mt-2 text-[11px] text-red-300">{error || serverError}</p>}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onPickFile}
            className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
          >
            <Upload className="w-3 h-3" /> 改為上傳檔案
          </button>
          <div className="flex gap-2">
            {phase === 'idle' && (
              <button
                type="button"
                onClick={() => void startRecording()}
                className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Mic className="w-3.5 h-3.5" /> 開始錄音
              </button>
            )}
            {phase === 'recording' && (
              <button
                type="button"
                onClick={stopRecording}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5" /> 停止
              </button>
            )}
            {phase === 'recorded' && (
              <>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={retake}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> 重錄
                </button>
                <button
                  type="button"
                  disabled={tooShort || uploading}
                  onClick={() =>
                    recording &&
                    void onUseRecording({
                      file: recording.file,
                      name: profileName.trim(),
                      provider,
                      trainNow,
                      referenceText: READING_SCRIPTS[language],
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {trainNow ? '訓練聲線中...' : '建立中...'}
                    </>
                  ) : trainNow ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5" /> 訓練並建立聲線
                    </>
                  ) : (
                    '儲存聲線'
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
