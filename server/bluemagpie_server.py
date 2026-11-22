#!/usr/bin/env python3
"""Local HTTP server for OpenFormosa/BlueMagpie-TTS (voice cloning + synthesis).

Zero extra web-framework dependencies: uses stdlib ThreadingHTTPServer.
Exposes:
  GET  /health
  POST /v1/tts/voices/clone  (extracts speaker centroid .pt and/or normalized .wav)
  POST /v1/tts               (synthesizes 48 kHz WAV)
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
VOICE_STORE_DIR = ROOT_DIR / "voice-samples" / "bluemagpie"
VOICE_STORE_DIR.mkdir(parents=True, exist_ok=True)

# Allow importing bluemagpie from a sibling checkout if not pip-installed yet.
for _candidate_repo in [
    os.environ.get("BLUEMAGPIE_REPO_DIR", ""),
    str(ROOT_DIR.parent / "bluemagpie_project" / "BlueMagpie-TTS"),
    str(Path.home() / "BlueMagpie-TTS"),
]:
    if _candidate_repo:
        _src = Path(_candidate_repo) / "src"
        if _src.is_dir() and str(_src) not in sys.path:
            sys.path.insert(0, str(_src))

_MODEL = None
_MODEL_DIR: Path | None = None
_BUNDLED_CENTROIDS: dict[str, Any] | None = None
_MODEL_LOCK = threading.Lock()
_STATUS_LOCK = threading.Lock()
_DEVICE = "cpu"
_DEVICE_NAME: str | None = None
_STATUS: dict[str, Any] = {
    "state": "idle",
    "stage_label": "待命",
    "started_at": None,
    "stage_started_at": None,
    "text_chars": 0,
    "voice": "",
    "completed_count": 0,
    "last_duration_sec": None,
}


def _now_ms() -> int:
    return int(time.time() * 1000)


def _set_status(state: str, stage_label: str, **extra: Any) -> None:
    now = _now_ms()
    with _STATUS_LOCK:
        _STATUS["state"] = state
        _STATUS["stage_label"] = stage_label
        _STATUS["stage_started_at"] = now
        for k, v in extra.items():
            _STATUS[k] = v


def _get_status_snapshot() -> dict[str, Any]:
    with _STATUS_LOCK:
        snap = dict(_STATUS)
    snap["device"] = _DEVICE
    snap["device_name"] = _DEVICE_NAME
    snap["model_loaded"] = _MODEL is not None
    snap["server_time_ms"] = _now_ms()
    return snap


def _has_xpu() -> bool:
    try:
        import torch

        return hasattr(torch, "xpu") and bool(torch.xpu.is_available())
    except Exception:
        return False


def _patch_bluemagpie_xpu_support() -> None:
    """Allow BlueMagpie/VoxCPM device resolution to accept Intel XPU devices."""
    import bluemagpie.model as bm_model
    import bluemagpie._vendor.voxcpm.model.utils as vox_utils

    orig_resolve = vox_utils.resolve_runtime_device
    if getattr(orig_resolve, "_xpu_patched", False):
        return

    def _resolve_with_xpu(device: str | None, configured_device: str = "cuda") -> str:
        explicit = None if device is None else device.strip().lower()
        if explicit and explicit.startswith("xpu"):
            if not _has_xpu():
                raise ValueError(f"Requested device '{device}', but Intel XPU is not available.")
            return explicit
        return orig_resolve(device, configured_device)

    _resolve_with_xpu._xpu_patched = True  # type: ignore[attr-defined]
    vox_utils.resolve_runtime_device = _resolve_with_xpu
    bm_model.resolve_runtime_device = _resolve_with_xpu


def _find_local_model_dir(explicit: str | None = None) -> Path | None:
    candidates = [
        explicit or "",
        os.environ.get("BLUEMAGPIE_MODEL_DIR", ""),
        str(ROOT_DIR.parent / "bluemagpie_project" / "checkpoints" / "BlueMagpie-TTS"),
        r"C:\whisper_ov\checkpoints\BlueMagpie-TTS",
    ]
    for raw in candidates:
        if not raw:
            continue
        p = Path(raw)
        if (p / "pytorch_model.bin").exists() and (p / "tokenizer.json").exists():
            return p
    return None


def _ensure_model_dir(explicit: str | None = None) -> Path:
    global _MODEL_DIR
    if _MODEL_DIR is not None:
        return _MODEL_DIR
    found = _find_local_model_dir(explicit)
    if found is not None:
        _MODEL_DIR = found
        return _MODEL_DIR
    from huggingface_hub import snapshot_download

    downloaded = Path(snapshot_download("OpenFormosa/BlueMagpie-TTS"))
    _MODEL_DIR = downloaded
    return _MODEL_DIR


def _ensure_model(explicit_dir: str | None = None):
    global _MODEL, _BUNDLED_CENTROIDS
    with _MODEL_LOCK:
        if _MODEL is not None:
            return _MODEL
        _set_status("loading_model", f"正在載入 BlueMagpie-TTS 模型權重 ({_DEVICE.upper()})...")
        import torch
        from transformers import PreTrainedTokenizerFast
        from bluemagpie import BlueMagpieModel

        if _DEVICE.startswith("xpu"):
            _patch_bluemagpie_xpu_support()

        model_dir = _ensure_model_dir(explicit_dir)
        tokenizer = PreTrainedTokenizerFast(tokenizer_file=str(model_dir / "tokenizer.json"))
        print(f"[BlueMagpie] Loading model from {model_dir} on {_DEVICE}...", flush=True)
        _MODEL = BlueMagpieModel.from_local(
            str(model_dir),
            tokenizer=tokenizer,
            training=False,
            device=_DEVICE,
        )
        centroid_table_path = model_dir / "checkpoints" / "speaker_centroids.pt"
        if centroid_table_path.exists():
            table = torch.load(str(centroid_table_path), map_location="cpu", weights_only=True)
            _BUNDLED_CENTROIDS = {
                sid: table["centroids"][idx]
                for idx, sid in enumerate(table.get("speaker_ids", []))
            }
        else:
            _BUNDLED_CENTROIDS = {}
        print(f"[BlueMagpie] Ready (bundled speakers: {list(_BUNDLED_CENTROIDS.keys())})", flush=True)
        _set_status("idle", "模型已載入就緒")
        return _MODEL


def _has_centroid_extractor() -> bool:
    import importlib.util

    return bool(importlib.util.find_spec("speechbrain")) and bool(importlib.util.find_spec("bluemagpie"))


def _convert_to_wav(raw_bytes: bytes, ext: str, out_wav: Path) -> None:
    clean_ext = "".join(ch for ch in (ext or "wav").lower() if ch.isalnum()) or "wav"
    with tempfile.NamedTemporaryFile(suffix=f".{clean_ext}", delete=False) as tmp:
        tmp.write(raw_bytes)
        tmp_path = Path(tmp.name)
    try:
        ffmpeg = shutil.which("ffmpeg")
        if ffmpeg:
            proc = subprocess.run(
                [ffmpeg, "-y", "-i", str(tmp_path), "-ac", "1", "-ar", "48000", "-sample_fmt", "s16", str(out_wav)],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if proc.returncode == 0 and out_wav.exists() and out_wav.stat().st_size > 44:
                return
            if clean_ext != "wav":
                raise RuntimeError(f"ffmpeg failed to convert .{clean_ext}: {proc.stderr[-300:]}")
        if clean_ext == "wav":
            out_wav.write_bytes(raw_bytes)
            return
        raise RuntimeError(f"ffmpeg is required to convert .{clean_ext} audio to WAV")
    finally:
        tmp_path.unlink(missing_ok=True)


def _split_narration_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[。！？!?])\s*|(?<=\.)\s+(?=\S)|\n+", text.strip())
    return [part.strip() for part in parts if part.strip()]


def _waveform_to_wav_bytes(waveform, sample_rate: int) -> bytes:
    import numpy as np

    arr = np.asarray(waveform, dtype=np.float32)
    arr = np.squeeze(arr)
    if arr.ndim == 0:
        arr = arr.reshape(1)
    if arr.ndim > 1:
        time_axis = int(np.argmax(arr.shape))
        arr = np.moveaxis(arr, time_axis, 0).reshape(arr.shape[0], -1).mean(axis=1)
    arr = np.clip(np.nan_to_num(arr, nan=0.0, posinf=1.0, neginf=-1.0), -1.0, 1.0)
    pcm16 = (arr * 32767.0).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(int(sample_rate))
        wf.writeframes(pcm16.tobytes())
    return buf.getvalue()


def _apply_wav_tempo(wav_bytes: bytes, speed: float) -> bytes:
    tempo = min(2.0, max(0.5, float(speed)))
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg or abs(tempo - 1.0) < 0.01:
        return wav_bytes

    input_path: Path | None = None
    output_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix="-input.wav", delete=False) as input_file:
            input_path = Path(input_file.name)
            input_file.write(wav_bytes)
        with tempfile.NamedTemporaryFile(suffix="-output.wav", delete=False) as output_file:
            output_path = Path(output_file.name)

        proc = subprocess.run(
            [
                ffmpeg,
                "-y",
                "-loglevel",
                "error",
                "-i",
                str(input_path),
                "-af",
                f"atempo={tempo}",
                "-ac",
                "1",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if proc.returncode == 0 and output_path.exists() and output_path.stat().st_size > 44:
            return output_path.read_bytes()
    except (OSError, subprocess.SubprocessError, ValueError):
        pass
    finally:
        if input_path is not None:
            input_path.unlink(missing_ok=True)
        if output_path is not None:
            output_path.unlink(missing_ok=True)
    return wav_bytes


def _safe_voice_id(raw: str | None, audio_bytes: bytes) -> str:
    if raw:
        cleaned = "".join(ch for ch in raw if ch.isalnum() or ch in ("-", "_"))[:48]
        if cleaned:
            return cleaned
    return "bm-" + hashlib.sha1(audio_bytes).hexdigest()[:12]


class BlueMagpieHandler(BaseHTTPRequestHandler):
    explicit_model_dir: str | None = None

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        return json.loads(raw.decode("utf-8"))

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0].rstrip("/")
        if path in ("/status", "/v1/tts/status"):
            self._send_json(200, {"ok": True, **_get_status_snapshot()})
            return
        if path in ("", "/health", "/v1/tts/health"):
            model_dir = _find_local_model_dir(self.explicit_model_dir)
            self._send_json(
                200,
                {
                    "ok": True,
                    "service": "OpenFormosa/BlueMagpie-TTS",
                    "device": _DEVICE,
                    "device_name": _DEVICE_NAME,
                    "model_dir": str(model_dir) if model_dir else None,
                    "model_loaded": _MODEL is not None,
                    "centroid_supported": _has_centroid_extractor(),
                    "status": _get_status_snapshot(),
                },
            )
            return
        self._send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0].rstrip("/")
        if path in ("/v1/tts/voices/clone", "/voices/clone"):
            self._handle_clone()
            return
        if path in ("/v1/tts", "/tts", "/v1/audio/speech"):
            self._handle_synthesize()
            return
        self._send_json(404, {"error": f"Unknown endpoint: {path}"})

    def _handle_clone(self) -> None:
        try:
            body = self._read_json()
            audio_b64 = body.get("reference_audio") or body.get("audio")
            if not audio_b64 or not isinstance(audio_b64, str):
                self._send_json(400, {"error": "Missing reference_audio (base64)"})
                return
            audio_fmt = str(body.get("reference_audio_format") or body.get("audio_format") or "wav")
            raw_bytes = base64.b64decode(audio_b64)
            voice_id = _safe_voice_id(body.get("voice_id"), raw_bytes)

            wav_path = VOICE_STORE_DIR / f"{voice_id}.wav"
            _convert_to_wav(raw_bytes, audio_fmt, wav_path)

            pt_path = VOICE_STORE_DIR / f"{voice_id}.pt"
            mode = "reference_wav"
            centroid_dim = None
            note = "已建立 BlueMagpie 參考音檔聲線（免逐字稿即時聲音複製）"

            if _has_centroid_extractor():
                try:
                    import torch
                    from bluemagpie.centroid import extract_speaker_centroid

                    centroid = extract_speaker_centroid([str(wav_path)], device=_DEVICE)
                    torch.save(centroid.cpu(), str(pt_path))
                    mode = "speaker_centroid"
                    centroid_dim = int(centroid.numel())
                    note = f"已透過 ECAPA-TDNN 抽取 {centroid_dim} 維 BlueMagpie 語者向量"
                except Exception as exc:
                    note = f"語者向量抽取失敗 ({exc})，已改存為 BlueMagpie 參考音檔聲線"

            self._send_json(
                200,
                {
                    "ok": True,
                    "voice_id": voice_id,
                    "mode": mode,
                    "centroid_dim": centroid_dim,
                    "note": note,
                },
            )
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def _handle_synthesize(self) -> None:
        tmp_ref: Path | None = None
        req_start = time.monotonic()
        succeeded = False
        try:
            body = self._read_json()
            text = str(body.get("input") or body.get("text") or "").strip()
            if not text:
                self._send_json(400, {"error": "Missing input/text"})
                return

            voice = str(body.get("voice") or "").strip()
            _set_status(
                "loading_model" if _MODEL is None else "preparing_voice",
                (
                    f"正在載入 BlueMagpie-TTS 模型權重 ({_DEVICE.upper()})..."
                    if _MODEL is None
                    else "正在準備參考聲線與輸入參數..."
                ),
                started_at=_now_ms(),
                text_chars=len(text),
                voice=voice or "default",
            )

            model = _ensure_model(self.explicit_model_dir)
            import torch

            _set_status(
                "preparing_voice",
                "正在準備參考聲線與輸入參數...",
                text_chars=len(text),
                voice=voice or "default",
            )
            cfg_value = float(body.get("cfg_value", 2.0))
            timesteps = int(body.get("inference_timesteps", 10))

            kwargs: dict[str, Any] = {
                "target_text": text,
                "cfg_value": cfg_value,
                "inference_timesteps": timesteps,
                "retry_badcase": True,
            }

            safe_vid = "".join(ch for ch in voice if ch.isalnum() or ch in ("-", "_"))
            pt_path = VOICE_STORE_DIR / f"{safe_vid}.pt" if safe_vid else None
            wav_path = VOICE_STORE_DIR / f"{safe_vid}.wav" if safe_vid else None

            # For custom cloned voices (unseen speakers), prefer reference_wav_path
            # (zero-shot AudioVAE acoustic tokens) over speaker_centroid (.pt),
            # because a single 192-d centroid drifts across scenes for unseen voices.
            if wav_path and wav_path.exists():
                kwargs["reference_wav_path"] = str(wav_path)
            elif isinstance(body.get("reference_audio"), str) and body["reference_audio"]:
                raw_bytes = base64.b64decode(body["reference_audio"])
                fmt = str(body.get("reference_audio_format") or "wav")
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
                    tmp_ref = Path(tf.name)
                _convert_to_wav(raw_bytes, fmt, tmp_ref)
                kwargs["reference_wav_path"] = str(tmp_ref)
            elif pt_path and pt_path.exists():
                kwargs["speaker_centroid"] = torch.load(str(pt_path), map_location="cpu", weights_only=True)
            elif _BUNDLED_CENTROIDS and voice in _BUNDLED_CENTROIDS:
                kwargs["speaker_centroid"] = _BUNDLED_CENTROIDS[voice]
            elif _BUNDLED_CENTROIDS and "hung_yi_lee" in _BUNDLED_CENTROIDS:
                kwargs["speaker_centroid"] = _BUNDLED_CENTROIDS["hung_yi_lee"]

            sentences = _split_narration_sentences(text)
            with _MODEL_LOCK:
                generated_parts = []
                for index, sentence in enumerate(sentences):
                    _set_status(
                        "generating",
                        f"正在執行 BlueMagpie 語音推論 ({index + 1}/{len(sentences)} 句 · {_DEVICE.upper()})...",
                    )
                    part_kwargs = {**kwargs, "target_text": sentence}
                    generated_parts.append(model.generate(**part_kwargs).squeeze().cpu().numpy())

            import numpy as np

            silence = np.zeros(round(model.sample_rate * 0.35), dtype=np.float32)
            audio = np.concatenate(
                [part if index == 0 else np.concatenate([silence, part]) for index, part in enumerate(generated_parts)]
            )
            _set_status("encoding", "正在封裝 48kHz WAV 音檔...")
            wav_bytes = _waveform_to_wav_bytes(audio, model.sample_rate)
            wav_bytes = _apply_wav_tempo(wav_bytes, float(body.get("speed", 1.0)))

            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(wav_bytes)))
            self.end_headers()
            self.wfile.write(wav_bytes)
            succeeded = True
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})
        finally:
            if tmp_ref is not None:
                tmp_ref.unlink(missing_ok=True)
            elapsed = round(time.monotonic() - req_start, 2)
            with _STATUS_LOCK:
                if succeeded:
                    _STATUS["completed_count"] = int(_STATUS.get("completed_count", 0)) + 1
                    _STATUS["last_duration_sec"] = elapsed
                _STATUS["state"] = "idle"
                _STATUS["stage_label"] = "待命"
                _STATUS["started_at"] = None
                _STATUS["stage_started_at"] = _now_ms()


def main() -> int:
    global _DEVICE, _DEVICE_NAME
    parser = argparse.ArgumentParser(description="Local OpenFormosa/BlueMagpie-TTS HTTP Server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--device", default="auto", choices=["auto", "cuda", "xpu", "mps", "cpu"])
    parser.add_argument("--model-dir", default=None)
    parser.add_argument("--preload", action="store_true", help="Load the 8GB model immediately on startup")
    args = parser.parse_args()

    if args.device == "auto":
        try:
            import torch

            if torch.cuda.is_available():
                _DEVICE = "cuda"
                _DEVICE_NAME = torch.cuda.get_device_name(0)
            elif hasattr(torch, "xpu") and torch.xpu.is_available():
                _DEVICE = "xpu"
                _DEVICE_NAME = torch.xpu.get_device_name(0)
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                _DEVICE = "mps"
                _DEVICE_NAME = "Apple MPS"
            else:
                _DEVICE = "cpu"
        except Exception:
            _DEVICE = "cpu"
    else:
        _DEVICE = args.device
        if _DEVICE == "xpu" and _has_xpu():
            import torch

            _DEVICE_NAME = torch.xpu.get_device_name(0)

    BlueMagpieHandler.explicit_model_dir = args.model_dir
    if args.preload:
        _ensure_model(args.model_dir)

    server = ThreadingHTTPServer((args.host, args.port), BlueMagpieHandler)
    dev_desc = f"{_DEVICE} ({_DEVICE_NAME})" if _DEVICE_NAME else _DEVICE
    print(f"[BlueMagpie] Listening on http://{args.host}:{args.port} (device={dev_desc})", flush=True)
    print(f"[BlueMagpie] Model dir: {_find_local_model_dir(args.model_dir) or 'HuggingFace auto-download'}", flush=True)
    print(f"[BlueMagpie] Speaker centroid (speechbrain): {_has_centroid_extractor()}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
