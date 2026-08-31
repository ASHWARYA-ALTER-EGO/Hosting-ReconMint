# FAILURES.md

Running log of real bugs hit while building reconmint. Updated same day something breaks, so wrong guesses stay in the file next to the actual cause.

---

## day 1 (8/23) - scaffold, no bugs yet, just risks noted

- Using integer paise everywhere from the start. Floating-point rupees lose precision under repeated addition, which is exactly what a reconciliation loop does.
- Settlement date vs bank credit date timezone mismatch - naive compare flags late when it's fine. Need to normalize to IST before comparing.

---

## day 5 - eval precision dropped after adding realistic noise

Added rounding noise to the eval, precision dropped from 1.0 to 0.86, five rows flagged that shouldn't have been. Fee tolerance was too tight - GST rounding differs by a couple paise between systems and that was getting called an overcharge.

Fix was a materiality threshold instead of a flat tolerance. Also, precision 1.0 on synthetic data was never a good sign to begin with.

---

## the fuzzy matcher at 10k rows

500 records reconciled in under a second. 2000 took thirteen seconds. 10k took 116. That's quadratic, not slow - real merchants run hundreds of thousands of payments a month, not five hundred.

The matcher was walking every bank row for every unmatched settlement and running string similarity on the reference number of every pair. The amount filter already existed, restricting real candidates to within a rupee - but the code scored all the other rows anyway before throwing them out. Filtered logically, not computationally.

Fix: bucket bank rows by whole-rupee amount into a hash map once, up front. Each settlement scans only its own bucket. 10k dropped from 116s to 14s. Checked the result set was identical before calling it done.

Takeaway: if a filter narrows candidates in your head, make sure it narrows them in the loop.

---

## the repair agent at 30k

10k took 143 seconds. 30k took over ten minutes.

Profiled it - for every unmatched settlement, the repair agent did a pandas row lookup by payment id, nested inside a loop over three strategies. That lookup is O(n) since pandas walks the frame on a non-index column. 10k records x 3 strategies is roughly 900 million pandas cell reads.

Same fix shape as the matcher: build the lookup as a dict once, up front, constant-time access after that. 10k dropped to 48s, 30k to about two minutes.

Pattern to watch: convenience methods inside a loop (pandas `.loc`, `in` on a list, unfiltered string similarity) each hide an O(n) cost per iteration.

---

## day 7 - verifier rejecting correct explanations

Turned on the LLM explainer, ran a batch, checked the audit table. 3 of 6 explanations flagged as hallucinations and swapped for the deterministic fallback. Numbers in the raw output were correct. Every rejected row was a chargeback with a negative net.

Traced it to the regex pulling rupee figures out of the LLM text - it was stripping the minus sign. "-40" parsed as 40, compared against an allowed value of -40, failed.

Loosening the verifier would've defeated the point of having one. Fixed it by comparing magnitudes on both sides instead - a fabricated number still won't match any real magnitude, so rejection strength is unchanged, but sign-flip false rejections stop. Added adversarial tests to lock it in.

Also started logging every rejection. A guardrail that's too strict fails silently since everything falls back to a "working" state - this one could've sat unnoticed for weeks.

---

## polish week (8/28-8/29)

Went through the app looking for things silently broken.

- **Source viewer showed demo data on real runs.** Path was hardcoded to the demo folder regardless of run. Rebuilt so uploads persist per run and the viewer reads from the run-specific directory.
- **Resolution chips looked functional but weren't saving.** Clicked a chip, added a note, got a success toast - only the boolean was actually saved. Reason and note were dropped between frontend and backend, and the table had no columns for them. Fixed schema, API, and UI.
- **Ask agent refused its own suggested questions.** Seed chip questions were getting classified as off-topic since they didn't use expected keywords. Added a keyword-parser fallback that overrides the LLM when it refuses an obviously grounded question.
- **Waterfall chart was empty on real uploads.** Was pulling from the eval pipeline, which needs a ground-truth answer key that only the demo run has. Split it into its own endpoint reading the actual decisions table.
- **Diagnose-tab checklist ticks weren't persisting.** Local state, reset on every drawer close. Added server-side persistence and a "saved" indicator.
- **Loader broke on a real merchant CSV.** Alias table covered ~20 column variants and treated most as required. Real export used different names and was missing a column entirely. Expanded aliases to 60+, made optional columns default to zero, added fuzzy matching for unmapped headers.

---

About a dozen real bugs in this file, none invented. If a story looks interesting, the fix is in the git blame of the commit that follows it.
