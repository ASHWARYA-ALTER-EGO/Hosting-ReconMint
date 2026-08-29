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
import re
from dataclasses import dataclass, field

import pandas as pd

from difflib import SequenceMatcher

from backend.engine.validation import REQUIRED_COLUMNS, OPTIONAL_COLUMNS, InputValidationError

IST = "Asia/Kolkata"

DEFAULT_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "generated")

TABLE_EXTENSIONS = (".csv", ".xlsx", ".xlsm", ".xls", ".xlsb")
EXCEL_EXTENSIONS = (".xlsx", ".xlsm", ".xls", ".xlsb")

# Common merchant-export spellings -> the engine's canonical column names.
# Keys are normalized (lowercase, non-alnum -> _). Real Razorpay dashboard exports use
# variants like "Payment ID", "Order Amount", "Settlement UTR", "Fee", "Tax" - all covered.
COLUMN_ALIASES: dict[str, dict[str, str]] = {
    "orders": {
        # order_id
        "orderid": "order_id", "order_no": "order_id", "orderno": "order_id",
        "order_number": "order_id", "order": "order_id", "order_ref": "order_id",
        "order_reference": "order_id", "receipt": "order_id",
        # timestamp
        "created_at": "timestamp", "created_on": "timestamp", "order_date": "timestamp",
        "datetime": "timestamp", "date_time": "timestamp", "date": "timestamp",
        "placed_at": "timestamp", "placed_on": "timestamp", "order_created_at": "timestamp",
        # gross_amount
        "gross": "gross_amount", "order_amount": "gross_amount", "gross_amt": "gross_amount",
        "amount": "gross_amount", "total": "gross_amount", "total_amount": "gross_amount",
        "value": "gross_amount", "order_value": "gross_amount", "invoice_amount": "gross_amount",
        "amount_ordered": "gross_amount",
    },
    "settlement": {
        # payment_id
        "paymentid": "payment_id", "pay_id": "payment_id", "payment": "payment_id",
        "transaction_id": "payment_id", "txn_id": "payment_id", "payment_ref": "payment_id",
        "payment_reference": "payment_id", "rzp_payment_id": "payment_id",
        # order_id
        "orderid": "order_id", "order_no": "order_id", "receipt_id": "order_id",
        "rzp_order_id": "order_id",
        # gross_amount
        "gross": "gross_amount", "order_amount": "gross_amount", "gross_amt": "gross_amount",
        "amount": "gross_amount", "captured_amount": "gross_amount",
        "payment_amount": "gross_amount", "amount_captured": "gross_amount",
        # fees
        "mdr": "mdr_fee", "fee": "mdr_fee", "gateway_fee": "mdr_fee",
        "processing_fee": "mdr_fee", "commission": "mdr_fee", "mdr_amount": "mdr_fee",
        "gst": "gst_on_mdr", "tax": "gst_on_mdr", "gst_amount": "gst_on_mdr",
        "gst_on_fee": "gst_on_mdr", "service_tax": "gst_on_mdr",
        "tcs_amount": "tcs", "tds": "tcs", "tds_amount": "tcs",
        # net
        "net": "net_settled", "net_amount": "net_settled", "net_settlement": "net_settled",
        "amount_settled": "net_settled", "settled_amount": "net_settled",
        "net_credit": "net_settled", "credit_amount": "net_settled",
        # utr
        "utr": "settlement_utr", "payout_utr": "settlement_utr",
        "settlement_id_utr": "settlement_utr", "settlement_id": "settlement_utr",
        "settlement_ref": "settlement_utr", "settlement_reference": "settlement_utr",
        "payout_reference": "settlement_utr", "rzp_settlement_id": "settlement_utr",
        # date
        "settled_date": "settled_at", "settlement_date": "settled_at",
        "settled_on": "settled_at", "settled": "settled_at",
        "credited_at": "settled_at", "credited_on": "settled_at",
        "settlement_time": "settled_at", "date": "settled_at", "value_date": "settled_at",
        # refunds / chargebacks
        "refund": "refund_amount", "refunds": "refund_amount",
        "refunded_amount": "refund_amount", "refund_amt": "refund_amount",
        "chargeback": "chargeback_amount", "chargebacks": "chargeback_amount",
        "chargeback_amt": "chargeback_amount", "dispute_amount": "chargeback_amount",
    },
    "bank": {
        # value_date
        "date": "value_date", "txn_date": "value_date", "transaction_date": "value_date",
        "credit_date": "value_date", "value_dt": "value_date", "posting_date": "value_date",
        "post_date": "value_date", "book_date": "value_date", "credited_on": "value_date",
        "credited_at": "value_date", "settlement_date": "value_date",
        # utr
        "utr_number": "utr", "utr_no": "utr", "reference": "utr", "ref_no": "utr",
        "transaction_ref": "utr", "narration_ref": "utr", "reference_number": "utr",
        "ref_number": "utr", "cheque_ref": "utr", "chq_ref": "utr",
        "transaction_reference": "utr", "credit_ref": "utr",
        # credit_amount
        "credit": "credit_amount", "deposit": "credit_amount", "credit_amt": "credit_amount",
        "amount": "credit_amount", "amount_credited": "credit_amount",
        "cr_amount": "credit_amount", "amt": "credit_amount",
        "credit_inr": "credit_amount", "deposit_amount": "credit_amount",
    },
}


