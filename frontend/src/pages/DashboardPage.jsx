import React, { useEffect, useRef, useState } from "react";
import { formatINR } from "../api.js";
import * as api from "../api.js";
import FeeDonut from "../components/FeeDonut.jsx";
import SourceFilesCard from "../components/SourceFilesCard.jsx";
import { openReport } from "../report.js";

/* ————————————————————————————————————————————————
   RECONMINT PALETTE
   ink     #1F2A1A   text / primary fill
   red     #B5432F   brand accent / negative / stamp
   moss    #4B7B4E   positive / matched
   ochre   #B8863B   warning / fee anomaly
   plum    #6E5A8C   ghost / anomalous
   sage-50 #F3F6ED   page background
   sage-100#E7EEDD   borders / hover fill
   sage-200#D9E3C8   stronger borders
   cream   #FBFBF3   card surface
   ink-60  #6B7660   secondary text
   ink-40  #8A9478   tertiary text / labels
   ———————————————————————————————————————————————— */
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const PRESS = "transition-transform duration-150 active:scale-[0.97] touch-manipulation";

const C = {
  ink: "#1F2A1A",
  red: "#B5432F",
  moss: "#4B7B4E",
  ochre: "#B8863B",
  plum: "#6E5A8C",
  bg: "#F3F6ED",
  border: "#E7EEDD",
  borderStrong: "#D9E3C8",
  card: "#FBFBF3",
  t60: "#6B7660",
  t40: "#8A9478",
};

/**
 * PremiumCard — ledger-sheet hover treatment: a soft ink/red spotlight that
 * tracks the cursor, a lift, a sharpened shadow, and a punched "hole" corner
 * mark instead of a plain rounded box — nods to the stamp/ledger identity
 * without repeating literal stripes on every surface.
 */
function PremiumCard({ children, className = "", style = {}, as: Tag = "div", punch = false, ...rest }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: 50, y: 0 });
  const [hovered, setHovered] = useState(false);

  const handleMove = (clientX, clientY) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    setPos({ x, y });
  };

  return (
    <Tag
      ref={ref}
      onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={(e) => {
        setHovered(true);
        const t = e.touches[0];
        if (t) handleMove(t.clientX, t.clientY);
      }}
      onTouchEnd={() => setHovered(false)}
      className={`group/card relative rounded-md border overflow-hidden touch-manipulation font-mono ${className}`}
      style={{
        background: C.card,
        borderColor: hovered ? C.ink : C.border,
        transitionProperty: "transform, box-shadow, border-color",
        transitionDuration: "400ms",
        transitionTimingFunction: EASE,
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 18px 36px -16px rgba(31,42,26,0.22), 0 4px 10px -4px rgba(31,42,26,0.10)"
          : "0 1px 2px rgba(31,42,26,0.05)",
        ...style,
      }}
      {...rest}
    >
      {/* cursor-tracking spotlight — ink/red instead of indigo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(360px circle at ${pos.x}% ${pos.y}%, rgba(181,67,47,0.07), transparent 55%)`,
        }}
      />
      {/* top accent line, ink → red, sweeps in on hover */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left transition-transform duration-500"
        style={{
          background: `linear-gradient(90deg, ${C.ink}, ${C.red})`,
          transform: hovered ? "scaleX(1)" : "scaleX(0)",
          transitionTimingFunction: EASE,
        }}
      />
      {/* punched corner hole — ledger motif, used sparingly */}
      {punch && (
        <span
          aria-hidden="true"
          className="absolute top-3 right-3 w-2 h-2 rounded-full"
          style={{ border: `1px solid ${C.borderStrong}` }}
        />
      )}
      <div className="relative">{children}</div>
    </Tag>
  );
}

function useCountUp(target, { duration = 700, decimals = 0 } = {}) {
  const [value, setValue] = useState(0);
  const raf = useRef();
  useEffect(() => {
    const start = performance.now();
    const to = Number.isFinite(target) ? target : 0;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(to);
      return;
    }
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(to * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return decimals > 0 ? value.toFixed(decimals) : Math.round(value);
}

function useReveal(delayMs = 0) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2";
}

/**
 * One-time, non-nagging hint system.
 */
function useOneTimeHint(key) {
  const [dismissed, setDismissed] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored = false;
    try {
      stored = localStorage.getItem(key) === "1";
    } catch {
      /* localStorage unavailable */
    }
    setDismissed(stored);
    setReady(true);
  }, [key]);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* best-effort persistence only */
    }
  };

  return { dismissed, ready, dismiss };
}

