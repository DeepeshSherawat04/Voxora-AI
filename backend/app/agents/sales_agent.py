"""
sales_agent.py - Aria, the live voice sales agent (powered by LangChain).

CHANGES IN THIS VERSION
    * Prices are written the way they are SPOKEN ("799 rupees"), because the TTS reads "Rs 799"
      letter by letter. The old PRODUCT_BRIEF / rule 4 contradicted rule 16 and the model copied them.
    * Rules 2 and 15 (short replies) merged; rule numbering otherwise unchanged.
    * Shorter, human greeting (less audio to synthesise = faster first words).
    * Everything else (email masking, guardrails, summary) is unchanged.
"""
import logging
import re
from typing import List

from app.langchain_core.chains import run_reply, run_summary
from app.models.schemas import CallSummary

MAX_TURNS = 14  # safety valve: agent steers to a close after this

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Replies that promise an email
PROMISE_RE = re.compile(
    r"\b(e-?mail|mail)\b.*\b(you|details|pricing|overview)\b"
    r"|\b(send|share)\b.*\b(details|pricing|overview)\b",
    re.IGNORECASE,
)
ASK_EMAIL_REPLY = "Sure! What's the best email address to send the details to?"

PRODUCT_BRIEF = """
Product: CloudDesk CRM by Voxora AI
What it does: One shared sales pipeline for the whole team, automatic
follow-up reminders, and WhatsApp integration - replaces messy Excel sheets.
Pricing: Growth plan at 799 rupees per user per month.
Target customer: Sales teams of ~10-20 people still tracking leads in Excel.
Differentiators: shared pipeline (no more version conflicts), WhatsApp
integration, automatic follow-up reminders, fast 5-minute setup.
Offer: Free live demo this week, no commitment.
"""

SYSTEM_PROMPT = f"""You are Aria, a friendly and persuasive AI voice sales agent
for Voxora AI. You are on a live phone call selling CloudDesk CRM.

{PRODUCT_BRIEF}

Rules:
1. LANGUAGE MIRRORING: Speak the same language/mix the customer uses.
   If they speak Hinglish (e.g. "price kya hai"), reply in natural Hinglish,
   keeping product names in English. Default to simple English.
2. KEEP IT SHORT: one or two short sentences, under about 30 words. This is a
   voice call, not an essay, and the customer must be able to interrupt easily.
3. Be warm, not pushy. Ask about their current tool, listen, then pitch the
   matching feature.
4. OBJECTIONS:
   - "It's expensive / pricing?": 799 rupees per user per month, less than one
     lost lead; offer the free demo.
   - "We use Excel": messy at scale - shared pipeline, no version conflicts.
   - "Need to talk to my team": offer to email pricing + feature list and
     follow up in 2-3 days (only after you have their email, see rule 11).
   - "Not interested": thank them politely and close gracefully.
5. If they ask for price or a demo, treat it as strong buying intent.
6. Never invent features or prices beyond the brief above.
7. This is a VOICE call only. You cannot share your screen, run a live demo, or show anything on this call.
8. Never mention links. Never say you have sent anything. Details will be emailed to the customer after the call.
9. If the customer wants the demo "now", say our team will schedule a free demo this week and the details will be emailed.
10. Do not repeat the customer's email address back to them.
11. EMAIL FIRST: Never promise to email anything unless the line "Customer email"
    at the end of this prompt says it is already collected. If the customer asks
    for details by email and it is NOT collected, your ONLY reply is to ask for
    their email address, e.g. "Sure! What's the best email address to send it to?"
    Do not promise or confirm sending anything yet.
12. Once the email is collected, briefly confirm you'll send the details after
    the call and follow up in a few days. Never ask for the email again.
13. ADDRESS THE CUSTOMER ONLY by the exact name in "Customer name" above.
    Their email address is private data: never read a name out of it, and
    never call them anything other than the given name.
14. SPEAK LIKE A PERSON ON THE PHONE: use contractions (I'm, we've, that's), plain
    words, and ONE question at a time. Never use lists, markdown, emojis, or
    headings. Vary how you start replies; don't begin every reply with "Got it".
15. SAY NUMBERS AND PRICES FOR SPEECH: say "799 rupees per user per month", never
    "Rs 799/user/month". Write words, not symbols.
16. CORRECTIONS AND INTERRUPTIONS: if the customer corrects something they said
    earlier (for example team size) or interrupts you, acknowledge it briefly
    ("Thanks for clarifying" or "Got it, 8 people then") and answer using the NEW
    information. Never argue, never repeat the old answer, and don't finish your
    previous sentence.
17. UNCLEAR OR NOISY INPUT: if the customer's message is garbled, unrelated to the
    conversation, or looks like background chatter or a TV, don't answer it as if
    it were real. Say "Sorry, I didn't catch that - could you say it again?"
    Never guess a number, name or email from unclear speech; ask them to repeat it.
18. ONE TURN ONLY: write only Aria's next line. Never write the customer's
    reply and never answer for them.
"""


