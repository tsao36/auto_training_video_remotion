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
import shutil
import subprocess
import sys
import tempfile
import threading
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
_DEVICE = "cpu"


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
        import torch
        from transformers import PreTrainedTokenizerFast
        from bluemagpie import BlueMagpieModel

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
        if self.path.rstrip("/") in ("", "/health", "/v1/tts/health"):
            model_dir = _find_local_model_dir(self.explicit_model_dir)
            self._send_json(
                200,
                {
                    "ok": True,
                    "service": "OpenFormosa/BlueMagpie-TTS",
                    "device": _DEVICE,
                    "model_dir": str(model_dir) if model_dir else None,
                    "model_loaded": _MODEL is not None,
                    "centroid_supported": _has_centroid_extractor(),
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
        try:
            body = self._read_json()
            text = str(body.get("input") or body.get("text") or "").strip()
            if not text:
                self._send_json(400, {"error": "Missing input/text"})
                return

            model = _ensure_model(self.explicit_model_dir)
            import torch

            voice = str(body.get("voice") or "").strip()
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

            if pt_path and pt_path.exists():
                kwargs["speaker_centroid"] = torch.load(str(pt_path), map_location="cpu", weights_only=True)
            elif wav_path and wav_path.exists():
                kwargs["reference_wav_path"] = str(wav_path)
            elif isinstance(body.get("reference_audio"), str) and body["reference_audio"]:
                raw_bytes = base64.b64decode(body["reference_audio"])
                fmt = str(body.get("reference_audio_format") or "wav")
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
                    tmp_ref = Path(tf.name)
                _convert_to_wav(raw_bytes, fmt, tmp_ref)
                kwargs["reference_wav_path"] = str(tmp_ref)
            elif _BUNDLED_CENTROIDS and voice in _BUNDLED_CENTROIDS:
                kwargs["speaker_centroid"] = _BUNDLED_CENTROIDS[voice]
            elif _BUNDLED_CENTROIDS and "hung_yi_lee" in _BUNDLED_CENTROIDS:
                kwargs["speaker_centroid"] = _BUNDLED_CENTROIDS["hung_yi_lee"]

            with _MODEL_LOCK:
                audio = model.generate(**kwargs)
            wav_bytes = _waveform_to_wav_bytes(audio.squeeze().cpu().numpy(), model.sample_rate)

            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(wav_bytes)))
            self.end_headers()
            self.wfile.write(wav_bytes)
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})
        finally:
            if tmp_ref is not None:
                tmp_ref.unlink(missing_ok=True)


def main() -> int:
    global _DEVICE
    parser = argparse.ArgumentParser(description="Local OpenFormosa/BlueMagpie-TTS HTTP Server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--device", default="auto", choices=["auto", "cuda", "mps", "cpu"])
    parser.add_argument("--model-dir", default=None)
    parser.add_argument("--preload", action="store_true", help="Load the 8GB model immediately on startup")
    args = parser.parse_args()

    if args.device == "auto":
        try:
            import torch

            _DEVICE = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
        except Exception:
            _DEVICE = "cpu"
    else:
        _DEVICE = args.device

    BlueMagpieHandler.explicit_model_dir = args.model_dir
    if args.preload:
        _ensure_model(args.model_dir)

    server = ThreadingHTTPServer((args.host, args.port), BlueMagpieHandler)
    print(f"[BlueMagpie] Listening on http://{args.host}:{args.port} (device={_DEVICE})", flush=True)
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
