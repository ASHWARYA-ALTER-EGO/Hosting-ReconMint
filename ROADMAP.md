# ReconMint — Detailed Build Roadmap

Track 4 (AI Finance Controller) · Razorpay AI Buildathon · Solo · Deadline 2026-09-05

This document is the full, minute-level plan. Every day lists: the goal, the exact tasks, the
files touched, the definition of done, and what to cut if behind. Nothing shallow — this is the
contract we build against.

---

## The product in one line
Drop in 3 files (order ledger + Razorpay settlement report + bank statement) → a deterministic
engine reconciles all three → an LLM explains only the leftover exceptions → dashboard shows match
rate, throughput, and an honest list of what could not be resolved.

## The four scored criteria (every task must serve one)
1. **Problem Taste** — reconciliation is real, boring, universal merchant pain.
2. **Build Quality** — it runs with one command; clean structure; a Razorpay engineer would trust it.
3. **AI Judgment** — LLM used ONLY on exceptions; all money math is deterministic and auditable.
4. **Failure Recovery** — FAILURES.md logged live from Day 1.

## Deliverables that get evaluated
- Public GitHub repo that runs.
- 5-minute pitch video (unlisted OK).
- Written "what broke at 2 AM" story on the form.
- Architecture details.

## Deployment
NOT required. Judged on repo + video. Build to run locally with ONE command. Record against
localhost so nothing external can break mid-recording. Optional free deploy only if time permits.

---

# Day-by-day

## ✅ Day 1 — Scaffold + synthetic data generator  (DONE)
**Goal:** a repo that runs and a realistic dataset with ground truth.

Tasks completed:
- Created repo at `razorpay hackathon/reconmint/` with `.gitignore` (Claude files + secrets excluded),
  `requirements.txt`, `README.md`, `FAILURES.md`, `ROADMAP.md`.
- Built `backend/generator/generate.py`:
  - Emits `orders.csv`, `settlement.csv`, `bank.csv` + hidden `answer_key.csv`.
  - Models Razorpay fee stack: MDR 2%, GST 18% on MDR, TCS 1% (on a subset).
  - Injects 8 defect categories with ground-truth labels: `clean`, `fee_explained`,
    `partial_refund`, `chargeback`, `timing_t2`, `duplicate`, `transposed_utr`, `ghost_bank`.
  - Deterministic seed (42) so every run yields the same dataset → reproducible evals.
  - Produces 520 records (10x the 50-record floor).

**Definition of done:** `python backend/generator/generate.py` writes 4 CSVs, prints the category
distribution. ✅ Verified.

---

## Day 2 — Deterministic exact matcher
**Goal:** first real match-rate number from exact identity matching.

Tasks:
- `backend/engine/loader.py` — load the 3 CSVs into pandas DataFrames; normalize column types,
  parse dates to IST-aware datetimes, coerce amounts. Central place so date/amount handling is
  consistent (this is where the T+2 and float bugs will surface — watch closely).
- `backend/engine/matcher.py`, exact pass:
  - Join settlement ↔ order on `order_id` (does every settled payment map to a real order?).
  - Join settlement ↔ bank on `settlement_utr == utr` AND `net_settled == credit_amount`.
  - Mark each settlement row: `matched_exact` or `unmatched`.
  - Detect duplicates (same payment_id appearing >1) and quarantine them.
- `backend/engine/report.py` — compute and print: total records, exact-matched count,
  match rate %, throughput (records/sec via a timer).
- `scripts/run_match.py` — CLI: generate (if needed) → load → match → print report.

**Files:** loader.py, matcher.py, report.py, scripts/run_match.py.
**Definition of done:** running the script prints a match rate (expect ~35-70% at exact-only; the
fee/timing/fuzzy cases won't match yet — that's correct and expected).
**Cut if behind:** skip duplicate quarantine, add it Day 4.
**Watch:** if match rate is suspiciously low, log the float/timezone bug in FAILURES.md before fixing.

---

## Day 3 — Fee / GST / TCS reconstruction
**Goal:** reconcile the "net != gross" rows that are NOT errors, only fees.

Tasks:
- `backend/engine/fees.py`:
  - For each settlement row, independently recompute:
    `expected_net = gross - mdr - gst_on_mdr - tcs - refund - chargeback`.
  - Compare `expected_net` to reported `net_settled` within a tolerance.
  - **Use integer paise arithmetic** (multiply by 100, round, compare as ints) to avoid float drift.
    If you did NOT do this Day 2 and hit float bugs — log it in FAILURES.md, this is the fix.
  - Label rows where net is fully explained by fees as `fee_explained` (reconciled, not an exception).
- Extend matcher: a settlement row is "resolved" if bank credit == its (fee-adjusted) net.
- Update report: break match rate into `clean_matched`, `fee_reconciled`, `still_unmatched`.

