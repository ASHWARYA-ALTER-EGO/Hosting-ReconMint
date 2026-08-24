"""
ReconMint CLI - run the agent loop and prove the audit trail is queryable.

  python scripts/run_agent.py

Runs the full agent (reconcile -> triage -> log), then queries SQLite back to show that every
decision was persisted and is retrievable by run and by triage action.
"""

from __future__ import annotations

import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.engine.loader import DEFAULT_DATA_DIR  # noqa: E402


def _ensure_data() -> None:
    needed = ["orders.csv", "settlement.csv", "bank.csv"]
    missing = [f for f in needed if not os.path.exists(os.path.join(DEFAULT_DATA_DIR, f))]
    if missing:
        print(f"Data missing {missing}; generating...")
        from backend.generator.generate import main as generate
        generate()


def main() -> None:
    _ensure_data()
    from backend.agent.orchestrator import reconcile, AUTO_RESOLVE, EXPLAIN, ESCALATE
    from backend.agent.audit import AuditLog, db_path

    summary = reconcile()
    run_id = summary["run_id"]
    meta = summary["meta"]

    print("\n" + "=" * 64)
    print("  ReconMint - Agent Run (Day 6)")
    print("=" * 64)
    print(f"  run_id                  : {run_id}")
    print(f"  DB                      : {os.path.normpath(db_path())}")
    print(f"  Decisions logged        : {summary['decisions_logged']}")
    print("-" * 64)
    print(f"  Match rate              : {meta['match_rate_pct']}%")
    print(f"  Reconciled rate         : {meta['reconciled_rate_pct']}%")
    print(f"  Throughput              : {meta['throughput_rps']} records/sec")
    print(f"  Reconciled total        : {meta['reconciled_total']}")
    print(f"  Exceptions total        : {meta['exceptions_total']}")
    print(f"  Needs-human total       : {meta['needs_human_total']}")
    print("-" * 64)

    # prove it is queryable: read back from SQLite
    audit = AuditLog()
    for action in (AUTO_RESOLVE, EXPLAIN, ESCALATE):
        rows = audit.get_decisions(run_id, triage_action=action)
        print(f"  triage_action={action:13s} -> {len(rows)} decisions (from SQLite)")
    print("-" * 64)
    print("  Sample escalated exceptions (queried back):")
    for d in audit.get_decisions(run_id, triage_action=ESCALATE)[:3]:
        amt = d["amount_paise"] / 100
        print(f"    [{d['record_type']}] ref={d['record_ref']} Rs.{amt:.2f} "
              f"reason={d['reason']}")
    print("=" * 64 + "\n")


if __name__ == "__main__":
    main()
