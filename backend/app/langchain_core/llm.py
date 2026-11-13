"""
llm.py  -  STEP 1 of LangChain: create the "model" object.

A LangChain "model" is just a Python object that can talk to an AI model.
Here we build one for Groq (the company that hosts the model for us).

What this file gives you:
  get_llm()      -> makes the Groq model object
  add_retries()  -> wraps a model/chain so it tries again if Groq is busy
  structured()   -> makes the model answer in a fixed JSON shape (a Pydantic class)

get_llm() settings:
  temperature       -> 0 = very predictable, higher = more creative
  model             -> which Groq model to use (default: MODEL_NAME below)
  max_tokens        -> maximum length of the answer (None = no limit)
  reasoning_effort  -> how hard a "thinking" model should think
                       ("low", "medium", "high"). Only sent to models that
                       can use it - other models just ignore this setting.
"""

from groq import APIConnectionError, APITimeoutError, RateLimitError
from langchain_groq import ChatGroq
from pydantic import BaseModel

from app.config import settings  # reads GROQ_API_KEY from our .env file

# --- Model choices -----------------------------------------------------------
MODEL_NAME = settings.GROQ_MODEL          # big model: end-of-call summary
REPLY_MODEL = getattr(settings, "GROQ_REPLY_MODEL", "llama-3.1-8b-instant")

# Models on Groq that really accept reasoning_effort.
# If the model name contains any of these words, we can send reasoning_effort.
_REASONING_MARKERS = ("gpt-oss", "deepseek-r1", "qwq", "kimi-k2", "magistral", "mimo")


def _supports_reasoning(model: str) -> bool:
    """True if this model can use reasoning_effort, False if it cannot."""
    return any(k in model.lower() for k in _REASONING_MARKERS)


def get_llm(temperature: float = 0.4,
            model: str | None = None,
            max_tokens: int | None = None,
            reasoning_effort: str | None = None) -> ChatGroq:
    """Build the Groq model object (see the file docstring for the settings)."""
    chosen = model or MODEL_NAME     # use the model we were given, else the default

    kwargs = dict(
        model=chosen,
        temperature=temperature,
        max_tokens=max_tokens,
        api_key=settings.GROQ_API_KEY,
        max_retries=0,               # our own retry rules via add_retries() instead
    )

    # Only send reasoning_effort to models that can use it.
    # Other models (like llama-3.1-8b-instant) would give an error, so we skip it.
    if reasoning_effort and _supports_reasoning(chosen):
        try:
            # Newer langchain-groq: reasoning_effort is a normal parameter.
            return ChatGroq(reasoning_effort=reasoning_effort, **kwargs)
        except TypeError:
            # Older langchain-groq: pass it straight through to the Groq API.
            kwargs["model_kwargs"] = {"reasoning_effort": reasoning_effort}

    return ChatGroq(**kwargs)


def add_retries(runnable):
    """2 attempts max; only rate-limit (429) / network / timeout errors retry."""
    return runnable.with_retry(
        stop_after_attempt=2,
        retry_if_exception_type=(RateLimitError, APIConnectionError, APITimeoutError),
        wait_exponential_jitter=True,
    )


def structured(runnable, schema: type[BaseModel]):
    """
    Groq native Structured Outputs (response_format=json_schema) - NO tool call,
    so the 400 "Tool choice is required" / `tool_use_failed` bug is gone.
    Falls back to plain json_mode on older langchain-groq versions.
    No retries here - the caller wraps add_retries() around the result.
    """
    try:
        return runnable.with_structured_output(schema, method="json_schema")
    except (TypeError, ValueError):
        return runnable.with_structured_output(schema, method="json_mode")