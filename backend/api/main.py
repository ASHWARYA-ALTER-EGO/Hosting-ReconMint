"""
ReconMint API (Day 8).

FastAPI layer the dashboard consumes. Endpoints:

  GET  /health                          component status
  POST /reconcile                       upload orders/settlement/bank CSV or Excel -> run + summary
  POST /reconcile/demo                  run on the built-in synthetic dataset (no upload)
  GET  /runs/{run_id}                   run summary
  GET  /runs/{run_id}/exceptions        exceptions needing a human (filter by severity)
  GET  /runs/{run_id}/decisions         all logged decisions
  POST /ask                             question about a run (JSON {run_id, question})

Design notes:
  - The engine is deterministic and CPU-bound (sub-second for a demo batch), so endpoints are plain
    sync handlers - no async theater. FastAPI runs them in a threadpool.
  - Uploads are validated (size, extension, schema) and produce friendly 422 messages, never a
    stack trace. Files are parsed with pandas only (no eval), and CSV export is injection-safe.
"""

from __future__ import annotations

import csv
import io
import json as _json
from datetime import datetime, timezone
import os
import shutil
import tempfile

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse

from backend import config
from backend.agent.audit import AuditLog, db_path
from backend.agent.orchestrator import reconcile
from backend.engine.validation import InputValidationError
from backend.engine.loader import DEFAULT_DATA_DIR, table_extension
from backend.api.models import (
    HealthStatus, HealthComponent, RunMeta, ReconcileResponse, SeverityCounts,
    ExceptionItem, ExceptionList, AskRequest,
)

VERSION = "0.8.0"
UPLOAD_FIELDS = ("orders", "settlement", "bank")

app = FastAPI(title="ReconMint API", version=VERSION,
              description="Three-way Razorpay settlement reconciliation agent.")

# CORS: permissive for local dev / the Cloudflare Pages frontend. Lock to the Pages origin in prod
# via RECONMINT_CORS_ORIGINS (comma-separated).
_raw_origins = os.environ.get("RECONMINT_CORS_ORIGINS", "*")
_origins = [o.strip() for o in _raw_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=None,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=False,
    expose_headers=[],
    max_age=600,
)

audit = AuditLog()


# --------------------------------------------------------------------------- helpers
def _severity_counts(run_id: str) -> SeverityCounts:
    rows = audit.get_exceptions(run_id)
    c = SeverityCounts()
    for r in rows:
        sev = (r.get("severity") or "info")
        setattr(c, sev, getattr(c, sev, 0) + 1)
    return c


def _to_exception_item(d: dict) -> ExceptionItem:
    return ExceptionItem(
        id=d["id"],
        record_ref=d.get("record_ref") or "",
        record_type=d.get("record_type") or "",
        match_method=d.get("match_method") or "none",
        confidence=d.get("confidence") or 0.0,
        resolution=d.get("resolution") or "",
        triage_action=d.get("triage_action") or "",
        severity=d.get("severity"),
        amount_paise=d.get("amount_paise") or 0,
        amount_rupees=round((d.get("amount_paise") or 0) / 100, 2),
        reason=d.get("reason"),
        explanation=d.get("explanation"),
        llm_explanation=d.get("llm_explanation"),
        llm_verified=(None if d.get("llm_verified") is None else bool(d.get("llm_verified"))),
        llm_model=d.get("llm_model"),
        date=d.get("record_date"),
        ledger=(_json.loads(d["ledger_json"]) if d.get("ledger_json") else None),
        strategy_attempts=(_json.loads(d["strategy_attempts_json"])
                           if d.get("strategy_attempts_json") else None),
        accepted_strategy=d.get("accepted_strategy"),
        checklist_state=(_json.loads(d["checklist_state_json"])
                         if d.get("checklist_state_json") else {}),
    )


def _run_meta(run_id: str, extra: dict | None = None) -> RunMeta:
    row = audit.get_run(run_id) or {}
    data = {
        "run_id": run_id,
        "dataset_size": row.get("dataset_size") or 0,
        "settlement_active": row.get("settlement_active") or 0,
        "match_rate_pct": row.get("match_rate_pct") or 0.0,
        "reconciled_rate_pct": row.get("reconciled_rate_pct") or 0.0,
        "elapsed_seconds": row.get("elapsed_seconds") or 0.0,
        "throughput_rps": row.get("throughput_rps") or 0.0,
        "reconciled_total": row.get("reconciled_total") or 0,
        "exceptions_total": row.get("exceptions_total") or 0,
        "needs_human_total": row.get("needs_human_total") or 0,
    }
    if extra:
        data.update({k: extra[k] for k in
                     ("llm_calls", "llm_verified_count", "llm_cost_usd_total",
                      "reconciled_amount_paise", "fee_totals_paise",
                      "repair_agent") if k in extra})
    return RunMeta(**data)


RUNS_DIR = os.path.join(os.path.dirname(DEFAULT_DATA_DIR), "runs")


def _save_uploads_and_reconcile(files: dict[str, UploadFile], use_llm: bool) -> dict:
    tmp = tempfile.mkdtemp(prefix="reconmint_")
    saved_paths: dict[str, str] = {}
    try:
        for field, up in files.items():
            _validate_upload(field, up)
            ext = table_extension(up.filename) or ".csv"
            dest = os.path.join(tmp, f"{field}{ext}")
            with open(dest, "wb") as f:
                shutil.copyfileobj(up.file, f)
            saved_paths[field] = dest
        summary = reconcile(data_dir=tmp, persist=True, use_llm=use_llm)
        # Persist the exact uploaded files under data/runs/<run_id>/ so the UI can
        # preview them and jump to a specific row for any exception.
        run_id = summary["run_id"]
        target = os.path.join(RUNS_DIR, run_id)
        os.makedirs(target, exist_ok=True)
        for field, path in saved_paths.items():
            ext = os.path.splitext(path)[1] or ".csv"
            shutil.copy2(path, os.path.join(target, f"{field}{ext}"))
        return summary
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _validate_upload(field: str, up: UploadFile) -> None:
    if not table_extension(up.filename):
        raise InputValidationError(
            f"{field} must be a CSV or Excel file (.csv, .xlsx, .xlsm, .xls, .xlsb); "
            f"got '{up.filename}'."
        )
    up.file.seek(0, os.SEEK_END)
    size = up.file.tell()
    up.file.seek(0)
    if size > config.MAX_UPLOAD_BYTES:
        raise InputValidationError(
            f"{field} is too large ({size} bytes); limit is {config.MAX_UPLOAD_BYTES} bytes.")
    if size == 0:
        raise InputValidationError(f"{field} is empty.")


