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

export default function RazorpayVerificationBar({ runId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!runId) return;
    setData(null);  // clear old run's data before fetching so the bar never shows stale state
    api.getRazorpayVerification(runId).then(setData).catch(() => setData(null));
  }, [runId]);

  if (!data) return null;
  const ok = data.ok;
  if (!ok) {
    // Show a red bar naming what to fix - so the operator sees WHY the sponsor API is quiet.
    return (
      <div className="flex items-center gap-3 px-4 py-2 rounded-md font-mono text-[11.5px]"
        style={{ background: "rgba(181,67,47,0.08)", border: `1px solid ${C.rust}`, color: C.ink }}>
        <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
          style={{ background: C.rust, color: "#fff" }}>
          <i className="fa-solid fa-triangle-exclamation text-[10px]"></i>
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-semibold" style={{ color: C.rust }}>Live Razorpay API check unavailable.</span>
          <span style={{ color: C.softText }}> {data.detail || "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the backend to enable."}</span>
        </div>
      </div>
    );
  }

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
    </div>
  );
}