**Files:** fees.py, matcher.py (extend), report.py (extend).
**Definition of done:** fee_explained rows now count as reconciled; match rate jumps substantially.
**Cut if behind:** drop TCS handling (rare subset), keep MDR + GST.

---

## Day 4 — Fuzzy matching + confidence scoring
**Goal:** catch the near-misses (timing, transposed UTR) without false matches.

Tasks:
- `backend/engine/fuzzy.py`:
  - For still-unmatched settlements, find bank candidates by:
    - amount within ±₹1 tolerance, AND
    - value_date within a T+0..T+3 window of settled_at (explicit IST date bucketing — the T+2 bug fix).
  - UTR similarity (Levenshtein / digit-transposition check) to catch `transposed_utr`.
  - Score each candidate 0..1 (amount closeness + date closeness + UTR similarity, weighted).
  - Accept the top candidate only if score >= threshold (e.g. 0.85); else leave unmatched → exception.
- Confidence recorded on every match (exact = 1.0, fuzzy = its score).
- Finalize duplicate handling: keep one, flag the copy as `duplicate` exception.

**Files:** fuzzy.py, matcher.py (extend), report.py (extend).
**Definition of done:** timing_t2 and transposed_utr rows now match with confidence < 1.0; the only
things left unmatched are genuine exceptions (chargeback residue, ghost_bank, unresolvable).
**Cut if behind:** drop UTR-similarity (keep amount+date), transposed_utr becomes an exception (fine).

---

## Day 5 — Eval harness + honest metrics
**Goal:** turn results into defensible numbers by scoring against the answer key.

Tasks:
- `backend/eval/harness.py`:
  - Load `answer_key.csv` (ground truth, never seen by the matcher).
  - For each record, compare predicted category/resolution vs truth.
  - Compute: overall **match rate**, **throughput** (records/sec), and **precision/recall** on
    "is this an exception" detection (did we correctly separate real problems from fee noise?).
  - Confusion matrix: which categories we misclassify.
- `backend/eval/report_eval.py` — print a clean metrics table + an error-analysis section
  ("we wrongly flagged N fee rows as exceptions because...").
- Save eval output to `data/eval_results.json` for the README + video.

**Files:** harness.py, report_eval.py.
**Definition of done:** one command prints match rate, throughput, precision/recall, and an honest
error list. THIS is the on-screen number for the video at 3:30.
**Cut if behind:** drop confusion matrix, keep match rate + precision/recall.

---

## Day 6 — Agent loop + exception triage + audit log
**Goal:** earn the word "agent" and log every decision.

Tasks:
- `backend/agent/orchestrator.py` — the control loop that ties it together:
  `ingest → reconstruct fees → exact match → fuzzy match → triage each leftover → decide action
  (auto-resolve / explain / escalate-to-human) → log`.
  - Triage rules (deterministic): route each exception by category to the right handler.
  - Stopping rule: never loop on an unresolvable record; mark `needs_human` and move on.
- `backend/agent/audit.py` — SQLite writer. Every record's journey logged:
  inputs, match method, confidence, action taken, timestamp. (LLM fields added Day 7.)
- Schema: `runs`, `decisions` tables.

**Files:** orchestrator.py, audit.py.
**Definition of done:** running a reconciliation writes a full audit trail to SQLite; every decision
is queryable. The loop is clearly an agent, not a script.
**Cut if behind:** keep audit log minimal (record id, method, verdict) — expand later.

---

## Day 7 — LLM exception explainer + hallucination verifier  [needs OpenAI key]
**Goal:** the narrow, defensible use of AI.

Tasks:
- Create `.env` with `OPENAI_API_KEY=...` (gitignored). YOU provide the key.
- `backend/agent/explainer.py`:
  - For one exception, build a prompt containing ONLY the computed facts (gross, fees, net,
    candidate bank rows, category). Ask for: a plain-English explanation + a suggested resolution.
  - Structured output (JSON): `{explanation, suggested_fix, category}`.
- `backend/agent/verifier.py` — the guardrail:
  - Extract every rupee figure from the LLM's explanation.
  - Reject/flag any number NOT present in the computed data (kills hallucination).
  - If verification fails, fall back to a deterministic template explanation.
- Prompt-injection defense: treat file `narration` text as data, never instructions.
- Log LLM call to audit: prompt, response, tokens, cost, latency, verifier verdict.

**Files:** explainer.py, verifier.py, .env (local only).
**Definition of done:** each exception gets a grounded explanation; verifier catches any invented
number; cost/latency logged. Explanations are accurate on a hand-checked sample of ~30.
**Cut if behind:** drop suggested_fix, keep explanation only.

---

## Day 8 — React dashboard  (reuse Polynous UI)
**Goal:** the visible product — the three screens.

Tasks:
- `frontend/` — React app (reuse Polynous components for premium look).
- Screen 1 Upload: 3-file drop-zone + Reconcile button → `POST /reconcile`.
- Screen 2 Dashboard: hero match-rate number, stat tiles (records · seconds · ₹ reconciled),
  matched-vs-exception chart.
