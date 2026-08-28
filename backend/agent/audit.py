"""
ReconMint audit log (Day 6).

Every reconciliation run and every per-record decision is persisted to SQLite so the agent's work
is fully queryable and reproducible - the backbone of the "Build Quality" and "AI Judgment" scores.
Nothing the agent does is invisible: inputs, match method, confidence, triage action, and (from
Day 7) the LLM explanation with its cost/latency all land here.

Two tables:
  runs      - one row per reconciliation run, with headline stats
  decisions - one row per record processed, with its full journey

DB location is env-configurable (RECONMINT_DB) so it works locally and on Railway (point it at a
mounted volume for persistence; the ephemeral default is fine for the demo).
"""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

DEFAULT_DB = os.path.join(os.path.dirname(__file__), "..", "..", "data", "audit.db")


def db_path() -> str:
    return os.environ.get("RECONMINT_DB", DEFAULT_DB)


SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    run_id              TEXT PRIMARY KEY,
    created_at          TEXT NOT NULL,
    dataset_size        INTEGER,
    settlement_active   INTEGER,
    match_rate_pct      REAL,
    reconciled_rate_pct REAL,
    elapsed_seconds     REAL,
    throughput_rps      REAL,
    reconciled_total    INTEGER,
    exceptions_total    INTEGER,
    needs_human_total   INTEGER
);

CREATE TABLE IF NOT EXISTS decisions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id         TEXT NOT NULL,
    record_ref     TEXT,          -- payment_id (settlement) or utr (bank credit)
    record_type    TEXT,          -- 'settlement' | 'bank_credit'
    match_method   TEXT,          -- 'exact' | 'fuzzy' | 'none'
    confidence     REAL,
    resolution     TEXT,          -- engine resolution label
    triage_action  TEXT,          -- 'auto_resolve' | 'explain' | 'escalate'
    needs_human    INTEGER,       -- 0/1
    resolved       INTEGER DEFAULT 0,  -- 0/1: a human has marked this exception handled
    severity       TEXT,          -- critical | warning | info
    amount_paise   INTEGER,
    reason         TEXT,          -- unmatched reason / triage note
    explanation    TEXT,          -- deterministic explanation (Day 6)
    llm_explanation TEXT,         -- LLM explanation shown to the user (Day 7)
    llm_source     TEXT,          -- llm_verified | llm_rejected_fallback | deterministic | error_fallback
    llm_verified   INTEGER,       -- 0/1: did the explanation pass the hallucination verifier
    llm_model      TEXT,
    llm_cost_usd   REAL,
    llm_latency_ms REAL,
    ledger_json    TEXT,          -- fee breakdown for the drawer (settlement rows)
    record_date    TEXT,          -- settlement date, for the table Date column
    created_at     TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs(run_id)
);

