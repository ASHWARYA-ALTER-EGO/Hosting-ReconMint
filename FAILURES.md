# FAILURES.md — the "what broke at 2 AM" log

> First-class artifact. Every real bug gets logged the day it happens: symptom, root cause,
> diagnosis, fix. On the final day we pick the strongest story for the application form.
> Do NOT invent bugs later. Log them live.

Format per entry:

### [DATE] Short title
- **Symptom:** what I observed
- **Root cause:** the actual reason
- **Diagnosis:** how I found it
- **Fix:** what I changed
- **Lesson:** the one-line takeaway

---

### 2026-08-23 Backend audit - fuzzy matcher was O(n^2)
- **Symptom:** A benchmark at 2k/10k records exposed brutal scaling: 500 rec = 0.7s but 2k = 13s
  and 10k = 116s. Fine for the demo, embarrassing if a judge stress-tests it.
- **Root cause:** The fuzzy pass scored EVERY available bank row against EVERY unmatched settlement,
  running an O(1)-looking but expensive string-similarity on each pair - O(unmatched x bank).
- **Diagnosis:** The benchmark's per-size timing made the superlinear curve obvious; the amount gate
  already restricted real candidates to +/- Rs.1, so almost all of that scoring was wasted work.
- **Fix:** Bucket available bank rows by whole-rupee key and only score the settlement's own bucket
  plus the two neighbours. Fuzzy became ~O(unmatched). 10k dropped 116s -> 14s (8x), 2k 13s -> 1.7s,
  with identical match results.
- **Lesson:** Build a benchmark early. A gate that filters candidates logically should also filter
  them computationally - don't pay to score rows you've already ruled out.

### 2026-08-23 Day 7 - hallucination verifier rejected CORRECT explanations
- **Symptom:** With the LLM explainer live, half the explanations (3/6) were rejected as
  hallucinations and replaced with the deterministic fallback - even though the LLM's numbers were
  right. The rejected ones were all chargeback rows with a negative net.
- **Root cause:** The verifier extracted rupee figures with a regex that dropped the minus sign,
  so the model's correct "Rs.-39.91" was parsed as 39.91 and compared against the allowed value
  -39.91. Signed comparison failed, so a correct figure looked fabricated.
- **Diagnosis:** Printed each rejected row's allowed-set, extracted numbers, and offending list.
  The offending value was always the positive magnitude of a negative allowed value - a formatting
  mismatch, not a fabrication.
- **Fix:** Compare MAGNITUDES (absolute values) on both sides, and add the fee subtotal
  (mdr+gst+tcs) to the allowed set. A fabricated number still matches no real magnitude, so the
  guard keeps its teeth; verified rate went 3/6 -> 12/12 with zero true hallucinations slipping
  through (proven by tests/test_verifier.py).
- **Lesson:** A guardrail that is too strict fails silently by degrading quality (everything falls
  back), which is easy to miss. Instrument the rejections, don't just count them.

### 2026-08-23 Day 5 - precision collapsed on realistic rounding data
- **Symptom:** After adding realistic `rounding_noise` records to the eval set (legit payments
  whose reported net differs from our recomputed net by 2-3 paise), exception-detection precision
  dropped from 1.0 to 0.86. The harness flagged 5 perfectly-good payments as `fee_anomaly`.
- **Root cause:** Our fee tolerance is 1 paise (`FEE_TOLERANCE_PAISE = 1`). GST on MDR can be
  rounded half-even vs half-up depending on the system, so a legitimate settlement can differ from
  our reconstruction by 2-3 paise with no actual overcharge. A tolerance that tight cannot tell a
  sub-paise rounding artifact from a real (but small) overcharge.
- **Diagnosis:** The error-analysis list in the eval output named all 5 false positives and they
  were 100% `rounding_noise` truth -> `fee_anomaly` predicted. Recall stayed 1.0, so we were
  over-flagging, not under-catching.
- **Fix (candidate):** Introduce a **materiality threshold** - only flag a fee gap as an anomaly
  when it exceeds max(a few paise, a small % of gross). This lifts precision without sacrificing
  recall on the real overcharges (which are 0.4-1.2% of gross, far above the threshold). Tradeoff
  is explicit and defensible: we choose the operating point, and we document the false-positive
  cost rather than hiding it.
