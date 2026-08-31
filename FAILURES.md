# FAILURES.md

running log of every real bug that hit me while building reconmint. i update it the same day
something breaks, so the wrong guesses are still in the file next to the actual cause. if
you're wondering whether i actually shipped this thing, this file is the answer.
---

## day 1 (8/23) scaffold day, no bugs yet, just noting known risks

- switching to integer paise everywhere from the start. floating-point rupees will lose
precision under repeated addition, which is exactly what a reconciliation loop does.
- settlement date vs bank credit date timezone mismatch, naive compare says late when it's
actually fine. need to normalize to IST before comparing.
---

## day 5 eval precision dropped after adding realistic noise

added some rounding noise to the eval, precision dropped from 1.0 to 0.86, five rows flagged
that shouldn't have been. my fee tolerance was too tight. gst rounding differs by a couple
paise between systems and that was getting called an overcharge.

fix was a materiality threshold instead of a flat tolerance. also realized precision 1.0 on
my own synthetic data was never a good sign in the first place.
---

## the day my fuzzy matcher fell apart at 10k rows

this one deserves its own section because it's the bug that taught me the most.

first benchmark I ran, 500 records reconciled in under a second. bumped to 2000, thirteen
seconds. bumped to 10k just to see. 116 seconds. 500 → 1s, 2000 → 13s, 10k → 116s. that's
not slow, that's quadratic. real merchants have hundreds of thousands of payments a month,
not five hundred.

opened the matcher. for every unmatched settlement I was walking every bank row, running
string similarity on the reference number of every pair. classic nested loop. the amount
filter was already in the code, restricting real candidates to within a rupee. so the code
knew which rows were candidates. it just chose to score all the other ones anyway on the way
to throwing them out. logically filtered, not computationally filtered.

fix was small. bucket every bank row by whole-rupee amount into a hash map once, up front.
each settlement then only scans its own bucket. 10k dropped from 116 seconds to 14. asserted
the result set was identical so I hadn't traded correctness for speed.

lesson: if a filter is narrowing candidates in your head, make sure it's narrowing them in
the loop. logical shortcuts don't run. data structures do.
---

## the repair agent scaled cubically past 30k

thought I was done with performance after the fuzzy fix. stress-tested repair on a bigger
batch. 10k took 143 seconds. 30k took over ten minutes.

profiled it. for every unmatched settlement, the repair agent was doing a pandas row lookup
by payment id, inside a nested loop over its three strategies. that lookup is O(n) because
pandas walks the frame when you index a non-index column. so 10k records across three
strategies is roughly 900 million pandas cell reads.

fix was the same shape as the fuzzy one: build the lookup as a dict once, up front. every
strategy then does constant-time key access. 10k dropped from 143s to 48. 30k from ten
minutes to about two.

pattern: convenience method inside a loop is a trap. pandas .loc, python `in` on a list,
string similarity on unfiltered candidates. each hides an O(n) cost per iteration.
---

## day 7 verifier was rejecting explanations that were actually correct

turned on the LLM explainer, ran a batch, opened the audit table. three out of six
explanations flagged as hallucinations and swapped for the deterministic fallback. read the
raw LLM output. the numbers were right. every rejected row was a chargeback with a negative
net.

traced it to the regex that pulls rupee figures out of the LLM text. it was stripping the
minus sign. so a correct "-40" was parsed as 40, compared against the allowed value of -40,
and failed. a correct answer looking fabricated because of a sign bug in my extractor.

the fix I didn't want was loosening the verifier, because loosening it defeats the whole
product. the fix that worked was comparing magnitudes on both sides. a fabricated number
still won't match any real magnitude, so rejection strength doesn't change. sign-flip false
rejections stopped. adversarial tests locked it in.

lesson: a guardrail that's too strict fails silently, because everything falls back to a
"working" state and quality drops quietly. if I hadn't opened the audit table for a
different reason I might not have caught it for weeks. every rejection is now logged.
---

# polish week (8/28 to 8/29)

went through the whole thing looking for stuff silently broken. these are the ones worth
keeping in the file.

**uploaded runs showed demo data in the source viewer.** path was hardcoded to the demo
folder no matter what run you were on. uploads got wiped after reconciling, so there was
nothing left to show anyway. rebuilt so uploaded files persist per run and the viewer reads
from the run-specific directory.

**resolution chips looked like they worked but weren't saving anything.** clicked a chip,
added a note, got a success toast. checked the db, only the boolean was saved. reason and
note were both dropped between frontend and backend, and the table didn't have columns for
them. fixed all three layers: schema, api, ui.

**ask agent refused its own suggested questions.** the seed chip questions were being
classified as off-topic by the LLM because they didn't use its expected keywords. added a
keyword-parser fallback that wins if the LLM refuses but the question is obviously grounded.

**waterfall chart was empty on any real upload.** was pulling from the eval pipeline, which
needs a ground-truth answer key, which only the demo run has. split it into its own
endpoint that reads the actual decisions table, so it works for any run.

**diagnose-tab checklist ticks weren't saving.** local state, reset every time you closed
the drawer. added server-side persistence plus a small "saved" indicator so the state is
visible, not implied.

**loader broke on a real merchant csv.** my alias table only covered around 20 column
variants and treated most of them as required. real merchant export used different names
entirely and was missing a whole column. expanded the alias list to 60+, made optional
columns synthesize as zero, and added fuzzy matching for anything unmapped so a slightly
misspelled header still resolves.
---

around a dozen real bugs in the file, all lived-through, none invented. if a story sounds
interesting, open the file in the repo it happened in and the fix is right there in the git
blame.
