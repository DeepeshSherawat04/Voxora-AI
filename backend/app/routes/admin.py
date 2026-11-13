# backend/app/routes/admin.py
"""
Admin-only routes. Every route here needs a signed-in user whose email is
in ADMIN_EMAILS (checked by require_admin). Admins can see ALL users' calls,
the full chat, and approve/reject the follow-up email drafts.
"""
from fastapi import APIRouter, Depends, HTTPException

from app.agents.followup_agent import get_followup_status, submit_decision
from app.models.database import Call, Message, SessionLocal
from app.routes.agents import ApprovalDecision, require_admin

# dependencies=[...] protects EVERY route in this file
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _iso(v):
    return (v.isoformat() + "Z") if v else None


def _call_dict(c: Call, messages: list) -> dict:
    g = lambda name: getattr(c, name, None)
    return {
        "id": c.id,
        "customer_name": g("customer_name"),
        "owner_email": g("owner_email"),
        "language": g("language"),
        "started_at": _iso(g("started_at")),
        "duration_seconds": g("duration_seconds"),
        "recording_consent": g("recording_consent"),
        "sales_status": g("sales_status"),
        "buying_intent": g("buying_intent"),
        "sentiment": g("sentiment"),
        "summary": g("summary"),
        "requirements": g("requirements"),
        "objections": g("objections"),
        "next_steps": g("next_steps"),
        "messages": [
            {"sender": m.sender, "text": m.text,
             "at": _iso(getattr(m, "created_at", None) or getattr(m, "timestamp", None))}
            for m in messages
        ],
    }


@router.get("/me")
def admin_me(admin: dict = Depends(require_admin)):
    """The frontend calls this to decide whether to show the Admin button."""
    return {"admin": True, "email": admin["email"]}


@router.get("/followups")
def list_followups():
    """Every recent call (of ALL users) that has a follow-up email, with full chat."""
    db = SessionLocal()
    try:
        calls = db.query(Call).order_by(Call.id.desc()).limit(50).all()
        rows = []
        for c in calls:
            status = get_followup_status(str(c.id))
            if status["status"] == "not_found":
                continue
            msgs = db.query(Message).filter(Message.call_id == c.id).order_by(Message.id).all()
            rows.append({"call": _call_dict(c, msgs), "followup": status})
        return rows
    finally:
        db.close()


@router.post("/followups/{call_id}/decision")
def admin_decision(call_id: str, body: ApprovalDecision, admin: dict = Depends(require_admin)):
    """Approve (the email is sent) or reject (with feedback) a draft."""
    print(f"[admin] {admin['email']} {'APPROVED' if body.approved else 'REJECTED'} call {call_id}")
    try:
        return submit_decision(call_id, body.approved, body.feedback)
    except ValueError as err:
        raise HTTPException(status_code=409, detail=str(err))