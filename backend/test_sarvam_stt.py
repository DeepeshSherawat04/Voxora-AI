# backend/test_sarvam_stt.py
"""Transcribe the first 10 s of test_tts.wav (REST API limit is 30 s)."""
import io
import wave

from app.services.stt import transcribe

MAX_SECONDS = 10

with wave.open("test_tts.wav", "rb") as src:
    params = src.getparams()
    print(f"Original: {src.getnframes() / src.getframerate():.1f}s, "
          f"{src.getframerate()} Hz, {src.getnchannels()} ch")
    frames = src.readframes(min(src.getnframes(), src.getframerate() * MAX_SECONDS))

buf = io.BytesIO()
with wave.open(buf, "wb") as dst:
    dst.setparams(params)
    dst.writeframes(frames)

print("STT heard:", transcribe(buf.getvalue()))