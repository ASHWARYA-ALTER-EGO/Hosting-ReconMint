# FAILURES.md

Real bugs I hit while building ReconMint. I keep this file open in a tab and update it the day
something breaks, otherwise I forget the actual cause and remember only the fix. Newest entries
are at the bottom because I read them chronologically when I'm looking for a pattern.

The point of this file: if a judge asks "what actually broke", I can pick any entry, read the
first two lines, and know exactly what to say.

---

## 2026-08-23 · Day 1

Scaffold day. Nothing broke yet. Two things I already know will bite me once the matcher runs:

1. Float rupees. If I compare `4171.85 == 4171.85` in Python I'll get burned inside a week. Going
   straight to integer paise everywhere.
2. Time zones on the settlement date. Bank credit shows up Wednesday, settlement is dated Monday,
   naive datetime compare says "3 days late, no match". Everything through pandas needs `.tz_localize("Asia/Kolkata")` and I need to normalize before the date compare.

Predictions. Log them when they happen.

---

## 2026-08-23 · Day 5 · precision collapsed on the eval

Added realistic `rounding_noise` records to the eval generator (legit payments where the
reported net differs from my recomputed net by 2 or 3 paise, because half-even vs half-up
rounding is a real thing). Ran `make eval`. Precision on exception detection dropped from
1.0 to 0.86. Five perfectly-good rows flagged as `fee_anomaly`.

Was mad about it for like an hour, then read the error-analysis list and every single false
positive was `rounding_noise` truth. My fee tolerance is 1 paise, but GST-on-MDR can legitimately
differ by 2-3 paise between systems that round differently. So a tolerance that tight literally
cannot distinguish "sub-paise rounding artifact" from "actual small overcharge".

Fix: materiality threshold. Only flag a fee gap if it exceeds `max(a few paise, 0.05% of gross)`.
Real overcharges are 0.4-1.2% of gross, so this doesn't hurt recall at all. Documented the
threshold in `config.py` with the exact reasoning so future me doesn't lower it.

Takeaway I keep thinking about: precision = 1.0 on data I generated was actually the smell. If
the eval was any good it would have shown me the rounding issue on day 3.

---

## 2026-08-23 · fuzzy matcher was O(n²)

Ran the benchmark for the first time. 500 records: 0.7s. 2000 records: 13s. 10k: 116 seconds.
Curve is unmistakably quadratic. Fine for the 100-row demo but if any judge uploads a real batch
this is embarrassing.

Cracked it open. The fuzzy pass was scoring every unmatched settlement against every available
bank row, running SequenceMatcher on each pair. String similarity in a nested loop, obviously.

The amount gate was ALREADY restricting real candidates to ±₹1, so 99% of that scoring was
wasted work on rows that would fail the gate anyway. Built an amount-bucket index once
(`{whole_rupee: [bank_idx, ...]}`), each settlement only scans its own bucket plus the two
neighbours. Fuzzy dropped from ~O(unmatched × bank) to roughly O(unmatched).

10k: 116s → 14s. 2k: 13s → 1.7s. Match results identical (verified with an assert on the
result set).

Ran a bigger benchmark right after this and moved on. Lesson noted: if a gate filters candidates
logically, it should also filter them computationally. Don't pay to score rows you've already
ruled out.

---

## 2026-08-23 · Day 7 · verifier was rejecting CORRECT explanations

Turned on the LLM explainer for exception rows. Ran a batch, checked the audit. 3 out of 6
explanations flagged as hallucinations and swapped for the deterministic fallback. Read the
LLM's actual output and the numbers were RIGHT. What.

Every rejected row was a chargeback with a negative net. The verifier's regex was pulling
rupee figures out of the LLM text but stripping the minus sign. So the LLM's correct
`"Rs. -39.91"` was being parsed as `39.91` and compared against the allowed value of `-39.91`.
Signed compare failed, so a correct figure looked fabricated.

Sat with this for a bit because I didn't want to weaken the verifier. Fix: compare magnitudes
(absolute values) on both sides. A fabricated number still won't match any real magnitude, so
the guard keeps its teeth. Also added the fee subtotal `(mdr + gst + tcs)` to the allowed set
because the LLM often quotes that and it's grounded.