- **Lesson:** A perfect score on self-made data is a smell. Realistic ambiguity is what exposes the
  actual engineering decision - here, the materiality threshold and the precision/recall tradeoff.

### 2026-08-23 Day 1 — project start
- **Symptom:** n/a (scaffold day)
- **Note:** Watch for the two predicted bugs as the matcher comes online:
  1. Floating-point rupee drift (₹0.01 mismatches cascading through fee math, breaking valid matches).
  2. T+2 timezone date-bucketing (settlement dated Mon, bank credit Wed) making good matches look unmatched.
  Log them here the moment they appear.

---

## Production integration + polish week (2026-08-28 → 2026-08-29)

The problem statement audit surfaced ~20 concrete issues; the ones below either broke
the demo silently, wasted the most debugging time, or would have cost points in front
of a judge. Kept in reverse-chronological order — most recent first.

### 2026-08-29 Railway deploy — reconcile 500'd with `ModuleNotFoundError: 'requests'`
- **Symptom:** After deploying the backend to Railway, every `POST /reconcile` returned
  500. Locally everything worked. Railway logs showed
  `ModuleNotFoundError: No module named 'requests'` originating in
  `backend/agent/razorpay_client.py:41`.
- **Root cause:** `requests` was imported by the new Razorpay client module I added in
  the polish week, but never added to `requirements.txt`. Local dev already had `requests`
  from other tooling, so `pip install -r requirements.txt` in a clean Railway container
  succeeded WITHOUT it, and the import only fires at reconcile time — so `/health`
  passed and `/reconcile` blew up.
- **Diagnosis:** Reading the raw Railway log traceback. Ran `pip freeze | grep requests`
  in a fresh venv locally to reproduce.
- **Fix:** Two-layer:
  1. Added `requests==2.32.3` to `requirements.txt`.
  2. Guarded the import in `razorpay_client.py` — missing package returns a clean
     `ProbeResult(ok=False, reason="dependency_missing")` instead of crashing.
  3. Wrapped the orchestrator's handshake call in a broad `try/except` so no future
     Razorpay failure can ever stop a reconcile.
- **Lesson:** `/health` is only a smoke test for imports it actually touches. Any code
  path that fires on the main request path needs to be exercised at CI (or at least
  once in a clean venv) BEFORE deploy. Made a mental note to add a startup import-check
  for every module in `backend/agent/`.

### 2026-08-29 Railway frontend — "Failed to fetch" on every API call
- **Symptom:** The deployed Cloudflare Pages frontend showed the landing page fine,
  but every button ("Run demo", any file upload) failed with a bare "Failed to fetch"
  toast. Browser console showed 404s on `https://reconmint.pages.dev/reconcile/demo`.
- **Root cause:** `resolveApiBase()` had a production fallback of `""` (same-origin),
  intended to work behind a reverse proxy. Cloudflare Pages doesn't proxy `/reconcile`
  to the Railway backend, so every request hit the static host and 404'd. The frontend
  build didn't have `VITE_API_BASE_URL` set, so no override kicked in.
- **Diagnosis:** DevTools Network tab immediately showed the wrong origin. The
  `resolveApiBase()` fallback chain existed, it just had no signal to point elsewhere.
- **Fix:** Three layers:
  1. Documented that `VITE_API_BASE_URL=https://<backend>.up.railway.app` must be set
     on the frontend service at BUILD time, and `RECONMINT_CORS_ORIGINS=<frontend origin>`
     on the backend at RUNTIME.
  2. Added two more fallback slots to `resolveApiBase()`: a `window.__RECONMINT_API_BASE__`
     runtime override + a `localStorage['reconmint_api_base']` per-browser override — so
     a judge with a live deploy can point it at a different backend without rebuilding.
  3. Rewrote the fetch error path so a network failure now throws a message that names
     the URL that was tried, the two env vars to check, and the underlying error —
     instead of the raw browser "Failed to fetch" which told the user nothing.
- **Lesson:** A "same-origin" prod fallback is a landmine on split-host deploys. Ship
  fallback chains with visible errors that name the exact env var to set, not silent
  ones that leave the user guessing.

