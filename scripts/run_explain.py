"""
ReconMint CLI - run the agent WITH the LLM exception explainer (Day 7).

  python scripts/run_explain.py [max_calls]

Runs the full agent with use_llm=True, verifying every LLM explanation before trusting it, then
prints sample explanations, the verified/rejected split, and the total AI spend. Default caps LLM
calls at 40 to bound cost.
"""

from __future__ import annotations

import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")  # allow the rupee glyph on Windows consoles
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.engine.loader import DEFAULT_DATA_DIR  # noqa: E402


def _ensure_data() -> None:
    needed = ["orders.csv", "settlement.csv", "bank.csv"]
    missing = [f for f in needed if not os.path.exists(os.path.join(DEFAULT_DATA_DIR, f))]
    if missing:
        from backend.generator.generate import main as generate
        generate()


def main() -> None:
    _ensure_data()
    max_calls = int(sys.argv[1]) if len(sys.argv) > 1 else 40

    from backend.agent.orchestrator import reconcile, EXPLAIN
    from backend.agent.audit import AuditLog

    summary = reconcile(use_llm=True, max_llm_calls=max_calls)
    run_id = summary["run_id"]
    meta = summary["meta"]

    print("\n" + "=" * 68)
    print("  ReconMint - Agent Run WITH LLM Explainer (Day 7)")
    print("=" * 68)
    print(f"  run_id                  : {run_id}")
    print(f"  Model                   : {os.environ.get('RECONMINT_LLM_MODEL', 'gpt-4o-mini')}")
    print(f"  LLM calls               : {meta['llm_calls']}")
    print(f"  LLM verified (trusted)  : {meta['llm_verified_count']}")
    print(f"  LLM total cost          : ${meta['llm_cost_usd_total']}")
    print("-" * 68)

    audit = AuditLog()
    explained = audit.get_decisions(run_id, triage_action=EXPLAIN)
    print("  Sample explanations (verified against computed figures):")
    for d in explained[:5]:
        src = d.get("llm_source")
        txt = d.get("llm_explanation") or d.get("explanation")
        print(f"\n    payment_id={d['record_ref']}  reason={d['reason']}  [{src}]")
        print(f"      {txt}")

    rejected = [d for d in explained if d.get("llm_source") == "llm_rejected_fallback"]
    print("\n" + "-" * 68)
    print(f"  Hallucination verifier: {len(rejected)} LLM outputs rejected and replaced "
          f"with the deterministic explanation.")
    print("=" * 68 + "\n")


if __name__ == "__main__":
    main()
