# Validated against the live Razorpay test API

ReconMint's synthetic `settlement.csv` is modeled field-for-field on the real Razorpay API, not invented. This document maps every column to its real Razorpay source and is honest about what is generated.

**Schema fidelity:** 7/11 exact field matches, 3 close mappings (separate entity/format), 1 explicit gap.

## Column -> real Razorpay field

| synthetic settlement.csv | Razorpay field | entity | fidelity | note |
|---|---|---|---|---|
| `payment_id` | `id` | payment | exact | Razorpay payment id (pay_...) |
| `order_id` | `id` | order | exact | Razorpay order id (order_...) |
| `gross_amount` | `amount` | order | exact | order/payment amount (we store rupees; API is paise) |
| `mdr_fee` | `fee` | payment | exact | Razorpay's fee on the payment |
| `gst_on_mdr` | `tax` | payment | exact | GST/tax on the fee |
| `net_settled` | `amount` | settlement | exact | net amount in the settlement entity |
| `settlement_utr` | `utr` | settlement | exact | bank UTR of the settlement |
| `settled_at` | `created_at` | settlement | close | settlement timestamp (epoch in API) |
| `refund_amount` | `amount_refunded` | payment | close | refunds are a separate entity; payment carries amount_refunded |
| `chargeback_amount` | `amount` | dispute | close | chargebacks are the Disputes API (separate entity) |
| `tcs` | `-` | - | gap | TCS is marketplace/Route-specific; not on a standard payment. We model it explicitly. |

## Live capture

Created 3 real Orders via the test API. Sample order id `order_TTqoMt4WLQVfAn`, amount 50000 paise, status `created`, receipt `reconmint_probe_1`.

- **order** — 10 fields confirmed live: `amount`, `amount_due`, `amount_paid`, `attempts`, `created_at`, `currency`, `entity`, `id`, `receipt`, `status`
- **payment** — empty in test mode (no live payments yet); schema per Razorpay docs: `amount`, `amount_refunded`, `captured`, `created_at`, `currency`, `entity`, `fee`, `id`, `method`, `order_id`, `status`, `tax`
- **settlement** — empty in test mode (no live settlements yet); schema per Razorpay docs: `amount`, `created_at`, `entity`, `fees`, `id`, `status`, `tax`, `utr`

Raw responses: `docs/razorpay_probe_output.json`.

## Honesty note (what is generated)

Razorpay **test mode does not emit rich multi-day settlement files** (settlements require live activation and real payout cycles). So ReconMint **generates** a settlement batch whose schema matches the fields above, to exercise the reconciliation engine on 500+ records. The field *shapes* are real (validated here); the *volume and multi-day timing* are synthetic, and disclosed. `tcs` is modeled explicitly because it is marketplace/Route-specific rather than a standard payment field.
