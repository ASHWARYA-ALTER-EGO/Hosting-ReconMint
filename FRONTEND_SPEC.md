# ReconMint Frontend Spec

Everything the frontend needs to consume the backend. The backend API is built and running; this
document is the contract. Build against it.

## TL;DR
- **One single-page app (SPA), not multiple pages.** Three *views/states* inside it: Upload →
  Dashboard → Exception drawer. No routing needed (state-driven); React Router optional.
- **Stack:** React + Vite. Any styling (Tailwind or plain CSS). Talks to the API via
  `VITE_API_BASE_URL`.
- **The wow moment:** drop 3 CSVs → big "97.7% matched in 0.16s" → click a red exception → a
  verified plain-English AI explanation slides in.

---

## Pages / views

It is a **single page** with three visual states. Do NOT build separate routed pages.

### View 1 - Upload (landing)
- Three labelled dropzones: **Order ledger**, **Razorpay settlement report**, **Bank statement**
  (each accepts one `.csv`).
- A **"Reconcile"** primary button (disabled until all 3 files chosen).
- A secondary **"Try with sample data"** button -> calls `POST /reconcile/demo` (no upload). Use
  this for the demo video so nothing can fail live.
- Optional toggle: **"Explain exceptions with AI"** -> sets `use_llm=true`.
- On submit: show a progress/spinner state, then transition to Dashboard.

### View 2 - Dashboard (results) - the hero screen
- **Hero stat:** big `reconciled_rate_pct` (or `match_rate_pct`) e.g. **"95.7% reconciled"**.
- **Stat tiles row:** `settlement_active` records · `elapsed_seconds` (e.g. "0.16s") ·
  `throughput_rps` rec/s · total `₹ reconciled` (sum of reconciled amounts; or show
  `reconciled_total` count).
- **Severity summary:** three chips/donut from `severity_counts` -> critical (red), warning
  (amber), info (grey).
- **Exceptions table:** rows from `GET /runs/{id}/exceptions`. Columns: severity chip · record_ref ·
  reason · amount (₹) · match method · confidence. Sortable; critical first (API already sorts).
- **Export button:** links to `GET /runs/{id}/audit-export?format=csv` (download) and `?format=json`.
- **Honesty line:** "N records we could not resolve" using the count of `escalate` items.

### View 3 - Exception drawer (side panel, part of dashboard)
- Opens when a table row is clicked. NOT a separate page - a drawer/modal.
- Shows: severity, record_ref, reason, amount, resolution, confidence, match_method.
- **The AI explanation** (`llm_explanation` if present, else `explanation`) with a small badge:
  **"verified"** when `llm_verified === true` (green), or "deterministic" otherwise.
- A **fee breakdown** feel: render the explanation text; it already contains the rupee math.

---

## Components (suggested)
| Component | Props | Notes |
|---|---|---|
| `App` | - | Holds `runId`, `view`, `loading`, `error` state |
| `UploadPanel` | `onReconciled(runId)` | 3 dropzones + reconcile + demo button |
| `Dropzone` | `label, file, onChange` | single-file CSV picker with filename display |
| `Dashboard` | `runId` | fetches run meta + exceptions on mount |
| `HeroStat` | `label, value` | the big number |
| `StatTile` | `label, value, unit` | small metric card |
| `SeverityChips` | `counts` | critical/warning/info counts |
| `ExceptionsTable` | `items, onSelect` | sortable table; severity color per row |
| `SeverityBadge` | `severity` | red/amber/grey pill |
| `ExceptionDrawer` | `item, onClose` | detail + AI explanation + verified badge |
| `ExportButtons` | `runId` | CSV/JSON download links |
| `ErrorBanner` | `message` | friendly error from the API `detail` |
| `HealthDot` | - | optional: polls `/health`, green/red |

---

## API contract (base = `VITE_API_BASE_URL`, e.g. http://localhost:8000)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | - | `{status, version, components[]}` |
| POST | `/reconcile` | multipart: `orders`, `settlement`, `bank` (files), `use_llm` (bool) | `ReconcileResponse` |
| POST | `/reconcile/demo` | form: `use_llm` (bool) | `ReconcileResponse` |
| GET | `/runs/{run_id}` | - | `RunMeta` |
| GET | `/runs/{run_id}/exceptions?severity=&limit=` | - | `ExceptionList` |
| GET | `/runs/{run_id}/decisions?triage_action=` | - | `{items[]}` |
| GET | `/runs/{run_id}/audit-export?format=json\|csv` | - | JSON or CSV download |
| GET | `/eval/demo` | - | honest accuracy metrics + real breakdown (demo data only) |
| POST | `/decisions/{decision_id}/resolve` | - | mark an exception handled ("Mark as Resolved") |

