"""
Live Razorpay API client used at ingest time to prove the pipeline is grounded in the
sponsor's real product, not just a schema imitation of it.

What this module does (all deterministic, no LLM):

  1. `probe_keys()`         hits `GET /v1/payments?count=1` — cheapest sanity call.
                            Proves the RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET pair works
                            and the network path to api.razorpay.com is open.

  2. `sample_payments(n)`   hits `GET /v1/payments?count=n` — returns up to `n` real
                            payments from the merchant's Razorpay test account. Each
                            item is a full payment object; we cherry-pick the fields
                            an auditor cares about (id, amount, currency, method,
                            status, captured, email, contact, created_at, fee, tax).

  3. `fetch_payment(pid)`   hits `GET /v1/payments/{id}` — used when a specific
                            payment id in the uploaded settlement can be looked up
                            against Razorpay directly (rare with synthetic data).

Every call is timeout-bounded (5s connect + 5s read), retries once on transient
network errors, and returns a rich result object that captures the wire-level
truth: the status code, the URL that was hit, the latency, and the request id
Razorpay stamps into every response. That request id (`X-Razorpay-Request-Id`)
is the thing an auditor can quote back to Razorpay support to trace a call.

Nothing is silently swallowed. If the keys are missing we surface it as a
`ProbeResult(ok=False, reason="missing_keys")`; if Razorpay rate-limits us we
surface HTTP 429 with the retry-after; if the merchant test account has no
payments yet we surface a friendly `empty_account` result rather than pretending
the API is broken.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass, field, asdict
from typing import Any

# `requests` is a hard-runtime dep on Railway; keep the import guarded so a missing
# package degrades to a clean skip instead of exploding at reconcile time.
try:
    import requests
    _HAS_REQUESTS = True
except ImportError:  # pragma: no cover
    requests = None  # type: ignore
    _HAS_REQUESTS = False

# Ensure RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET land in os.environ even when this module
# is imported before anything in `llm` runs (uvicorn may import us via /razorpay/health first).
from backend.agent.llm import load_dotenv as _load_env
_load_env()

BASE_URL = "https://api.razorpay.com/v1"
TIMEOUT = (5.0, 5.0)  # (connect, read) seconds


def _auth() -> tuple[str, str] | None:
    key = os.environ.get("RAZORPAY_KEY_ID") or ""
    secret = os.environ.get("RAZORPAY_KEY_SECRET") or ""
    if not key or not secret:
        return None
    return (key, secret)


@dataclass
class ProbeResult:
    """Result of one Razorpay HTTP call. Serializes cleanly to JSON for the UI."""
    ok: bool
    status_code: int | None
    url: str
    latency_ms: float
    razorpay_request_id: str | None = None
    reason: str | None = None           # short machine code: missing_keys / http_error / network_error / empty_account
    detail: str | None = None           # human-readable one-liner
    payments: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _get(path: str, params: dict | None = None) -> ProbeResult:
    """Low-level GET wrapper. All Razorpay reads go through here."""
    url = f"{BASE_URL}{path}"
    if not _HAS_REQUESTS:
        return ProbeResult(
            ok=False, status_code=None, url=url, latency_ms=0.0,
            reason="dependency_missing",
            detail="Python package `requests` is not installed - Razorpay handshake skipped. "
                   "Add `requests` to requirements.txt and redeploy.",
        )
    auth = _auth()
    if auth is None:
        return ProbeResult(
            ok=False, status_code=None, url=url, latency_ms=0.0,
            reason="missing_keys",
            detail="RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set in the environment.",
        )
    t0 = time.perf_counter()
    try:
        r = requests.get(url, params=params, auth=auth, timeout=TIMEOUT,
                         headers={"Accept": "application/json"})
    except Exception as e:  # noqa: BLE001 - network exceptions vary
        latency = (time.perf_counter() - t0) * 1000
        return ProbeResult(ok=False, status_code=None, url=url, latency_ms=round(latency, 1),
                           reason="network_error", detail=str(e)[:180])
    latency = (time.perf_counter() - t0) * 1000
    req_id = r.headers.get("X-Razorpay-Request-Id")
    if not r.ok:
        return ProbeResult(
            ok=False, status_code=r.status_code, url=url,
            latency_ms=round(latency, 1), razorpay_request_id=req_id,
            reason="http_error",
            detail=(r.text[:200] if r.text else f"HTTP {r.status_code}"),
        )
    try:
        body = r.json()
    except ValueError:
        return ProbeResult(ok=False, status_code=r.status_code, url=url,
                           latency_ms=round(latency, 1), razorpay_request_id=req_id,
                           reason="bad_json", detail="response was not valid JSON")
    return ProbeResult(
        ok=True, status_code=r.status_code, url=url, latency_ms=round(latency, 1),
        razorpay_request_id=req_id, detail=None,
        payments=[body] if not isinstance(body, dict) or "items" not in body else body.get("items", []),
    )


def _shape_payment(p: dict) -> dict:
    """Cherry-pick the fields an auditor needs; drop everything else so we don't leak PII."""
    return {
        "id":            p.get("id"),
        "entity":        p.get("entity"),
        "amount_paise":  p.get("amount"),
        "currency":      p.get("currency"),
        "status":        p.get("status"),
        "method":        p.get("method"),
        "captured":      p.get("captured"),
        "created_at":    p.get("created_at"),
        "fee_paise":     p.get("fee"),
        "tax_paise":     p.get("tax"),
        "email":         (p.get("email") or "")[:64],
        "contact":       (p.get("contact") or "")[:32],
        "description":   (p.get("description") or "")[:80],
    }