CREATE INDEX IF NOT EXISTS idx_decisions_run ON decisions(run_id);
CREATE INDEX IF NOT EXISTS idx_decisions_action ON decisions(run_id, triage_action);
"""

# columns that may be missing on a DB created by an earlier day; added idempotently at connect time
_EXPECTED_DECISION_COLS = {
    "severity": "TEXT",
    "resolved": "INTEGER",
    "llm_explanation": "TEXT", "llm_source": "TEXT", "llm_verified": "INTEGER",
    "llm_model": "TEXT", "llm_cost_usd": "REAL", "llm_latency_ms": "REAL",
    "ledger_json": "TEXT", "record_date": "TEXT",
    # Resolution audit trail: which reason chip + optional note the human recorded,
    # plus when. Missing on databases created before this migration.
    "resolution_reason": "TEXT", "resolution_note": "TEXT", "resolved_at": "TEXT",
    # Repair Agent audit trail: JSON list of every strategy attempt made for this record,
    # + the accepted strategy name (null if the row stayed unmatched).
    "strategy_attempts_json": "TEXT", "accepted_strategy": "TEXT",
    # Diagnose-tab checklist state persists across sessions so an operator can close
    # the drawer, reopen it, and see which investigation steps they already ticked.
    # Shape: {"0": true, "1": true} keyed by playbook step index.
    "checklist_state_json": "TEXT",
}


def _migrate(conn) -> None:
    existing = {r["name"] for r in conn.execute("PRAGMA table_info(decisions)").fetchall()}
    for col, coltype in _EXPECTED_DECISION_COLS.items():
        if col not in existing:
            conn.execute(f"ALTER TABLE decisions ADD COLUMN {col} {coltype}")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def connect(path: str | None = None):
    path = path or db_path()
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(SCHEMA)
        _migrate(conn)
        yield conn
        conn.commit()
    finally:
        conn.close()


class AuditLog:
    """Thin, explicit writer/reader over the SQLite audit store."""

    def __init__(self, path: str | None = None):
        self.path = path or db_path()

    def start_run(self, run_id: str, meta: dict) -> None:
        with connect(self.path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO runs
                   (run_id, created_at, dataset_size, settlement_active, match_rate_pct,
                    reconciled_rate_pct, elapsed_seconds, throughput_rps, reconciled_total,
                    exceptions_total, needs_human_total)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    run_id, _now(),
                    meta.get("dataset_size"), meta.get("settlement_active"),
                    meta.get("match_rate_pct"), meta.get("reconciled_rate_pct"),
                    meta.get("elapsed_seconds"), meta.get("throughput_rps"),
                    meta.get("reconciled_total"), meta.get("exceptions_total"),
                    meta.get("needs_human_total"),
                ),
            )

    def log_decisions(self, run_id: str, rows: list[dict]) -> None:
        """Batch-insert decision rows for a run."""
        with connect(self.path) as conn:
            conn.executemany(
                """INSERT INTO decisions
                   (run_id, record_ref, record_type, match_method, confidence, resolution,
                    triage_action, needs_human, severity, amount_paise, reason, explanation,
                    llm_explanation, llm_source, llm_verified, llm_model,
                    llm_cost_usd, llm_latency_ms, ledger_json, record_date,
                    strategy_attempts_json, accepted_strategy, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                [
                    (
                        run_id, r.get("record_ref"), r.get("record_type"), r.get("match_method"),
                        r.get("confidence"), r.get("resolution"), r.get("triage_action"),
                        1 if r.get("needs_human") else 0, r.get("severity"),
                        r.get("amount_paise"), r.get("reason"),
                        r.get("explanation"), r.get("llm_explanation"), r.get("llm_source"),
                        (None if r.get("llm_verified") is None else (1 if r.get("llm_verified") else 0)),
                        r.get("llm_model"), r.get("llm_cost_usd"), r.get("llm_latency_ms"),
                        r.get("ledger_json"), r.get("record_date"),
                        r.get("strategy_attempts_json"), r.get("accepted_strategy"),
                        _now(),
                    )
                    for r in rows
                ],
            )

    # --- read helpers (used by the API/dashboard later) ---
    def get_run(self, run_id: str) -> dict | None:
        with connect(self.path) as conn:
            row = conn.execute("SELECT * FROM runs WHERE run_id=?", (run_id,)).fetchone()
            return dict(row) if row else None

    def get_decisions(self, run_id: str, triage_action: str | None = None) -> list[dict]:
        with connect(self.path) as conn:
            if triage_action:
                cur = conn.execute(
                    "SELECT * FROM decisions WHERE run_id=? AND triage_action=? ORDER BY id",
                    (run_id, triage_action),
                )
            else:
                cur = conn.execute(
                    "SELECT * FROM decisions WHERE run_id=? ORDER BY id", (run_id,)
                )
            return [dict(r) for r in cur.fetchall()]

    def get_exceptions(self, run_id: str, include_resolved: bool = False) -> list[dict]:
        clause = "" if include_resolved else "AND COALESCE(resolved,0)=0"
        with connect(self.path) as conn:
            cur = conn.execute(
                f"SELECT * FROM decisions WHERE run_id=? AND needs_human=1 {clause} ORDER BY id",
                (run_id,),
            )
            return [dict(r) for r in cur.fetchall()]

    def get_decision(self, decision_id: int) -> dict | None:
        with connect(self.path) as conn:
            row = conn.execute("SELECT * FROM decisions WHERE id=?", (decision_id,)).fetchone()
            return dict(row) if row else None

    def update_llm(self, decision_id: int, explanation: str, source: str, verified: bool,
                   model: str | None, cost: float, latency: float) -> None:
        with connect(self.path) as conn:
            conn.execute(
                """UPDATE decisions SET llm_explanation=?, llm_source=?, llm_verified=?,
                   llm_model=?, llm_cost_usd=?, llm_latency_ms=? WHERE id=?""",
                (explanation, source, 1 if verified else 0, model, cost, latency, decision_id),
            )

    def save_razorpay_verification(self, run_id: str, verification: dict) -> None:
        """Persist the live Razorpay API handshake as a run-scoped JSON blob so the
        Dashboard can show 'Razorpay-verified' long after the trace has scrolled away.
        Uses a tiny key/value table so we don't touch the runs schema."""
        payload = json.dumps(verification)
        with connect(self.path) as conn:
            conn.execute("""CREATE TABLE IF NOT EXISTS run_extras (
                run_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT,
                created_at TEXT NOT NULL, PRIMARY KEY(run_id, key))""")
            conn.execute(
                """INSERT OR REPLACE INTO run_extras (run_id, key, value, created_at)
                   VALUES (?, 'razorpay_verification', ?, ?)""",
                (run_id, payload, _now()),
            )

    def get_razorpay_verification(self, run_id: str) -> dict | None:
        with connect(self.path) as conn:
            conn.execute("""CREATE TABLE IF NOT EXISTS run_extras (
                run_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT,
                created_at TEXT NOT NULL, PRIMARY KEY(run_id, key))""")
            row = conn.execute(
                "SELECT value FROM run_extras WHERE run_id=? AND key='razorpay_verification'",
                (run_id,),
            ).fetchone()
        if not row:
            return None
        try:
            return json.loads(row["value"])
        except (ValueError, TypeError):
            return None

    def resolve(self, decision_id: int, reason: str | None = None,
                note: str | None = None) -> bool:
        """Mark one decision resolved, recording the reason chip + optional note the human chose.

        Returns True if a row was updated. The reason is one of confirmed / override /
        false_positive / escalated (validated at the API layer); an unknown value is still
        stored so the audit trail keeps a record of exactly what was sent.
        """
        with connect(self.path) as conn:
            cur = conn.execute(
                """UPDATE decisions
                   SET resolved=1, resolution_reason=?, resolution_note=?, resolved_at=?
                   WHERE id=? AND needs_human=1""",
                (reason, note, _now(), decision_id),
            )
            return cur.rowcount > 0

    def set_checklist_state(self, decision_id: int, state: dict) -> bool:
        """Persist which Diagnose-tab checklist steps the operator has ticked. Idempotent."""
        payload = json.dumps(state or {})
        with connect(self.path) as conn:
            cur = conn.execute(
                "UPDATE decisions SET checklist_state_json=? WHERE id=?",
                (payload, decision_id),
            )
            return cur.rowcount > 0

    def get_checklist_state(self, decision_id: int) -> dict:
        with connect(self.path) as conn:
            row = conn.execute(
                "SELECT checklist_state_json FROM decisions WHERE id=?", (decision_id,),
            ).fetchone()
        if not row or not row["checklist_state_json"]:
            return {}
        try:
            return json.loads(row["checklist_state_json"]) or {}
        except (ValueError, TypeError):
            return {}

    def unresolve(self, decision_id: int) -> bool:
        with connect(self.path) as conn:
            cur = conn.execute(
                """UPDATE decisions
                   SET resolved=0, resolution_reason=NULL, resolution_note=NULL,
                       resolved_at=NULL
                   WHERE id=?""",
                (decision_id,),
            )
            return cur.rowcount > 0

    def resolution_summary(self, run_id: str) -> dict:
        """Counts of resolved decisions grouped by reason for this run."""
        with connect(self.path) as conn:
            rows = conn.execute(
                """SELECT COALESCE(resolution_reason, 'unspecified') AS reason,
                          COUNT(*) AS n
                   FROM decisions
                   WHERE run_id=? AND resolved=1
                   GROUP BY resolution_reason""",
                (run_id,),
            ).fetchall()
            total = conn.execute(
                "SELECT COUNT(*) AS n FROM decisions WHERE run_id=? AND needs_human=1",
                (run_id,),
            ).fetchone()["n"]
            resolved_total = conn.execute(
                "SELECT COUNT(*) AS n FROM decisions WHERE run_id=? AND resolved=1",
                (run_id,),
            ).fetchone()["n"]
        buckets = {"confirmed": 0, "override": 0, "false_positive": 0,
                   "escalated": 0, "unspecified": 0}
        for r in rows:
            buckets[r["reason"]] = buckets.get(r["reason"], 0) + r["n"]
        return {"total_exceptions": total, "resolved": resolved_total, "by_reason": buckets}