### /eval/demo (powers the Accuracy card + breakdown + waterfall)
```json
{
  "match_rate_pct": 97.68,
  "reconciled_rate_pct": 94.78,
  "throughput_records_per_s": 5192.9,
  "elapsed_seconds": 0.16,
  "dataset_size": 520,
  "accuracy": {
    "precision": 0.86, "recall": 1.0, "f1": 0.93,
    "false_positives": 5, "false_negatives": 0,
    "true_positives": 31, "true_negatives": 484
  },
  "reconciled_amount_rupees": 5951249.01,
  "breakdown": {
    "auto_matched": 455, "fuzzy_matched": 35, "fee_anomaly": 15,
    "unresolved": 12, "duplicates": 6, "ghost_credits": 9, "total": 532
  },
  "per_category_detection": { "fee_anomaly": {"detected":10,"total":10,"recall":1.0}, "...": {} }
}
```
Use `accuracy` for the **Accuracy card** (Precision/Recall/F1 + "5 false positives, 0 missed").
Use `breakdown` for the RECONCILIATION BREAKDOWN bars and the waterfall - these are the REAL,
mutually-exclusive engine numbers, not the mockup's placeholders (do not hardcode 356/89/48/19).

### Don't fabricate (match the mockup to real data)
- Header rate: show `reconciled_rate_pct` labelled "Reconciled" OR `match_rate_pct` labelled
  "Matched". Not an invented 96.73%.
- Exceptions count = `exceptions_total` / `severity_counts` (42 = 19 critical + 23 warning), not 19.
- Confidence in the drawer = the record's `confidence` (100% exact, <100% fuzzy). There is NO
  LLM "explanation confidence" - do not show 99.2%.
- "Verified against N computed figures" is true; "2 sources" is not - we cross-check 3 files.

### ReconcileResponse
```json
{
  "run_id": "3fe542e64f22",
  "meta": {
    "run_id": "3fe542e64f22",
    "dataset_size": 1552,
    "settlement_active": 517,
    "match_rate_pct": 97.68,
    "reconciled_rate_pct": 94.78,
    "elapsed_seconds": 0.16,
    "throughput_rps": 9700.0,
    "reconciled_total": 490,
    "exceptions_total": 42,
    "needs_human_total": 42,
    "llm_calls": 0, "llm_verified_count": 0, "llm_cost_usd_total": 0.0
  },
  "severity_counts": { "critical": 19, "warning": 23, "info": 0 },
  "decisions_logged": 532
}
```

### ExceptionItem (inside `ExceptionList.items[]`)
```json
{
  "id": 12,
  "record_ref": "pay_0001050",
  "record_type": "settlement",
  "match_method": "exact",
  "confidence": 1.0,
  "resolution": "exception_fee_anomaly",
  "triage_action": "explain",
  "severity": "critical",
  "amount_paise": 276390,
  "amount_rupees": 2763.90,
  "reason": "fee_anomaly",
  "explanation": "gross ₹2860.00 - MDR ₹57.20 - GST ₹10.30 = expected net ₹2792.50; ...",
  "llm_explanation": "There is a discrepancy of ₹0.03 ...",
  "llm_verified": true,
  "llm_model": "gpt-4o-mini"
}
```

### Errors
Never a stack trace. Shapes: `{"error":"invalid_input","detail":"bank.csv is missing required
column 'utr'."}` (422), `{"error":"not_found",...}` (404), `{"error":"internal_error",...}` (500).
Show `detail` in `ErrorBanner`.

---

## Formatting rules (make it feel premium)
- **Rupees:** Indian grouping. `2763.90 -> ₹2,763.90`; `4723850 -> ₹47,23,850.00`. Use
  `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})`.
- **Severity colors:** critical `#dc2626`, warning `#d97706`, info `#6b7280` (tune to taste).
- **Confidence:** show as % (`1.0 -> 100%`, `0.94 -> 94%`); fuzzy matches are < 100%.
- **Numbers:** monospace/tabular figures for amounts and the hero stat.
- **Match method:** badge `exact` (solid) vs `fuzzy` (outline).

## States you MUST handle
- **Loading:** spinner during reconcile (even though it is ~0.2s, keep a graceful transition).
- **Empty:** a run with zero exceptions -> celebrate ("Everything reconciled").
- **Error:** show the API `detail` message (wrong file, missing column, etc.).

## Local dev
- Run the API: `uvicorn backend.api.main:app --reload --port 8000` (or `make docker`).
- Set `VITE_API_BASE_URL=http://localhost:8000` in `frontend/.env`.
- CORS is already open for dev; lock it in prod via `RECONMINT_CORS_ORIGINS`.
- Swagger docs auto-served at `http://localhost:8000/docs` - use it to explore payloads.

## Deploy (already staged)
- Frontend -> Cloudflare Pages (root `frontend`, build `npm run build`, output `dist`,
  env `VITE_API_BASE_URL` = Railway URL).
- Backend -> Railway (`railway.json` / `Procfile` present).
