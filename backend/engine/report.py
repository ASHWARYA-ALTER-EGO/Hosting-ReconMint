"""
ReconMint report formatting.

Turns a MatchResult + timing into a clean, human-readable console report. Kept separate from the
matcher so the same numbers can later feed the API/dashboard and the eval harness without
reformatting logic leaking into the engine.
"""

from __future__ import annotations

from .matcher import MatchResult


def _inr(paise_or_rupees: float) -> str:
    """Format a rupee amount with Indian digit grouping (e.g. 4723850 -> 47,23,850)."""
    n = float(paise_or_rupees)
    neg = n < 0
    n = abs(n)
    whole = int(n)
    frac = round((n - whole) * 100)
    s = str(whole)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        import re
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        s = f"{head},{tail}"
    out = f"₹{s}.{frac:02d}"
    return f"-{out}" if neg else out


def build_report(result: MatchResult, elapsed_s: float, total_records: int) -> dict:
    """Assemble a report dict from a match result and timing."""
    s = dict(result.stats)
    s["elapsed_seconds"] = round(elapsed_s, 4)
    s["throughput_records_per_s"] = round(total_records / elapsed_s, 1) if elapsed_s > 0 else 0.0
    s["total_records_processed"] = total_records
    return s


def print_report(report: dict) -> None:
    print("\n" + "=" * 60)
    print("  ReconMint - Reconciliation Report (Day 4)")
    print("=" * 60)
    print(f"  Total records processed : {report['total_records_processed']}")
    print(f"  Active settlement rows  : {report['settlement_rows_active']}")
    print(f"  Duplicates quarantined  : {report['duplicates_quarantined']}")
    print("-" * 60)
    print(f"  Matched exact           : {report['matched_exact']}  (confidence 1.0)")
    print(f"  Matched fuzzy           : {report.get('matched_fuzzy', 0)}"
          f"  (avg confidence {report.get('avg_confidence_fuzzy', 0)})")
    print(f"  MATCH RATE (exact+fuzzy): {report['match_rate_pct']}%")
    print("  Resolution breakdown:")
    print(f"    clean matched (no fees)   : {report.get('clean_matched', 0)}")
    print(f"    fee reconciled            : {report.get('fee_reconciled', 0)}")
    print(f"    fee anomaly (exception)   : {report.get('fee_anomaly', 0)}")
    print(f"    still unmatched           : {report.get('still_unmatched', 0)}")
    print(f"  RECONCILED TOTAL          : {report.get('reconciled_total', 0)}"
          f"  ({report.get('reconciled_rate_pct', 0)}%)")
    print("-" * 60)
    print(f"  Unclaimed bank credits  : {report['unmatched_bank_credits']}  (ghost candidates)")
    print(f"  Throughput              : {report['throughput_records_per_s']} records/sec")
    print(f"  Elapsed                 : {report['elapsed_seconds']} s")
    print("-" * 60)
    print("  Unmatched reason breakdown:")
    breakdown = report.get("unmatched_reason_breakdown", {})
    if not breakdown:
        print("    (none)")
    for reason, count in sorted(breakdown.items(), key=lambda x: -x[1]):
        print(f"    {reason:32s} {count}")
    print("=" * 60 + "\n")
