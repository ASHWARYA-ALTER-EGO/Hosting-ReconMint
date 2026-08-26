"""
ReconMint LLM provider layer (Day 7).

The single place the app talks to a language model. Provider and model are chosen by environment
variable so you can switch later without touching call sites:

    RECONMINT_LLM_PROVIDER = openai        (only provider wired today)
    RECONMINT_LLM_MODEL    = gpt-4o-mini   (cheapest default)

Every call returns token usage, latency, and an estimated USD cost so the audit log can show
exactly what each AI decision cost. A tiny dependency-free .env loader means `python scripts/...`
just works without exporting variables.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def load_dotenv(path: str | None = None) -> None:
    """Minimal .env loader: sets os.environ for KEY=VALUE lines it hasn't already got."""
    path = path or os.path.join(_ROOT, ".env")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip()
            os.environ.setdefault(key, val)


load_dotenv()

DEFAULT_PROVIDER = os.environ.get("RECONMINT_LLM_PROVIDER", "openai")
DEFAULT_MODEL = os.environ.get("RECONMINT_LLM_MODEL", "gpt-4o-mini")

# USD per 1M tokens (input, output). Update if pricing changes; used only for the cost estimate.
PRICING: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4.1-nano": (0.10, 0.40),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4o": (2.50, 10.00),
}


@dataclass
class LLMResponse:
    text: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: float
    cost_usd: float


def _estimate_cost(model: str, in_tok: int, out_tok: int) -> float:
    price = PRICING.get(model)
    if not price:
        return 0.0
    return round(in_tok / 1_000_000 * price[0] + out_tok / 1_000_000 * price[1], 8)


class LLMError(RuntimeError):
    pass


def chat(system: str, user: str, *, model: str | None = None,
         temperature: float = 0.0, max_tokens: int = 300, json_mode: bool = True) -> LLMResponse:
    """Send a system+user prompt and return the completion with usage/cost/latency."""
    provider = DEFAULT_PROVIDER
    model = model or DEFAULT_MODEL

    if provider != "openai":
        raise LLMError(f"Provider '{provider}' not wired. Set RECONMINT_LLM_PROVIDER=openai.")

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise LLMError("OPENAI_API_KEY not set (put it in .env).")

    try:
        from openai import OpenAI
    except ImportError as e:
        raise LLMError("openai package not installed; pip install -r requirements.txt") from e

    client = OpenAI(api_key=api_key, timeout=8.0)
    kwargs = dict(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    t0 = time.perf_counter()
    resp = client.chat.completions.create(**kwargs)
    latency_ms = round((time.perf_counter() - t0) * 1000, 1)

    text = resp.choices[0].message.content or ""
    usage = resp.usage
    in_tok = usage.prompt_tokens if usage else 0
    out_tok = usage.completion_tokens if usage else 0

    return LLMResponse(
        text=text,
        model=model,
        input_tokens=in_tok,
        output_tokens=out_tok,
        latency_ms=latency_ms,
        cost_usd=_estimate_cost(model, in_tok, out_tok),
    )
