"""
Repair Agent — the piece that makes ReconMint agentic, not pipeline.

For every settlement that remains unmatched after the fuzzy pass, this module tries
three deterministic *repair strategies* in order, logs every attempt (score, verdict,
latency), and accepts the first strategy whose confidence clears the threshold. The
per-record attempt tree is persisted to the audit table (`strategy_attempts_json`) so
the Exceptions drawer can render "what the engine tried" as a visible decision tree.

The three strategies (deterministic, each cheap):

  strategy_1  amount_utr_fuzzy         same as the standard fuzzy pass — a control
                                       datum on the attempt tree. Skipped as retried
                                       (the fuzzy pass already ran); we record its
                                       best-effort score for the tree.
  strategy_2  normalize_utr            uppercase, strip non-alphanumeric, retry EXACT
                                       amount+UTR match against unclaimed bank rows.
                                       Recovers "UTR-999 999-01" vs "UTR99999901" style.
  strategy_3  widen_date_window        keep amount tight (paise-exact), extend the T+
                                       window to ±7 days. Recovers late credits that
                                       the tight fuzzy timing gate rejected.

Every attempt records:
  { strategy, score, threshold, verdict: accepted|rejected|no_candidate, ms, detail }

The winning strategy also carries `bank_idx` so the orchestrator can claim the bank
row and promote the settlement to MATCHED_FUZZY.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field, asdict

import pandas as pd

from backend.config import ACCEPT_THRESHOLD, AMOUNT_TOLERANCE_PAISE
from backend.engine.fuzzy import (
    _score_candidate as _score_candidate,   # reuse the standard fuzzy scorer
    FuzzyCandidate,
)


WIDENED_DATE_WINDOW_DAYS = 7


@dataclass
class Attempt:
    strategy: str
    verdict: str                  # "accepted" | "rejected" | "no_candidate"
    score: float | None = None
    threshold: float = ACCEPT_THRESHOLD
    ms: float = 0.0
    detail: str = ""
    bank_idx: int | None = None   # only set when verdict == "accepted"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RepairOutcome:
    attempts: list[Attempt] = field(default_factory=list)
    accepted: Attempt | None = None

    def to_json(self) -> list[dict]:
        return [a.to_dict() for a in self.attempts]


def _normalize_utr(utr: str) -> str:
    """Uppercase + strip anything that isn't A-Z0-9. Turns 'utr-999 999/01' into 'UTR99999901'."""
    return re.sub(r"[^A-Z0-9]", "", str(utr or "").upper())


def _try_strategy_1_recap(settlement_row, bank: pd.DataFrame,
                          available_idx: set[int]) -> Attempt:
    """The tight fuzzy pass has already run; record its best-effort score for the tree.

    This is intentionally cheap - we re-score the top candidate so the Decisions tab
    shows a real number, not just a placeholder."""
    t0 = time.perf_counter()
    best: FuzzyCandidate | None = None
    net = int(settlement_row["net_paise"])
    for bidx in available_idx:
        row = bank.loc[bidx]
        cand = _score_candidate(settlement_row, row, bidx)
        if cand is None:
            continue
        if best is None or cand.score > best.score:
            best = cand
    ms = round((time.perf_counter() - t0) * 1000, 2)
    if best is None:
        return Attempt(
            strategy="amount_utr_fuzzy",
            verdict="no_candidate",
            score=None, ms=ms,
            detail="no bank row passed the amount (+/- Rs.1) and date (T+0..3) gates",
        )
    return Attempt(
        strategy="amount_utr_fuzzy",
        verdict="rejected",   # by definition — if it were accepted, fuzzy_match would have taken it
        score=round(best.score, 4),
        ms=ms,
        detail=f"top score {best.score:.3f} below threshold {ACCEPT_THRESHOLD}",
    )


