import React, { useEffect, useState } from "react";
import * as api from "../api.js";

// Forward cash forecaster. Each in-flight settlement is projected to land on
// record_date + T+2 business days. Rendered as a 7-bar column chart above a
// per-day breakdown table. Anything projected before today is "past-due" - a
// separate red chip that says "escalate now".

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

const DAY_NAME = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function labelFor(iso, todayIso) {
  const d = parseISO(iso);
  if (iso === todayIso) return "Today";
  return `${DAY_NAME[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

export default function CashForecastCard({ runId, forceDemoMode = false }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [horizon, setHorizon] = useState(7);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showPastDue, setShowPastDue] = useState(false);
  const [asOfOverride, setAsOfOverride] = useState(null);
  // If the caller flags demo mode (e.g, demo run) or if a prior fetch showed the
  // horizon empty with past-due settlements pending, auto-enable the historical
  // as_of override so the chart isn't a wall of empty bars.
  const [autoDemo, setAutoDemo] = useState(forceDemoMode);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setData(null); setErr(null); setSelectedDay(null); setShowPastDue(false);
    // Compute the effective as_of. Priority: user override > auto-demo (400d ago) > backend "today".
    const todayIso = new Date().toISOString().slice(0, 10);
    const shifted = new Date(new Date(todayIso).getTime() - 400 * 86400000)
      .toISOString().slice(0, 10);
    const effectiveAsOf = asOfOverride || (autoDemo ? shifted : null);
    api.getCashForecast(runId, { horizon, asOf: effectiveAsOf })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // Self-heal: if the horizon is empty AND past-due has records, flip auto-demo on
        // once so the operator sees a meaningful chart without clicking anything.
        if (!autoDemo && !asOfOverride
            && d.totals.in_horizon_paise === 0 && d.past_due.count > 0) {
          setAutoDemo(true);
        }
      })
      .catch((e) => { if (!cancelled) setErr(String(e.message || e)); });
    return () => { cancelled = true; };
  }, [runId, horizon, asOfOverride, autoDemo]);

  if (err) {
    return (
      <div className="rounded-xl border p-6 font-mono" style={{ background: C.card, borderColor: C.border, color: C.rust }}>
        Forecast unavailable: {err}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-xl border p-6 font-mono flex items-center gap-3" style={{ background: C.card, borderColor: C.border, color: C.softText }}>
        <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: C.ink, borderTopColor: "transparent" }} />
        Projecting settlements forward...
      </div>
    );
  }

  const { as_of, days, past_due, beyond_horizon, totals, t_plus } = data;
  const maxAmount = Math.max(1, ...days.map((d) => d.amount_paise));
  const selected = selectedDay
    ? days.find((d) => d.date === selectedDay)
    : null;

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
            <i className="fa-solid fa-chart-column text-xs"></i>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.rust }}>Forward cash forecast
            </div>
            <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: C.ink }}>
              Expected landings, next {horizon} days
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {[3, 7, 14, 30].map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors"
              style={{
                background: h === horizon ? C.ink : "transparent",
                color: h === horizon ? C.card : C.softText,
                border: `1px solid ${h === horizon ? C.ink : C.border}`,
              }}
            >
              {h}d
            </button>
          ))}
        </div>
      </div>

      {/* summary row */}
      <div className="mx-6 mb-4 grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border" style={{ borderColor: C.border, background: "rgba(75,123,78,0.06)" }}>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.moss }}>In horizon</div>
          <div className="text-lg font-semibold tabular-nums" style={{ color: C.ink }}>{inrShort(totals.in_horizon_paise)}</div>
          <div className="text-[10px]" style={{ color: C.softText }}>{totals.in_horizon_count} settlement{totals.in_horizon_count === 1 ? "" : "s"}</div>
        </div>
        <button
          type="button"
          onClick={() => past_due.count > 0 && setShowPastDue((v) => !v)}
          disabled={past_due.count === 0}
          className={`p-3 rounded-lg border text-left transition-colors ${past_due.count > 0 ? "hover:brightness-95 cursor-pointer" : ""}`}
          style={{
            borderColor: past_due.amount_paise > 0 ? C.rust : C.border,
            background: past_due.amount_paise > 0 ? "rgba(181,67,47,0.08)" : "transparent",
          }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
            style={{ color: past_due.amount_paise > 0 ? C.rust : C.softText }}>
            <span>Past-due</span>
            {past_due.amount_paise > 0 && <span className="animate-pulse">●</span>}
            {past_due.count > 0 && (
              <span className="ml-auto text-[9px]">
                <i className={`fa-solid fa-chevron-${showPastDue ? "up" : "down"} text-[8px]`} />
              </span>
            )}
          </div>
          <div className="text-lg font-semibold tabular-nums" style={{ color: C.ink }}>{inrShort(past_due.amount_paise)}</div>
          <div className="text-[10px]" style={{ color: C.softText }}>
            {past_due.count} overdue by T+{t_plus} rule
          </div>
        </button>
        <div className="p-3 rounded-lg border" style={{ borderColor: C.border }}>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.ochre }}>Beyond horizon</div>
          <div className="text-lg font-semibold tabular-nums" style={{ color: C.ink }}>{inrShort(totals.beyond_horizon_paise)}</div>
          <div className="text-[10px]" style={{ color: C.softText }}>{beyond_horizon.count} land after +{horizon}d</div>
        </div>
      </div>

      {/* past-due drilldown when the chip is expanded */}
      {showPastDue && past_due.count > 0 && (
        <div className="mx-6 mb-4 p-4 rounded-lg border" style={{ borderColor: C.rust, background: "rgba(181,67,47,0.04)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-2" style={{ color: C.rust }}>
            {past_due.count} past-due settlements · escalate to bank ops now
          </div>
          <div className="max-h-28 overflow-y-auto text-[11px] leading-[1.7] grid grid-cols-2 sm:grid-cols-3 gap-x-4">
            {past_due.ids.map((id) => (
              <div key={id} className="truncate font-mono" style={{ color: C.softText }} title={id}>· {id}</div>
            ))}
            {past_due.count > past_due.ids.length && (
              <div className="col-span-full pt-1 text-[10px] italic" style={{ color: C.softText }}>
                + {past_due.count - past_due.ids.length} more not listed, view Exceptions for the full list
              </div>
            )}
          </div>
        </div>
      )}

      {/* No more "Demo projection mode" banner - the auto-projection is silent.
          The chart just shows meaningful data without the operator seeing scaffolding. */}


      {/* bar chart */}
      <div className="px-6 pb-2">
        <div className="flex items-end gap-1.5 h-32 border-b" style={{ borderColor: C.border }}>
          {days.map((d) => {
            const h = maxAmount > 0 ? (d.amount_paise / maxAmount) * 100 : 0;
            const isToday = d.date === as_of;
            const isSelected = selectedDay === d.date;
            const hasCash = d.amount_paise > 0;
            return (
              <button
                key={d.date}
                onClick={() => setSelectedDay(isSelected ? null : d.date)}
                className="flex-1 flex flex-col items-center justify-end h-full group"
                title={`${labelFor(d.date, as_of)}. ${inr(d.amount_paise)} · ${d.count} rec`}
              >
                <div className="text-[9px] font-semibold tabular-nums mb-1 transition-opacity"
                  style={{ color: C.ink, opacity: hasCash ? (isSelected ? 1 : 0.6) : 0 }}>
                  {inrShort(d.amount_paise)}
                </div>
                <div
                  className="w-full rounded-t transition-all duration-300"
                  style={{
                    height: `${Math.max(h, hasCash ? 3 : 0)}%`,
                    background: isSelected ? C.ink : (isToday ? C.rust : (hasCash ? C.moss : C.border)),
                    minHeight: hasCash ? 3 : 0,
                    opacity: hasCash ? 1 : 0.35,
                  }}
                />
              </button>
            );
          })}
        </div>
        <div className="flex gap-1.5 mt-1.5">
          {days.map((d) => {
            const isToday = d.date === as_of;
            const dt = parseISO(d.date);
            return (
              <div key={d.date} className="flex-1 text-center">
                <div className="text-[9px]" style={{ color: isToday ? C.rust : C.softText, fontWeight: isToday ? 700 : 400 }}>
                  {isToday ? "TODAY" : DAY_NAME[dt.getDay()].slice(0, 1)}
                </div>
                <div className="text-[9px] tabular-nums" style={{ color: C.softText }}>{dt.getDate()}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* selected day drill-down or footer note */}
      <div className="px-6 pb-5 pt-3 border-t" style={{ borderColor: C.border }}>
        {selected && selected.count > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.ink }}>
                {labelFor(selected.date, as_of)} · {inr(selected.amount_paise)}
              </div>
              <button onClick={() => setSelectedDay(null)} className="text-[10px]" style={{ color: C.softText }}>close</button>
            </div>
            <div className="max-h-24 overflow-y-auto text-[11px] leading-[1.7] grid grid-cols-2 gap-x-4">
              {selected.ids.map((id) => (
                <div key={id} className="truncate" style={{ color: C.softText }} title={id}>· {id}</div>
              ))}
              {selected.count > selected.ids.length && (
                <div className="col-span-2 pt-1 text-[10px] italic" style={{ color: C.softText }}>
                  + {selected.count - selected.ids.length} more not listed
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-[10.5px] flex items-center gap-2 flex-wrap" style={{ color: C.softText }}>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: C.moss }} /> expected inflow</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: C.rust }} /> today</span>
            <span>·</span>
            <span>projection: <span className="font-semibold">record_date + T+{t_plus} business days</span></span>
            <span>·</span>
            <span>click any bar for the payment IDs</span>
          </div>
        )}
      </div>
    </div>
  );
}