### 2026-08-29 Loader crashed on real merchant CSVs ("missing required column X")
- **Symptom:** The Ask agent, Cash Position, everything worked on the synthetic demo,
  then broke the moment a user uploaded their own file. The 422 detail:
  `"settlement is missing required column 'mdr_fee'"`. The user's Razorpay export had
  a column called "Fee" instead. Same story for TCS (they had no TCS column at all).
- **Root cause:** `REQUIRED_COLUMNS` treated 11 settlement columns as mandatory,
  including `mdr_fee`, `gst_on_mdr`, `tcs`, `refund_amount`, `chargeback_amount`.
  Real merchant exports don't always ship those. The alias table only had ~20 entries
  and missed common variants like `fee`, `commission`, `gateway_fee`.
- **Diagnosis:** Reproduced by hand-crafting a CSV with the actual column names from
  the Razorpay dashboard export docs; each 422 named exactly which alias was missing.
- **Fix:** Five-layer rewrite of the loader:
  1. Split `REQUIRED_COLUMNS` from a new `OPTIONAL_COLUMNS` set.
  2. Expanded the alias table from ~20 to 60+ entries covering Razorpay-dashboard
     spellings, common bank statement variants, and generic accounting names.
  3. Added a fuzzy header matcher (`SequenceMatcher.ratio()` >= 0.72) for anything
     the alias table misses — so `Settlement Ref No` resolves to `settlement_utr`
     without a hand-coded entry.
  4. `_fill_optional_columns()` synthesizes missing money columns as `0.0` so the
     engine can keep running.
  5. Extended the best-header-row detection (previously Excel-only) to CSVs so bank
     statements with title blocks above the table now parse.
  Trace now surfaces every detected mapping (e.g.
  `"orders: mapped order_number → order_id, placed_at → timestamp, order_value → gross_amount"`)
  so the operator can verify the guesses.
- **Lesson:** "It works on our demo data" is a smell. If the schema comes from users,
  the loader needs both breadth (aliases) and depth (fuzzy) — and it needs to TELL
  the user what it guessed. Silent inference erodes trust; visible inference builds it.

### 2026-08-29 Repair Agent quadratic explosion at 30k+ rows
- **Symptom:** Started the stress benchmark on 10k / 50k rows to prove throughput.
  1k: 16.9s (176 rec/s), 10k: 143s (208 rec/s) — much worse than pandas-alone. 50k
  never finished, process hung using 240MB.
- **Root cause:** The new Repair Agent added earlier that week did per-record
  branching (3 strategies × N unmatched settlements). Every strategy iterated the full
  `available_bank` set linearly (`for bidx in available_idx: bank.loc[bidx]`), making
  the pass O(unmatched × bank_size × strategies) — perfectly cubic on this workload.
  On 10k rows with ~3k unmatched to repair × 3 strategies × ~10k bank rows, that's
  ~900M pandas `.loc[]` calls, each a slow individual row lookup.
- **Diagnosis:** Timing per size showed the superlinear curve. Profiled the per-strategy
  functions and 95% of the wall clock was `bank.loc[bidx]` in tight loops.
- **Fix:** Pre-built indexes once outside the loop:
  1. `amount_index: {credit_paise -> [bank_idx, ...]}` (buckets available bank rows by
     paise, so strategies scan only exact matches or ±1 bucket).
  2. `norm_utr_index: {(credit_paise, normalized_utr) -> bank_idx}` (turns strategy 2
     from O(available) into O(1)).
  Passed as `indexes=` kwarg into `repair_settlement()`; each strategy uses them when
  present, falls back to linear scan for small batches. Post-fix: 30k rows 143s → 48s,
  50k×3 rows 217s (687 rec/s peak, 160 MB peak).
- **Lesson:** A "cheap" pandas `.loc[idx]` is 10-100µs — fine once, catastrophic in a
  tight loop. Any per-record retry logic against a big pool needs an index built ONCE
  at the top of the loop, not walked N times.

### 2026-08-28 Every uploaded run showed demo source files in the viewer
- **Symptom:** User uploaded their own three files, Dashboard reconciled numbers
  correctly, but the Source Files viewer showed the SYNTHETIC demo CSVs. Judge would
  reasonably conclude the app faked the whole thing on demo data.
