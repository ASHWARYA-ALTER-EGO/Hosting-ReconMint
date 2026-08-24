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
                    llm_cost_usd, llm_latency_ms, ledger_json, record_date, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                [
                    (
                        run_id, r.get("record_ref"), r.get("record_type"), r.get("match_method"),
                        r.get("confidence"), r.get("resolution"), r.get("triage_action"),
                        1 if r.get("needs_human") else 0, r.get("severity"),
                        r.get("amount_paise"), r.get("reason"),
                        r.get("explanation"), r.get("llm_explanation"), r.get("llm_source"),
                        (None if r.get("llm_verified") is None else (1 if r.get("llm_verified") else 0)),
                        r.get("llm_model"), r.get("llm_cost_usd"), r.get("llm_latency_ms"),
                        r.get("ledger_json"), r.get("record_date"), _now(),
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

    def resolve(self, decision_id: int) -> bool:
        """Mark one decision resolved. Returns True if a row was updated."""
        with connect(self.path) as conn:
            cur = conn.execute(
                "UPDATE decisions SET resolved=1 WHERE id=? AND needs_human=1", (decision_id,)
            )
            return cur.rowcount > 0
