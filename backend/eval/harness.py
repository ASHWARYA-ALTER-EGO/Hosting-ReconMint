"""
ReconMint eval harness (Day 5).

Scores the reconciliation engine against the hidden ground-truth answer key. The engine NEVER sees
answer_key.csv; this harness loads it only to grade. It produces the defensible numbers that go in
the README and the pitch video:

  - overall match rate + reconciled rate + throughput
  - precision / recall / F1 on the binary "is this an exception?" decision
  - a confusion matrix (ground-truth category x predicted bucket)
  - an honest, itemized list of every misclassification

Ground-truth exception categories (things the tool MUST surface):
    fee_anomaly, chargeback, duplicate, ghost_bank
Everything else is a payment that should be auto-reconciled (clean, fee_explained, partial_refund,
timing_t2, transposed_utr).
"""

from __future__ import annotations

import os
import time
from collections import defaultdict

import pandas as pd

from backend.engine.loader import load_inputs, DEFAULT_DATA_DIR
from backend.engine.matcher import (
    exact_match, fuzzy_match,
    RECONCILED_CLEAN, RECONCILED_FEE, EXCEPTION_FEE_ANOMALY, STILL_UNMATCHED,
)
from backend.engine.matcher import NO_BANK_CREDIT

# ground-truth categories considered real exceptions
EXCEPTION_TRUTH = {"fee_anomaly", "chargeback", "duplicate", "ghost_bank"}

# predicted buckets
B_RECONCILED = "reconciled"
B_FEE_ANOMALY = "fee_anomaly"
B_CHARGEBACK = "chargeback"
B_DUPLICATE = "duplicate"
B_GHOST = "ghost"
B_OTHER = "unmatched_other"
B_MISSED = "missed"  # ghost truth we failed to detect


def _predict_settlement(result) -> dict[str, dict]:
    """Build a per-payment_id prediction from the engine's settlement output."""
    active = result.settlement
    dup_ids = set(result.duplicates["payment_id"].astype(str))

    preds: dict[str, dict] = {}
    for _, row in active.iterrows():
        pid = str(row["payment_id"])
        resolution = row["resolution"]
        reason = row.get("unmatched_reason", "")

        if pid in dup_ids:
            bucket = B_DUPLICATE
        elif resolution == EXCEPTION_FEE_ANOMALY:
            bucket = B_FEE_ANOMALY
        elif resolution == STILL_UNMATCHED:
            bucket = B_CHARGEBACK if reason == NO_BANK_CREDIT else B_OTHER
        elif resolution in (RECONCILED_CLEAN, RECONCILED_FEE):
            bucket = B_RECONCILED
        else:
            bucket = B_OTHER

        preds[pid] = {
            "bucket": bucket,
            "resolution": resolution,
            "confidence": float(row.get("confidence", 0.0)),
            "is_exception": bucket != B_RECONCILED,
        }

    # duplicate copies live only in result.duplicates; ensure their payment_id is marked exception
    for pid in dup_ids:
        if pid not in preds:
            preds[pid] = {"bucket": B_DUPLICATE, "resolution": "duplicate",
                          "confidence": 0.0, "is_exception": True}
        else:
            preds[pid]["bucket"] = B_DUPLICATE
            preds[pid]["is_exception"] = True
    return preds


def _breakdown(result) -> dict:
    """Mutually-exclusive partition of every record into exactly one bucket (sums to total)."""
    from backend.engine.matcher import (
        MATCHED_EXACT, MATCHED_FUZZY, RECONCILED_CLEAN, RECONCILED_FEE,
    )
    s = result.settlement
    reconciled = s["resolution"].isin([RECONCILED_CLEAN, RECONCILED_FEE])
    auto = int((reconciled & (s["match_status"] == MATCHED_EXACT)).sum())
    fuzzy = int((reconciled & (s["match_status"] == MATCHED_FUZZY)).sum())
    fee_anomaly = int((s["resolution"] == EXCEPTION_FEE_ANOMALY).sum())
    unresolved = int((s["resolution"] == STILL_UNMATCHED).sum())
    duplicates = len(result.duplicates)
    ghost = len(result.unmatched_bank)
    buckets = {
        "auto_matched": auto,
        "fuzzy_matched": fuzzy,
        "fee_anomaly": fee_anomaly,
        "unresolved": unresolved,
        "duplicates": duplicates,
        "ghost_credits": ghost,
    }
    buckets["total"] = sum(buckets.values())
    return buckets


