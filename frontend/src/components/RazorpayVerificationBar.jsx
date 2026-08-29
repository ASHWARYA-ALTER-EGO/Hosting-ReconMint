import React, { useEffect, useState } from "react";
import * as api from "../api.js";

// Compact, dismissible info bar version of the Razorpay handshake.
// Replaces the old full card. One line: HTTP status + latency + verified badge.
// User can dismiss it (persisted per browser via localStorage).

const C = {
  ink: "#1F2A1A",
  softText: "#5C6752",
  moss: "#4B7B4E",
  rust: "#B5432F",
  rzpBlue: "#3395FF",
  border: "rgba(31,42,26,0.14)",
};

const DISMISS_KEY = "reconmint_rzp_bar_dismissed";

export default function RazorpayVerificationBar({ runId }) {
  const [data, setData] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (!runId || dismissed) return;
    api.getRazorpayVerification(runId).then(setData).catch(() => setData(null));
  }, [runId, dismissed]);

  const hide = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* noop */ }
  };

  if (dismissed || !data || !data.ok) return null;

  const source = data.reason || "payments";
  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-md font-mono text-[11.5px]"
      style={{ background: "rgba(51,149,255,0.05)", border: `1px solid ${C.rzpBlue}`, color: C.ink }}>
      <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
        style={{ background: C.rzpBlue, color: "#fff" }}>
        <i className="fa-solid fa-shield-check text-[10px]"></i>
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-semibold" style={{ color: C.rzpBlue }}>Verified via live Razorpay API</span>
        <span style={{ color: C.softText }}>
          {" · "}HTTP {data.status_code}{" · "}{data.latency_ms} ms{" · "}
          sampled {data.payments.length} live {source} at ingest
          {data.razorpay_request_id && <> · req-id {data.razorpay_request_id.slice(0, 14)}…</>}
        </span>
      </div>
      <button onClick={hide} title="Dismiss (persists per browser)"
        className="text-[10px] uppercase tracking-wider px-2 py-1 rounded hover:bg-black/5 transition-colors shrink-0"
        style={{ color: C.softText }}>
        <i className="fa-solid fa-xmark text-[11px]"></i>
      </button>
    </div>
  );
}
