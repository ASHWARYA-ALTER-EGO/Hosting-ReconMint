# ReconMint

**Three-way Razorpay settlement reconciliation agent.** Ingests an order ledger, a Razorpay
settlement report, and a bank statement, then reconciles all three: matching engine is
deterministic (auditable money math), and an LLM is used *only* to explain the exceptions it
cannot auto-resolve. Reports match rate, throughput, and an honest list of unresolved records.

> Razorpay AI Buildathon — Track 4 (AI Finance Controller). Solo build.

## Why this architecture
- **Deterministic core:** all matching and arithmetic (fee/GST/TCS reconstruction, amount and
  date tolerance, confidence scoring). An LLM has no business doing reconciliation math — it must
  be deterministic and auditable.
- **AI, narrowly:** the LLM only writes a plain-English explanation + suggested fix for each
  exception, with a verifier that rejects any rupee figure not present in the computed data.

## Quickstart
```bash
pip install -r requirements.txt
python backend/generator/generate.py    # writes 3 CSVs + answer_key to data/generated/
python scripts/run_match.py             # runs the matcher (exact + fuzzy), prints the report
python scripts/run_eval.py              # scores vs the answer key, writes data/eval_results.json
python scripts/run_agent.py             # runs the agent loop, writes the SQLite audit trail
cp .env.example .env                    # add your OPENAI_API_KEY (gitignored)
python scripts/run_explain.py 12        # agent + LLM exception explainer (verified), capped calls
```

## Data
`backend/generator/generate.py` emits `orders.csv`, `settlement.csv`, `bank.csv`, and a hidden
`answer_key.csv` with ground-truth categories (clean, fee_explained, partial_refund, chargeback,
timing_t2, duplicate, transposed_utr, ghost_bank). The matcher never sees the answer key; the
eval harness scores against it.

## Status
- [x] Day 1 — scaffold + synthetic generator (520 records) + FAILURES.md
- [x] Day 2 — deterministic exact matcher (91% exact match rate, paise-exact + IST dates)
- [x] Day 3 — fee/GST/TCS reconstruction (460 fee-reconciled, 10/10 fee anomalies caught, 0 false positives)
- [x] Day 4 — fuzzy matching + confidence (97.67% match rate, 34 near-misses recovered, 0 false matches)
- [x] Day 5 — eval harness + metrics (precision 0.86 / recall 1.0 / F1 0.93 on exception detection; honest FP list; confusion matrix; eval_results.json)
- [x] Day 6 — agent loop + exception triage + SQLite audit trail (532 decisions logged & queryable; deterministic triage; stopping rule)
- [x] Day 7 — LLM exception explainer + hallucination verifier (grounded explanations, model-switchable, verifier rejects fabricated figures, ~$0.00007/call)
- [x] Day 8a — FastAPI layer (/health, /reconcile, /reconcile/demo, /runs/{id}, /exceptions, /audit-export; Pydantic models; friendly errors; severity counts) — see FRONTEND_SPEC.md
- [x] Day 8b — React app (Vite): Upload + Dashboard + Exceptions integrated, wired to the live API, real numbers, on-demand AI explanations, verified in-browser
- [x] Phase 1 — Settlement Q&A agent (`/ask`): structured-intent routing + deterministic compute + verifier-gated phrasing + live Agent Trace; 10/10 routing, 10/10 grounded (2nd named direction covered)
- [ ] Day 9 — Razorpay test-key schema validation + polish

## Performance (make bench)
| Records | Rows | Time | Throughput | Peak mem |
|--------:|-----:|-----:|-----------:|---------:|
| 500 | 1,494 | 0.40s | 3,687 rec/s | 1.2 MB |
| 2,000 | 5,968 | 1.67s | 3,582 rec/s | 3.8 MB |
| 10,000 | 29,844 | 13.9s | 2,152 rec/s | 18.4 MB |

Target (500 records < 4s): PASS. Near-linear scaling after amount-bucket indexing of the fuzzy pass.

## Tests (make test)
`tests/test_verifier.py` (hallucination guard) and `tests/test_engine.py` (end-to-end engine +
validation) - 8 tests, all passing.

See `FAILURES.md` for the running "what broke" log.
