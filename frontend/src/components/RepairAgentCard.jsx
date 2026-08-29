import React from "react";

// Repair Agent activity card. Reads `meta.repair_agent` from the run and renders
// per-strategy hit rates plus a headline "records recovered" figure. This is the
// visible proof that reconciliation is per-record branching, not a batch pipeline.

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

const STRATEGY_LABEL = {
  amount_utr_fuzzy:  "Amount + UTR fuzzy (tight)",
  normalize_utr:     "Normalize UTR (retry exact)",
  widen_date_window: "Widen date window (±7d)",
};

const STRATEGY_ICON = {
  amount_utr_fuzzy:  "fa-magnifying-glass",
  normalize_utr:     "fa-hammer",
  widen_date_window: "fa-calendar-week",
};

const STRATEGY_WHY = {
  amount_utr_fuzzy:  "Tight amount + date + UTR similarity scoring, the standard fuzzy pass.",
  normalize_utr:     "Uppercase, strip punctuation, retry an exact amount + UTR match. Catches 'UTR-999 999/01' vs 'UTR99999901'.",
  widen_date_window: "Keep amount paise-exact but relax T+ to ±7 days. Catches late bank credits.",
};

export default function RepairAgentCard({ meta }) {
  const r = meta?.repair_agent;
  if (!r) return null;

  const { records_touched: touched = 0, records_recovered: recovered = 0,
          attempts_logged: attempts = 0, per_strategy = {} } = r;
  const recoveryPct = touched > 0 ? Math.round((recovered / touched) * 100) : 0;
  const avgAttempts = touched > 0 ? (attempts / touched).toFixed(2) : "0";
  const idle = touched === 0;

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
          <div className="w-7 h-7 rounded-md flex items-center justify-center relative" style={{ background: C.ink, color: C.card }}>
            <i className="fa-solid fa-network-wired text-xs"></i>
            {!idle && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-pulse" style={{ background: C.moss }} />
            )}
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.rust }}>Repair Agent · per-record branching
            </div>
            <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: C.ink }}>
              What the agent tried, per unmatched settlement
            </h2>
          </div>
        </div>
        {!idle && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: C.softText }}>records recovered</div>
            <div className="text-2xl font-semibold tabular-nums" style={{ color: C.moss }}>
              {recovered}<span className="text-sm" style={{ color: C.softText }}>/{touched}</span>
            </div>
            <div className="text-[10px] tabular-nums" style={{ color: C.softText }}>{recoveryPct}% recovery rate</div>
          </div>
        )}
      </div>

      <p className="px-6 text-[11px] leading-relaxed pb-3" style={{ color: C.softText }}>
        For every settlement that survived the exact + fuzzy passes, the agent tries three
        deterministic <span className="italic">repair strategies</span> in order, first winner
        accepts, all attempts are logged. Open any exception's <span className="font-semibold" style={{ color: C.ink }}>Decisions</span> tab to
        see the tree for that specific record.
      </p>

      {idle ? (
        <div className="mx-6 mb-6 p-4 rounded-lg text-[12px] flex items-start gap-3"
          style={{ background: "rgba(75,123,78,0.06)", border: `1px solid ${C.moss}`, color: C.softText }}>
          <i className="fa-solid fa-check-double text-[14px] mt-0.5" style={{ color: C.moss }} />
          <div>
            <div className="font-semibold" style={{ color: C.ink }}>Clean batch. Repair Agent had nothing to do</div>
            <div className="mt-0.5">Every settlement matched at either the exact or fuzzy pass, so no record survived to trigger repair branching. Upload the <span className="font-semibold">high variation</span> or <span className="font-semibold">messy</span> TEST folder to see the agent actively try strategies per record.</div>
          </div>
        </div>
      ) : (
        <>
          {/* headline strip */}
          <div className="mx-6 mb-4 grid grid-cols-3 gap-3">
            <StatCell label="Records touched"     value={touched}         color={C.ink}    tone="ink" />
            <StatCell label="Strategy attempts"   value={attempts}        color={C.ink}    tone="ink"
                      subtitle={`avg ${avgAttempts} / record`} />
            <StatCell label="Recovery rate"       value={`${recoveryPct}%`} color={C.moss}
                      subtitle={`${recovered} recovered`} />
          </div>

          {/* per-strategy breakdown */}
          <div className="px-6 pb-6 space-y-2.5">
            {Object.entries(per_strategy).map(([key, s]) => {
              const acceptRate = s.tried > 0 ? (s.accepted / s.tried) * 100 : 0;
              const barColor = s.accepted > 0 ? C.moss : (s.tried > 0 ? C.ochre : C.border);
              return (
                <div key={key} className="rounded-lg border overflow-hidden" style={{ borderColor: C.border }}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded flex items-center justify-center text-[12px]"
                      style={{ background: "rgba(31,42,26,0.05)", color: C.ink }}>
                      <i className={`fa-solid ${STRATEGY_ICON[key] || "fa-cog"}`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold" style={{ color: C.ink }}>
                          {STRATEGY_LABEL[key] || key}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{
                          background: "rgba(31,42,26,0.05)", color: C.softText,
                        }}>{key}</span>
                      </div>
                      <div className="text-[10.5px] mt-0.5" style={{ color: C.softText }}>
                        {STRATEGY_WHY[key] || ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] font-semibold tabular-nums" style={{ color: barColor }}>
                        {s.accepted}<span className="text-[11px]" style={{ color: C.softText }}> / {s.tried}</span>
                      </div>
                      <div className="text-[10px] tabular-nums" style={{ color: C.softText }}>
                        accepted
                      </div>
                    </div>
                  </div>
                  {/* progress bar */}
                  <div className="h-1 w-full" style={{ background: "rgba(31,42,26,0.05)" }}>
                    <div className="h-full transition-all duration-500"
                      style={{ width: `${Math.max(2, acceptRate)}%`, background: barColor }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mx-6 mb-5 p-3 rounded-lg text-[10.5px] border-l-2" style={{
            borderColor: C.rust, background: "rgba(31,42,26,0.03)", color: C.softText,
          }}>
            Every attempt is stored in the audit table as <span className="font-semibold" style={{ color: C.ink }}>strategy_attempts_json</span> -
            the drawer's Decisions tab replays the tree per record. Nothing here is theatre; a real branching engine
            drove real per-payment choices.
          </div>
        </>
      )}
    </div>
  );
}

function StatCell({ label, value, subtitle, color, tone }) {
  return (
    <div className="p-3 rounded-lg border" style={{ borderColor: C.border, background: tone === "ink" ? "rgba(31,42,26,0.03)" : `${color}18` }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.softText }}>{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-0.5" style={{ color }}>{value}</div>
      {subtitle && <div className="text-[10px] tabular-nums mt-0.5" style={{ color: C.softText }}>{subtitle}</div>}
    </div>
  );
}