function InfoHint({ hintKey, message, className = "" }) {
  const { dismissed, ready, dismiss } = useOneTimeHint(hintKey);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || dismissed) return;
    const t = setTimeout(() => setOpen(true), 1000);
    return () => clearTimeout(t);
  }, [ready, dismissed]);

  if (!ready || dismissed) return null;

  return (
    <div className={`relative inline-flex font-mono ${className}`}>
      <button
        type="button"
        aria-label="Show hint"
        onClick={() => setOpen((v) => !v)}
        className="relative w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-150 focus-visible:outline-none"
        style={{ color: C.t40 }}
      >
        {!open && (
          <span className="absolute inset-0 rounded-full dash-pulse-ring" style={{ boxShadow: `0 0 0 2px rgba(181,67,47,0.5)` }} aria-hidden="true" />
        )}
        <i className="fa-solid fa-circle-info text-[13px] relative"></i>
      </button>

      <div
        className="absolute left-1/2 -translate-x-1/2 top-full mt-3 z-40 w-64 transition-all duration-200"
        style={{
          opacity: open ? 1 : 0,
          transform: `translate(-50%, ${open ? "0px" : "-4px"})`,
          pointerEvents: open ? "auto" : "none",
          transitionTimingFunction: EASE,
        }}
      >
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 border-l border-t rotate-45" style={{ background: C.card, borderColor: C.border }} />
        <div className="relative rounded-md border p-3.5" style={{ background: C.card, borderColor: C.border, boxShadow: "0 12px 28px -12px rgba(31,42,26,0.25)" }}>
          <button
            type="button"
            aria-label="Dismiss hint"
            onClick={dismiss}
            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-150"
            style={{ color: C.t40 }}
          >
            <i className="fa-solid fa-xmark text-[11px]"></i>
          </button>
          <p className="text-xs leading-relaxed pr-4" style={{ color: C.t60 }}>{message}</p>
          <button
            type="button"
            onClick={dismiss}
            className={`mt-2.5 w-full text-center text-xs font-semibold rounded py-1.5 ${PRESS}`}
            style={{ background: C.ink, color: C.card, transitionTimingFunction: EASE, transitionProperty: "transform, background-color" }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onGoUpload }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 font-mono" style={{ color: C.t40 }}>
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-full blur-2xl scale-125 dash-float" style={{ background: "rgba(181,67,47,0.12)" }} />
        <i className="fa-solid fa-table-columns text-5xl relative dash-float" style={{ color: "#C3CFAE" }}></i>
      </div>
      <p className="text-lg font-semibold mb-1.5" style={{ color: C.ink }}>No reconciliation run yet</p>
      <p className="text-sm mb-7 max-w-xs">Run a reconciliation to see the overview, accuracy, and breakdown here.</p>
      <button
        onClick={onGoUpload}
        className={`px-7 py-3 rounded-md text-sm font-semibold min-h-[44px] ${PRESS}`}
        style={{ background: C.ink, color: C.card, boxShadow: "0 12px 24px -10px rgba(31,42,26,0.35)", transitionTimingFunction: EASE, transitionProperty: "transform, box-shadow" }}
      >
        Go to Upload
      </button>
    </div>
  );
}

function MetricCard({ title, subtitle, value, footnote, tone, numeric, decimals = 0, delay = 0 }) {
  const animated = numeric !== undefined ? useCountUp(numeric, { decimals }) : null;
  const reveal = useReveal(delay);
  return (
    <PremiumCard
      className={`p-5 flex flex-col justify-between active:scale-[0.985] ${reveal}`}
      style={{ transitionProperty: "opacity, transform, box-shadow, border-color" }}
    >
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: C.t40 }}>
          {title} {subtitle && <span className="normal-case font-normal" style={{ color: C.t40 }}>{subtitle}</span>}
        </h3>
        <div className="text-3xl font-bold tracking-tight tabular-nums" style={{ color: C.ink }}>
          {numeric !== undefined ? (decimals > 0 ? animated : `${animated}${typeof value === "string" ? value.replace(/[\d.,-]/g, "") : ""}`) : value}
        </div>
      </div>
      {footnote && (
        <div className="mt-4 text-xs" style={{ color: tone === "negative" ? C.red : C.t60, fontWeight: tone === "negative" ? 600 : 400 }}>
          {footnote}
        </div>
      )}
    </PremiumCard>
  );
}

