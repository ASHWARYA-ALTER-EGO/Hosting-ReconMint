"""
ReconMint configuration.

Single source of truth for tunable constants so nothing is hardcoded across the engine. Values can
be overridden by environment variable, which is what makes the amount tolerance user-configurable
without a code change.
"""

from __future__ import annotations

import os


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


# --- fee reconstruction ---
FEE_TOLERANCE_PAISE: int = _int_env("RECONMINT_FEE_TOLERANCE_PAISE", 1)

# --- fuzzy matching gates + scoring ---
AMOUNT_TOLERANCE_PAISE: int = _int_env("RECONMINT_AMOUNT_TOLERANCE_PAISE", 100)  # +/- Rs.1
DATE_WINDOW_DAYS: int = _int_env("RECONMINT_DATE_WINDOW_DAYS", 3)                # T+0..T+3
W_AMOUNT: float = _float_env("RECONMINT_W_AMOUNT", 0.50)
W_UTR: float = _float_env("RECONMINT_W_UTR", 0.40)
W_DATE: float = _float_env("RECONMINT_W_DATE", 0.10)
ACCEPT_THRESHOLD: float = _float_env("RECONMINT_ACCEPT_THRESHOLD", 0.85)

# --- exception severity thresholds ---
# a fee anomaly at or below this magnitude is a warning (likely rounding), above it is critical
SEVERITY_MATERIAL_PAISE: int = _int_env("RECONMINT_SEVERITY_MATERIAL_PAISE", 100)  # Rs.1

# --- LLM ---
LLM_PROVIDER: str = os.environ.get("RECONMINT_LLM_PROVIDER", "openai")
LLM_MODEL: str = os.environ.get("RECONMINT_LLM_MODEL", "gpt-4o-mini")

# --- upload / validation limits (used by the API layer) ---
MAX_UPLOAD_BYTES: int = _int_env("RECONMINT_MAX_UPLOAD_BYTES", 25 * 1024 * 1024)  # 25 MB