def _csv_safe(value) -> str:
    """Neutralize CSV/formula injection when exporting."""
    s = "" if value is None else str(value)
    return "'" + s if s[:1] in ("=", "+", "-", "@") else s


# --------------------------------------------------------------------------- error handling
@app.exception_handler(InputValidationError)
def _handle_validation(_request, exc: InputValidationError):
    return JSONResponse(status_code=422, content={"error": "invalid_input", "detail": str(exc)})


@app.exception_handler(Exception)
def _handle_unexpected(_request, exc: Exception):
    # never leak internals to the client
    return JSONResponse(status_code=500,
                        content={"error": "internal_error",
                                 "detail": "Something went wrong while reconciling."})


# --------------------------------------------------------------------------- endpoints
@app.get("/health", response_model=HealthStatus)
def health() -> HealthStatus:
    components: list[HealthComponent] = []

    # db writable
    try:
        AuditLog().get_run("__healthcheck__")
        components.append(HealthComponent(name="database", ok=True, detail=db_path()))
    except Exception as e:  # noqa: BLE001
        components.append(HealthComponent(name="database", ok=False, detail=str(e)[:120]))

    # seed data present
    have_data = all(os.path.exists(os.path.join(DEFAULT_DATA_DIR, f))
                    for f in ("orders.csv", "settlement.csv", "bank.csv"))
    components.append(HealthComponent(name="seed_data", ok=have_data,
                                      detail="generated" if have_data else "run make data"))

    # llm key (optional; not required for core reconciliation)
    has_key = bool(os.environ.get("OPENAI_API_KEY"))
    components.append(HealthComponent(name="llm", ok=True,
                                      detail=f"key set: {has_key}, model: {config.LLM_MODEL}"))

    status = "ok" if all(c.ok for c in components) else "degraded"
    return HealthStatus(status=status, version=VERSION, components=components)


@app.post("/reconcile", response_model=ReconcileResponse)
def reconcile_upload(
    orders: UploadFile = File(...),
    settlement: UploadFile = File(...),
    bank: UploadFile = File(...),
    use_llm: bool = Form(False),
) -> ReconcileResponse:
    files = {"orders": orders, "settlement": settlement, "bank": bank}
    summary = _save_uploads_and_reconcile(files, use_llm=use_llm)
    run_id = summary["run_id"]
    return ReconcileResponse(
        run_id=run_id,
        meta=_run_meta(run_id, summary["meta"]),
        severity_counts=_severity_counts(run_id),
        decisions_logged=summary["decisions_logged"],
        trace=summary.get("trace", []),
    )


@app.post("/reconcile/demo", response_model=ReconcileResponse)
def reconcile_demo(use_llm: bool = Form(False), max_llm_calls: int = Form(0)) -> ReconcileResponse:
    """Run on the built-in synthetic dataset - convenient for the frontend and the demo video.

    Defaults to no bulk LLM so the demo is instant; explanations are generated on demand per
    exception via POST /decisions/{id}/explain. Pass use_llm=true to pre-generate them.
    """
    summary = reconcile(persist=True, use_llm=use_llm,
                        max_llm_calls=(max_llm_calls or None))
    run_id = summary["run_id"]
    return ReconcileResponse(
        run_id=run_id,
        meta=_run_meta(run_id, summary["meta"]),
        severity_counts=_severity_counts(run_id),
        decisions_logged=summary["decisions_logged"],
        trace=summary.get("trace", []),
    )


@app.get("/runs/{run_id}", response_model=RunMeta)
def get_run(run_id: str):
    row = audit.get_run(run_id)
    if not row:
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"run {run_id} not found"})
    return _run_meta(run_id)


@app.get("/runs/{run_id}/exceptions", response_model=ExceptionList)
def get_exceptions(run_id: str, severity: str | None = None, limit: int = 500):
    rows = audit.get_exceptions(run_id)
    if severity:
        rows = [r for r in rows if (r.get("severity") or "info") == severity]
    # critical first, then warning, then info
    order = {"critical": 0, "warning": 1, "info": 2}
    rows.sort(key=lambda r: order.get(r.get("severity") or "info", 3))
    items = [_to_exception_item(r) for r in rows[:limit]]
    return ExceptionList(run_id=run_id, total=len(rows), items=items)


@app.get("/runs/{run_id}/decisions")
def get_decisions(run_id: str, triage_action: str | None = None, limit: int = 2000):
    rows = audit.get_decisions(run_id, triage_action=triage_action)
    return {"run_id": run_id, "total": len(rows), "items": rows[:limit]}


SEED_QUESTIONS = [
    "How much did fees eat this batch?",
    "Which payments are missing in bank?",
    "How many exceptions need review?",
    "What's the total amount reconciled?",
    "Show me the amount mismatches",
    "What's the total variance in the batch?",
]


@app.get("/ask/examples")
def ask_examples():
    return {"examples": SEED_QUESTIONS}


@app.post("/ask")
def ask(payload: AskRequest):
    """Settlement Q&A agent: understand -> compute (deterministic) -> verify -> answer, with trace."""
    from backend.agent.qa import ask as qa_ask
    question = (payload.question or "").strip()
    if not question:
        raise InputValidationError("Question cannot be empty.")
    if not audit.get_run(payload.run_id):
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"run {payload.run_id} not found"})
    try:
        return qa_ask(payload.run_id, question)
    except Exception:  # noqa: BLE001
        return JSONResponse(
            status_code=500,
            content={"error": "ask_failed",
                     "detail": "The agent could not answer that question. Try again in a moment."},
        )


@app.get("/data/source/{name}")
def source_file(name: str):
    """Serve a generated source CSV (orders / settlement / bank) so the UI can preview real run data."""
    if name not in ("orders", "settlement", "bank"):
        return JSONResponse(status_code=404, content={"error": "not_found", "detail": name})
    path = os.path.join(DEFAULT_DATA_DIR, f"{name}.csv")
    if not os.path.exists(path):
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"{name}.csv not generated yet"})
    return FileResponse(path, media_type="text/csv", filename=f"{name}.csv")


