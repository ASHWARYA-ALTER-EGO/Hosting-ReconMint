"""
ReconMint fee reconstruction (Day 3).

Independently recomputes what each settlement's net *should* be from its fee components and
verifies it against the net Razorpay actually reported. This is the layer that answers the real
reconciliation question: not just "did money land?" but "did the CORRECT amount land?".

  expected_net = gross - mdr - gst_on_mdr - tcs - refund - chargeback

Two outputs per row:
  - `fee_valid`      : reported net matches the independently recomputed net (within tolerance)
  - `deduction_paise`: gross - net, i.e. how much the fees/refunds/chargebacks ate

All arithmetic is in integer paise (drift-free). A row whose net does NOT reconcile is a
`fee_anomaly` exception (e.g. an overcharge) even if its bank credit matched during identity
matching, because the money that landed was the wrong amount.
"""

from __future__ import annotations

import pandas as pd

from backend.config import FEE_TOLERANCE_PAISE  # noqa: F401  (re-exported for callers/tests)


def _rupees_to_paise(series: pd.Series) -> pd.Series:
    return (pd.to_numeric(series, errors="coerce").fillna(0.0) * 100).round().astype("int64")


def reconstruct_fees(settlement: pd.DataFrame) -> pd.DataFrame:
    """Annotate a settlement DataFrame with fee-reconstruction columns.

    Returns a copy with added columns:
      gross_paise, mdr_paise, gst_paise, tcs_paise, refund_paise, chargeback_paise,
      expected_net_paise, reported_net_paise, net_gap_paise, fee_valid, deduction_paise
    """
    df = settlement.copy()

    gross = _rupees_to_paise(df["gross_amount"])
    mdr = _rupees_to_paise(df["mdr_fee"])
    gst = _rupees_to_paise(df["gst_on_mdr"])
    tcs = _rupees_to_paise(df["tcs"])
    refund = _rupees_to_paise(df["refund_amount"])
    chargeback = _rupees_to_paise(df["chargeback_amount"])
    reported_net = _rupees_to_paise(df["net_settled"])

    expected_net = gross - mdr - gst - tcs - refund - chargeback

    df["gross_paise"] = gross
    df["mdr_paise"] = mdr
    df["gst_paise"] = gst
    df["tcs_paise"] = tcs
    df["refund_paise"] = refund
    df["chargeback_paise"] = chargeback
    df["expected_net_paise"] = expected_net
    df["reported_net_paise"] = reported_net
    df["net_gap_paise"] = reported_net - expected_net
    df["fee_valid"] = df["net_gap_paise"].abs() <= FEE_TOLERANCE_PAISE
    df["deduction_paise"] = gross - reported_net

    return df


def fee_explanation(row: pd.Series) -> str:
    """Deterministic, human-readable breakdown of a row's fee math (in rupees).

    Used as the fallback explanation and as ground-truth for the LLM verifier (Day 7): every number
    here is computed, never generated.
    """
    def r(paise: int) -> str:
        return f"{paise / 100:.2f}"

    parts = [
        f"gross ₹{r(row['gross_paise'])}",
        f"- MDR ₹{r(row['mdr_paise'])}",
        f"- GST ₹{r(row['gst_paise'])}",
    ]
    if row["tcs_paise"]:
        parts.append(f"- TCS ₹{r(row['tcs_paise'])}")
    if row["refund_paise"]:
        parts.append(f"- refund ₹{r(row['refund_paise'])}")
    if row["chargeback_paise"]:
        parts.append(f"- chargeback ₹{r(row['chargeback_paise'])}")

    expected = f"= expected net ₹{r(row['expected_net_paise'])}"
    reported = f"reported net ₹{r(row['reported_net_paise'])}"

    if row["fee_valid"]:
        return f"{' '.join(parts)} {expected}; matches {reported}."
    gap = row["net_gap_paise"]
    direction = "short by" if gap < 0 else "over by"
    return (
        f"{' '.join(parts)} {expected}; but {reported} is {direction} "
        f"₹{r(abs(gap))} - fee anomaly, not explained by documented fees."
    )
