"""
ReconMint fuzzy matcher (Day 4).

The second reconciliation pass. After the exact identity pass, some settlements remain unmatched
for benign reasons: the bank credit landed a couple of days late (T+2 timing) or the bank recorded
a UTR with two digits transposed. These are real matches that strict equality misses.

For each still-unmatched settlement (that actually expects a bank credit), we search the pool of
UNCLAIMED bank rows for a candidate that is:
  - within +/- Rs.1 of the settlement's net (amount gate), AND
  - dated within a T+0..T+3 IST window of the settlement date (timing gate).

Surviving candidates are scored 0..1 on amount closeness, date closeness, and UTR similarity. The
top candidate is accepted only if the weighted score clears a threshold (default 0.85); otherwise
the settlement stays an exception. Every accepted fuzzy match records its score as `confidence`
(exact matches are confidence 1.0), so a human can see how sure the system was.

No external deps: UTR similarity uses difflib (transposition-aware enough for swapped digits).
"""

from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher

import pandas as pd

from backend.config import (
    AMOUNT_TOLERANCE_PAISE, DATE_WINDOW_DAYS, W_AMOUNT, W_UTR, W_DATE, ACCEPT_THRESHOLD,
)


@dataclass
class FuzzyCandidate:
    bank_idx: int
    score: float
    amount_score: float
    date_score: float
    utr_score: float
    day_diff: int


def _amount_score(diff_paise: int) -> float:
    """1.0 at exact, decaying to 0.0 at the +/- Rs.1 tolerance edge."""
    return max(0.0, 1.0 - abs(diff_paise) / AMOUNT_TOLERANCE_PAISE)


def _date_score(day_diff: int) -> float:
    """1.0 at same day, decaying to 0.0 at the T+3 window edge."""
    return max(0.0, 1.0 - abs(day_diff) / DATE_WINDOW_DAYS)


def _utr_score(a: str, b: str) -> float:
    """Similarity in [0,1]; ~0.9+ for a two-digit transposition on a ~13-char UTR."""
    return SequenceMatcher(None, a, b).ratio()


def _score_candidate(settlement_row, bank_row, bank_idx: int) -> FuzzyCandidate | None:
    diff_paise = int(bank_row["credit_paise"]) - int(settlement_row["net_paise"])
    if abs(diff_paise) > AMOUNT_TOLERANCE_PAISE:
        return None  # amount gate

    day_diff = int((bank_row["value_date_norm"] - settlement_row["settled_date"]).days)
    if day_diff < 0 or day_diff > DATE_WINDOW_DAYS:
        return None  # timing gate (credits land on/after settlement, within window)

    a_s = _amount_score(diff_paise)
    d_s = _date_score(day_diff)
    u_s = _utr_score(str(settlement_row["settlement_utr"]), str(bank_row["utr"]))
    score = W_AMOUNT * a_s + W_UTR * u_s + W_DATE * d_s
    return FuzzyCandidate(bank_idx, score, a_s, d_s, u_s, day_diff)


def find_best_candidate(settlement_row, bank: pd.DataFrame, available_idx: set[int]) -> FuzzyCandidate | None:
    """Return the highest-scoring acceptable bank candidate, or None (linear scan; small sets)."""
    best: FuzzyCandidate | None = None
    for bidx in available_idx:
        cand = _score_candidate(settlement_row, bank.loc[bidx], bidx)
        if cand is None:
            continue
        if best is None or cand.score > best.score:
            best = cand
    if best is not None and best.score >= ACCEPT_THRESHOLD:
        return best
    return None


def build_amount_index(bank: pd.DataFrame, available_idx: set[int]) -> dict[int, list[int]]:
    """Bucket available bank rows by whole-rupee key for near-constant candidate lookup.

    The amount gate only admits candidates within +/- Rs.1, so a settlement need only look at the
    bank rows in its own rupee bucket and the two adjacent ones. This turns the fuzzy pass from
    O(unmatched x bank) into roughly O(unmatched), which is what keeps 10k records fast.
    """
    index: dict[int, list[int]] = {}
    credit_by_idx = bank["credit_paise"].to_dict()
    for bidx in available_idx:
        key = int(credit_by_idx[bidx]) // 100
        index.setdefault(key, []).append(bidx)
    return index


def find_best_candidate_indexed(settlement_row, bank: pd.DataFrame,
                                amount_index: dict[int, list[int]],
                                available_idx: set[int]) -> FuzzyCandidate | None:
    """Like find_best_candidate but only scores bank rows in nearby rupee buckets."""
    net = int(settlement_row["net_paise"])
    base = net // 100
    best: FuzzyCandidate | None = None
    for key in (base - 1, base, base + 1):
        for bidx in amount_index.get(key, ()):
            if bidx not in available_idx:
                continue
            cand = _score_candidate(settlement_row, bank.loc[bidx], bidx)
            if cand is None:
                continue
            if best is None or cand.score > best.score:
                best = cand
    if best is not None and best.score >= ACCEPT_THRESHOLD:
        return best
    return None
