import React, { useEffect, useRef, useState } from "react";
import { formatINR } from "../api.js";
import * as api from "../api.js";
import FeeDonut from "../components/FeeDonut.jsx";
import SourceFilesCard from "../components/SourceFilesCard.jsx";
import { openReport } from "../report.js";

/* ————————————————————————————————————————————————
   Shared motion primitives — one system, reused everywhere,
   so the whole page feels like a single considered surface
   instead of a patchwork of hover states.
   ———————————————————————————————————————————————— */
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const PRESS = "transition-transform duration-150 active:scale-[0.97] touch-manipulation";

/**
 * PremiumCard — the flagship-SaaS hover treatment (Linear/Stripe/Vercel style):
 * a soft spotlight that tracks the cursor, a lift, a sharpened shadow, and a
 * border that brightens toward the cursor. One implementation, used by every
 * card on the page, so hover feels identical everywhere.
 */
function PremiumCard({ children, className = "", style = {}, as: Tag = "div", ...rest }) {
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
      className={`group/card relative bg-white rounded-2xl border border-slate-200/80 overflow-hidden touch-manipulation ${className}`}
      style={{
        transitionProperty: "transform, box-shadow, border-color",
        transitionDuration: "400ms",
        transitionTimingFunction: EASE,
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 20px 40px -14px rgba(15,23,42,0.16), 0 4px 10px -4px rgba(15,23,42,0.08)"
          : "0 1px 2px rgba(15,23,42,0.04)",
        borderColor: hovered ? "rgba(100,116,139,0.35)" : "rgba(226,232,240,0.8)",
        ...style,
      }}
      {...rest}
    >
      {/* cursor-tracking spotlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(360px circle at ${pos.x}% ${pos.y}%, rgba(99,102,241,0.06), transparent 55%)`,
        }}
      />
      {/* top accent line that sweeps in */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-indigo-400 via-slate-800 to-emerald-400 origin-left transition-transform duration-500"
        style={{ transform: hovered ? "scaleX(1)" : "scaleX(0)", transitionTimingFunction: EASE }}
      />
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
 * - Persists dismissal in localStorage — once gone, gone for good.
 * - Auto-surfaces ~1s after mount if never dismissed.
 * - Also quietly dismisses itself the moment the user demonstrates they
 *   already found the interaction (e.g. hovers a cell/segment popover) —
 *   no explicit dismiss required in that case.
 */
function useOneTimeHint(key) {
  const [dismissed, setDismissed] = useState(true); // default true to avoid a flash before we can read localStorage
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored = false;
    try {
      stored = localStorage.getItem(key) === "1";
    } catch {
      /* localStorage unavailable — treat as not-yet-dismissed for this session only */
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
    <div className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label="Show hint"
        onClick={() => setOpen((v) => !v)}
        className="relative w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
      >
        {!open && (
          <span className="absolute inset-0 rounded-full ring-2 ring-indigo-400/60 dash-pulse-ring" aria-hidden="true" />
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
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-l border-t border-slate-200 rotate-45" />
        <div className="relative rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 p-3.5">
          <button
            type="button"
            aria-label="Dismiss hint"
            onClick={dismiss}
            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors duration-150"
          >
            <i className="fa-solid fa-xmark text-[11px]"></i>
          </button>
          <p className="text-xs leading-relaxed text-slate-600 pr-4">{message}</p>
          <button
            type="button"
            onClick={dismiss}
            className={`mt-2.5 w-full text-center text-xs font-semibold text-white bg-slate-900 rounded-lg py-1.5 hover:bg-slate-800 ${PRESS}`}
            style={{ transitionTimingFunction: EASE, transitionProperty: "transform, background-color" }}
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
    <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 px-6">
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-full bg-slate-200/60 blur-2xl scale-125 dash-float" />
        <i className="fa-solid fa-table-columns text-5xl relative text-slate-300 dash-float"></i>
      </div>
      <p className="text-lg font-semibold text-slate-600 mb-1.5">No reconciliation run yet</p>
      <p className="text-sm mb-7 text-slate-400 max-w-xs">Run a reconciliation to see the overview, accuracy, and breakdown here.</p>
      <button
        onClick={onGoUpload}
        className={`gradient-btn text-white px-7 py-3 rounded-xl text-sm font-semibold shadow-lg shadow-slate-900/10 hover:shadow-xl hover:shadow-slate-900/15 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900/40 min-h-[44px] ${PRESS}`}
        style={{ transitionTimingFunction: EASE, transitionProperty: "transform, box-shadow" }}
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
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          {title} {subtitle && <span className="text-slate-400 normal-case font-normal">{subtitle}</span>}
        </h3>
        <div className="text-3xl font-bold text-slate-800 tracking-tight tabular-nums">
          {numeric !== undefined ? (decimals > 0 ? animated : `${animated}${typeof value === "string" ? value.replace(/[\d.,-]/g, "") : ""}`) : value}
        </div>
      </div>
      {footnote && (
        <div className={`mt-4 text-xs ${tone === "negative" ? "text-red-500 font-medium" : "text-slate-500"}`}>
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
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">Detection Accuracy</h2>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">vs ground truth</span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {stats.map(([k, v, raw]) => (
          <div
            key={k}
            onMouseEnter={onFirstInteract}
            onTouchStart={onFirstInteract}
            className="text-center rounded-xl py-3 hover:bg-slate-50 active:bg-slate-100 transition-colors duration-200 touch-manipulation cursor-default"
          >
            <div className="text-2xl font-bold text-slate-800 tabular-nums">{v}</div>
            <div className="text-xs text-slate-500 mt-1 mb-2">{k}</div>
            <div className="h-1 mx-4 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 dash-grow" style={{ "--target-w": `${Math.min(100, Math.max(0, raw * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs bg-slate-50 rounded-xl p-3 border border-slate-100">
        <span className="text-slate-600"><span className="font-semibold text-emerald-600">{acc.false_negatives}</span> missed (false negatives)</span>
        <span className="text-slate-600"><span className="font-semibold text-amber-600">{acc.false_positives}</span> over-flagged (false positives)</span>
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
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">Reconciliation Breakdown</h2>
      </div>

      <div className="h-6 w-full flex rounded-full overflow-hidden mb-4 ring-1 ring-slate-100">
        {segments.map((s) => (
          <div
            key={s.label}
            className={`${s.color} transition-[opacity,filter] duration-200 cursor-pointer touch-manipulation`}
            style={{
              width: `${(s.count / total) * 100}%`,
              opacity: active && active !== s.label ? 0.35 : 1,
              filter: active === s.label ? "brightness(1.08)" : "none",
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

      {/* Explain-on-hover panel — height-animated, no overlap with anything below it */}
      <div
        className="grid transition-[grid-template-rows] duration-300 mb-2"
        style={{ gridTemplateRows: activeSeg ? "1fr" : "0fr", transitionTimingFunction: EASE }}
      >
        <div className="overflow-hidden">
          <div className={`flex items-start gap-2.5 rounded-xl border p-3 mb-4 text-xs leading-relaxed ${activeSeg ? "border-slate-200 bg-slate-50" : "border-transparent"}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${activeSeg?.color || ""} mt-0.5 shrink-0`}></span>
            <div>
              <span className="font-semibold text-slate-700">{activeSeg?.label}</span>{" "}
              <span className="text-slate-500">— {activeSeg && (SEGMENT_EXPLANATIONS[activeSeg.label] || "Part of this run's reconciliation breakdown.")}</span>
            </div>
          </div>
        </div>
      </div>

      <table className="w-full text-sm">
        <tbody>
          {segments.map((s) => (
            <tr
              key={s.label}
              className={`border-b border-slate-50 rounded-lg transition-colors duration-150 touch-manipulation cursor-pointer ${active === s.label ? "bg-slate-50" : ""}`}
              onMouseEnter={() => activate(s.label)}
              onMouseLeave={() => setActive(null)}
              onTouchStart={() => activate(active === s.label ? null : s.label)}
            >
              <td className="py-3.5 flex items-center gap-2 pl-2 rounded-l-lg">
                <span className={`w-2.5 h-2.5 rounded-full ${s.color} block`}></span>
                <span className="text-slate-600">{s.label}</span>
              </td>
              <td className="py-3.5 text-right font-medium text-slate-800 tabular-nums">{s.count}</td>
              <td className="py-3.5 text-right text-slate-500 w-20 pr-2 rounded-r-lg tabular-nums">{((s.count / total) * 100).toFixed(2)}%</td>
            </tr>
          ))}
          <tr>
            <td className="py-3 font-medium text-slate-800 pl-2">Total</td>
            <td className="py-3 text-right font-bold text-slate-800 tabular-nums">{total}</td>
            <td className="py-3 text-right font-medium text-slate-800 w-20 pr-2 tabular-nums">100.00%</td>
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
  const push = (label, value, color, height, marginBottom, tooltip, showConnector = true) =>
    steps.push({ label, value, color, height, marginBottom, tooltip, showConnector });

  push(["Ingested"], `${total}`, "bg-slate-300", total * scale, 0, `Total ingested: ${total}`);
  let running = total;
  running -= bd.duplicates;
  push(["Duplicates"], `-${bd.duplicates}`, "bg-red-400", Math.max(bd.duplicates * scale, 2), running * scale, `Duplicates removed: ${bd.duplicates}`);
  running -= bd.ghost_credits;
  push(["Ghost", "credits"], `-${bd.ghost_credits}`, "bg-purple-400", Math.max(bd.ghost_credits * scale, 2), running * scale, `Ghost bank credits: ${bd.ghost_credits}`);
  push(["Valid", "records"], `${running}`, "bg-slate-400", running * scale, 0, `Valid records: ${running}`);
  running -= bd.auto_matched;
  push(["Auto", "matched"], `-${bd.auto_matched}`, "bg-emerald-500", bd.auto_matched * scale, running * scale, `Auto (exact): ${bd.auto_matched}`);
  running -= bd.fuzzy_matched;
  push(["Fuzzy", "matched"], `-${bd.fuzzy_matched}`, "bg-emerald-400", Math.max(bd.fuzzy_matched * scale, 2), running * scale, `Fuzzy (AI): ${bd.fuzzy_matched}`);
  running -= bd.fee_anomaly;
  push(["Fee", "anomaly"], `-${bd.fee_anomaly}`, "bg-amber-400", Math.max(bd.fee_anomaly * scale, 2), running * scale, `Fee anomalies: ${bd.fee_anomaly}`);
  push(["Unresolved"], `${running}`, "bg-red-500", Math.max(running * scale, 2), 0, `Unresolved: ${running}`, false);
  return steps;
}

/**
 * Self-contained waterfall bar + tooltip. Deliberately does NOT depend on any
 * external .waterfall-bar / .wf-tooltip / .connector CSS — that unknown CSS
 * (defined elsewhere in the app) is what was causing the tooltip to overlap
 * the wrong card. Everything here is inline Tailwind with explicit stacking,
 * scoped to its own bar, so it can't collide with anything else on the page.
 */
function WaterfallBar({ step, onFirstInteract }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative flex flex-col items-center px-3 shrink-0"
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
      {/* tooltip — absolutely positioned relative to THIS bar only, high z-index, and the
          scroll container has overflow-y visible (see Waterfall below) so it never gets clipped */}
      <div
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 pointer-events-none whitespace-nowrap rounded-lg bg-slate-900 text-white text-[11px] font-medium px-2.5 py-1.5 shadow-lg transition-all duration-200"
        style={{
          opacity: hovered ? 1 : 0,
          transform: `translate(-50%, ${hovered ? "0px" : "4px"})`,
          transitionTimingFunction: EASE,
        }}
      >
        {step.tooltip}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45 -mt-1" />
      </div>

      <div className="relative flex items-end" style={{ height: 190 }}>
        <div
          className={`w-11 sm:w-12 rounded-t-md ${step.color} flex items-start justify-center pt-1 transition-transform duration-200 origin-bottom`}
          style={{
            height: Math.max(step.height, 2),
            marginBottom: step.marginBottom,
            transform: hovered ? "scaleX(1.12)" : "scaleX(1)",
            transitionTimingFunction: EASE,
            boxShadow: hovered ? "0 6px 16px -6px rgba(15,23,42,0.35)" : "none",
          }}
        >
          <span className="text-[10px] font-semibold text-white/95 tabular-nums">{step.value}</span>
        </div>
        {step.showConnector && (
          <div
            className="absolute border-t border-dashed border-slate-300"
            style={{ left: "100%", width: 12, top: `calc(100% - ${step.height + step.marginBottom}px)` }}
          />
        )}
      </div>

      <div className="mt-3 text-[10px] text-center text-slate-600 font-medium leading-tight">
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
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">Record Reconciliation Waterfall</h2>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide hidden sm:inline">drag / swipe to explore</span>
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
    { icon: "fa-solid fa-microchip", bg: "bg-blue-50", color: "text-blue-500", label: "AI cost (this run)", value: `$${(meta.llm_cost_usd_total || 0).toFixed(4)}` },
    { icon: "fa-solid fa-brain", bg: "bg-orange-50", color: "text-orange-500", label: "Model", value: meta.llm_calls ? "gpt-4o-mini" : "not used" },
    { icon: "fa-regular fa-circle-check", bg: "bg-green-50", color: "text-green-500", label: "AI explanations", value: `${meta.llm_verified_count || 0} verified / ${meta.llm_calls || 0} calls` },
  ];
  return (
    <PremiumCard as="footer" className="p-2 flex flex-col sm:flex-row items-stretch sm:items-center sm:divide-x divide-slate-100">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-3 px-4 py-2.5 flex-1 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors duration-150 touch-manipulation">
          <div className={`w-9 h-9 rounded-full ${s.bg} flex items-center justify-center ${s.color} shrink-0`}>
            <i className={s.icon}></i>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-slate-400 truncate">{s.label}</div>
            <div className="text-sm font-semibold text-slate-800 truncate">{s.value}</div>
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
      className={`flex items-center gap-2 px-3.5 py-2 min-h-[40px] border border-slate-300 rounded-lg bg-white text-slate-700 text-sm font-medium shadow-sm hover:bg-slate-50 hover:border-slate-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 focus-visible:ring-offset-1 ${PRESS}`}
      style={{ transitionTimingFunction: EASE, transitionProperty: "transform, box-shadow, background-color, border-color" }}
    >
      <i className={`${icon} text-slate-400`}></i>
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
        { label: "Auto Matched (Exact)", color: "bg-emerald-500", count: evalData.breakdown.auto_matched },
        { label: "Fuzzy Matched (AI)", color: "bg-emerald-400", count: evalData.breakdown.fuzzy_matched },
        { label: "Fee Anomaly", color: "bg-amber-400", count: evalData.breakdown.fee_anomaly },
        { label: "Unresolved", color: "bg-red-500", count: evalData.breakdown.unresolved },
        { label: "Duplicates", color: "bg-red-400", count: evalData.breakdown.duplicates },
        { label: "Ghost Credits", color: "bg-purple-400", count: evalData.breakdown.ghost_credits },
      ]
    : [
        { label: "Reconciled", color: "bg-emerald-500", count: m.reconciled_total },
        { label: "Exceptions", color: "bg-red-500", count: m.exceptions_total },
      ];
  const bdTotal = evalData ? evalData.breakdown.total : m.reconciled_total + m.exceptions_total;

  // Shared "the user already discovered hover explanations" signal — dismisses
  // the info hint quietly, without requiring them to close it explicitly.
  const { dismissed: hoverHintDismissed, dismiss: dismissHoverHint } = useOneTimeHint("dash_hover_hint_dismissed_v1");
  const onFirstInteract = hoverHintDismissed ? undefined : dismissHoverHint;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
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

      <header className="bg-white/90 backdrop-blur-sm border-b border-slate-200 px-6 py-4 flex justify-between items-center gap-4 sticky top-0 z-20">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-semibold tracking-tight bg-gradient-to-br from-slate-900 via-slate-800 to-slate-600 bg-clip-text text-transparent">
              Reconciliation Overview
            </h1>
            <InfoHint
              hintKey="dash_title_hint_dismissed_v1"
              message="Hover any card, chart segment, or bar to see what it means — accuracy stats, breakdown buckets, and the waterfall all explain themselves."
            />
          </div>
          <div className="flex items-center text-xs text-slate-500 mt-1 gap-2 flex-wrap">
            {run.isDemo && <><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-sm">Demo run (synthetic data)</span><span>•</span></>}
            <span>Run ID: {run.runId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <HeaderButton onClick={() => openReport(run, evalData)} icon="fa-solid fa-file-lines" label="Report" />
          <HeaderButton onClick={onExport} icon="fa-solid fa-download" label="Audit export (CSV)" />
          <button
            onClick={onGoExceptions}
            className={`flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-lg bg-slate-900 text-white text-sm font-medium shadow-sm hover:bg-slate-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 focus-visible:ring-offset-1 ${PRESS}`}
            style={{ transitionTimingFunction: EASE, transitionProperty: "transform, box-shadow, background-color" }}
          >
            <i className="fa-solid fa-circle-exclamation"></i><span>View exceptions</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
            <PremiumCard className="p-6 flex items-center justify-center text-sm text-slate-400 text-center min-h-[220px]">
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