- **Root cause:** `GET /data/source/{name}` served `DEFAULT_DATA_DIR/{name}.csv`
  regardless of run. Uploaded files were streamed to a tempdir, reconciled, then the
  tempdir was `rmtree`'d. Nothing survived per-run for the viewer to fetch.
- **Diagnosis:** Trivial — checked the endpoint, saw the hard-coded path.
- **Fix:**
  1. New `data/runs/<run_id>/` directory. `_save_uploads_and_reconcile` now copies the
     uploaded files there after reconcile succeeds.
  2. New `GET /runs/{run_id}/source/{name}` endpoint that serves them per-run and
     falls back to the demo dir only for demo runs.
  3. Frontend `SourceFilesCard` accepts a `runId` prop and uses `runSourceFileUrl(runId, name)`.
- **Lesson:** "Which run am I looking at" is a first-class concern for any dashboard
  card that shows data. Passing `runId` everywhere from day 1 would have caught this.

### 2026-08-28 Resolution reason chips did nothing
- **Symptom:** Exceptions drawer had four resolution chips (Confirmed match / Manual
  override / False positive / Escalated to finance) and a note field. Clicking them
  and hitting Resolve appeared to work — toast said "Resolved". But re-opening the
  audit CSV export, none of the reason or note data was there.
- **Root cause:** Three broken layers stacked:
  1. Frontend called `api.resolveDecision(item.decisionId)` — passed the ID only,
     dropped reason and note on the floor.
  2. Backend `POST /decisions/{id}/resolve` didn't accept a body — the reason had
     nowhere to arrive.
  3. `decisions` table had no columns for `resolution_reason`, `resolution_note`,
     `resolved_at`.
- **Diagnosis:** Ran `sqlite3 data/audit.db "SELECT * FROM decisions WHERE resolved=1
  LIMIT 3"` after clicking around — every row had `resolved=1` but everything else empty.
