"""
ReconMint agent orchestrator (Day 6).

The control loop that makes this an agent, not a script. It runs the full reconciliation pipeline
and then *triages every leftover*: each record is routed by category to a deterministic handler
that decides one of three actions - auto-resolve, explain, or escalate-to-human - and the decision
is written to the audit log. The LLM does not decide anything here; triage is rule-based and
auditable. (Day 7 attaches an LLM explanation to the `explain` branch only.)

Pipeline:  ingest -> reconstruct fees -> exact match -> fuzzy match -> triage each record -> log

Stopping rule: every record is visited exactly once. A record that cannot be resolved is marked
`needs_human` and the loop moves on - the agent never retries or loops on an unresolvable item.
"""

from __future__ import annotations

import json
import time
import uuid

from backend.engine.loader import load_inputs
from backend.engine.matcher import (
    exact_match, fuzzy_match,
    MATCHED_EXACT, MATCHED_FUZZY,
    RECONCILED_CLEAN, RECONCILED_FEE, EXCEPTION_FEE_ANOMALY, STILL_UNMATCHED,
    NO_BANK_CREDIT, NO_ORDER,
)
from backend.engine.fees import fee_explanation
from backend.engine.validation import validate_inputs, severity_for, InputValidationError
from backend.agent.audit import AuditLog
from backend.agent.explainer import explain_row

# triage actions
AUTO_RESOLVE = "auto_resolve"
EXPLAIN = "explain"
ESCALATE = "escalate"


def _ledger(row) -> dict:
    """Structured fee breakdown (rupees) for the exception drawer. No invented line items -
    only MDR, GST-on-MDR, TCS, refund, chargeback, exactly what the engine reconstructs."""
    def rup(k: str) -> float:
        return round(int(row.get(k, 0)) / 100, 2)

    lines = [
        {"particulars": "Gross (Order Amount)", "expected": rup("gross_paise"),
         "actual": rup("gross_paise"), "delta": 0.0, "isSubItem": False},
        {"particulars": "(-) MDR (2.00%)", "value": rup("mdr_paise"), "isSubItem": True},
        {"particulars": "(-) GST (18% on MDR)", "value": rup("gst_paise"), "isSubItem": True},
    ]
    if int(row.get("tcs_paise", 0)):
        lines.append({"particulars": "(-) TCS (1% of Gross)", "value": rup("tcs_paise"), "isSubItem": True})
    if int(row.get("refund_paise", 0)):
        lines.append({"particulars": "(-) Refund", "value": rup("refund_paise"), "isSubItem": True})
    if int(row.get("chargeback_paise", 0)):
        lines.append({"particulars": "(-) Chargeback", "value": rup("chargeback_paise"), "isSubItem": True})

    return {
        "lines": lines,
        "gross": rup("gross_paise"), "mdr": rup("mdr_paise"), "gst": rup("gst_paise"),
        "tcs": rup("tcs_paise"), "refund": rup("refund_paise"), "chargeback": rup("chargeback_paise"),
        "expectedNet": rup("expected_net_paise"),
        "actualNet": rup("reported_net_paise"),
        "variance": round(int(row.get("net_gap_paise", 0)) / 100, 2),
        "verifiedAgainstCount": 3 + (1 if int(row.get("tcs_paise", 0)) else 0)
                                  + (1 if int(row.get("refund_paise", 0)) else 0)
                                  + (1 if int(row.get("chargeback_paise", 0)) else 0) + 2,
    }


def _match_method(match_status: str) -> str:
    if match_status == MATCHED_EXACT:
        return "exact"
    if match_status == MATCHED_FUZZY:
        return "fuzzy"
    return "none"


