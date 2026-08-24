"""
ReconMint Settlement Q&A agent (Phase 1).

An agent you talk to. It does NOT free-form over the data; it runs a bounded loop:

    understand intent -> choose a deterministic tool -> compute -> verify -> answer

The LLM only (a) parses the question into a STRUCTURED intent and (b) phrases the final sentence.
Every figure is computed by deterministic code over the run's audited decisions, and the existing
hallucination verifier rejects any number the phrasing step invents. If nothing can be grounded the
agent refuses. Each step is recorded in a real `trace` so the agency is data, not decoration.
"""

from __future__ import annotations

import json
import time

from backend.agent.audit import AuditLog
from backend.agent import llm
from backend.agent.verifier import verify

# ---- metrics the agent can answer (its "tools") --------------------------
METRICS = {
    "total_fees": "Total fees (MDR + GST + TCS) taken across the batch",
    "reconciled_amount": "Total net amount reconciled",
    "match_rate": "Reconciliation match/rate summary",
    "exceptions_summary": "Count of exceptions by severity and category",
    "amount_mismatch": "Payments where the settled amount was wrong (fee anomalies)",
    "missing_in_bank": "Settlements with no matching bank credit",
    "chargebacks": "Payments reversed by chargeback",
    "duplicates": "Duplicate payments quarantined",
    "payout_variance": "Total rupee variance between expected and actual net",
    "explain_payment": "Explain one specific payment by id",
}

_CATEGORY = {
    "fee_anomaly": "Amount Mismatch",
    "no_matching_settlement": "Missing in Bank",
    "chargeback_no_credit": "Chargeback",
    "duplicate_payment_id": "Duplicate",
    "no_matching_order": "No Order",
}


def _category(reason: str) -> str:
    return _CATEGORY.get(reason, "Other")


def _inr(x: float) -> str:
    return f"₹{x:,.2f}"


# ---- intent parsing (LLM with a deterministic keyword fallback) ----------
INTENT_SYSTEM = (
    "You route a finance question to ONE metric and optional filters. "
    f"Valid metrics: {', '.join(METRICS)}. "
    "Respond as JSON: {\"metric\": <one metric>, \"payment_id\": <id or null>}. "
    "Pick the closest metric; if the user names a payment id, use explain_payment."
)


def _keyword_intent(q: str) -> dict:
    s = q.lower()
    pid = None
    for tok in q.replace("?", " ").split():
        if tok.startswith("pay_"):
            pid = tok
    if pid:
        return {"metric": "explain_payment", "payment_id": pid}
    if "fee" in s or "mdr" in s or "gst" in s or "commission" in s:
        return {"metric": "total_fees"}
    if "missing" in s or "not in bank" in s or "didn't arrive" in s or "no bank" in s:
        return {"metric": "missing_in_bank"}
    if "mismatch" in s or "short" in s or "overcharge" in s or "wrong amount" in s:
        return {"metric": "amount_mismatch"}
    if "chargeback" in s or "reversed" in s or "refund reversal" in s:
        return {"metric": "chargebacks"}
    if "duplicate" in s or "double" in s:
        return {"metric": "duplicates"}
    if "variance" in s or "gap" in s or "difference" in s:
        return {"metric": "payout_variance"}
    if "how many" in s or "exceptions" in s or "unresolved" in s or "issues" in s:
        return {"metric": "exceptions_summary"}
    if "reconcil" in s or "matched" in s or "match rate" in s or "settled" in s:
        return {"metric": "reconciled_amount"}
    return {"metric": "exceptions_summary"}


def parse_intent(question: str) -> tuple[dict, bool]:
    """Return (intent, used_llm)."""
    try:
        resp = llm.chat(INTENT_SYSTEM, question, max_tokens=80)
        data = json.loads(resp.text)
        metric = data.get("metric")
        if metric in METRICS:
            return {"metric": metric, "payment_id": data.get("payment_id")}, True
    except Exception:
        pass
    return _keyword_intent(question), False