function AccuracyCard({ acc, onFirstInteract }) {
  const pct = (n) => `${Math.round(n * 100)}%`;
  const stats = [
    ["Precision", pct(acc.precision), acc.precision],
    ["Recall", pct(acc.recall), acc.recall],
    ["F1", acc.f1.toFixed(2), acc.f1],
  ];
  return (
    <PremiumCard className="p-6">
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.ink }}>Detection Accuracy</h2>
        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border" style={{ color: C.t40, background: C.bg, borderColor: C.border }}>vs ground truth</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {stats.map(([k, v, raw]) => (
          <div
            key={k}
            onMouseEnter={onFirstInteract}
            onTouchStart={onFirstInteract}
            className="text-center rounded-md py-3 transition-colors duration-200 touch-manipulation cursor-default"
            style={{ background: "transparent" }}
            onMouseOver={(e) => (e.currentTarget.style.background = C.bg)}
            onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div className="text-2xl font-bold tabular-nums" style={{ color: C.ink }}>{v}</div>
            <div className="text-xs mt-1 mb-2" style={{ color: C.t60 }}>{k}</div>
            <div className="h-1 mx-4 rounded-full overflow-hidden" style={{ background: C.border }}>
              <div className="h-full rounded-full dash-grow" style={{ background: C.moss, "--target-w": `${Math.min(100, Math.max(0, raw * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs rounded-md p-3 border" style={{ background: C.bg, borderColor: C.border }}>
        <span style={{ color: C.t60 }}><span className="font-semibold" style={{ color: C.moss }}>{acc.false_negatives}</span> missed (false negatives)</span>
        <span style={{ color: C.t60 }}><span className="font-semibold" style={{ color: C.ochre }}>{acc.false_positives}</span> over-flagged (false positives)</span>
      </div>
    </PremiumCard>
  );
}

/* Plain-language meaning for each breakdown bucket — shown on hover/tap. */
const SEGMENT_EXPLANATIONS = {
  "Auto Matched (Exact)": "Matched automatically because every key field agreed exactly across both ledgers. No review needed.",
  "Fuzzy Matched (AI)": "No exact match existed, so the AI matcher paired these on high-confidence similarity (amount, narration, timing).",
  "Fee Anomaly": "Matched, but the fee charged doesn't line up with the expected fee schedule — worth a second look.",
  "Unresolved": "No confident match on either side. These need manual review in the exceptions queue.",
  Duplicates: "Duplicate entries detected in the source data and excluded before matching.",
  "Ghost Credits": "Credits that appear on the bank statement with no corresponding source record — flagged for investigation.",
  Reconciled: "Successfully matched between the source ledger and the bank statement.",
  Exceptions: "Couldn't be confidently matched — routed to the exceptions queue for manual review.",
};

const SEGMENT_COLORS = {
  "Auto Matched (Exact)": C.moss,
  "Fuzzy Matched (AI)": "#7DA271",
  "Fee Anomaly": C.ochre,
  "Unresolved": C.red,
  Duplicates: "#C97361",
  "Ghost Credits": C.plum,
  Reconciled: C.moss,
  Exceptions: C.red,
};

function StackedBreakdown({ segments, total, onFirstInteract }) {
  const [active, setActive] = useState(null);
  const activeSeg = segments.find((s) => s.label === active);

  const activate = (label) => {
    setActive(label);
    onFirstInteract?.();
  };

  return (
    <PremiumCard className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.ink }}>Reconciliation Breakdown</h2>
      </div>

      <div className="h-6 w-full flex rounded-full overflow-hidden mb-4" style={{ boxShadow: `0 0 0 1px ${C.border}` }}>
        {segments.map((s) => (
          <div
            key={s.label}
            className="transition-[opacity,filter] duration-200 cursor-pointer touch-manipulation"
            style={{
              width: `${(s.count / total) * 100}%`,
              background: s.hex,
              opacity: active && active !== s.label ? 0.35 : 1,
              filter: active === s.label ? "brightness(1.1)" : "none",
            }}
            onMouseEnter={() => activate(s.label)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => activate(s.label)}
            onBlur={() => setActive(null)}
            onTouchStart={() => activate(active === s.label ? null : s.label)}
            tabIndex={0}
            role="button"
            aria-label={`${s.label}: ${s.count} records`}
          ></div>
        ))}
      </div>

      {/* Explain-on-hover panel — receipt-style dashed border instead of solid */}
      <div
        className="grid transition-[grid-template-rows] duration-300 mb-2"
        style={{ gridTemplateRows: activeSeg ? "1fr" : "0fr", transitionTimingFunction: EASE }}
      >
        <div className="overflow-hidden">
          <div
            className="flex items-start gap-2.5 rounded-md p-3 mb-4 text-xs leading-relaxed"
            style={{
              border: activeSeg ? `1px dashed ${C.borderStrong}` : "1px dashed transparent",
              background: activeSeg ? C.bg : "transparent",
            }}
          >
            <span className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0" style={{ background: activeSeg?.hex }}></span>
            <div>
              <span className="font-semibold" style={{ color: C.ink }}>{activeSeg?.label}</span>{" "}
              <span style={{ color: C.t60 }}>— {activeSeg && (SEGMENT_EXPLANATIONS[activeSeg.label] || "Part of this run's reconciliation breakdown.")}</span>
            </div>
          </div>
        </div>
      </div>

      <table className="w-full text-sm">
        <tbody>
          {segments.map((s) => (
            <tr
              key={s.label}
              className="border-b rounded-md transition-colors duration-150 touch-manipulation cursor-pointer"
              style={{ borderColor: C.bg, background: active === s.label ? C.bg : "transparent" }}
              onMouseEnter={() => activate(s.label)}
              onMouseLeave={() => setActive(null)}
              onTouchStart={() => activate(active === s.label ? null : s.label)}
            >
              <td className="py-3.5 flex items-center gap-2 pl-2 rounded-l-md">
                <span className="w-2.5 h-2.5 rounded-full block" style={{ background: s.hex }}></span>
                <span style={{ color: C.t60 }}>{s.label}</span>
              </td>
              <td className="py-3.5 text-right font-medium tabular-nums" style={{ color: C.ink }}>{s.count}</td>
              <td className="py-3.5 text-right w-20 pr-2 rounded-r-md tabular-nums" style={{ color: C.t60 }}>{((s.count / total) * 100).toFixed(2)}%</td>
            </tr>
          ))}
          <tr>
            <td className="py-3 font-medium pl-2" style={{ color: C.ink }}>Total</td>
            <td className="py-3 text-right font-bold tabular-nums" style={{ color: C.ink }}>{total}</td>
            <td className="py-3 text-right font-medium w-20 pr-2 tabular-nums" style={{ color: C.ink }}>100.00%</td>
          </tr>
        </tbody>
      </table>
    </PremiumCard>
  );
}

function buildWaterfall(bd) {
  const total = bd.total;
  const scale = 170 / total;
  const steps = [];
  const push = (label, value, hex, height, marginBottom, tooltip, showConnector = true) =>
    steps.push({ label, value, hex, height, marginBottom, tooltip, showConnector });

  push(["Ingested"], `${total}`, "#B7C4A3", total * scale, 0, `Total ingested: ${total}`);
  let running = total;
  running -= bd.duplicates;
  push(["Duplicates"], `-${bd.duplicates}`, "#C97361", Math.max(bd.duplicates * scale, 2), running * scale, `Duplicates removed: ${bd.duplicates}`);
  running -= bd.ghost_credits;
  push(["Ghost", "credits"], `-${bd.ghost_credits}`, C.plum, Math.max(bd.ghost_credits * scale, 2), running * scale, `Ghost bank credits: ${bd.ghost_credits}`);
  push(["Valid", "records"], `${running}`, "#8A9478", running * scale, 0, `Valid records: ${running}`);
  running -= bd.auto_matched;
  push(["Auto", "matched"], `-${bd.auto_matched}`, C.moss, bd.auto_matched * scale, running * scale, `Auto (exact): ${bd.auto_matched}`);
  running -= bd.fuzzy_matched;
  push(["Fuzzy", "matched"], `-${bd.fuzzy_matched}`, "#7DA271", Math.max(bd.fuzzy_matched * scale, 2), running * scale, `Fuzzy (AI): ${bd.fuzzy_matched}`);
  running -= bd.fee_anomaly;
  push(["Fee", "anomaly"], `-${bd.fee_anomaly}`, C.ochre, Math.max(bd.fee_anomaly * scale, 2), running * scale, `Fee anomalies: ${bd.fee_anomaly}`);
  push(["Unresolved"], `${running}`, C.red, Math.max(running * scale, 2), 0, `Unresolved: ${running}`, false);
  return steps;
}

/**
 * Self-contained waterfall bar + tooltip — fully inline, scoped to itself.
 * Bars carry a small dashed "ledger stitch" connector between steps,
 * reinforcing the paper-trail motif without a striped background.
 */
function WaterfallBar({ step, onFirstInteract }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative flex flex-col items-center px-3 shrink-0 font-mono"
      style={{ scrollSnapAlign: "center" }}
      onMouseEnter={() => {
        setHovered(true);
        onFirstInteract?.();
      }}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => {
        setHovered((v) => !v);
        onFirstInteract?.();
      }}
    >
      <div
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 pointer-events-none whitespace-nowrap rounded-md text-[11px] font-medium px-2.5 py-1.5 transition-all duration-200"
        style={{
          background: C.ink,
          color: C.card,
          opacity: hovered ? 1 : 0,
          transform: `translate(-50%, ${hovered ? "0px" : "4px"})`,
          transitionTimingFunction: EASE,
          boxShadow: "0 10px 24px -10px rgba(31,42,26,0.4)",
        }}
      >
        {step.tooltip}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 -mt-1" style={{ background: C.ink }} />
      </div>

      <div className="relative flex items-end" style={{ height: 190 }}>
        <div
          className="w-11 sm:w-12 rounded-t-sm flex items-start justify-center pt-1 transition-transform duration-200 origin-bottom"
          style={{
            height: Math.max(step.height, 2),
            marginBottom: step.marginBottom,
            background: step.hex,
            transform: hovered ? "scaleX(1.12)" : "scaleX(1)",
            transitionTimingFunction: EASE,
            boxShadow: hovered ? "0 8px 18px -8px rgba(31,42,26,0.4)" : "none",
          }}
        >
          <span className="text-[10px] font-semibold tabular-nums" style={{ color: "#FBFBF3" }}>{step.value}</span>
        </div>
        {step.showConnector && (
          <div
            className="absolute border-t border-dashed"
            style={{ left: "100%", width: 12, top: `calc(100% - ${step.height + step.marginBottom}px)`, borderColor: C.borderStrong }}
          />
        )}
      </div>

      <div className="mt-3 text-[10px] text-center font-medium leading-tight" style={{ color: C.t60 }}>
        {step.label.map((w, j) => (
          <React.Fragment key={j}>
            {j > 0 && <br />}
            {w}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function Waterfall({ bd, onFirstInteract }) {
  const steps = buildWaterfall(bd);
  const scrollRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef({ startX: 0, startScroll: 0 });

  const onPointerDown = (e) => {
    if (!scrollRef.current) return;
    setDragging(true);
    dragState.current = { startX: e.clientX, startScroll: scrollRef.current.scrollLeft };
    scrollRef.current.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging || !scrollRef.current) return;
    const dx = e.clientX - dragState.current.startX;
    scrollRef.current.scrollLeft = dragState.current.startScroll - dx;
  };
  const onPointerUp = () => setDragging(false);

  return (
    <PremiumCard className="p-6 flex flex-col">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.ink }}>Record Reconciliation Waterfall</h2>
        <span className="text-[10px] uppercase tracking-wide hidden sm:inline" style={{ color: C.t40 }}>drag / swipe to explore</span>
      </div>
      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className={`flex-1 w-full overflow-x-auto overflow-y-visible pt-8 pb-4 -mx-1 px-1 [scrollbar-width:thin] ${dragging ? "cursor-grabbing select-none" : "cursor-grab"}`}
        style={{ scrollSnapType: "x proximity" }}
      >
        <div className="flex items-end min-w-[560px] w-max mx-auto">
          {steps.map((s, i) => (
            <WaterfallBar key={i} step={s} onFirstInteract={onFirstInteract} />
          ))}
        </div>
      </div>
    </PremiumCard>
  );
}

function FooterStrip({ meta }) {
  const stats = [
    { icon: "fa-solid fa-microchip", bg: "rgba(31,42,26,0.06)", color: C.ink, label: "AI cost (this run)", value: `$${(meta.llm_cost_usd_total || 0).toFixed(4)}` },
    { icon: "fa-solid fa-brain", bg: "rgba(184,134,59,0.12)", color: C.ochre, label: "Model", value: meta.llm_calls ? "gpt-4o-mini" : "not used" },
    { icon: "fa-regular fa-circle-check", bg: "rgba(75,123,78,0.12)", color: C.moss, label: "AI explanations", value: `${meta.llm_verified_count || 0} verified / ${meta.llm_calls || 0} calls` },
  ];
  return (
    <PremiumCard as="footer" className="p-2 flex flex-col sm:flex-row items-stretch sm:items-center">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className="flex items-center gap-3 px-4 py-2.5 flex-1 rounded-md transition-colors duration-150 touch-manipulation"
          style={{ borderLeft: i > 0 ? `1px solid ${C.border}` : "none" }}
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: s.bg, color: s.color }}>
            <i className={s.icon}></i>
          </div>
          <div className="min-w-0">
            <div className="text-xs truncate" style={{ color: C.t40 }}>{s.label}</div>
            <div className="text-sm font-semibold truncate" style={{ color: C.ink }}>{s.value}</div>
          </div>
        </div>
      ))}
    </PremiumCard>
  );
}

function HeaderButton({ onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-md text-sm font-medium font-mono ${PRESS}`}
      style={{
        background: C.card,
        color: C.ink,
        border: `1px solid ${C.borderStrong}`,
        transitionTimingFunction: EASE,
        transitionProperty: "transform, box-shadow, background-color, border-color",
      }}
    >
      <i className={icon} style={{ color: C.t40 }}></i>
      <span>{label}</span>
    </button>
  );
}

