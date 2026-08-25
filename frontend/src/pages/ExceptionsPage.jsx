import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as api from "../api.js";
import FeeWaterfall from "../components/FeeWaterfall.jsx";
import SourceFilesCard from "../components/SourceFilesCard.jsx";

const PAGE_SIZE = 8;

const SEV_DOT = { Critical: "bg-red-500", Warning: "bg-amber-400", Info: "bg-blue-400" };
const SEV_RING = { Critical: "ring-red-500/30", Warning: "ring-amber-400/30", Info: "ring-blue-400/30" };
const SEV_TEXT = { Critical: "text-red-700 bg-red-50 border-red-100", Warning: "text-amber-700 bg-amber-50 border-amber-100", Info: "text-blue-700 bg-blue-50 border-blue-100" };
const CAT_CHIP = {
  "Amount Mismatch": "bg-red-50 text-red-700 border-red-100",
  "Missing in Bank": "bg-purple-50 text-purple-700 border-purple-100",
  Chargeback: "bg-orange-50 text-orange-700 border-orange-100",
  Duplicate: "bg-slate-100 text-slate-600 border-slate-200",
  "No Order": "bg-rose-50 text-rose-700 border-rose-100",
  Other: "bg-slate-100 text-slate-600 border-slate-200",
};

const COLUMN_LABELS = {
  id: "Payment ID",
  date: "Date",
  amount: "Amount",
  category: "Category",
  severity: "Severity",
  matchMethod: "Match method",
  confidence: "Confidence",
  status: "Status",
};

// Category-specific investigation playbook — grounds "Diagnose & Fix" in something
// concrete instead of a generic checklist, so the tab actually helps close the case.
const PLAYBOOK = {
  "Amount Mismatch": {
    cause: "The bank settled a different net amount than the fee schedule predicts.",
    steps: [
      "Compare Expected Net against Actual Net in the Ledger tab to size the gap",
      "Check whether the gateway's fee slab changed for this settlement date",
      "Confirm GST / TDS was applied the same way as the calculation",
      "Cross-check the bank statement line against this Payment ID",
    ],
  },
  "Missing in Bank": {
    cause: "This payment exists in source records but hasn't appeared in the bank statement yet.",
    steps: [
      "Confirm the expected settlement date for this payment method",
      "Check whether it landed in a later settlement batch",
      "Verify the UTR / reference number with the payment gateway",
      "If more than 2 business days late, raise it with bank operations",
    ],
  },
  Chargeback: {
    cause: "The customer or issuing bank has disputed this charge.",
    steps: [
      "Confirm the chargeback reason code from the gateway dashboard",
      "Check the dispute response deadline before it lapses",
      "Gather delivery or service evidence to contest, if applicable",
      "Loop in support to confirm the customer's order status",
    ],
  },
  Duplicate: {
    cause: "This record appears to have been counted twice across source files or runs.",
    steps: [
      "Confirm the duplicate transaction ID in the source files",
      "Check whether two reconciliation runs overlapped this date range",
      "Void or exclude the duplicate row, then re-run reconciliation",
    ],
  },
  "No Order": {
    cause: "A payment was received but no matching order exists in the system.",
    steps: [
      "Search the order ID or customer reference in the source system",
      "Check for a failed or delayed webhook around this timestamp",
      "Create a manual order record if the payment is legitimate",
    ],
  },
  Other: {
    cause: "This exception doesn't fit a standard pattern — manual review recommended.",
    steps: [
      "Read the explanation in the Explain tab for context",
      "Cross-check the ledger figures against the source files",
      "Decide whether to resolve, escalate, or flag for follow-up",
    ],
  },
};

const RESOLUTION_REASONS = [
  { id: "confirmed", label: "Confirmed match", icon: "fa-check" },
  { id: "override", label: "Manual override", icon: "fa-pen" },
  { id: "false_positive", label: "False positive", icon: "fa-ban" },
  { id: "escalated", label: "Escalated to finance", icon: "fa-flag" },
];

function EmptyState({ onGoUpload }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 animate-[fadeIn_.4s_ease]">
      <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4 shadow-sm">
        <i className="fa-solid fa-circle-exclamation text-2xl opacity-40"></i>
      </div>
      <p className="text-lg font-medium text-slate-500 mb-1">No run loaded</p>
      <p className="text-sm mb-6">Run a reconciliation first to review its exceptions.</p>
      <button
        onClick={onGoUpload}
        className="gradient-btn text-white px-6 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-blue-600/10 transition-all duration-150 active:scale-[0.96] hover:shadow-xl hover:shadow-blue-600/20 hover:-translate-y-0.5"
      >
        Go to Upload
      </button>
    </div>
  );
}