def run_eval(data_dir: str | None = None) -> dict:
    data_dir = data_dir or DEFAULT_DATA_DIR
    inputs = load_inputs(data_dir)
    total_records = sum(inputs.counts.values())

    t0 = time.perf_counter()
    result = exact_match(inputs)
    result = fuzzy_match(result, inputs)
    elapsed = time.perf_counter() - t0

    answer = pd.read_csv(os.path.join(data_dir, "answer_key.csv"), dtype=str).fillna("")
    preds = _predict_settlement(result)
    ghost_utrs = set(result.unmatched_bank["utr"].astype(str))

    # ---- grade every ground-truth record ----
    tp = fp = fn = tn = 0
    confusion: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    errors: list[dict] = []
    cat_detected: dict[str, list[int]] = defaultdict(lambda: [0, 0])  # cat -> [detected, total]

    for _, arow in answer.iterrows():
        truth_cat = arow["category"]
        truth_is_exc = truth_cat in EXCEPTION_TRUTH

        if truth_cat == "ghost_bank":
            detected = arow["utr"] in ghost_utrs
            pred_bucket = B_GHOST if detected else B_MISSED
            pred_is_exc = detected
        else:
            pid = arow["payment_id"]
            pred = preds.get(pid)
            if pred is None:
                pred_bucket = B_MISSED
                pred_is_exc = False
            else:
                pred_bucket = pred["bucket"]
                pred_is_exc = pred["is_exception"]

        confusion[truth_cat][pred_bucket] += 1

        # exception-detection confusion
        if truth_is_exc and pred_is_exc:
            tp += 1
        elif not truth_is_exc and pred_is_exc:
            fp += 1
        elif truth_is_exc and not pred_is_exc:
            fn += 1
        else:
            tn += 1

        # per-category detection (for exception categories: did we flag it at all)
        if truth_is_exc:
            cat_detected[truth_cat][1] += 1
            if pred_is_exc:
                cat_detected[truth_cat][0] += 1

        # record misclassifications for the honest error list
        if truth_is_exc != pred_is_exc:
            errors.append({
                "payment_id": arow.get("payment_id", ""),
                "truth_category": truth_cat,
                "predicted_bucket": pred_bucket,
                "error_type": "false_negative (missed a real exception)" if truth_is_exc
                              else "false_positive (flagged a good payment)",
            })

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    stats = result.stats
    return {
        "dataset_size": len(answer),
        "match_rate_pct": stats["match_rate_pct"],
        "reconciled_rate_pct": stats["reconciled_rate_pct"],
        "reconciled_amount_paise": stats.get("reconciled_amount_paise", 0),
        "matched_exact": stats["matched_exact"],
        "matched_fuzzy": stats["matched_fuzzy"],
        "avg_confidence_fuzzy": stats["avg_confidence_fuzzy"],
        "elapsed_seconds": round(elapsed, 4),
        "throughput_records_per_s": round(total_records / elapsed, 1) if elapsed > 0 else 0.0,
        "exception_detection": {
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        },
        # MUTUALLY-EXCLUSIVE breakdown for the stacked bar + waterfall (sums to total_records).
        # Reconciled rows are split by how they matched (exact vs fuzzy); everything else is an
        # exception bucket. A row is counted in exactly one bucket.
        "breakdown": _breakdown(result),
        "reconciled_amount_rupees": round(stats.get("reconciled_amount_paise", 0) / 100, 2),
        "per_category_detection": {
            cat: {"detected": d[0], "total": d[1],
                  "recall": round(d[0] / d[1], 4) if d[1] else 0.0}
            for cat, d in sorted(cat_detected.items())
        },
        "confusion_matrix": {k: dict(v) for k, v in confusion.items()},
        "errors": errors,
    }