def _try_strategy_2_normalize_utr(settlement_row, bank: pd.DataFrame,
                                  available_idx: set[int]) -> Attempt:
    """Uppercase + strip non-alphanumeric on the UTR; retry EXACT amount + UTR match."""
    t0 = time.perf_counter()
    target_net = int(settlement_row["net_paise"])
    target_utr = _normalize_utr(settlement_row.get("settlement_utr"))
    if not target_utr:
        ms = round((time.perf_counter() - t0) * 1000, 2)
        return Attempt(strategy="normalize_utr", verdict="no_candidate", ms=ms,
                       detail="settlement has no UTR to normalize")
    for bidx in available_idx:
        row = bank.loc[bidx]
        bank_net = int(row["credit_paise"])
        if bank_net != target_net:
            continue
        bank_utr = _normalize_utr(row.get("utr"))
        if bank_utr == target_utr:
            ms = round((time.perf_counter() - t0) * 1000, 2)
            return Attempt(
                strategy="normalize_utr", verdict="accepted",
                score=1.0, ms=ms, bank_idx=int(bidx),
                detail=f"exact match on normalized UTR '{target_utr}' + net Rs.{target_net/100:,.2f}",
            )
    ms = round((time.perf_counter() - t0) * 1000, 2)
    return Attempt(
        strategy="normalize_utr", verdict="rejected",
        score=0.0, ms=ms,
        detail=f"no bank row matched normalized UTR '{target_utr}' + net Rs.{target_net/100:,.2f}",
    )


def _try_strategy_3_widen_date(settlement_row, bank: pd.DataFrame,
                               available_idx: set[int]) -> Attempt:
    """Amount paise-exact, but relax the T+ timing window from 3 to 7 days."""
    t0 = time.perf_counter()
    target_net = int(settlement_row["net_paise"])
    settled = settlement_row["settled_date"]
    best_idx: int | None = None
    best_day_diff: int | None = None
    for bidx in available_idx:
        row = bank.loc[bidx]
        if int(row["credit_paise"]) != target_net:
            continue
        day_diff = int((row["value_date_norm"] - settled).days)
        if day_diff < 0 or day_diff > WIDENED_DATE_WINDOW_DAYS:
            continue
        if best_day_diff is None or day_diff < best_day_diff:
            best_day_diff = day_diff
            best_idx = int(bidx)
    ms = round((time.perf_counter() - t0) * 1000, 2)
    if best_idx is None:
        return Attempt(
            strategy="widen_date_window", verdict="rejected",
            score=0.0, ms=ms,
            detail=f"no amount-exact bank row within +{WIDENED_DATE_WINDOW_DAYS} days",
        )
    # Score decays linearly with day-diff so the drawer can show the tradeoff.
    score = round(max(0.0, 1.0 - best_day_diff / (WIDENED_DATE_WINDOW_DAYS + 1)), 4)
    verdict = "accepted" if score >= ACCEPT_THRESHOLD else "rejected"
    return Attempt(
        strategy="widen_date_window", verdict=verdict,
        score=score, ms=ms,
        bank_idx=(best_idx if verdict == "accepted" else None),
        detail=(f"amount-exact bank row landed T+{best_day_diff} days"
                + (f", score {score:.3f} >= threshold" if verdict == "accepted"
                   else f", score {score:.3f} < threshold {ACCEPT_THRESHOLD}")),
    )


STRATEGY_ORDER = [
    _try_strategy_1_recap,
    _try_strategy_2_normalize_utr,
    _try_strategy_3_widen_date,
]


def repair_settlement(settlement_row, bank: pd.DataFrame,
                      available_idx: set[int]) -> RepairOutcome:
    """Run repair strategies in order. Stop when one accepts. Log every attempt."""
    outcome = RepairOutcome()
    for strategy_fn in STRATEGY_ORDER:
        attempt = strategy_fn(settlement_row, bank, available_idx)
        outcome.attempts.append(attempt)
        if attempt.verdict == "accepted":
            outcome.accepted = attempt
            break
    return outcome
