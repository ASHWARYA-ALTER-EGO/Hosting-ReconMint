"""
ReconMint performance benchmark.

Times the deterministic reconciliation (exact + fuzzy) at increasing dataset sizes and reports
throughput and peak memory. The 500-record run must complete under the 4-second target.

  python scripts/benchmark.py
"""

from __future__ import annotations

import os
import sys
import tempfile
import time
import tracemalloc

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.generator.generate import write_dataset          # noqa: E402
from backend.engine.loader import load_inputs                  # noqa: E402
from backend.engine.matcher import exact_match, fuzzy_match    # noqa: E402

SIZES = [500, 2000, 10000]
TARGET_500_SECONDS = 4.0


def bench_one(n: int) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        write_dataset(tmp, n)
        inputs = load_inputs(tmp)
        total = sum(inputs.counts.values())

        tracemalloc.start()
        t0 = time.perf_counter()
        result = exact_match(inputs)
        result = fuzzy_match(result, inputs)
        elapsed = time.perf_counter() - t0
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

    return {
        "records": n,
        "rows_processed": total,
        "seconds": round(elapsed, 4),
        "throughput_rps": round(total / elapsed, 1) if elapsed else 0.0,
        "peak_mem_mb": round(peak / 1024 / 1024, 1),
        "match_rate_pct": result.stats["match_rate_pct"],
    }


def main() -> None:
    print("\n" + "=" * 68)
    print("  ReconMint - Performance Benchmark")
    print("=" * 68)
    print(f"  {'records':>8} {'rows':>8} {'seconds':>9} {'rec/sec':>10} {'peakMB':>8} {'match%':>8}")
    print("-" * 68)
    results = []
    for n in SIZES:
        r = bench_one(n)
        results.append(r)
        print(f"  {r['records']:>8} {r['rows_processed']:>8} {r['seconds']:>9} "
              f"{r['throughput_rps']:>10} {r['peak_mem_mb']:>8} {r['match_rate_pct']:>8}")
    print("=" * 68)

    r500 = next(r for r in results if r["records"] == 500)
    ok = r500["seconds"] < TARGET_500_SECONDS
    verdict = "PASS" if ok else "FAIL"
    print(f"  Target: 500 records < {TARGET_500_SECONDS}s  ->  "
          f"{r500['seconds']}s  [{verdict}]\n")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
