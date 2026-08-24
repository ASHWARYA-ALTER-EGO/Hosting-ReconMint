"""
ReconMint API (Day 8).

FastAPI layer the dashboard consumes. Endpoints:

  GET  /health                          component status
  POST /reconcile                       upload orders/settlement/bank CSVs -> run + summary
  POST /reconcile/demo                  run on the built-in synthetic dataset (no upload)
  GET  /runs/{run_id}                   run summary
  GET  /runs/{run_id}/exceptions        exceptions needing a human (filter by severity)
  GET  /runs/{run_id}/decisions         all logged decisions
  GET  /runs/{run_id}/audit-export      full audit trail as JSON or CSV download

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
import os
import shutil
import tempfile

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from backend import config
from backend.agent.audit import AuditLog, db_path
from backend.agent.orchestrator import reconcile
from backend.engine.validation import InputValidationError
from backend.engine.loader import DEFAULT_DATA_DIR
from backend.api.models import (
    HealthStatus, HealthComponent, RunMeta, ReconcileResponse, SeverityCounts,
    ExceptionItem, ExceptionList,
)

VERSION = "0.8.0"
UPLOAD_FIELDS = ("orders", "settlement", "bank")

app = FastAPI(title="ReconMint API", version=VERSION,
              description="Three-way Razorpay settlement reconciliation agent.")

# CORS: permissive for local dev / the Cloudflare Pages frontend. Lock to the Pages origin in prod
# via RECONMINT_CORS_ORIGINS (comma-separated).
_origins = os.environ.get("RECONMINT_CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins],
    allow_methods=["*"],
    allow_headers=["*"],
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
                      "reconciled_amount_paise") if k in extra})
    return RunMeta(**data)


def _save_uploads_and_reconcile(files: dict[str, UploadFile], use_llm: bool) -> dict:
    tmp = tempfile.mkdtemp(prefix="reconmint_")
    try:
        for field, up in files.items():
            _validate_upload(field, up)
            dest = os.path.join(tmp, f"{field}.csv")
            with open(dest, "wb") as f:
                shutil.copyfileobj(up.file, f)
        return reconcile(data_dir=tmp, persist=True, use_llm=use_llm)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _validate_upload(field: str, up: UploadFile) -> None:
    if not up.filename.lower().endswith(".csv"):
        raise InputValidationError(f"{field} must be a .csv file (got '{up.filename}').")
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
def ask(run_id: str = Form(...), question: str = Form(...)):
    """Settlement Q&A agent: understand -> compute (deterministic) -> verify -> answer, with trace."""
    from backend.agent.qa import ask as qa_ask
    if not audit.get_run(run_id):
        return JSONResponse(status_code=404, content={"error": "not_found",
                                                      "detail": f"run {run_id} not found"})
    return qa_ask(run_id, question)


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


@app.post("/decisions/{decision_id}/resolve")
def resolve_decision(decision_id: int):
    """Mark one exception as handled by a human (powers 'Mark as Resolved')."""
    ok = audit.resolve(decision_id)
    if not ok:
        return JSONResponse(status_code=404,
                            content={"error": "not_found",
                                     "detail": f"no open exception with id {decision_id}"})
    return {"decision_id": decision_id, "resolved": True}


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
