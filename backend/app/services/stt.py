"""Sarvam AI Speech-to-Text (Saaras)."""
import io
import logging
from functools import lru_cache

from sarvamai import SarvamAI

from app.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _client() -> SarvamAI:
    if not settings.SARVAM_API_KEY:
        raise RuntimeError("SARVAM_API_KEY is missing in backend/.env")
    return SarvamAI(api_subscription_key=settings.SARVAM_API_KEY)


def transcribe(audio: bytes) -> str:
    """Transcribe one utterance (webm/opus/wav bytes) -> text. Raises on API errors."""
    response = _client().speech_to_text.transcribe(
        file=io.BytesIO(audio),
        model=settings.SARVAM_STT_MODEL,
        mode="transcribe",
        language_code=settings.SARVAM_LANGUAGE,   # "en-IN"
    )
    return (getattr(response, "transcript", "") or "").strip()