# ---- deterministic compute over the run's audited decisions --------------
def _settlement_rows(decisions: list[dict]) -> list[dict]:
    out = []
    for d in decisions:
        if d.get("record_type") != "settlement" or d.get("resolution") == "duplicate_quarantined":
            continue
        led = json.loads(d["ledger_json"]) if d.get("ledger_json") else {}
        out.append({**d, "ledger": led})
    return out


def compute(run_id: str, intent: dict) -> dict:
    """Run the deterministic tool for the intent. Returns {answer, figures, rows, tool}."""
    audit = AuditLog()
    decisions = audit.get_decisions(run_id)
    if not decisions:
        return {"answer": "No reconciliation run is loaded yet.", "figures": [], "rows": [], "tool": "none"}

    rows = _settlement_rows(decisions)
    metric = intent["metric"]
    exc = [d for d in decisions if d.get("needs_human")]

    def fig(label, value):
        return {"label": label, "value": round(float(value), 2), "source": "computed"}

    if metric == "total_fees":
        mdr = sum(r["ledger"].get("mdr", 0) for r in rows)
        gst = sum(r["ledger"].get("gst", 0) for r in rows)
        tcs = sum(r["ledger"].get("tcs", 0) for r in rows)
        total = mdr + gst + tcs
        figures = [fig("MDR", mdr), fig("GST on MDR", gst), fig("TCS", tcs), fig("Total fees", total)]
        answer = (f"Fees took {_inr(total)} across {len(rows)} settlements "
                  f"({_inr(mdr)} MDR + {_inr(gst)} GST + {_inr(tcs)} TCS).")
        return {"answer": answer, "figures": figures, "rows": [], "tool": "aggregate_fees"}

    if metric == "reconciled_amount":
        recon = [r for r in rows if r["resolution"] in ("reconciled_clean", "reconciled_fee")]
        amt = sum(r["ledger"].get("actualNet", 0) for r in recon)
        figures = [fig("Reconciled amount", amt), fig("Reconciled count", len(recon))]
        answer = f"{len(recon)} settlements reconciled for {_inr(amt)} net."
        return {"answer": answer, "figures": figures, "rows": [], "tool": "sum_reconciled"}

    if metric == "match_rate":
        run = audit.get_run(run_id) or {}
        mr, rr = run.get("match_rate_pct", 0), run.get("reconciled_rate_pct", 0)
        figures = [fig("Match rate %", mr), fig("Reconciled rate %", rr)]
        answer = f"Match rate is {mr}% ({rr}% fully reconciled)."
        return {"answer": answer, "figures": figures, "rows": [], "tool": "run_stats"}

    if metric in ("amount_mismatch", "missing_in_bank", "chargebacks", "duplicates"):
        want = {"amount_mismatch": "Amount Mismatch", "missing_in_bank": "Missing in Bank",
                "chargebacks": "Chargeback", "duplicates": "Duplicate"}[metric]
        items = [d for d in exc if (_category(d.get("reason")) == want
                 or (want == "Duplicate" and d.get("resolution") == "duplicate_quarantined"))]
        amt = sum((d.get("amount_paise") or 0) / 100 for d in items)
        listed = [{"id": d["record_ref"], "amount": round((d.get("amount_paise") or 0) / 100, 2),
                   "severity": d.get("severity")} for d in items[:20]]
        figures = [fig(f"{want} count", len(items)), fig(f"{want} amount", amt)]
        answer = f"{len(items)} {want.lower()} exception(s), totalling {_inr(amt)}."
        return {"answer": answer, "figures": figures, "rows": listed, "tool": f"filter_{metric}"}

    if metric == "payout_variance":
        var = sum(abs(r["ledger"].get("variance", 0)) for r in rows if r["ledger"].get("variance"))
        figures = [fig("Total absolute variance", var)]
        answer = f"Total expected-vs-actual net variance is {_inr(var)} across the batch."
        return {"answer": answer, "figures": figures, "rows": [], "tool": "sum_variance"}

    if metric == "exceptions_summary":
        by_sev, by_cat = {}, {}
        for d in exc:
            by_sev[d.get("severity")] = by_sev.get(d.get("severity"), 0) + 1
            c = _category(d.get("reason")) if d.get("resolution") != "duplicate_quarantined" else "Duplicate"
            by_cat[c] = by_cat.get(c, 0) + 1
        figures = [fig("Total exceptions", len(exc))] + [fig(k.title(), v) for k, v in by_sev.items()]
        cat_str = ", ".join(f"{v} {k}" for k, v in by_cat.items())
        answer = f"{len(exc)} exceptions need review: {cat_str}."
        return {"answer": answer, "figures": figures, "rows": [], "tool": "group_exceptions"}

    if metric == "explain_payment":
        pid = intent.get("payment_id")
        match = next((d for d in decisions if d.get("record_ref") == pid), None)
        if not match:
            return {"answer": f"I have no record of {pid} in this run.", "figures": [], "rows": [], "tool": "lookup"}
        led = json.loads(match["ledger_json"]) if match.get("ledger_json") else {}
        v = led.get("variance", 0)
        figures = [fig("Gross", led.get("gross", 0)), fig("Expected net", led.get("expectedNet", 0)),
                   fig("Actual net", led.get("actualNet", 0)), fig("Variance", v)]
        answer = (f"{pid}: gross {_inr(led.get('gross',0))}, expected net {_inr(led.get('expectedNet',0))}, "
                  f"bank net {_inr(led.get('actualNet',0))} — variance {_inr(v)}. "
                  f"{match.get('explanation','')}")
        return {"answer": answer, "figures": figures, "rows": [], "tool": "explain_payment"}

    return {"answer": "I can't map that to something I can compute.", "figures": [], "rows": [], "tool": "none"}


