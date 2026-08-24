"""
ReconMint data loader.

The single, central place where the three input CSVs are read and normalized. Every downstream
component (matcher, fees, fuzzy, eval) consumes the DataFrames produced here, so ALL date parsing
and amount coercion is standardized in one file. This is deliberate: reconciliation bugs almost
always trace back to inconsistent date/amount handling (T+2 timezone drift, float rounding), and
we want exactly one place to reason about them.

Conventions enforced here:
  - All money is carried as float rupees rounded to 2 dp, AND exposed as integer paise
    (`*_paise` columns) for exact, drift-free equality checks by the matcher.
  - All dates are parsed to timezone-aware pandas Timestamps in Asia/Kolkata (IST), then a
    normalized `*_date` (midnight IST) column is provided for day-level comparison.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import pandas as pd

IST = "Asia/Kolkata"

DEFAULT_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "generated")


@dataclass
class ReconInputs:
    """Normalized inputs for a reconciliation run."""
    orders: pd.DataFrame
    settlement: pd.DataFrame
    bank: pd.DataFrame

    @property
    def counts(self) -> dict[str, int]:
        return {
            "orders": len(self.orders),
            "settlement": len(self.settlement),
            "bank": len(self.bank),
        }


def _to_ist(series: pd.Series) -> pd.Series:
    """Parse a date/datetime column to tz-aware IST timestamps.

    Naive inputs are assumed to already be in IST (that is how the generator emits them). Parsing
    everything through one helper is what prevents the classic T+2 bug where a settlement dated
    Monday and a bank credit dated Wednesday are compared in mismatched/naive timezones.
    """
    ts = pd.to_datetime(series, errors="coerce")
    if ts.dt.tz is None:
        ts = ts.dt.tz_localize(IST)
    else:
        ts = ts.dt.tz_convert(IST)
    return ts


def _to_paise(series: pd.Series) -> pd.Series:
    """Convert a rupee float column to integer paise for exact equality.

    Rounding to paise BEFORE the matcher touches the value is what removes floating-point drift
    (e.g. 4171.85 stored as 4171.8499999 would break a naive `==`). All matcher comparisons use
    these integer paise columns, never the raw floats.
    """
    rupees = pd.to_numeric(series, errors="coerce").fillna(0.0)
    return (rupees * 100).round().astype("int64")


def load_inputs(data_dir: str | None = None) -> ReconInputs:
    """Load and normalize orders.csv, settlement.csv, bank.csv from `data_dir`."""
    data_dir = data_dir or DEFAULT_DATA_DIR

    orders = pd.read_csv(os.path.join(data_dir, "orders.csv"))
    settlement = pd.read_csv(os.path.join(data_dir, "settlement.csv"))
    bank = pd.read_csv(os.path.join(data_dir, "bank.csv"))

    # --- orders ---
    orders["timestamp"] = _to_ist(orders["timestamp"])
    orders["order_date"] = orders["timestamp"].dt.normalize()
    orders["gross_amount"] = pd.to_numeric(orders["gross_amount"], errors="coerce")
    orders["gross_paise"] = _to_paise(orders["gross_amount"])
    orders["order_id"] = orders["order_id"].astype(str).str.strip()

    # --- settlement ---
    money_cols = [
        "gross_amount", "mdr_fee", "gst_on_mdr", "tcs",
        "refund_amount", "chargeback_amount", "net_settled",
    ]
    for col in money_cols:
        settlement[col] = pd.to_numeric(settlement[col], errors="coerce")
    settlement["net_paise"] = _to_paise(settlement["net_settled"])
    settlement["gross_paise"] = _to_paise(settlement["gross_amount"])
    settlement["settled_at"] = _to_ist(settlement["settled_at"])
    settlement["settled_date"] = settlement["settled_at"].dt.normalize()
    settlement["payment_id"] = settlement["payment_id"].astype(str).str.strip()
    settlement["order_id"] = settlement["order_id"].astype(str).str.strip()
    settlement["settlement_utr"] = settlement["settlement_utr"].astype(str).str.strip()

    # --- bank ---
    bank["credit_amount"] = pd.to_numeric(bank["credit_amount"], errors="coerce")
    bank["credit_paise"] = _to_paise(bank["credit_amount"])
    bank["value_date"] = _to_ist(bank["value_date"])
    bank["value_date_norm"] = bank["value_date"].dt.normalize()
    bank["utr"] = bank["utr"].astype(str).str.strip()

    return ReconInputs(orders=orders, settlement=settlement, bank=bank)


if __name__ == "__main__":
    data = load_inputs()
    print("Loaded and normalized:")
    for name, n in data.counts.items():
        print(f"  {name:12s} {n}")
    print("\nsettlement dtypes:")
    print(data.settlement[["payment_id", "net_settled", "net_paise", "settled_date"]].dtypes)
