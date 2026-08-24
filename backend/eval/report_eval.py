"""
ReconMint eval reporter (Day 5).

Runs the harness, prints a clean metrics table + an honest error-analysis section, and saves the
full results to data/eval_results.json for the README and the pitch video.

  python -m backend.eval.report_eval        (from repo root)
  python scripts/run_eval.py
"""

from __future__ import annotations

import json
import os

from .harness import run_eval

OUT_JSON = os.path.join(os.path.dirname(__file__), "..", "..", "data", "eval_results.json")


def print_eval(res: dict) -> None:
    ed = res["exception_detection"]
    print("\n" + "=" * 64)
    print("  ReconMint - Evaluation vs Ground Truth (Day 5)")
    print("=" * 64)
    print(f"  Dataset size            : {res['dataset_size']} records")
    print(f"  Match rate (exact+fuzzy): {res['match_rate_pct']}%")
    print(f"  Reconciled rate         : {res['reconciled_rate_pct']}%")
    print(f"  Throughput              : {res['throughput_records_per_s']} records/sec"
          f"  ({res['elapsed_seconds']}s)")
    print("-" * 64)
    print("  EXCEPTION DETECTION (is this a real problem?)")
    print(f"    Precision : {ed['precision']}   (of flagged, how many were real)")
    print(f"    Recall    : {ed['recall']}   (of real problems, how many we caught)")
    print(f"    F1        : {ed['f1']}")
    print(f"    TP={ed['tp']}  FP={ed['fp']}  FN={ed['fn']}  TN={ed['tn']}")
    print("-" * 64)
    print("  PER-CATEGORY DETECTION (exception categories):")
    for cat, d in res["per_category_detection"].items():
        print(f"    {cat:16s} {d['detected']}/{d['total']}  (recall {d['recall']})")
    print("-" * 64)
    print("  CONFUSION MATRIX (truth -> predicted bucket):")
    for truth, preds in sorted(res["confusion_matrix"].items()):
        parts = ", ".join(f"{k}={v}" for k, v in sorted(preds.items()))
        print(f"    {truth:16s} -> {parts}")
    print("-" * 64)
    print("  ERROR ANALYSIS:")
    if not res["errors"]:
        print("    No misclassifications: every exception detected, no good payment flagged.")
    else:
        for e in res["errors"]:
            print(f"    [{e['error_type']}] payment_id={e['payment_id']} "
                  f"truth={e['truth_category']} predicted={e['predicted_bucket']}")
    print("=" * 64 + "\n")


def main() -> None:
    res = run_eval()
    print_eval(res)
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=2)
    print(f"Saved eval results -> {os.path.normpath(OUT_JSON)}")


if __name__ == "__main__":
    main()