@app.get("/runs/{run_id}/source/{name}")
def run_source_file(run_id: str, name: str):
    """Serve the exact file the user uploaded for this run so the UI can jump to specific rows."""
    if name not in ("orders", "settlement", "bank"):
        return JSONResponse(status_code=404, content={"error": "not_found", "detail": name})
    run_dir = os.path.join(RUNS_DIR, run_id)
    if not os.path.isdir(run_dir):
        # Fall through to demo data for demo runs.
        path = os.path.join(DEFAULT_DATA_DIR, f"{name}.csv")
        if os.path.exists(path):
            return FileResponse(path, media_type="text/csv", filename=f"{name}.csv")
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"no source files for run {run_id}"})
    for ext in (".csv", ".xlsx", ".xls", ".xlsm", ".xlsb"):
        p = os.path.join(run_dir, f"{name}{ext}")
        if os.path.exists(p):
            media = "text/csv" if ext == ".csv" else "application/octet-stream"
            return FileResponse(p, media_type=media, filename=f"{name}{ext}")
    return JSONResponse(status_code=404, content={"error": "not_found",
                                                  "detail": f"{name} not saved for run {run_id}"})


@app.get("/runs/{run_id}/cash-position")
def run_cash_position(run_id: str):
    """Cash position for a batch, in four mutually-exclusive buckets, computed
    deterministically from the audited decisions of ONE run.

    - cleared    reconciled settlements matched to a bank credit (money in your account)
    - in_flight  settlements Razorpay confirmed but the bank has not yet credited
    - at_risk    chargebacks / disputed payments being clawed back
    - ghost      bank credits with no matching settlement (cash you have but can't attribute)

    net_available = cleared + ghost - at_risk. in_flight is deliberately excluded so the
    controller sees what is actually spendable RIGHT NOW.
    """
    if not audit.get_run(run_id):
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"run {run_id} not found"})
    rows = audit.get_decisions(run_id)

    def bucket():
        return {"amount_paise": 0, "count": 0, "ids": []}

    buckets = {"cleared": bucket(), "in_flight": bucket(),
               "at_risk": bucket(), "ghost": bucket()}

    IN_FLIGHT_REASONS = {"no_bank_row_with_utr", "bank_date_mismatch",
                         "bank_utr_found_amount_differs"}

    for r in rows:
        rec_type = r.get("record_type") or ""
        resolution = r.get("resolution") or ""
        reason = r.get("reason") or ""
        amt = int(r.get("amount_paise") or 0)
        ref = r.get("record_ref") or ""

        # Ghost bank credit: money is in the bank but no matching settlement.
        if rec_type == "bank_credit" or reason == "no_matching_settlement":
            key = "ghost"
        # Chargeback / dispute reversing an earlier credit.
        elif reason == "chargeback_no_credit" or "chargeback" in reason:
            key = "at_risk"
        # Reconciled cleanly (with or without fee anomaly cleared) - money landed.
        elif resolution in ("reconciled_clean", "reconciled_fee"):
            key = "cleared"
        # Settlement Razorpay recorded but bank has not shown yet (or is off).
        elif reason in IN_FLIGHT_REASONS or resolution == "still_unmatched":
            key = "in_flight"
        # Fee anomaly: net landed but doesn't match expected — still in the bank, treat as cleared.
        elif resolution == "exception_fee_anomaly":
            key = "cleared"
        # Duplicates never affect cash (quarantined) — skip.
        elif resolution == "duplicate_quarantined":
            continue
        else:
            # Unknown — keep out of cash math so we never inflate the position.
            continue

        b = buckets[key]
        b["amount_paise"] += abs(amt)
        b["count"] += 1
        if len(b["ids"]) < 25:
            b["ids"].append(ref)

    gross = sum(b["amount_paise"] for b in buckets.values())
    net_available = (buckets["cleared"]["amount_paise"]
                     + buckets["ghost"]["amount_paise"]
                     - buckets["at_risk"]["amount_paise"])
    exposure = buckets["at_risk"]["amount_paise"] + buckets["in_flight"]["amount_paise"]

    from datetime import date
    return {
        "run_id": run_id,
        "as_of": date.today().isoformat(),
        "currency": "INR",
        "buckets": buckets,
        "totals": {
            "gross_settled_paise": gross,
            "net_available_paise": net_available,
            "exposure_paise": exposure,
        },
    }


def _add_business_days(start_iso: str, days: int) -> str | None:
    """Add N business days (Mon-Fri) to an ISO date. Returns ISO date or None on bad input."""
    from datetime import date, timedelta
    try:
        d = date.fromisoformat(start_iso)
    except (ValueError, TypeError):
        return None
    added = 0
    while added < days:
        d = d + timedelta(days=1)
        if d.weekday() < 5:  # 0=Mon .. 4=Fri
            added += 1
    return d.isoformat()