def triage_settlement(row) -> tuple[str, bool, str, str]:
    """Deterministic routing for a settlement record.

    Returns (triage_action, needs_human, reason, explanation).
    """
    resolution = row["resolution"]

    if resolution in (RECONCILED_CLEAN, RECONCILED_FEE):
        return AUTO_RESOLVE, False, "reconciled", fee_explanation(row)

    if resolution == EXCEPTION_FEE_ANOMALY:
        # money landed but not the fee-justified amount -> explain the gap, needs human sign-off
        return EXPLAIN, True, "fee_anomaly", fee_explanation(row)

    if resolution == STILL_UNMATCHED:
        reason = row.get("unmatched_reason", "")
        if reason == NO_BANK_CREDIT:
            return (EXPLAIN, True, "chargeback_no_credit",
                    "Settlement net is zero/negative (fully reversed by chargeback); "
                    "no bank credit is expected. Flagged for finance confirmation.")
        if reason == NO_ORDER:
            return (ESCALATE, True, "no_matching_order",
                    "Settled payment has no matching order in the ledger.")
        # a bank credit could not be tied to this settlement even with tolerance
        return (ESCALATE, True, reason or "unmatched",
                "No bank credit could be matched to this settlement within tolerance.")

    # defensive default (should not happen) - escalate rather than silently drop
    return ESCALATE, True, "unknown_resolution", f"Unrecognized resolution: {resolution}."


