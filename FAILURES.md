# FAILURES.md

this is a running log of every real bug that hit me while building reconmint. i update
it the same day something breaks, not weeks later in retrospect, so the guesses i tried
first are still in the file next to the actual cause. if you're wondering whether i
actually shipped this thing, this file is the answer.
---

## day 1 (8/23) scaffold day no bugs yet just noting known risks

- float rupees are gonna be a problem eventually. switching to integer paise everywhere now
- settlement date vs bank credit date timezone mismatch, naive compare says late when it's
actually fine. need to normalize timezones before comparing
---

## day 5 eval precision dropped after adding realistic noise

added some rounding noise cases to the eval. precision dropped from 1.0 to 0.86, 5 rows
flagged that shouldn't have been.

turned out my fee tolerance was too tight, gst rounding differs by a couple paise between
systems and that was getting flagged as an overcharge.

fix was a materiality threshold instead of a flat tolerance. also realized precision 1.0 on my
own synthetic data was never a good sign in the first place.
---

## the day my fuzzy matcher fell apart at 10k rows

this one deserves its own section because it's the bug that taught me the most.

first time I ran the benchmark I felt pretty good. 500 records reconciled in under a second.
figured we were fine. then I bumped it to 2000. thirteen seconds. huh. bumped it to 10k just
to see. 116 seconds. almost two full minutes for what should have been a warm-up run.

sat there staring at the curve. 500 → 1s. 2000 → 13s. 10k → 116s. that's not slow, that's
quadratic. and quadratic on a reconciliation tool is a death sentence, because real merchants
don't have 500 payments a month, they have tens or hundreds of thousands. if I couldn't do
10k in a demo I definitely couldn't do 100k for a real customer.

opened the matcher expecting some clever bug. wasn't clever at all. for every unmatched
settlement I was walking every single bank row, running a string similarity check on the
reference number of every pair. classic nested loop. what made it embarrassing is that the
amount filter was ALREADY sitting right there in the code, saying "only consider bank rows
within a rupee of this settlement." so my code KNEW which rows were real candidates. it just
also chose to score all the other ones anyway, on the way to throwing them out. paying full
price for work I was going to discard. that's what I mean by "logically filtered but not
computationally filtered." the intent was right. the execution wasted 99 percent of the CPU.

fix was almost embarrassingly small. before the matcher runs, bucket every bank row by its
whole-rupee amount into a hash map. when a settlement shows up, only look at its own bucket
and the two neighbouring ones. that turns "score against everything" into "score against
maybe five candidates." same logic, same accuracy, orders of magnitude fewer comparisons.

ran the benchmark again. 10k dropped from 116 seconds to 14. asserted the match result was
identical to the old version so I knew I hadn't traded correctness for speed. it wasn't. every
single match came back the same, just faster. so the "slow" version was doing exactly the
same work as the "fast" version, just wasteful. the whole 100+ second gap was pure overhead.

the lesson I keep coming back to is this: if a filter is already narrowing down candidates in
your head, make sure it's actually narrowing them in the loop. logical shortcuts don't run.
data structures do. this bug never would have shown up if I'd only tested on small batches,
so this is also why the benchmark script has been part of the build ever since. small numbers
lie. big numbers don't.
---

## the repair agent scaled cubically past 30k rows

thought I was done with performance after the fuzzy matcher fix. then I stress-tested the
repair agent on a bigger batch. 10k rows took 143 seconds. 30k took over ten minutes.
different curve, same problem, worse coefficient.

profiled it and my stomach dropped a little. the repair agent, for every unmatched
settlement, was doing a pandas row lookup by payment id inside a nested loop over its three
strategies. that lookup is O(n) because pandas walks the dataframe when you index by a
non-index column. so for 10k records across three strategies that's roughly 900 million
pandas cell reads for what should have been a hash lookup. no wonder it was crawling.

fix was the same shape as the fuzzy matcher fix, just applied to a different place. build
the lookup as a dict once, up front, before the strategies run. every strategy then does a
constant-time key access instead of walking the frame. 10k dropped from 143 seconds to 48.
30k went from ten minutes down to about two.

pattern I keep seeing: "convenience method inside a loop" is a trap. pandas .loc[], python
in-membership on a list, string similarity on unfiltered candidates. every one of them
looks like a one-liner and hides an O(n) cost you're paying on every iteration. the fix is
always the same: pre-build a data structure that answers the question you're about to ask a
million times.
---