@app.get("/runs/{run_id}/cash-forecast")
def run_cash_forecast(run_id: str, horizon_days: int = 7, t_plus: int = 2,
                      as_of: str | None = None):
    """Forward cash forecast for the next `horizon_days` calendar days.

    Every settlement that Razorpay confirmed but the bank has NOT yet credited
    (in-flight bucket) is projected to land on `record_date + T+<t_plus> business days`.
    Anything whose projected date is already in the past goes into `past_due`.

    Response shape:
      {
        "run_id": ..., "as_of": "YYYY-MM-DD", "horizon_days": N, "t_plus": 2,
        "currency": "INR",
        "past_due": { "amount_paise": ..., "count": ..., "ids": [...] },
        "days": [{ "date": "YYYY-MM-DD", "amount_paise": ..., "count": ..., "ids": [...] }, ...],
        "totals": {
          "in_horizon_paise": ...,       // sum of `days`
          "past_due_paise": ...,          // outside horizon, already overdue
          "beyond_horizon_paise": ...,    // will land after the horizon
        }
      }
    """
    if not audit.get_run(run_id):
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"run {run_id} not found"})
    if horizon_days < 1 or horizon_days > 60:
        raise InputValidationError("horizon_days must be between 1 and 60.")
    if t_plus < 0 or t_plus > 10:
        raise InputValidationError("t_plus must be between 0 and 10.")

    from datetime import date, timedelta
    today = date.fromisoformat(as_of) if as_of else date.today()

    # In-flight = settlements Razorpay recorded but bank has not yet credited.
    IN_FLIGHT_REASONS = {"no_bank_row_with_utr", "bank_date_mismatch",
                         "bank_utr_found_amount_differs"}
    IN_FLIGHT_RESOLUTIONS = {"still_unmatched"}

    rows = audit.get_decisions(run_id)
    horizon_end = today + timedelta(days=horizon_days)

    days_map: dict[str, dict] = {}
    past_due = {"amount_paise": 0, "count": 0, "ids": []}
    beyond_amount = 0
    beyond_count = 0

    for r in rows:
        rec_type = r.get("record_type") or ""
        if rec_type != "settlement":
            continue
        resolution = r.get("resolution") or ""
        reason = r.get("reason") or ""
        # Match the cash-position definition of in_flight exactly: exclude chargebacks
        # (those live in at_risk) and duplicates (quarantined, don't affect cash).
        if reason == "chargeback_no_credit" or "chargeback" in reason:
            continue
        if resolution == "duplicate_quarantined":
            continue
        if not (reason in IN_FLIGHT_REASONS or resolution in IN_FLIGHT_RESOLUTIONS):
            continue
        rec_date = r.get("record_date")
        if not rec_date:
            continue
        projected_iso = _add_business_days(rec_date, t_plus)
        if projected_iso is None:
            continue
        projected = date.fromisoformat(projected_iso)
        amt = abs(int(r.get("amount_paise") or 0))
        ref = r.get("record_ref") or ""

        if projected < today:
            past_due["amount_paise"] += amt
            past_due["count"] += 1
            if len(past_due["ids"]) < 25:
                past_due["ids"].append(ref)
        elif projected >= today and projected <= horizon_end:
            key = projected_iso
            bkt = days_map.setdefault(key, {"date": key, "amount_paise": 0,
                                            "count": 0, "ids": []})
            bkt["amount_paise"] += amt
            bkt["count"] += 1
            if len(bkt["ids"]) < 15:
                bkt["ids"].append(ref)
        else:
            beyond_amount += amt
            beyond_count += 1

    # Emit a bar for every day in the window (empty days included, so the chart is dense)
    days = []
    for i in range(horizon_days + 1):
        iso = (today + timedelta(days=i)).isoformat()
        days.append(days_map.get(iso, {"date": iso, "amount_paise": 0,
                                       "count": 0, "ids": []}))

    return {
        "run_id": run_id,
        "as_of": today.isoformat(),
        "horizon_days": horizon_days,
        "t_plus": t_plus,
        "currency": "INR",
        "past_due": past_due,
        "beyond_horizon": {"amount_paise": beyond_amount, "count": beyond_count},
        "days": days,
        "totals": {
            "in_horizon_paise": sum(d["amount_paise"] for d in days),
            "in_horizon_count": sum(d["count"] for d in days),
            "past_due_paise": past_due["amount_paise"],
            "beyond_horizon_paise": beyond_amount,
        },
    }


@app.get("/runs/{run_id}/razorpay-verification")
def run_razorpay_verification(run_id: str):
    """Return the live Razorpay API handshake that ran when this batch was ingested.

    Payload includes: HTTP status, latency, X-Razorpay-Request-Id (the id an auditor
    can quote back to Razorpay support), the URL that was hit, and up to N shaped
    live records from the merchant's test account (real payments if any, otherwise
    real orders — that's transparent to the caller via the `reason` field).
    """
    if not audit.get_run(run_id):
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"run {run_id} not found"})
    v = audit.get_razorpay_verification(run_id)
    if not v:
        return JSONResponse(status_code=404, content={
            "error": "no_verification",
            "detail": ("No live Razorpay API handshake stored for this run. "
                       "This means the run was reconciled before the sponsor-API step was "
                       "added, or RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET were not set."),
        })
    return v


@app.get("/razorpay/health")
def razorpay_health():
    """One-shot: is the sponsor API reachable RIGHT NOW with our keys?"""
    from backend.agent import razorpay_client as rzp
    if not rzp.keys_configured():
        return {"ok": False, "reason": "missing_keys",
                "detail": "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set."}
    return rzp.probe_keys().to_dict()