- Screen 3 Exceptions panel: table of unresolved rows, click a row → side panel with the LLM
  explanation + math breakdown + category. Bottom: "N genuinely unresolvable" honesty line.
- `backend/api/main.py` — FastAPI endpoints: `POST /reconcile`, `GET /runs/{id}`,
  `GET /runs/{id}/exceptions/{ex}/explain`, `GET /runs/{id}/audit`. Idempotency via file-hash.

**Files:** frontend/*, backend/api/main.py.
**Definition of done:** upload 3 files in the browser → see the dashboard → click an exception →
read the AI explanation. End-to-end works locally.
**Cut if behind:** plainer styling; skip the chart, keep the number + table.

---

## Day 9 — Razorpay test-key validation + polish  [needs Razorpay key]
**Goal:** the credibility move + first polish pass.

Tasks:
- `scripts/razorpay_probe.py` — using YOUR test key, create a few test-mode Orders + Payments via
  the Razorpay API; capture the real response schema.
- Diff the real schema against our synthetic settlement schema; note fidelity in README + a
  screenshot for the video ("validated against live Razorpay test API").
- Honesty note (for video): test mode doesn't emit rich multi-day settlement files, so we generate
  them — the correct, disclosed workaround.
- First polish: ₹ Indian comma formatting, loading states, error state for a wrong file.

**Files:** scripts/razorpay_probe.py, README (update), frontend polish.
**Definition of done:** a screenshot proving real Razorpay test API contact; numbers formatted; a
wrong upload fails gracefully.
**Cut if behind:** skip live probe, cite the documented schema instead (still fine, less strong).

---

## Day 10-11 — Deep polish
**Goal:** make a Razorpay engineer trust it on sight.

Tasks:
- **One-command setup:** `docker-compose.yml` (or `make run`) → app up, seed data preloaded.
  Test from a clean state; if a judge can't run it in 60s, build-quality score dies.
- **README that sells:** architecture diagram, auto-playing demo GIF of the wow moment, metrics
  table, AI-vs-deterministic rationale, one line citing Polynous as proof-of-shipping.
- **Empty/edge states:** wrong file, empty file, huge file, all-matched case, all-exception case.
- **Micro-polish:** monospace numerals, animated match-rate counter, smooth exception-panel open.
- **Audit export button:** download full decision log as CSV/PDF.
- Optional: free Render/Railway deploy → link in README (nice-to-have only).

**Definition of done:** clone → one command → runs → looks expensive → handles bad input cleanly.

---

## Day 12 — FAILURES.md write-up + application form answers
**Goal:** convert the log into scored narrative.

Tasks:
- Clean the top 1-2 bugs into tight stories: symptom → diagnosis → root cause → fix → lesson.
  (Most likely: float rupee drift and/or T+2 date-bucketing.)
- Draft the form's "what broke at 2 AM" answer from the strongest story.
- Draft the problem statement + architecture answers.
- Final metrics table locked from a fresh eval run (numbers must be real and reproducible).

**Definition of done:** form answers drafted; FAILURES.md reads as a narrative, not a raw log.

---

## Day 13 — Record the 5-minute video
**Shot list / timing:**
- 0:00-0:20 Hook — the ₹4,20,000 vs ₹4,17,850 mismatch; "a human spends hours, ReconMint 3 seconds."
- 0:20-0:50 Problem + who hurts — the finance person; fees/GST/T+2 mess.
- 0:50-2:30 Walkthrough (wow) — drag 3 files → "94.2% matched, 512 records, 3.4s" → click exception
  → AI explains the ₹2,150 gap is fee+GST, not a discrepancy.
- 2:30-3:30 Architecture + AI judgment — the diagram; "money math is deterministic and auditable;
  AI only explains the tail, with a verifier that rejects invented numbers."
- 3:30-4:15 Metrics — the eval table incl. precision/recall + the honest unresolved list.
- 4:15-4:45 Failure — the logged 2 AM bug and the fix.
- 4:45-5:00 Ask — "Built solo in 8 days. Repo here. I want to build finance infra at Razorpay."

**Definition of done:** a tight, <=5:00 recording where every claim is backed by an on-screen number.

---

# Requirements from YOU (the human)
| # | What | When |
|---|------|------|
| 1 | OpenAI API key in `.env` | Day 7 |
| 2 | Razorpay test key + secret in `.env` | Day 9 |
| 3 | Record the 5-min video (I write script) | Day 13 |
| 4 | Approve/tweak form answers | Day 12 |
| 5 | Panel interview prep (I rehearse you) | after shortlist |

Cost to you: effectively zero (OpenAI calls are pennies; everything else is free/local).

# Rules
- NEVER commit/push — user commits manually. Claude files gitignored.
- No deploy required; localhost only for the video.
- Every video claim backed by a real number from a batch run.
- Log bugs the day they happen.
```
