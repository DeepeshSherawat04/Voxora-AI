# backend/app/services/tts.py
"""Sarvam AI Text-to-Speech (Bulbul)."""
import base64
import io
import logging
import wave
from functools import lru_cache

from sarvamai import SarvamAI

from app.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _client() -> SarvamAI:
    if not settings.SARVAM_API_KEY:
        raise RuntimeError("SARVAM_API_KEY is missing in backend/.env")
    return SarvamAI(api_subscription_key=settings.SARVAM_API_KEY)


def _merge_wavs(chunks: list[bytes]) -> bytes:
    """Sarvam may split long text into several WAVs; join them into one valid WAV."""
    if len(chunks) == 1:
        return chunks[0]
    out = io.BytesIO()
    with wave.open(out, "wb") as w_out:
        for i, chunk in enumerate(chunks):
            with wave.open(io.BytesIO(chunk), "rb") as w_in:
                if i == 0:
                    w_out.setparams(w_in.getparams())
                w_out.writeframes(w_in.readframes(w_in.getnframes()))
    return out.getvalue()


def synthesize(text: str) -> bytes:
    """Synthesize text -> WAV audio bytes."""
    response = _client().text_to_speech.convert(
        language_code=settings.SARVAM_LANGUAGE,
        text=text,
        model=settings.SARVAM_TTS_MODEL,
        speaker=settings.SARVAM_TTS_SPEAKER,
    )
    audios = getattr(response, "audios", None)
    if not audios:
        raise RuntimeError(f"Sarvam TTS returned no audio: {response!r}")
    return _merge_wavs([base64.b64decode(a) for a in audios])