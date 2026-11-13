"""
chains.py - prompts, structured output and chains for Aria.

    1. reply_chain   -> what Aria says on the live call
    2. summary_chain -> the end-of-call summary

WHAT CHANGED (fixes `tool_use_failed` / "Tool choice is required, but model did not call a tool"):
    OLD: .with_structured_output(Schema)  -> Groq FORCES a tool call; models sometimes answer in
         plain text instead, Groq returns HTTP 400, the retry wrapper repeats it (slow) and Aria
         falls back to "Sorry, could you say that again?".
    NEW: structured(llm, Schema) from llm.py -> Groq's native JSON-schema "Structured Outputs"
         (supported on gpt-oss), with automatic fallback to plain JSON mode. No tool call involved.
         JSON mode REQUIRES the word "JSON" and the keys to be described in the prompt, so the
         format rules below are added to the system message.
    ALSO: replies use low reasoning effort and a token cap, so the voice answer starts sooner.
"""

from typing import List, Literal

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from pydantic import BaseModel, Field

from app.langchain_core.llm import REPLY_MODEL, add_retries, get_llm, structured


# ---------------------------------------------------------------------------
# 1. OUTPUT SHAPES
# ---------------------------------------------------------------------------

class AriaTurn(BaseModel):
    """One turn of the live call: what Aria says + live signals for the UI."""

    reply: str = Field(description="What Aria says aloud. 1-2 short, natural sentences.")
    sentiment: Literal["Positive", "Neutral", "Negative"]
    topic: Literal["Pricing", "Features", "Demo", "Objection", "General"]
    buying_intent: int = Field(ge=0, le=100, description="How likely the customer is to buy, 0-100.")


# Old name kept so any other import of VeerTurn keeps working.
VeerTurn = AriaTurn


class CallAnalysis(BaseModel):
    """The end-of-call report."""

    summary: str = Field(description="2-3 sentence summary of the conversation.")
    requirements: str = Field(description="What the customer needs, comma separated.")
    objections: str = Field(description="Customer concerns, comma separated, or 'None'.")
    next_steps: str = Field(description="Agreed follow-up actions.")
    sales_status: Literal[
        "Converted", "Interested", "Follow-up Required",
        "Not Interested", "Demo Requested", "No Response",
    ]
    buying_intent: int = Field(ge=0, le=100, description="Final buying intent score.")
    sentiment: Literal["Positive", "Neutral", "Negative"]


# ---------------------------------------------------------------------------
# 2. FORMAT RULES (required by JSON mode) + PROMPT TEMPLATES
# ---------------------------------------------------------------------------
# These are passed in as {format_rules} VARIABLES, so the braces inside are plain text.

REPLY_FORMAT = """OUTPUT FORMAT: respond with ONE JSON object and nothing else (no markdown, no text
before or after). Use exactly these keys:
  "reply": string - ONLY Aria's next line, spoken aloud, one or two short sentences.
           Never write the customer's lines and never continue the conversation yourself.
  "sentiment": "Positive" | "Neutral" | "Negative"   (the customer's mood)
  "topic": "Pricing" | "Features" | "Demo" | "Objection" | "General"
  "buying_intent": integer from 0 to 100"""

SUMMARY_FORMAT = """OUTPUT FORMAT: respond with ONE JSON object and nothing else (no markdown). Keys:
  "summary": string, 2-3 sentences
  "requirements": string, comma separated
  "objections": string, comma separated, or "None"
  "next_steps": string
  "sales_status": one of "Converted" | "Interested" | "Follow-up Required" |
                  "Not Interested" | "Demo Requested" | "No Response"
  "buying_intent": integer 0-100
  "sentiment": "Positive" | "Neutral" | "Negative" """

reply_prompt = ChatPromptTemplate.from_messages([
    ("system", "{system_prompt}\n\n{format_rules}"),
    MessagesPlaceholder("history"),          # the whole earlier chat
    ("human", "{customer_text}"),
])

summary_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You analyse sales call transcripts. Base everything ONLY on the transcript. "
     "'Converted' only if the customer clearly agreed to buy. "
     "'Demo Requested' if they agreed to a demo. "
     "'Follow-up Required' if they want to think or talk to their team. "
     "'No Response' ONLY if the customer said nothing at all.\n\n{format_rules}"),
    ("human", "TRANSCRIPT:\n{transcript}"),
])


# ---------------------------------------------------------------------------
# 3. THE CHAINS
# ---------------------------------------------------------------------------
# ORDER MATTERS: add_retries() goes AFTER with_structured_output.

# Voice reply: friendly (0.5), short answer, minimal "thinking" for speed.
reply_chain = reply_prompt | add_retries(
    structured(get_llm(0.5, model=REPLY_MODEL, max_tokens=700, reasoning_effort="low"), AriaTurn)
)

# Summary: serious and repeatable (0.1); runs once at the end of the call.
summary_chain = summary_prompt | add_retries(
    structured(get_llm(0.1, max_tokens=900, reasoning_effort="low"), CallAnalysis)
)


# ---------------------------------------------------------------------------
# 4. HELPERS (what the rest of the app calls) - signatures unchanged
# ---------------------------------------------------------------------------

def run_reply(system_prompt: str, history: List[dict], customer_text: str) -> AriaTurn:
    """Get Aria's next reply."""
    return reply_chain.invoke({
        "system_prompt": system_prompt,
        "format_rules": REPLY_FORMAT,
        "history": history,
        "customer_text": customer_text,
    })


def run_summary(transcript: str) -> CallAnalysis:
    """Turn a full call transcript into a structured CallAnalysis."""
    return summary_chain.invoke({"format_rules": SUMMARY_FORMAT, "transcript": transcript})


# Quick test:  python -m app.langchain_core.chains
if __name__ == "__main__":
    turn = run_reply(
        system_prompt="You are Aria, a short and friendly sales agent for CloudDesk CRM.",
        history=[],
        customer_text="price kya hai?",
    )
    print(turn)