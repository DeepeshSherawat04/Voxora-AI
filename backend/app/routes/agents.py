"""
agents.py (routes)  -  the web API for our two LangGraph agents.

WHY "def" AND NOT "async def"?
    The agents use blocking code (they wait for the LLM). FastAPI runs normal
    "def" endpoints in a thread pool, so one slow request never freezes the
    server or other calls. (Same reason we used asyncio.to_thread before.)

HOW HUMAN APPROVAL WORKS OVER HTTP:
    1. A request starts the agent -> it runs until it needs a human -> it PAUSES.
    2. The response says "status": "needs_human" / "waiting_for_approval" + the draft.
    3. A human reviews it (later: a button in the React app).
    4. A second request sends the decision -> the agent RESUMES and finishes.

SECURITY IN THIS VERSION (replaces the old API-key stop-gap):
    - Every route needs a signed-in user (Google login).
    - Follow-up routes also check that the call BELONGS to that user.
    - "Support resolve" is a human-agent action, so it is limited to the
      emails listed in the ADMIN_EMAILS environment vVeerble.
    - Starting a follow-up twice for the same call is refused (409).
"""

import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.agents.followup_agent import get_followup_status, start_followup, submit_decision
from app.agents.support_agent import ask_support, resolve_support
from app.auth import current_user
from app.models.database import Call, SessionLocal

# "/api/agents" matches the other routes (/api/calls, /api/health).
router = APIRouter(prefix="/api/agents", tags=["agents"])


# ---------------- ownership / permission helpers ----------------

def require_owned_call(call_id: str, user: dict) -> None:
    """Raise 404 unless call_id is a call that belongs to this user."""
    try:
        cid = int(call_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=404, detail="Call not found")

    db = SessionLocal()
    try:
        found = db.query(Call.id).filter(
            Call.id == cid, Call.owner_id == user["id"]
        ).first()
    finally:
        db.close()

    if not found:
        # 404 (not 403) so nobody can discover which call IDs exist
        raise HTTPException(status_code=404, detail="Call not found")


def require_admin(user: dict = Depends(current_user)) -> dict:
    """Only emails in ADMIN_EMAILS (comma-separated) may act as the human support agent."""
    admins = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}
    if user.get("email", "").lower() not in admins:
        raise HTTPException(status_code=403, detail="Admins only.")
    return user


# ---------------- request shapes (Pydantic checks the input for us) ----------------

class SupportQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    thread_id: str | None = None      # send the same one to continue a conversation


class HumanAnswer(BaseModel):
    answer: str = Field(min_length=1)


class FollowupStart(BaseModel):
    call_id: str
    customer_name: str
    transcript: str
    customer_email: str = ""


class ApprovalDecision(BaseModel):
    approved: bool
    feedback: str = ""      # if approved=False, what should be changed


# ---------------- Support Agent ----------------

@router.post("/support/ask", dependencies=[Depends(current_user)])
def support_ask(body: SupportQuestion):
    """Ask a product question. May return status 'needs_human' (the agent is unsure)."""
    return ask_support(body.question, body.thread_id)


@router.post("/support/{thread_id}/resolve", dependencies=[Depends(require_admin)])
def support_resolve(thread_id: str, body: HumanAnswer):
    """A human agent answers a question the AI could not answer safely."""
    try:
        return resolve_support(thread_id, body.answer)
    except ValueError as err:
        # 409 Conflict = "this request does not fit the current state"
        raise HTTPException(status_code=409, detail=str(err))


# ---------------- Follow-up Agent ----------------

@router.post("/followup/start")
def followup_start(body: FollowupStart, user: dict = Depends(current_user)):
    """Start a follow-up email for a finished call. Pauses for approval."""
    require_owned_call(body.call_id, user)
    # One call = one follow-up. The call_id is the thread ID, so starting twice
    # would re-run a paused or finished thread and behave unpredictably.
    if get_followup_status(body.call_id)["status"] != "not_found":
        raise HTTPException(status_code=409, detail="A follow-up already exists for this call.")
    return start_followup(body.call_id, body.customer_name, body.transcript, body.customer_email)


@router.get("/followup/{call_id}")
def followup_status(call_id: str, user: dict = Depends(current_user)):
    """See the draft waiting for approval, or the final outcome and audit trail."""
    require_owned_call(call_id, user)
    status = get_followup_status(call_id)
    if status["status"] == "not_found":
        raise HTTPException(status_code=404, detail="No follow-up found for this call.")
    return status


@router.post("/followup/{call_id}/decision")
def followup_decision(call_id: str, body: ApprovalDecision, user: dict = Depends(require_admin)):
    try:
        return submit_decision(call_id, body.approved, body.feedback)
    except ValueError as err:
        raise HTTPException(status_code=409, detail=str(err))