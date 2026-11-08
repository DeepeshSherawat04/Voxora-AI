"""
chains.py  -  STEP 2 of LangChain: prompts, structured output and chains.

This file rebuilds the two LLM calls from the old sales_agent.py the LangChain way:
    1. reply_chain   -> what Aria says on the live call
    2. summary_chain -> the end-of-call summary

The old way:   write JSON instructions in the prompt, call the API, parse text
               by hand, hope the JSON is valid.
The new way:   describe the answer shape with a Pydantic class and LangChain
               forces the model to follow it. No manual JSON parsing.

THE ONE IDEA TO REMEMBER:
    chain = prompt | model | parser
    Read it left to right: fill the prompt -> send to model -> clean the output.
"""

from typing import List, Literal

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from pydantic import BaseModel, Field

from app.langchain_core.llm import add_retries, get_llm


# ---------------------------------------------------------------------------
# 1. OUTPUT SHAPES  (Pydantic classes)
# ---------------------------------------------------------------------------
# A Pydantic class is just a "form" with named fields and allowed values.
# LangChain shows this form to the model and checks the answer against it.
# If the model returns something wrong (e.g. sentiment = "Happy"), it is caught.

class AriaTurn(BaseModel):
    """One turn of the live call: what Aria says + live signals for the UI."""

    reply: str = Field(description="What Aria says aloud. 1-3 short, natural sentences.")
    sentiment: Literal["Positive", "Neutral", "Negative"]
    topic: Literal["Pricing", "Features", "Demo", "Objection", "General"]
    buying_intent: int = Field(ge=0, le=100, description="How likely the customer is to buy, 0-100.")


class CallAnalysis(BaseModel):
    """The end-of-call report. Same fields as the old summarize_call()."""

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
# 2. PROMPT TEMPLATES
# ---------------------------------------------------------------------------
# A prompt template is a message with "holes" like {customer_name} that get
# filled in at run time.
#
# WATCH OUT: curly braces { } mean "a hole" in a template. Our long system
# prompt has braces inside it, so we do NOT paste it directly. We pass it in
# as a variable called {system_prompt} - then its braces are treated as plain text.

reply_prompt = ChatPromptTemplate.from_messages([
    ("system", "{system_prompt}"),
    # MessagesPlaceholder = "put the whole earlier chat history here".
    # This is how the model remembers what was said before in the call.
    MessagesPlaceholder("history"),
    ("human", "{customer_text}"),
])

summary_prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You analyse sales call transcripts. Base everything ONLY on the transcript. "
     "'Converted' only if the customer clearly agreed to buy. "
     "'Demo Requested' if they agreed to a demo. "
     "'Follow-up Required' if they want to think or talk to their team. "
     "'No Response' ONLY if the customer said nothing at all."),
    ("human", "TRANSCRIPT:\n{transcript}"),
])


# ---------------------------------------------------------------------------
# 3. THE CHAINS
# ---------------------------------------------------------------------------
# .with_structured_output(AriaTurn) = "make the model answer in this exact form".
# The result is an AriaTurn object, not a messy string.
#
# ORDER MATTERS: we add .with_retry() AFTER with_structured_output,
# because a retry-wrapper can no longer be given an output shape.

# Friendly voice -> a bit of creativity (temperature 0.5)
reply_chain = reply_prompt | add_retries(get_llm(0.5).with_structured_output(AriaTurn))

# Summary -> we want serious and repeatable (temperature 0.1)
summary_chain = summary_prompt | add_retries(get_llm(0.1).with_structured_output(CallAnalysis))


# ---------------------------------------------------------------------------
# 4. HELPER FUNCTIONS (what the rest of the app calls)
# ---------------------------------------------------------------------------

def run_reply(system_prompt: str, history: List[dict], customer_text: str) -> AriaTurn:
    """
    Get Aria's next reply.

    history = the old list of {"role": "user"/"assistant", "content": "..."}.
              LangChain understands this format directly.
    .invoke() = "run this chain once with these inputs and give me the result".
    """
    return reply_chain.invoke({
        "system_prompt": system_prompt,
        "history": history,
        "customer_text": customer_text,
    })


def run_summary(transcript: str) -> CallAnalysis:
    """Turn a full call transcript into a structured CallAnalysis."""
    return summary_chain.invoke({"transcript": transcript})


# Quick test:  python -m app.langchain_core.chains
if __name__ == "__main__":
    turn = run_reply(
        system_prompt="You are Aria, a short and friendly sales agent for CloudDesk CRM.",
        history=[],
        customer_text="price kya hai?",
    )
    print(turn)  # -> AriaTurn(reply='...', sentiment='Neutral', topic='Pricing', buying_intent=60)