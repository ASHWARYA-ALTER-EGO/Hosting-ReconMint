# ReconMint - Premium & Distinctiveness Plan

Phased roadmap to take ReconMint from "clears the bar" to "wins Track 4". Executed one phase at a
time - a CLEAN PASS (submittable, distinct, credible) then a PREMIUM PASS (pushes above the cluster).

## Positioning (the reframe - no code)
ReconMint is not "a reconciliation tool". It is a **verification agent for money**: rules do the
math, an LLM narrates, and a verifier makes it physically unable to state a rupee it cannot prove.
This lands on Track 4's thesis ("verification, not generation, is the bottleneck") and covers TWO
named directions: Multi-source reconciliation + Settlement Q&A.

One-liner for the video/README: "Every number it says, it can prove. Ask it anything about your
settlement - it answers in plain English but never invents a figure."

===================================================================
# CLEAN PASS  (finishes a distinct, credible, submittable project)
===================================================================

## Phase 1 - Settlement Q&A Agent  [DONE 2026-08-24]  (the differentiator + kills the "where's the agent?" objection)
**Why:** Turns a pipeline into an agent you talk to; covers a 2nd named direction; best 15s wow.
**Tasks:**
- Backend: `POST /ask` - natural-language question over the current run.
  - LLM parses the question into a STRUCTURED intent (filters: date, payment_id, category, metric),
    NOT free SQL. Deterministic code runs the actual computation over the run's decisions/settlement.
  - The answer is composed from computed numbers; reuse the existing hallucination verifier so no
    figure is ever invented. If a number can't be grounded -> "I can't verify that from the data."
  - Return: { answer, figures[] (each with its source), intent, verified }.
- Frontend: a "Ask" panel (new sidebar item or a bar on the Dashboard). Chat-style input, grounded
  answer, each figure shown with a tiny "verified" tick.
- Seed 5-6 example questions ("why was Tuesday's payout short?", "how much did fees eat this batch?",
  "which payments are missing in bank?").
**Definition of done:** ask a question in the UI -> grounded, verified answer computed from real
data; a fabricated-number attempt is caught. Eval: 8-10 Q/A pairs with known answers, report accuracy.
**Effort:** ~1.5 days.

## Phase 1b - Agent Visibility ("Agent Trace")  [DONE 2026-08-24, shipped with Phase 1]  (PROVE it's an agent, not a pipeline)
**Why:** The word "agent" must be *shown*, not claimed. A judge should watch it reason. This is the
single component that removes "it's just a pipeline with LLM verification" for good.
**Principle:** the trace is REAL - it renders the actual backend steps, never a scripted animation.
`/ask` (and optionally `/reconcile`) return a `trace[]`; the UI plays back real steps with real
latencies. No fabricated "thinking...". No AI-slop (no neon, no fake typing, no emoji spam).
**What it shows (a vertical step timeline, reusing the existing reconcile-stepper visual grammar):**
  1. Understood intent  -> parsed intent chips (metric, filters) from the LLM
  2. Chose tool         -> e.g. "aggregate(fees) over 512 settlement rows" (deterministic tool name)
  3. Computed           -> the real figures it pulled (monospace, tabular)
  4. Verified           -> each figure ticked as grounded by the hallucination verifier
  5. Answered           -> the composed plain-English answer
  Each step: status (done / running), a real latency (ms), and the real data it produced. A rejected
  (ungroundable) figure shows a red "refused - cannot verify" step, which is the most convincing beat.
**Design:** white cards + slate text + thin connectors (like the Upload "Reconciling" stepper),
green verified ticks, small monospace numbers. Matches the current aesthetic exactly. Subtle, quiet.
**Agent framing across the product (copy, not slop):**
  - Backend returns a structured `trace` so the agency is data, not decoration.
  - Rename the Q&A panel to "Ask the agent"; a small "Autonomous reconciliation agent" line in the
    Dashboard header; the reconcile flow labeled as agent actions (plan -> match -> triage -> verify).
  - README + video lead with "agent": it plans, computes, verifies, and refuses - a loop, not a script.
**Definition of done:** asking a question renders a live, real step-trace ending in a verified answer;
at least one demo question triggers a visible "refused - cannot verify" step.
**Effort:** ~0.5-1 day (built alongside Phase 1).

## Phase 2 - Razorpay test-key validation  [DONE 2026-08-25]  (credibility with a Razorpay judge)
**Why:** Proof you modeled THEIR platform, not a made-up CSV. Highest-leverage credibility move.
**Tasks:**
- `scripts/razorpay_probe.py`: using the test key, create a few Orders + Payments via the Razorpay
  API; capture the real response schema (order, payment, settlement fields).