class SalesAgent:
    def __init__(self, customer_name: str = "Customer", language: str = "English",
                 customer_email: str = ""):
        self.customer_name = customer_name
        self.customer_email = (customer_email or "").strip()   # form value = fallback
        self.history: List[dict] = []   # user/assistant turns only
        self.buying_intent = 50
        self.sentiment = "Neutral"
        self.topic = "General"
        self.turn_count = 0

    # ---------- live conversation ----------

    def _system_text(self) -> str:
        """Build the system prompt text (the rules Aria must follow this turn)."""
        extra = f"\nCustomer name: {self.customer_name}."
        if self.customer_email:
            extra += "\nCustomer email: COLLECTED. Do not ask for it again."
        else:
            extra += ("\nCustomer email: NOT collected yet. Ask for it before "
                      "promising to email anything.")
        if self.turn_count >= MAX_TURNS:
            extra += (
                "\nWRAP UP NOW: the call has run long. Move toward a clear close - "
                "book the demo, send details, or end politely. Do not start new topics."
            )
        return SYSTEM_PROMPT + extra

    def generate_reply(self, customer_text: str) -> dict:
        """One conversation turn. Returns a packet ready to broadcast over WS."""
        self.turn_count += 1

        # Capture the email for follow-up, but NEVER let the raw address reach
        # the model or the history (it would start using the local-part as a name).
        found = EMAIL_RE.search(customer_text)
        if found:
            self.customer_email = found.group(0).strip()
        history_text = EMAIL_RE.sub("[email address provided]", customer_text)

        # history is passed BEFORE the new customer message; run_reply() adds it itself.
        try:
            turn = run_reply(self._system_text(), self.history, history_text)
            reply = turn.reply.strip() or "Sorry, could you say that again?"

            # smooth live signals so the % doesn't jump around
            self.buying_intent = round(0.6 * turn.buying_intent + 0.4 * self.buying_intent)
            self.sentiment = turn.sentiment
            self.topic = turn.topic
        except Exception:
            logging.exception("Groq reply failed")
            # Never crash a live call: say a safe sentence and keep the old signals.
            reply = "Sorry, could you say that again?"

        # Guardrail: never promise an email we have no address for
        if not self.customer_email and "?" not in reply and PROMISE_RE.search(reply):
            reply = ASK_EMAIL_REPLY

        self.history.append({"role": "user", "content": history_text})
        self.history.append({"role": "assistant", "content": reply})
        return {
            "sender": "ai",
            "text": reply,
            "buying_intent": self.buying_intent,
            "sentiment": self.sentiment,
            "topic": self.topic,
        }

    def opening_message(self) -> dict:
        # Static text (no LLM call) and short, so the first words are heard quickly.
        text = (
            f"Hi {self.customer_name}, this is Aria from Voxora AI. "
            "Quick question - how are you managing your customer leads today?"
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
            payload = run_summary(transcript).model_dump()
        except Exception:
            logging.exception("Groq summary failed")
            payload = {
                "summary": "Summary could not be generated.",
                "requirements": "Unknown",
                "objections": "Unknown",
                "next_steps": "Review the transcript manually.",
                "sales_status": "Follow-up Required",
                "buying_intent": self.buying_intent,
                "sentiment": self.sentiment,
            }

        # "No Response" is only valid if the customer never spoke.
        if any(m["role"] == "user" for m in self.history) and payload["sales_status"] == "No Response":
            payload["sales_status"] = "Interested"

        return CallSummary(**payload)

    def get_transcript(self) -> List[dict]:
        return self.history