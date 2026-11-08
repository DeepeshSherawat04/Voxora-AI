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

SAFETY ADDED IN THIS VERSION:
    - Starting a follow-up twice for the same call is refused (409).
    - The follow-up endpoints can be protected with an API key. Set
      AGENTS_API_KEY in your .env to turn it on. If it is NOT set, the
      endpoints stay open (fine for local development only).
"""

import os
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.agents.followup_agent import get_followup_status, start_followup, submit_decision
from app.agents.support_agent import ask_support, resolve_support

# "/api/agents" matches the other routes (/api/calls, /api/health).
router = APIRouter(prefix="/api/agents", tags=["agents"])


# ---------------- simple API-key protection ----------------

def require_api_key(x_api_key: str | None = Header(default=None)):
    """
    Stop strangers from starting follow-ups or approving emails.

    The key is read from the AGENTS_API_KEY environment variable. Callers send
    it in the "X-API-Key" header. If the variable is not set, we allow
    everything so local testing in /docs keeps working.

    NOTE: this is a stop-gap. A key placed in a browser app can be read by
    anyone who opens dev tools. For a real product, use user login (JWT).
    """
    expected = os.getenv("AGENTS_API_KEY")
    if not expected:
        return
    if not x_api_key or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="Missing or invalid API key.")


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

@router.post("/support/ask")
def support_ask(body: SupportQuestion):
    """Ask a product question. May return status 'needs_human' (the agent is unsure)."""
    return ask_support(body.question, body.thread_id)


@router.post("/support/{thread_id}/resolve")
def support_resolve(thread_id: str, body: HumanAnswer):
    """A human agent answers a question the AI could not answer safely."""
    try:
        return resolve_support(thread_id, body.answer)
    except ValueError as err:
        # 409 Conflict = "this request does not fit the current state"
        raise HTTPException(status_code=409, detail=str(err))


# ---------------- Follow-up Agent ----------------

@router.post("/followup/start", dependencies=[Depends(require_api_key)])
def followup_start(body: FollowupStart):
    """Start a follow-up email for a finished call. Pauses for approval."""
    # One call = one follow-up. The call_id is the thread ID, so starting twice
    # would re-run a paused or finished thread and behave unpredictably.
    if get_followup_status(body.call_id)["status"] != "not_found":
        raise HTTPException(status_code=409, detail="A follow-up already exists for this call.")
    return start_followup(body.call_id, body.customer_name, body.transcript, body.customer_email)


@router.get("/followup/{call_id}", dependencies=[Depends(require_api_key)])
def followup_status(call_id: str):
    """See the draft waiting for approval, or the final outcome and audit trail."""
    status = get_followup_status(call_id)
    if status["status"] == "not_found":
        raise HTTPException(status_code=404, detail="No follow-up found for this call.")
    return status


@router.post("/followup/{call_id}/decision", dependencies=[Depends(require_api_key)])
def followup_decision(call_id: str, body: ApprovalDecision):
    """The human approves or rejects the email draft."""
    try:
        return submit_decision(call_id, body.approved, body.feedback)
    except ValueError as err:
        raise HTTPException(status_code=409, detail=str(err))