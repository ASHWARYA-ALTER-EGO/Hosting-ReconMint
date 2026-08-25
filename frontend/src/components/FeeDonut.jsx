import React from "react";
import { formatINR } from "../api.js";

// Batch fee-composition donut: where the money went (MDR / GST / TCS / refunds). Dependency-free SVG.
export default function FeeDonut({ fees }) {
  const paise = (k) => (fees && fees[k]) || 0;
  const segments = [
    { label: "MDR", value: paise("mdr"), color: "#f59e0b" },
    { label: "GST on MDR", value: paise("gst"), color: "#f97316" },
    { label: "TCS", value: paise("tcs"), color: "#fb923c" },
    { label: "Refunds", value: paise("refund"), color: "#a78bfa" },
  ].filter((s) => s.value > 0);

  const total = segments.reduce((a, s) => a + s.value, 0);
  const R = 52, C = 2 * Math.PI * R, cx = 70, cy = 70, sw = 20;
  let offset = 0;

  return (
    <div className="bg-white rounded-xl p-6 border border-slate-200 custom-shadow">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">Fee Composition</h2>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">where the money went</span>
      </div>
      {total === 0 ? (
        <div className="text-sm text-slate-400 py-8 text-center">No fee data for this run.</div>
      ) : (
        <div className="flex items-center gap-6">
          <svg viewBox="0 0 140 140" width="140" height="140" className="flex-shrink-0 -rotate-90">
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f1f5f9" strokeWidth={sw} />
            {segments.map((s, i) => {
              const frac = s.value / total;
              const dash = `${frac * C} ${C - frac * C}`;
              const el = (
                <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={s.color} strokeWidth={sw}
                  strokeDasharray={dash} strokeDashoffset={-offset * C} />
              );
              offset += frac;
              return el;
            })}
          </svg>
          <div className="flex-1 space-y-2">
            <div className="text-xs text-slate-400 uppercase tracking-wider">Total fees</div>
            <div className="text-2xl font-bold text-slate-800 tracking-tight mb-2">{formatINR(total / 100)}</div>
            {segments.map((s) => (
              <div key={s.label} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }}></span>{s.label}
                </span>
                <span className="font-mono font-medium text-slate-800">{formatINR(s.value / 100)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
