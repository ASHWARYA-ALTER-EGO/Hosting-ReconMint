# ReconMint

**An AI Finance Controller for the books and the cash.** Solo submission to the **Razorpay AI
Buildathon 2026 · Track 4 (AI Finance Controller)**.

<!-- ![ReconMint Dashboard hero screenshot](docs/img/hero-dashboard.png) -->
<!--   ↑ replace with a full-width screenshot of the Dashboard Cash tab with all cards visible -->

Every Indian merchant on Razorpay lives with three ledgers that never quite agree: their orders,
Razorpay's settlement report, and their bank statement. Fees, GST, TCS, T+2 timing, chargebacks,
refunds. All of it drifts. Most merchants reconcile this by hand, in a spreadsheet, once a month,
after the fact.

ReconMint runs the loop for them. Ingests the three files, reconstructs the fee schedule
independently, matches every payment three ways, surfaces the exceptions it could not resolve,
and answers questions about the batch in plain English. Every rupee it puts on screen is
traceable to a row in the audit table. **The AI never touches a number it can't prove.**

<!-- ![Live agent trace GIF](docs/img/agent-trace.gif) -->
<!--   ↑ 6-second GIF of the Upload page live agent trace revealing stages -->

The brief's own framing was the design north star: *verification, not generation, is the
bottleneck in 2026.* An AI that summarises what happened is easy. An AI that can **prove** a
figure, row by row, against source data is the actual product.

---

## Try it in 30 seconds

```bash
# 1. clone + install
git clone https://github.com/pradhanashwarya2122/reconmint.git
cd reconmint
pip install -r requirements.txt
cd frontend && npm install && cd ..

# 2. put your OpenAI + Razorpay test keys in .env (only OPENAI_API_KEY is required)
cp .env.example .env  # then edit

# 3. run backend + frontend
python -m uvicorn backend.api.main:app --port 8000    # in one terminal
cd frontend && npm run dev                             # in another (port 5173/5174)

# 4. open http://localhost:5173 → click "Get started" → click "Try sample data"
```

Sample data is generated deterministically at first boot. No manual dataset download.

---

## What it does

Drop in three files - an order ledger, a Razorpay settlement report, and a bank statement - and the
agent runs a bounded loop:

**ingest → reconstruct fees → exact match → fuzzy recover → triage → verify → log**

It reports a match rate, throughput, measured accuracy against a held-out answer key, and an honest
list of the records it could *not* resolve. Then you can open any exception to see exactly why it was
flagged, ask the agent questions in plain English, and export a reconciliation report.

---

## Architecture

```mermaid
flowchart TD
    UI["React app - Upload · Dashboard · Exceptions · Ask the agent (live Agent Trace)"]
    API["FastAPI - /reconcile · /ask · /eval · /decisions/*"]
    UI -->|HTTP| API

    subgraph AGENT["Agent loop (orchestrator) - DETERMINISTIC money math"]
      direction TB
      ING["Ingest + validate"] --> FEE["Fee / GST / TCS reconstruction"]
      FEE --> EX["Exact match: UTR + paise"] --> FZ["Fuzzy recover: T+2, UTR typos"]
      FZ --> TR["Triage: auto-resolve / explain / escalate"]
    end
    API --> ING

    QA["AI: Q&A intent + phrasing"]
    XP["AI: exception explainer"]
    VER["Hallucination verifier - rejects any ungrounded figure"]
    API --> QA
    TR -->|on demand| XP
    QA --> VER
    XP --> VER

    DB[("SQLite audit trail - every decision + LLM call logged")]
    TR --> DB
    VER --> DB
    RZP["Razorpay test API - schema validated"] -.->|schema fidelity| FEE

    classDef det fill:#eff6ff,stroke:#3b82f6,color:#1e3a8a;
    classDef ai fill:#fffbeb,stroke:#d97706,color:#78350f;
    classDef guard fill:#ecfdf5,stroke:#10b981,color:#065f46;
    class ING,FEE,EX,FZ,TR det;
    class QA,XP ai;
    class VER guard;
```

**Blue is deterministic** - all matching, arithmetic, fee reconstruction, confidence scoring, triage
routing, and the stopping rule. **Amber is AI** - only intent-parsing and phrasing. **Green is the
verifier** that gates every AI figure. The LLM never touches the money math and never states a number
it can't prove.

