"""
ReconMint synthetic data generator.

Emits three CSVs that mirror a real Razorpay merchant's reconciliation inputs, plus a
hidden answer key with the ground-truth category for every record. The matcher never sees
the answer key; the eval harness scores against it.

Files:
  A) orders.csv       - internal order ledger (what the merchant thinks it sold)
  B) settlement.csv   - Razorpay settlement report (gross, MDR, GST, TCS, refunds, net, UTR)
  C) bank.csv         - bank statement (net credits that actually landed)
  answer_key.csv      - ground-truth category per payment_id (NOT given to the matcher)

Razorpay fee model (test-realistic):
  mdr        = 2.00% of gross
  gst_on_mdr = 18% of mdr
  tcs        = 1% of gross (applied to a subset, e.g. marketplace sellers)
  net        = gross - mdr - gst_on_mdr - tcs - refund - chargeback

Injected defects (each labelled in the answer key):
  clean            - net settles cleanly, bank credit matches
  fee_explained    - net != gross purely due to fees (must be reconciled, NOT flagged)
  partial_refund   - a refund reduces net
  chargeback       - a chargeback reduces net
  timing_t2        - bank credit lands 2 days after settlement date (should still match)
  duplicate        - same payment appears twice (only one is real)
  transposed_utr   - bank UTR has two digits swapped (fuzzy match should still catch)
  ghost_bank       - bank credit with no matching settlement (genuinely unresolvable)
  fee_anomaly      - reported net_settled is SHORT of gross-minus-fees (Razorpay overcharge);
                     bank credit matches the (wrong) reported net, so it passes identity matching
                     but must be flagged by fee reconstruction as an exception
  rounding_noise   - LEGIT payment whose reported net differs from our recomputed net by only
                     2-3 paise due to GST rounding convention (half-even vs half-up). NOT an
                     overcharge, but a tight fee tolerance flags it -> a realistic false positive.
"""

import csv
import os
import random
from datetime import datetime, timedelta

RNG = random.Random(42)  # deterministic: same dataset every run -> reproducible evals

MDR_RATE = 0.02
GST_ON_MDR_RATE = 0.18
TCS_RATE = 0.01

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "generated")


def r2(x: float) -> float:
    """Round to 2 decimals (paise). NOTE: rupee floats are intentionally kept here so the
    matcher must deal with real-world float drift — this is where the T+2 / float bugs live."""
    return round(x + 1e-9, 2)


