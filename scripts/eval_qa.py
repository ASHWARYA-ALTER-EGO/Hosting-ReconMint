"""
Q&A agent eval: routes a set of questions and checks the agent picked the right tool (intent) and
produced figures consistent with a directly-computed ground truth. Reports routing accuracy.

  python scripts/eval_qa.py
"""

from __future__ import annotations

import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.agent.orchestrator import reconcile   # noqa: E402
from backend.agent.qa import ask, compute          # noqa: E402

# question -> expected metric
CASES = [
    ("How much did fees eat this batch?", "total_fees"),
    ("What did MDR and GST cost me?", "total_fees"),
    ("Which payments are missing in bank?", "missing_in_bank"),
    ("Show me the amount mismatches", "amount_mismatch"),
    ("How many exceptions need review?", "exceptions_summary"),
    ("What's the total amount reconciled?", "reconciled_amount"),
    ("What is the total variance in the batch?", "payout_variance"),
    ("How many chargebacks are there?", "chargebacks"),
    ("Are there any duplicate payments?", "duplicates"),
    ("What is the match rate?", "match_rate"),
]


def main() -> None:
    summary = reconcile(persist=True, use_llm=False)
    run_id = summary["run_id"]

    correct = 0
    grounded = 0
    print("\n" + "=" * 64)
    print("  ReconMint - Q&A Agent Eval")
    print("=" * 64)
    for q, expected in CASES:
        res = ask(run_id, q)
        metric = res["intent"]["metric"]
        ok = metric == expected
        correct += ok
        grounded += res["verified"]
        # figures must be non-empty and consistent with a fresh deterministic compute
        recomputed = compute(run_id, res["intent"])
        consistent = [f["value"] for f in res["figures"]] == [f["value"] for f in recomputed["figures"]]
        mark = "OK " if ok else "XX "
        print(f"  {mark} routed={metric:18s} expected={expected:18s} "
              f"verified={res['verified']} consistent={consistent}")

    n = len(CASES)
    print("-" * 64)
    print(f"  Routing accuracy : {correct}/{n} ({round(100*correct/n)}%)")
    print(f"  Grounded answers : {grounded}/{n} ({round(100*grounded/n)}%)")
    print("=" * 64 + "\n")


if __name__ == "__main__":
    main()