After the change: 12/12 verified across the same batch. Wrote `tests/test_verifier.py` with a
few adversarial cases (fabricated number, near-fabricated within 1 paise, sign-flip) to keep
this from regressing.

Real lesson: a guardrail that's too strict fails silently, because everything just falls back
and quality degrades quietly. If I hadn't opened the audit table I wouldn't have caught this
for weeks. Log rejections, don't just count them.

---

# Polish week (2026-08-28 → 2026-08-29)

The problem-statement audit turned up around 20 concrete issues. These are the ones that either
broke silently, wasted the most time, or would have cost points in a demo.

## 2026-08-28 · xlsx uploads silently 422'd (`openpyxl` not installed)

Uploaded my own three test files to check something. Every one returned 422 with:

```
"orders could not be read (ImportError). Export the first sheet as CSV or .xlsx with a header row."
```

Spent 15 minutes double-checking my test files thinking they were malformed. They weren't. The
error message blames the FILE but the actual cause is `import openpyxl` failing at the top of the
loader. `openpyxl` was in `requirements.txt` but my local venv had never been reinstalled since
I added it.

`pip install openpyxl xlrd`, restart, works.

Fix on the code side: the loader's exception message now names `ImportError` explicitly when
that's the cause, so future me doesn't chase the wrong ghost.

This one was properly annoying because it looked exactly like a data bug. Any error message that
puts the blame on the user for what's actually a system misconfig burns hours.

---

## 2026-08-28 · every uploaded run showed the DEMO source files in the viewer

Uploaded a fresh batch. Dashboard numbers are correct, exceptions look right. Click into Source
Files → I'm seeing the synthetic demo CSV. My uploaded rows are nowhere.

Went to `GET /data/source/{name}` and immediately saw why. Path was hardcoded to
`DEFAULT_DATA_DIR/{name}.csv` regardless of what run I was on. Uploaded files streamed into a
tempdir, reconciled, then `shutil.rmtree` wiped the tempdir. There was literally nothing left
per-run for the viewer to fetch.

Rewired the whole thing. Uploads now persist to `data/runs/<run_id>/`. New endpoint
`GET /runs/{id}/source/{name}` serves them scoped to the run. Frontend `SourceFilesCard` takes
a `runId` prop. Demo runs still fall through to the demo dir so nothing regressed there.

If a judge had spotted the demo CSVs behind uploaded data they would have (correctly) concluded
the whole thing was faked. Was very glad I found this myself.

---

## 2026-08-28 · resolution chips did NOTHING

The Exceptions drawer has four resolution chips (Confirmed match / Manual override / False
positive / Escalated to finance) and a note field. Click a chip, add a note, hit Resolve, get
a toast that says "Resolved". Looks perfect.

Opened the audit CSV export. `resolved=1` on every row, everything else blank. The chip choice
and the note were both being silently dropped.

Debugged this by running:

```
sqlite3 data/audit.db "SELECT id, resolved, resolution_reason, resolution_note FROM decisions WHERE resolved=1 LIMIT 5"
```

Every row: `resolved=1`, then three NULLs. So the write was happening but only the boolean.
Traced it end-to-end:

1. Frontend called `api.resolveDecision(item.decisionId)` , passed the id only, dropped reason
   and note.
2. Backend `/decisions/{id}/resolve` didn't even accept a body.
3. `decisions` table didn't have columns for `resolution_reason`, `resolution_note`, or
   `resolved_at`.

Three broken layers stacked. Fixed all three. Added the columns via idempotent migration.
`AuditLog.resolve(id, reason, note)` now persists all of them plus a timestamp. Endpoint
accepts JSON body and validates the reason against the four allowed values. Frontend forwards
the payload. Toast now names which bucket the resolution went to.

This one really bothered me because it's the kind of feature where I would have SWORN it
worked from clicking around. Half-wired UI is worse than absent UI. It teaches the operator
to distrust everything.

---

## 2026-08-28 · "Open in source file" jumped nowhere

Small one but annoying. Click "Open in source file" from an exception → viewer panel opens,
scrolls to nothing, no highlight. Point of the feature is to jump to the exact row.