@app.get("/runs/{run_id}/quality-signals")
def run_quality_signals(run_id: str):
    """Ground-truth-free quality signals for any run (uploaded or demo).

    Precision/Recall/F1 require an answer key we do not have for user uploads.
    Instead we compute six *proxy* signals a controller can trust immediately,
    each derivable from the audited decisions alone:

      - fuzzy_confidence:        distribution of confidence on accepted fuzzy matches
      - fee_schedule_adherence:  fraction of settlements whose bank net matches the
                                 reconstructed schedule within Rs.1 (int-paise tolerance)
      - triage_certainty:        share of decisions classified either 'reconciled' or a
                                 well-known exception reason (vs 'unknown_resolution')
      - duplicate_detection:     count of duplicate_payment_id quarantined
      - cross_source_coverage:   how many settlements were matched to a bank credit
      - integrity:               data-quality flags (blank UTR, zero-amount, missing date)

    Each signal has: value, label, grade (A/B/C/D), and a short rationale.
    Grades are NOT F1 — they are heuristics for "does this batch look trustworthy".
    """
    if not audit.get_run(run_id):
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"run {run_id} not found"})
    rows = audit.get_decisions(run_id)

    settlements = [r for r in rows if r.get("record_type") == "settlement"
                   and r.get("resolution") != "duplicate_quarantined"]
    n_settle = len(settlements)

    # --- fuzzy confidence -----------------------------------------------------
    fuzzy_confs = [float(r.get("confidence") or 0.0)
                   for r in settlements if r.get("match_method") == "fuzzy"]
    fuzzy_mean = sum(fuzzy_confs) / len(fuzzy_confs) if fuzzy_confs else None
    fuzzy_min = min(fuzzy_confs) if fuzzy_confs else None
    fuzzy_max = max(fuzzy_confs) if fuzzy_confs else None

    # --- fee schedule adherence: variance within Rs.1 -------------------------
    adherent = 0
    checked = 0
    for r in settlements:
        raw = r.get("ledger_json")
        if not raw: continue
        try:
            led = _json.loads(raw)
        except (ValueError, TypeError):
            continue
        checked += 1
        var_paise = abs(int(round(float(led.get("variance", 0)) * 100)))
        if var_paise <= 100:  # within Rs.1
            adherent += 1
    adherence_pct = (adherent / checked * 100) if checked > 0 else 0.0

    # --- triage certainty: known reason vs unknown ---------------------------
    known_reasons = {"", None, "fee_anomaly", "no_matching_settlement",
                     "no_bank_row_with_utr", "bank_date_mismatch",
                     "bank_utr_found_amount_differs", "chargeback_no_credit",
                     "duplicate_payment_id", "no_matching_order"}
    unknown = sum(1 for r in rows
                  if r.get("needs_human") and (r.get("reason") not in known_reasons))
    total_flagged = sum(1 for r in rows if r.get("needs_human"))
    triage_certainty_pct = (100.0 - (unknown / total_flagged * 100)) if total_flagged else 100.0

    # --- duplicate detection --------------------------------------------------
    duplicates = sum(1 for r in rows if r.get("resolution") == "duplicate_quarantined")

    # --- cross-source coverage: matched vs total settlements -----------------
    matched = sum(1 for r in settlements
                  if r.get("match_method") in ("exact", "fuzzy"))
    coverage_pct = (matched / n_settle * 100) if n_settle else 0.0

    # --- data integrity flags (from persisted decisions - what the engine saw) --
    blank_utr = sum(1 for r in rows if r.get("record_type") == "bank_credit"
                    and not (r.get("record_ref") or "").strip())
    zero_amount = sum(1 for r in rows if int(r.get("amount_paise") or 0) == 0)
    missing_date = sum(1 for r in settlements if not r.get("record_date"))
    integrity_ok = (blank_utr + zero_amount + missing_date) == 0

    def grade(pct: float, thresholds=(95, 85, 70)) -> str:
        if pct >= thresholds[0]: return "A"
        if pct >= thresholds[1]: return "B"
        if pct >= thresholds[2]: return "C"
        return "D"

    signals = [
        {
            "key": "cross_source_coverage",
            "label": "Cross-source coverage",
            "value_pct": round(coverage_pct, 2),
            "detail": f"{matched}/{n_settle} settlements matched to a bank credit (exact or fuzzy)",
            "grade": grade(coverage_pct),
            "why": "How many payments the engine successfully traced end-to-end.",
        },
        {
            "key": "fee_schedule_adherence",
            "label": "Fee-schedule adherence",
            "value_pct": round(adherence_pct, 2),
            "detail": f"{adherent}/{checked} settlements match the reconstructed fee schedule within Rs.1",
            "grade": grade(adherence_pct),
            "why": "Independent check — if the bank net matches the fee formula, the batch is arithmetically sound.",
        },
        {
            "key": "triage_certainty",
            "label": "Triage certainty",
            "value_pct": round(triage_certainty_pct, 2),
            "detail": f"{total_flagged - unknown}/{max(total_flagged, 1)} flagged records have a known reason code",
            "grade": grade(triage_certainty_pct),
            "why": "'unknown_resolution' means the engine couldn't classify — a red flag on data shape.",
        },
        {
            "key": "fuzzy_confidence",
            "label": "Fuzzy match quality",
            "value_pct": round((fuzzy_mean or 0.0) * 100, 2) if fuzzy_confs else None,
            "detail": (f"n={len(fuzzy_confs)} · mean {fuzzy_mean:.3f} · min {fuzzy_min:.3f} · max {fuzzy_max:.3f}"
                       if fuzzy_confs else "no fuzzy matches — all matched exactly"),
            "grade": grade((fuzzy_mean or 1.0) * 100) if fuzzy_confs else "A",
            "why": "Mean confidence of accepted near-misses. High mean = engine is not stretching.",
        },
        {
            "key": "duplicate_detection",
            "label": "Duplicates quarantined",
            "value_pct": None,
            "detail": f"{duplicates} duplicate payment_id detected and quarantined",
            "grade": "A" if duplicates == 0 else ("B" if duplicates <= 5 else "C"),
            "why": "Duplicates that made it through would double-count cash — good if zero, tolerable if handled.",
        },
        {
            "key": "integrity",
            "label": "Input integrity",
            "value_pct": None,
            "detail": (f"blank UTR: {blank_utr} · zero-amount: {zero_amount} · missing date: {missing_date}"
                       if not integrity_ok else "no blank UTR, no zero-amount, no missing dates"),
            "grade": "A" if integrity_ok else ("C" if (blank_utr + zero_amount + missing_date) <= 5 else "D"),
            "why": "Bad rows in = uncertain rows out. Integrity flags cap how much you can trust the batch.",
        },
    ]

    # composite score: weighted average of pct-bearing signals
    weighted = [(s["value_pct"], w) for s, w in zip(signals, (30, 30, 15, 15, 0, 0))
                if s["value_pct"] is not None]
    total_w = sum(w for _, w in weighted) or 1
    composite = sum(v * w for v, w in weighted) / total_w
    composite_grade = grade(composite)

    return {
        "run_id": run_id,
        "signals": signals,
        "composite": {
            "score_pct": round(composite, 2),
            "grade": composite_grade,
            "note": ("Proxy quality score - NOT precision/recall (that needs an answer key)."
                     " Weighted from coverage (30%), fee adherence (30%), triage certainty (15%),"
                     " fuzzy match quality (15%). Grades A>=95, B>=85, C>=70."),
        },
    }


