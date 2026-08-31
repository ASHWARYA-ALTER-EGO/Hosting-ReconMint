# FAILURES.md

running log of every real bug that hit me while building reconmint. i update it the same day
something breaks, so the wrong guesses are still in the file next to the actual cause. if
you're wondering whether i actually shipped this thing, this file is the answer.
---

## day 1 (8/23) scaffold day, no bugs yet, just noting known risks

- float rupees will bite eventually. switching to integer paise everywhere now.
- settlement date vs bank credit date timezone mismatch, naive compare says late when it's
actually fine. need to normalize to IST before comparing.
---

## day 5 eval precision dropped after adding realistic noise

added some rounding noise to the eval, precision dropped from 1.0 to 0.86, five rows flagged
that shouldn't have been. my fee tolerance was too tight, gst rounding differs by a couple
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

opened the matcher expecting some clever bug. wasn't clever at all. for every unmatched
settlement I was walking every bank row, running string similarity on the reference number
of every pair. classic nested loop. what made it embarrassing is that the amount filter was
already right there in the code, restricting real candidates to within a rupee. so the code
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

pattern: "convenience method inside a loop" is a trap. pandas .loc, python `in` on a list,
string similarity on unfiltered candidates. each hides an O(n) cost per iteration.
---

## day 7 verifier was rejecting explanations that were actually correct

hurt more than the fuzzy matcher because it was silently degrading quality. the fuzzy
matcher was loud, this one was quiet.

turned on the LLM explainer, ran a batch, opened the audit table. three out of six
explanations flagged as hallucinations and swapped for the deterministic fallback. read the
raw LLM output, the numbers were right. every rejected row was a chargeback with a negative
net.

traced it to the regex that pulls rupee figures out of the LLM text. it was stripping the
minus sign. so a correct "-40" was parsed as 40, compared against the allowed value of -40,
and failed. a correct answer looking fabricated because of a sign bug in my extractor.

sat with the fix for a while because I didn't want to weaken the verifier. loosening it
defeats the whole product. fix that worked was comparing magnitudes on both sides. a
fabricated number still won't match any real magnitude, so the guard keeps its teeth.
adversarial tests locked it in.

bigger lesson: a guardrail that's too strict fails silently, because everything falls back
to a "working" state and quality drops quietly. if I hadn't opened the audit table for a
different reason I might not have caught it for weeks. every rejection is now logged.
---

# polish week (8/28 to 8/29)

went through the whole thing looking for stuff silently broken. found more than expected.
in the order I hit them.

**#1 xlsx uploads were 422ing.** openpyxl wasn't installed in my venv even though it was in
requirements.txt. error message blamed the data. fixed the message too.

**#2 uploaded runs showed demo data in the source viewer.** path was hardcoded to the demo
folder. uploads got wiped after reconciling anyway. now uploads persist per run.

**#3 resolution chips looked like they worked but weren't saving anything.** only the
boolean was saved, reason and note got dropped between frontend and backend, and the table
didn't have columns for them. fixed all three layers.

**#4 open-in-source-file wasn't jumping.** prop name mismatch, one side sent focusRowId,
the other listened for focusRow. classic.

**#5 ask agent refused its own suggested questions.** LLM classified seed chips as off-topic
because they didn't have its keywords. added a keyword-parser fallback so it wins if the LLM
refuses.

**#6 waterfall chart was empty on any real upload.** was pulling from the eval pipeline
which needs ground truth. split into its own endpoint that reads the decisions table.

**#7 windows console crashed printing the rupee symbol.** encoding thing. env var fix.

**#8 ask page had a mic and attach button that did nothing.** template leftover, judges
would click those first. ripped out.

**#9 diagnose-tab checklist ticks weren't saving.** local state, reset on drawer close.
added persistence + a saved indicator.

**#10 vite kept landing on a new port every restart.** old processes weren't dying. kill
node before starting.

**#11 railway deploy crashed on first real request.** missing dependency, worked locally
because I had it from something else. health check passed since it never touched that path.

**#12 cloudflare deploy, every button failed to fetch.** frontend was calling itself
instead of the backend. VITE_API_BASE_URL wasn't set at build time.

**#13 loader broke on a real merchant csv.** alias table only covered 20 column variants
and treated most as required. expanded aliases, made optional columns synthesize as zero,
added fuzzy matching for unmapped.
---

around 18 real bugs, all lived-through, none invented. if a story sounds interesting, open
the file in the repo it happened in and the fix is right there in the git blame.