def make_dataset(n: int = 520):
    RNG.seed(42)
    orders, settlements, bank, answers = [], [], [], []

    base_date = datetime(2026, 8, 1, 10, 0, 0)
    pid = 1000

    # weighted defect mix: mostly clean/fee, a realistic tail of exceptions
    plan = (
        ["clean"] * 170
        + ["fee_explained"] * 220
        + ["partial_refund"] * 40
        + ["chargeback"] * 12
        + ["timing_t2"] * 30
        + ["duplicate"] * 6
        + ["transposed_utr"] * 8
        + ["ghost_bank"] * 4
        + ["fee_anomaly"] * 10
        + ["rounding_noise"] * 5
        # NEW: settlements that Razorpay recorded but the bank has not yet credited.
        # These populate the in_flight bucket + Forward Cash Forecast card.
        + ["missing_in_bank"] * 30
    )
    if len(plan) < n:
        plan = plan * (n // len(plan) + 1)   # cycle the weighted template up to n (for benchmarks)
    RNG.shuffle(plan)
    plan = plan[:n]

    for i, category in enumerate(plan):
        pid += 1
        payment_id = f"pay_{pid:07d}"
        order_id = f"order_{pid:07d}"
        ts = base_date + timedelta(minutes=RNG.randint(0, 60 * 24 * 20))
        gross = float(RNG.randint(200, 25000))

        # ghost_bank: a bank credit that has NO order/settlement behind it
        if category == "ghost_bank":
            utr = f"UTR{RNG.randint(10**9, 10**10 - 1)}"
            bank.append({
                "value_date": (ts + timedelta(days=2)).date().isoformat(),
                "utr": utr,
                "credit_amount": r2(gross * 0.8),
                "narration": f"NEFT CR RAZORPAY {utr}",
            })
            answers.append({"payment_id": "", "category": "ghost_bank", "utr": utr})
            continue

        mdr = r2(gross * MDR_RATE)
        gst = r2(mdr * GST_ON_MDR_RATE)
        tcs = r2(gross * TCS_RATE) if RNG.random() < 0.25 else 0.0
        refund = r2(gross * RNG.uniform(0.2, 0.6)) if category == "partial_refund" else 0.0
        chargeback = r2(gross) if category == "chargeback" else 0.0

        net = r2(gross - mdr - gst - tcs - refund - chargeback)

        # fee_anomaly: Razorpay reports a net that is SHORT of the fee-justified amount.
        # The bank later credits this (wrong) reported net, so identity matching passes but
        # fee reconstruction must catch the discrepancy.
        if category == "fee_anomaly":
            overcharge = r2(gross * RNG.uniform(0.004, 0.012))
            net = r2(net - overcharge)

        # rounding_noise: reported net drifts by a couple of paise (GST rounding convention),
        # NOT a real overcharge -> a realistic false positive under a tight fee tolerance.
        if category == "rounding_noise":
            net = r2(net + RNG.choice([0.02, 0.03, -0.02, -0.03]))

        utr = f"UTR{RNG.randint(10**9, 10**10 - 1)}"

        # order ledger row
        orders.append({
            "order_id": order_id,
            "timestamp": ts.isoformat(),
            "gross_amount": r2(gross),
            "customer": f"cust_{RNG.randint(1, 300):04d}",
            "status": "paid",
        })

        # settlement row
        settled_at = ts + timedelta(days=RNG.choice([1, 2]))
        settlements.append({
            "payment_id": payment_id,
            "order_id": order_id,
            "gross_amount": r2(gross),
            "mdr_fee": mdr,
            "gst_on_mdr": gst,
            "tcs": tcs,
            "refund_amount": refund,
            "chargeback_amount": chargeback,
            "net_settled": net,
            "settlement_utr": utr,
            "settled_at": settled_at.date().isoformat(),
        })

        # bank row (unless chargeback fully wipes it out)
        bank_date = settled_at
        bank_utr = utr
        if category == "timing_t2":
            bank_date = settled_at + timedelta(days=2)  # lands late; must still match
        if category == "transposed_utr":
            bank_utr = _transpose_two_digits(utr)

        if net > 0 and category != "missing_in_bank":  # 'missing_in_bank' skips the bank row entirely -> stays in_flight
            bank.append({
                "value_date": bank_date.date().isoformat(),
                "utr": bank_utr,
                "credit_amount": net,
                "narration": f"NEFT CR RAZORPAY {bank_utr}",
            })

        if category == "duplicate":
            # settlement + bank duplicated once; only one is real
            settlements.append(dict(settlements[-1]))
            if net > 0:
                bank.append(dict(bank[-1]))

        answers.append({"payment_id": payment_id, "category": category, "utr": utr})

    RNG.shuffle(bank)  # bank statements arrive out of order
    return orders, settlements, bank, answers


def _transpose_two_digits(utr: str) -> str:
    digits = [c for c in utr if c.isdigit()]
    if len(digits) < 2:
        return utr
    idx = RNG.randint(0, len(utr) - 2)
    chars = list(utr)
    if chars[idx].isdigit() and chars[idx + 1].isdigit():
        chars[idx], chars[idx + 1] = chars[idx + 1], chars[idx]
    return "".join(chars)


def _write(path, rows, fieldnames):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)


def write_dataset(out_dir: str, n: int = 520):
    """Generate n records and write the three CSVs + answer key into out_dir. Returns the answers."""
    os.makedirs(out_dir, exist_ok=True)
    orders, settlements, bank, answers = make_dataset(n)

    _write(os.path.join(out_dir, "orders.csv"), orders,
           ["order_id", "timestamp", "gross_amount", "customer", "status"])
    _write(os.path.join(out_dir, "settlement.csv"), settlements,
           ["payment_id", "order_id", "gross_amount", "mdr_fee", "gst_on_mdr", "tcs",
            "refund_amount", "chargeback_amount", "net_settled", "settlement_utr", "settled_at"])
    _write(os.path.join(out_dir, "bank.csv"), bank,
           ["value_date", "utr", "credit_amount", "narration"])
    _write(os.path.join(out_dir, "answer_key.csv"), answers,
           ["payment_id", "category", "utr"])
    return orders, settlements, bank, answers


def main():
    orders, settlements, bank, answers = write_dataset(OUT_DIR)

    from collections import Counter
    dist = Counter(a["category"] for a in answers)
    print(f"Generated in {OUT_DIR}")
    print(f"  orders:      {len(orders)}")
    print(f"  settlements: {len(settlements)} (incl. duplicates)")
    print(f"  bank rows:   {len(bank)}")
    print(f"  answer key:  {len(answers)}")
    print("  category distribution:")
    for k, v in sorted(dist.items(), key=lambda x: -x[1]):
        print(f"    {k:16s} {v}")


if __name__ == "__main__":
    main()
