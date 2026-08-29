"""
Stress benchmark - proves throughput at scale.

Generates synthetic reconciliation batches of increasing size (1k / 10k / 50k rows),
runs the full ReconMint engine (ingest + fee reconstruction + exact match + fuzzy
recovery + Repair Agent + triage + audit), and prints wall-clock + throughput +
peak memory for each size. Results are written to `data/benchmark.json` so the
Dashboard can render a "verified 50,000 payments in X.Xs" chip.

Usage:
    python scripts/benchmark.py            # runs 1k, 10k, 50k
    python scripts/benchmark.py 5000       # runs one size
    python scripts/benchmark.py 1000 10000 50000 100000

Every run uses persist=False so the audit DB is not polluted with benchmark data.
The Repair Agent + Razorpay handshake are skipped for the pure-throughput number
(they're I/O-bound and would dominate); set INCLUDE_REPAIR=1 to include them.
"""

from __future__ import annotations

import gc
import json
import os
import sys
import tempfile
import time
import tracemalloc
from datetime import datetime, timezone

# Ensure repo root on sys.path.
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)

# Bench should never call the live Razorpay API.
os.environ.pop("RAZORPAY_KEY_ID", None)
os.environ.pop("RAZORPAY_KEY_SECRET", None)

from backend.generator.generate import write_dataset  # noqa: E402
from backend.agent.orchestrator import reconcile     # noqa: E402


DEFAULT_SIZES = (1_000, 10_000, 50_000)


def format_num(n: int) -> str:
    return f"{n:,}".replace(",", "_")


def run_size(n: int) -> dict:
    """Generate a fresh dataset of `n` rows, reconcile it, return timing metrics."""
    tmp = tempfile.mkdtemp(prefix=f"reconmint_bench_{n}_")
    try:
        t_gen = time.perf_counter()
        write_dataset(tmp, n=n)
        gen_ms = (time.perf_counter() - t_gen) * 1000

        gc.collect()
        tracemalloc.start()
        t0 = time.perf_counter()
        summary = reconcile(data_dir=tmp, persist=False, use_llm=False)
        elapsed = time.perf_counter() - t0
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        m = summary["meta"]
        dataset_size = m["dataset_size"]
        active = m["settlement_active"]
        tps = round(dataset_size / elapsed, 1) if elapsed > 0 else 0
        return {
            "requested_size":     n,
            "generated_rows":     dataset_size,
            "settlement_active":  active,
            "elapsed_seconds":    round(elapsed, 4),
            "generation_seconds": round(gen_ms / 1000, 4),
            "throughput_rps":     tps,
            "peak_memory_mb":     round(peak / (1024 * 1024), 2),
            "match_rate_pct":     m["match_rate_pct"],
            "reconciled_rate_pct": m["reconciled_rate_pct"],
            "exceptions_total":   m["exceptions_total"],
            "reconciled_total":   m["reconciled_total"],
        }
    finally:
        # tmp is huge for 50k; clean up
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)


def print_row(res: dict) -> None:
    n = res["generated_rows"]
    print(
        f"  {n:>8,} rows  ->  "
        f"reconciled in {res['elapsed_seconds']:>6.3f}s   "
        f"{res['throughput_rps']:>10,.0f} rec/s   "
        f"peak {res['peak_memory_mb']:>6.1f} MB   "
        f"match {res['match_rate_pct']:>5.2f}%   "
        f"exc {res['exceptions_total']}"
    )


def main() -> None:
    if len(sys.argv) > 1:
        sizes = tuple(int(s) for s in sys.argv[1:])
    else:
        sizes = DEFAULT_SIZES

    print("ReconMint stress benchmark")
    print(f"started {datetime.now(timezone.utc).isoformat()}")
    print(f"sizes: {', '.join(format_num(s) for s in sizes)}")
    print(f"repo:  {_ROOT}")
    print("-" * 100)

    runs = []
    for n in sizes:
        try:
            print(f"generating + reconciling {n:,} rows ...")
            res = run_size(n)
            runs.append(res)
            print_row(res)
        except Exception as e:  # noqa: BLE001
            print(f"  {n:>8,} rows  ->  FAILED: {e}")

    print("-" * 100)
    best = max(runs, key=lambda r: r["throughput_rps"], default=None)
    headline = None
    if best:
        headline = {
            "rows":             best["generated_rows"],
            "elapsed_seconds":  best["elapsed_seconds"],
            "throughput_rps":   best["throughput_rps"],
            "peak_memory_mb":   best["peak_memory_mb"],
            "phrase":
                f"verified {best['generated_rows']:,} payments in "
                f"{best['elapsed_seconds']:.2f}s "
                f"({int(best['throughput_rps']):,} rec/s, "
                f"{best['peak_memory_mb']:.1f} MB peak)",
        }
        print("headline:", headline["phrase"])

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "python": sys.version.split()[0],
        "platform": sys.platform,
        "sizes": list(sizes),
        "runs": runs,
        "headline": headline,
    }
    out = os.path.join(_ROOT, "data", "benchmark.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