def reconcile(data_dir: str | None = None, persist: bool = True,
              use_llm: bool = False, max_llm_calls: int | None = None) -> dict:
    """Run the full agent loop and (optionally) persist the audit trail. Returns a run summary.

    When `use_llm` is True, each EXPLAIN-branch settlement exception gets an LLM explanation that is
    verified before being trusted; `max_llm_calls` caps spend. AUTO_RESOLVE rows never call the LLM.
    """
    run_id = uuid.uuid4().hex[:12]
    trace: list[dict] = []

    def stage(title: str, detail: str, secs: float, extra: dict | None = None) -> None:
        s = {"title": title, "detail": detail, "ms": round(secs * 1000, 1), "status": "done"}
        if extra:
            s.update(extra)
        trace.append(s)

    # ---- ingest + validate ----
    ts = time.perf_counter()
    inputs = load_inputs(data_dir)
    report = validate_inputs(inputs.orders, inputs.settlement, inputs.bank)
    if not report.ok:
        raise InputValidationError("; ".join(report.errors))
    total_records = sum(inputs.counts.values())
    stage("Ingested & validated", f"{total_records} rows across 3 sources, schema checked",
          time.perf_counter() - ts, {"via": "rules"})

    t0 = time.perf_counter()

    # ---- exact match (incl. fee reconstruction) ----
    ts = time.perf_counter()
    result = exact_match(inputs)
    stage("Reconstructed fees + exact match",
          f"{result.stats['matched_exact']} matched on UTR + paise-exact amount",
          time.perf_counter() - ts, {"via": "deterministic"})

    # ---- fuzzy recovery ----
    ts = time.perf_counter()
    result = fuzzy_match(result, inputs)
    stage("Fuzzy recovery",
          f"{result.stats['matched_fuzzy']} near-misses recovered (T+2 timing, UTR typos)",
          time.perf_counter() - ts, {"via": "deterministic"})

    elapsed = time.perf_counter() - t0

    decisions: list[dict] = []
    needs_human = 0
    exceptions = 0
    llm_calls = 0
    llm_cost_total = 0.0
    llm_verified_count = 0

    ts_triage = time.perf_counter()
    # ---- 1. triage settlement records (each visited once) ----
    for _, row in result.settlement.iterrows():
        action, human, reason, explanation = triage_settlement(row)
        if human:
            needs_human += 1
        if action != AUTO_RESOLVE:
            exceptions += 1

        decision = {
            "record_ref": str(row["payment_id"]),
            "record_type": "settlement",
            "match_method": _match_method(row["match_status"]),
            "confidence": float(row.get("confidence", 0.0)),
            "resolution": row["resolution"],
            "triage_action": action,
            "needs_human": human,
            "severity": severity_for(row["resolution"], reason,
                                     gap_paise=int(row.get("net_gap_paise", 0)),
                                     amount_paise=int(row.get("reported_net_paise", 0))),
            "amount_paise": int(row.get("reported_net_paise", row.get("net_paise", 0))),
            "reason": reason,
            "explanation": explanation,
            "ledger_json": json.dumps(_ledger(row)),
            "record_date": (str(row["settled_date"].date())
                            if row.get("settled_date") is not None else None),
        }

        # LLM explanation only on the EXPLAIN branch, only within budget
        if action == EXPLAIN and use_llm and (max_llm_calls is None or llm_calls < max_llm_calls):
            outcome = explain_row(row, use_llm=True)
            llm_calls += 1
            llm_cost_total += outcome.cost_usd
            if outcome.verified and outcome.source == "llm_verified":
                llm_verified_count += 1
            decision.update({
                "llm_explanation": outcome.text,
                "llm_source": outcome.source,
                "llm_verified": outcome.verified,
                "llm_model": outcome.model,
                "llm_cost_usd": outcome.cost_usd,
                "llm_latency_ms": outcome.latency_ms,
            })

        decisions.append(decision)

    # ---- 2. duplicate copies (quarantined) ----
    for _, row in result.duplicates.iterrows():
        needs_human += 1
        exceptions += 1
        decisions.append({
            "record_ref": str(row["payment_id"]),
            "record_type": "settlement",
            "match_method": "none",
            "confidence": 0.0,
            "resolution": "duplicate_quarantined",
            "triage_action": EXPLAIN,
            "needs_human": True,
            "severity": severity_for("duplicate_quarantined", "duplicate_payment_id"),
            "amount_paise": int(round(float(row.get("net_settled", 0)) * 100)),
            "reason": "duplicate_payment_id",
            "explanation": "Duplicate payment_id detected; quarantined so it cannot inflate the "
                           "match rate. Finance should confirm it is a genuine double-booking.",
        })

    # ---- 3. ghost bank credits (money in bank, no settlement behind it) ----
    for _, row in result.unmatched_bank.iterrows():
        needs_human += 1
        exceptions += 1
        decisions.append({
            "record_ref": str(row["utr"]),
            "record_type": "bank_credit",
            "match_method": "none",
            "confidence": 0.0,
            "resolution": "unclaimed_bank_credit",
            "triage_action": ESCALATE,
            "needs_human": True,
            "severity": severity_for("unclaimed_bank_credit", "no_matching_settlement"),
            "amount_paise": int(row["credit_paise"]),
            "reason": "no_matching_settlement",
            "explanation": "Bank credit with no matching settlement (or a duplicate credit). "
                           "Genuinely unresolvable from the given data; escalated to a human.",
        })

    stage("Triaged exceptions",
          f"{exceptions} flagged, routed to auto-resolve / explain / escalate",
          time.perf_counter() - ts_triage, {"via": "rules"})

    stats = result.stats
    meta = {
        "dataset_size": total_records,
        "settlement_active": stats["settlement_rows_active"],
        "match_rate_pct": stats["match_rate_pct"],
        "reconciled_rate_pct": stats["reconciled_rate_pct"],
        "elapsed_seconds": round(elapsed, 4),
        "throughput_rps": round(total_records / elapsed, 1) if elapsed > 0 else 0.0,
        "reconciled_total": stats["reconciled_total"],
        "reconciled_amount_paise": stats.get("reconciled_amount_paise", 0),
        "fee_totals_paise": stats.get("fee_totals_paise", {}),
        "exceptions_total": exceptions,
        "needs_human_total": needs_human,
        "llm_calls": llm_calls,
        "llm_verified_count": llm_verified_count,
        "llm_cost_usd_total": round(llm_cost_total, 6),
    }

    if persist:
        ts = time.perf_counter()
        audit = AuditLog()
        audit.start_run(run_id, meta)
        audit.log_decisions(run_id, decisions)
        stage("Verified & logged", f"{len(decisions)} decisions written to the audit trail",
              time.perf_counter() - ts, {"via": "rules"})

    return {"run_id": run_id, "meta": meta, "decisions_logged": len(decisions), "trace": trace}
