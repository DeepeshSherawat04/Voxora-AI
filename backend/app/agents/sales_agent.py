"""
sales_agent.py - Aria, the live voice sales agent (powered by LangChain).

CHANGES IN THIS VERSION
    * FIX "Sorry, could you say that again?" loop: a failed/empty LLM reply is now retried once,
      and if it still fails Aria uses a context-aware fallback (Excel, price, demo, email...)
      instead of the same "say that again" line. The real error is logged loudly.
    * SMARTER: Aria now remembers facts (current tool, team size, price/demo interest), is told a
      conversation STAGE (discovery -> pitch -> close) and is told not to re-ask known things.
    * Rule 17 narrowed: short answers like "Excel", "yes", "I am" are VALID answers.
    * Prices are written the way they are SPOKEN ("799 rupees").
    * Everything else (email masking, guardrails, summary) is unchanged.
"""
import logging
import re
from typing import List

from app.langchain_core.chains import run_reply, run_summary
from app.models.schemas import CallSummary

MAX_TURNS = 14  # safety valve: agent steers to a close after this

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Facts we pull out of what the customer says (cheap regex, no LLM call)
TOOL_RE = re.compile(
    r"\b(excel|spreadsheets?|google sheets?|sheets?|zoho|hubspot|salesforce|pipedrive|"
    r"notebook|diary|register|paper)\b", re.IGNORECASE)
TEAM_RE = re.compile(
    r"\b(\d{1,3})\s*(?:people|persons|members|reps|salespeople|sales people|employees|users)\b",
    re.IGNORECASE)
PRICE_RE = re.compile(r"\b(price|pricing|cost|costs|kitna|rate|charges?)\b", re.IGNORECASE)
DEMO_RE = re.compile(r"\bdemo\b", re.IGNORECASE)
NO_INTEREST_RE = re.compile(r"\b(not interested|no thanks|no thank you|don'?t call|nahi chahiye)\b",
                            re.IGNORECASE)
EMAIL_WORD_RE = re.compile(r"\b(e-?mail|mail)\b", re.IGNORECASE)
YES_RE = re.compile(r"^\s*(yes|yeah|yep|sure|ok|okay|haan|ha|i am|i do|of course)\b", re.IGNORECASE)

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
17. UNCLEAR INPUT: ONLY if the message is truly garbled or clearly background
    chatter or a TV, say "Sorry, I didn't catch that - could you say it again?".
    Short answers such as "Excel", "yes", "I am", "about 10 people" or "price?"
    ARE clear: they answer your last question, so use them and move forward.
    Never guess a number, name or email from unclear speech.
18. ONE TURN ONLY: write only Aria's next line. Never write the customer's
    reply and never answer for them.