---

## Features

<!-- ![Upload page with live trace](docs/img/feature-upload.png) -->

### Upload: watch the agent work
- **Three-file intake** with client-side validation (CSV only, ≤50 MB), auto-categorisation by
  filename, per-file "valid" status, and a drag-or-browse dropzone.
- **"Try sample data"** runs the built-in synthetic batch instantly - nothing external to break.
- **Live reconciliation trace.** After you run it, the page doesn't just spin - it *replays the real
  reconcile pipeline* stage by stage (ingest & validate → fee reconstruction + exact match → fuzzy
  recovery → triage → verify & log). Each step shows its real measured latency and the real counts it
  produced (e.g. "470 matched on UTR + paise-exact amount"). This is data, not a scripted animation -
  the backend returns the trace and the UI plays it back. It's what makes ReconMint visibly an
  *agent*, not a pipeline.
- **Friendly errors.** A missing column produces "Bank Statement is missing required column 'utr'",
  not a stack trace.

<!-- ![Dashboard - Cash tab hero](docs/img/feature-dashboard-cash.png) -->
<!-- ![Dashboard - Reconciliation tab](docs/img/feature-dashboard-recon.png) -->
<!-- ![Dashboard - Audit tab](docs/img/feature-dashboard-audit.png) -->

### Dashboard: the run at a glance
- **Headline metrics:** reconciled rate, match rate (incl. fuzzy), records processed, processing
  time + throughput, total amount reconciled (in ₹ with Indian grouping), and exception count.
