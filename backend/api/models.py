"""
Pydantic response models for the ReconMint API.

These are the exact shapes the frontend codes against. Amounts are returned both in paise (integer,
source of truth) and rupees (float, convenience); format with Indian grouping on the client.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class HealthComponent(BaseModel):
    name: str
    ok: bool
    detail: str = ""


class HealthStatus(BaseModel):
    status: str = Field(description="ok | degraded")
    version: str
    components: list[HealthComponent]


class RunMeta(BaseModel):
    run_id: str
    dataset_size: int
    settlement_active: int
    match_rate_pct: float
    reconciled_rate_pct: float
    elapsed_seconds: float
    throughput_rps: float
    reconciled_total: int
    reconciled_amount_paise: int = 0
    exceptions_total: int
    needs_human_total: int
    llm_calls: int = 0
    llm_verified_count: int = 0
    llm_cost_usd_total: float = 0.0


class SeverityCounts(BaseModel):
    critical: int = 0
    warning: int = 0
    info: int = 0


class ReconcileResponse(BaseModel):
    run_id: str
    meta: RunMeta
    severity_counts: SeverityCounts
    decisions_logged: int
    trace: list[dict] = []


class ExceptionItem(BaseModel):
    id: int
    record_ref: str
    record_type: str
    match_method: str
    confidence: float
    resolution: str
    triage_action: str
    severity: str | None = None
    amount_paise: int
    amount_rupees: float
    reason: str | None = None
    explanation: str | None = None
    llm_explanation: str | None = None
    llm_verified: bool | None = None
    llm_model: str | None = None
    date: str | None = None
    ledger: dict | None = None


class ExceptionList(BaseModel):
    run_id: str
    total: int
    items: list[ExceptionItem]


class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None