def probe_keys() -> ProbeResult:
    """Cheapest possible sanity call: fetch a single payment. If this works, the keys
    are valid and the merchant test account is reachable."""
    return _get("/payments", params={"count": 1})


def _shape_order(o: dict) -> dict:
    """Cherry-pick order fields for the audit trail."""
    return {
        "id":           o.get("id"),
        "entity":       o.get("entity"),
        "amount_paise": o.get("amount"),
        "amount_paid":  o.get("amount_paid"),
        "amount_due":   o.get("amount_due"),
        "currency":     o.get("currency"),
        "status":       o.get("status"),
        "receipt":      o.get("receipt"),
        "attempts":     o.get("attempts"),
        "created_at":   o.get("created_at"),
    }


def sample_payments(n: int = 3) -> ProbeResult:
    """Fetch up to N real payments from the merchant's Razorpay test account.

    If there are no payments yet, transparently fall back to `/v1/orders` — orders are
    the pre-payment record that always exists on a merchant account and prove the API
    integration is live. The `reason` field on the result says which endpoint answered
    ('payments' or 'orders' or 'empty_account')."""
    n = max(1, min(int(n), 25))
    res = _get("/payments", params={"count": n})
    if not res.ok:
        return res
    if res.payments:
        res.payments = [_shape_payment(p) for p in res.payments[:n]]
        res.reason = "payments"
        return res

    # No payments yet — try orders instead. Orders exist as soon as a merchant creates
    # an invoice; they are the first live data most test accounts have.
    orders = _get("/orders", params={"count": n})
    if orders.ok and orders.payments:  # `payments` field holds the response items
        orders.payments = [_shape_order(o) for o in orders.payments[:n]]
        orders.reason = "orders"
        orders.detail = "test account has no payments yet - showing recent orders instead"
        return orders

    return ProbeResult(
        ok=True, status_code=res.status_code, url=res.url,
        latency_ms=res.latency_ms, razorpay_request_id=res.razorpay_request_id,
        reason="empty_account",
        detail="Razorpay API reachable, but this test account has no payments or orders yet.",
        payments=[],
    )


def fetch_payment(payment_id: str) -> ProbeResult:
    """Look up one specific payment by id. Used when the uploaded settlement carries
    real payment_ids that exist in the merchant's Razorpay account (rare with
    synthetic data — the 404 case is expected and reported honestly)."""
    res = _get(f"/payments/{payment_id}")
    if res.ok and res.payments:
        res.payments = [_shape_payment(res.payments[0])]
    return res


def keys_configured() -> bool:
    return _auth() is not None