- Diff the real schema against our synthetic `settlement.csv` schema; document fidelity + any gaps.
- Add a README section "Validated against the live Razorpay test API" with a screenshot + the diff.
- Honesty note: test mode does not emit rich multi-day settlement files, so we generate them - the
  disclosed, correct workaround.
**Definition of done:** a committed script + screenshot proving real Razorpay test-API contact; the
README states exactly what is real vs generated.
**Effort:** ~0.5 day (you provide/confirm the test key + secret).

## Phase 3 - README architecture diagram + honest metrics table  [DONE 2026-08-25]  (first thing a judge sees)
**Why:** A judge reads the README before running anything.
**Tasks:**
- Architecture diagram (text/mermaid or an image): frontend -> API -> agent loop -> deterministic
  engine vs AI, verifier, audit DB. Call out which parts are AI and which are deterministic.
- A clean metrics table (match rate, throughput, precision/recall/F1, exception count, AI cost).
- "AI vs deterministic" rationale paragraph. One line linking Polynous as proof-of-shipping.
**Definition of done:** README opens with the one-liner, a diagram, and the metrics table.
**Effort:** ~0.5 day.

>>> After Clean Pass: the project is distinct (verification agent + Q&A), credible (Razorpay-proofed),
>>> and self-explaining (README). This alone is shortlist-worthy.

===================================================================
# PREMIUM PASS  (pushes above the top cluster)
===================================================================

## Phase 4 - Harder / adversarial dataset + difficulty toggle  (makes the honesty bulletproof)
**Why:** Precision 0.86 on self-made data invites "a test you built to pass." A harder scenario
proves the metrics are earned.
**Tasks:**
- Add adversarial cases: near-tie fuzzy candidates (two bank rows within tolerance), batched
  settlements (many payments -> one NEFT), split settlements, a genuine false-match trap.
- A "difficulty" param on the generator (easy / realistic / adversarial) surfaced in the UI.
- Re-run eval; report the (lower, honest) numbers per difficulty. This becomes a strong video beat.
**Definition of done:** eval runs on 3 difficulty levels with honest, distinct metrics each.
**Effort:** ~1 day.

## Phase 5 - Richer visualization + report export  [DONE 2026-08-25: fee-waterfall drawer + fee-composition donut + one-click printable report. Skipped: heavyweight xlsx-viewer (wrong stack fit).]  (premium finish)
**Tasks:**
- Settlement fee-waterfall per exception in the drawer (gross -> net visual), and a batch-level
  fee-composition donut (MDR vs GST vs TCS vs refunds).
- PDF/HTML reconciliation report: run summary + metrics + full exception list + audit trail, one
  click. (HTML-print-to-PDF is enough; no heavy dep.)
- Polish: empty states, hover states, number animations already partly done - finish them.
**Definition of done:** a downloadable report exists; drawer shows a fee visual.
**Effort:** ~1 day.

## Phase 6 - Deliverables: demo GIF, video, panel prep
**Tasks:**
- Demo GIF of the wow moment (drag files -> match rate -> exception -> verified Q&A) in the README.
- 5-minute video: shot list + VO + on-screen text (hook -> problem -> walkthrough -> architecture/
  AI-judgment -> metrics -> failure story -> ask). Every claim backed by a real number.
- Finalize the "what broke at 2 AM" answer from FAILURES.md (O(n^2) fix or verifier-too-strict).
- Panel rehearsal: expected questions, how to talk about the verifier + AI-vs-deterministic tradeoffs.
**Definition of done:** unlisted 5-min video + GIF in README + form answers drafted.
**Effort:** ~1.5-2 days.

===================================================================
# Order of execution
1. Phase 1 (Q&A agent)  <- start here; biggest differentiation, kills the agent objection
2. Phase 2 (Razorpay validation)
3. Phase 3 (README diagram)
   --- CLEAN PASS complete: submittable + distinct ---
4. Phase 4 (harder dataset)
5. Phase 5 (charts + report export)
6. Phase 6 (GIF + video + panel prep)
   --- PREMIUM PASS complete ---

# Explicitly NOT doing (would not move Track 4, risk over-engineering)
- Cash forecaster as a core loop (bad metric would hurt; loop already closed by reconciliation)
- Dark mode, auth, multi-tenant, live deploy as a requirement, microservices, streaming/websockets