Prop-shape mismatch across three files:

- `ExceptionsPage` set `sourceFocus = { id: item.id, column, token }` where `id` was the string `pay_XXXXXXX`.
- `SourceFilesCard` forwarded it as `focusRowId={sourceFocus?.id}`.
- `ExcelViewerCard` accepted `focusRow` (a **number**), not `focusRowId`.

useEffect never fired because it was watching the wrong prop.

Added `focusRowId` as a real prop on the ExcelViewer. When present, searches the loaded grid
(case-insensitive) for a cell matching the id, computes the row index, runs the existing
scroll + pulse logic. Also changed the highlight color from the default emerald green (too
positive) to `#B5432F` with an infinite pulse. Cell you're supposed to look at should look
attention-grabbing, not celebratory.

If this project were in TypeScript the compiler would have caught this in 0.3 seconds.

---

## 2026-08-28 · Ask agent refused two of its own seed questions

Ask page shows example question chips. Clicked "How many exceptions need review?" , the agent
refused with the off-topic banner. Clicked "How do I fix pay_0001002?" , same. These are
literally the questions I ship as suggestions.

`parse_intent()` calls the LLM to route the question to a metric. LLM was classifying both
questions as `off_topic` because they don't literally contain the word "fee" or "settlement".
The keyword parser correctly matched "exception" to `exceptions_summary`, but it only ran as
a fallback for LLM ERRORS, not for LLM refusals.

Two fixes:

1. If the LLM returns `off_topic` but the keyword parser finds a concrete metric, trust the
   keyword parser. LLM refusal + keyword hit = keyword wins.
2. Added a new `resolve_payment` intent. If the LLM says `explain_payment` for a `pay_` id but
   the phrasing contains "fix / resolve / handle / escalate", upgrade to `resolve_payment` so
   the agent returns a structured plan instead of just an explanation.

Now every seed chip works. Also feels philosophically right: the deterministic keyword parse
should be a first-class safety net, not a last resort.

---

## 2026-08-28 · Waterfall chart was empty on every uploaded run

Dashboard's Record Reconciliation Waterfall rendered beautifully on the demo. Uploaded my own
data → chart showed a fallback message: "Full breakdown & accuracy are shown for demo runs
(which have ground truth)."

So it was working exactly as I coded it, just as I coded it wrong. The waterfall was consuming
`evalData.breakdown` from `run_eval()`, and `run_eval()` needs the ground-truth answer key
which only the demo has.

Fix: split the breakdown from the eval. New `/runs/{id}/breakdown` endpoint that computes the
mutually-exclusive buckets straight from the persisted `decisions` table. Works for any run,
uploaded or demo, no ground truth needed. Accuracy card stays demo-only because F1 genuinely
can't be computed without an answer key, but that's a much narrower gap. Also wrote the
Quality Signals card that publishes six A/B/C/D proxy grades so uploaded runs get an honest
"how trustworthy" answer without pretending to have F1.

Any visualization sourced from an eval-only pipeline will silently disappear on real data.
Noted.

---

## 2026-08-28 · Windows console cp1252 crashed every `₹` print

`export PYTHONIOENCODING=utf-8` is now permanently in my shell aliases. Every debug pipe like
`curl … | python -c "…₹…"` was crashing with UnicodeEncodeError because Windows console
codepage is cp1252 and ₹ (U+20B9) isn't in it. Backend itself was fine because it had
`sys.stdout.reconfigure(encoding='utf-8')` from an earlier session. The pain was only in test
harnesses.

Not a real bug. Just a Windows tax I keep forgetting to pay.

---

## 2026-08-28 · voice mic + attach + mode toggles on Ask page did NOTHING

The Ask page prompt box was a component I pasted from an earlier project. It had a paperclip
(attach image), a voice-record mic, and three mode toggles (Search / Think / Canvas). I never
wired any of them because the Ask agent doesn't need them.

Realized a judge is going to click every single one. That's a huge tell that the app is a
template dressed up as a product.

