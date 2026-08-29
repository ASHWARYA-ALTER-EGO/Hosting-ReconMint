import React, { useEffect, useState } from "react";
import * as api from "../api.js";

// Cash Position card - the Finance Controller view. Four mutually-exclusive buckets
// computed by the backend from this run's audited decisions, plus a Net Available line
// (cleared + ghost - at_risk). In-flight is deliberately excluded from Net Available
// so the operator sees what is *actually spendable right now*.

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
  plum: "#8B5A8C",
};

const BUCKETS = [
  {
    key: "cleared",
    label: "Cleared",
    icon: "fa-solid fa-vault",
    color: C.moss,
    bg: "rgba(75,123,78,0.10)",
    caption: "reconciled + credited",
  },
  {
    key: "in_flight",
    label: "In-flight",
    icon: "fa-solid fa-truck-fast",
    color: C.ochre,
    bg: "rgba(184,134,59,0.12)",
    caption: "settlement dated, bank not yet",
  },
  {
    key: "at_risk",
    label: "At-risk",
    icon: "fa-solid fa-triangle-exclamation",
    color: C.rust,
    bg: "rgba(181,67,47,0.10)",
    caption: "chargebacks / disputes",
  },
  {
    key: "ghost",
    label: "Ghost",
    icon: "fa-solid fa-ghost",
    color: C.plum,
    bg: "rgba(139,90,140,0.12)",
    caption: "bank credit, no settlement",
  },
];

function inr(paise) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2,
  }).format((paise || 0) / 100);
}

function inrShort(paise) {
  const rupees = (paise || 0) / 100;
  if (Math.abs(rupees) >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`;
  if (Math.abs(rupees) >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} L`;
  if (Math.abs(rupees) >= 1e3) return `₹${(rupees / 1e3).toFixed(1)} K`;
  return `₹${rupees.toFixed(0)}`;
}

export default function CashPositionCard({ runId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setData(null); setErr(null); setExpanded(null);
    api.getCashPosition(runId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(String(e.message || e)); });
    return () => { cancelled = true; };
  }, [runId]);

  if (err) {
    return (
      <div className="rounded-xl border p-6 font-mono" style={{ background: C.card, borderColor: C.border, color: C.rust }}>
        Cash position unavailable: {err}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border p-6 font-mono flex items-center gap-3" style={{ background: C.card, borderColor: C.border, color: C.softText }}>
        <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: C.ink, borderTopColor: "transparent" }} />
        Computing cash position...
      </div>
    );
  }

  const { buckets, totals, as_of } = data;
  const grossPaise = totals.gross_settled_paise || 0;
  const cleared = buckets.cleared?.amount_paise || 0;
  const clearedPct = grossPaise > 0 ? (cleared / grossPaise) * 100 : 0;

  return (
    <div
      className="rounded-xl border overflow-hidden font-mono"
      style={{
        background: C.card,
        borderColor: C.borderStrong,
        boxShadow: "0 1px 2px rgba(31,42,26,0.06), 0 8px 24px -12px rgba(31,42,26,0.10)",
      }}
    >
      {/* header row: label + as-of + explanation link */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: C.ink, color: C.card }}>
            <i className="fa-solid fa-scale-balanced text-xs"></i>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.rust }}>Finance Controller
            </div>
            <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: C.ink }}>
              Cash position as of {as_of}
            </h2>
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-wider text-right" style={{ color: C.softText }}>
          <div>gross settled</div>
          <div className="text-[13px] font-semibold" style={{ color: C.ink }}>{inr(grossPaise)}</div>
        </div>
      </div>

      {/* headline: Net Available - the number a controller cares about */}
      <div
        className="mx-6 mb-4 p-5 rounded-lg flex items-end justify-between"
        style={{ background: "rgba(75,123,78,0.08)", border: `1px solid ${C.moss}` }}
      >
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.moss }}>
            Net available <span style={{ color: C.softText }}>(cleared + ghost − at-risk)</span>
          </div>
          <div className="text-3xl font-semibold tabular-nums mt-1" style={{ color: C.ink }}>
            {inr(totals.net_available_paise)}
          </div>
          <div className="text-[11px] mt-1" style={{ color: C.softText }}>
            what you can actually spend right now
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.ochre }}>
            Exposure
          </div>
          <div className="text-xl font-semibold tabular-nums" style={{ color: C.ochre }}>
            {inr(totals.exposure_paise)}
          </div>
          <div className="text-[11px]" style={{ color: C.softText }}>at-risk + in-flight</div>
        </div>
      </div>

      {/* stacked bar showing bucket proportions */}
      <div className="mx-6 h-2 rounded-full overflow-hidden flex" style={{ background: C.bg }}>
        {BUCKETS.map((b) => {
          const bkt = buckets[b.key];
          const pct = grossPaise > 0 ? ((bkt?.amount_paise || 0) / grossPaise) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div key={b.key} title={`${b.label}: ${inr(bkt.amount_paise)}`}
              style={{ width: `${pct}%`, background: b.color, transition: "width 500ms cubic-bezier(0.4,0,0.2,1)" }}
            />
          );
        })}
      </div>
      <div className="px-6 mt-1 mb-4 text-[10px]" style={{ color: C.softText }}>
        {clearedPct.toFixed(1)}% cleared · every bucket is mutually exclusive · sums to gross settled
      </div>

      {/* four bucket cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 px-6 pb-6">
        {BUCKETS.map((b) => {
          const bkt = buckets[b.key] || { amount_paise: 0, count: 0, ids: [] };
          const isOpen = expanded === b.key;
          return (
            <div
              key={b.key}
              className="rounded-lg border overflow-hidden transition-all duration-200"
              style={{
                background: C.card,
                borderColor: isOpen ? b.color : C.border,
                boxShadow: isOpen ? `inset 0 0 0 1px ${b.color}` : "none",
              }}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : b.key)}
                className="w-full text-left p-3.5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded flex items-center justify-center text-[11px]" style={{ background: b.bg, color: b.color }}>
                    <i className={b.icon}></i>
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: b.color }}>{b.label}</span>
                  <span className="ml-auto text-[10px] tabular-nums" style={{ color: C.softText }}>{bkt.count} rec</span>
                </div>
                <div className="text-lg font-semibold tabular-nums" style={{ color: C.ink }}>
                  {inrShort(bkt.amount_paise)}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: C.softText }}>{b.caption}</div>
                {bkt.count > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold" style={{ color: b.color }}>
                    <i className={`fa-solid fa-chevron-${isOpen ? "up" : "down"} text-[9px]`}></i>
                    {isOpen ? "hide" : "show"} {Math.min(bkt.count, 25)} id{bkt.count === 1 ? "" : "s"}
                  </div>
                )}
              </button>
              {isOpen && bkt.ids.length > 0 && (
                <div className="px-3.5 pb-3 pt-1 border-t" style={{ borderColor: C.border }}>
                  <div className="max-h-32 overflow-y-auto text-[11px] leading-[1.7] font-mono">
                    {bkt.ids.map((id) => (
                      <div key={id} className="truncate" style={{ color: C.softText }} title={id}>
                        · {id}
                      </div>
                    ))}
                    {bkt.count > bkt.ids.length && (
                      <div className="pt-1 text-[10px] italic" style={{ color: C.softText }}>
                        + {bkt.count - bkt.ids.length} more, view Exceptions for the full list
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
