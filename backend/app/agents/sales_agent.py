# backend/app/agents/sales_agent.py
from typing import List

from app.models.schemas import CallSummary, SalesStatus
from app.services.groq_llm import chat_json

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

"Converted" only if they clearly agreed to buy/sign up. "Demo Requested"
if they agreed to a demo. "Follow-up Required" if they asked to think about it
or talk to their team. "No Response" ONLY if the customer said nothing at all
or hung up before engaging — if they answered even one question, never use it.
Base everything ONLY on the transcript.

Every reply MUST be valid JSON with exactly these keys:
{{
  "reply": "what you say aloud, short and natural",
  "sentiment": "Positive" | "Neutral" | "Negative",
  "topic": "Pricing" | "Features" | "Demo" | "Objection" | "General",
  "buying_intent": integer 0-100
}}
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

    def _system(self) -> dict:
        extra = f"\nCustomer name: {self.customer_name}."
        if self.turn_count >= MAX_TURNS:
            extra += (
                "\nWRAP UP NOW: the call has run long. Move toward a clear close — "
                "book the demo, send details, or end politely. Do not start new topics."
            )
        return {"role": "system", "content": SYSTEM_PROMPT + extra}

    def generate_reply(self, customer_text: str) -> dict:
        """One conversation turn. Returns a packet ready to broadcast over WS."""
        self.turn_count += 1
        self.history.append({"role": "user", "content": customer_text})

        payload = chat_json([self._system()] + self.history)
        reply = payload.get("reply", "").strip() or "Sorry, could you say that again?"

        # smooth live signals so the % doesn't jump around
        try:
            self.buying_intent = round(
                0.6 * int(payload["buying_intent"]) + 0.4 * self.buying_intent
            )
        except (KeyError, ValueError):
            pass
        self.sentiment = payload.get("sentiment", self.sentiment)
        self.topic = payload.get("topic", self.topic)

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
        prompt = f"""Analyze this sales call transcript and return valid JSON
with exactly these keys:
{{
  "summary": "2-3 sentence summary of the conversation",
  "requirements": "what the customer needs, comma separated",
  "objections": "their objections or concerns, comma separated (or 'None')",
  "next_steps": "agreed follow-up actions",
  "sales_status": one of: Converted | Interested | Follow-up Required |
                    Not Interested | Demo Requested | No Response,
  "buying_intent": integer 0-100 (final score),
  "sentiment": "Positive" | "Neutral" | "Negative"
}}
Rules: "Converted" only if they clearly agreed to buy/sign up. "Demo Requested"
if they agreed to a demo. "Follow-up Required" if they asked to think about it
or talk to their team. Base everything ONLY on the transcript.

TRANSCRIPT:
{transcript}"""

        payload = chat_json(
            [{"role": "user", "content": prompt}],
            temperature=0.3,
        )

        # validate the enum — fall back to Follow-up Required if model drifts
        try:
            payload["sales_status"] = SalesStatus(payload["sales_status"]).value
        except ValueError:
            payload["sales_status"] = "Follow-up Required"
            
        if any(m["role"] == "user" for m in self.history) and payload["sales_status"] == "No Response":
            payload["sales_status"] = "Interested"

        return CallSummary(**payload)

    def get_transcript(self) -> List[dict]:
        return self.history