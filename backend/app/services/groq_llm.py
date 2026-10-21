# backend/app/services/groq_llm.py
import json
import time
from typing import List, Optional

from groq import Groq, RateLimitError

from app.config import settings

client = Groq(api_key=settings.GROQ_API_KEY)


def _clean_json(text: str) -> dict:
    """Groq sometimes wraps JSON in markdown fences — strip them."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text)


def chat_json(
    messages: List[dict],
    model: Optional[str] = None,
    temperature: float = 0.6,
    max_retries: int = 3,
) -> dict:
    """Chat with Groq, force JSON output, return parsed dict."""
    model = model or settings.GROQ_MODEL
    last_err = None

    for attempt in range(max_retries):
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                response_format={"type": "json_object"},
            )
            return _clean_json(resp.choices[0].message.content)
        except RateLimitError as e:
            last_err = e
            time.sleep(2 ** attempt)  # 1s, 2s, 4s backoff
        except Exception as e:
            last_err = e
            time.sleep(1)

    raise RuntimeError(f"Groq call failed after {max_retries} tries: {last_err}")