@app.get("/runs/{run_id}/tax-exposure")
def run_tax_exposure(run_id: str):
    """Tax-line matcher panel. Surfaces the fee reconstruction as tax facts.

    For each settlement decision in this run we read the audited ledger and:

      - aggregate MDR, GST-on-MDR, TCS taken across the whole batch;
      - compute the effective tax rate = (MDR + GST + TCS) / gross_settled;
      - list every settlement whose bank net differs from the fee-schedule
        expected net -> a *tax exposure*, per-record, with sign:
          negative variance -> merchant OVER-CHARGED (recover ₹X from gateway),
          positive variance -> merchant UNDER-CHARGED (may owe ₹X back).

    The "exposure" total is the sum of |variance| across all anomaly settlements -
    the amount a controller should investigate and either recover or reserve.
    """
    if not audit.get_run(run_id):
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"run {run_id} not found"})
    rows = audit.get_decisions(run_id)

    mdr_p = gst_p = tcs_p = 0
    gross_p = 0
    n_settlements = 0

    anomalies = []   # rows with variance != 0
    over_paise = 0   # merchant over-charged (negative variance)
    under_paise = 0  # merchant under-charged (positive variance)

    for r in rows:
        if r.get("record_type") != "settlement":
            continue
        if r.get("resolution") == "duplicate_quarantined":
            continue
        ledger_raw = r.get("ledger_json")
        if not ledger_raw:
            continue
        try:
            led = _json.loads(ledger_raw)
        except (ValueError, TypeError):
            continue

        n_settlements += 1
        # ledger values are already ₹, keep math in paise for zero drift
        mdr_p += int(round(float(led.get("mdr", 0)) * 100))
        gst_p += int(round(float(led.get("gst", 0)) * 100))
        tcs_p += int(round(float(led.get("tcs", 0)) * 100))
        gross_p += int(round(float(led.get("gross", 0)) * 100))

        var_paise = int(round(float(led.get("variance", 0)) * 100))
        if var_paise != 0:
            direction = "over_charged" if var_paise < 0 else "under_charged"
            anomalies.append({
                "payment_id": r.get("record_ref") or "",
                "date": r.get("record_date"),
                "gross_paise":         int(round(float(led.get("gross", 0)) * 100)),
                "expected_net_paise":  int(round(float(led.get("expectedNet", 0)) * 100)),
                "actual_net_paise":    int(round(float(led.get("actualNet", 0)) * 100)),
                "mdr_paise":           int(round(float(led.get("mdr", 0)) * 100)),
                "gst_paise":           int(round(float(led.get("gst", 0)) * 100)),
                "tcs_paise":           int(round(float(led.get("tcs", 0)) * 100)),
                "variance_paise":      var_paise,
                "direction":           direction,
                "severity":            r.get("severity"),
            })
            if var_paise < 0:
                over_paise += -var_paise
            else:
                under_paise += var_paise

    # sort anomalies by |variance| desc, keep top 50 for the drill-down
    anomalies.sort(key=lambda a: abs(a["variance_paise"]), reverse=True)
    tax_total_p = mdr_p + gst_p + tcs_p
    effective_rate = (tax_total_p / gross_p * 100) if gross_p > 0 else 0.0
    # expected fee ratios (fixed Razorpay schedule the reconstructor uses)
    EXPECTED = {"mdr_pct": 2.00, "gst_on_mdr_pct": 18.00, "tcs_pct": 1.00}

    return {
        "run_id": run_id,
        "settlements_analyzed": n_settlements,
        "currency": "INR",
        "aggregate_paise": {
            "gross":     gross_p,
            "mdr":       mdr_p,
            "gst":       gst_p,
            "tcs":       tcs_p,
            "tax_total": tax_total_p,
        },
        "effective_rate_pct":   round(effective_rate, 3),
        "expected_rates_pct":   EXPECTED,
        "exposure_paise": {
            "over_charged":  over_paise,   # merchant should RECOVER this
            "under_charged": under_paise,  # merchant may OWE this back
            "gross_exposure": over_paise + under_paise,
        },
        "anomaly_count": len(anomalies),
        "anomalies": anomalies[:50],
    }


@app.get("/runs/{run_id}/breakdown")
def run_breakdown(run_id: str):
    """Mutually-exclusive bucket counts for the waterfall/stacked bar, computed from the
    persisted decisions of ANY run (uploaded or demo). No ground truth required."""
    if not audit.get_run(run_id):
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"run {run_id} not found"})
    rows = audit.get_decisions(run_id)
    buckets = {"auto_matched": 0, "fuzzy_matched": 0, "fee_anomaly": 0,
               "unresolved": 0, "duplicates": 0, "ghost_credits": 0}
    for r in rows:
        rec_type = r.get("record_type") or ""
        method = r.get("match_method") or "none"
        resolution = r.get("resolution") or ""
        reason = r.get("reason") or ""
        if rec_type == "bank_credit" or reason == "no_matching_settlement":
            buckets["ghost_credits"] += 1
        elif reason == "duplicate_payment_id" or resolution == "duplicate_quarantined":
            buckets["duplicates"] += 1
        elif reason == "fee_anomaly" or resolution == "exception_fee_anomaly":
            buckets["fee_anomaly"] += 1
        elif resolution in ("reconciled_clean", "reconciled_fee"):
            if method == "fuzzy":
                buckets["fuzzy_matched"] += 1
            else:
                buckets["auto_matched"] += 1
        else:
            buckets["unresolved"] += 1
    buckets["total"] = sum(buckets.values())
    return buckets


@app.get("/eval/demo")
def eval_demo():
    """Run the eval harness on the built-in synthetic data and return honest accuracy metrics.

    This powers the dashboard Accuracy card (precision/recall/F1 + false-positive cost) and the
    real mutually-exclusive reconciliation breakdown. Only available for the demo dataset, because
    precision/recall require the ground-truth answer key, which uploaded files do not have.
    """
    from backend.eval.harness import run_eval
    res = run_eval()
    ed = res["exception_detection"]
    return {
        "match_rate_pct": res["match_rate_pct"],
        "reconciled_rate_pct": res["reconciled_rate_pct"],
        "throughput_records_per_s": res["throughput_records_per_s"],
        "elapsed_seconds": res["elapsed_seconds"],
        "dataset_size": res["dataset_size"],
        "accuracy": {
            "precision": ed["precision"], "recall": ed["recall"], "f1": ed["f1"],
            "false_positives": ed["fp"], "false_negatives": ed["fn"],
            "true_positives": ed["tp"], "true_negatives": ed["tn"],
        },
        "breakdown": res["breakdown"],
        "per_category_detection": res["per_category_detection"],
    }


@app.post("/decisions/{decision_id}/explain")
def explain_decision(decision_id: int):
    """Generate one verified LLM explanation on demand for a stored exception."""
    d = audit.get_decision(decision_id)
    if not d:
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"decision {decision_id} not found"})
    if d.get("llm_explanation"):
        return {"decision_id": decision_id, "explanation": d["llm_explanation"],
                "verified": bool(d.get("llm_verified")), "model": d.get("llm_model"), "cached": True}

    from backend.agent.explainer import explain_from_ledger
    ledger = _json.loads(d["ledger_json"]) if d.get("ledger_json") else {}
    outcome = explain_from_ledger(ledger, d.get("reason") or d.get("resolution") or "")
    audit.update_llm(decision_id, outcome.text, outcome.source, outcome.verified,
                     outcome.model, outcome.cost_usd, outcome.latency_ms)
    return {"decision_id": decision_id, "explanation": outcome.text,
            "verified": outcome.verified, "model": outcome.model, "cached": False}


_VALID_REASONS = {"confirmed", "override", "false_positive", "escalated"}

# Human-facing wording for each resolution reason, used in the memo + downstream artifacts.
_REASON_NARRATIVE = {
    "confirmed":      ("Confirmed match", "The engine's flag was correct and the operator has actioned it."),
    "override":       ("Manual override", "Operator overrode the engine's decision on this specific record."),
    "false_positive": ("False positive", "Engine wrongly flagged this record; no downstream action needed."),
    "escalated":      ("Escalated to finance", "Handed to the finance / payment-ops queue for out-of-band handling."),
}


