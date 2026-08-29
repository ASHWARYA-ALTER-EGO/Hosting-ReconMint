import React, { useEffect, useState } from "react";
import * as api from "../api.js";

// Fee-slab recommendation. Compares this batch's observed effective MDR against
// Razorpay's published slabs and projects annual savings on projected volume.
// Turns "reconciliation audit" into "revenue advice" - the sponsor-alignment card.

const C = {
  ink: "#1F2A1A",
  card: "#FBFBF3",
  border: "rgba(31,42,26,0.14)",
  borderStrong: "rgba(31,42,26,0.28)",
  softText: "#5C6752",
  moss: "#4B7B4E",
  rust: "#B5432F",
  ochre: "#B8863B",
  rzpBlue: "#3395FF",
};

function inr(paise) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format((paise || 0) / 100);
}
function inrShort(paise) {
  const rupees = (paise || 0) / 100;
  if (Math.abs(rupees) >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`;
  if (Math.abs(rupees) >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} L`;
  if (Math.abs(rupees) >= 1e3) return `₹${(rupees / 1e3).toFixed(1)} K`;
  return `₹${rupees.toFixed(0)}`;
}

export default function FeeSlabCard({ runId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [multiplier, setMultiplier] = useState(12);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setData(null); setErr(null);
    api.getFeeSlabAdvice(runId, { multiplier })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(String(e.message || e)); });
    return () => { cancelled = true; };
  }, [runId, multiplier]);

  if (err) return (
    <div className="rounded-xl border p-6 font-mono" style={{ background: C.card, borderColor: C.border, color: C.rust }}>
      Fee-slab advice unavailable: {err}
    </div>
  );
  if (!data) return (
    <div className="rounded-xl border p-6 font-mono flex items-center gap-3" style={{ background: C.card, borderColor: C.border, color: C.softText }}>
      <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: C.ink, borderTopColor: "transparent" }} />
      Analyzing fee slab...
    </div>
  );
  if (!data.eligible) return (
    <div className="rounded-xl border p-6 font-mono" style={{ background: C.card, borderColor: C.border, color: C.softText }}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: C.softText }}>Fee slab advice
      </div>
      {data.detail || "No gross-bearing settlements to analyze."}
    </div>
  );

  const rec = data.recommendation;
  const current = data.current_slab;
  const effectiveMdr = data.effective_mdr_pct;

  if (!rec) {
    // already on the best slab
    return (
      <div
        className="rounded-xl border overflow-hidden font-mono"
        style={{
          background: C.card,
          borderColor: C.borderStrong,
          boxShadow: "0 1px 2px rgba(31,42,26,0.06), 0 8px 24px -12px rgba(31,42,26,0.10)",
        }}
      >
        <div className="flex items-center gap-2.5 px-6 pt-5 pb-3">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: C.rzpBlue, color: "#fff" }}>
            <i className="fa-solid fa-piggy-bank text-xs"></i>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.rust }}>Fee slab advice
            </div>
            <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: C.ink }}>
              Already on the lowest slab
            </h2>
          </div>
        </div>
        <div className="mx-6 mb-6 p-5 rounded-lg border" style={{ borderColor: C.moss, background: "rgba(75,123,78,0.06)" }}>
          <div className="text-sm" style={{ color: C.ink }}>
            Your effective MDR is <b>{effectiveMdr.toFixed(2)}%</b> - it matches or beats Razorpay's
            Enterprise slab (1.50%). No cheaper published slab to recommend.
          </div>
        </div>
      </div>
    );
  }

  const annualSavings = rec.annual_savings_paise;
  const batchSavings = rec.batch_savings_paise;
  const currentPct = current.mdr_pct;
  const targetPct = rec.target_slab.mdr_pct;
  const drift = effectiveMdr - targetPct;

  return (
    <div
      className="rounded-xl border overflow-hidden font-mono"
      style={{
        background: C.card,
        borderColor: C.borderStrong,
        boxShadow: "0 1px 2px rgba(31,42,26,0.06), 0 8px 24px -12px rgba(31,42,26,0.10)",
      }}
    >
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: C.rzpBlue, color: "#fff" }}>
            <i className="fa-solid fa-piggy-bank text-xs"></i>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.rust }}>Fee slab · revenue advice
            </div>
            <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: C.ink }}>
              Ask sales about the {rec.target_slab.name} plan
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {[3, 12, 24, 52].map((m) => (
            <button
              key={m}
              onClick={() => setMultiplier(m)}
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors"
              style={{
                background: m === multiplier ? C.ink : "transparent",
                color: m === multiplier ? C.card : C.softText,
                border: `1px solid ${m === multiplier ? C.ink : C.border}`,
              }}
              title={m === 3 ? "quarterly" : m === 12 ? "monthly" : m === 24 ? "twice-monthly" : "weekly"}
            >
              ×{m}
            </button>
          ))}
        </div>
      </div>

      {/* headline savings */}
      <div
        className="mx-6 mb-4 p-5 rounded-lg flex items-end justify-between"
        style={{ background: "rgba(75,123,78,0.08)", border: `1px solid ${C.moss}` }}
      >
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.moss }}>
            Projected annual savings
          </div>
          <div className="text-3xl font-semibold tabular-nums mt-1" style={{ color: C.ink }}>
            {inr(annualSavings)}
          </div>
          <div className="text-[11px] mt-1" style={{ color: C.softText }}>
            on projected annual gross of {inrShort(rec.annual_gross_paise)}
            <span className="mx-1">·</span> {inr(batchSavings)} this batch alone
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.rust }}>
            MDR delta
          </div>
          <div className="text-xl font-semibold tabular-nums" style={{ color: C.rust }}>
            −{rec.delta_pct.toFixed(2)} pp
          </div>
          <div className="text-[11px]" style={{ color: C.softText }}>{currentPct.toFixed(2)}% → {targetPct.toFixed(2)}%</div>
        </div>
      </div>

      {/* slab ladder */}
      <div className="px-6 pb-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-2" style={{ color: C.softText }}>
          Slab ladder · effective MDR = <b>{effectiveMdr.toFixed(2)}%</b>
        </div>
        <div className="space-y-2">
          {[
            { name: "Standard",   mdr_pct: 2.00 },
            { name: "Growth",     mdr_pct: 1.75 },
            { name: "Enterprise", mdr_pct: 1.50 },
          ].map((s) => {
            const isCurrent = s.name === current.name;
            const isTarget = s.name === rec.target_slab.name;
            const barPct = Math.max(6, (s.mdr_pct / 2.00) * 100);
            return (
              <div key={s.name} className="rounded-lg border p-3" style={{
                borderColor: isTarget ? C.moss : (isCurrent ? C.rust : C.border),
                background: isTarget ? "rgba(75,123,78,0.06)" : (isCurrent ? "rgba(181,67,47,0.04)" : C.card),
              }}>
                <div className="flex items-center gap-3">
                  <div className="text-[13px] font-semibold min-w-[100px]" style={{ color: C.ink }}>
                    {s.name}
                    {isCurrent && <span className="ml-2 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: C.rust, color: C.card }}>now</span>}
                    {isTarget && <span className="ml-2 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: C.moss, color: C.card }}>target</span>}
                  </div>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(31,42,26,0.05)" }}>
                    <div className="h-full transition-all duration-500" style={{
                      width: `${barPct}%`,
                      background: isTarget ? C.moss : (isCurrent ? C.rust : C.softText),
                    }} />
                  </div>
                  <div className="text-[13px] font-semibold tabular-nums min-w-[54px] text-right" style={{ color: C.ink }}>
                    {s.mdr_pct.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* advice sentence */}
      <div className="mx-6 mb-5 p-3 rounded-lg text-[11.5px] leading-relaxed border-l-2"
        style={{ borderColor: C.rzpBlue, background: "rgba(51,149,255,0.04)", color: C.ink }}>
        {rec.phrase}
        {drift > 0.05 && (
          <div className="text-[10.5px] mt-1" style={{ color: C.softText }}>
            Your observed MDR is <b>{drift.toFixed(2)}pp</b> above the target, verify no per-instrument
            over-charge before renegotiating.
          </div>
        )}
      </div>

      <div className="mx-6 mb-5 p-3 rounded-lg text-[10px] italic border-l-2"
        style={{ borderColor: C.border, background: "rgba(31,42,26,0.03)", color: C.softText }}>
        Slab rates shown are illustrative reference points from Razorpay's published pricing tiers.
        Actual pricing depends on payment method mix, volume commitment, and negotiation, this
        card is decision support, not a quote. Annual projection = this batch × {multiplier}.
      </div>
    </div>
  );
}