export default function DashboardPage({ run, evalData, onExport, onGoUpload, onGoExceptions }) {
  if (!run) return <EmptyState onGoUpload={onGoUpload} />;
  const m = run.meta;
  const amount = formatINR((m.reconciled_amount_paise || 0) / 100);
  const exceptionsPct = m.settlement_active ? ((m.exceptions_total / m.settlement_active) * 100).toFixed(2) : "0";

  const segments = evalData
    ? [
        { label: "Auto Matched (Exact)", hex: SEGMENT_COLORS["Auto Matched (Exact)"], count: evalData.breakdown.auto_matched },
        { label: "Fuzzy Matched (AI)", hex: SEGMENT_COLORS["Fuzzy Matched (AI)"], count: evalData.breakdown.fuzzy_matched },
        { label: "Fee Anomaly", hex: SEGMENT_COLORS["Fee Anomaly"], count: evalData.breakdown.fee_anomaly },
        { label: "Unresolved", hex: SEGMENT_COLORS["Unresolved"], count: evalData.breakdown.unresolved },
        { label: "Duplicates", hex: SEGMENT_COLORS["Duplicates"], count: evalData.breakdown.duplicates },
        { label: "Ghost Credits", hex: SEGMENT_COLORS["Ghost Credits"], count: evalData.breakdown.ghost_credits },
      ]
    : [
        { label: "Reconciled", hex: SEGMENT_COLORS["Reconciled"], count: m.reconciled_total },
        { label: "Exceptions", hex: SEGMENT_COLORS["Exceptions"], count: m.exceptions_total },
      ];
  const bdTotal = evalData ? evalData.breakdown.total : m.reconciled_total + m.exceptions_total;

  const { dismissed: hoverHintDismissed, dismiss: dismissHoverHint } = useOneTimeHint("dash_hover_hint_dismissed_v1");
  const onFirstInteract = hoverHintDismissed ? undefined : dismissHoverHint;

  return (
    <div className="flex flex-col h-full overflow-hidden font-mono relative" style={{ background: C.bg }}>
      <style>{`
        @keyframes dashFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .dash-float { animation: dashFloat 3.2s ease-in-out infinite; }
        @keyframes dashGrow { from { width: 0; } to { width: var(--target-w); } }
        .dash-grow { width: var(--target-w); animation: dashGrow 900ms ${EASE} both; }
        @keyframes dashFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .dash-section { animation: dashFadeUp 500ms ${EASE} both; }
        @keyframes dashPulseRing {
          0% { transform: scale(0.9); opacity: 0.9; }
          70% { transform: scale(1.9); opacity: 0; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        .dash-pulse-ring { animation: dashPulseRing 1.8s ${EASE} infinite; }
        @media (prefers-reduced-motion: reduce) {
          .dash-float, .dash-grow, .dash-section, .dash-pulse-ring { animation: none !important; }
        }
      `}</style>

      {/* faint paper grain instead of stripes — a fixed dot-grid, barely-there */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: "radial-gradient(circle, #D9E3C8 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />

      <header
        className="backdrop-blur-sm border-b px-6 py-4 flex justify-between items-center gap-4 sticky top-0 z-20 relative"
        style={{ background: "rgba(251,251,243,0.92)", borderColor: C.border }}
      >
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-semibold tracking-tight" style={{ color: C.ink }}>
              Reconciliation Overview
            </h1>
            {/* small rotated ledger stamp, echoes the hero mark instead of a gradient wordmark */}
            <span
              className="text-[9px] font-bold uppercase tracking-wide border rounded-full px-2 py-0.5 -rotate-3"
              style={{ color: C.red, borderColor: C.red }}
            >
              Audited
            </span>
            <InfoHint
              hintKey="dash_title_hint_dismissed_v1"
              message="Hover any card, chart segment, or bar to see what it means — accuracy stats, breakdown buckets, and the waterfall all explain themselves."
            />
          </div>
          <div className="flex items-center text-xs mt-1 gap-2 flex-wrap" style={{ color: C.t60 }}>
            {run.isDemo && (
              <>
                <span className="px-2 py-0.5 rounded-sm border" style={{ background: C.bg, borderColor: C.border, color: C.t60 }}>Demo run (synthetic data)</span>
                <span>•</span>
              </>
            )}
            <span>Run ID: {run.runId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <HeaderButton onClick={() => openReport(run, evalData)} icon="fa-solid fa-file-lines" label="Report" />
          <HeaderButton onClick={onExport} icon="fa-solid fa-download" label="Audit export (CSV)" />
          <button
            onClick={onGoExceptions}
            className={`flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-md text-sm font-medium font-mono ${PRESS}`}
            style={{ background: C.ink, color: C.card, transitionTimingFunction: EASE, transitionProperty: "transform, box-shadow, background-color" }}
          >
            <i className="fa-solid fa-circle-exclamation"></i><span>View exceptions</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 relative">
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <MetricCard title="Match Rate" subtitle="(Reconciled)" value={`${m.reconciled_rate_pct}%`} numeric={m.reconciled_rate_pct} footnote={`${m.match_rate_pct}% matched (incl. fuzzy)`} delay={0} />
          <MetricCard title="Records Processed" value={`${m.settlement_active}`} numeric={m.settlement_active} footnote={`${m.dataset_size} rows ingested`} delay={40} />
          <MetricCard title="Processing Time" value={`${m.elapsed_seconds}s`} numeric={m.elapsed_seconds} footnote={`Throughput: ${Math.round(m.throughput_rps).toLocaleString("en-IN")} rec/s`} delay={80} />
          <MetricCard title="Amount Reconciled" value={amount} footnote="net settled, verified" delay={120} />
          <MetricCard title="Exceptions" subtitle="(Needs review)" value={`${m.exceptions_total}`} numeric={m.exceptions_total} footnote={`${exceptionsPct}% of records`} tone="negative" delay={160} />
        </section>

        {evalData && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 dash-section">
            <AccuracyCard acc={evalData.accuracy} onFirstInteract={onFirstInteract} />
            <FooterStrip meta={m} />
          </section>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 dash-section items-start" style={{ animationDelay: "60ms" }}>
          <StackedBreakdown segments={segments} total={bdTotal} onFirstInteract={onFirstInteract} />
          {evalData ? (
            <Waterfall bd={evalData.breakdown} onFirstInteract={onFirstInteract} />
          ) : (
            <PremiumCard className="p-6 flex items-center justify-center text-sm text-center min-h-[220px]" style={{ color: C.t40 }}>
              Full breakdown &amp; accuracy are shown for demo runs (which have ground truth).
            </PremiumCard>
          )}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 dash-section" style={{ animationDelay: "120ms" }}>
          <FeeDonut fees={m.fee_totals_paise} />
          {!evalData && <FooterStrip meta={m} />}
        </section>

        <section className="dash-section" style={{ animationDelay: "180ms" }}>
          <SourceFilesCard isDemo={run.isDemo} height={380} />
        </section>
      </div>
    </div>
  );
}