Stripped the whole thing to a textarea, a send button, and one transparency chip:
`This run only · figures verified before sent`. Deleted the `VoiceRecorder` component, the
`ModeBtn` component, six unused icons, and two `@keyframes` blocks. Same brand palette,
nothing that pretends to work.

Rule for the rest of the build: every button either wires to a real action, or it doesn't
ship. No exceptions.

---

## 2026-08-28 · Diagnose checklist state was ephemeral

Operator ticks two checklist items in the Exceptions drawer's Diagnose tab. Closes the drawer.
Reopens the same exception. Ticks are gone. Because it was `useState({})` , no persistence at
all, not even localStorage.

Added `checklist_state_json` column to `decisions` via idempotent migration, new
`POST /decisions/{id}/checklist` endpoint, drawer hydrates from `item.checklist_state` on open
and auto-saves on every toggle (debounced 400ms so a burst of clicks is one round-trip). Header
now shows a small "Persisted" chip (moss green) or "Saving..." chip (ochre, pulsing) so the
state is visible.

Anything a user actively touches has to persist somewhere. Judges will click checkboxes and
then look for confirmation the click landed. The chip matters as much as the write.

---

## 2026-08-28 · Vite kept spawning on ports 5173, 5174, 5175...

Not a bug, more of a build-time annoyance. Every `npm run dev` restart landed on the next port
because previous Vite processes were still running. By day 2 I was on 5177 and had three
browser tabs pointed at stale ports.

Fix: `taskkill /F /IM node.exe` before every start. Also killed all `python.exe` at the same
time because I had leftover backends too.

Wrote it into a tiny `.bat` I never actually used.

---

## 2026-08-29 · Repair Agent scaled CUBICALLY at 30k+ rows

Built the Repair Agent (per-record branching, three strategies, first-wins). Added the stress
benchmark to prove throughput. Ran it:

```
 1,000: 16.9s (   176 rec/s)
10,000: 143.3s (   208 rec/s)
50,000: (hung after ~4 min at 240MB, killed it)
```

Superlinear curve. Actually cubic on this workload. This wasn't just slow, it was broken.

Profiled the per-strategy functions. 95% of wall clock was one line:

```python
for bidx in available_idx:
    row = bank.loc[bidx]        # <-- this
```

Every strategy iterated the full available_bank set linearly, and `bank.loc[bidx]` in pandas
is ~10-100µs per call (individual row lookup by index). On 10k rows with ~3k unmatched × 3
strategies × ~10k bank rows = ~900 million `.loc[]` calls. Perfectly cubic.

Fix: pre-build indexes ONCE outside the per-record loop.

```python
amount_index   = { credit_paise: [bank_idx, ...] }      # bucket by paise
norm_utr_index = { (credit_paise, normalized_utr): bank_idx }
```

Passed as an `indexes=` kwarg into `repair_settlement()`. Each strategy uses them when
present, falls back to a linear scan for small batches so the tests don't need to change.

Post-fix numbers:

```
10,000: 143s → 48s
50,000: (used to hang) → 217s   (687 rec/s peak, 160MB peak)
```

The right data structure beat throwing more CPU. Any per-record retry loop against a big pool
needs an index built once at the top of the loop, not walked N times per record.

---

## 2026-08-29 · Railway 500'd: `ModuleNotFoundError: 'requests'`

Deployed backend to Railway. `/health` returned 200 fine. First `/reconcile` call: 500. Read
the Railway log:

```
ModuleNotFoundError: No module named 'requests'
  File "/app/backend/agent/razorpay_client.py", line 41
```

I added `requests` to the Razorpay client module during polish week but never added it to
`requirements.txt`. My local dev had `requests` sitting around from other tooling, so
`pip install -r requirements.txt` in a CLEAN Railway container succeeded without it, and the
import only fires at reconcile time. `/health` doesn't touch the razorpay module, so it passed
smoke.

Three-part fix:

1. Added `requests==2.32.3` to `requirements.txt` (obvious).
2. Guarded the import in `razorpay_client.py`. Missing package returns a clean
   `ProbeResult(ok=False, reason="dependency_missing")` instead of exploding.
3. Wrapped the orchestrator's handshake call in a broad `try/except` so no Razorpay failure
   can ever stop a reconcile.

