"""
ReconMint CLI - run the evaluation harness end to end.

  python scripts/run_eval.py

Ensures data exists, runs reconciliation, scores against the hidden answer key, prints the metrics
table + error analysis, and writes data/eval_results.json.
"""

from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.engine.loader import DEFAULT_DATA_DIR  # noqa: E402


def _ensure_data() -> None:
    needed = ["orders.csv", "settlement.csv", "bank.csv", "answer_key.csv"]
    missing = [f for f in needed if not os.path.exists(os.path.join(DEFAULT_DATA_DIR, f))]
    if missing:
        print(f"Data missing {missing}; generating...")
        from backend.generator.generate import main as generate
        generate()


def main() -> None:
    _ensure_data()
    from backend.eval.report_eval import main as run
    run()


if __name__ == "__main__":
    main()
