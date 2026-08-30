import React, { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { formatINR } from "../api.js";
import * as api from "../api.js";
import FeeDonut from "../components/FeeDonut.jsx";
import SourceFilesCard from "../components/SourceFilesCard.jsx";
import CashPositionCard from "../components/CashPositionCard.jsx";
import CashForecastCard from "../components/CashForecastCard.jsx";
import TaxExposureCard from "../components/TaxExposureCard.jsx";
import QualitySignalsCard from "../components/QualitySignalsCard.jsx";
import RazorpayVerificationCard from "../components/RazorpayVerificationCard.jsx";
import RazorpayVerificationBar from "../components/RazorpayVerificationBar.jsx";
import TruthAnchorCard from "../components/TruthAnchorCard.jsx";
import RepairAgentCard from "../components/RepairAgentCard.jsx";
import FeeSlabCard from "../components/FeeSlabCard.jsx";
import BenchmarkChip from "../components/BenchmarkChip.jsx";
import { openReport } from "../report.js";

/* ------------------------------------------------
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

   TYPE
   display  'Special Elite' — the one characterful face, used the way a
            typewriter ledger would set a masthead: sparingly, at size,
            never for body copy or numerals.
   mono     the existing UI mono stack — every label, table, and figure.
   -----------------------------------------------· */
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const PRESS = "transition-transform duration-150 active:scale-[0.97] touch-manipulation";
const FONT_DISPLAY = "'Special Elite', 'Courier New', monospace";

// Card/chip/table geometry reads as a ledger sheet or index card, not a
// software-default rounded box — sharp-ish corners throughout, matching the
// "Field Register" / "Schema Fidelity Receipt" panels on the marketing site.
const R_CARD = "rounded-[3px]";
const R_CHIP = "rounded-[3px]";
const R_BTN = "rounded-[4px]";

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
 * PremiumCard, ledger-sheet hover treatment: a soft ink/red spotlight that
 * tracks the cursor, a lift, a sharpened shadow, and a punched "hole" corner
 * mark instead of a plain rounded box, nods to the stamp/ledger identity
 * without repeating literal stripes on every surface.
 */
function PremiumCard({ children, className = "", style = {}, as: Tag = "div", punch = false, tilt = true, ...rest }) {
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

  // Subtle paper-lift toward the cursor, degrees kept small so it reads as
  // weight/tactility rather than a gimmick.
  const tiltX = hovered && tilt ? ((50 - pos.y) / 50) * 2.2 : 0;
  const tiltY = hovered && tilt ? ((pos.x - 50) / 50) * 2.2 : 0;

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
      className={`group/card relative ${R_CARD} border overflow-hidden touch-manipulation font-mono ${className}`}
      style={{
        background: C.card,
        borderColor: hovered ? C.ink : C.border,
        transitionProperty: "transform, box-shadow, border-color",
        transitionDuration: "400ms",
        transitionTimingFunction: EASE,
        transform: hovered
          ? `perspective(900px) translateY(-3px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`
          : "perspective(900px) translateY(0) rotateX(0) rotateY(0)",
        willChange: "transform",
        boxShadow: hovered
          ? "0 20px 40px -18px rgba(31,42,26,0.24), 0 6px 14px -6px rgba(31,42,26,0.12)"
          : "0 1px 2px rgba(31,42,26,0.05)",
        ...style,
      }}
      {...rest}
    >
      {/* cursor-tracking spotlight, ink/red instead of indigo */}
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
      {/* punched corner hole, ledger motif, used sparingly */}
      {punch && (
        <span
          aria-hidden="true"
          className="absolute top-3 right-3 w-2 h-2 rounded-full"
          style={{ border: `1px solid ${C.borderStrong}`, boxShadow: `inset 0 1px 1px rgba(31,42,26,0.08)` }}
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

/**
 * Smooth-scroll the dashboard's internal scroll pane (not the window — this
 * layout scrolls inside a fixed-height flex column) via Lenis. Wrapper/content
 * point at the pane itself; a plain rAF loop drives it so it keeps ticking
 * even if the tab loses focus mid-scroll. Respects reduced-motion and tears
 * down cleanly on unmount / tab switches away from this page.
 */
function useLenisScroll(scrollRef) {
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return undefined;

    const lenis = new Lenis({
      wrapper: el,
      content: el.firstElementChild || el,
      duration: 1.05,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.1,
    });

    let raf;
    const tick = (time) => {
      lenis.raf(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [scrollRef]);
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
        className={`absolute left-1/2 -translate-x-1/2 top-full mt-3 z-40 w-64 transition-all duration-200`}
        style={{
          opacity: open ? 1 : 0,
          transform: `translate(-50%, ${open ? "0px" : "-4px"})`,
          pointerEvents: open ? "auto" : "none",
          transitionTimingFunction: EASE,
        }}
      >
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 border-l border-t rotate-45" style={{ background: C.card, borderColor: C.border }} />
        <div className={`relative ${R_CARD} border p-3.5`} style={{ background: C.card, borderColor: C.border, boxShadow: "0 12px 28px -12px rgba(31,42,26,0.25)" }}>
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
            className={`mt-2.5 w-full text-center text-xs font-semibold ${R_BTN} py-1.5 ${PRESS}`}
            style={{ background: C.ink, color: C.card, transitionTimingFunction: EASE, transitionProperty: "transform, background-color" }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Stamp, the one signature element carried over from the marketing page's
 * circular "VERIFIED" ink mark. Kept small and used exactly twice in this
 * file (header, empty state) so it stays a mark of authenticity rather than
 * decoration repeated into meaninglessness.
 */
function Stamp({ label = "AUDITED", size = 40, animate = true }) {
  return (
    <div
      aria-hidden="true"
      className={`relative shrink-0 rounded-full flex items-center justify-center select-none ${animate ? "dash-stamp-in" : ""}`}
      style={{ width: size, height: size, transform: "rotate(-9deg)" }}
    >
      <div className="absolute inset-0 rounded-full" style={{ border: `1.5px solid ${C.red}` }} />
      <div className="absolute inset-[3px] rounded-full" style={{ border: `1px dotted ${C.red}`, opacity: 0.55 }} />
      <span
        className="font-bold uppercase tracking-tighter text-center leading-[1.05] px-0.5"
        style={{ fontSize: size * 0.185, color: C.red, fontFamily: FONT_DISPLAY }}
      >
        {label}
      </span>
    </div>
  );
}

function EmptyState({ onGoUpload }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 font-mono" style={{ color: C.t40 }}>
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full blur-2xl scale-125 dash-float" style={{ background: "rgba(181,67,47,0.12)" }} />
        <div className="relative dash-float">
          <Stamp label="NO RUN" size={72} />
        </div>
      </div>
      <p className="text-lg font-semibold mb-1.5" style={{ color: C.ink, fontFamily: FONT_DISPLAY, letterSpacing: "-0.01em" }}>
        No reconciliation run yet
      </p>
      <p className="text-sm mb-7 max-w-xs">Run a reconciliation to see the overview, accuracy, and breakdown here.</p>
      <button
        onClick={onGoUpload}
        className={`px-7 py-3 ${R_BTN} text-sm font-semibold min-h-[44px] ${PRESS} active:rotate-[-1deg]`}
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
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: C.t40 }}>
          <span style={{ color: C.red }}>—</span>
          <span>{title} {subtitle && <span className="normal-case font-normal" style={{ color: C.t40 }}>{subtitle}</span>}</span>
          {tone === "negative" && numeric > 0 && (
            <span className="relative w-1.5 h-1.5 rounded-full ml-0.5" style={{ background: C.red }}>
              <span className="absolute inset-0 rounded-full dash-pulse-ring" style={{ boxShadow: `0 0 0 2px rgba(181,67,47,0.45)` }} />
            </span>
          )}
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

/**
 * Detection Accuracy, redrawn as a "receipt" panel to match the marketing
 * site's Field Register / Schema Fidelity Receipt language: a stamped ink
 * masthead rule, tabular-ledger stat columns divided by hairlines (not
 * flat mint-green tiles), and a dotted "verified" seal instead of a plain
 * pill chip.
 */
function AccuracyCard({ acc, onFirstInteract }) {
  const pct = (n) => `${Math.round(n * 100)}%`;
  const stats = [
    ["Precision", pct(acc.precision), acc.precision],
    ["Recall", pct(acc.recall), acc.recall],
    ["F1", acc.f1.toFixed(2), acc.f1],
  ];
  return (
    <PremiumCard className="overflow-hidden" punch>
      {/* masthead */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ background: C.ink, borderBottom: `2px solid ${C.red}` }}
      >
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em]" style={{ color: C.card, fontFamily: FONT_DISPLAY }}>
            Detection Accuracy
          </h2>
        </div>
        <span
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full"
          style={{ border: `1px dotted rgba(251,251,243,0.55)`, color: "rgba(251,251,243,0.85)" }}
        >
          <i className="fa-solid fa-shield-halved text-[9px]"></i> vs ground truth
        </span>
      </div>

      <div className="p-6">
        {/* stat row, ledger columns with hairline dividers instead of tiles */}
        <div className="grid grid-cols-3">
          {stats.map(([k, v, raw], i) => (
            <div
              key={k}
              onMouseEnter={onFirstInteract}
              onTouchStart={onFirstInteract}
              className="dash-section text-center px-2 touch-manipulation cursor-default"
              style={{
                animationDelay: `${i * 70}ms`,
                borderLeft: i > 0 ? `1px dashed ${C.borderStrong}` : "none",
              }}
            >
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: C.t40 }}>{k}</div>
              <div className="text-[32px] leading-none font-bold tabular-nums mb-3" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{v}</div>
              <div className="h-[3px] mx-4 rounded-full overflow-hidden" style={{ background: C.border }}>
                <div
                  className="h-full rounded-full dash-grow"
                  style={{ background: `linear-gradient(90deg, ${C.moss}, #7DA271)`, "--target-w": `${Math.min(100, Math.max(0, raw * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* perforated tear rule, ledger receipt motif */}
        <div className="my-5 h-px" style={{ borderTop: `1px dashed ${C.borderStrong}` }} />

        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-2" style={{ color: C.t60 }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.moss }} />
            <span className="font-semibold tabular-nums" style={{ color: C.ink }}>{acc.false_negatives}</span> missed (false negatives)
          </span>
          <span className="flex items-center gap-2" style={{ color: C.t60 }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.ochre }} />
            <span className="font-semibold tabular-nums" style={{ color: C.ink }}>{acc.false_positives}</span> over-flagged (false positives)
          </span>
        </div>
      </div>
    </PremiumCard>
  );
}

/* Plain-language meaning for each breakdown bucket, shown on hover/tap. */
const SEGMENT_EXPLANATIONS = {
  "Auto Matched (Exact)": "Matched automatically because every key field agreed exactly across both ledgers. No review needed.",
  "Fuzzy Matched (AI)": "No exact match existed, so the AI matcher paired these on high-confidence similarity (amount, narration, timing).",
  "Fee Anomaly": "Matched, but the fee charged doesn't line up with the expected fee schedule, worth a second look.",
  "Unresolved": "No confident match on either side. These need manual review in the exceptions queue.",
  Duplicates: "Duplicate entries detected in the source data and excluded before matching.",
  "Ghost Credits": "Credits that appear on the bank statement with no corresponding source record, flagged for investigation.",
  Reconciled: "Successfully matched between the source ledger and the bank statement.",
  Exceptions: "Couldn't be confidently matched, routed to the exceptions queue for manual review.",
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
    <PremiumCard className="p-6" punch>
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.ink }}>Reconciliation Breakdown</h2>
      </div>

      <div className="h-6 w-full flex overflow-hidden mb-4" style={{ boxShadow: `0 0 0 1px ${C.border}`, borderRadius: 2 }}>
        {segments.map((s, i) => (
          <div
            key={s.label}
            className="dash-bar-fill transition-[opacity,filter] duration-200 cursor-pointer touch-manipulation"
            style={{
              width: `${(s.count / total) * 100}%`,
              background: s.hex,
              opacity: active && active !== s.label ? 0.35 : 1,
              filter: active === s.label ? "brightness(1.1)" : "none",
              transformOrigin: "left",
              animationDelay: `${i * 60}ms`,
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

      {/* Explain-on-hover panel, receipt-style dashed border instead of solid */}
      <div
        className="grid transition-[grid-template-rows] duration-300 mb-2"
        style={{ gridTemplateRows: activeSeg ? "1fr" : "0fr", transitionTimingFunction: EASE }}
      >
        <div className="overflow-hidden">
          <div
            className={`flex items-start gap-2.5 ${R_CHIP} p-3 mb-4 text-xs leading-relaxed`}
            style={{
              border: activeSeg ? `1px dashed ${C.borderStrong}` : "1px dashed transparent",
              background: activeSeg ? C.bg : "transparent",
            }}
          >
            <span className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0" style={{ background: activeSeg?.hex }}></span>
            <div>
              <span className="font-semibold" style={{ color: C.ink }}>{activeSeg?.label}</span>{" "}
              <span style={{ color: C.t60 }}>· {activeSeg && (SEGMENT_EXPLANATIONS[activeSeg.label] || "Part of this run's reconciliation breakdown.")}</span>
            </div>
          </div>
        </div>
      </div>

      <table className="w-full text-sm">
        <tbody>
          {segments.map((s) => (
            <tr
              key={s.label}
              className={`border-b ${R_CHIP} transition-colors duration-150 touch-manipulation cursor-pointer`}
              style={{ borderColor: C.bg, background: active === s.label ? C.bg : "transparent" }}
              onMouseEnter={() => activate(s.label)}
              onMouseLeave={() => setActive(null)}
              onTouchStart={() => activate(active === s.label ? null : s.label)}
            >
              <td className="py-3.5 flex items-center gap-2 pl-2 rounded-l-[3px]">
                <span className="w-2.5 h-2.5 rounded-full block" style={{ background: s.hex }}></span>
                <span style={{ color: C.t60 }}>{s.label}</span>
              </td>
              <td className="py-3.5 text-right font-medium tabular-nums" style={{ color: C.ink }}>{s.count}</td>
              <td className="py-3.5 text-right w-20 pr-2 rounded-r-[3px] tabular-nums" style={{ color: C.t60 }}>{((s.count / total) * 100).toFixed(2)}%</td>
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
 * Self-contained waterfall bar + tooltip, fully inline, scoped to itself.
 * Bars carry a small dashed "ledger stitch" connector between steps,
 * reinforcing the paper-trail motif without a striped background.
 */
function WaterfallBar({ step, index = 0, onFirstInteract }) {
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
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 pointer-events-none whitespace-nowrap rounded-[3px] text-[11px] font-medium px-2.5 py-1.5 transition-all duration-200"
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
        {/* separate wrapper carries the mount-in rise so it never fights the
            per-frame hover scaleX on the bar itself */}
        <div
          className="dash-water-rise"
          style={{
            height: Math.max(step.height, 2),
            marginBottom: step.marginBottom,
            transformOrigin: "bottom",
            animationDelay: `${index * 55}ms`,
          }}
        >
          <div
            className="w-11 sm:w-12 h-full rounded-t-[2px] flex items-start justify-center pt-1 transition-transform duration-200 origin-bottom"
            style={{
              background: step.hex,
              transform: hovered ? "scaleX(1.12)" : "scaleX(1)",
              transitionTimingFunction: EASE,
              boxShadow: hovered ? "0 8px 18px -8px rgba(31,42,26,0.4)" : "none",
            }}
          >
            <span className="text-[10px] font-semibold tabular-nums" style={{ color: "#FBFBF3" }}>{step.value}</span>
          </div>
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
    <PremiumCard className="p-6 flex flex-col" punch>
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
            <WaterfallBar key={i} step={s} index={i} onFirstInteract={onFirstInteract} />
          ))}
        </div>
      </div>
    </PremiumCard>
  );
}

/**
 * FooterStrip, rebuilt as an ink ledger receipt (mirrors the marketing
 * site's dark "Measured, not claimed" panel) rather than a pale flat row.
 * Same three counters, no info dropped — just given the weight of a closing
 * statement: dark ink field, a thin gold top rule, tabular tinted figures,
 * and hairline (not full-tone) dividers between columns.
 */
function FooterStrip({ meta }) {
  // These counters capture what happened AT reconcile time. Explain-on-demand LLM
  // calls fired from the Exceptions drawer are counted separately and are visible
  // per-exception (the "Verified" badge on an AI explanation).
  const llmUsed = (meta.llm_calls || 0) > 0;
  const stats = [
    { icon: "fa-solid fa-microchip", accent: "#EDEBDD",
      label: "AI cost at reconcile",
      value: llmUsed ? `$${(meta.llm_cost_usd_total || 0).toFixed(4)}` : "$0.0000",
      sub: llmUsed ? "verified against hallucination guard" : "reconcile ran without LLM (fast path)" },
    { icon: "fa-solid fa-brain", accent: C.ochre,
      label: "Model",
      value: llmUsed ? "gpt-4o-mini" : "on-demand only",
      sub: llmUsed ? "verified narration on every explain call"
                   : "click Explain with AI on any exception to invoke" },
    { icon: "fa-regular fa-circle-check", accent: "#8FBF8A",
      label: "AI explanations",
      value: llmUsed
        ? `${meta.llm_verified_count || 0} verified / ${meta.llm_calls || 0} calls`
        : "0 / 0 at reconcile",
      sub: "hallucination verifier rejected any ungrounded rupee" },
  ];
  return (
    <footer
      className={`relative overflow-hidden ${R_CARD} flex flex-col sm:flex-row`}
      style={{ background: C.ink, boxShadow: "0 16px 32px -18px rgba(31,42,26,0.35)" }}
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${C.ochre}, #E4C77A, ${C.ochre})` }} />
      <div className="px-4 pt-2.5 pb-1 sm:hidden text-[9px] uppercase tracking-[0.14em]" style={{ color: "rgba(251,251,243,0.4)" }}>
        Measured, not claimed
      </div>
      {stats.map((s, i) => (
        <div
          key={s.label}
          className="flex items-center gap-3.5 px-5 py-4 flex-1 touch-manipulation"
          style={{ borderLeft: i > 0 ? "1px solid rgba(251,251,243,0.12)" : "none" }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ border: `1px solid rgba(251,251,243,0.25)`, color: s.accent }}
          >
            <i className={s.icon}></i>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider truncate" style={{ color: "rgba(251,251,243,0.45)" }}>{s.label}</div>
            <div className="text-sm font-semibold truncate tabular-nums" style={{ color: C.card }}>{s.value}</div>
            {s.sub && <div className="text-[10px] truncate" style={{ color: "rgba(251,251,243,0.4)" }} title={s.sub}>{s.sub}</div>}
          </div>
        </div>
      ))}
    </footer>
  );
}

function HeaderButton({ onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2 min-h-[40px] ${R_BTN} text-sm font-medium font-mono ${PRESS}`}
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

/**
 * FeeInsightsCard, sits alongside FeeDonut. The donut shows distribution
 * across fee types; this shows impact: total deducted, % of settlement,
 * the single biggest fee category, and a nudge into anomalies if any exist.
 * Pure derived-data view, no new endpoints, reuses meta already on `run`.
 */
function FeeInsightsCard({ feeTotalsPaise, reconciledAmountPaise, anomalyCount }) {
  const entries = Object.entries(feeTotalsPaise || {}).filter(([, v]) => v > 0);
  const totalFeesPaise = entries.reduce((sum, [, v]) => sum + v, 0);
  const totalFees = formatINR(totalFeesPaise / 100);
  const pctOfSettlement = reconciledAmountPaise
    ? ((totalFeesPaise / reconciledAmountPaise) * 100).toFixed(2)
    : "0.00";
  const largest = [...entries].sort((a, b) => b[1] - a[1])[0];

  return (
    <PremiumCard className="p-6">
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.ink }}>Fee Insights</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className={`${R_CHIP} p-3.5`} style={{ background: C.bg }}>
          <div className="text-xs mb-1" style={{ color: C.t40 }}>Total fees deducted</div>
          <div className="text-xl font-bold tabular-nums" style={{ color: C.ink }}>{totalFees}</div>
        </div>
        <div className={`${R_CHIP} p-3.5`} style={{ background: C.bg }}>
          <div className="text-xs mb-1" style={{ color: C.t40 }}>% of reconciled amount</div>
          <div className="text-xl font-bold tabular-nums" style={{ color: C.ink }}>{pctOfSettlement}%</div>
        </div>
      </div>

      {largest ? (
        <div className={`flex items-center justify-between text-xs ${R_CHIP} p-3 border mb-3`} style={{ background: C.bg, borderColor: C.border }}>
          <span style={{ color: C.t60 }}>Largest fee category</span>
          <span className="font-semibold" style={{ color: C.ink }}>
            {largest[0]}. {formatINR(largest[1] / 100)}
          </span>
        </div>
      ) : (
        <div className={`text-xs ${R_CHIP} p-3 border mb-3`} style={{ background: C.bg, borderColor: C.border, color: C.t40 }}>
          No fees recorded for this run.
        </div>
      )}

      {anomalyCount > 0 && (
        <div className={`flex items-center gap-2.5 text-xs ${R_CHIP} p-3 border`} style={{ borderColor: C.ochre, background: "rgba(184,134,59,0.08)" }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ color: C.ochre }}></i>
          <span style={{ color: C.t60 }}>
            <span className="font-semibold" style={{ color: C.ochre }}>{anomalyCount}</span> fee anomal{anomalyCount === 1 ? "y" : "ies"} detected, worth a review.
          </span>
        </div>
      )}
    </PremiumCard>
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

  const scrollPaneRef = useRef(null);
  useLenisScroll(scrollPaneRef);

  return (
    <div className="flex flex-col h-full overflow-hidden font-mono relative" style={{ background: C.bg }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Special+Elite&display=swap');
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

        /* header settles down on load, once */
        @keyframes dashHeaderIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .dash-header-in { animation: dashHeaderIn 550ms ${EASE} both; }

        /* the ink stamp "lands" on mount, small overshoot then settles to its resting tilt */
        @keyframes dashStampIn {
          0% { opacity: 0; transform: scale(1.7) rotate(-30deg); }
          55% { opacity: 1; transform: scale(0.94) rotate(-6deg); }
          100% { opacity: 1; transform: scale(1) rotate(-9deg); }
        }
        .dash-stamp-in { animation: dashStampIn 650ms ${EASE} both; animation-delay: 150ms; }

        /* breakdown segments draw in left-to-right, like a bar being filled */
        @keyframes dashBarFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .dash-bar-fill { animation: dashBarFill 650ms ${EASE} both; }

        /* waterfall columns rise from the baseline, staggered per bar */
        @keyframes dashWaterRise { from { transform: scaleY(0); opacity: 0.5; } to { transform: scaleY(1); opacity: 1; } }
        .dash-water-rise { animation: dashWaterRise 600ms ${EASE} both; }

        /* whole tab panel eases in on switch, on top of each card's own stagger */
        @keyframes dashTabIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .dash-tab-in { animation: dashTabIn 380ms ${EASE} both; }

        @media (prefers-reduced-motion: reduce) {
          .dash-float, .dash-grow, .dash-section, .dash-pulse-ring,
          .dash-header-in, .dash-stamp-in, .dash-bar-fill, .dash-water-rise, .dash-tab-in {
            animation: none !important;
          }
        }
      `}</style>

      {/* faint paper grain instead of stripes, a fixed dot-grid, barely-there */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: "radial-gradient(circle, #D9E3C8 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />

      <header
        className="backdrop-blur-sm px-6 pt-4 pb-0 sticky top-0 z-20 relative"
        style={{ background: "rgba(251,251,243,0.92)" }}
      >
        <div className="dash-header-in flex justify-between items-center gap-4 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1
                className="text-[27px] font-bold tracking-tight leading-none"
                style={{ color: C.ink, fontFamily: FONT_DISPLAY, letterSpacing: "-0.01em" }}
              >
                Reconciliation Overview
              </h1>
              <InfoHint
                hintKey="dash_title_hint_dismissed_v1"
                message="Hover any card, chart segment, or bar to see what it means, accuracy stats, breakdown buckets, and the waterfall all explain themselves."
              />
              <Stamp label="AUDITED" size={38} />
            </div>
            <div className="mt-2.5"><BenchmarkChip /></div>
            <div className="flex items-center text-xs mt-2 gap-2 flex-wrap" style={{ color: C.t60 }}>
              {run.isDemo && (
                <>
                  <span className={`px-2 py-0.5 ${R_CHIP} border`} style={{ background: C.bg, borderColor: C.border, color: C.t60 }}>Demo run (synthetic data)</span>
                  <span style={{ color: C.t40 }}>·</span>
                </>
              )}
              <span>Run ID: <b style={{ color: C.ink, fontWeight: 500 }}>{run.runId}</b></span>
              <span style={{ color: C.t40 }}>·</span>
              <span>Reconciled in <b style={{ color: C.ink }}>{
                m.elapsed_seconds >= 0.1 ? `${m.elapsed_seconds}s`
                : m.elapsed_seconds > 0 ? `${Math.round(m.elapsed_seconds * 1000)}ms`
                : "under 1ms"
              }</b> · throughput <b style={{ color: C.ink }}>{Math.round(m.throughput_rps).toLocaleString("en-IN")} rec/s</b></span>
              <span style={{ color: C.t40 }}>·</span>
              <span>{m.settlement_active} records · {m.exceptions_total} exceptions</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <HeaderButton
              onClick={() => {
                // Opened without "noopener" (deliberately) so we keep a same-origin
                // window handle to trigger the print dialog once the brief has
                // finished loading, rather than just dumping the user on the page.
                const w = window.open(api.cfoBriefUrl(run.runId), "_blank");
                if (w) {
                  const triggerPrint = () => {
                    try { w.focus(); w.print(); } catch { /* cross-origin fallback: user prints manually */ }
                  };
                  w.addEventListener("load", triggerPrint);
                  // fallback in case the load event already fired before we attached
                  setTimeout(triggerPrint, 900);
                }
              }}
              icon="fa-solid fa-print" label="CFO Brief" />
            <HeaderButton onClick={() => openReport(run, evalData)} icon="fa-solid fa-file-lines" label="Report" />
            <HeaderButton onClick={onExport} icon="fa-solid fa-download" label="Audit export (CSV)" />
            <button
              onClick={onGoExceptions}
              className={`relative flex items-center gap-2 px-3.5 py-2 min-h-[40px] ${R_BTN} text-sm font-medium font-mono ${PRESS} active:rotate-[-1deg]`}
              style={{ background: C.ink, color: C.card, boxShadow: "0 10px 22px -12px rgba(31,42,26,0.5)", transitionTimingFunction: EASE, transitionProperty: "transform, box-shadow, background-color" }}
            >
              {m.exceptions_total > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full" style={{ background: C.red }}>
                  <span className="absolute inset-0 rounded-full dash-pulse-ring" style={{ boxShadow: `0 0 0 2px rgba(181,67,47,0.5)` }} />
                </span>
              )}
              <i className="fa-solid fa-circle-exclamation"></i><span>View exceptions</span>
            </button>
          </div>
        </div>
        {/* ledger double-rule, echoes the masthead rule on the marketing page */}
        <div style={{ borderTop: `2px solid ${C.ink}` }} />
        <div className="mt-[3px]" style={{ borderTop: `1px solid ${C.border}` }} />
      </header>

      <div ref={scrollPaneRef} className="flex-1 overflow-y-auto relative">
        <div className="p-6 space-y-6">
          {/* Always-on metric strip - the operator's landing view. */}
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <MetricCard title="Match Rate" subtitle="(Reconciled)" value={`${m.reconciled_rate_pct}%`} numeric={m.reconciled_rate_pct} footnote={`${m.match_rate_pct}% matched (incl, fuzzy)`} delay={0} />
            <MetricCard title="Records Processed" value={`${m.settlement_active}`} numeric={m.settlement_active} footnote={`${m.dataset_size} rows ingested`} delay={40} />
            <MetricCard title="Processing Time" value={`${m.elapsed_seconds}s`} numeric={m.elapsed_seconds} footnote={`Throughput: ${Math.round(m.throughput_rps).toLocaleString("en-IN")} rec/s`} delay={80} />
            <MetricCard title="Amount Reconciled" value={amount} footnote="net settled, verified" delay={120} />
            <MetricCard title="Exceptions" subtitle="(Needs review)" value={`${m.exceptions_total}`} numeric={m.exceptions_total} footnote={`${exceptionsPct}% of records`} tone="negative" delay={160} />
          </section>

          {/* Truth-Anchor Agent card. This is the actual use of the sponsor API in
              ReconMint: for every exception, appeal to api.razorpay.com and treat the
              live record as ground truth. Replaces the old always-visible "3 sample
              records" card because that one proved connectivity but shipped no
              finding a controller could act on. This one does. */}
          <TruthAnchorCard runId={run.runId} onJumpToException={onGoExceptions} />

          {/* Tabbed body, kills scroll fatigue by grouping cards by intent. */}
          <DashboardTabs
            run={run}
            m={m}
            evalData={evalData}
            segments={segments}
            bdTotal={bdTotal}
            onFirstInteract={onFirstInteract}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * DashboardTabs, three lanes: Cash · Reconciliation · Audit.
 * Each lane renders its cards lazily; only the active lane mounts.
 */
function DashboardTabs({ run, m, evalData, segments, bdTotal, onFirstInteract }) {
  const [tab, setTab] = useState("cash");
  const tabRefs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  // Sub-set of tabs. Each has a label, icon, and a one-liner shown as a helper
  // subtitle so a judge understands what's inside before clicking.
  const TABS = [
    { id: "cash",     label: "Cash",           icon: "fa-scale-balanced",     hint: "" },
    { id: "recon",    label: "Reconciliation", icon: "fa-diagram-project",    hint: "match breakdown · Repair Agent · source files" },
    { id: "audit",    label: "Audit",          icon: "fa-shield-halved",      hint: "live Razorpay API check · accuracy · quality signals · AI cost" },
  ];

  // Measure the active tab's button so the underline can glide to it instead
  // of popping under a new tab, the way a receipt's stamped line would slide.
  useEffect(() => {
    const el = tabRefs.current[tab];
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);

  return (
    <div>
      {/* Tab bar */}
      <div className="relative flex items-center gap-1 mb-5 border-b" style={{ borderColor: C.border }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => (tabRefs.current[t.id] = el)}
              onClick={() => setTab(t.id)}
              className="relative flex items-center gap-2 px-4 py-2.5 text-sm font-mono font-semibold transition-colors duration-200 rounded-t-[3px]"
              style={{
                color: active ? C.ink : C.t60,
                background: active ? "rgba(31,42,26,0.04)" : "transparent",
              }}
            >
              <i className={`fa-solid ${t.icon} text-xs transition-colors duration-200`} style={{ color: active ? C.red : C.t40 }}></i>
              <span>{t.label}</span>
            </button>
          );
        })}
        {/* sliding indicator, glides between tabs rather than re-appearing */}
        <span
          aria-hidden="true"
          className="absolute -bottom-[1px] h-[2px]"
          style={{
            left: indicator.left + 8,
            width: Math.max(indicator.width - 16, 0),
            background: C.red,
            transitionProperty: "left, width",
            transitionDuration: "320ms",
            transitionTimingFunction: EASE,
          }}
        />
        <span className="ml-auto pr-2 text-[10px] transition-opacity duration-200" style={{ color: C.t40 }}>
          {TABS.find((t) => t.id === tab)?.hint}
        </span>
      </div>

      {/* Cash lane, the Finance Controller view. */}
      {tab === "cash" && (
        <div key="cash" className="dash-tab-in space-y-6">
          <section className="dash-section"><CashPositionCard runId={run.runId} /></section>
          <section className="dash-section" style={{ animationDelay: "40ms" }}>
            <CashForecastCard runId={run.runId} forceDemoMode={run.isDemo} />
          </section>
          <section className="dash-section" style={{ animationDelay: "80ms" }}>
            <TaxExposureCard runId={run.runId} />
          </section>
          <section className="dash-section" style={{ animationDelay: "120ms" }}>
            <FeeSlabCard runId={run.runId} />
          </section>
        </div>
      )}

      {/* Reconciliation lane, how the numbers were arrived at. */}
      {tab === "recon" && (
        <div key="recon" className="dash-tab-in space-y-6">
          <section className="dash-section">
            <StackedBreakdown segments={segments} total={bdTotal} onFirstInteract={onFirstInteract} />
          </section>
          <section className="dash-section" style={{ animationDelay: "40ms" }}>
            <RepairAgentCard meta={m} />
          </section>
          <section className="dash-section" style={{ animationDelay: "80ms" }}>
            <FeeDonut fees={m.fee_totals_paise} />
          </section>
          <section className="dash-section" style={{ animationDelay: "120ms" }}>
            <SourceFilesCard isDemo={run.isDemo} runId={run.runId} height={380} />
          </section>
        </div>
      )}

      {/* Audit lane, proof and trust. Razorpay bar lives above the tabs so it's on every tab. */}
      {tab === "audit" && (
        <div key="audit" className="dash-tab-in space-y-6">
          {evalData?.accuracy && (
            <section className="dash-section">
              <AccuracyCard acc={evalData.accuracy} onFirstInteract={onFirstInteract} />
            </section>
          )}
          <section className="dash-section" style={{ animationDelay: "40ms" }}>
            <QualitySignalsCard runId={run.runId} />
          </section>
          <section className="dash-section" style={{ animationDelay: "80ms" }}>
            <FooterStrip meta={m} />
          </section>
        </div>
      )}
    </div>
  );
}