- **Cash position (Finance Controller view)** - four mutually-exclusive buckets computed
  from this run's audited decisions, plus a headline **Net Available** figure. The buckets are:
  - **Cleared** - reconciled settlements matched to a bank credit (money in your account).
  - **In-flight** - settlements Razorpay confirmed but the bank has not yet credited.
  - **At-risk** - chargebacks and disputed payments being clawed back.
  - **Ghost** - bank credits with no matching settlement (cash you have but can't attribute).
  Net Available = *cleared + ghost − at-risk*. In-flight is deliberately excluded so a controller
  sees what is actually spendable *right now*, not what's projected. Each bucket expands to show
  the payment IDs behind it. Fed by `GET /runs/{run_id}/cash-position`; every rupee traces to a
  row in the `decisions` table.
- **Forward cash forecast (next 3 / 7 / 14 / 30 days)** - every in-flight settlement is projected
  forward to `record_date + T+2 business days` (weekends skipped, holidays TBD). Rendered as a
  column chart with a `Today` marker in red. Three summary chips at the top: **In horizon**,
  **Past-due** (settlements that should have landed by now - a live "escalate now" list), and
  **Beyond horizon** (won't land within the selected window). Click any bar to see the payment IDs
  landing that day. Fed by `GET /runs/{run_id}/cash-forecast?horizon_days=N&t_plus=2`.
- **Smart column detection** - you don't have to match a rigid schema. The loader recognizes
  common merchant-export spellings (`Payment ID`, `Order Amount`, `Settlement Reference`,
  `Posting Date`, `Reference Number`, etc.), applies a fuzzy header match for anything not in
  the alias table (`SequenceMatcher` threshold 0.72), and synthesizes optional columns
  (`mdr_fee`, `gst_on_mdr`, `tcs`, `refund_amount`, `chargeback_amount`, `order_id`) as 0 when
  they aren't in the file. CSVs and Excel workbooks both go through best-header-row detection,
  so a bank statement with a 2-3 line title block above the table still parses. Every mapping
  is shown in the reconcile trace ("orders: mapped `order_number → order_id`, `placed_at → timestamp`…").
- **Fee-slab · revenue advice** - reads the batch's observed effective MDR and compares against
  three Razorpay slabs (Standard 2.00%, Growth 1.75%, Enterprise 1.50%). Ships a headline
  *"projected annual savings"* figure, an MDR-delta chip, a slab-ladder visual (current + target
  markers), and a volume multiplier toggle (×3 / ×12 / ×24 / ×52). Turns a reconciliation audit
  into an actionable sales-conversation opener. Fed by `GET /runs/{run_id}/fee-slab-advice`.
- **CFO morning brief** - one-click *"CFO Brief"* button in the Dashboard header. Generates a
  print-ready HTML one-pager: Net Available + cash position buckets + 7-day forecast table + top 3
  exceptions + tax exposure + resolution progress, stamped and styled to match the ledger palette,
  with a `@media print` sheet so save-as-PDF is clean. Fed by `GET /runs/{run_id}/cfo-brief.html`.
- **Stress benchmark chip** - a small chip under the Dashboard title reports the latest results
  from `scripts/benchmark.py`: *"Benchmark · 149,250 rows · 217.37s · 687 rec/s"* (real numbers
  from a local run). Fed by `GET /benchmark`.
- **"Prove it" receipts on Ask answers** - every aggregate answer (fees, reconciled amount,
  variance) now carries a receipts block: click *"Prove it - show the exact rows"* and the top
  15 `pay_XXX` ids that contributed to the number are listed with their per-record values,
  cross-checkable against Exceptions and the source-file viewer.
- **Repair Agent · per-record branching (agentic, not pipeline)** - every settlement that
  survives the exact + fuzzy passes is handed to a Repair Agent that tries three deterministic
  repair strategies in order, logs every attempt (score, verdict, latency, detail), and accepts
  the first strategy whose confidence clears threshold ≥ 0.85. The three strategies:
  **amount_utr_fuzzy** (tight standard fuzzy - logged as the control datum),
  **normalize_utr** (uppercase + strip punctuation, retry exact amount + UTR - catches
  formatting drift), and **widen_date_window** (paise-exact amount, extend T+ to ±7 days -
  catches late credits). The Dashboard has a "Repair Agent activity" card with per-strategy hit
  rates + recovery percentage + average attempts/record. Every attempt is persisted per-decision
  as `strategy_attempts_json`; the Exceptions drawer's new **Decisions** tab replays the tree
  for that specific record (verdict badges, score bars, "resolved via this" stamp on the winner).
- **Live Razorpay API verification (sponsor-product truth anchor)** - at ingest ReconMint makes
  a real HTTPS call to `api.razorpay.com` using your `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`,
  fetches up to 3 recent records from your test account, and renders the wire-level result on the
  Dashboard: HTTP status, latency, the URL that was hit, and the `X-Razorpay-Request-Id` header
  Razorpay stamps into every response (the id an auditor can quote back to Razorpay support to
  trace one call). If your test account has no payments yet, the client transparently falls back
  to `/v1/orders` - the truth-anchor a merchant creates first - and the card labels which source
  answered. If the API is unreachable or the keys are missing, that's surfaced honestly rather
  than hidden. Fed by `GET /runs/{run_id}/razorpay-verification`; also a live probe at
  `GET /razorpay/health`. Every reconcile trace now opens with a "Live Razorpay API handshake"
  stage.
- **Batch quality signals (grade A / B / C / D)** - for uploaded runs that have no ground-truth
  answer key, ReconMint publishes six *proxy* signals derivable from the audited decisions alone:
  cross-source coverage, fee-schedule adherence, triage certainty, fuzzy match quality,
  duplicates handled, input integrity. Each carries an A/B/C/D grade; a composite score is
  weighted from the four percentage signals. This replaces the pretend precision/recall you'd
  get from measuring against data you generated. Fed by `GET /runs/{run_id}/quality-signals`.
- **Adjustment memo (closes the finance-ops loop)** - resolving an exception now generates a
  downstream artifact in two formats: (1) a machine-readable JSON payload at
  `GET /decisions/{decision_id}/adjustment-memo` (with a simulated webhook payload the payer's
  ERP/ops queue could consume), and (2) a print-ready HTML memo at
  `GET /decisions/{decision_id}/adjustment-memo.html` that opens in a new tab and can be saved
  as PDF from the browser. The `resolution_reason` maps to a downstream action:
  *confirmed → audit-trail*, *override → post_journal_entry*, *false_positive → close_and_ignore*,
  *escalated → route_to_ops_queue*.
- **Tax-line matcher (Tax exposure this batch)** - a first-class panel that reads the audited
  fee reconstruction and surfaces three tax lines with observed-vs-expected drift:
  - **MDR** - observed % of gross vs expected 2.00%
  - **GST on MDR** - observed % of MDR vs expected 18.00%
  - **TCS** - observed % of gross vs expected 1.00%

  A headline **exposure** figure shows what the merchant should investigate:
  *over-charged* (recover from gateway) vs *under-charged* (reserve to pay back), with a per-record
  anomaly table ranked by |variance|, filterable by direction. When every rupee matches the
  Razorpay schedule to the paise the headline flips green ("Tax lines clean"). Fed by
  `GET /runs/{run_id}/tax-exposure`; every anomaly links to a `pay_XXX` present in the
  Exceptions list.
- **Detection Accuracy card** - precision / recall / F1 measured against a hidden answer key, plus
  the honest false-positive and false-negative counts. (Shown on demo runs, which have ground truth.)
- **Reconciliation Breakdown** - a mutually-exclusive stacked bar: auto-matched, fuzzy-matched, fee
  anomalies, unresolved, duplicates, ghost credits.
- **Record Reconciliation Waterfall** - a bridge chart showing how the batch flows from ingested down
  to unresolved, with hover tooltips.
- **Fee Composition donut** - where the money went across the batch (MDR vs GST-on-MDR vs TCS vs
  refunds) with the total in the centre.
- **AI cost strip** - model, calls, verified count, and the exact dollar cost of the run's AI.
- **Source Files viewer** - an in-app spreadsheet preview (Settlement report / Bank statement / Order
  ledger tabs) with search and zoom, so you can inspect the raw rows the agent reconciled.
- **Report** button - one click generates a clean, printable reconciliation report (run summary,
  accuracy, fee composition, full exception list) and opens the print dialog for PDF. **Audit export**
  downloads every logged decision as CSV.

<!-- ![Exceptions drawer - Decisions tab showing Repair Agent tree](docs/img/feature-decisions-tree.png) -->
<!-- ![Adjustment memo](docs/img/feature-adjustment-memo.png) -->

### Exceptions: review what needs a human
- **Severity tabs** (All / Critical / Warning / Info) with live counts, **search by payment ID**, and
  pagination.
- **Rich table:** payment ID, date, amount, category (Amount Mismatch / Missing in Bank / Chargeback
  / Duplicate), a colour-coded severity dot, match method, confidence, and status.
- **Detail drawer** on any row:
  - a **ledger** (computed vs bank) with the real fee lines - gross, MDR, GST-on-MDR, TCS - and the
    variance,
  - a **fee-bridge waterfall** visualising gross → net with the variance highlighted,
  - a **"verified against N computed figures"** banner,
  - an **AI explanation on demand** - click "Explain with AI" and the agent generates a plain-English
    explanation that's verified before it's shown (it falls back to the deterministic explanation if
    the model tries to introduce an unverifiable number),
  - a **Diagnose & Fix** tab with a per-category investigation checklist that persists across
    sessions - tick two steps, close the drawer, reload the page, the ticks are still there.
    Server-side storage via `POST /decisions/{id}/checklist`; the header carries a "Persisted"
    (or "Saving…") chip so the state is visible, not implied.
  - **Mark as Resolved**, which removes the item from the queue.
- **"View source data"** toggle opens the same spreadsheet viewer so you can cross-reference an
  exception against the raw settlement / bank rows.

<!-- ![Ask the agent - streaming trace + Prove-it receipts](docs/img/feature-ask-prove-it.png) -->

### Ask the agent: conversational, verified, and honest
The prompt box is deliberately spartan: a textarea, a send button, and one transparency chip that
reads *"This run only · figures verified before sent"*. No attachment button, no voice-record mic,
no mode toggles. The agent answers grounded questions about the loaded run and nothing else.


- Ask questions in plain English ("how much did fees eat this batch?", "which payments are missing in
  bank?", "explain pay_00010XX").
- The agent runs a **bounded loop** you can watch in the **Agent Trace**: understand intent → choose a
  deterministic tool → compute → verify → answer. Every figure carries a green "verified" tick.
- If a figure can't be grounded, the trace shows a **"caught - answered from computed data"** step -
  the model's phrasing is rejected and the grounded answer is used instead.
- Seed questions are provided so a reviewer can start immediately.

---

## The engine (how the money math works)

- **Integer paise everywhere.** All amounts are carried and compared as integer paise, so there is no
  floating-point drift - ₹0.01 errors can't cascade through fee arithmetic.
- **IST-normalised dates.** Every date is parsed to Asia/Kolkata, so a settlement dated Monday and a
  bank credit dated Wednesday (a normal T+2 lag) are compared correctly.
- **Fee reconstruction.** For each settlement, ReconMint independently recomputes the expected net
  from `gross − MDR − GST-on-MDR − TCS − refund − chargeback` and checks it against what Razorpay
  reported. A settlement whose bank credit matched but whose net is *wrong* is still flagged - because
  the money that landed was the wrong amount.
- **Exact match first, fuzzy second.** Exact matching joins on UTR + paise-exact amount + same IST
  day. What's left is retried with a tolerant, scored pass (±₹1 amount gate, T+0..T+3 window, UTR
  similarity) that recovers timing lags and transposed-digit UTRs - each with a confidence score, so a
  fuzzy match never masquerades as a certain one. An amount-bucket index keeps this near-linear at
  scale.
- **Deterministic triage + a stopping rule.** Every record is visited once and routed to
  auto-resolve, explain, or escalate. Unresolvable records (genuine ghost credits, chargebacks with no
  credit) are escalated - the agent never loops on them.

## Guardrails

- **Hallucination verifier.** Every rupee figure in an AI answer or explanation is checked against the
  set of computed magnitudes for that record; anything ungrounded is rejected and the deterministic
  answer is used instead. (Tested in `tests/test_verifier.py`.)
- **Injection-safe.** The LLM is only ever handed pre-computed numbers, never raw file text, so file
  contents can't smuggle in instructions. CSV export is neutralised against formula injection.
- **Full audit trail.** Every run and every per-record decision - match method, confidence, resolution,
  triage action, and any LLM call with its cost, latency, and verifier verdict - is written to SQLite
  and is queryable.

---

## Metrics (measured, from a real batch run: `make eval`)

| Metric | Value | Notes |
|---|---|---|
| Match rate (exact + fuzzy) | **97.68%** | on 512 active settlements |
| Reconciled rate | **94.78%** | fully tied order↔settlement↔bank, fee-validated |
| Throughput | **~12,700 rec/s** (0.12s) | 500-record target < 4s: **PASS** (0.40s) |
| Exception detection - Precision | **0.86** | of flagged, how many were real |
| Exception detection - Recall | **1.00** | of real problems, how many caught |
| Exception detection - F1 | **0.93** | TP = 31 · FP = 5 · FN = 0 |
| False-positive cost | **5** | all sub-paise GST rounding; 0 real money missed |
| Exceptions (honest list) | **42** | 19 critical · 23 warning |
| Q&A agent | **10/10** routing, **10/10** grounded | on the seed question set |
| AI cost | **~$0.00007 / explanation** | on demand, capped, verifier-gated |
| Razorpay schema fidelity | **7/11 exact** | validated against the live test API |

I keep the recall at 1.0 deliberately - the tool never misses real money - and I'm honest that this
costs a little precision: the five false positives are all sub-paise GST rounding, which a human
clears in seconds. That trade-off is a choice, and it's documented rather than hidden.

---

## Validated against the live Razorpay test API

The synthetic `settlement.csv` is modelled field-for-field on the **real** Razorpay API, not invented.
`scripts/razorpay_probe.py` creates real test-mode Orders and captures the live schema:

- **Live contact confirmed** - real Orders created (e.g. `order_TTqoMt4WLQVfAn`), 10 order fields
  confirmed live.
- **Schema fidelity: 7/11 exact** field matches, 3 close mappings, 1 explicit gap
  (`gross↔amount`, `mdr_fee↔fee`, `gst_on_mdr↔tax`, `net_settled↔settlement.amount`,
  `settlement_utr↔settlement.utr`, …). Full table in `docs/razorpay_validation.md`.
- **What's real vs generated:** test mode doesn't emit rich multi-day settlement files (settlements
  need live activation and real payout cycles), so ReconMint *generates* a batch whose **field shapes
  are real** while the **volume and multi-day timing are synthetic - and disclosed**. `tcs` is modelled
  explicitly because it's marketplace/Route-specific, not a standard payment field.

---

## Quickstart

Run the full app (backend + UI):
```bash
pip install -r requirements.txt
cp .env.example .env                    # add OPENAI_API_KEY (+ optional RAZORPAY test keys)
python backend/generator/generate.py    # seed synthetic data (520 records + hidden answer key)
uvicorn backend.api.main:app --port 8000
```
```bash
cd frontend && npm install && npm run dev   # open http://localhost:5173
```
Then click **Try sample data (demo)** to watch the agent reconcile live, or open **Ask the agent**.

Reproduce every number from the command line:
```bash
python scripts/run_eval.py       # match rate + precision/recall/F1 + honest error list
python scripts/eval_qa.py        # Q&A agent routing + grounding accuracy
python scripts/benchmark.py      # throughput / memory at 500 / 2k / 10k records
python scripts/razorpay_probe.py # validate the schema against the live Razorpay test API
make test                        # verifier + engine tests
```

## Data

`backend/generator/generate.py` emits `orders.csv`, `settlement.csv`, `bank.csv`, and a hidden
`answer_key.csv` with ground-truth categories (clean, fee_explained, partial_refund, chargeback,
timing_t2, duplicate, transposed_utr, ghost_bank, fee_anomaly, rounding_noise). The matcher never
sees the answer key - the eval harness scores against it.

## Performance

| Records | Rows | Time | Throughput | Peak mem |
|--------:|-----:|-----:|-----------:|---------:|
| 500 | 1,494 | 0.40s | 3,687 rec/s | 1.2 MB |
| 2,000 | 5,968 | 1.67s | 3,582 rec/s | 3.8 MB |
| 10,000 | 29,844 | 13.9s | 2,152 rec/s | 18.4 MB |

Near-linear scaling after I indexed the fuzzy pass by amount bucket (it was O(n²) before - see
`FAILURES.md`).

## Tests

`tests/test_verifier.py` (the hallucination guard) and `tests/test_engine.py` (end-to-end engine +
validation). Run with `make test`.

---

## A note on the build

I keep a running [FAILURES.md](FAILURES.md) of what actually broke and how I got out of it. The
floating-point rupee drift on day 3. The T+2 date-bucketing bug on day 5. The verifier that was
*too* strict and rejected correct explanations on day 7. The O(n²) fuzzy pass I only caught with a
stress benchmark. The Repair Agent that scaled cubically until I pre-built the amount + normalized-UTR
indexes. The Railway 500 caused by `requests` missing from requirements.txt. Every entry has symptom,
root cause, diagnosis, fix, and lesson.

I'd previously built Polynous, a multi-agent research system, so the agent scaffolding here was a
deliberate design choice, not something I stumbled into.

---

## What's in this repo

```
backend/          FastAPI + reconciliation engine
  agent/          Repair Agent, Q&A agent, LLM client, hallucination verifier, audit trail
  api/            HTTP endpoints + Pydantic models
  engine/         Loader, matcher, fuzzy pass, fee reconstruction, validation
  eval/           Ground-truth eval harness (F1 on demo dataset)
  generator/      Synthetic dataset generator for benchmarks
frontend/         React + Vite, ledger paper aesthetic, ~15 cards across 3 tabs
scripts/          Stress benchmark (1k/10k/50k rows)
tests/            Verifier + engine end-to-end tests
docs/             Razorpay validation notes, probe output
FAILURES.md       Live bug log, tracked with the code
CHEATBOOK.md      Internal ship log (git-ignored)
```

## Track 4 alignment · line-by-line

| Brief says | ReconMint ships |
|---|---|
| "Run the books" | 3-way reconciliation, int-paise math, SQLite audit trail |
| "and the cash position" | Cash Position card, 4 buckets, Net Available headline |
| "AI agent that closes one finance-ops loop" | Resolve → JSON memo + printable HTML + simulated webhook payload |
| "50+ record batch" | Verified 149,250 rows in 217s (see [benchmark](#performance)) |
| "reporting its match rate" | Headline metric strip + StackedBreakdown + per-strategy Repair Agent stats |
| "exceptions it could not resolve" | Full Exceptions table, none hidden, resolution reasons + notes persisted |
| "verification, not generation" | Hallucination verifier magnitude-checks every rupee an LLM writes |
| Direction: multi-source reconciliation | 3-way with fuzzy + Repair Agent branching |
| Direction: settlement Q&A agent | Ask page with parse → compute → verify → phrase loop |
| Direction: forward cash forecaster | 7/14/30d T+2 projection with past-due surfacing |
| Direction: tax-line matcher | MDR/GST/TCS observed vs expected + recover/reserve exposure |
