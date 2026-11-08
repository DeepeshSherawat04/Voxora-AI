"""
llm.py  -  STEP 1 of LangChain: create the "model" object.

WHAT IS LANGCHAIN?
    LangChain is a toolbox that gives every AI building block (model, prompt,
    parser, tool, retriever) the SAME simple shape. Because they all share the
    same shape, we can snap them together like LEGO bricks using the "|" sign.

WHAT IS A "CHAT MODEL" IN LANGCHAIN?
    It is a Python object that wraps an LLM (here: Groq's gpt-oss-120b).
    You give it structured messages, it gives you an structured message back with metadata added. That's it.

WHY A SEPARATE FILE?
    So the model is created in ONE place. IF we want to change the model name
    or temperature later, we change it here and every agent gets the update.
"""

from langchain_groq import ChatGroq

from app.config import settings  # reads GROQ_API_KEY from our .env file

# The model name comes from our .env / config.py (settings.GROQ_MODEL),
# the same value the old groq_llm.py used. Change it in ONE place there.
MODEL_NAME = settings.GROQ_MODEL


def get_llm(temperature: float = 0.4) -> ChatGroq:
    """
    Build and return a LangChain chat model that talks to Groq.

    temperature = how "creative" the model is.
        0.0 -> very serious and repeatable (good for summaries / classification)
        0.7 -> more natural and varied (good for a friendly sales voice)
    """
    return ChatGroq(
        model=MODEL_NAME,
        temperature=temperature,
        api_key=settings.GROQ_API_KEY,
        # max_retries=0 because we add our OWN retry rule later using .with_retry()
        # (so we can see and control it ourselves instead of hiding it inside the client).
        max_retries=0,
    )


def add_retries(runnable):
    """
    Wrap an LangChain "runnable" (model, chain, ...) so it retries on failure.

    WHAT IS A RUNNABLE?
        Anything in LangChain that has .invoke(). Models, prompts, parsers and
        whole chains are ALL runnables - that is why they can be chained.

    WHY RETRY?
        Groq sometimes returns a "429 rate limit" error for a moment.
        On a live phone call we cannot crash, so we just try again.

    wait_exponential_jitter = wait a little longer after each failure
        (about 1s, 2s, 4s...) plus a tiny random delay, so many users do not
        retry at the exact same moment.
    """
    return runnable.with_retry(
        stop_after_attempt=3,        # try at most 3 times in total
        wait_exponential_jitter=True,
    )