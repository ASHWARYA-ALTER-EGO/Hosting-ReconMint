"""
ReconMint hallucination verifier (Day 7).

The guardrail that makes it safe to put an LLM anywhere near money. Every rupee figure in an LLM
explanation must trace back to a number we actually computed. If the model invents a value, the
explanation is rejected and the deterministic explanation is used instead. This is the concrete
"AI Judgment" story: the LLM may phrase things, but it may not fabricate a single rupee.

Approach: extract candidate rupee amounts from the explanation text (values tagged with Rs./INR/
the rupee sign, or written with two decimals), then confirm each is present - to the paise - in the
allowed set of computed numbers for that record. Percentages and bare counts are ignored.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# match Rs. 1,234.56 / INR 1234 / the rupee sign, OR a standalone 2-decimal number like 4171.85
_RUPEE_RE = re.compile(
    r"(?:(?:₹|\bRs\.?|\bINR)\s*([0-9][0-9,]*(?:\.[0-9]+)?))"
    r"|(?<![%\d.])\b([0-9][0-9,]*\.[0-9]{2})\b"
)


@dataclass
class VerifyResult:
    ok: bool
    offending: list[float]
    extracted: list[float]


def _to_float(raw: str) -> float:
    return round(float(raw.replace(",", "")), 2)


def allowed_amounts_from_row(row) -> set[float]:
    """The set of rupee MAGNITUDES (2dp, absolute) legitimately derivable from a settlement record.

    We compare magnitudes so that a correct signed figure (e.g. a negative net of -39.91) is not
    falsely rejected over sign formatting; a fabricated value still won't match any real magnitude.
    """
    def mag(paise_key: str) -> float:
        return round(abs(int(row.get(paise_key, 0))) / 100, 2)

    vals = {
        mag("gross_paise"), mag("mdr_paise"), mag("gst_paise"), mag("tcs_paise"),
        mag("refund_paise"), mag("chargeback_paise"), mag("expected_net_paise"),
        mag("reported_net_paise"), mag("deduction_paise"), mag("net_gap_paise"),
    }
    # the fee subtotal (mdr+gst+tcs) is a legitimately derived figure the model may state
    subtotal = abs(int(row.get("mdr_paise", 0)) + int(row.get("gst_paise", 0))
                   + int(row.get("tcs_paise", 0))) / 100
    vals.add(round(subtotal, 2))
    return {v for v in vals if v != 0}


def verify(text: str, allowed: set[float], tolerance: float = 0.01) -> VerifyResult:
    """Check that every rupee figure in `text` matches an allowed MAGNITUDE (within `tolerance`)."""
    extracted: list[float] = []
    for m in _RUPEE_RE.finditer(text):
        raw = m.group(1) or m.group(2)
        if raw is None:
            continue
        try:
            extracted.append(_to_float(raw))
        except ValueError:
            continue

    offending = [
        v for v in extracted
        if not any(abs(abs(v) - a) <= tolerance for a in allowed)
    ]
    return VerifyResult(ok=len(offending) == 0, offending=offending, extracted=extracted)
