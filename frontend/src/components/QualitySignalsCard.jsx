import React, { useEffect, useState } from "react";
import * as api from "../api.js";

// Ground-truth-free quality signals for uploaded runs. Precision/Recall/F1 need an
// answer key we do not have, so we compute six proxy signals from the audited decisions
// alone: cross-source coverage, fee-schedule adherence, triage certainty, fuzzy match
// quality, duplicates handled, input integrity. Each carries an A/B/C/D grade.

const C = {
  ink: "#1F2A1A",
  card: "#FBFBF3",
  border: "rgba(31,42,26,0.14)",
  borderStrong: "rgba(31,42,26,0.28)",
  softText: "#5C6752",
  moss: "#4B7B4E",
  rust: "#B5432F",
  ochre: "#B8863B",
};

const GRADE_COLOR = {
  A: { fg: "#2f5b34", bg: "rgba(75,123,78,0.14)", ring: "rgba(75,123,78,0.5)" },
  B: { fg: "#3a5c47", bg: "rgba(75,123,78,0.10)", ring: "rgba(75,123,78,0.4)" },
  C: { fg: "#8f6b1e", bg: "rgba(184,134,59,0.14)", ring: "rgba(184,134,59,0.5)" },
  D: { fg: "#8f3323", bg: "rgba(181,67,47,0.12)", ring: "rgba(181,67,47,0.5)" },
};

export default function QualitySignalsCard({ runId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setData(null); setErr(null);
    api.getQualitySignals(runId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(String(e.message || e)); });
    return () => { cancelled = true; };
  }, [runId]);

  if (err) {
    return (
      <div className="rounded-xl border p-6 font-mono" style={{ background: C.card, borderColor: C.border, color: C.rust }}>
        Quality signals unavailable: {err}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-xl border p-6 font-mono flex items-center gap-3" style={{ background: C.card, borderColor: C.border, color: C.softText }}>
        <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: C.ink, borderTopColor: "transparent" }} />
        Computing quality signals...
      </div>
    );
  }

  const { signals, composite } = data;
  const cGrade = GRADE_COLOR[composite.grade] || GRADE_COLOR.C;

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
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: C.ink, color: C.card }}>
            <i className="fa-solid fa-shield-halved text-xs"></i>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.rust }}>
              — Batch quality signals
            </div>
            <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: C.ink }}>
              How trustworthy is this run?
            </h2>
          </div>
        </div>
        <div
          className="flex items-center gap-3 px-4 py-2 rounded-lg"
          style={{ background: cGrade.bg, border: `1px solid ${cGrade.ring}` }}
        >
          <div className="text-3xl font-bold leading-none" style={{ color: cGrade.fg }}>{composite.grade}</div>
          <div className="text-left">
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: cGrade.fg }}>Composite</div>
            <div className="text-sm font-semibold tabular-nums" style={{ color: C.ink }}>{composite.score_pct.toFixed(1)}%</div>
          </div>
        </div>
      </div>

      <p className="px-6 text-[11px] leading-relaxed pb-3" style={{ color: C.softText }}>
        No ground-truth answer key exists for uploaded data — so instead of a fake F1, ReconMint
        publishes six proxy signals a controller can trust immediately. Each is derived from the
        audited decisions alone. <span className="italic">Not precision/recall.</span>
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-6 pb-6">
        {signals.map((s) => {
          const g = GRADE_COLOR[s.grade] || GRADE_COLOR.C;
          return (
            <div key={s.key} className="rounded-lg border p-3.5" style={{ background: C.card, borderColor: C.border }}>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded text-[11px] font-bold"
                  style={{ background: g.bg, color: g.fg, border: `1px solid ${g.ring}` }}
                >
                  {s.grade}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.ink }}>
                  {s.label}
                </span>
                {s.value_pct != null && (
                  <span className="ml-auto text-[13px] font-semibold tabular-nums" style={{ color: C.ink }}>
                    {s.value_pct.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="text-[11px] mt-1" style={{ color: C.softText }}>{s.detail}</div>
              <div className="text-[10px] mt-2 italic" style={{ color: C.softText }}>{s.why}</div>
            </div>
          );
        })}
      </div>

      <div className="px-6 pb-5 -mt-2">
        <div className="text-[10px] p-3 rounded border-l-2" style={{
          borderColor: cGrade.ring,
          background: "rgba(31,42,26,0.03)",
          color: C.softText,
        }}>
          {composite.note}
        </div>
      </div>
    </div>
  );
}