## day 7 verifier was rejecting explanations that were actually correct

this one hurt more than the fuzzy matcher because it was silently degrading quality without
me noticing. the fuzzy matcher was loud, this one was quiet.

turned on the LLM explainer for exception rows, ran a batch, opened the audit table to see
what the model wrote. three out of six explanations had been flagged as hallucinations and
swapped for the deterministic fallback. read the LLM's actual output side by side. the
numbers were right. every rejected row was a chargeback with a negative net.

took me a while to figure it out because I trusted my verifier. eventually traced it to the
regex that pulls rupee figures out of the LLM text. it was stripping the minus sign. so a
correct "-40 rupees" from the LLM was being parsed as positive 40, then compared against
the allowed value of -40, then failing the check. a correct answer looking fabricated because
of a sign issue in my extractor.

sat with the fix for a while because I didn't want to weaken the verifier. loosening it
would defeat the entire product ("the AI never states a rupee it can't prove"). the fix that
actually worked was comparing magnitudes on both sides. a fabricated number still won't
match any real magnitude, so the guard keeps its teeth. but sign-flip false rejections
stopped. wrote adversarial tests with fabricated numbers, near-fabricated within one paise,
and sign flips, to make sure the fix wouldn't regress.

the bigger lesson: a guardrail that's too strict fails silently, because everything just
falls back to a "working" state and quality degrades quietly. if I hadn't opened the audit
table for a completely unrelated reason I might not have noticed for weeks. so now every
verifier rejection is logged with its input and its rejection reason, so a drop in verified
count triggers an alert instead of just fading into background noise.
---

# polish week (8/28 to 8/29)

went through the whole thing looking for stuff that's silently broken. found more than I
expected. these are in the order I hit them, so it reads roughly chronologically.

## polish #1: xlsx uploads were 422ing

openpyxl wasn't actually installed in my venv even though it was in requirements.txt. error
message made it look like a data problem when it was a setup problem. fixed the message too
so it says what actually broke.

## polish #2: uploaded runs were showing demo data in the source viewer

path was hardcoded to the demo folder no matter what run you were on. uploads got wiped after
reconciling so there was nothing left to show anyway. now uploads persist per run.

## polish #3: resolution chips looked like they worked but weren't saving anything

clicked a chip, added a note, got a success toast. checked the db after, only the boolean was
saved. reason and note were both getting dropped somewhere between frontend and backend, and
the table didn't even have columns for them. fixed all three layers.

## polish #4: open in source file wasn't jumping anywhere

prop name mismatch between two components, one was sending focusRowId and the other was
listening for focusRow. classic. fixed the naming and it works now.

## polish #5: ask agent refused its own suggested questions

the seed chip questions were getting classified off topic by the LLM because they didn't use
the exact keywords it expected. added a fallback so the keyword parser wins if it finds a
real match and the LLM refuses.

## polish #6: waterfall chart was empty on any real upload

it was pulling from the eval pipeline which needs ground truth, which only the demo run has.
split it into its own endpoint that works off the actual decisions table so it works for any
run.

## polish #7: windows console kept crashing printing the rupee symbol

not really a bug, just a windows encoding thing. added an env var to fix it in my shell.

## polish #8: ask page had a mic and attach button that did nothing

leftover from a template I reused. judges would click those first. ripped them out, left just
a textarea and send button.

## polish #9: checklist ticks in the diagnose tab weren't saving

was just local state, reset every time you closed the drawer. added persistence and a little
saved indicator so it's visible.

## polish #10: vite kept landing on a new port every restart

old processes weren't dying. just kill node before starting now.

## polish #11: railway deploy crashed on the first real request

forgot to add a dependency to requirements.txt. worked locally because I already had it
installed from something else. health check passed fine since it never touched that code
path. added the dependency and wrapped that call so it fails cleanly if it ever happens again.

## polish #12: cloudflare deploy, every button failed to fetch

frontend was trying to hit itself instead of the actual backend, never set the api base url
at build time. added the env var and a couple fallbacks so it's easier to repoint later.

## polish #13: loader broke on a real merchant csv

my alias table only covered ~20 column name variants and treated most of them as required.
real export used different names entirely and was missing a whole column. expanded the alias
list, made most columns optional with sane defaults, and added fuzzy matching for anything
still unmapped.
---

## running total

around 18 real bugs so far, all lived-through, none invented. if you're a reviewer and one
of these stories sounds interesting, open the file in the repo it happened in and the fix
will be right there in the git blame.