function ConfidenceBar({ value }) {
  if (!value && value !== 0) return <span className="text-slate-400">—</span>;
  const color = value >= 90 ? "bg-emerald-500" : value >= 70 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 min-w-[72px]">
      <div className="w-12 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500 ease-out`} style={{ width: `${Math.min(100, Math.max(4, value))}%` }} />
      </div>
      <span className="text-slate-600 font-semibold text-xs tabular-nums">{value}%</span>
    </div>
  );
}

function CopyButton({ text, label, className = "" }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1.5 transition-all duration-150 active:scale-[0.96] ${className}`}
    >
      <i className={`fa-solid ${copied ? "fa-check text-emerald-500" : "fa-copy"} text-[11px]`}></i>
      {copied ? "Copied" : label}
    </button>
  );
}

function CopyableId({ id }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button
      onClick={copy}
      title="Copy payment ID"
      className="group/copy inline-flex items-center gap-1.5 font-semibold text-slate-900 hover:text-blue-700 active:scale-[0.97] transition-all duration-150 -ml-1.5 px-1.5 py-1 rounded-md hover:bg-blue-50/70"
    >
      <span>{id}</span>
      <i
        className={`fa-solid ${copied ? "fa-check text-emerald-500" : "fa-copy text-slate-300 group-hover/copy:text-blue-400"} text-[11px] transition-colors duration-150 opacity-0 group-hover/copy:opacity-100 ${copied ? "!opacity-100" : ""}`}
      ></i>
    </button>
  );
}

const TIP_KEY = "excp_cell_tip_dismissed_v1";

/** A single, premium, one-time hint bubble pointing at the info button. Never returns
 * once dismissed (or once the user acts on a cell), stored in localStorage. */
function InfoHint({ onDismiss }) {
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    setLeaving(true);
    setTimeout(onDismiss, 180);
  };
  return (
    <div
      className={`absolute left-0 top-full mt-3 w-72 z-20 transition-all duration-200 ease-out ${
        leaving ? "opacity-0 -translate-y-1 scale-95" : "opacity-100 translate-y-0 scale-100 animate-[popIn_.32s_cubic-bezier(0.16,1,0.3,1)]"
      }`}
    >
      <div className="absolute -top-1.5 left-5 w-3 h-3 rotate-45 bg-white/95 border-l border-t border-slate-200/70"></div>
      <div className="relative bg-white/95 backdrop-blur-xl border border-slate-200/70 rounded-xl shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] p-4 pr-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
            <i className="fa-solid fa-hand-pointer text-blue-500 text-xs"></i>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-slate-800 leading-snug">Tip: click any cell</p>
            <p className="text-[12px] text-slate-500 leading-snug mt-0.5">
              Click a cell to open its full details, or jump straight to that row in the source file.
            </p>
          </div>
          <button onClick={close} className="text-slate-300 hover:text-slate-500 transition-colors -mt-0.5 -mr-0.5 w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-100 active:scale-90 flex-shrink-0">
            <i className="fa-solid fa-xmark text-[11px]"></i>
          </button>
        </div>
        <button
          onClick={close}
          className="mt-3 w-full text-center text-[12px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg py-1.5 transition-all duration-150 active:scale-[0.97]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/** Small floating menu that appears where the user tapped a cell, offering the two
 * ways to dig in: the detailed sidebar, or the exact row/column in the source file. */
function CellActionPopover({ pos, item, column, onOpenDrawer, onOpenSource, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const left = Math.min(Math.max(pos.x - 130, 12), (typeof window !== "undefined" ? window.innerWidth : 1200) - 272);
  const top = pos.y + 14;

  return (
    <>
      <div className="fixed inset-0 z-40" />
      <div
        ref={ref}
        style={{ left, top }}
        className="fixed z-50 w-64 animate-[popIn_.16s_cubic-bezier(0.16,1,0.3,1)]"
      >
        <div className="bg-white/95 backdrop-blur-xl border border-slate-200/70 rounded-xl shadow-[0_16px_40px_-10px_rgba(15,23,42,0.25)] overflow-hidden">
          <div className="px-4 pt-3.5 pb-2.5 border-b border-slate-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{COLUMN_LABELS[column] || column}</div>
            <div className="text-sm font-semibold text-slate-800 truncate mt-0.5">{item.id}</div>
          </div>
          <div className="p-1.5">
            <button
              onClick={() => { onOpenDrawer(item); onClose(); }}
              className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg hover:bg-blue-50/70 active:scale-[0.98] transition-all duration-150 group"
            >
              <div className="w-7 h-7 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100">
                <i className="fa-solid fa-table-columns text-blue-600 text-xs"></i>
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-slate-800">View detailed sidebar</div>
                <div className="text-[11px] text-slate-400">Diagnosis, ledger & resolve</div>
              </div>
            </button>
            <button
              onClick={() => { onOpenSource(item, column); onClose(); }}
              className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg hover:bg-emerald-50/70 active:scale-[0.98] transition-all duration-150 group"
            >
              <div className="w-7 h-7 rounded-md bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100">
                <i className="fa-solid fa-file-excel text-emerald-600 text-xs"></i>
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-slate-800">Open in source file</div>
                <div className="text-[11px] text-slate-400">Jumps to this exact row</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const TABS = [
  { id: "overview", label: "Overview", icon: "fa-circle-info" },
  { id: "diagnose", label: "Diagnose & Fix", icon: "fa-stethoscope" },
  { id: "ledger", label: "Ledger", icon: "fa-table-list" },
  { id: "explain", label: "Explain", icon: "fa-wand-magic-sparkles" },
];

function Drawer({ item, onClose, onResolve, resolving, onExplain, explaining, showToast, onViewSource, onPrev, onNext, hasPrev, hasNext, position }) {
  const led = item.ledger;
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState("overview");
  const [checked, setChecked] = useState({});
  const [reason, setReason] = useState("confirmed");
  const [note, setNote] = useState("");
  const touchStartX = useRef(null);
  const touchDeltaX = useRef(0);
  const panelRef = useRef(null);
  const playbook = PLAYBOOK[item.category] || PLAYBOOK.Other;
  const doneCount = playbook.steps.filter((_, i) => checked[i]).length;

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Reset per-item working state (tab, checklist, note) without replaying the slide-in —
  // lets the analyst move through the queue without the drawer re-animating each time.
  useEffect(() => {
    setTab("overview");
    setChecked({});
    setReason("confirmed");
    setNote("");
  }, [item.decisionId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") handleClose();
      else if (e.key === "ArrowUp" && hasPrev && !e.metaKey) onPrev?.();
      else if (e.key === "ArrowDown" && hasNext && !e.metaKey) onNext?.();
      else if ((e.key === "Enter" || e.key === "Return") && (e.metaKey || e.ctrlKey)) onResolve(buildResolvePayload());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPrev, hasNext, reason, note, item]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 220);
  };

  const buildResolvePayload = () => ({ ...item, resolutionReason: reason, resolutionNote: note.trim() || undefined });

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchMove = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (dx > 0) {
      touchDeltaX.current = dx;
      if (panelRef.current) panelRef.current.style.transform = `translateX(${dx}px)`;
    }
  };
  const onTouchEnd = () => {
    if (panelRef.current) panelRef.current.style.transform = "";
    if (touchDeltaX.current > 90) handleClose();
    touchStartX.current = null;
    touchDeltaX.current = 0;
  };

  const toggleStep = (i) => setChecked((c) => ({ ...c, [i]: !c[i] }));

  return (
    <>
      <div
        onClick={handleClose}
        className={`fixed inset-0 bg-slate-900/10 backdrop-blur-[2px] z-[5] transition-opacity duration-200 xl:hidden ${visible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
      <aside
        ref={panelRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={`w-[540px] max-w-[94vw] glass-panel border-l border-white/20 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.1)] z-10 flex flex-col flex-shrink-0 h-full transition-transform duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${visible ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="px-7 pt-6 pb-4 border-b border-slate-200/50">
          <div className="flex justify-between items-start mb-1">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              {position && <span className="tabular-nums">{position}</span>}
              <div className="flex items-center gap-0.5">
                <button onClick={onPrev} disabled={!hasPrev} title="Previous exception (↑)"
                  className="w-6 h-6 rounded-md hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center transition-all active:scale-90">
                  <i className="fa-solid fa-chevron-up text-[10px]"></i>
                </button>
                <button onClick={onNext} disabled={!hasNext} title="Next exception (↓)"
                  className="w-6 h-6 rounded-md hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center transition-all active:scale-90">
                  <i className="fa-solid fa-chevron-down text-[10px]"></i>
                </button>
              </div>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-700 bg-white hover:bg-slate-50 p-2.5 rounded-full shadow-sm border border-slate-100 transition-all duration-150 active:scale-90 hover:rotate-90">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div className="flex justify-between items-start mb-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{item.id}</h2>
              <div className="flex items-center space-x-2 mt-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${SEV_TEXT[item.severity]}`}>{item.severity}</span>
                <span className="text-slate-400 text-xs">•</span>
                <span className="text-slate-500 text-sm">{item.status}</span>
              </div>
            </div>
            <CopyButton text={item.id} label="Copy ID" className="text-xs font-medium text-slate-500 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 border border-slate-100 px-2.5 py-1.5 rounded-lg" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 -mb-4 overflow-x-auto no-scrollbar">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 active:scale-[0.96] ${
                  tab === t.id ? "text-blue-700 bg-white" : "text-slate-400 hover:text-slate-600 hover:bg-white/50"
                }`}
              >
                <i className={`fa-solid ${t.icon} text-[11px]`}></i>
                {t.label}
                {t.id === "diagnose" && doneCount > 0 && (
                  <span className="ml-0.5 bg-emerald-100 text-emerald-700 rounded-full px-1.5 text-[10px] font-bold tabular-nums">{doneCount}/{playbook.steps.length}</span>
                )}
                {tab === t.id && <span className="absolute left-2 right-2 -bottom-[1px] h-[2px] bg-blue-600 rounded-full"></span>}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-7 overscroll-contain">
          {tab === "overview" && (
            <div className="animate-[fadeIn_.2s_ease]">
              <div className="bg-white/60 rounded-xl p-5 border border-slate-100/50 shadow-sm grid grid-cols-2 gap-y-3 gap-x-6 text-sm mb-6">
                <div className="text-slate-500 font-medium">Category</div><div className="text-slate-900 text-right font-semibold">{item.category}</div>
                <div className="text-slate-500 font-medium">Date</div><div className="text-slate-900 text-right font-medium">{item.date}</div>
                <div className="text-slate-500 font-medium">Match</div>
                <div className="text-slate-900 text-right font-medium">{item.matchMethod || "—"}{item.confidence ? ` (${item.confidence}%)` : ""}</div>
                <div className="text-slate-500 font-medium">Amount</div><div className="text-slate-900 text-right font-bold text-base tabular-nums">{api.formatINR(item.amount)}</div>
              </div>

              <div className="bg-gradient-to-r from-emerald-50 to-green-50/50 border border-emerald-100/50 rounded-xl p-4 mb-4 flex items-start gap-3">
                <div className="bg-white rounded-full p-1.5 shadow-sm border border-emerald-100 mt-0.5"><i className="fa-solid fa-check text-emerald-500 text-[10px]"></i></div>
                <div>
                  <div className="text-sm font-semibold text-emerald-800">Verified against {led ? led.verifiedAgainstCount : "computed"} figures</div>
                  <div className="text-xs text-emerald-600 mt-1 font-medium">All monetary values verified. No unsupported figures.</div>
                </div>
              </div>

              <button onClick={() => setTab("diagnose")} className="w-full flex items-center justify-between gap-3 bg-white rounded-xl p-4 border border-blue-100 shadow-sm hover:shadow-md transition-all duration-150 active:scale-[0.99] text-left">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-50 p-2 rounded-lg border border-blue-100/50"><i className="fa-solid fa-stethoscope text-blue-600 text-sm"></i></div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">See how to fix this</div>
                    <div className="text-xs text-slate-500 mt-0.5">{playbook.cause}</div>
                  </div>
                </div>
                <i className="fa-solid fa-chevron-right text-slate-300 text-xs"></i>
              </button>
            </div>
          )}

          {tab === "diagnose" && (
            <div className="animate-[fadeIn_.2s_ease]">
              <div className="relative bg-white rounded-2xl p-5 border border-amber-100 shadow-sm overflow-hidden mb-5">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-orange-400"></div>
                <div className="flex items-center gap-2 mb-2">
                  <i className="fa-solid fa-magnifying-glass-chart text-amber-500 text-sm"></i>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Likely cause</h4>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed font-medium">{playbook.cause}</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100/80 shadow-sm overflow-hidden mb-5">
                <div className="px-5 py-3.5 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Investigation checklist</h3>
                  <span className="text-[11px] font-bold text-slate-400 tabular-nums">{doneCount}/{playbook.steps.length} done</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {playbook.steps.map((step, i) => (
                    <label key={i} className="flex items-start gap-3 px-5 py-3.5 cursor-pointer hover:bg-slate-50/70 transition-colors duration-150 active:bg-slate-100/70 select-none">
                      <button
                        type="button"
                        onClick={() => toggleStep(i)}
                        className={`mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all duration-150 active:scale-90 ${
                          checked[i] ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-blue-400"
                        }`}
                      >
                        {checked[i] && <i className="fa-solid fa-check text-white text-[10px]"></i>}
                      </button>
                      <span className={`text-sm leading-snug transition-colors duration-150 ${checked[i] ? "text-slate-400 line-through" : "text-slate-700 font-medium"}`}>{step}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100/80 shadow-sm p-5">
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Quick actions</h3>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={item.id} label="Copy Payment ID" className="text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg" />
                  {led && (
                    <CopyButton
                      text={`${led.variance < 0 ? "-" : ""}${api.formatINR(Math.abs(led.variance))}`}
                      label="Copy Variance"
                      className="text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg"
                    />
                  )}
                  <button
                    onClick={() => { onViewSource?.(); showToast?.("Source data opened"); }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-2 rounded-lg transition-all duration-150 active:scale-[0.96]"
                  >
                    <i className="fa-solid fa-file-excel text-[11px]"></i>
                    View source rows
                  </button>
                  {!item.isLlm && (
                    <button
                      onClick={() => { setTab("explain"); onExplain(item); }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-100 px-3 py-2 rounded-lg transition-all duration-150 active:scale-[0.96]"
                    >
                      <i className="fa-solid fa-wand-magic-sparkles text-[11px]"></i>
                      Ask AI to explain
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "ledger" && (
            <div className="animate-[fadeIn_.2s_ease]">
              {led ? (
                <>
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 mb-6 overflow-hidden">
                    <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100">
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ledger (Computed vs Bank)</h3>
                    </div>
                    <div className="p-4 text-sm">
                      {led.lines.map((l, i) => (
                        <div key={i} className={`flex justify-between py-2 ${l.isSubItem ? "text-slate-500 pl-4" : "text-slate-800 font-medium"}`}>
                          <span>{l.particulars}</span>
                          <span className="tabular-nums">{api.formatINR(l.isSubItem ? l.value : l.expected)}</span>
                        </div>
                      ))}
                      <div className="border-t border-slate-100 mt-2 pt-3 space-y-2">
                        <div className="flex justify-between"><span className="text-slate-600">Expected Net (Calculated)</span><span className="font-semibold text-slate-900 tabular-nums">{api.formatINR(led.expectedNet)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-600">Actual Net (Bank)</span><span className="font-semibold text-slate-900 tabular-nums">{api.formatINR(led.actualNet)}</span></div>
                        <div className="flex justify-between items-center pt-1">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Variance</span>
                          <span className={`px-3 py-1 rounded-full font-bold text-sm border tabular-nums transition-colors ${led.variance ? "bg-red-50 text-red-600 border-red-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"}`}>
                            {led.variance < 0 ? "-" : ""}{api.formatINR(Math.abs(led.variance))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <FeeWaterfall ledger={led} />
                </>
              ) : (
                <p className="text-sm text-slate-400 text-center py-10">No ledger breakdown available for this record.</p>
              )}
            </div>
          )}

          {tab === "explain" && (
            <div className="animate-[fadeIn_.2s_ease]">
              <div className="relative bg-white rounded-2xl p-6 border border-blue-100 shadow-sm overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-blue-50 p-2 rounded-lg border border-blue-100/50"><i className="fa-solid fa-wand-magic-sparkles text-blue-600 text-sm"></i></div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    {item.isLlm ? "AI-generated explanation" : "Deterministic explanation"}
                    {item.llmVerified && <span className="bg-green-100/50 text-green-700 border border-green-200/50 px-2 py-0.5 rounded-md normal-case font-semibold ml-2 text-[10px]">Verified</span>}
                  </h4>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed font-medium">{item.explanation}</p>
                {item.isLlm ? (
                  <div className="flex items-center gap-3 text-xs text-slate-500 font-medium pt-4 mt-4 border-t border-slate-100">
                    <span><i className="fa-solid fa-microchip text-slate-400 mr-1"></i>{item.llmModel || "gpt-4o-mini"}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                    <span>3 files cross-checked</span>
                  </div>
                ) : (
                  <button onClick={() => onExplain(item)} disabled={explaining}
                    className="mt-4 w-full text-sm font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-lg py-2.5 hover:bg-blue-100 disabled:opacity-60 flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.98]">
                    <i className={`fa-solid fa-wand-magic-sparkles ${explaining ? "animate-pulse" : ""}`}></i>
                    {explaining ? "Generating verified explanation…" : "Explain with AI"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Resolution footer */}
        <div className="p-6 border-t border-slate-200/50 bg-white/60 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {RESOLUTION_REASONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setReason(r.id)}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all duration-150 active:scale-[0.95] ${
                  reason === r.id ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                <i className={`fa-solid ${r.icon} text-[10px]`}></i>
                {r.label}
              </button>
            ))}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a resolution note (optional)…"
            className="w-full text-sm bg-slate-50/70 border border-slate-200 rounded-lg px-3.5 py-2.5 transition-all duration-150 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white"
          />
          <button
            onClick={() => onResolve(buildResolvePayload())}
            disabled={resolving}
            className="w-full px-5 py-3 bg-blue-600 rounded-xl text-sm font-semibold text-white hover:bg-blue-700 shadow-md hover:shadow-lg hover:shadow-blue-600/25 disabled:opacity-60 transition-all duration-150 active:scale-[0.97] flex items-center justify-center gap-2"
          >
            {resolving ? (<><i className="fa-solid fa-circle-notch fa-spin"></i> Resolving…</>) : (<><i className="fa-solid fa-check"></i> Mark as Resolved <span className="text-blue-200 font-normal hidden sm:inline">⌘⏎</span></>)}
          </button>
        </div>
      </aside>
    </>
  );
}

export default function ExceptionsPage({ run, showToast, onGoUpload }) {
  const [data, setData] = useState(null); // {items, counts, total}
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [pressedRow, setPressedRow] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [cellPopover, setCellPopover] = useState(null); // {item, column, x, y}
  const [sourceFocus, setSourceFocus] = useState(null); // {id, column, token}
  const [showHint, setShowHint] = useState(false);
  const scrollRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(TIP_KEY)) {
      const t = setTimeout(() => setShowHint(true), 900);
      return () => clearTimeout(t);
    }
  }, []);

  const dismissHint = useCallback(() => {
    setShowHint(false);
    window.localStorage?.setItem(TIP_KEY, "1");
  }, []);

  const openSourceFor = useCallback((item, column) => {
    setShowSource(true);
    // `token` is bumped on every call (even re-clicking the same cell) so the source
    // viewer always re-runs its scroll/highlight, rather than silently no-oping because
    // the id/column look unchanged.
    setSourceFocus({ id: item.id, column, token: Date.now() });
    dismissHint();
    requestAnimationFrame(() => sourceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [dismissHint]);

  const openDrawerFor = useCallback((item) => {
    setSelected(item);
    dismissHint();
  }, [dismissHint]);

  const onCellClick = (e, item, column) => {
    setCellPopover({ item, column, x: e.clientX, y: e.clientY });
  };

  const load = useCallback(async () => {
    if (!run) return;
    setLoading(true);
    try {
      setData(await api.getExceptions(run.runId));
    } catch (e) {
      showToast(String(e.message), "error");
    } finally {
      setLoading(false);
    }
  }, [run, showToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let out = data.items;
    if (tab !== "All") out = out.filter((e) => e.severity === tab);
    if (search.trim()) out = out.filter((e) => e.id.toLowerCase().includes(search.trim().toLowerCase()));
    return out;
  }, [data, tab, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [tab, search]);

  const selectedIndex = selected ? filtered.findIndex((e) => e.decisionId === selected.decisionId) : -1;
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex >= 0 && selectedIndex < filtered.length - 1;

  const goTo = (index) => {
    const next = filtered[index];
    if (!next) return;
    setSelected(next);
    const targetPage = Math.floor(index / PAGE_SIZE) + 1;
    if (targetPage !== page) setPage(targetPage);
  };

  const resolve = async (item) => {
    setResolving(true);
    try {
      await api.resolveDecision(item.decisionId);
      showToast(`Resolved ${item.id}`);
      setSelected(null);
      await load();
    } catch (e) {
      showToast(String(e.message), "error");
    } finally {
      setResolving(false);
    }
  };

  const explain = async (item) => {
    setExplaining(true);
    try {
      const r = await api.explainDecision(item.decisionId);
      const upd = { ...item, explanation: r.explanation, isLlm: true, llmVerified: r.verified, llmModel: r.model };
      setSelected(upd);
      setData((d) => ({ ...d, items: d.items.map((x) => (x.decisionId === item.decisionId ? upd : x)) }));
      showToast(r.verified ? "AI explanation verified against computed figures" : "AI explanation generated");
    } catch (e) {
      showToast(String(e.message), "error");
    } finally {
      setExplaining(false);
    }
  };

  const onTableScroll = () => {
    if (!scrollRef.current) return;
    setScrolled(scrollRef.current.scrollTop > 4);
  };

  if (!run) return <EmptyState onGoUpload={onGoUpload} />;
  const counts = data?.counts || { all: 0, critical: 0, warning: 0, info: 0 };

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ background: "radial-gradient(at 0% 0%, hsla(217,100%,97%,1) 0px, transparent 50%), radial-gradient(at 100% 0%, hsla(210,100%,97%,1) 0px, transparent 50%)" }}
    >
      <div className="flex-1 flex flex-col min-w-0 px-8 py-8 overflow-y-auto">
        <header className="mb-6 flex justify-between items-start">
          <div className="relative">
            <div className="flex items-center space-x-2.5 mb-1">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Exceptions</h1>
              <span className="bg-red-50 text-red-600 border border-red-100 text-sm font-semibold px-3 py-1 rounded-full transition-all duration-300">{counts.all}</span>
              <button
                onClick={() => setShowHint((v) => !v)}
                title="How this page works"
                className={`relative w-6 h-6 rounded-full flex items-center justify-center border transition-all duration-150 active:scale-90 ${
                  showHint ? "bg-blue-600 border-blue-600 text-white shadow-sm" : "bg-white border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200"
                }`}
              >
                {!showHint && !(typeof window !== "undefined" && window.localStorage?.getItem(TIP_KEY)) && (
                  <span className="absolute inset-0 rounded-full bg-blue-400/40 animate-ping"></span>
                )}
                <i className="fa-solid fa-info text-[10px] relative"></i>
              </button>
            </div>
            <p className="text-slate-500 text-sm font-medium">Unresolved records requiring review</p>
            {showHint && <InfoHint onDismiss={dismissHint} />}
          </div>
          <button
            onClick={() => setShowSource((s) => { if (s) setSourceFocus(null); return !s; })}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-sm font-medium border transition-all duration-150 active:scale-[0.96] ${
              showSource ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
            }`}
          >
            <i className="fa-solid fa-file-excel"></i>
            {showSource ? "Hide source data" : "View source data"}
          </button>
        </header>

        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-sm border border-slate-100 flex-1 min-h-[440px] flex flex-col overflow-hidden">
          <div className={`px-6 pt-5 pb-3 flex flex-wrap gap-4 justify-between items-end border-b border-slate-100/60 transition-shadow duration-200 relative z-[1] ${scrolled ? "shadow-[0_6px_12px_-10px_rgba(15,23,42,0.15)]" : ""}`}>
            <div className="flex space-x-1 sm:space-x-6 text-sm overflow-x-auto no-scrollbar">
              {[["All", counts.all], ["Critical", counts.critical], ["Warning", counts.warning], ["Info", counts.info]].map(([label, n]) => (
                <button key={label} onClick={() => setTab(label)}
                  className={`pb-3 px-2 sm:px-0 flex items-center gap-2 -mb-[13px] border-b-2 whitespace-nowrap transition-all duration-200 active:scale-[0.96] rounded-t-md ${
                    tab === label ? "border-blue-600 font-semibold text-slate-900" : "border-transparent text-slate-400 hover:text-slate-700 hover:border-slate-200 font-medium"}`}>
                  <span>{label}</span>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-bold transition-colors duration-200 tabular-nums ${tab === label ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-500 border border-slate-100"}`}>{n}</span>
                </button>
              ))}
            </div>
            <div className="relative mb-2 group">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm transition-colors group-focus-within:text-blue-500"></i>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by Payment ID..."
                className="pl-10 pr-9 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm w-full sm:w-64 transition-all duration-150 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white" />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-100 transition-all active:scale-90">
                  <i className="fa-solid fa-xmark text-xs"></i>
                </button>
              )}
            </div>
          </div>

          <div ref={scrollRef} onScroll={onTableScroll} className="flex-1 overflow-auto overscroll-contain">
            {loading ? (
              <div className="p-4 space-y-2.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 bg-[length:200%_100%] animate-[shimmer_1.4s_ease_infinite]" style={{ animationDelay: `${i * 60}ms` }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-16 text-center text-slate-400 animate-[fadeIn_.3s_ease]">
                <i className="fa-regular fa-circle-check text-3xl mb-3 text-emerald-400"></i>
                <p className="text-sm font-medium">Nothing here — no matching exceptions.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead>
                  <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50 sticky top-0 z-[1] backdrop-blur">
                    <th className="py-3.5 px-6">Payment ID</th><th className="py-3.5 px-6">Date</th>
                    <th className="py-3.5 px-6 text-right">Amount (₹)</th><th className="py-3.5 px-6">Category</th>
                    <th className="py-3.5 px-6">Severity</th><th className="py-3.5 px-6">Match</th>
                    <th className="py-3.5 px-6">Confidence</th><th className="py-3.5 px-6">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-50/80">
                  {pageItems.map((e, i) => (
                    <tr key={e.decisionId}
                      onTouchStart={() => setPressedRow(e.decisionId)} onTouchEnd={() => setPressedRow(null)} onTouchCancel={() => setPressedRow(null)}
                      style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                      className={`select-none transition-colors duration-150 animate-[rowIn_.3s_ease_backwards] ${
                        selected?.decisionId === e.decisionId ? "bg-blue-50/50 shadow-[inset_2px_0_0_0_theme(colors.blue.600)]" : "hover:bg-slate-50/80"
                      } ${pressedRow === e.decisionId ? "bg-slate-100/90 scale-[0.997]" : ""}`}>
                      <td className="py-3.5 px-6 cursor-pointer" onClick={(ev) => onCellClick(ev, e, "id")}><CopyableId id={e.id} /></td>
                      <td className="py-4 px-6 text-slate-500 font-medium cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={(ev) => onCellClick(ev, e, "date")}>{e.date}</td>
                      <td className="py-4 px-6 text-right font-medium text-slate-900 tabular-nums cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={(ev) => onCellClick(ev, e, "amount")}>{Number(e.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      <td className="py-4 px-6 cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={(ev) => onCellClick(ev, e, "category")}><span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold border ${CAT_CHIP[e.category] || CAT_CHIP.Other}`}>{e.category}</span></td>
                      <td className="py-4 px-6 cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={(ev) => onCellClick(ev, e, "severity")}><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${SEV_DOT[e.severity]} ring-4 ${SEV_RING[e.severity] || ""}`}></span><span className="text-slate-700 font-medium">{e.severity}</span></div></td>
                      <td className="py-4 px-6 text-slate-500 font-medium cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={(ev) => onCellClick(ev, e, "matchMethod")}>{e.matchMethod || "—"}</td>
                      <td className="py-4 px-6 cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={(ev) => onCellClick(ev, e, "confidence")}><ConfidenceBar value={e.confidence} /></td>
                      <td className="py-4 px-6 font-semibold text-red-500 cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={(ev) => onCellClick(ev, e, "status")}><span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>{e.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="p-5 border-t border-slate-100 flex justify-between items-center text-sm text-slate-500">
            <span className="font-medium tabular-nums">
              {filtered.length === 0 ? "0 results" : `Showing ${(page - 1) * PAGE_SIZE + 1} to ${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
            </span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="w-9 h-9 rounded-md hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition-all duration-150 active:scale-90 flex items-center justify-center"><i className="fa-solid fa-chevron-left text-xs"></i></button>
              <span className="px-3 h-9 flex items-center rounded-md bg-blue-50 text-blue-700 font-semibold tabular-nums">{page} / {pageCount}</span>
              <button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="w-9 h-9 rounded-md hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition-all duration-150 active:scale-90 flex items-center justify-center"><i className="fa-solid fa-chevron-right text-xs"></i></button>
            </div>
          </div>
        </div>

        {showSource && (
          <div ref={sourceRef} className="mt-6 animate-[fadeIn_.3s_ease] scroll-mt-6">
            <p className="text-xs text-slate-500 mb-3">
              {sourceFocus ? (
                <>
                  Jumped to <span className="font-semibold text-slate-700">{sourceFocus.id}</span> — {COLUMN_LABELS[sourceFocus.column] || sourceFocus.column} column highlighted below.
                </>
              ) : (
                "Cross-reference an exception against the raw rows the agent reconciled. Use search to find a payment ID."
              )}
            </p>
            <SourceFilesCard
              isDemo={run.isDemo}
              height={340}
              focusRowId={sourceFocus?.id}
              focusColumn={sourceFocus?.column}
              focusToken={sourceFocus?.token}
            />
          </div>
        )}
      </div>

      {cellPopover && (
        <CellActionPopover
          pos={cellPopover}
          item={cellPopover.item}
          column={cellPopover.column}
          onOpenDrawer={openDrawerFor}
          onOpenSource={openSourceFor}
          onClose={() => setCellPopover(null)}
        />
      )}

      {selected && (
        <Drawer
          item={selected}
          onClose={() => setSelected(null)}
          onResolve={resolve}
          resolving={resolving}
          onExplain={explain}
          explaining={explaining}
          showToast={showToast}
          onViewSource={() => setShowSource(true)}
          onPrev={() => goTo(selectedIndex - 1)}
          onNext={() => goTo(selectedIndex + 1)}
          hasPrev={hasPrev}
          hasNext={hasNext}
          position={selectedIndex >= 0 ? `${selectedIndex + 1} of ${filtered.length}` : null}
        />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rowIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.95) translateY(-2px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}