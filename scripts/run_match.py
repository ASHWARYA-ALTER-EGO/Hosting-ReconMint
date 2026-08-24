"""
ReconMint CLI — run the exact-match pass end to end.

  python scripts/run_match.py

Flow: ensure synthetic data exists (generate if missing) -> load & normalize -> time the exact
match -> print the report. This is the Day 2 definition-of-done entrypoint.
"""

from __future__ import annotations

import os
import sys
import time

# make `backend` importable when run as a script
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.engine.loader import load_inputs, DEFAULT_DATA_DIR  # noqa: E402
from backend.engine.matcher import exact_match, fuzzy_match        # noqa: E402
from backend.engine.report import build_report, print_report      # noqa: E402


def _ensure_data() -> None:
    needed = ["orders.csv", "settlement.csv", "bank.csv"]
    missing = [f for f in needed if not os.path.exists(os.path.join(DEFAULT_DATA_DIR, f))]
    if missing:
        print(f"Data missing {missing}; generating...")
        from backend.generator.generate import main as generate
        generate()


def main() -> None:
    _ensure_data()

    inputs = load_inputs()
    total_records = sum(inputs.counts.values())

    t0 = time.perf_counter()
    result = exact_match(inputs)
    result = fuzzy_match(result, inputs)   # Day 4: recover timing / UTR-typo near-misses
    elapsed = time.perf_counter() - t0

    report = build_report(result, elapsed, total_records)
    print_report(report)


if __name__ == "__main__":
    main()
