import React from "react";
import { formatINR } from "../api.js";

// Real agent reasoning, rendered as a quiet vertical timeline (reuses the reconcile-stepper grammar).
// Each step carries a real latency and the real data it produced. No fake typing, no neon.
const STEP_ICON = { done: "fa-check", caught: "fa-shield-halved", running: "fa-spinner fa-spin", refused: "fa-ban" };
const STEP_COLOR = {
  done: "text-emerald-500 border-emerald-200 bg-emerald-50",
  caught: "text-amber-600 border-amber-200 bg-amber-50",
  running: "text-slate-500 border-slate-300 bg-white",
  refused: "text-red-500 border-red-200 bg-red-50",
};

export default function AgentTrace({ trace, label = "Agent trace", figuresOf }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <i className="fa-solid fa-diagram-project"></i> {label}
      </div>
      <div className="relative">
        {trace.map((s, i) => {
          const figures = figuresOf ? figuresOf(s) : s.figures;
          return (
            <div key={i} className="flex items-start gap-3 pb-4 last:pb-0 relative">
              {i < trace.length - 1 && <div className="absolute left-[13px] top-7 bottom-0 w-px bg-slate-200"></div>}
              <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-[11px] flex-shrink-0 z-10 ${STEP_COLOR[s.status] || STEP_COLOR.done}`}>
                <i className={`fa-solid ${STEP_ICON[s.status] || "fa-check"}`}></i>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{s.title}</span>
                  {s.via && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium uppercase tracking-wide">{s.via}</span>}
                  {s.ms != null && <span className="text-[10px] text-slate-400 font-mono ml-auto">{s.ms}ms</span>}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{s.detail}</div>
                {figures && figures.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {figures.map((f, j) => (
                      <span key={j} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-md px-2 py-1">
                        <span className="text-[10px] text-slate-500">{f.label}</span>
                        <span className="text-xs font-mono font-semibold text-slate-800">
                          {typeof f.value === "number" && !Number.isInteger(f.value) ? formatINR(f.value) : f.value}
                        </span>
                        <i className="fa-solid fa-circle-check text-emerald-500 text-[10px]"></i>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
