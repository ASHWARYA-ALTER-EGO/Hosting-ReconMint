import React, { useEffect, useState } from "react";
import * as api from "../api.js";

// Tax-line matcher panel. Reads the audited fee reconstruction and surfaces
// three tax lines (MDR / GST-on-MDR / TCS) plus an "exposure" figure = money
// the merchant should either recover from the gateway (over-charged) or reserve
// to pay back (under-charged). Per-record drill-down for every anomaly.

const C = {
  ink: "#1F2A1A",
  card: "#FBFBF3",
  bg: "#EAF1DE",
  border: "rgba(31,42,26,0.14)",
  borderStrong: "rgba(31,42,26,0.28)",
  softText: "#5C6752",
  moss: "#4B7B4E",
  rust: "#B5432F",
  ochre: "#B8863B",
};

const TAX_LINES = [
  { key: "mdr", label: "MDR",        caption: "Merchant Discount Rate",  expectedField: "mdr_pct",         color: C.ink },
  { key: "gst", label: "GST on MDR", caption: "GST charged on MDR",      expectedField: "gst_on_mdr_pct",  color: C.ochre },
  { key: "tcs", label: "TCS",        caption: "Tax Collected at Source", expectedField: "tcs_pct",         color: C.moss },
];

function inr(paise) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 })
    .format((paise || 0) / 100);
}
function inrShort(paise) {
  const rupees = (paise || 0) / 100;
  if (Math.abs(rupees) >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`;
  if (Math.abs(rupees) >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} L`;
  if (Math.abs(rupees) >= 1e3) return `₹${(rupees / 1e3).toFixed(1)} K`;
  return `₹${rupees.toFixed(2)}`;
}

export default function TaxExposureCard({ runId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("all"); // all | over | under
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setData(null); setErr(null); setExpanded(false);
    api.getTaxExposure(runId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(String(e.message || e)); });
    return () => { cancelled = true; };
  }, [runId]);

  if (err) {
    return (
      <div className="rounded-xl border p-6 font-mono" style={{ background: C.card, borderColor: C.border, color: C.rust }}>
        Tax exposure unavailable: {err}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-xl border p-6 font-mono flex items-center gap-3" style={{ background: C.card, borderColor: C.border, color: C.softText }}>
        <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: C.ink, borderTopColor: "transparent" }} />
        Auditing tax lines...
      </div>
    );
  }

  const {
    aggregate_paise: agg, expected_rates_pct: rates, effective_rate_pct: rate,
    exposure_paise: exposure, anomaly_count, anomalies, settlements_analyzed,
  } = data;

  const grossR = (agg.gross || 0) / 100;
  const perLineRate = (paise) => grossR > 0 ? ((paise / 100 / grossR) * 100) : 0;

  const filtered = anomalies.filter((a) =>
    tab === "all" ? true : (tab === "over" ? a.direction === "over_charged" : a.direction === "under_charged"));
  const shown = expanded ? filtered : filtered.slice(0, 6);
  const clean = anomaly_count === 0;

  return (
    <div
      className="rounded-xl border overflow-hidden font-mono"
      style={{
        background: C.card,
        borderColor: C.borderStrong,
        boxShadow: "0 1px 2px rgba(31,42,26,0.06), 0 8px 24px -12px rgba(31,42,26,0.10)",
      }}
    >
      {/* header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: C.ink, color: C.card }}>
            <i className="fa-solid fa-file-invoice-dollar text-xs"></i>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.rust }}>Tax-line matcher
            </div>
            <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: C.ink }}>
              Tax exposure this batch
            </h2>
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-wider text-right" style={{ color: C.softText }}>
          <div>gross settled</div>
          <div className="text-[13px] font-semibold" style={{ color: C.ink }}>{inr(agg.gross)}</div>
          <div className="text-[10px]">{settlements_analyzed} settlements</div>
        </div>
      </div>

      {/* headline exposure */}
      <div
        className="mx-6 mb-4 p-5 rounded-lg flex items-end justify-between"
        style={{
          background: clean ? "rgba(75,123,78,0.08)" : "rgba(181,67,47,0.06)",
          border: `1px solid ${clean ? C.moss : C.rust}`,
        }}
      >
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: clean ? C.moss : C.rust }}>
            {clean ? "Tax lines clean" : "Merchant should investigate"}
          </div>
          <div className="text-3xl font-semibold tabular-nums mt-1" style={{ color: C.ink }}>
            {inr(exposure.gross_exposure)}
          </div>
          <div className="text-[11px] mt-1" style={{ color: C.softText }}>
            {clean
              ? "every fee line matches the Razorpay schedule to the paise"
              : `across ${anomaly_count} settlement${anomaly_count === 1 ? "" : "s"} with fee anomalies`}
          </div>
        </div>
        {!clean && (
          <div className="text-right space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.moss }}>
              Recover: {inrShort(exposure.over_charged)}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.rust }}>
              Reserve: {inrShort(exposure.under_charged)}
            </div>
          </div>
        )}
      </div>

      {/* three tax lines */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-6 pb-4">
        {TAX_LINES.map((t) => {
          const paise = agg[t.key] || 0;
          const observed = perLineRate(paise);
          const expected = rates[t.expectedField];
          // GST is 18% of MDR (not of gross). display observed as % of MDR so drift is meaningful
          const observedForDisplay = t.key === "gst"
            ? (agg.mdr > 0 ? (paise / agg.mdr) * 100 : 0)
            : observed;
          const drift = Math.abs(observedForDisplay - expected);
          const inRange = drift < 0.5;

          return (
            <div key={t.key} className="rounded-lg border p-3.5" style={{ background: C.card, borderColor: C.border }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.color }}>{t.label}</span>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: inRange ? C.moss : C.rust }}>
                  {inRange ? "in range" : "drift"}
                </span>
              </div>
              <div className="text-lg font-semibold tabular-nums" style={{ color: C.ink }}>{inrShort(paise)}</div>
              <div className="text-[10px] mt-0.5" style={{ color: C.softText }}>{t.caption}</div>
              <div className="mt-2 flex items-center justify-between text-[10px] tabular-nums">
                <span style={{ color: C.softText }}>
                  observed <span className="font-semibold" style={{ color: C.ink }}>{observedForDisplay.toFixed(2)}%</span>
                </span>
                <span style={{ color: C.softText }}>
                  expected <span className="font-semibold" style={{ color: C.ink }}>{expected.toFixed(2)}%</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* effective total rate strip */}
      <div className="mx-6 mb-4 p-3 rounded-lg flex items-center justify-between text-[11px]"
        style={{ background: "rgba(31,42,26,0.04)", border: `1px dashed ${C.border}` }}>
        <div style={{ color: C.softText }}>
          Effective total tax rate
        </div>
        <div className="tabular-nums font-semibold" style={{ color: C.ink }}>
          {rate.toFixed(3)}% of gross settled · <span style={{ color: C.softText }}>total taxes</span> {inr(agg.tax_total)}
        </div>
      </div>

      {/* per-record anomaly table */}
      {!clean && (
        <div className="px-6 pb-6">
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.softText }}>
              Anomalies · top by |variance|
            </div>
            <div className="flex items-center gap-1">
              {[
                { id: "all",   label: "All" },
                { id: "over",  label: "Over-charged" },
                { id: "under", label: "Under-charged" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded transition-colors"
                  style={{
                    background: tab === t.id ? C.ink : "transparent",
                    color: tab === t.id ? C.card : C.softText,
                    border: `1px solid ${tab === t.id ? C.ink : C.border}`,
                  }}
                >{t.label}</button>
              ))}
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden" style={{ borderColor: C.border }}>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider" style={{ color: C.softText, background: "rgba(31,42,26,0.04)" }}>
                  <th className="text-left  py-2 px-3 font-semibold">Payment ID</th>
                  <th className="text-left  py-2 px-3 font-semibold">Date</th>
                  <th className="text-right py-2 px-3 font-semibold">Gross</th>
                  <th className="text-right py-2 px-3 font-semibold">Expected net</th>
                  <th className="text-right py-2 px-3 font-semibold">Bank net</th>
                  <th className="text-right py-2 px-3 font-semibold">Variance</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => {
                  const isOver = a.direction === "over_charged";
                  return (
                    <tr key={a.payment_id} className="border-t" style={{ borderColor: C.border }}>
                      <td className="py-2 px-3 font-medium" style={{ color: C.ink }}>{a.payment_id}</td>
                      <td className="py-2 px-3" style={{ color: C.softText }}>{a.date || "-"}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: C.ink }}>{inr(a.gross_paise)}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: C.softText }}>{inr(a.expected_net_paise)}</td>
                      <td className="py-2 px-3 text-right tabular-nums" style={{ color: C.softText }}>{inr(a.actual_net_paise)}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold" style={{ color: isOver ? C.moss : C.rust }}>
                        {isOver ? "+" : "−"}{inr(Math.abs(a.variance_paise))}
                        <span className="ml-1 text-[9px] uppercase" style={{ color: C.softText }}>
                          {isOver ? "recover" : "reserve"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 px-3 text-center" style={{ color: C.softText }}>
                      No anomalies in this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 6 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 text-[11px] font-semibold transition-colors"
              style={{ color: C.rust }}
            >
              {expanded ? "Show fewer" : `Show all ${filtered.length}`} <i className={`fa-solid fa-chevron-${expanded ? "up" : "down"} text-[9px] ml-1`} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