- **Fix:** End-to-end rewiring:
  1. Three new columns via idempotent migration in `_EXPECTED_DECISION_COLS`.
  2. `AuditLog.resolve(id, reason, note)` persists all three; also added
     `unresolve()` and `resolution_summary()`.
  3. `POST /decisions/{id}/resolve` accepts `{reason, note}` JSON, validates reason,
     caps note at 500 chars.
  4. `api.resolveDecision(id, {reason, note})` passes the payload.
  5. `resolve()` in ExceptionsPage forwards `resolutionReason` + `resolutionNote`.
  6. Toast now names which bucket it went to (*"pay_XXX → Escalated to finance ·
     logged to audit trail"*).
- **Lesson:** Every UI affordance either has a wire behind it or it doesn't ship.
  Half-wired features are worse than absent features — they train the user to
  distrust the system.

### 2026-08-28 "Open in source file" jumped to the wrong row (or nowhere)
- **Symptom:** Exceptions page's "Open in source file" opened the viewer panel but
  scrolled to nothing. The whole point of the feature — jump to the exact row that
  produced this exception — didn't work.
- **Root cause:** Prop-shape mismatch through three layers.
  `ExceptionsPage` set `sourceFocus = {id: item.id, column, token}` where `id` was
  the payment_id string.
  `SourceFilesCard` forwarded it as `focusRowId={sourceFocus?.id}`.
  `ExcelViewerCard` accepted `focusRow` (numeric 1-based row index), not `focusRowId`.
  So the useEffect that scrolled + highlighted never fired.
- **Diagnosis:** Console-logged the props at each layer and saw the string arrive at
  `focusRow` where a number was expected.
- **Fix:** Added `focusRowId` prop to `ExcelViewerCard`. When present, it searches the
  loaded grid's column 0 (and any column) for a case-insensitive match on the ID,
  computes the row index, then runs the existing scroll+pulse logic. Also changed the
  highlight color from emerald green to ledger-rust `#B5432F` with an infinite pulse
  so the target cell is obvious.
- **Lesson:** Props that pass through 3+ components need a type contract. When
  `focusRowId` and `focusRow` both exist, TypeScript would have caught this at compile.

### 2026-08-28 Ask agent refused two of its own seed questions
- **Symptom:** The Ask page's example chips include "How many exceptions need review?"
  and "How do I fix pay_XXX?". Both refused with the off-topic banner:
  *"I only answer questions about this reconciliation run..."* — despite being
  literally the questions the agent suggests.
- **Root cause:** `parse_intent()` calls the LLM to route the question to a metric.
  The system prompt is strict; the LLM classified "How many exceptions need review?"
  as `off_topic` because it doesn't literally say "fee" or "settlement". The keyword
  parser correctly matched "exception" → `exceptions_summary` but ran only as fallback
  when the LLM errored, not when the LLM returned `off_topic`.
- **Diagnosis:** Added prints to `parse_intent` showing the LLM verdict; watched the
  LLM say `off_topic` for both seed questions.
- **Fix:** Two changes to `parse_intent`:
  1. If the LLM returns `off_topic` but the keyword parser finds a concrete metric,
     trust the keyword parser.
  2. If the LLM says `explain_payment` on a pay_ id but the phrasing contains
     "fix/resolve/handle/escalate", upgrade to the new `resolve_payment` metric so
     the agent returns a structured plan.
- **Lesson:** LLM-as-router is fine when the LLM is right, but the fallback has to
  cover *both* the "model errored" and the "model gave a defensible but wrong answer"
  cases. Deterministic keyword parsing is the safety net — never the loser in a tie.

### 2026-08-28 xlsx uploads silently 422'd — `openpyxl` not installed
- **Symptom:** Every xlsx upload returned 422 with
  `"orders could not be read (ImportError). Export the first sheet as CSV..."`.
  User's actual test data was uploaded → nothing worked → confidence collapsed. User
  thought their files were broken.
- **Root cause:** `openpyxl` was in `requirements.txt` but the local venv had never
  been reinstalled since the package was added. The error message the loader raised
  was accurate ("ImportError") but blamed the user's file.
- **Diagnosis:** Ran `python -c "import openpyxl"` → `ModuleNotFoundError`.
- **Fix:** `pip install openpyxl xlrd`, restart the backend. Then wrote a note in
  the deploy docs that every clean-checkout dev needs `pip install -r requirements.txt`,
  and updated the loader's error message to name the missing package explicitly if
  the underlying exception is `ImportError`.
- **Lesson:** An error message that names the LIKELY user cause (bad file) but not
  the ACTUAL system cause (missing library) sends the operator down the wrong path
  for hours. Always print the real exception.

### 2026-08-28 Waterfall chart empty on every uploaded run
- **Symptom:** Dashboard's Record Reconciliation Waterfall rendered beautifully on
  demo runs, but on every uploaded run it showed the fallback message
  *"Full breakdown & accuracy are shown for demo runs (which have ground truth)."*.
  Judges upload their own data → waterfall is empty → looks like a demo-only feature.
- **Root cause:** Waterfall consumed `evalData.breakdown` which was computed by the
  `run_eval()` harness — which needs the ground-truth answer key that only the demo
  dataset has.
- **Diagnosis:** Read AppShell.jsx, saw `evalData` only fetched when `isDemo=true`.
- **Fix:** New `GET /runs/{id}/breakdown` endpoint that computes the mutually-exclusive
  buckets (auto_matched / fuzzy_matched / fee_anomaly / unresolved / duplicates /
  ghost_credits) directly from the persisted `decisions` table — works for ANY run,
  uploaded or demo, since no ground truth is required. AppShell now fetches this for
  every run and attaches it as `evalData.breakdown` (Accuracy card stays demo-only
  because precision/recall genuinely can't be computed without an answer key). Also
  wrote the Batch Quality Signals card that publishes six A/B/C/D proxy grades for
  uploads, so uploads still have a "how trustworthy" answer without pretending to
  have F1.
- **Lesson:** Any chart that reads from an eval-only source will silently disappear
  on real data. Every visualization needs a source that survives without ground truth.

### 2026-08-28 Windows console cp1252 crashed every ₹ print
- **Symptom:** Every debug `curl | python | ₹...` pipe crashed with
  `UnicodeEncodeError: 'charmap' codec can't encode character '₹'`. Test scripts
  looked broken; actual responses were fine.
- **Root cause:** Default Windows console codepage is cp1252; ₹ (U+20B9) is not in it.
  Python defaulted stdout encoding to the console encoding.
- **Diagnosis:** The traceback pointed at `encodings/cp1252.py` — obvious once seen.
- **Fix:** `export PYTHONIOENCODING=utf-8` prefixed on every test invocation.
  Backend already had `sys.stdout.reconfigure(encoding="utf-8")` from an earlier
  session so serving unicode was never affected; the pain was only in test/curl.
- **Lesson:** On Windows, script harnesses need PYTHONIOENCODING=utf-8 to print any
  non-ASCII. Bake it into the Makefile.

### 2026-08-28 Voice mic + mode toggles + attachment button on Ask — all dead
- **Symptom:** The Ask page's prompt box had a paperclip (attach image), a voice
  record mic, and three mode toggles (Search / Think / Canvas). Clicking any of them
  did nothing useful. Judges would click at least one — they always do.
- **Root cause:** They came in from a UI component pasted from another project. The
  wiring for those affordances was never done. Only the send button and the textarea
  actually worked.
- **Diagnosis:** Clicked each one, watched nothing happen.
- **Fix:** Stripped the PromptInputBox to a textarea, a send button, and one
  transparency chip ("This run only · figures verified before sent"). Deleted the
  `VoiceRecorder` component, `ModeBtn` component, 6 unused icons, and the pulse/pulse-dot
  keyframes. Same brand palette, nothing that pretends to work but doesn't.
- **Lesson:** UI honesty. Every button either wires to a real action, or it doesn't
  ship — no exceptions. Half-wired affordances are the #1 signal to a judge that a
  submission is a template dressed up as a product.

### 2026-08-28 Diagnose checklist state was ephemeral — every drawer reopen reset ticks
- **Symptom:** In the Exceptions drawer's Diagnose tab, the operator ticks two
  checklist items. Close the drawer, reopen the same exception. Ticks are gone.
- **Root cause:** `useState({})` — no persistence, no server round-trip, no
  localStorage even.
- **Diagnosis:** Reviewed the drawer state, saw it was purely client-side.
- **Fix:** New `checklist_state_json` column on `decisions` via idempotent migration,
  new `POST /decisions/{id}/checklist` endpoint, drawer hydrates from
  `item.checklist_state` on open and auto-saves on every toggle (debounced 400ms so
  a burst of clicks is one round-trip). Added a "Persisted" / "Saving…" chip on the
  checklist header so state is visible, not implied.
- **Lesson:** Anything a user actively touches must persist somewhere. Judges will
  click checkboxes and then look for confirmation the click landed — the chip is as
  important as the write.

### 2026-08-28 Vite kept spawning on ports 5173, 5174, 5175 forever
- **Symptom:** Every `npm run dev` restart landed on the next port up. By day 2 we
  were on 5177. Browser tabs from earlier sessions pointed at wrong ports.
- **Root cause:** Prior Vite processes were left running. Vite auto-picks next port
  when the previous is bound.
- **Diagnosis:** `tasklist | findstr node.exe` showed 4 lingering node processes.
- **Fix:** Kill all Python + node before restart cycles. Later added a small script
  that `taskkill /F /IM node.exe` before starting.
- **Lesson:** Dev-server churn during hackathon sprints is real. Bake the kill into
  the run script from day 1.

---

### Presentation picks (top 3 stories)

If asked "tell me about the toughest bug you fixed", lead with these — each is
technical enough to prove depth, honest enough to prove judgment, and short enough
to fit in a 90-second answer:

1. **Repair Agent quadratic explosion at scale** — proves you built a real agent
   (per-record branching), stress-tested it (found the cubic curve), and fixed it
   with the right data structure (pre-built indexes) instead of the wrong one
   (throwing more CPU).
2. **Loader crashed on real merchant CSVs** — proves you thought about real users,
   not just demo data. The five-layer fix (aliases + fuzzy + optional + CSV header
   detection + visible trace) reads as a product-minded engineer, not a hacker
   optimizing for the demo dataset.
3. **Resolution chips did nothing** (or, similar: mic did nothing) — proves you
   audited your own product ruthlessly and killed vaporware affordances. Judges
   remember the fixes; nobody remembers the polish.