19. NEVER ASK THE SAME QUESTION TWICE. Read the chat and the "WHAT YOU ALREADY
    KNOW" line: if the customer has answered something, build on that answer
    (react to it, connect it to one CloudDesk feature) and ask a NEW question.
    If they answer "yes" or "I am" to your question, treat it as a yes.
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
        self.facts: dict = {}           # things the customer already told us
        self._fallback_count = 0        # rotates fallback lines so they never repeat

    # ---------- memory + stage (makes Aria smarter) ----------

    def _update_facts(self, text: str) -> None:
        m = TOOL_RE.search(text)
        if m:
            self.facts["current_tool"] = m.group(1).lower()
        m = TEAM_RE.search(text)
        if m:
            self.facts["team_size"] = m.group(1)
        if PRICE_RE.search(text):
            self.facts["asked_price"] = True
        if DEMO_RE.search(text):
            self.facts["wants_demo"] = True

    def _context_text(self) -> str:
        f = self.facts
        known = []
        if f.get("current_tool"):
            known.append(f"they currently track leads in {f['current_tool']}")
        if f.get("team_size"):
            known.append(f"their sales team has about {f['team_size']} people")
        if f.get("asked_price"):
            known.append("they asked about pricing")
        if f.get("wants_demo"):
            known.append("they are interested in a demo")

        text = ""
        if known:
            text += "\nWHAT YOU ALREADY KNOW (never ask for these again): " + "; ".join(known) + "."

        if f.get("wants_demo") or f.get("asked_price") or self.buying_intent >= 70:
            stage = ("CLOSE - they show buying interest. Offer the free demo this week and "
                     "get their email if it is not collected yet.")
        elif f.get("current_tool") and f.get("team_size"):
            stage = ("CLOSE - you know their tool and team size. Pitch the one best-matching "
                     "feature and offer the free demo this week.")
        elif f.get("current_tool"):
            stage = ("PITCH - connect the pain of their current tool to ONE matching feature, "
                     "then ask how big their sales team is.")
        else:
            stage = ("DISCOVERY - find out what they use today to track leads and how big "
                     "the team is, one question at a time.")
        text += f"\nCONVERSATION STAGE: {stage}"
        return text

    # ---------- live conversation ----------

    def _system_text(self) -> str:
        """Build the system prompt text (the rules Aria must follow this turn)."""
        extra = f"\nCustomer name: {self.customer_name}."
        if self.customer_email:
            extra += "\nCustomer email: COLLECTED. Do not ask for it again."
        else:
            extra += ("\nCustomer email: NOT collected yet. Ask for it before "
                      "promising to email anything.")
        extra += self._context_text()
        if self.turn_count >= MAX_TURNS:
            extra += (
                "\nWRAP UP NOW: the call has run long. Move toward a clear close - "
                "book the demo, send details, or end politely. Do not start new topics."
            )
        return SYSTEM_PROMPT + extra

    def _fallback_reply(self, text: str) -> str:
        """Used ONLY when the LLM fails twice. Context-aware, never 'say that again'."""
        self._fallback_count += 1
        f = self.facts

        if NO_INTEREST_RE.search(text):
            return "No problem at all, thanks for your time. Have a great day!"
        if EMAIL_WORD_RE.search(text) and not self.customer_email:
            return ASK_EMAIL_REPLY
        if PRICE_RE.search(text):
            return ("It's 799 rupees per user per month. "
                    "Want me to set up a free demo this week?")
        if DEMO_RE.search(text):
            if self.customer_email:
                return ("Great, our team will schedule a free demo this week "
                        "and I'll email you the details after the call.")
            return ASK_EMAIL_REPLY
        if f.get("current_tool"):
            if f.get("team_size"):
                return ("That's a good size for a shared pipeline. "
                        "Want a free demo this week to see it?")
            return (f"{f['current_tool'].capitalize()} works at first, but it gets messy as "
                    "the team grows. How many people are on your sales team?")
        if YES_RE.match(text):
            return "Great! What do you use today to track your leads?"

        defaults = [
            "Thanks for sharing that. How big is your sales team right now?",
            "Makes sense. What's the biggest headache with tracking leads today?",
            "Got it. Would a free demo this week be useful to see how it works?",
        ]
        return defaults[(self._fallback_count - 1) % len(defaults)]

    def generate_reply(self, customer_text: str) -> dict:
        """One conversation turn. Returns a packet ready to broadcast over WS."""
        self.turn_count += 1

        # Capture the email for follow-up, but NEVER let the raw address reach
        # the model or the history (it would start using the local-part as a name).
        found = EMAIL_RE.search(customer_text)
        if found:
            self.customer_email = found.group(0).strip()
        history_text = EMAIL_RE.sub("[email address provided]", customer_text)
        self._update_facts(history_text)

        # history is passed BEFORE the new customer message; run_reply() adds it itself.
        reply = ""
        for attempt in (1, 2):
            try:
                turn = run_reply(self._system_text(), self.history, history_text)
                candidate = (turn.reply or "").strip()
                if not candidate:
                    logging.error("LLM returned an EMPTY reply (attempt %d)", attempt)
                    continue
                reply = candidate
                # smooth live signals so the % doesn't jump around
                self.buying_intent = round(0.6 * turn.buying_intent + 0.4 * self.buying_intent)
                self.sentiment = turn.sentiment
                self.topic = turn.topic
                break
            except Exception:
                # Look for this line in the uvicorn terminal: the traceback is the REAL cause.
                logging.exception("Groq reply failed (attempt %d)", attempt)

        if not reply:
            # Never crash a live call, and never repeat "say that again".
            reply = self._fallback_reply(history_text)

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