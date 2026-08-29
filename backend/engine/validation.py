"""
ReconMint input validation + exception severity.

Two small, high-value pieces of hardening:

1. `validate_inputs` checks the three uploaded files have the columns we need and are non-empty,
   returning FRIENDLY messages ("bank file is missing column 'utr'") instead of a pandas KeyError
   deep in the engine. The API layer surfaces these to the user; nothing leaks a stack trace.

2. `severity_for` assigns an exception a level - critical / warning / info - so the dashboard and
   the audit trail can rank what a human should look at first. A large fee anomaly is critical; a
   sub-rupee gap is a warning; an informational note is info.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.config import SEVERITY_MATERIAL_PAISE

# severity levels
CRITICAL = "critical"
WARNING = "warning"
INFO = "info"

REQUIRED_COLUMNS: dict[str, set[str]] = {
    "orders": {"order_id", "timestamp", "gross_amount"},
    "settlement": {"payment_id", "gross_amount", "net_settled", "settlement_utr", "settled_at"},
    "bank": {"value_date", "utr", "credit_amount"},
}

# Columns the engine uses if present, but will synthesize (as 0.0) if missing so a
# minimal merchant export still reconciles.
OPTIONAL_COLUMNS: dict[str, set[str]] = {
    "orders": set(),
    "settlement": {"order_id", "mdr_fee", "gst_on_mdr", "tcs",
                   "refund_amount", "chargeback_amount"},
    "bank": set(),
}


class InputValidationError(ValueError):
    """Raised with a user-friendly message when an uploaded file is malformed."""


@dataclass
class ValidationReport:
    ok: bool
    errors: list[str] = field(default_factory=list)


def validate_frame(name: str, df) -> list[str]:
    """Return a list of friendly problems for one named DataFrame (empty list = valid)."""
    problems: list[str] = []
    required = REQUIRED_COLUMNS.get(name, set())
    if df is None:
        return [f"{name} file could not be read."]
    if len(df) == 0:
        problems.append(f"{name} file has no rows.")
    missing = required - set(df.columns)
    for col in sorted(missing):
        problems.append(f"{name} file is missing required column '{col}'.")
    return problems


def validate_inputs(orders, settlement, bank) -> ValidationReport:
    errors: list[str] = []
    errors += validate_frame("orders", orders)
    errors += validate_frame("settlement", settlement)
    errors += validate_frame("bank", bank)
    return ValidationReport(ok=len(errors) == 0, errors=errors)


def severity_for(resolution: str, reason: str, gap_paise: int = 0, amount_paise: int = 0) -> str:
    """Rank an exception so humans triage the important money first."""
    from backend.engine.matcher import EXCEPTION_FEE_ANOMALY, STILL_UNMATCHED, NO_BANK_CREDIT

    if resolution == EXCEPTION_FEE_ANOMALY:
        return CRITICAL if abs(gap_paise) > SEVERITY_MATERIAL_PAISE else WARNING
    if reason == "no_matching_settlement":          # ghost bank credit: unexplained money
        return CRITICAL
    if reason == "duplicate_payment_id":
        return WARNING
    # chargeback: an expected business event, no bank credit is due (accept either reason vocab)
    if reason in (NO_BANK_CREDIT, "chargeback_no_credit"):
        return WARNING
    if resolution == STILL_UNMATCHED:
        return CRITICAL                              # settled but money never arrived
    return INFO
