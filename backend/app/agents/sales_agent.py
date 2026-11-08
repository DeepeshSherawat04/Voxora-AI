# backend/app/agents/sales_agent.py
"""
sales_agent.py  -  Aria, the live voice sales agent (now powered by LangChain).

WHAT CHANGED FROM THE OLD VERSION?
    OLD: we called chat_json() from groq_llm.py, then fixed and parsed JSON by hand.
    NEW: we call run_reply() / run_summary() from chains.py. LangChain makes the
         model answer in a fixed shape (AriaTurn / CallAnalysis), retries on
         errors, and checks the answer for us. So groq_llm.py is not needed.
"""
from typing import List

from app.langchain_core.chains import run_reply, run_summary
from app.models.schemas import CallSummary
import logging

MAX_TURNS = 14  # safety valve: agent steers to a close after this

PRODUCT_BRIEF = """
Product: CloudDesk CRM by Sankar Group
What it does: One shared sales pipeline for the whole team, automatic
follow-up reminders, and WhatsApp integration — replaces messy Excel sheets.
Pricing: Growth plan at Rs 799 per user per month.
Target customer: Sales teams of ~10-20 people still tracking leads in Excel.
Differentiators: shared pipeline (no more version conflicts), WhatsApp
integration, automatic follow-up reminders, fast 5-minute setup.
Offer: Free live demo this week, no commitment.
"""

# NOTE: we REMOVED two things from the old prompt:
#   1. The "reply must be valid JSON with these keys" block. LangChain now forces
#      that shape for us using the AriaTurn class in chains.py.
#   2. The "Converted / Demo Requested ..." status rules. Those belong to the
#      call summary, and they already live in summary_prompt in chains.py.
SYSTEM_PROMPT = f"""You are Aria, a friendly and persuasive AI voice sales agent
for Sankar Group. You are on a live phone call selling CloudDesk CRM.

{PRODUCT_BRIEF}

Rules:
1. LANGUAGE MIRRORING: Speak the same language/mix the customer uses.
   If they speak Hinglish (e.g. "price kya hai"), reply in natural Hinglish,
   keeping product names in English. Default to simple English.
2. Keep replies SHORT (1-3 sentences) — this is a voice call, not an essay.
3. Be warm, not pushy. Ask about their current tool, listen, then pitch the
   matching feature.
4. OBJECTIONS:
   - "It's expensive / pricing?": Rs 799 per user/month, less than one lost
     lead; offer the free demo.
   - "We use Excel": messy at scale — shared pipeline, no version conflicts.
   - "Need to talk to my team": offer to email pricing + feature list and
     follow up in 2-3 days.
   - "Not interested": thank them politely and close gracefully.
5. If they ask for price or a demo, treat it as strong buying intent.
6. Never invent features or prices beyond the brief above.
"""


class SalesAgent:
    def __init__(self, customer_name: str = "Customer", language: str = "English"):
        self.customer_name = customer_name
        self.history: List[dict] = []   # user/assistant turns only
        self.buying_intent = 50
        self.sentiment = "Neutral"
        self.topic = "General"
        self.turn_count = 0

    # ---------- live conversation ----------

    def _system_text(self) -> str:
        """Build the system prompt text (the rules Aria must follow this turn)."""
        extra = f"\nCustomer name: {self.customer_name}."
        if self.turn_count >= MAX_TURNS:
            extra += (
                "\nWRAP UP NOW: the call has run long. Move toward a clear close — "
                "book the demo, send details, or end politely. Do not start new topics."
            )
        return SYSTEM_PROMPT + extra

    def generate_reply(self, customer_text: str) -> dict:
        """One conversation turn. Returns a packet ready to broadcast over WS."""
        self.turn_count += 1

        # IMPORTANT: we pass the history BEFORE adding the new customer message,
        # because run_reply() adds customer_text to the prompt by itself.
        # (If we added it first, the model would see the same sentence twice.)
        try:
            turn = run_reply(self._system_text(), self.history, customer_text)
            reply = turn.reply.strip() or "Sorry, could you say that again?"

            # smooth live signals so the % doesn't jump around
            self.buying_intent = round(0.6 * turn.buying_intent + 0.4 * self.buying_intent)
            self.sentiment = turn.sentiment
            self.topic = turn.topic
        except Exception:
            logging.exception("Groq reply failed")
            # If Groq fails even after all retries, the live call must NOT crash.
            # We say a safe sentence and keep the old signals.
            reply = "Sorry, could you say that again?"

        # Now we save both sides of this turn into the history.
        self.history.append({"role": "user", "content": customer_text})
        self.history.append({"role": "assistant", "content": reply})
        return {
            "sender": "ai",
            "text": reply,
            "buying_intent": self.buying_intent,
            "sentiment": self.sentiment,
            "topic": self.topic,
        }

    def opening_message(self) -> dict:
        text = (
            f"Hello {self.customer_name}! This is Aria from Sankar Group. "
            "I'm calling about CloudDesk CRM. Are you using any tool to manage "
            "your customers today?"
        )
        self.history.append({"role": "assistant", "content": text})
        return {"sender": "ai", "text": text, "buying_intent": self.buying_intent,
                "sentiment": self.sentiment, "topic": "General"}

    # ---------- end of call ----------

    def summarize_call(self) -> CallSummary:
        transcript = "\n".join(
            f"{'Aria' if m['role'] == 'assistant' else self.customer_name}: {m['content']}"
            for m in self.history
        )

        try:
            # The old "validate the enum" code is gone: CallAnalysis only allows
            # the six valid sales statuses, so the model cannot return a wrong one.
            payload = run_summary(transcript).model_dump()
        except Exception:
            logging.exception("Groq reply failed")
            # Safe fallback so the call record is still saved.
            payload = {
                "summary": "Summary could not be generated.",
                "requirements": "Unknown",
                "objections": "Unknown",
                "next_steps": "Review the transcript manually.",
                "sales_status": "Follow-up Required",
                "buying_intent": self.buying_intent,
                "sentiment": self.sentiment,
            }

        # Guardrail kept from the old code: "No Response" is only valid if the
        # customer never spoke. If they said even one thing, it is wrong.
        if any(m["role"] == "user" for m in self.history) and payload["sales_status"] == "No Response":
            payload["sales_status"] = "Interested"

        return CallSummary(**payload)

    def get_transcript(self) -> List[dict]:
        return self.history