# For fuzzy header matching when no alias hits. Keys are canonical names, values are
# a list of prototype tokens; we compute similarity between each unknown header and
# every prototype, and if the best score >= 0.72 we take that mapping.
FUZZY_HINTS: dict[str, dict[str, list[str]]] = {
    "orders": {
        "order_id":     ["order id", "order number", "order ref"],
        "timestamp":    ["created", "placed", "order date", "date"],
        "gross_amount": ["order amount", "gross", "total", "amount", "value"],
    },
    "settlement": {
        "payment_id":       ["payment id", "transaction id", "pay id", "rzp payment id"],
        "order_id":         ["order id", "receipt"],
        "gross_amount":     ["order amount", "captured amount", "gross", "amount"],
        "mdr_fee":          ["mdr", "fee", "commission", "processing fee", "gateway fee"],
        "gst_on_mdr":       ["gst", "tax", "service tax"],
        "tcs":              ["tcs", "tds"],
        "refund_amount":    ["refund", "refunded amount"],
        "chargeback_amount": ["chargeback", "dispute"],
        "net_settled":      ["net", "amount settled", "settled amount", "net amount", "credited"],
        "settlement_utr":   ["utr", "settlement id", "payout reference", "settlement reference"],
        "settled_at":       ["settled date", "settlement date", "credited", "value date", "date"],
    },
    "bank": {
        "value_date":    ["date", "value date", "transaction date", "posting date"],
        "utr":           ["utr", "reference", "ref no", "narration", "cheque ref"],
        "credit_amount": ["credit", "deposit", "amount credited", "amount"],
    },
}


