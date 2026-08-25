"""
ReconMint exact matcher (Day 2).

The deterministic identity pass of the three-way reconciliation. No AI, no fuzzy logic yet — just
strict, auditable joins:

  1. settlement -> order   : does every settled payment map to a real order (join on order_id)?
  2. settlement -> bank    : did the money actually land (same UTR AND same net-paise AND same day)?

A settlement row is `matched_exact` only when BOTH ties hold. Everything else is `unmatched` and
carries a reason, to be picked up by fee reconstruction (Day 3), fuzzy matching (Day 4), or the
exception explainer (Day 7). Duplicate payment_ids are quarantined so a double-booked payment can
never inflate the match rate.

All money comparisons use integer `*_paise` columns (from the loader) — never raw floats — so
floating-point drift cannot cause a false mismatch. All date comparisons use IST-normalized dates.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from .loader import ReconInputs
from .fees import reconstruct_fees


# --- match status constants (identity pass) ---
MATCHED_EXACT = "matched_exact"
MATCHED_FUZZY = "matched_fuzzy"
UNMATCHED = "unmatched"
DUPLICATE = "duplicate_quarantined"

# --- resolution constants (final verdict after fee reconstruction) ---
RECONCILED_CLEAN = "reconciled_clean"        # matched + no deductions
RECONCILED_FEE = "reconciled_fee"            # matched + net fully explained by fees
EXCEPTION_FEE_ANOMALY = "exception_fee_anomaly"  # bank matched but net != fee-justified amount
STILL_UNMATCHED = "still_unmatched"          # never tied to a bank credit

# --- unmatched reason codes ---
NO_ORDER = "no_matching_order"
NO_BANK_UTR = "no_bank_row_with_utr"
BANK_AMOUNT_MISMATCH = "bank_utr_found_amount_differs"
BANK_DATE_MISMATCH = "bank_utr_amount_ok_date_differs"
NO_BANK_CREDIT = "no_positive_bank_credit"  # e.g. fully charged-back payment


@dataclass
class MatchResult:
    """Outcome of the exact pass."""
    settlement: pd.DataFrame           # annotated: match_status, unmatched_reason, matched_bank_idx
    duplicates: pd.DataFrame           # quarantined duplicate settlement rows
    unmatched_bank: pd.DataFrame       # bank credits never claimed by any settlement (ghosts)
    stats: dict = field(default_factory=dict)


def _resolve(match_status: str, fee_valid: bool, deduction_paise: int) -> str:
    """Combine identity-match status with fee validity into a final verdict."""
    if match_status not in (MATCHED_EXACT, MATCHED_FUZZY):
        return STILL_UNMATCHED
    if not fee_valid:
        # money landed, but not the fee-justified amount -> surface as an exception
        return EXCEPTION_FEE_ANOMALY
    return RECONCILED_CLEAN if deduction_paise == 0 else RECONCILED_FEE


def _build_bank_index(bank: pd.DataFrame) -> dict[str, list[int]]:
    """Map UTR -> list of bank row indices, for O(1) lookup during matching."""
    index: dict[str, list[int]] = {}
    for idx, utr in bank["utr"].items():
        index.setdefault(utr, []).append(idx)
    return index


def exact_match(inputs: ReconInputs) -> MatchResult:
    settlement = inputs.settlement.copy()
    orders = inputs.orders
    bank = inputs.bank

    # ---- 1. quarantine duplicate payment_ids (keep first occurrence as active) ----
    dup_mask = settlement["payment_id"].duplicated(keep="first")
    duplicates = settlement[dup_mask].copy()
    duplicates["match_status"] = DUPLICATE
    active = settlement[~dup_mask].copy()

    # ---- 2. settlement -> order identity ----
    valid_order_ids = set(orders["order_id"])
    active["has_order"] = active["order_id"].isin(valid_order_ids)

    # ---- 3. settlement -> bank identity (UTR + net_paise + same day) ----
    bank_index = _build_bank_index(bank)
    claimed_bank_idx: set[int] = set()

    statuses: list[str] = []
    reasons: list[str] = []
    matched_bank_idx: list[int] = []

    for _, row in active.iterrows():
        # a settlement with no positive net produces no bank credit (e.g. full chargeback)
        if row["net_paise"] <= 0:
            statuses.append(UNMATCHED)
            reasons.append(NO_BANK_CREDIT)
            matched_bank_idx.append(-1)
            continue

        if not row["has_order"]:
            statuses.append(UNMATCHED)
            reasons.append(NO_ORDER)
            matched_bank_idx.append(-1)
            continue

        candidates = bank_index.get(row["settlement_utr"], [])
        if not candidates:
            statuses.append(UNMATCHED)
            reasons.append(NO_BANK_UTR)
            matched_bank_idx.append(-1)
            continue

        # among rows sharing the UTR, require exact paise AND exact IST day
        chosen = -1
        amount_seen = False
        for bidx in candidates:
            if bidx in claimed_bank_idx:
                continue
            b = bank.loc[bidx]
            if b["credit_paise"] == row["net_paise"]:
                amount_seen = True
                if b["value_date_norm"] == row["settled_date"]:
                    chosen = bidx
                    break

        if chosen >= 0:
            claimed_bank_idx.add(chosen)
            statuses.append(MATCHED_EXACT)
            reasons.append("")
            matched_bank_idx.append(chosen)
        elif amount_seen:
            # UTR + amount line up but the day is off (this is the T+2 timing case -> Day 4 fuzzy)
            statuses.append(UNMATCHED)
            reasons.append(BANK_DATE_MISMATCH)
            matched_bank_idx.append(-1)
        else:
            statuses.append(UNMATCHED)
            reasons.append(BANK_AMOUNT_MISMATCH)
            matched_bank_idx.append(-1)

    active["match_status"] = statuses
    active["unmatched_reason"] = reasons
    active["matched_bank_idx"] = matched_bank_idx
    active["confidence"] = [1.0 if s == MATCHED_EXACT else 0.0 for s in statuses]

    # ---- 4. fee reconstruction: verify each net is fee-justified (Day 3) ----
    active = reconstruct_fees(active)

    return _finalize(active, duplicates, bank)


def fuzzy_match(result: MatchResult, inputs: ReconInputs, threshold: float | None = None) -> MatchResult:
    """Second pass: recover still-unmatched settlements via tolerant, scored matching (Day 4).

    Only settlements that legitimately expect a bank credit are retried (chargebacks with no
    positive net, and rows with no matching order, are left as-is). Accepted matches are recorded
    with their confidence score; the shared `_finalize` recomputes resolution and stats.
    """
    from . import fuzzy as fz
    if threshold is not None:
        fz.ACCEPT_THRESHOLD = threshold

    active = result.settlement.copy()
    bank = inputs.bank

    claimed: set[int] = set(int(i) for i in active.loc[active["matched_bank_idx"] >= 0, "matched_bank_idx"])
    available = set(bank.index) - claimed
    amount_index = fz.build_amount_index(bank, available)  # near-constant candidate lookup

    # retry only benign near-misses: a bank row exists but date/UTR was off
    retry_reasons = {BANK_DATE_MISMATCH, BANK_AMOUNT_MISMATCH, NO_BANK_UTR}

    for pos, row in active.iterrows():
        if row["match_status"] != UNMATCHED or row["unmatched_reason"] not in retry_reasons:
            continue
        best = fz.find_best_candidate_indexed(row, bank, amount_index, available)
        if best is None:
            continue
        available.discard(best.bank_idx)
        claimed.add(best.bank_idx)
        active.at[pos, "match_status"] = MATCHED_FUZZY
        active.at[pos, "matched_bank_idx"] = best.bank_idx
        active.at[pos, "confidence"] = round(best.score, 4)
        active.at[pos, "unmatched_reason"] = ""

    return _finalize(active, result.duplicates, bank)


def _finalize(active: pd.DataFrame, duplicates: pd.DataFrame, bank: pd.DataFrame) -> MatchResult:
    """Compute the resolution column, unclaimed-bank set, and stats from an annotated `active`.

    Shared by both the exact and fuzzy passes so the reconciliation verdict is defined in exactly
    one place. Assumes fee reconstruction has already run (fee_valid / deduction_paise present).
    """
    active = active.copy()
    active["resolution"] = [
        _resolve(status, fee_valid, deduction)
        for status, fee_valid, deduction in zip(
            active["match_status"], active["fee_valid"], active["deduction_paise"]
        )
    ]

    claimed = set(int(i) for i in active.loc[active["matched_bank_idx"] >= 0, "matched_bank_idx"])
    unmatched_bank = bank.loc[~bank.index.isin(claimed)].copy()

    total = len(active)
    res_counts = active["resolution"].value_counts().to_dict()
    reconciled = res_counts.get(RECONCILED_CLEAN, 0) + res_counts.get(RECONCILED_FEE, 0)
    matched_exact_n = int((active["match_status"] == MATCHED_EXACT).sum())
    matched_fuzzy_n = int((active["match_status"] == MATCHED_FUZZY).sum())

    recon_mask = active["resolution"].isin([RECONCILED_CLEAN, RECONCILED_FEE])
    reconciled_amount_paise = int(active.loc[recon_mask, "reported_net_paise"].sum())

    fee_totals_paise = {
        "mdr": int(active["mdr_paise"].sum()),
        "gst": int(active["gst_paise"].sum()),
        "tcs": int(active["tcs_paise"].sum()),
        "refund": int(active["refund_paise"].sum()),
        "gross": int(active["gross_paise"].sum()),
    }

    matched_conf = active.loc[active["confidence"] > 0, "confidence"]
    avg_conf = round(float(matched_conf.mean()), 4) if len(matched_conf) else 0.0
    fuzzy_conf = active.loc[active["match_status"] == MATCHED_FUZZY, "confidence"]
    avg_fuzzy_conf = round(float(fuzzy_conf.mean()), 4) if len(fuzzy_conf) else 0.0

    stats = {
        "settlement_rows_active": total,
        "duplicates_quarantined": len(duplicates),
        "matched_exact": matched_exact_n,
        "matched_fuzzy": matched_fuzzy_n,
        "match_rate_pct": round(100 * (matched_exact_n + matched_fuzzy_n) / total, 2) if total else 0.0,
        # resolution breakdown
        "clean_matched": res_counts.get(RECONCILED_CLEAN, 0),
        "fee_reconciled": res_counts.get(RECONCILED_FEE, 0),
        "fee_anomaly": res_counts.get(EXCEPTION_FEE_ANOMALY, 0),
        "still_unmatched": res_counts.get(STILL_UNMATCHED, 0),
        "reconciled_total": reconciled,
        "reconciled_rate_pct": round(100 * reconciled / total, 2) if total else 0.0,
        "reconciled_amount_paise": reconciled_amount_paise,
        "fee_totals_paise": fee_totals_paise,
        # confidence
        "avg_confidence_matched": avg_conf,
        "avg_confidence_fuzzy": avg_fuzzy_conf,
        "unmatched_bank_credits": len(unmatched_bank),
        "unmatched_reason_breakdown": (
            active.loc[active["match_status"] == UNMATCHED, "unmatched_reason"]
            .value_counts()
            .to_dict()
        ),
    }

    return MatchResult(
        settlement=active,
        duplicates=duplicates,
        unmatched_bank=unmatched_bank,
        stats=stats,
    )
