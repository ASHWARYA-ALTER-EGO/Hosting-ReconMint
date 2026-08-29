import React, { useEffect, useState } from "react";
import * as api from "../api.js";

// Bold, always-visible Razorpay live-connection card. Kills the "where's the API
// being used?" question. Shows live HTTP status + latency + request-id + the 3 real
// orders fetched from the merchant's test account. Pulsing green dot when live.

const RZP_BLUE = "#3395FF";
const RZP_BLUE_DARK = "#0057BA";
const INK = "#1F2A1A";
const SOFT = "#5C6752";
const RUST = "#B5432F";
const MOSS = "#4B7B4E";
const BORDER = "rgba(31,42,26,0.14)";

function inr(paise) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format((paise || 0) / 100);
}

export default function RazorpayLiveCard({ runId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setData(null); setErr(null); setExpanded(false);  // reset before fetching new run's data
    api.getRazorpayVerification(runId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(String(e.message || e)); });
    return () => { cancelled = true; };
  }, [runId]);

  if (err) {
    return (
      <div style={{
        border: `1.5px solid ${RUST}`, background: "rgba(181,67,47,0.06)",
        borderRadius: 10, padding: 14, fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12, color: INK,
      }}>
        <b style={{ color: RUST }}>Live Razorpay API check failed.</b>{" "}
        <span style={{ color: SOFT }}>{err}</span>
      </div>
    );
  }
  if (!data) return null;

  const ok = data.ok;
  const orders = data.payments || [];

  if (!ok) {
    return (
      <div style={{
        border: `1.5px solid ${RUST}`, background: "rgba(181,67,47,0.06)",
        borderRadius: 10, padding: 14,
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: RUST }} />
          <b style={{ color: RUST, textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 10 }}>
            Razorpay API unreachable
          </b>
        </div>
        <div style={{ marginTop: 6, color: SOFT }}>
          {data.detail || "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the backend."}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      border: `1.5px solid ${RZP_BLUE}`,
      background: "linear-gradient(135deg, rgba(51,149,255,0.04), rgba(51,149,255,0.08))",
      borderRadius: 10, overflow: "hidden",
      fontFamily: "'IBM Plex Mono', monospace",
      boxShadow: "0 1px 2px rgba(31,42,26,0.06)",
    }}>
      {/* header bar */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "12px 16px", cursor: "pointer",
          borderBottom: expanded ? `1px solid ${BORDER}` : "none",
        }}
      >
        {/* Razorpay wordmark-esque badge */}
        <div style={{
          background: RZP_BLUE, color: "#fff", padding: "5px 9px", borderRadius: 4,
          fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: "#fff",
            animation: "rzp-pulse 1.6s ease-in-out infinite",
          }} />
          RAZORPAY · LIVE
        </div>

        {/* status line */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, fontSize: 11.5, color: INK, flexWrap: "wrap" }}>
          <span><b style={{ color: MOSS }}>HTTP {data.status_code}</b> from <span style={{ color: RZP_BLUE_DARK, fontWeight: 600 }}>api.razorpay.com</span></span>
          <span style={{ color: SOFT }}>·</span>
          <span>{data.latency_ms} ms</span>
          <span style={{ color: SOFT }}>·</span>
          <span>{orders.length} live {data.reason || "records"} fetched</span>
          {data.razorpay_request_id && (
            <>
              <span style={{ color: SOFT }}>·</span>
              <span style={{ color: SOFT, fontSize: 10 }}>req-id {data.razorpay_request_id.slice(0, 12)}...</span>
            </>
          )}
        </div>

        <button
          type="button"
          style={{
            fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
            padding: "4px 10px", border: `1px solid ${RZP_BLUE}`, background: "transparent",
            color: RZP_BLUE_DARK, borderRadius: 4, cursor: "pointer",
          }}
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        >
          {expanded ? "hide payload" : "show live records"}
        </button>
      </div>

      {/* expanded: real records the sponsor API returned */}
      {expanded && (
        <div style={{ padding: "12px 16px 14px", fontSize: 11.5 }}>
          <div style={{ fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: SOFT, marginBottom: 8, fontWeight: 700 }}>
            Live records from your Razorpay test account
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'IBM Plex Mono', monospace" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}`, textAlign: "left", color: SOFT, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <th style={{ padding: "4px 6px", fontWeight: 700 }}>Razorpay ID</th>
                <th style={{ padding: "4px 6px", fontWeight: 700, textAlign: "right" }}>Amount</th>
                <th style={{ padding: "4px 6px", fontWeight: 700 }}>Status</th>
                <th style={{ padding: "4px 6px", fontWeight: 700 }}>Receipt / Method</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={{ borderBottom: `1px dashed ${BORDER}` }}>
                  <td style={{ padding: "5px 6px", color: INK, fontWeight: 600 }}>{o.id}</td>
                  <td style={{ padding: "5px 6px", textAlign: "right", color: INK }}>{inr(o.amount_paise)}</td>
                  <td style={{ padding: "5px 6px", color: SOFT }}>{o.status || "-"}</td>
                  <td style={{ padding: "5px 6px", color: SOFT }}>{o.receipt || o.method || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 10, color: SOFT, borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
            Every field here comes from a real HTTPS call to <span style={{ color: INK, fontWeight: 600 }}>api.razorpay.com/v1/{data.reason || "payments"}</span> at ingest, using your <span style={{ color: INK, fontWeight: 600 }}>RAZORPAY_KEY_ID</span>. The X-Request-Id above lets a Razorpay auditor trace this exact call.
          </div>
        </div>
      )}

      <style>{`@keyframes rzp-pulse {
        0%, 100% { opacity: 0.5; transform: scale(0.85); }
        50%      { opacity: 1;   transform: scale(1.15); }
      }`}</style>
    </div>
  );
}