def _similar(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def _fuzzy_map(kind: str, unknown_headers: list[str],
               already_mapped: set[str]) -> dict[str, str]:
    """For every canonical column not yet mapped, pick the best fuzzy header match
    (>= 0.72 similarity). Returns {header_norm -> canonical}."""
    result: dict[str, str] = {}
    used_headers: set[str] = set()
    hints = FUZZY_HINTS.get(kind or "", {})
    for canonical, protos in hints.items():
        if canonical in already_mapped:
            continue
        best_header = None
        best_score = 0.0
        for header in unknown_headers:
            if header in used_headers or not header:
                continue
            # substitute underscores for spaces so "order_id" ~ "order id"
            header_pretty = header.replace("_", " ")
            for proto in protos:
                s = _similar(header_pretty, proto)
                if s > best_score:
                    best_score = s
                    best_header = header
        if best_header and best_score >= 0.72:
            result[best_header] = canonical
            used_headers.add(best_header)
    return result


def table_extension(filename: str | None) -> str | None:
    """Return the matched tabular extension (including the dot), or None."""
    name = (filename or "").lower().rsplit("/", 1)[-1]
    for ext in TABLE_EXTENSIONS:
        if name.endswith(ext):
            return ext
    return None


def _norm_col(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    s = str(value).strip().lower()
    if s in ("nan", "none", "nat"):
        return ""
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s


def _excel_engine(ext: str) -> str:
    if ext in (".xlsx", ".xlsm"):
        return "openpyxl"
    if ext == ".xls":
        return "xlrd"
    if ext == ".xlsb":
        return "pyxlsb"
    raise InputValidationError(f"Unsupported spreadsheet type '{ext}'.")


def _score_headers(headers: list[str], kind: str | None) -> int:
    names = {h for h in headers if h}
    required = REQUIRED_COLUMNS.get(kind or "", set())
    if required:
        return len(names & required)
    return len(names)


def _frame_from_grid(raw: pd.DataFrame, kind: str | None) -> pd.DataFrame:
    """Pick the header row (Excel dumps often have a title block above the table)."""
    if raw is None or raw.empty:
        return pd.DataFrame()
    best_i, best_score = 0, -1
    limit = min(20, len(raw))
    for i in range(limit):
        headers = [_norm_col(c) for c in raw.iloc[i].tolist()]
        score = _score_headers(headers, kind)
        nonempty = sum(1 for h in headers if h)
        if score > best_score and nonempty >= 2:
            best_i, best_score = i, score
    headers = [_norm_col(c) for c in raw.iloc[best_i].tolist()]
    # Uniquify blank/duplicate headers so pandas doesn't collapse columns.
    seen: dict[str, int] = {}
    uniq = []
    for h in headers:
        base = h or "col"
        n = seen.get(base, 0)
        seen[base] = n + 1
        uniq.append(base if n == 0 else f"{base}_{n}")
    df = raw.iloc[best_i + 1 :].copy()
    df.columns = uniq
    df = df.dropna(axis=1, how="all").dropna(how="all")
    df = df.reset_index(drop=True)
    return df


def _apply_aliases(df: pd.DataFrame, kind: str | None,
                   mapping_out: dict | None = None) -> pd.DataFrame:
    """Rename columns using the explicit alias table then a fuzzy pass. Any mappings
    made are recorded in `mapping_out` (if given) so the trace can show them."""
    aliases = COLUMN_ALIASES.get(kind or "", {})
    rename: dict[str, str] = {}
    existing = set(df.columns)

    # Pass 1: exact alias table lookups.
    for col in df.columns:
        target = aliases.get(col)
        if target and target not in existing and col not in rename:
            rename[col] = target
            existing.add(target)

    # Pass 2: after exact aliases, whatever canonical names are still missing get a
    # fuzzy attempt from the remaining unmapped headers.
    canonical_needed = REQUIRED_COLUMNS.get(kind or "", set()) | OPTIONAL_COLUMNS.get(kind or "", set())
    already_present = {rename.get(c, c) for c in df.columns} & canonical_needed
    still_missing = canonical_needed - already_present
    unmapped_headers = [c for c in df.columns
                        if c not in rename and c not in canonical_needed]
    fuzzy = _fuzzy_map(kind or "", unmapped_headers, already_present)
    for header, canonical in fuzzy.items():
        if canonical in still_missing and canonical not in existing:
            rename[header] = canonical
            existing.add(canonical)

    if mapping_out is not None:
        mapping_out.update(rename)
    return df.rename(columns=rename) if rename else df


def read_table(path: str, kind: str | None = None,
               mapping_out: dict | None = None) -> pd.DataFrame:
    """Read a CSV or Excel workbook into a DataFrame with normalized column names."""
    ext = table_extension(path)
    if not ext:
        raise InputValidationError(f"Could not read '{os.path.basename(path)}' (unsupported type).")
    try:
        if ext == ".csv":
            # Header-row detection for CSVs too - some real bank statements have a
            # 2-3 line title block above the actual table.
            raw = pd.read_csv(path, header=None, dtype=object, keep_default_na=False,
                              on_bad_lines="skip", engine="python")
            df = _frame_from_grid(raw, kind)
            if df.empty:  # fallback: assume row 0 is the header (typical CSV)
                df = pd.read_csv(path)
                df.columns = [_norm_col(c) for c in df.columns]
        else:
            engine = _excel_engine(ext)
            xl = pd.ExcelFile(path, engine=engine)
            try:
                best_df, best_score = None, -1
                for sheet in xl.sheet_names:
                    raw = pd.read_excel(xl, sheet_name=sheet, header=None)
                    candidate = _frame_from_grid(raw, kind)
                    score = _score_headers(list(candidate.columns), kind)
                    if score > best_score:
                        best_df, best_score = candidate, score
                df = best_df if best_df is not None else pd.DataFrame()
            finally:
                xl.close()
    except InputValidationError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise InputValidationError(
            f"{kind or os.path.basename(path)} could not be read ({exc.__class__.__name__}). "
            "Export the first sheet as CSV or .xlsx with a header row."
        ) from exc
    return _apply_aliases(df, kind, mapping_out=mapping_out)


def _fill_optional_columns(df: pd.DataFrame, kind: str) -> tuple[pd.DataFrame, list[str]]:
    """Synthesize optional columns that a real merchant export may not carry.

    Money columns get 0.0; text/date columns get an empty string so downstream
    coercion doesn't crash. Returns (df, list_of_synthesized_column_names).
    """
    optional = OPTIONAL_COLUMNS.get(kind, set())
    money_optional = {"mdr_fee", "gst_on_mdr", "tcs", "refund_amount", "chargeback_amount"}
    synthesized: list[str] = []
    for col in optional:
        if col in df.columns:
            continue
        if col in money_optional:
            df[col] = 0.0
        elif col == "order_id":
            df[col] = ""
        else:
            df[col] = ""
        synthesized.append(col)
    return df, synthesized


def resolve_table_path(data_dir: str, name: str) -> str:
    """Find `{name}.csv` / `{name}.xlsx` / … in `data_dir`."""
    for ext in TABLE_EXTENSIONS:
        path = os.path.join(data_dir, f"{name}{ext}")
        if os.path.exists(path):
            return path
    raise InputValidationError(
        f"{name} file not found (looked for {', '.join(name + e for e in TABLE_EXTENSIONS)})."
    )


@dataclass
class ReconInputs:
    """Normalized inputs for a reconciliation run."""
    orders: pd.DataFrame
    settlement: pd.DataFrame
    bank: pd.DataFrame
    # Detected header -> canonical mapping per file, for the trace/UI.
    header_maps: dict[str, dict[str, str]] = field(default_factory=dict)
    # Optional columns the loader had to synthesize (0.0 for money, empty for id).
    synthesized: dict[str, list[str]] = field(default_factory=dict)

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
    """Load and normalize orders / settlement / bank tables (CSV or Excel) from `data_dir`."""
    data_dir = data_dir or DEFAULT_DATA_DIR

    header_maps: dict[str, dict[str, str]] = {"orders": {}, "settlement": {}, "bank": {}}
    orders     = read_table(resolve_table_path(data_dir, "orders"),     "orders",     mapping_out=header_maps["orders"])
    settlement = read_table(resolve_table_path(data_dir, "settlement"), "settlement", mapping_out=header_maps["settlement"])
    bank       = read_table(resolve_table_path(data_dir, "bank"),       "bank",       mapping_out=header_maps["bank"])

    # Fill in optional columns that a real merchant export might not have (fees, refunds,
    # chargebacks). This is the difference between "your file is missing tcs" and "it works".
    synthesized: dict[str, list[str]] = {}
    orders, synthesized["orders"]         = _fill_optional_columns(orders,     "orders")
    settlement, synthesized["settlement"] = _fill_optional_columns(settlement, "settlement")
    bank, synthesized["bank"]             = _fill_optional_columns(bank,       "bank")

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

    return ReconInputs(orders=orders, settlement=settlement, bank=bank,
                       header_maps=header_maps, synthesized=synthesized)


if __name__ == "__main__":
    data = load_inputs()
    print("Loaded and normalized:")
    for name, n in data.counts.items():
        print(f"  {name:12s} {n}")
    print("\nsettlement dtypes:")
    print(data.settlement[["payment_id", "net_settled", "net_paise", "settled_date"]].dtypes)
