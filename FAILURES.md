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