`/health` was a false security blanket. Any code path that fires on the main request path
needs to be exercised at least once in a clean venv BEFORE deploy. Considered adding a startup
`import` check across `backend/agent/`; parked it for now.

---

## 2026-08-29 · Cloudflare Pages: every API call "Failed to fetch"

Deployed frontend to Cloudflare Pages at `reconmint.pages.dev`. Landing page rendered fine.
Every button crashed with "Failed to fetch". Console showed 404s pointing at:

```
https://reconmint.pages.dev/reconcile/demo
```

Wrong origin. The static host doesn't proxy `/reconcile` to Railway.

My `resolveApiBase()` had a same-origin fallback (`""`) meant to work behind a reverse proxy.
Cloudflare Pages doesn't proxy. And I hadn't set `VITE_API_BASE_URL` at build time, so no
override kicked in. First build shipped without it.

Three-layer fix:

1. Documented the two env vars that MUST be set: `VITE_API_BASE_URL` on frontend BUILD, and
   `RECONMINT_CORS_ORIGINS` on backend RUNTIME.
2. Added two more fallback slots to `resolveApiBase()`: `window.__RECONMINT_API_BASE__`
   (runtime injectable) and `localStorage['reconmint_api_base']` (per-browser). Now a judge
   with a live deploy can point it at a different backend without rebuilding.
3. Rewrote the fetch error path. Network failures now throw a message that names the URL
   that was tried, both env vars, and the underlying browser error. No more bare "Failed to
   fetch".

A same-origin prod fallback is a landmine on split-host deploys. If a fallback exists, its
failure mode should tell you exactly which config knob is missing.

---

## 2026-08-29 · loader crashed on REAL merchant CSVs

Everything worked on synthetic. Then I tried a fresh CSV I hand-built to look like a real
Razorpay dashboard export. 422:

```
"settlement is missing required column 'mdr_fee'"
```

The user's real export column was called "Fee", not "mdr_fee". And they had no TCS column at
all. My alias table had ~20 entries and treated 11 settlement columns as mandatory.

Rewrote the loader as five layers:

1. Split `REQUIRED_COLUMNS` from a new `OPTIONAL_COLUMNS` set. Optional columns default to `0.0`.
2. Expanded the alias table from ~20 to 60+ entries. Covered every Razorpay-dashboard spelling
   I could find in their docs plus common bank statement variants (`Fee`, `Commission`,
   `Gateway Fee`, `Posting Date`, `Reference Number`, `Amount Credited`, etc.).
3. Added a fuzzy header matcher. `SequenceMatcher.ratio() >= 0.72` on anything the alias table
   missed. So `Settlement Ref No` resolves to `settlement_utr` without a hand-coded entry.
4. `_fill_optional_columns()` synthesizes missing money columns as `0.0` so the engine keeps
   running.
5. Extended the best-header-row detection (previously Excel-only) to CSVs so bank statements
   with a title block above the table now parse.

The reconcile trace now surfaces every mapping it made:

```
orders: mapped order_number → order_id, placed_at → timestamp, order_value → gross_amount
settlement: synthesized missing columns mdr_fee, tcs, chargeback_amount (defaulted to 0)
```

Silent inference erodes trust. Visible inference builds it. Every guess the loader makes now
shows up in the trace so the operator can spot-check.

---

# When a judge asks: "tell me about the toughest bug you fixed"

I always lead with the same three, in this order:

1. **Repair Agent cubic explosion.** Proves I built a real agent (per-record branching),
   stress-tested it (found the curve), and fixed it with the right data structure instead of
   the wrong one (throwing more CPU). Real numbers, real profiling, real result.
2. **Loader crashed on real merchant CSVs.** Proves I thought about real users, not just my
   own demo data. The five-layer fix reads as product engineering, not hackathon-hacker.
3. **Resolution chips did nothing.** Proves I audited my own product ruthlessly. Half-wired
   features are a signal I actively hunt for and kill.

Second-tier: the fuzzy O(n²) fix, the verifier signed-magnitude bug. Both good but slightly
too CS-y for a five-minute pitch. Keep them in the back pocket.
