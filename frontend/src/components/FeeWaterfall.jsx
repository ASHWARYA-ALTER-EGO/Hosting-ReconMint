import React from "react";
import { formatINR } from "../api.js";

// Per-exception fee bridge: gross -> (-MDR -GST -TCS -refund) -> expected net, with the bank net
// and variance called out. Dependency-free SVG, matches the app's slate/white aesthetic.
export default function FeeWaterfall({ ledger }) {
  if (!ledger) return null;
  const gross = ledger.gross || 0;
  const deductions = [
    { label: "MDR", value: ledger.mdr || 0, color: "#f59e0b" },
    { label: "GST", value: ledger.gst || 0, color: "#f97316" },
    { label: "TCS", value: ledger.tcs || 0, color: "#fb923c" },
    { label: "Refund", value: ledger.refund || 0, color: "#a78bfa" },
    { label: "Chargeback", value: ledger.chargeback || 0, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  const W = 440, H = 180, padL = 8, padR = 8, padTop = 22, padBot = 34;
  const barW = 40, gap = (W - padL - padR - barW) / (deductions.length + 1);
  const scale = (H - padTop - padBot) / (gross || 1);

  // build bridge steps
  const steps = [];
  steps.push({ label: "Gross", top: gross, bottom: 0, color: "#334155", value: gross, kind: "total" });
  let running = gross;
  for (const d of deductions) {
    const top = running;
    running -= d.value;
    steps.push({ label: d.label, top, bottom: running, color: d.color, value: -d.value, kind: "sub" });
  }
  steps.push({ label: "Net", top: ledger.expectedNet || running, bottom: 0, color: "#10b981", value: ledger.expectedNet || running, kind: "total" });

  const y = (v) => padTop + (gross - v) * scale;

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Fee bridge (gross → net)</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
        {steps.map((s, i) => {
          const x = padL + i * gap;
          const yTop = y(s.top), yBot = y(s.bottom);
          const h = Math.max(2, yBot - yTop);
          const nextX = padL + (i + 1) * gap;
          return (
            <g key={i}>
              <rect x={x} y={yTop} width={barW} height={h} rx="3" fill={s.color} opacity={s.kind === "total" ? 1 : 0.85} />
              <text x={x + barW / 2} y={yTop - 5} textAnchor="middle" fontSize="9" fontWeight="600" fill="#334155">
                {s.kind === "sub" ? `-${formatINR(Math.abs(s.value)).replace("₹", "₹")}` : formatINR(s.value)}
              </text>
              <text x={x + barW / 2} y={H - 20} textAnchor="middle" fontSize="9" fill="#64748b">{s.label}</text>
              {i < steps.length - 1 && (
                <line x1={x + barW} y1={s.kind === "total" ? yTop : yBot} x2={nextX}
                  y2={y(steps[i + 1].top)} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-100 text-xs">
        <span className="text-slate-500">Bank net <span className="font-mono font-semibold text-slate-800">{formatINR(ledger.actualNet || 0)}</span></span>
        <span className={`px-2.5 py-1 rounded-full font-bold border ${ledger.variance ? "bg-red-50 text-red-600 border-red-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"}`}>
          Variance {ledger.variance < 0 ? "-" : ""}{formatINR(Math.abs(ledger.variance || 0))}
        </span>
      </div>
    </div>
  );
}
