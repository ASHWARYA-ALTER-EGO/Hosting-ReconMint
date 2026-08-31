# failures.md
---

## day 1 (8/23) scaffold day no bugs yet just noting known risks

- float rupees are gonna be a problem eventually. switching to integer paise everywhere now
- settlement date vs bank credit date timezone mismatch, naive compare says late when it's
actually fine. need to normalize timezones before comparing
---

## day 5 eval precision dropped after adding realistic noise

Added some rounding noise cases to the eval. precision dropped from 1.0 to 0.86, 5 rows
flagged that shouldn't have been.

Turned out my fee tolerance was too tight, gst rounding differs by a couple paise between
systems and that was getting flagged as an overcharge.

Fix was a materiality threshold instead of a flat tolerance. also realized precision 1.0 on my
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

## day 7 verifier rejecting correct explanations

LLM explainer was getting flagged as hallucinating on chargebacks specifically. numbers were
actually right, the verifier was just comparing signed values and stripping the minus sign
somewhere upstream.

Switched to comparing absolute values instead. fixed it, added a couple tests so it doesn't
come back.
---

# polish week (8/28 to 8/29)

went through the whole thing looking for stuff that's silently broken. found more than I
expected.

## xlsx uploads were 422ing

openpyxl wasn't actually installed in my venv even though it was in requirements.txt. error
message made it look like a data problem when it was a setup problem. fixed the message too
so it says what actually broke.

## uploaded runs were showing demo data in the source viewer

path was hardcoded to the demo folder no matter what run you were on. uploads got wiped after
reconciling so there was nothing left to show anyway. now uploads persist per run.

## resolution chips looked like they worked but weren't saving anything

clicked a chip, added a note, got a success toast. checked the db after, only the boolean was
saved. reason and note were both getting dropped somewhere between frontend and backend, and
the table didn't even have columns for them. fixed all three layers.

## open in source file wasn't jumping anywhere

prop name mismatch between two components, one was sending focusRowId and the other was
listening for focusRow. classic. fixed the naming and it works now.

## ask agent refused its own suggested questions

the seed chip questions were getting classified off topic by the LLM because they didn't use
the exact keywords it expected. added a fallback so the keyword parser wins if it finds a
real match and the LLM refuses.

## waterfall chart was empty on any real upload

it was pulling from the eval pipeline which needs ground truth, which only the demo run has.
split it into its own endpoint that works off the actual decisions table so it works for any
run.

## windows console kept crashing printing the rupee symbol

not really a bug, just a windows encoding thing. added an env var to fix it in my shell.

## ask page had a mic and attach button that did nothing

leftover from a template I reused. judges would click those first. ripped them out, left just
a textarea and send button.

## checklist ticks in the diagnose tab weren't saving

was just local state, reset every time you closed the drawer. added persistence and a little
saved indicator so it's visible.

## vite kept landing on a new port every restart

old processes weren't dying. just kill node before starting now.

## repair agent scaled terribly past 30k rows

profiled it and found it was doing a pandas row lookup inside a loop, basically 900 million
calls at 10k rows. built the lookup as an index once up front instead. dropped 10k from 143s
to 48s.

## railway deploy crashed on the first real request

forgot to add a dependency to requirements.txt. worked locally because I already had it
installed from something else. health check passed fine since it never touched that code
path. added the dependency and wrapped that call so it fails cleanly if it ever happens again.

## cloudflare deploy, every button failed to fetch

frontend was trying to hit itself instead of the actual backend, never set the api base url
at build time. added the env var and a couple fallbacks so it's easier to repoint later.

## loader broke on a real merchant csv

my alias table only covered ~20 column name variants and treated most of them as required.
real export used different names entirely and was missing a whole column. expanded the alias
list, made most columns optional with sane defaults, and added fuzzy matching for anything
still unmapped.