def _build_adjustment_memo(decision: dict, run_id: str) -> dict:
    """Assemble the machine-readable adjustment memo for one resolved decision.

    This is the artifact that CLOSES the finance-ops loop. Every downstream system
    (accounting, ERP, ops queue, Slack) can consume this same payload - the frontend
    also renders it as a printable HTML memo via /decisions/{id}/adjustment-memo.html.
    """
    ledger = {}
    if decision.get("ledger_json"):
        try:
            ledger = _json.loads(decision["ledger_json"])
        except (ValueError, TypeError):
            ledger = {}
    reason = decision.get("resolution_reason") or "confirmed"
    label, narrative = _REASON_NARRATIVE.get(reason, (reason, ""))
    variance_paise = int(round(float(ledger.get("variance", 0)) * 100))
    downstream = {
        "confirmed":      "no_action",
        "override":       "post_journal_entry",
        "false_positive": "close_and_ignore",
        "escalated":      "route_to_ops_queue",
    }.get(reason, "no_action")

    return {
        "memo_type": "reconmint.adjustment_memo",
        "memo_version": 1,
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "issued_by": "reconmint-agent",
        "run_id": run_id,
        "decision_id": decision["id"],
        "record": {
            "payment_id":     decision.get("record_ref"),
            "record_type":    decision.get("record_type"),
            "settled_date":   decision.get("record_date"),
            "amount_paise":   int(decision.get("amount_paise") or 0),
            "amount_rupees":  round((decision.get("amount_paise") or 0) / 100, 2),
        },
        "reconciliation": {
            "engine_reason":       decision.get("reason"),
            "engine_resolution":   decision.get("resolution"),
            "match_method":        decision.get("match_method"),
            "confidence":          decision.get("confidence"),
            "severity":            decision.get("severity"),
            "explanation":         decision.get("llm_explanation") or decision.get("explanation"),
            "ledger":              ledger,
            "variance_paise":      variance_paise,
        },
        "resolution": {
            "reason_code":    reason,
            "reason_label":   label,
            "narrative":      narrative,
            "note":           decision.get("resolution_note"),
            "resolved_at":    decision.get("resolved_at"),
        },
        "downstream": {
            "action":     downstream,
            "target":     {
                "post_journal_entry":   "erp/general-ledger",
                "route_to_ops_queue":   "ops/payment-disputes",
                "close_and_ignore":     "audit-trail",
                "no_action":            "audit-trail",
            }.get(downstream, "audit-trail"),
            # Simulated webhook payload — the exact JSON a real deploy would POST.
            "webhook_example": {
                "url":     "https://ops.example.com/webhooks/reconmint",
                "method":  "POST",
                "headers": {"Content-Type": "application/json",
                            "X-ReconMint-Signature": "sha256=<hmac>"},
                "body": {
                    "event":          "adjustment.resolved",
                    "run_id":         run_id,
                    "decision_id":    decision["id"],
                    "payment_id":     decision.get("record_ref"),
                    "action":         downstream,
                    "amount_paise":   int(decision.get("amount_paise") or 0),
                    "variance_paise": variance_paise,
                    "reason_code":    reason,
                },
            },
        },
        "audit": {
            "source":   "reconmint",
            "engine":   "int-paise deterministic",
            "verified": True,
        },
    }


@app.post("/decisions/{decision_id}/resolve")
def resolve_decision(decision_id: int, payload: dict | None = None):
    """Mark one exception as handled by a human. Body: {"reason": one of
    confirmed|override|false_positive|escalated, "note": optional string}.

    - confirmed        The engine's flag was correct and the operator has actioned it.
    - override         Operator disagrees with the engine on this specific record.
    - false_positive   Engine wrongly flagged; feeds precision metrics on the next eval.
    - escalated        Sent to finance / a payment ops queue; still counted as handled.
    """
    payload = payload or {}
    reason = (payload.get("reason") or "").strip() or None
    note = (payload.get("note") or "").strip() or None
    if reason is not None and reason not in _VALID_REASONS:
        raise InputValidationError(
            f"reason must be one of {sorted(_VALID_REASONS)}; got '{reason}'.")
    if note is not None and len(note) > 500:
        raise InputValidationError("note is too long (max 500 characters).")
    ok = audit.resolve(decision_id, reason=reason, note=note)
    if not ok:
        return JSONResponse(status_code=404,
                            content={"error": "not_found",
                                     "detail": f"no open exception with id {decision_id}"})
    return {"decision_id": decision_id, "resolved": True,
            "resolution_reason": reason, "resolution_note": note}


def _find_decision_and_run(decision_id: int) -> tuple[dict | None, str | None]:
    d = audit.get_decision(decision_id)
    if not d:
        return None, None
    return d, d.get("run_id")


@app.get("/decisions/{decision_id}/adjustment-memo")
def adjustment_memo_json(decision_id: int):
    """The closed-loop artifact: full JSON adjustment memo for one resolved decision.

    Consumers: accounting systems (post_journal_entry), ops queues (route_to_ops_queue),
    audit archives. The `downstream.webhook_example` field shows the exact payload that
    would be POST'ed to a real endpoint in production. `Content-Disposition: attachment`
    so the browser saves it directly.
    """
    d, run_id = _find_decision_and_run(decision_id)
    if not d:
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"no decision with id {decision_id}"})
    if not d.get("resolved"):
        return JSONResponse(status_code=409, content={"error": "not_resolved",
                                                      "detail": "resolve this decision first, then download its memo"})
    memo = _build_adjustment_memo(d, run_id or "")
    body = _json.dumps(memo, indent=2).encode("utf-8")
    fname = f"reconmint-memo-{decision_id}.json"
    return StreamingResponse(
        io.BytesIO(body),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@app.get("/decisions/{decision_id}/adjustment-memo.html")
def adjustment_memo_html(decision_id: int):
    """Print-ready HTML version of the adjustment memo. Opens in a new tab; the
    operator prints or saves as PDF from the browser."""
    d, run_id = _find_decision_and_run(decision_id)
    if not d:
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"no decision with id {decision_id}"})
    if not d.get("resolved"):
        return JSONResponse(status_code=409, content={"error": "not_resolved",
                                                      "detail": "resolve this decision first, then download its memo"})
    memo = _build_adjustment_memo(d, run_id or "")
    m = memo
    rec = m["record"]; res = m["resolution"]; recon = m["reconciliation"]; ds = m["downstream"]
    variance_rupees = round(recon["variance_paise"] / 100, 2)
    variance_sign = "+" if recon["variance_paise"] >= 0 else "−"
    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Adjustment Memo #{decision_id}</title>
