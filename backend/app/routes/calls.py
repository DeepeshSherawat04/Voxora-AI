# backend/app/routes/calls.py
import asyncio
import base64
import difflib
import json
import logging
import os
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect

from app.agents.sales_agent import SalesAgent
from app.auth import current_user, ws_user          # login checks
from app.config import settings
from app.models.database import Call, Message, SessionLocal
from fastapi.responses import Response
from pydantic import BaseModel

from app.services.stt import transcribe as stt_transcribe
from app.services.stt_live import LiveSTT
from app.services.tts import synthesize as tts_synthesize

router = APIRouter()

def _now_iso() -> str:
    """Current UTC time with a 'Z', so the browser converts it to local time."""
    return datetime.utcnow().isoformat() + "Z"

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def _find_email(texts) -> str:
    """Fallback: first email address the customer typed/said during the call."""
    for t in texts:
        m = _EMAIL_RE.search(t or "")
        if m:
            return m.group(0)
    return ""


def _is_echo_of(text: str, last_ai: str) -> bool:
    """True if the 'customer' turn is just the agent's own voice returning via speakers."""
    a, b = text.lower().strip(), (last_ai or "").lower().strip()
    if not a or not b:
        return False
    if a in b or b in a:                 # one line sits inside the other
        return True
    # otherwise: are the two lines mostly the same? (0 = nothing alike, 1 = identical)
    return difflib.SequenceMatcher(None, a, b).ratio() > 0.55


async def _handle_user_text(websocket: WebSocket, call: Call, agent: SalesAgent, db, text: str) -> None:
    """Customer said something (typed or transcribed): persist, reply, persist."""
    text = (text or "").strip()
    if not text:
        return
    db.add(Message(call_id=call.id, sender="customer", text=text))
    db.commit()
    await websocket.send_json({
        "type": "transcript", "sender": "customer", "text": text,
        "timestamp": datetime.utcnow().isoformat(),
    })

    reply = await asyncio.to_thread(agent.generate_reply, text)
    db.add(Message(call_id=call.id, sender="ai", text=reply["text"]))
    db.commit()
    await websocket.send_json({
        "type": "transcript", **reply,
        "timestamp": datetime.utcnow().isoformat(),
    })


async def _finalize(
    call: Call,
    agent: SalesAgent,
    db,
    websocket: WebSocket | None,
    customer_email: str = "",          # NEW: email typed in the UI
):
    """Generate AI summary, persist call, optionally notify the client."""
    summary = await asyncio.to_thread(agent.summarize_call)

    ended = datetime.utcnow()
    call.status = "ended"
    call.ended_at = ended
    call.duration_seconds = int((ended - call.started_at).total_seconds())

    # customer never spoke -> No Response, regardless of what the model says
    customer_spoke = any(m["role"] == "user" for m in agent.history)
    if not customer_spoke:
        summary.sales_status = "No Response"

    call.summary = summary.summary
    call.requirements = summary.requirements
    call.objections = summary.objections
    call.next_steps = summary.next_steps
    call.sales_status = summary.sales_status
    call.buying_intent = summary.buying_intent
    call.sentiment = summary.sentiment
    db.commit()

    if websocket is not None:
        await websocket.send_json({
            "type": "call_ended",
            "duration_seconds": call.duration_seconds,
            "sales_status": call.sales_status,
            "summary": summary.model_dump(),
        })
        
        if customer_spoke:
            user_texts = [m["content"] for m in agent.history if m["role"] == "user"]
            spoken_email = (getattr(agent, "customer_email", "")
                            or _find_email(reversed(user_texts)))
            logger.info("follow-up recipient | spoken=%s | form=%s",
                        spoken_email or "-", customer_email or "-")
            customer_email = (spoken_email or customer_email or "").strip().lower()
        transcript_text = "\n".join(
            f"{'Aria' if m['role'] == 'assistant' else call.customer_name}: {m['content']}"
            for m in agent.history
        )
        try:
            from app.agents.followup_agent import start_followup
            result = await asyncio.to_thread(
                start_followup,
                str(call.id),
                call.customer_name,
                transcript_text,
                customer_email,            # NEW: recipient address
            )
            print(f"[follow-up] call {call.id} -> {result['status']}")
        except Exception:
            logger.exception("Follow-up start failed")


