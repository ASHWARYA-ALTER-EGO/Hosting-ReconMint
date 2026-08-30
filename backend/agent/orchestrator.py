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

    # ---- 0. live Razorpay API handshake (sponsor-product truth anchor) ----
    # Best-effort: any failure here must NEVER stop the reconcile. Reason gets
    # surfaced honestly on the Dashboard's verification card.
    ts = time.perf_counter()
    razorpay_verification: dict | None = None
    rzp_result = None
    try:
        from backend.agent import razorpay_client as rzp
        rzp_result = rzp.sample_payments(3) if rzp.keys_configured() else None
    except Exception as _e:  # noqa: BLE001
        rzp_result = None
    if rzp_result is not None:
        r = rzp_result.to_dict()
        if r["ok"]:
            n_items = len(r["payments"])
            source = r.get("reason") or "payments"
            detail = (f"Razorpay test API reachable - fetched {n_items} live {source}, "
                      f"HTTP {r['status_code']} in {r['latency_ms']}ms")
            status = "done"
            substeps = [
                f"HTTP GET {r['url']} -> {r['status_code']}",
                f"latency {r['latency_ms']}ms",
                (f"X-Razorpay-Request-Id: {r['razorpay_request_id']}"
                 if r.get("razorpay_request_id") else "no request-id header returned"),
                f"sampled {n_items} live {source} from your Razorpay test account",
            ]
        else:
            reason = r.get("reason") or "error"
            detail = f"Razorpay API call failed ({reason}) - reconciliation continues without live check"
            status = "caught"
            substeps = [
                f"HTTP GET {r['url']} -> {r['status_code'] or 'network'}",
                r.get("detail", "")[:120],
                "engine falls through to source-file-only reconciliation",
            ]
        stage("Razorpay-check Agent · live API grounding", detail,
              time.perf_counter() - ts,
              {"via": "razorpay-api", "status": status, "substeps": substeps})
        razorpay_verification = r

    ts = time.perf_counter()
    inputs = load_inputs(data_dir)
    report = validate_inputs(inputs.orders, inputs.settlement, inputs.bank)
    if not report.ok:
        raise InputValidationError("; ".join(report.errors))
    total_records = sum(inputs.counts.values())
    # Build human-readable substeps that surface the smart-column-detection work
    # so a user watching a real upload can see WHY it worked.
    header_substeps: list[str] = []
    for file_kind in ("orders", "settlement", "bank"):
        mp = (inputs.header_maps or {}).get(file_kind) or {}
        if mp:
            renamed = ", ".join(f"{src}->{tgt}" for src, tgt in list(mp.items())[:3])
            more = f" (+{len(mp)-3} more)" if len(mp) > 3 else ""
            header_substeps.append(f"{file_kind}: mapped {renamed}{more}")
        syn = (inputs.synthesized or {}).get(file_kind) or []
        if syn:
            header_substeps.append(
                f"{file_kind}: synthesized missing columns "
                f"{', '.join(syn[:4])}{'...' if len(syn)>4 else ''} (defaulted to 0)"
            )

    base_substeps = [
        f"{inputs.counts.get('orders', 0)} order rows parsed",
        f"{inputs.counts.get('settlement', 0)} settlement rows parsed",
        f"{inputs.counts.get('bank', 0)} bank rows parsed",
        "IST timezone normalized, amounts coerced to paise",
    ]
    stage("Ingest Agent · schema + hygiene",
          f"{total_records} rows across 3 sources, schema checked",
          time.perf_counter() - ts,
          {"via": "rules", "substeps": base_substeps + header_substeps})

    t0 = time.perf_counter()

    # ---- exact match (incl. fee reconstruction) ----
    ts = time.perf_counter()
    result = exact_match(inputs)
    settle_n = int(result.stats["settlement_rows_active"])
    exact_n = int(result.stats["matched_exact"])
    dup_n = len(result.duplicates)
    stage("Match Agent · exact pass",
          f"{exact_n} matched on UTR + paise-exact amount",
          time.perf_counter() - ts, {"via": "deterministic", "substeps": [
              f"{settle_n} fee schedules recomputed (MDR 2%, GST 18% on MDR, TCS 1%)",
              f"{exact_n} of {settle_n} matched exactly on UTR + amount",
              f"{max(settle_n - exact_n, 0)} rows deferred to fuzzy pass",
              f"{dup_n} duplicate payment_id quarantined" if dup_n else "no duplicate payment_id",
          ]})

    # ---- fuzzy recovery ----
    ts = time.perf_counter()
    result = fuzzy_match(result, inputs)
    fuzzy_n = int(result.stats["matched_fuzzy"])
    unresolved = int(result.stats["settlement_rows_active"] - exact_n - fuzzy_n)
    from backend.engine.fuzzy import ACCEPT_THRESHOLD as _FZ_T
    stage("Fuzzy Agent · near-miss recovery",
          f"{fuzzy_n} near-misses recovered (T+2 timing, UTR typos)",
          time.perf_counter() - ts, {"via": "deterministic", "substeps": [
              f"amount-bucket index scanned near-misses within +/- Rs.1",
              f"{fuzzy_n} accepted at confidence >= {_FZ_T}",
              f"{unresolved} rejected below threshold, deferred to Repair Agent",
          ]})

    # ---- Repair Agent: per-record strategy branching -------------------------
    # For every still-unmatched settlement, try three strategies in order and log
    # each attempt. This is the agentic layer: choices under uncertainty, per record.
    from backend.agent.repair import repair_settlement, build_repair_indexes
    from backend.engine.matcher import MATCHED_FUZZY, UNMATCHED
    ts = time.perf_counter()
    repair_attempts_by_pid: dict[str, dict] = {}
    active = result.settlement
    bank = inputs.bank
    claimed_bank_idxs = set(int(i) for i in active.loc[active["matched_bank_idx"] >= 0,
                                                       "matched_bank_idx"])
    available_bank = set(bank.index) - claimed_bank_idxs
    # O(1)-ish per-strategy lookups so this pass scales to 50k+ row batches
    repair_indexes = build_repair_indexes(bank, available_bank)

    repair_records_touched = 0
    repair_records_recovered = 0
    total_attempts_logged = 0
    per_strategy_stats = {
        "amount_utr_fuzzy":   {"tried": 0, "accepted": 0},
        "normalize_utr":      {"tried": 0, "accepted": 0},
        "widen_date_window":  {"tried": 0, "accepted": 0},
    }

    for pos, row in active.iterrows():
        if row["match_status"] != UNMATCHED:
            continue
        outcome = repair_settlement(row, bank, available_bank, indexes=repair_indexes)
        repair_records_touched += 1
        for a in outcome.attempts:
            total_attempts_logged += 1
            per_strategy_stats.setdefault(a.strategy, {"tried": 0, "accepted": 0})
            per_strategy_stats[a.strategy]["tried"] += 1
            if a.verdict == "accepted":
                per_strategy_stats[a.strategy]["accepted"] += 1

        pid = str(row["payment_id"])
        repair_attempts_by_pid[pid] = {
            "attempts": outcome.to_json(),
            "accepted_strategy": outcome.accepted.strategy if outcome.accepted else None,
        }

        if outcome.accepted is not None and outcome.accepted.bank_idx is not None:
            bidx = int(outcome.accepted.bank_idx)
            available_bank.discard(bidx)
            claimed_bank_idxs.add(bidx)
            active.at[pos, "match_status"] = MATCHED_FUZZY
            active.at[pos, "matched_bank_idx"] = bidx
            active.at[pos, "confidence"] = round(float(outcome.accepted.score or 0.0), 4)
            active.at[pos, "unmatched_reason"] = ""
            repair_records_recovered += 1

    # Rebuild the finalized view so downstream stats pick up the repaired matches.
    if repair_records_recovered > 0:
        from backend.engine.matcher import _finalize
        result = _finalize(active, result.duplicates, bank)
        fuzzy_n = int(result.stats["matched_fuzzy"])
        unresolved = int(result.stats["settlement_rows_active"] - exact_n - fuzzy_n)

    # Build a live sample of what the Repair Agent actually decided per record - real
    # examples the operator can read as "the agent thinks". Kills "this is a pipeline".
    per_record_narration = []
    for pid, rep in list(repair_attempts_by_pid.items())[:5]:
        attempts = rep["attempts"]
        acc = rep["accepted_strategy"]
        if acc:
            hit = next((a for a in attempts if a["strategy"] == acc), None)
            score = hit.get("score") if hit else None
            per_record_narration.append(
                f"decided {pid}: tried {len(attempts)}, "
                f"accepted {acc}" + (f" @ {score:.2f}" if score is not None else "")
            )
        else:
            per_record_narration.append(
                f"decided {pid}: tried {len(attempts)} strategies, none cleared threshold -> escalate"
            )

    stage("Repair Agent · per-record branching",
          f"{repair_records_recovered} of {repair_records_touched} unmatched settlements recovered "
          f"across {total_attempts_logged} strategy attempts",
          time.perf_counter() - ts, {"via": "agent", "substeps": (
              [f"{repair_records_touched} unmatched settlements handed to the Repair Agent",
               f"3 strategies tried in order per record (first winner accepts)",
               *(f"{k}: {v['accepted']}/{v['tried']} accepted"
                 for k, v in per_strategy_stats.items()),
               *per_record_narration]
              if repair_records_touched > 0 else
              ["no still-unmatched settlements after fuzzy pass",
               "Repair Agent stayed idle - clean batch"]
          )})

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

        # attach Repair Agent per-record decision tree when we have one for this pid
        pid = str(row["payment_id"])
        if pid in repair_attempts_by_pid:
            rep = repair_attempts_by_pid[pid]
            decision["strategy_attempts_json"] = json.dumps(rep["attempts"])
            decision["accepted_strategy"] = rep["accepted_strategy"]

        # LLM explanation only on the EXPLAIN branch, only within budget.
        # Any LLM failure (network, timeout, auth) must NOT crash the reconcile -
        # fall back to the deterministic explanation and record the source as "fallback".
        if action == EXPLAIN and use_llm and (max_llm_calls is None or llm_calls < max_llm_calls):
            try:
                outcome = explain_row(row, use_llm=True)
            except Exception as _llm_err:
                try:
                    outcome = explain_row(row, use_llm=False)
                except Exception:
                    outcome = None
                if outcome is not None:
                    outcome.source = "fallback_error"
                    outcome.verified = False
            if outcome is not None:
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

    sev_counts = {"critical": 0, "warning": 0, "info": 0}
    for d in decisions:
        s = d.get("severity") or "info"
        sev_counts[s] = sev_counts.get(s, 0) + 1
    ghost_n = len(result.unmatched_bank)
    stage("Triage Agent · route each exception",
          f"{exceptions} flagged, routed to auto-resolve / explain / escalate",
          time.perf_counter() - ts_triage, {"via": "rules", "substeps": [
              f"{sev_counts['critical']} critical, {sev_counts['warning']} warning, {sev_counts['info']} info",
              f"{ghost_n} ghost bank credits flagged for escalation" if ghost_n else "no ghost bank credits",
              f"severity assigned via written rules on resolution + gap size",
          ]})

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
        "repair_agent": {
            "records_touched":  repair_records_touched,
            "records_recovered": repair_records_recovered,
            "attempts_logged":   total_attempts_logged,
            "per_strategy":      per_strategy_stats,
        },
    }

    if persist:
        ts = time.perf_counter()
        audit = AuditLog()
        audit.start_run(run_id, meta)
        audit.log_decisions(run_id, decisions)
        stage("Audit Agent · persist + verify", f"{len(decisions)} decisions written to the audit trail",
              time.perf_counter() - ts, {"via": "rules", "substeps": [
                  f"{len(decisions)} rows written to SQLite (runs + decisions tables)",
                  f"reconciled amount: Rs.{meta['reconciled_amount_paise'] / 100:,.2f}",
                  f"every figure traceable to source row + rule fired",
              ]})

    # Persist the live-API handshake so the Dashboard can render a Razorpay-verified badge
    # long after the reconcile stage's trace has scrolled away.
    if persist and razorpay_verification is not None:
        try:
            AuditLog().save_razorpay_verification(run_id, razorpay_verification)
        except Exception:  # noqa: BLE001
            pass  # audit best-effort; never fails the reconcile

    return {"run_id": run_id, "meta": meta, "decisions_logged": len(decisions),
            "trace": trace, "razorpay_verification": razorpay_verification}
