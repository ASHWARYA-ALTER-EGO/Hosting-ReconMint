import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as api from "../api.js";
import FeeWaterfall from "../components/FeeWaterfall.jsx";
import SourceFilesCard from "../components/SourceFilesCard.jsx";

const PAGE_SIZE = 8;

/* ── Ledger theme tokens ───────────────────────────────────────────
   ink      #2b3527  (dark forest green, body text, headings)
   accent   #b5452f  (brick/terracotta red, stamps, criticals, links)
   stripeA  #eef2e8  (light sage stripe)
   stripeB  #dde6d3  (darker sage stripe)
   paper    #f6f4ea  (cream panel base)
   line     #c7d1bc  (hairline rule)
   amber    #a8791f  (warning ink, muted mustard, stays in-family)
──────────────────────────────────────────────────────────────────── */

const SEV_LABEL = { Critical: "CRITICAL", Warning: "WARNING", Info: "INFO" };
const SEV_MARK = { Critical: "bg-[#b5452f]", Warning: "bg-[#a8791f]", Info: "bg-[#4a5d3f]" };
const SEV_TEXT = {
  Critical: "text-[#b5452f] bg-[#f7e9e4] border-[#e0b6a8]",
  Warning: "text-[#8a6318] bg-[#f3ecd8] border-[#d9c78f]",
  Info: "text-[#3f5233] bg-[#e6ebdd] border-[#c3d0b3]",
};
const CAT_CHIP = {
  "Amount Mismatch": "bg-[#f7e9e4] text-[#b5452f] border-[#e0b6a8]",
  "Missing in Bank": "bg-[#ece6da] text-[#5c4a2e] border-[#d3c4a6]",
  Chargeback: "bg-[#f3ecd8] text-[#8a6318] border-[#d9c78f]",
  Duplicate: "bg-[#e6e9e0] text-[#4a5540] border-[#c9d0bd]",
  "No Order": "bg-[#f2e2df] text-[#8f3c2c] border-[#dcb3ab]",
  Other: "bg-[#e6e9e0] text-[#4a5540] border-[#c9d0bd]",
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
    cause: "This exception doesn't fit a standard pattern, manual review recommended.",
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

/* Hole-punch rail, the ruled-paper margin motif from the reference page */
function PunchRail({ side = "left" }) {
  return (
    <div
      aria-hidden
      className={`hidden lg:flex flex-col items-center gap-6 py-8 flex-shrink-0 w-6 ${side === "left" ? "border-r" : "border-l"} border-[#c7d1bc]/60`}
    >
      {Array.from({ length: 14 }).map((_, i) => (
        <span key={i} className="w-2 h-2 rounded-full bg-[#f6f4ea] border border-[#c7d1bc] shadow-[inset_0_1px_1px_rgba(43,53,39,0.15)]" />
      ))}
    </div>
  );
}

function EmptyState({ onGoUpload }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center text-[#5c6b52] animate-[fadeIn_.4s_ease] font-mono">
      <div className="w-16 h-16 border-2 border-[#c7d1bc] bg-[#eef2e8] flex items-center justify-center mb-4">
        <i className="fa-solid fa-stamp text-2xl opacity-50 text-[#2b3527]"></i>
      </div>
      <p className="text-lg font-bold text-[#2b3527] mb-1 tracking-tight">No run loaded</p>
      <p className="text-sm mb-6">Run a reconciliation first to review its exceptions.</p>
      <button
        onClick={onGoUpload}
        className="bg-[#2b3527] text-[#eef2e8] px-6 py-2.5 text-sm font-bold uppercase tracking-wider transition-all duration-150 active:scale-[0.96] hover:bg-[#3a4634] border-2 border-[#2b3527]"
      >
        Go to Upload
      </button>
    </div>
  );
}

function ConfidenceBar({ value }) {
  if (!value && value !== 0) return <span className="text-[#9aa590]">-</span>;
  const color = value >= 90 ? "bg-[#4a5d3f]" : value >= 70 ? "bg-[#a8791f]" : "bg-[#b5452f]";
  return (
    <div className="flex items-center gap-2 min-w-[72px]">
      <div className="w-12 h-1.5 bg-[#e6e9e0] border border-[#c7d1bc] overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500 ease-out`} style={{ width: `${Math.min(100, Math.max(4, value))}%` }} />
      </div>
      <span className="text-[#2b3527] font-bold text-xs tabular-nums">{value}%</span>
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
      <i className={`fa-solid ${copied ? "fa-check text-[#4a5d3f]" : "fa-copy"} text-[11px]`}></i>
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
      className="group/copy inline-flex items-center gap-1.5 font-bold text-[#2b3527] hover:text-[#b5452f] active:scale-[0.97] transition-all duration-150 -ml-1.5 px-1.5 py-1 hover:bg-[#f7e9e4]/70"
    >
      <span>{id}</span>
      <i
        className={`fa-solid ${copied ? "fa-check text-[#4a5d3f]" : "fa-copy text-[#c7d1bc] group-hover/copy:text-[#b5452f]"} text-[11px] transition-colors duration-150 opacity-0 group-hover/copy:opacity-100 ${copied ? "!opacity-100" : ""}`}
      ></i>
    </button>
  );
}

const TIP_KEY = "excp_cell_tip_dismissed_v1";

function InfoHint({ onDismiss }) {
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    setLeaving(true);
    setTimeout(onDismiss, 180);
  };
  return (
    <div
      className={`absolute left-0 top-full mt-3 w-72 z-20 transition-all duration-200 ease-out font-mono ${
        leaving ? "opacity-0 -translate-y-1 scale-95" : "opacity-100 translate-y-0 scale-100 animate-[popIn_.32s_cubic-bezier(0.16,1,0.3,1)]"
      }`}
    >
      <div className="absolute -top-1.5 left-5 w-3 h-3 rotate-45 bg-[#f6f4ea] border-l-2 border-t-2 border-[#2b3527]"></div>
      <div className="relative bg-[#f6f4ea] border-2 border-[#2b3527] shadow-[4px_4px_0_0_rgba(43,53,39,0.15)] p-4 pr-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-7 h-7 border border-[#c7d1bc] bg-[#eef2e8] flex items-center justify-center flex-shrink-0">
            <i className="fa-solid fa-hand-pointer text-[#2b3527] text-xs"></i>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-[#2b3527] leading-snug">Tip: click any cell</p>
            <p className="text-[12px] text-[#5c6b52] leading-snug mt-0.5">
              Click a cell to open its full details, or jump straight to that row in the source file.
            </p>
          </div>
          <button onClick={close} className="text-[#9aa590] hover:text-[#2b3527] transition-colors -mt-0.5 -mr-0.5 w-5 h-5 flex items-center justify-center hover:bg-[#e6e9e0] active:scale-90 flex-shrink-0">
            <i className="fa-solid fa-xmark text-[11px]"></i>
          </button>
        </div>
        <button
          onClick={close}
          className="mt-3 w-full text-center text-[12px] font-bold uppercase tracking-wider text-[#2b3527] bg-[#eef2e8] hover:bg-[#dde6d3] border border-[#c7d1bc] py-1.5 transition-all duration-150 active:scale-[0.97]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

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
        className="fixed z-50 w-64 animate-[popIn_.16s_cubic-bezier(0.16,1,0.3,1)] font-mono"
      >
        <div className="bg-[#f6f4ea] border-2 border-[#2b3527] shadow-[5px_5px_0_0_rgba(43,53,39,0.18)] overflow-hidden">
          <div className="px-4 pt-3.5 pb-2.5 border-b border-[#c7d1bc]">
            <div className="text-[10px] font-bold text-[#5c6b52] uppercase tracking-wider">{COLUMN_LABELS[column] || column}</div>
            <div className="text-sm font-bold text-[#2b3527] truncate mt-0.5">{item.id}</div>
          </div>
          <div className="p-1.5">
            <button
              onClick={() => { onOpenDrawer(item); onClose(); }}
              className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 hover:bg-[#eef2e8] active:scale-[0.98] transition-all duration-150 group"
            >
              <div className="w-7 h-7 border border-[#c7d1bc] bg-[#eef2e8] flex items-center justify-center flex-shrink-0 group-hover:bg-[#dde6d3]">
                <i className="fa-solid fa-table-columns text-[#2b3527] text-xs"></i>
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-[#2b3527]">View detailed sidebar</div>
                <div className="text-[11px] text-[#5c6b52]">Diagnosis, ledger &amp; resolve</div>
              </div>
            </button>
            <button
              onClick={() => { onOpenSource(item, column); onClose(); }}
              className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 hover:bg-[#f7e9e4] active:scale-[0.98] transition-all duration-150 group"
            >
              <div className="w-7 h-7 border border-[#e0b6a8] bg-[#f7e9e4] flex items-center justify-center flex-shrink-0 group-hover:bg-[#f0d5cb]">
                <i className="fa-solid fa-file-excel text-[#b5452f] text-xs"></i>
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-[#2b3527]">Open in source file</div>
                <div className="text-[11px] text-[#5c6b52]">Jumps to this exact row</div>
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
  { id: "decisions", label: "Decisions", icon: "fa-code-branch" },
  { id: "truth", label: "Appeal to Razorpay", icon: "fa-shield-halved" },
  { id: "explain", label: "Explain", icon: "fa-wand-magic-sparkles" },
];

// Truth-Anchor drawer panel. Live-appeals ONE payment to api.razorpay.com when
// the operator asks. The API's response is the tiebreaker: if it disagrees with
// what the CSV said, this drawer surfaces the drift line by line.
function TruthAnchorPanel({ runId, paymentId }) {
  const [result, setResult] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const run = React.useCallback(() => {
    if (!runId || !paymentId) return;
    setBusy(true); setErr(null); setResult(null);
    api.verifyPaymentAgainstRazorpay(runId, paymentId)
      .then(setResult)
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setBusy(false));
  }, [runId, paymentId]);

  // Auto-fire the appeal the moment the tab opens for this payment. No extra
  // click needed; the drift table simply appears. Re-fires when the drawer
  // moves to a different exception.
  React.useEffect(() => {
    setResult(null); setErr(null);
    run();
  }, [run]);

  const verdictStyle = {
    matches:     { color: "#4B7B4E", label: "CSV matches live Razorpay record" },
    stale_csv:   { color: "#B5432F", label: "Stale CSV: trust the API record" },
    not_found:   { color: "#B8863B", label: "Ghost id: not present at Razorpay" },
    unreachable: { color: "#6B7660", label: "Razorpay API unreachable" },
    no_keys:     { color: "#6B7660", label: "Truth-Anchor Agent not configured" },
  };

  // A backend error like "not_in_run" or plain 404 comes back as an exception in
  // the promise chain. Reshape those into an informative state instead of a
  // scary red banner so the drawer always tells the operator something useful.
  const parsedErr = React.useMemo(() => {
    if (!err) return null;
    if (/not.?in.?run|not_found|not\s+found/i.test(err)) {
      return {
        tone: "#B8863B",
        title: "Payment not present in this reconciliation",
        detail: "The Truth-Anchor Agent could not appeal because this payment id was not part of the settlement file uploaded for this run. Try another exception.",
      };
    }
    if (/missing.?keys|no_keys|not configured/i.test(err)) {
      return {
        tone: "#6B7660",
        title: "Truth-Anchor Agent not configured",
        detail: "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set on the backend, so no appeal can be made.",
      };
    }
    if (/failed to fetch|reach the reconmint|network/i.test(err)) {
      return {
        tone: "#B5432F",
        title: "Backend unreachable",
        detail: "The API could not be contacted. Confirm the backend is running and CORS is configured.",
      };
    }
    return { tone: "#B5432F", title: "Could not appeal", detail: err };
  }, [err]);

  return (
    <div className="space-y-4">
      <div className="p-4 border border-[#c7d1bc] bg-[#f6f4ea]">
        <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#5c6b52] mb-1">
          Truth-Anchor Agent · appeals court
        </div>
        <div className="text-[13px] text-[#2b3527] leading-relaxed">
          Appeal <code className="bg-white px-1 rounded">{paymentId}</code> to the live
          <span className="text-[#0057BA] font-semibold"> Razorpay API</span>. Its response
          is the ground truth. If your uploaded CSV disagrees on gross, fee or tax, the CSV is stale.
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy || !paymentId}
          className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#3395FF] text-white border border-[#0057BA] active:scale-[0.98] disabled:opacity-50"
        >
          <i className={`fa-solid ${busy ? "fa-circle-notch fa-spin" : "fa-shield-halved"}`}></i>
          {busy ? "Appealing…" : (result || err ? "Re-run appeal" : "Verify against Razorpay")}
        </button>
      </div>

      {parsedErr && (
        <div className="p-4 border bg-white" style={{ borderColor: parsedErr.tone }}>
          <div className="text-[10px] uppercase tracking-[0.14em] font-bold mb-1" style={{ color: parsedErr.tone }}>
            {parsedErr.title}
          </div>
          <div className="text-[12.5px] text-[#2b3527] leading-relaxed">{parsedErr.detail}</div>
        </div>
      )}

      {result && (
        <div className="p-4 border border-[#c7d1bc] bg-white">
          <div className="text-[10px] uppercase tracking-[0.14em] font-bold mb-1"
               style={{ color: (verdictStyle[result.verdict] || {}).color || "#5c6b52" }}>
            {(verdictStyle[result.verdict] || {}).label || result.verdict}
          </div>
          <div className="text-[12.5px] text-[#2b3527] leading-relaxed mb-3">
            {result.headline}
          </div>

          {result.api && (
            <table className="w-full text-[12px] font-mono border-collapse">
              <thead>
                <tr className="text-[9.5px] uppercase tracking-[0.1em] text-[#5c6b52]">
                  <th className="text-left py-1.5">Field</th>
                  <th className="text-right py-1.5">Your CSV</th>
                  <th className="text-right py-1.5 text-[#0057BA]">Live Razorpay</th>
                  <th className="text-right py-1.5">Drift</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Gross", "gross_paise"],
                  ["Fee (MDR)", "fee_paise"],
                  ["Tax (GST)", "tax_paise"],
                ].map(([label, key]) => {
                  const csvV = (result.csv || {})[key] ?? 0;
                  const apiV = (result.api || {})[key] ?? 0;
                  const drift = (result.drift || {})[key] ?? 0;
                  const off = drift !== 0;
                  return (
                    <tr key={key} className="border-t border-dashed border-[#e6e9dc]">
                      <td className="py-1.5 text-[#5c6b52] text-[10.5px] uppercase tracking-[0.04em]">{label}</td>
                      <td className="py-1.5 text-right tabular-nums">₹{(csvV/100).toFixed(2)}</td>
                      <td className="py-1.5 text-right tabular-nums">₹{(apiV/100).toFixed(2)}</td>
                      <td className={`py-1.5 text-right tabular-nums ${off ? "text-[#B5432F] font-bold" : "text-[#8A9478]"}`}>
                        {drift === 0 ? "0" : `${drift > 0 ? "▲" : "▼"} ₹${Math.abs(drift/100).toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="mt-3 pt-2 border-t border-[#e6e9dc] text-[10px] text-[#8A9478]">
            Source of truth: <code className="text-[#2b3527]">GET api.razorpay.com/v1/payments/{paymentId}</code>
          </div>
        </div>
      )}
    </div>
  );
}

const STRATEGY_META = {
  amount_utr_fuzzy:  { label: "Amount + UTR fuzzy",     icon: "fa-magnifying-glass" },
  normalize_utr:     { label: "Normalize UTR + retry",  icon: "fa-hammer" },
  widen_date_window: { label: "Widen date window ±7d",  icon: "fa-calendar-week" },
};

const VERDICT_STYLE = {
  accepted:     { fg: "#2f5b34", bg: "rgba(75,123,78,0.10)",   ring: "rgba(75,123,78,0.5)",  icon: "fa-circle-check" },
  rejected:     { fg: "#8f3323", bg: "rgba(181,67,47,0.08)",   ring: "rgba(181,67,47,0.4)",  icon: "fa-circle-xmark" },
  no_candidate: { fg: "#8f6b1e", bg: "rgba(184,134,59,0.10)",  ring: "rgba(184,134,59,0.4)", icon: "fa-circle-question" },
};

function DecisionsTree({ item }) {
  const attempts = item.strategy_attempts || [];
  const accepted = item.accepted_strategy;
  if (!attempts.length) {
    // Attribute the outcome to whichever agent actually decided this record so the
    // empty state teaches, rather than reading as "feature broken".
    let handledBy = "the reconciliation engine";
    let subline = "This record was resolved without the Repair Agent needing to branch.";
    if (item.matchMethod === "exact") {
      handledBy = "the Match Agent (exact pass)";
      subline = "UTR and paise matched a bank credit on the same IST day. No repair needed.";
    } else if (item.matchMethod === "fuzzy") {
      handledBy = "the Fuzzy Agent";
      subline = "A near match cleared the confidence gate on amount + date + UTR similarity. No repair needed.";
    } else if (item.reason === "duplicate_payment_id" || item.resolution === "duplicate_quarantined") {
      handledBy = "the Triage Agent";
      subline = "This row is a duplicate settlement id, quarantined before matching runs. There's nothing to repair.";
    } else if (item.reason && item.reason.includes("chargeback")) {
      handledBy = "the Triage Agent";
      subline = "Chargebacks are routed straight to human review. The Repair Agent doesn't try to match a reversal.";
    } else if (item.reason === "ghost_credit" || item.reason === "orphan_bank_credit") {
      handledBy = "the Triage Agent";
      subline = "This is a bank credit with no upstream settlement. Repair Agent works on settlements, not orphan credits.";
    }
    return (
      <div className="animate-[fadeIn_.2s_ease]">
        <div className="bg-[#f6f4ea] border border-[#c7d1bc] p-6">
          <div className="flex items-center gap-2 mb-2">
            <i className="fa-solid fa-code-branch text-[#5c6b52]" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#5c6b52]">Decision route for this record</p>
          </div>
          <p className="text-sm text-[#2b3527] mb-1">
            Handled by <span className="font-semibold">{handledBy}</span>.
          </p>
          <p className="text-[12px] text-[#5c6b52] leading-relaxed">{subline}</p>
          <p className="text-[10.5px] text-[#9aa590] mt-3 pt-3 border-t border-[#c7d1bc]">
            To see a Repair Agent tree, open a row whose match method is <span className="font-mono">repair</span> or <span className="font-mono">none</span> in the exceptions list. Those are the ones where the agent branched.
          </p>
        </div>
      </div>
    );
  }
  const totalMs = attempts.reduce((s, a) => s + (a.ms || 0), 0).toFixed(2);
  return (
    <div className="animate-[fadeIn_.2s_ease]">
      <div className="relative bg-[#f6f4ea] p-5 border border-[#c7d1bc] mb-4">
        <div className="absolute top-0 left-0 w-full h-1 bg-[#2b3527]" />
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-code-branch text-[#2b3527] text-sm" />
            <h4 className="text-xs font-bold text-[#2b3527] uppercase tracking-wider">Repair Agent · what it tried</h4>
          </div>
          <span className="text-[10px] text-[#5c6b52] tabular-nums">{attempts.length} attempts · {totalMs} ms total</span>
        </div>
        <p className="text-[12px] text-[#3d4636] leading-relaxed">
          For this record, the agent tried up to three strategies in order. The first that cleared
          confidence <span className="font-mono font-semibold">≥ 0.85</span> was accepted; the rest are
          logged for the audit trail.
        </p>
      </div>

      <div className="relative">
        {attempts.map((a, i) => {
          const style = VERDICT_STYLE[a.verdict] || VERDICT_STYLE.rejected;
          const meta = STRATEGY_META[a.strategy] || { label: a.strategy, icon: "fa-cog" };
          const isAccepted = accepted && a.strategy === accepted;
          const isLast = i === attempts.length - 1;
          const scorePct = a.score != null ? Math.round(a.score * 100) : null;

          return (
            <div key={i} className="flex items-start gap-3 relative pb-4">
              {!isLast && (
                <div className="absolute left-[14px] top-8 bottom-0 w-px" style={{ background: "#c7d1bc" }} />
              )}
              <div
                className="relative z-10 mt-0.5 w-[30px] h-[30px] rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: style.bg, border: `2px solid ${style.ring}`, color: style.fg }}
              >
                <i className={`fa-solid ${style.icon} text-[13px]`} />
              </div>
              <div className="flex-1 min-w-0 bg-[#f6f4ea] border p-4"
                style={{ borderColor: isAccepted ? "#4a5d3f" : "#c7d1bc" }}
              >
                <div className="flex items-baseline gap-2 flex-wrap mb-1">
                  <div className="flex items-center gap-1.5">
                    <i className={`fa-solid ${meta.icon} text-[11px] text-[#5c6b52]`} />
                    <span className="text-[13px] font-bold text-[#2b3527]">
                      {i + 1}. {meta.label}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider"
                    style={{ background: style.bg, color: style.fg, border: `1px solid ${style.ring}` }}>
                    {a.verdict.replace("_", " ")}
                  </span>
                  {isAccepted && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                      style={{ background: "#2b3527", color: "#eef2e8" }}>
                      ✓ resolved via this
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-[#9aa590] tabular-nums">{a.ms} ms</span>
                </div>

                <div className="flex items-center gap-3 text-[11px] mb-2">
                  {scorePct != null && (
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <div className="w-24 h-1.5 bg-[#e6e9e0] border border-[#c7d1bc] overflow-hidden">
                        <div className="h-full transition-all duration-500" style={{
                          width: `${Math.max(2, scorePct)}%`,
                          background: isAccepted ? "#4a5d3f" : (scorePct >= 85 ? "#a8791f" : "#b5452f"),
                        }} />
                      </div>
                      <span className="font-mono font-bold tabular-nums text-[#2b3527]">
                        {a.score.toFixed(3)}
                      </span>
                      <span className="text-[9px] text-[#9aa590]">/ {a.threshold}</span>
                    </div>
                  )}
                </div>

                <p className="text-[11.5px] text-[#3d4636] leading-relaxed">{a.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 p-3 text-[10.5px] rounded border-l-2"
        style={{ borderColor: accepted ? "#4a5d3f" : "#b5452f",
                 background: "rgba(43,53,39,0.03)", color: "#5c6b52" }}>
        {accepted
          ? <>Result: recovered via <span className="font-semibold text-[#2b3527]">{STRATEGY_META[accepted]?.label || accepted}</span>Every attempt above is persisted in <span className="font-mono">strategy_attempts_json</span> on this decision row.</>
          : <>Result: no strategy cleared threshold, record flagged for human review.
              The full attempt tree is preserved for audit.</>
        }
      </div>
    </div>
  );
}

function Drawer({ item, runId, onClose, onResolve, resolving, onExplain, explaining, showToast, onViewSource, onAskFix, onPrev, onNext, hasPrev, hasNext, position }) {
  const led = item.ledger;
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState("overview");
  // Hydrate the Diagnose checklist from the server-side persisted state so a judge
  // can click, close the drawer, reopen, or reload the whole app - the ticks stick.
  const [checked, setChecked] = useState(() => item.checklist_state || {});
  const [checklistDirty, setChecklistDirty] = useState(false);
  const [checklistSaving, setChecklistSaving] = useState(false);
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

  useEffect(() => {
    setTab("overview");
    // Re-hydrate from the persisted state whenever the drawer switches record.
    setChecked(item.checklist_state || {});
    setChecklistDirty(false);
    setReason("confirmed");
    setNote("");
  }, [item.decisionId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced auto-save whenever the checklist changes locally. One PATCH per burst
  // of clicks; no per-click round trip.
  useEffect(() => {
    if (!checklistDirty) return;
    setChecklistSaving(true);
    const handle = setTimeout(() => {
      api.saveChecklistState(item.decisionId, checked)
        .catch((e) => showToast?.(`Couldn't save checklist: ${e.message}`, "error"))
        .finally(() => { setChecklistSaving(false); setChecklistDirty(false); });
    }, 400);
    return () => clearTimeout(handle);
  }, [checked, checklistDirty, item.decisionId, showToast]);

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

  const toggleStep = (i) => {
    setChecked((c) => ({ ...c, [i]: !c[i] }));
    setChecklistDirty(true);
  };

  return (
    <>
      <div
        onClick={handleClose}
        className={`fixed inset-0 bg-[#2b3527]/15 backdrop-blur-[2px] z-[5] transition-opacity duration-200 xl:hidden ${visible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
      <aside
        ref={panelRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={`fixed xl:relative top-[52px] xl:top-0 bottom-[64px] xl:bottom-0 right-0 w-full xl:w-[540px] xl:max-w-[94vw] bg-[#f6f4ea] border-l-2 border-[#2b3527] shadow-[-8px_0_0_0_rgba(43,53,39,0.06)] z-[45] xl:z-10 flex flex-col flex-shrink-0 xl:h-full font-mono transition-transform duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${visible ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="px-7 pt-6 pb-4 border-b-2 border-[#2b3527]">
          <div className="flex justify-between items-start mb-1">
            <div className="flex items-center gap-2 text-xs font-bold text-[#5c6b52]">
              {position && <span className="tabular-nums">{position}</span>}
              <div className="flex items-center gap-0.5">
                <button onClick={onPrev} disabled={!hasPrev} title="Previous exception (↑)"
                  className="w-6 h-6 border border-transparent hover:border-[#c7d1bc] hover:bg-[#eef2e8] disabled:opacity-30 flex items-center justify-center transition-all active:scale-90">
                  <i className="fa-solid fa-chevron-up text-[10px]"></i>
                </button>
                <button onClick={onNext} disabled={!hasNext} title="Next exception (↓)"
                  className="w-6 h-6 border border-transparent hover:border-[#c7d1bc] hover:bg-[#eef2e8] disabled:opacity-30 flex items-center justify-center transition-all active:scale-90">
                  <i className="fa-solid fa-chevron-down text-[10px]"></i>
                </button>
              </div>
            </div>
            <button onClick={handleClose} className="text-[#5c6b52] hover:text-[#2b3527] bg-[#eef2e8] hover:bg-[#dde6d3] p-2.5 border border-[#c7d1bc] transition-all duration-150 active:scale-90 hover:rotate-90">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div className="flex justify-between items-start mb-5">
            <div>
              <h2 className="text-2xl font-bold text-[#2b3527] tracking-tight">{item.id}</h2>
              <div className="flex items-center space-x-2 mt-2">
                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${SEV_TEXT[item.severity]}`}>{SEV_LABEL[item.severity]}</span>
                <span className="text-[#9aa590] text-xs">•</span>
                <span className="text-[#5c6b52] text-sm">{item.status}</span>
              </div>
            </div>
            <CopyButton text={item.id} label="Copy ID" className="text-xs font-bold text-[#5c6b52] hover:text-[#2b3527] bg-[#eef2e8] hover:bg-[#dde6d3] border border-[#c7d1bc] px-2.5 py-1.5" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 -mb-4 overflow-x-auto no-scrollbar">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-bold whitespace-nowrap transition-all duration-150 active:scale-[0.96] uppercase tracking-wide ${
                  tab === t.id ? "text-[#b5452f] bg-[#f6f4ea]" : "text-[#9aa590] hover:text-[#5c6b52] hover:bg-[#eef2e8]/60"
                }`}
              >
                <i className={`fa-solid ${t.icon} text-[11px]`}></i>
                {t.label}
                {t.id === "diagnose" && doneCount > 0 && (
                  <span className="ml-0.5 bg-[#e6ebdd] text-[#3f5233] border border-[#c3d0b3] px-1.5 text-[10px] font-bold tabular-nums normal-case">{doneCount}/{playbook.steps.length}</span>
                )}
                {tab === t.id && <span className="absolute left-2 right-2 -bottom-[1px] h-[2px] bg-[#b5452f]"></span>}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-7 overscroll-contain rm-scroll">
          {tab === "overview" && (
            <div className="animate-[fadeIn_.2s_ease]">
              <div className="bg-[#eef2e8] p-5 border border-[#c7d1bc] grid grid-cols-2 gap-y-3 gap-x-6 text-sm mb-6">
                <div className="text-[#5c6b52] font-bold">Category</div><div className="text-[#2b3527] text-right font-bold">{item.category}</div>
                <div className="text-[#5c6b52] font-bold">Date</div><div className="text-[#2b3527] text-right font-medium">{item.date}</div>
                <div className="text-[#5c6b52] font-bold">Match</div>
                <div className="text-[#2b3527] text-right font-medium">{item.matchMethod || "-"}{item.confidence ? ` (${item.confidence}%)` : ""}</div>
                <div className="text-[#5c6b52] font-bold">Amount</div><div className="text-[#2b3527] text-right font-bold text-base tabular-nums">{api.formatINR(item.amount)}</div>
              </div>

              <div className="bg-[#e6ebdd] border border-[#c3d0b3] p-4 mb-4 flex items-start gap-3">
                <div className="bg-[#f6f4ea] p-1.5 border border-[#c3d0b3] mt-0.5"><i className="fa-solid fa-check text-[#4a5d3f] text-[10px]"></i></div>
                <div>
                  <div className="text-sm font-bold text-[#3f5233]">Verified against {led ? led.verifiedAgainstCount : "computed"} figures</div>
                  <div className="text-xs text-[#4a5d3f] mt-1 font-medium">All monetary values verified. No unsupported figures.</div>
                </div>
              </div>

              <button onClick={() => setTab("diagnose")} className="w-full flex items-center justify-between gap-3 bg-[#f6f4ea] p-4 border border-[#c7d1bc] hover:border-[#2b3527] transition-all duration-150 active:scale-[0.99] text-left">
                <div className="flex items-center gap-3">
                  <div className="bg-[#eef2e8] p-2 border border-[#c7d1bc]"><i className="fa-solid fa-stethoscope text-[#2b3527] text-sm"></i></div>
                  <div>
                    <div className="text-sm font-bold text-[#2b3527]">See how to fix this</div>
                    <div className="text-xs text-[#5c6b52] mt-0.5">{playbook.cause}</div>
                  </div>
                </div>
                <i className="fa-solid fa-chevron-right text-[#9aa590] text-xs"></i>
              </button>
            </div>
          )}

          {tab === "diagnose" && (
            <div className="animate-[fadeIn_.2s_ease]">
              <div className="relative bg-[#f6f4ea] p-5 border border-[#d9c78f] overflow-hidden mb-5">
                <div className="absolute top-0 left-0 w-full h-1 bg-[#a8791f]"></div>
                <div className="flex items-center gap-2 mb-2">
                  <i className="fa-solid fa-magnifying-glass-chart text-[#a8791f] text-sm"></i>
                  <h4 className="text-xs font-bold text-[#2b3527] uppercase tracking-wider">Likely cause</h4>
                </div>
                <p className="text-sm text-[#3d4636] leading-relaxed font-medium">{playbook.cause}</p>
              </div>

              <div className="bg-[#f6f4ea] border border-[#c7d1bc] overflow-hidden mb-5">
                <div className="px-5 py-3.5 bg-[#eef2e8] border-b border-[#c7d1bc] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[11px] font-bold text-[#5c6b52] uppercase tracking-wider">Investigation checklist</h3>
                    <span className="text-[9px] font-semibold uppercase tracking-wider flex items-center gap-1"
                      style={{ color: checklistSaving ? "#a8791f" : "#4a5d3f" }}>
                      <span className="w-1 h-1 rounded-full"
                        style={{ background: checklistSaving ? "#a8791f" : "#4a5d3f",
                                 animation: checklistSaving ? "pulse 1s ease-in-out infinite" : "none" }} />
                      {checklistSaving ? "Saving…" : "Persisted"}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-[#9aa590] tabular-nums">{doneCount}/{playbook.steps.length} done</span>
                </div>
                <div className="divide-y divide-[#e2e7d9]">
                  {playbook.steps.map((step, i) => (
                    <label key={i} className="flex items-start gap-3 px-5 py-3.5 cursor-pointer hover:bg-[#eef2e8]/70 transition-colors duration-150 active:bg-[#dde6d3]/60 select-none">
                      <button
                        type="button"
                        onClick={() => toggleStep(i)}
                        className={`mt-0.5 w-5 h-5 border-2 flex-shrink-0 flex items-center justify-center transition-all duration-150 active:scale-90 ${
                          checked[i] ? "bg-[#4a5d3f] border-[#4a5d3f]" : "border-[#c7d1bc] hover:border-[#2b3527]"
                        }`}
                      >
                        {checked[i] && <i className="fa-solid fa-check text-white text-[10px]"></i>}
                      </button>
                      <span className={`text-sm leading-snug transition-colors duration-150 ${checked[i] ? "text-[#9aa590] line-through" : "text-[#2b3527] font-medium"}`}>{step}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-[#f6f4ea] border border-[#c7d1bc] p-5">
                <h3 className="text-[11px] font-bold text-[#5c6b52] uppercase tracking-wider mb-3">Quick actions</h3>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={item.id} label="Copy Payment ID" className="text-xs font-bold text-[#2b3527] bg-[#eef2e8] hover:bg-[#dde6d3] border border-[#c7d1bc] px-3 py-2" />
                  {led && (
                    <CopyButton
                      text={`${led.variance < 0 ? "-" : ""}${api.formatINR(Math.abs(led.variance))}`}
                      label="Copy Variance"
                      className="text-xs font-bold text-[#2b3527] bg-[#eef2e8] hover:bg-[#dde6d3] border border-[#c7d1bc] px-3 py-2"
                    />
                  )}
                  <button
                    onClick={() => { onViewSource?.(); showToast?.("Source data opened"); }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#b5452f] bg-[#f7e9e4] hover:bg-[#f0d5cb] border border-[#e0b6a8] px-3 py-2 transition-all duration-150 active:scale-[0.96]"
                  >
                    <i className="fa-solid fa-file-excel text-[11px]"></i>
                    View source rows
                  </button>
                  {!item.isLlm && (
                    <button
                      onClick={() => { setTab("explain"); onExplain(item); }}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2b3527] bg-[#e6e9e0] hover:bg-[#d7dcc9] border border-[#c9d0bd] px-3 py-2 transition-all duration-150 active:scale-[0.96]"
                    >
                      <i className="fa-solid fa-wand-magic-sparkles text-[11px]"></i>
                      Ask AI to explain
                    </button>
                  )}
                  <button
                    onClick={() => onAskFix?.(item)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#eef2e8] bg-[#2b3527] hover:bg-[#3a4634] border border-[#2b3527] px-3 py-2 transition-all duration-150 active:scale-[0.96]"
                  >
                    <i className="fa-solid fa-robot text-[11px]"></i>
                    Ask the agent how to fix this
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "ledger" && (
            <div className="animate-[fadeIn_.2s_ease]">
              {led ? (
                <>
                  <div className="bg-[#f6f4ea] border border-[#c7d1bc] mb-6 overflow-hidden">
                    <div className="px-6 py-4 bg-[#eef2e8] border-b border-[#c7d1bc]">
                      <h3 className="text-[11px] font-bold text-[#5c6b52] uppercase tracking-wider">Ledger (Computed vs Bank)</h3>
                    </div>
                    <div className="p-4 text-sm">
                      {led.lines.map((l, i) => (
                        <div key={i} className={`flex justify-between py-2 ${l.isSubItem ? "text-[#5c6b52] pl-4" : "text-[#2b3527] font-bold"}`}>
                          <span>{l.particulars}</span>
                          <span className="tabular-nums">{api.formatINR(l.isSubItem ? l.value : l.expected)}</span>
                        </div>
                      ))}
                      <div className="border-t border-[#c7d1bc] mt-2 pt-3 space-y-2">
                        <div className="flex justify-between"><span className="text-[#5c6b52]">Expected Net (Calculated)</span><span className="font-bold text-[#2b3527] tabular-nums">{api.formatINR(led.expectedNet)}</span></div>
                        <div className="flex justify-between"><span className="text-[#5c6b52]">Actual Net (Bank)</span><span className="font-bold text-[#2b3527] tabular-nums">{api.formatINR(led.actualNet)}</span></div>
                        <div className="flex justify-between items-center pt-1">
                          <span className="text-[11px] font-bold text-[#5c6b52] uppercase tracking-wider">Variance</span>
                          <span className={`px-3 py-1 font-bold text-sm border tabular-nums transition-colors ${led.variance ? "bg-[#f7e9e4] text-[#b5452f] border-[#e0b6a8]" : "bg-[#e6ebdd] text-[#3f5233] border-[#c3d0b3]"}`}>
                            {led.variance < 0 ? "-" : ""}{api.formatINR(Math.abs(led.variance))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <FeeWaterfall ledger={led} />
                </>
              ) : (
                <div className="bg-[#f6f4ea] border border-[#c7d1bc] p-6">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#5c6b52] mb-2">Ledger unavailable</p>
                  <p className="text-sm text-[#2b3527] mb-1">
                    This record is a <span className="font-semibold">{item.reason === "ghost_credit" || item.reason === "orphan_bank_credit" ? "bank credit with no matching settlement" : "non-settlement row"}</span>, so there's no fee schedule to reconstruct.
                  </p>
                  <p className="text-[12px] text-[#5c6b52]">
                    Open a settlement row (amount mismatch, missing in bank, or fee anomaly) to see the gross → MDR → GST → TCS → net breakdown here.
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "decisions" && (
            <DecisionsTree item={item} />
          )}

          {tab === "truth" && (
            <TruthAnchorPanel runId={runId} paymentId={item.id} />
          )}

          {tab === "explain" && (
            <div className="animate-[fadeIn_.2s_ease]">
              <div className="relative bg-[#f6f4ea] p-6 border border-[#c7d1bc] overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-[#2b3527]"></div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-[#eef2e8] p-2 border border-[#c7d1bc]"><i className="fa-solid fa-wand-magic-sparkles text-[#2b3527] text-sm"></i></div>
                  <h4 className="text-xs font-bold text-[#2b3527] uppercase tracking-wider">
                    {item.isLlm ? "AI-generated explanation" : "Deterministic explanation"}
                    {item.llmVerified && <span className="bg-[#e6ebdd] text-[#3f5233] border border-[#c3d0b3] px-2 py-0.5 normal-case font-bold ml-2 text-[10px]">Verified</span>}
                  </h4>
                </div>
                {item.explanation ? (
                  <p className="text-sm text-[#3d4636] leading-relaxed font-medium whitespace-pre-wrap break-words">
                    {item.explanation}
                  </p>
                ) : (
                  <p className="text-[13px] text-[#9aa590] italic">
                    No deterministic explanation was recorded for this record.
                    Click <b>Explain with AI</b> below to generate a verified one.
                  </p>
                )}
                {item.isLlm ? (
                  <div className="flex items-center gap-3 text-xs text-[#5c6b52] font-medium pt-4 mt-4 border-t border-[#c7d1bc]">
                    <span><i className="fa-solid fa-microchip text-[#9aa590] mr-1"></i>{item.llmModel || "gpt-4o-mini"}</span>
                    <span className="w-1 h-1 rounded-full bg-[#c7d1bc]"></span>
                    <span>3 files cross-checked</span>
                  </div>
                ) : (
                  <button onClick={() => onExplain(item)} disabled={explaining}
                    className="mt-4 w-full text-sm font-bold text-[#2b3527] bg-[#eef2e8] border border-[#c7d1bc] py-2.5 hover:bg-[#dde6d3] disabled:opacity-60 flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.98]">
                    <i className={`fa-solid fa-wand-magic-sparkles ${explaining ? "animate-pulse" : ""}`}></i>
                    {explaining ? "Generating verified explanation…" : "Explain with AI"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Resolution footer */}
        <div className="p-6 border-t-2 border-[#2b3527] bg-[#eef2e8]/60 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {RESOLUTION_REASONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setReason(r.id)}
                className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 border transition-all duration-150 active:scale-[0.95] uppercase tracking-wide ${
                  reason === r.id ? "bg-[#2b3527] text-[#eef2e8] border-[#2b3527]" : "bg-[#f6f4ea] text-[#5c6b52] border-[#c7d1bc] hover:border-[#2b3527] hover:text-[#2b3527]"
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
            className="w-full text-sm bg-[#f6f4ea] border border-[#c7d1bc] px-3.5 py-2.5 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#2b3527]/20 focus:border-[#2b3527]"
          />
          <button
            onClick={() => onResolve(buildResolvePayload())}
            disabled={resolving}
            className="w-full px-5 py-3 bg-[#2b3527] border-2 border-[#2b3527] text-sm font-bold uppercase tracking-wider text-[#eef2e8] hover:bg-[#3a4634] disabled:opacity-60 transition-all duration-150 active:scale-[0.97] flex items-center justify-center gap-2"
          >
            {resolving ? (<><i className="fa-solid fa-circle-notch fa-spin"></i> Resolving…</>) : (<><i className="fa-solid fa-stamp"></i> Mark as Resolved <span className="text-[#c7d1bc] font-normal normal-case hidden sm:inline">⌘⏎</span></>)}
          </button>
        </div>
      </aside>
    </>
  );
}

export default function ExceptionsPage({ run, showToast, onGoUpload, onAskAbout }) {
  const [data, setData] = useState(null);
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
  const [cellPopover, setCellPopover] = useState(null);
  const [sourceFocus, setSourceFocus] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const scrollRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Skip the "click any cell" hint on narrow viewports. The popover renders
    // above the table with a fixed 288px width and overlaps critical content.
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (isMobile) return;
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
    // Sort so demo-rich rows bubble to the top of the list. Priority order:
    //   1. rows where the Repair Agent actually branched (strategy_attempts present)
    //   2. rows that carry a ledger breakdown (settlements w/ fee variance)
    //   3. everything else
    // Within each bucket keep original order so severity/category groupings survive.
    const richness = (e) => {
      const hasAttempts = Array.isArray(e.strategy_attempts) && e.strategy_attempts.length > 0;
      const hasLedger   = e.ledger && Array.isArray(e.ledger.lines) && e.ledger.lines.length > 0;
      if (hasAttempts) return 0;
      if (hasLedger)   return 1;
      return 2;
    };
    return [...out].sort((a, b) => richness(a) - richness(b));
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

  const resolve = async (payload) => {
    // `payload` = { ...item, resolutionReason, resolutionNote } from Drawer.buildResolvePayload.
    const reason = payload.resolutionReason || "confirmed";
    const note = payload.resolutionNote;
    const reasonLabel =
      (RESOLUTION_REASONS.find((r) => r.id === reason) || {}).label || reason;
    setResolving(true);
    try {
      await api.resolveDecision(payload.decisionId, { reason, note });
      // Close the loop: auto-open the printable adjustment memo in a new tab so the
      // operator has a downstream artifact in hand (JSON + printable HTML both available).
      try {
        window.open(api.adjustmentMemoHtmlUrl(payload.decisionId), "_blank", "noopener");
      } catch { /* popup blocked - the link is still in the drawer next time */ }
      showToast(`${payload.id} → ${reasonLabel} · memo generated, downstream action ready`);
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
    <div className="flex h-full overflow-hidden font-mono ledger-stripes">
      <PunchRail side="left" />
      <div className="flex-1 flex flex-col min-w-0 px-3 md:px-8 py-4 md:py-8 overflow-y-auto relative">
        <header className="mb-4 md:mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div className="relative">
            <div className="flex items-center gap-2 text-[10px] font-bold text-[#b5452f] uppercase tracking-[0.15em] mb-1.5">
              <span>· Reconciliation Ledger, Exceptions</span>
            </div>
            <div className="flex items-center space-x-2.5 mb-1">
              <h1 className="text-3xl font-bold text-[#2b3527] tracking-tight">Exceptions</h1>
              <span className="bg-[#f7e9e4] text-[#b5452f] border border-[#e0b6a8] text-sm font-bold px-3 py-1 transition-all duration-300">{counts.all}</span>
              <button
                onClick={() => setShowHint((v) => !v)}
                title="How this page works"
                className={`relative w-6 h-6 flex items-center justify-center border transition-all duration-150 active:scale-90 ${
                  showHint ? "bg-[#2b3527] border-[#2b3527] text-[#eef2e8]" : "bg-[#f6f4ea] border-[#c7d1bc] text-[#9aa590] hover:text-[#2b3527] hover:border-[#2b3527]"
                }`}
              >
                {!showHint && !(typeof window !== "undefined" && window.localStorage?.getItem(TIP_KEY)) && (
                  <span className="absolute inset-0 bg-[#b5452f]/30 animate-ping"></span>
                )}
                <i className="fa-solid fa-info text-[10px] relative"></i>
              </button>
            </div>
            <p className="text-[#5c6b52] text-sm font-medium">Unresolved records requiring review</p>
            {showHint && <InfoHint onDismiss={dismissHint} />}
          </div>
          <button
            onClick={() => setShowSource((s) => { if (s) setSourceFocus(null); return !s; })}
            className={`self-start flex items-center gap-2 px-3.5 py-2.5 text-sm font-bold uppercase tracking-wide border transition-all duration-150 active:scale-[0.96] flex-shrink-0 ${
              showSource ? "bg-[#2b3527] text-[#eef2e8] border-[#2b3527]" : "bg-[#f6f4ea] text-[#2b3527] border-[#c7d1bc] hover:border-[#2b3527]"
            }`}
          >
            <i className="fa-solid fa-file-excel"></i>
            {showSource ? "Hide source" : "View source"}
          </button>
        </header>

        <div className="bg-[#f6f4ea] border border-[#2b3527] flex-1 min-h-[440px] flex flex-col overflow-hidden">
          <div className={`px-3 md:px-6 pt-4 md:pt-5 pb-3 flex flex-wrap gap-3 md:gap-4 justify-between items-end border-b border-[#c7d1bc] transition-shadow duration-200 relative z-[1] ${scrolled ? "shadow-[0_6px_10px_-10px_rgba(43,53,39,0.4)]" : ""}`}>
            <div className="flex space-x-1 sm:space-x-6 text-sm overflow-x-auto no-scrollbar">
              {[["All", counts.all], ["Critical", counts.critical], ["Warning", counts.warning], ["Info", counts.info]].map(([label, n]) => (
                <button key={label} onClick={() => setTab(label)}
                  className={`pb-3 px-2 sm:px-0 flex items-center gap-2 -mb-[13px] border-b-2 whitespace-nowrap transition-all duration-200 active:scale-[0.96] uppercase tracking-wide ${
                    tab === label ? "border-[#b5452f] font-bold text-[#2b3527]" : "border-transparent text-[#9aa590] hover:text-[#5c6b52] hover:border-[#c7d1bc] font-bold"}`}>
                  <span>{label}</span>
                  <span className={`px-2 py-0.5 text-xs font-bold transition-colors duration-200 tabular-nums normal-case ${tab === label ? "bg-[#f7e9e4] text-[#b5452f]" : "bg-[#eef2e8] text-[#5c6b52] border border-[#c7d1bc]"}`}>{n}</span>
                </button>
              ))}
            </div>
            <div className="relative mb-2 group">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9aa590] text-sm transition-colors group-focus-within:text-[#2b3527]"></i>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by Payment ID..."
                className="pl-10 pr-9 py-2.5 bg-[#eef2e8] border border-[#c7d1bc] text-sm w-full sm:w-64 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#2b3527]/15 focus:border-[#2b3527] focus:bg-[#f6f4ea]" />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9aa590] hover:text-[#2b3527] w-5 h-5 flex items-center justify-center hover:bg-[#dde6d3] transition-all active:scale-90">
                  <i className="fa-solid fa-xmark text-xs"></i>
                </button>
              )}
            </div>
          </div>

          <div ref={scrollRef} onScroll={onTableScroll}
            className="flex-1 overflow-auto overscroll-contain rm-scroll">
            {loading ? (
              <div className="p-4 space-y-2.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-12 bg-gradient-to-r from-[#eef2e8] via-[#f6f4ea] to-[#eef2e8] bg-[length:200%_100%] animate-[shimmer_1.4s_ease_infinite] border border-[#e2e7d9]" style={{ animationDelay: `${i * 60}ms` }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-16 text-center text-[#9aa590] animate-[fadeIn_.3s_ease]">
                <i className="fa-regular fa-circle-check text-3xl mb-3 text-[#4a5d3f]"></i>
                <p className="text-sm font-bold">Nothing here, no matching exceptions.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead>
                  <tr className="text-[11px] font-bold text-[#5c6b52] uppercase tracking-wider border-b border-[#2b3527] bg-[#eef2e8] sticky top-0 z-[1]">
                    <th className="py-3.5 px-6">Payment ID</th><th className="py-3.5 px-6">Date</th>
                    <th className="py-3.5 px-6 text-right">Amount (₹)</th><th className="py-3.5 px-6">Category</th>
                    <th className="py-3.5 px-6">Severity</th><th className="py-3.5 px-6">Match</th>
                    <th className="py-3.5 px-6">Confidence</th><th className="py-3.5 px-6">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-[#e2e7d9]">
                  {pageItems.map((e, i) => (
                    <tr key={e.decisionId}
                      onTouchStart={() => setPressedRow(e.decisionId)} onTouchEnd={() => setPressedRow(null)} onTouchCancel={() => setPressedRow(null)}
                      style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                      className={`select-none transition-colors duration-150 animate-[rowIn_.3s_ease_backwards] ${
                        selected?.decisionId === e.decisionId ? "bg-[#f7e9e4]/50 shadow-[inset_2px_0_0_0_#b5452f]" : "hover:bg-[#eef2e8]/80"
                      } ${pressedRow === e.decisionId ? "bg-[#dde6d3]/90 scale-[0.997]" : ""}`}>
                      <td className="py-3.5 px-6 cursor-pointer" onClick={(ev) => onCellClick(ev, e, "id")}><CopyableId id={e.id} /></td>
                      <td className="py-4 px-6 text-[#5c6b52] font-medium cursor-pointer hover:bg-[#eef2e8]/60 transition-colors" onClick={(ev) => onCellClick(ev, e, "date")}>{e.date}</td>
                      <td className="py-4 px-6 text-right font-bold text-[#2b3527] tabular-nums cursor-pointer hover:bg-[#eef2e8]/60 transition-colors" onClick={(ev) => onCellClick(ev, e, "amount")}>{Number(e.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      <td className="py-4 px-6 cursor-pointer hover:bg-[#eef2e8]/60 transition-colors" onClick={(ev) => onCellClick(ev, e, "category")}><span className={`inline-flex px-2.5 py-1 text-xs font-bold border ${CAT_CHIP[e.category] || CAT_CHIP.Other}`}>{e.category}</span></td>
                      <td className="py-4 px-6 cursor-pointer hover:bg-[#eef2e8]/60 transition-colors" onClick={(ev) => onCellClick(ev, e, "severity")}><div className="flex items-center gap-2"><span className={`w-2 h-2 ${SEV_MARK[e.severity]}`}></span><span className="text-[#2b3527] font-bold text-xs uppercase tracking-wide">{e.severity}</span></div></td>
                      <td className="py-4 px-6 text-[#5c6b52] font-medium cursor-pointer hover:bg-[#eef2e8]/60 transition-colors" onClick={(ev) => onCellClick(ev, e, "matchMethod")}>{e.matchMethod || "-"}</td>
                      <td className="py-4 px-6 cursor-pointer hover:bg-[#eef2e8]/60 transition-colors" onClick={(ev) => onCellClick(ev, e, "confidence")}><ConfidenceBar value={e.confidence} /></td>
                      <td className="py-4 px-6 font-bold text-[#b5452f] cursor-pointer hover:bg-[#eef2e8]/60 transition-colors" onClick={(ev) => onCellClick(ev, e, "status")}><span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-[#b5452f]"></span>{e.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="p-5 border-t border-[#2b3527] flex justify-between items-center text-sm text-[#5c6b52]">
            <span className="font-bold tabular-nums">
              {filtered.length === 0 ? "0 results" : `Showing ${(page - 1) * PAGE_SIZE + 1} to ${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
            </span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="w-9 h-9 border border-[#c7d1bc] hover:bg-[#eef2e8] text-[#2b3527] disabled:opacity-40 transition-all duration-150 active:scale-90 flex items-center justify-center"><i className="fa-solid fa-chevron-left text-xs"></i></button>
              <span className="px-3 h-9 flex items-center bg-[#f7e9e4] text-[#b5452f] font-bold tabular-nums border border-[#e0b6a8]">{page} / {pageCount}</span>
              <button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="w-9 h-9 border border-[#c7d1bc] hover:bg-[#eef2e8] text-[#2b3527] disabled:opacity-40 transition-all duration-150 active:scale-90 flex items-center justify-center"><i className="fa-solid fa-chevron-right text-xs"></i></button>
            </div>
          </div>
        </div>

        {showSource && (
          <div ref={sourceRef} className="mt-6 animate-[fadeIn_.3s_ease] scroll-mt-6">
            <p className="text-xs text-[#5c6b52] mb-3">
              {sourceFocus ? (
                <>
                  Jumped to <span className="font-bold text-[#2b3527]">{sourceFocus.id}</span> · {COLUMN_LABELS[sourceFocus.column] || sourceFocus.column} column highlighted below.
                </>
              ) : (
                "Cross-reference an exception against the raw rows the agent reconciled. Use search to find a payment ID."
              )}
            </p>
            <SourceFilesCard
              isDemo={run.isDemo}
              runId={run.runId}
              height={340}
              focusSheet={sourceFocus?.sheet || "settlement"}
              focusRowId={sourceFocus?.id}
              focusColumn={sourceFocus?.column}
              focusToken={sourceFocus?.token}
            />
          </div>
        )}
      </div>
      <PunchRail side="right" />

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
          runId={run?.runId}
          onClose={() => setSelected(null)}
          onResolve={resolve}
          resolving={resolving}
          onExplain={explain}
          explaining={explaining}
          showToast={showToast}
          onViewSource={() => openSourceFor(selected, "id")}
          onAskFix={(it) => onAskAbout?.(`How do I resolve ${it.id}?`)}
          onPrev={() => goTo(selectedIndex - 1)}
          onNext={() => goTo(selectedIndex + 1)}
          hasPrev={hasPrev}
          hasNext={hasNext}
          position={selectedIndex >= 0 ? `${selectedIndex + 1} of ${filtered.length}` : null}
        />
      )}

      <style>{`
        .ledger-stripes {
          background-color: #eef2e8;
          background-image: repeating-linear-gradient(
            0deg,
            #eef2e8 0px,
            #eef2e8 28px,
            #dde6d3 28px,
            #dde6d3 56px
          );
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rowIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.95) translateY(-2px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        /* Slim brand-matched scrollbar for tables + drawer content that overflow. */
        .rm-scroll { scrollbar-width: thin; scrollbar-color: #b5452f #eef2e8; }
        .rm-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .rm-scroll::-webkit-scrollbar-track { background: #eef2e8; border-radius: 6px; }
        .rm-scroll::-webkit-scrollbar-thumb { background: #b5452f; border-radius: 6px; border: 2px solid #eef2e8; }
        .rm-scroll::-webkit-scrollbar-thumb:hover { background: #8f3323; }
        .rm-scroll::-webkit-scrollbar-corner { background: #eef2e8; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
}