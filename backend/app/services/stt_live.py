"""Sarvam realtime streaming STT (live partial transcripts + server-side turn detection).

Browser -> (our /ws/call) -> LiveSTT -> Sarvam wss realtime endpoint.
Partials are forwarded as they arrive; a final transcript marks the end of the
customer's turn, so the agent can reply immediately.

Needs a recent SDK:  pip install -U sarvamai
"""
import asyncio
import json
import logging
import re
from typing import Awaitable, Callable

from sarvamai import AsyncSarvamAI, RealtimeAudioInput

from app.config import settings

logger = logging.getLogger(__name__)

# Sounds a noisy room produces; never worth a reply from the agent.
_FILLERS = {"uh", "um", "umm", "uhh", "hmm", "hm", "mm", "mmm", "mhm", "ah", "aah",
            "er", "erm", "huh", "ok", "okay", "k", "kk", "han", "haan", "achha",
            "theek", "theek hai"}


def _is_noise(text: str) -> bool:
    words = re.findall(r"[a-zA-Z\u0900-\u097F']+", text.lower())
    return not words or all(w in _FILLERS for w in words)


TextCb = Callable[[str], Awaitable[None]]
VoidCb = Callable[[], Awaitable[None]]


class LiveSTT:
    def __init__(self, on_partial: TextCb, on_final: TextCb,
                 on_empty: VoidCb, on_error: TextCb):
        self._on_partial = on_partial
        self._on_final = on_final
        self._on_empty = on_empty
        self._on_error = on_error
        self._queue: asyncio.Queue[str] = asyncio.Queue(maxsize=300)  # ~30 s of 100 ms frames
        self._runner: asyncio.Task | None = None
        self._tasks: set[asyncio.Task] = set()
        self._closed = False
        self._last_partial = ""
        self._level = 0          # 0 = full options, 1 = no keyterms, 2 = bare minimum

    # ---------- public ----------
    async def start(self) -> None:
        if not settings.SARVAM_API_KEY:
            raise RuntimeError("SARVAM_API_KEY is missing in backend/.env")
        self._runner = asyncio.create_task(self._run())

    def push(self, b64_pcm16: str) -> None:
        """Queue one base64 16 kHz mono PCM16 frame (non-blocking)."""
        if self._closed or not b64_pcm16:
            return
        try:
            self._queue.put_nowait(b64_pcm16)
        except asyncio.QueueFull:           # drop the oldest frame, keep it live
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self._queue.put_nowait(b64_pcm16)

    async def close(self) -> None:
        self._closed = True
        pending = [t for t in [self._runner, *self._tasks] if t and not t.done()]
        for t in pending:
            t.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

    # ---------- internals ----------
    async def _run(self) -> None:
        failures = 0
        while not self._closed:
            try:
                await self._session()
                failures = 0                 # clean close (e.g. idle timeout) -> reconnect
            except asyncio.CancelledError:
                raise
            except Exception:
                failures += 1
                self._level = min(self._level + 1, 2)      # next attempt uses fewer options
                logger.exception("Sarvam realtime STT session failed (%d); next try uses option level %d",
                                 failures, self._level)
                if failures >= 4:
                    await self._safe(self._on_error(
                        "Speech recognition is unavailable — please type your reply."))
                    return
            await asyncio.sleep(0.5)

    async def _session(self) -> None:
        while not self._queue.empty():       # don't replay stale audio after a reconnect
            self._queue.get_nowait()
        self._last_partial = ""

        client = AsyncSarvamAI(api_subscription_key=settings.SARVAM_API_KEY)
        base = dict(
            language_code=settings.SARVAM_LANGUAGE,          # "en-IN" (or "auto")
            model=settings.SARVAM_STT_MODEL,                 # "saaras:v4"
            stream_type="fast",                              # lowest-latency partials
            endpointing="vad",
        )
        tuning = dict(
            threshold=getattr(settings, "STT_THRESHOLD", 0.3),
            silence_duration_ms=getattr(settings, "STT_SILENCE_MS", 1200),
            min_speech_duration_ms=getattr(settings, "STT_MIN_SPEECH_MS", 250),
        )
        terms = [t.strip() for t in (getattr(settings, "STT_KEYTERMS", "") or "").split(",") if t.strip()]
        extras = {"keyterms": json.dumps(terms)} if terms else {}

        # Options, richest first. A failed connection drops to the next level; an SDK that rejects
        # an argument (TypeError) also falls through.
        attempts = [{**base, **tuning, **extras}, {**base, **tuning}, base]
        cm = None
        used = None
        for kwargs in attempts[self._level:]:
            try:
                cm = client.speech_to_text_realtime_streaming.connect(**kwargs)
                used = kwargs
                break
            except TypeError as exc:
                logger.warning("Sarvam SDK rejected %s (%s) - retrying with fewer options",
                               sorted(kwargs), exc)
        if cm is None:
            raise RuntimeError("could not open Sarvam realtime STT; run: pip install -U sarvamai")
        logger.info("Opening Sarvam realtime STT with %s", sorted(used))

        async with cm as ws:
            logger.info("Sarvam realtime STT connected")
            sender = asyncio.create_task(self._send_loop(ws))
            try:
                async for message in ws:
                    await self._handle_event(message)
            finally:
                sender.cancel()

    async def _send_loop(self, ws) -> None:
        while True:
            b64 = await self._queue.get()
            await ws.send_realtime_audio_input(RealtimeAudioInput(audio=b64))

    async def _handle_event(self, message) -> None:
        event = getattr(message, "event", "") or ""
        text = (getattr(message, "text", "") or "").strip()

        if event == "transcript.partial":
            if text and text != self._last_partial:
                self._last_partial = text
                await self._safe(self._on_partial(text))

        elif event == "transcript.final":
            self._last_partial = ""
            if text and not _is_noise(text):
                self._spawn(self._on_final(text))     # don't block the receive loop
            else:                                      # empty or just "hmm"/"uh": treat as noise
                await self._safe(self._on_empty())

        elif event == "error":
            logger.error("Sarvam STT error %s: %s",
                         getattr(message, "code", "?"), getattr(message, "message", ""))
            if getattr(message, "is_fatal", False):
                raise RuntimeError("fatal STT error")

    def _spawn(self, coro: Awaitable[None]) -> None:
        task = asyncio.create_task(self._safe(coro))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    @staticmethod
    async def _safe(coro: Awaitable[None]) -> None:
        try:
            await coro
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("LiveSTT callback failed")