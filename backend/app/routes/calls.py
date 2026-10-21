# backend/app/routes/calls.py
import asyncio
import json
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect

from app.agents.sales_agent import SalesAgent
from app.config import settings
from app.models.database import Call, Message, SessionLocal

router = APIRouter()


async def _finalize(call: Call, agent: SalesAgent, db, websocket: WebSocket | None):
    """Generate AI summary, persist call, optionally notify the client."""
    summary = await asyncio.to_thread(agent.summarize_call)

    ended = datetime.utcnow()
    call.status = "ended"
    call.ended_at = ended
    call.duration_seconds = int((ended - call.started_at).total_seconds())

    # customer never spoke -> No Response, regardless of what the model says
    if not any(m["role"] == "user" for m in agent.history):
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


@router.websocket("/ws/call")
async def call_socket(websocket: WebSocket):
    await websocket.accept()
    db = SessionLocal()
    call, agent, finalized = None, None, False

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
                )
                db.add(call)
                db.commit()
                db.refresh(call)

                agent = SalesAgent(customer_name=call.customer_name,
                                   language=call.language)

                await websocket.send_json({
                    "type": "call_started",
                    "call_id": call.id,
                    "started_at": call.started_at.isoformat(),
                })

                opening = agent.opening_message()
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

                text = (msg.get("text") or "").strip()
                if not text:
                    continue

                db.add(Message(call_id=call.id, sender="customer", text=text))
                db.commit()
                await websocket.send_json({
                    "type": "transcript", "sender": "customer", "text": text,
                    "timestamp": datetime.utcnow().isoformat(),
                })

                # run the LLM in a thread so it doesn't block the event loop
                reply = await asyncio.to_thread(agent.generate_reply, text)

                db.add(Message(call_id=call.id, sender="ai", text=reply["text"]))
                db.commit()
                await websocket.send_json({
                    "type": "transcript", **reply,
                    "timestamp": datetime.utcnow().isoformat(),
                })

            # ---------- end ----------
            elif mtype == "end_call":
                if call and agent and not finalized:
                    await _finalize(call, agent, db, websocket)
                    finalized = True
                break

    except WebSocketDisconnect:
        pass
    finally:
        # tab closed / network dropped -> still finalize in the DB
        if call and agent and not finalized:
            try:
                await _finalize(call, agent, db, None)
            except Exception:
                db.rollback()
        db.close()
        try:
            await websocket.close()
        except Exception:
            pass

@router.post("/api/calls/{call_id}/recording")
async def upload_recording(call_id: int, file: UploadFile = File(...)):
    db = SessionLocal()
    try:
        call = db.query(Call).filter(Call.id == call_id).first()
        if not call:
            raise HTTPException(status_code=404, detail="Call not found")

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