@router.websocket("/ws/call")
async def call_socket(websocket: WebSocket):
    # Only signed-in users may open a call. The token comes as ?token=...
    # ws_user() closes the connection itself if the token is missing or invalid.
    user = await ws_user(websocket)
    if not user:
        return

    await websocket.accept()
    db = SessionLocal()
    call, agent, finalized = None, None, False
    live_stt = None                        # live (streaming) STT session
    turn_lock = asyncio.Lock()             # one customer turn at a time
    customer_email = ""                    # NEW: kept in memory for this call

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            mtype = msg.get("type")

            # ---------- start ----------
            if mtype == "start_call":
                call = Call(
                    customer_name=msg.get("customer_name") or "Customer",
                    phone=msg.get("phone"),
                    language=msg.get("language", "English"),
                    status="in_call",
                    recording_consent="given" if msg.get("recording_consent") else "declined",
                    owner_id=user["id"],
                    owner_email=user["email"],
                )
                db.add(call)
                db.commit()
                db.refresh(call)

                # NEW: read the customer's email sent by the frontend
                customer_email = (msg.get("customer_email") or "").strip()

                agent = SalesAgent(customer_name=call.customer_name,
                                   language=call.language)

                await websocket.send_json({
                    "type": "call_started",
                    "call_id": call.id,
                    "started_at": call.started_at.isoformat(),
                })

                opening = agent.opening_message()
                if call.recording_consent == "given":
                    opening["text"] = ("This call is being recorded, with your consent, "
                                       "for quality and training. " + opening["text"])
                db.add(Message(call_id=call.id, sender="ai", text=opening["text"]))
                db.commit()
                await websocket.send_json({
                    "type": "transcript", **opening,
                    "timestamp": datetime.utcnow().isoformat(),
                })

            # ---------- conversation ----------
            elif mtype == "user_text":
                if not call or not agent:
                    await websocket.send_json(
                        {"type": "error", "message": "Start the call first."})
                    continue
                async with turn_lock:
                    await _handle_user_text(websocket, call, agent, db, msg.get("text") or "")

            elif mtype == "user_audio":
                if not call or not agent:
                    await websocket.send_json(
                        {"type": "error", "message": "Start the call first."})
                    continue
                try:
                    audio = base64.b64decode(msg.get("audio") or "", validate=True)
                except Exception:
                    continue
                if len(audio) < 1500:          # noise blip, not worth an API call
                    continue
                try:
                    text = await asyncio.to_thread(stt_transcribe, audio)
                except Exception:
                    logger.exception("Sarvam STT failed")
                    await websocket.send_json({
                        "type": "stt_empty",
                        "message": "Couldn't understand that — please say it again.",
                    })
                    continue
                if not text:
                    await websocket.send_json({"type": "stt_empty"})
                    continue
                async with turn_lock:
                    await _handle_user_text(websocket, call, agent, db, text)

            # ---------- live (streaming) STT ----------
            elif mtype == "stt_start":
                if not call or not agent:
                    await websocket.send_json({"type": "error", "message": "Start the call first."})
                    continue
                if live_stt:
                    await live_stt.close()

                async def _on_partial(text: str) -> None:
                    await websocket.send_json({"type": "stt_partial", "text": text})

                async def _on_final(text: str) -> None:
                    # Echo guard: find what the agent said last...
                    last_ai = next((m["content"] for m in reversed(agent.history)
                                    if m["role"] == "assistant"), "")
                    # ...and if this "customer" text matches it, it is our own
                    # voice coming back through the speakers. Ignore it.
                    if _is_echo_of(text, last_ai):
                        return                   # our own TTS, not the customer
                    async with turn_lock:
                        await _handle_user_text(websocket, call, agent, db, text)

                async def _on_empty() -> None:
                    await websocket.send_json({"type": "stt_empty"})

                async def _on_error(message: str) -> None:
                    await websocket.send_json({"type": "error", "message": message})

                live_stt = LiveSTT(_on_partial, _on_final, _on_empty, _on_error)
                await live_stt.start()

            elif mtype == "audio_chunk":
                if live_stt:
                    live_stt.push(msg.get("audio") or "")

            # ---------- end ----------
            elif mtype == "end_call":
                if live_stt:
                    await live_stt.close()
                    live_stt = None
                if call and agent and not finalized:
                    await _finalize(call, agent, db, websocket, customer_email)
                    finalized = True
                break

    except WebSocketDisconnect:
        pass
    finally:
        # tab closed / network dropped -> still finalize in the DB
        if live_stt:
            try:
                await live_stt.close()
            except Exception:
                logger.exception("Live STT close failed")
            live_stt = None
        if call and agent and not finalized:
            try:
                await _finalize(call, agent, db, None, customer_email)
            except Exception:
                db.rollback()
        db.close()
        try:
            await websocket.close()
        except Exception:
            pass

class TTSRequest(BaseModel):
    text: str


@router.post("/api/tts")
async def text_to_speech(body: TTSRequest, user: dict = Depends(current_user)):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if len(text) > 2500:
        raise HTTPException(status_code=400, detail="text too long (max 2500 characters)")
    try:
        wav = await asyncio.to_thread(tts_synthesize, text)
    except Exception:
        logger.exception("Sarvam TTS failed")
        raise HTTPException(status_code=502, detail="TTS synthesis failed")
    return Response(content=wav, media_type="audio/wav")

@router.post("/api/calls/{call_id}/recording")
async def upload_recording(
    call_id: int,
    file: UploadFile = File(...),
    user: dict = Depends(current_user),          # must be signed in
):
    db = SessionLocal()
    try:
        # the call must belong to this user (404 so we don't reveal other IDs)
        call = db.query(Call).filter(
            Call.id == call_id, Call.owner_id == user["id"]
        ).first()
        if not call:
            raise HTTPException(status_code=404, detail="Call not found")
        if call.recording_consent != "given":
            raise HTTPException(status_code=403, detail="Recording consent was not given")

        ext = os.path.splitext(file.filename or "")[1] or ".webm"
        fname = f"call_{call_id}_{uuid.uuid4().hex[:8]}{ext}"
        path = os.path.join(settings.RECORDINGS_DIR, fname)
        with open(path, "wb") as f:
            f.write(await file.read())

        call.recording_path = fname
        db.commit()
        return {"filename": fname, "url": f"/recordings/{fname}"}
    finally:
        db.close()