<style>
  body {{ font-family: 'SF Mono', 'Consolas', monospace; background: #FBFBF3; color: #1F2A1A;
         margin: 0; padding: 40px; }}
  .memo {{ max-width: 720px; margin: 0 auto; background: #fff; border: 2px solid #1F2A1A;
          padding: 40px; box-shadow: 0 2px 20px rgba(31,42,26,0.08); position: relative; }}
  .stamp {{ position: absolute; top: 24px; right: 32px; padding: 6px 14px;
           border: 2px solid #B5432F; color: #B5432F; font-weight: 700; text-transform: uppercase;
           letter-spacing: 0.14em; font-size: 11px; transform: rotate(-6deg); }}
  h1 {{ margin: 0 0 4px 0; font-size: 22px; letter-spacing: -0.01em; }}
  .subtitle {{ color: #5C6752; font-size: 12px; margin-bottom: 24px; }}
  .section {{ margin: 20px 0; }}
  .section h2 {{ font-size: 10px; text-transform: uppercase; letter-spacing: 0.16em;
                 color: #B5432F; border-bottom: 1px solid rgba(31,42,26,0.14);
                 padding-bottom: 6px; margin: 0 0 10px 0; }}
  .kv {{ display: grid; grid-template-columns: 180px 1fr; row-gap: 4px; font-size: 13px; }}
  .kv .k {{ color: #5C6752; }}
  .kv .v {{ color: #1F2A1A; font-weight: 600; }}
  .amount {{ font-size: 28px; font-weight: 700; margin: 4px 0; }}
  .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid rgba(31,42,26,0.14);
             font-size: 10px; color: #5C6752; }}
  .downstream {{ background: rgba(31,42,26,0.04); padding: 12px; border-radius: 6px;
                 font-size: 11px; margin-top: 10px; white-space: pre-wrap; word-break: break-word; }}
  @media print {{ body {{ padding: 0; background: #fff; }}
                  .memo {{ box-shadow: none; border-color: #000; }} }}
</style></head><body>
<div class="memo">
  <div class="stamp">Verified</div>
  <div class="subtitle">— Reconciliation adjustment memo</div>
  <h1>Memo #{decision_id}</h1>
  <div class="subtitle">Issued {m['issued_at']} by {m['issued_by']} · run {m['run_id']}</div>

  <div class="section">
    <h2>Record</h2>
    <div class="kv">
      <div class="k">Payment ID</div><div class="v">{rec['payment_id']}</div>
      <div class="k">Type</div><div class="v">{rec['record_type']}</div>
      <div class="k">Settled date</div><div class="v">{rec['settled_date'] or '—'}</div>
      <div class="k">Amount</div><div class="v">₹ {rec['amount_rupees']:,.2f}</div>
    </div>
  </div>

  <div class="section">
    <h2>Reconciliation finding</h2>
    <div class="kv">
      <div class="k">Engine reason</div><div class="v">{recon['engine_reason'] or '—'}</div>
      <div class="k">Resolution</div><div class="v">{recon['engine_resolution']}</div>
      <div class="k">Match method</div><div class="v">{recon['match_method']} (confidence {recon['confidence']})</div>
      <div class="k">Severity</div><div class="v">{recon['severity']}</div>
      <div class="k">Variance</div><div class="v amount">{variance_sign} ₹ {abs(variance_rupees):,.2f}</div>
    </div>
    <p style="font-size:12px;color:#5C6752;margin-top:6px;">{recon['explanation'] or ''}</p>
  </div>

  <div class="section">
    <h2>Operator resolution</h2>
    <div class="kv">
      <div class="k">Reason</div><div class="v">{res['reason_label']}</div>
      <div class="k">Resolved at</div><div class="v">{res['resolved_at'] or '—'}</div>
      <div class="k">Note</div><div class="v">{res['note'] or '—'}</div>
    </div>
    <p style="font-size:12px;color:#5C6752;margin-top:6px;">{res['narrative']}</p>
  </div>

  <div class="section">
    <h2>Downstream action</h2>
    <div class="kv">
      <div class="k">Action</div><div class="v">{ds['action']}</div>
      <div class="k">Target system</div><div class="v">{ds['target']}</div>
    </div>
    <div class="downstream">POST {ds['webhook_example']['url']}
Content-Type: application/json

{_json.dumps(ds['webhook_example']['body'], indent=2)}</div>
  </div>

  <div class="footer">
    Generated by ReconMint · int-paise deterministic engine · every figure on this memo is
    traceable to a row in the audit ledger for run {m['run_id']}.
  </div>
</div>
</body></html>
"""
    return StreamingResponse(io.BytesIO(html.encode("utf-8")), media_type="text/html")


@app.post("/decisions/{decision_id}/checklist")
def set_decision_checklist(decision_id: int, payload: dict | None = None):
    """Persist the Diagnose-tab checklist so it survives drawer close/reopen and
    a full page reload. Body: {"state": {"0": true, "2": true, ...}} keyed by step index.
    """
    payload = payload or {}
    state = payload.get("state")
    if not isinstance(state, dict):
        raise InputValidationError("state must be an object keyed by step index.")
    # Coerce keys to strings and values to bools so the store stays clean.
    cleaned = {str(k): bool(v) for k, v in state.items()}
    ok = audit.set_checklist_state(decision_id, cleaned)
    if not ok:
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"no decision with id {decision_id}"})
    return {"decision_id": decision_id, "state": cleaned}


@app.get("/runs/{run_id}/resolutions")
def run_resolutions(run_id: str):
    """Resolved-vs-open counts grouped by resolution reason for this run."""
    if not audit.get_run(run_id):
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"run {run_id} not found"})
    return audit.resolution_summary(run_id)


@app.get("/runs/{run_id}/audit-export")
def audit_export(run_id: str, format: str = "json"):
    rows = audit.get_decisions(run_id)
    if format == "csv":
        buf = io.StringIO()
        if rows:
            writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            for r in rows:
                writer.writerow({k: _csv_safe(v) for k, v in r.items()})
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="reconmint_{run_id}.csv"'},
        )
    return {"run_id": run_id, "decisions": rows}