# ---- phrasing (optional LLM, verifier-gated) -----------------------------
PHRASE_SYSTEM = (
    "You rewrite a finance answer in one clear, friendly sentence for a merchant. "
    "Use ONLY the figures given; never invent or alter a number. Return plain text."
)


def _phrase(base_answer: str, figures: list[dict]) -> tuple[str, bool, str]:
    """Return (answer, verified, source). Falls back to the deterministic base if unverified."""
    allowed = {round(abs(float(f["value"])), 2) for f in figures if f["value"] != 0}
    facts = "; ".join(f"{f['label']} = {f['value']}" for f in figures)
    try:
        resp = llm.chat(PHRASE_SYSTEM, f"Facts: {facts}\nDraft: {base_answer}",
                        json_mode=False, max_tokens=120)
        text = resp.text.strip()
        if verify(text, allowed).ok:
            return text, True, "llm_verified"
        return base_answer, True, "llm_rejected_fallback"  # base is deterministic, already grounded
    except llm.LLMError:
        return base_answer, True, "deterministic"


# ---- the agent loop ------------------------------------------------------
def ask(run_id: str, question: str) -> dict:
    trace = []

    def step(title, detail, t0, extra=None):
        s = {"title": title, "detail": detail, "ms": round((time.perf_counter() - t0) * 1000, 1)}
        if extra:
            s.update(extra)
        trace.append(s)

    t = time.perf_counter()
    intent, used_llm = parse_intent(question)
    step("Understood intent", f"metric = {intent['metric']}"
         + (f", payment_id = {intent['payment_id']}" if intent.get("payment_id") else ""),
         t, {"status": "done", "via": "llm" if used_llm else "rules"})

    t = time.perf_counter()
    result = compute(run_id, intent)
    step("Chose tool + computed", f"tool = {result['tool']}, {len(result['figures'])} figures", t,
         {"status": "done", "figures": result["figures"]})

    t = time.perf_counter()
    answer, verified, source = _phrase(result["answer"], result["figures"]) if result["figures"] else (result["answer"], True, "deterministic")
    detail = {
        "llm_verified": "every figure traced to computed data",
        "llm_rejected_fallback": "LLM introduced an unverifiable number - rejected, answered from computed data",
        "deterministic": "answered directly from computed data",
    }.get(source, "grounded")
    step("Verified figures", detail, t,
         {"status": "caught" if source == "llm_rejected_fallback" else "done"})

    step("Answered", source, time.perf_counter(), {"status": "done"})

    return {
        "question": question,
        "intent": intent,
        "answer": answer,
        "figures": result["figures"],
        "rows": result["rows"],
        "verified": verified,
        "source": source,
        "trace": trace,
    }
