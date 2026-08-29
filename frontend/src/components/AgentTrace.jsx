import React, { useState } from "react";
import { formatINR } from "../api.js";

// Real agent reasoning, rendered as a quiet vertical ledger timeline.
// Each step carries a real latency and the real data it produced. No fake typing, no neon.
const STEP_ICON = { done: "fa-check", caught: "fa-shield-halved", running: "fa-spinner fa-spin", refused: "fa-ban" };

const STEP_STYLE = {
  done:    { color: "var(--rm-moss)",       border: "rgba(75,123,78,0.4)",  bg: "var(--rm-moss-wash)" },
  caught:  { color: "var(--rm-rust-deep)",  border: "rgba(181,67,47,0.35)", bg: "var(--rm-rust-wash)" },
  running: { color: "var(--rm-ink-soft)",   border: "var(--rm-line)",       bg: "var(--rm-card)" },
  refused: { color: "var(--rm-rust-deep)",  border: "rgba(143,51,35,0.4)",  bg: "var(--rm-rust-wash)" },
};

export default function AgentTrace({ trace, label = "Agent trace", figuresOf, getExplainer }) {
  const [openIdx, setOpenIdx] = useState(null);

  return (
    <div>
      <div
        className="rm-label text-[10px] font-semibold mb-4 flex items-center gap-2 pb-2"
        style={{ color: "var(--rm-rust)", borderBottom: "1px solid var(--rm-line-soft)" }}
      >
        <i className="fa-solid fa-diagram-project"></i> {label}
      </div>

      <div className="relative">
        {trace.map((s, i) => {
          const figures = figuresOf ? figuresOf(s) : s.figures;
          const style = STEP_STYLE[s.status] || STEP_STYLE.done;
          const info = getExplainer ? getExplainer(s.title) : null;
          const isOpen = openIdx === i;

          return (
            <div key={i} className="flex items-start gap-3 pb-5 last:pb-0 relative">
              {i < trace.length - 1 && (
                <div
                  className="absolute left-[13px] top-7 bottom-0 w-px"
                  style={{ background: "var(--rm-line)" }}
                ></div>
              )}

              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] flex-shrink-0 z-10 transition-colors duration-200"
                style={{ color: style.color, border: `1px solid ${style.border}`, background: style.bg }}
              >
                <i className={`fa-solid ${STEP_ICON[s.status] || "fa-check"}`}></i>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rm-heading-sm text-sm font-semibold">{s.title}</span>

                  {s.via && (
                    <span
                      className="rm-mono text-[9.5px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide"
                      style={{ background: "var(--rm-card-alt)", color: "var(--rm-ink-soft)", border: "1px solid var(--rm-line)" }}
                    >
                      {s.via}
                    </span>
                  )}

                  {info && (
                    <button
                      type="button"
                      onClick={() => setOpenIdx((cur) => (cur === i ? null : i))}
                      className="inline-flex items-center justify-center rounded-full flex-shrink-0 transition-colors duration-150"
                      style={{
                        width: 15,
                        height: 15,
                        fontSize: 9.5,
                        background: isOpen ? "var(--rm-rust)" : "var(--rm-rust-wash)",
                        color: isOpen ? "#fff" : "var(--rm-rust-deep)",
                        border: "1px solid var(--rm-rust)",
                        lineHeight: 1,
                      }}
                      aria-label={`What does ${s.title} do?`}
                    >
                      ?
                    </button>
                  )}

                  {s.ms != null && (
                    <span className="rm-mono text-[9.5px] ml-auto flex-shrink-0 flex items-center gap-2"
                      style={{ color: "var(--rm-ink-soft)" }}>
                      <span style={{ padding: "1px 6px", borderRadius: 3, background: "rgba(75,123,78,0.08)",
                        border: "1px solid rgba(75,123,78,0.25)", color: "var(--rm-moss)", fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.08em" }}>Verdict</span>
                      {s.ms}ms
                    </span>
                  )}
                </div>

                <div className="rm-body text-xs mt-0.5" style={{ color: "var(--rm-ink-soft)" }}>
                  {s.detail}
                </div>

                {/* per-step sub-chips: real counts / choices the engine made */}
                {Array.isArray(s.substeps) && s.substeps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {s.substeps.map((t, k) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 rm-mono text-[10px]"
                        style={{
                          background: "var(--rm-card)",
                          color: "var(--rm-ink-soft)",
                          border: "1px dashed var(--rm-line)",
                        }}
                      >
                        <span
                          className="inline-block w-1 h-1 rounded-full"
                          style={{ background: s.status === "refused" || s.status === "caught" ? "var(--rm-rust)" : "var(--rm-moss)" }}
                        />
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* collapsible plain-English explainer for this step */}
                {info && isOpen && (
                  <div
                    className="mt-2.5 rounded-lg px-3.5 py-3 flex items-start gap-2.5 animate-[fadeSlideIn_0.2s_ease-out]"
                    style={{ background: "var(--rm-card-alt)", border: "1px solid var(--rm-line)" }}
                  >
                    <i className={`${info.icon || "fa-solid fa-circle-info"} text-xs mt-0.5 flex-shrink-0`} style={{ color: "var(--rm-rust)" }}></i>
                    <p className="rm-body text-xs leading-relaxed" style={{ color: "var(--rm-ink)" }}>
                      {info.plain}
                    </p>
                  </div>
                )}

                {figures && figures.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {figures.map((f, j) => (
                      <span
                        key={j}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1"
                        style={{ background: "var(--rm-card-alt)", border: "1px solid var(--rm-line-soft)" }}
                      >
                        <span className="rm-mono text-[10px]" style={{ color: "var(--rm-ink-soft)" }}>{f.label}</span>
                        <span className="rm-mono text-xs font-semibold" style={{ color: "var(--rm-ink)" }}>
                          {typeof f.value === "number" && !Number.isInteger(f.value) ? formatINR(f.value) : f.value}
                        </span>
                        <i className="fa-solid fa-circle-check text-[10px]" style={{ color: "var(--rm-moss)" }}></i>
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