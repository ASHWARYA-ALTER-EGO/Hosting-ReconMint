import React, { useEffect, useState } from "react";
import * as api from "../api.js";

// Live Razorpay API handshake card. Renders the actual result of the API call that
// happened at ingest: HTTP status, latency, X-Razorpay-Request-Id, and up to 3 real
// records the API returned. Nothing here is faked - if the API failed, this card says so.

const C = {
  ink: "#1F2A1A",
  card: "#FBFBF3",
  border: "rgba(31,42,26,0.14)",
  borderStrong: "rgba(31,42,26,0.28)",
  softText: "#5C6752",
  moss: "#4B7B4E",
  rust: "#B5432F",
  ochre: "#B8863B",
  rzpBlue: "#3395FF",  // Razorpay brand blue
};

function inr(paise) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 })
    .format((paise || 0) / 100);
}

function tsToDate(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}

export default function RazorpayVerificationCard({ runId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setData(null); setErr(null); setNotFound(false);
    api.getRazorpayVerification(runId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => {
        if (cancelled) return;
        const msg = String(e.message || e);
        if (msg.includes("No live Razorpay") || msg.includes("not found")) setNotFound(true);
        else setErr(msg);
      });
    return () => { cancelled = true; };
  }, [runId]);

  if (notFound) {
    return (
      <div className="rounded-xl border p-6 font-mono" style={{ background: C.card, borderColor: C.border, color: C.softText }}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: C.softText }}>
          — Razorpay API handshake
        </div>
        <p className="text-sm">
          No live handshake was recorded for this run. Set <span className="font-semibold" style={{ color: C.ink }}>RAZORPAY_KEY_ID</span> and
          <span className="font-semibold" style={{ color: C.ink }}> RAZORPAY_KEY_SECRET</span> and re-run the batch to see the live API call.
        </p>
      </div>
    );
  }
  if (err) {
    return (
      <div className="rounded-xl border p-6 font-mono" style={{ background: C.card, borderColor: C.border, color: C.rust }}>
        Razorpay verification unavailable: {err}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-xl border p-6 font-mono flex items-center gap-3" style={{ background: C.card, borderColor: C.border, color: C.softText }}>
        <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: C.ink, borderTopColor: "transparent" }} />
        Loading Razorpay handshake...
      </div>
    );
  }

  const ok = data.ok;
  const source = data.reason || (ok ? "payments" : "error");
  const isOrders = source === "orders";
  const isEmpty = source === "empty_account";
  const badgeText = ok
    ? (isEmpty ? "API reachable · test account empty" : "Verified via Razorpay API")
    : "Razorpay API unreachable";
  const badgeFg = ok ? C.moss : C.rust;
  const badgeBg = ok ? "rgba(75,123,78,0.10)" : "rgba(181,67,47,0.10)";

  return (
    <div
      className="rounded-xl border overflow-hidden font-mono"
      style={{
        background: C.card,
        borderColor: C.borderStrong,
        boxShadow: "0 1px 2px rgba(31,42,26,0.06), 0 8px 24px -12px rgba(31,42,26,0.10)",
      }}
    >
      {/* header with the actual verified badge */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: C.rzpBlue, color: "#fff" }}>
            <i className="fa-solid fa-shield-check text-xs"></i>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.rust }}>
              — Sponsor API handshake
            </div>
            <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: C.ink }}>
              Live Razorpay API verification
            </h2>
          </div>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-md"
          style={{ background: badgeBg, border: `1px solid ${badgeFg}` }}
        >
          <i className={`fa-solid ${ok ? "fa-circle-check" : "fa-triangle-exclamation"} text-xs`} style={{ color: badgeFg }} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: badgeFg }}>{badgeText}</span>
        </div>
      </div>

      {/* explain-what-happened strip */}
      <div className="mx-6 mb-3 p-3 rounded-lg text-[11px] leading-relaxed" style={{
        background: "rgba(31,42,26,0.03)", border: `1px dashed ${C.border}`, color: C.softText
      }}>
        At ingest, ReconMint calls the real Razorpay API to prove the pipeline is grounded in the
        sponsor's live product. Auth uses your <span className="font-semibold" style={{ color: C.ink }}>RAZORPAY_KEY_ID</span>+<span className="font-semibold" style={{ color: C.ink }}>RAZORPAY_KEY_SECRET</span>.
        We ask for 3 recent records; if the test account has no payments yet we transparently fall
        back to Orders (they're the truth-anchor a merchant creates first). Every field below is
        straight from Razorpay's response — nothing computed client-side.
      </div>

      {/* wire-level metadata */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 px-6 pb-3">
        <MetaCell label="HTTP" value={data.status_code || "—"} tone={ok ? "ok" : "err"} />
        <MetaCell label="Latency" value={`${data.latency_ms} ms`} />
        <MetaCell label="Source" value={source} />
        <MetaCell label="Records" value={(data.payments || []).length} />
      </div>
      <div className="px-6 pb-2 grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <MetaCell label="URL called" value={data.url} mono wrap />
        <MetaCell
          label="X-Razorpay-Request-Id"
          value={data.razorpay_request_id || "not returned"}
          mono wrap
        />
      </div>

      {/* records the API returned */}
      {data.payments && data.payments.length > 0 && (
        <div className="px-6 pb-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-2" style={{ color: C.softText }}>
            {isOrders ? "Live orders returned by Razorpay" : "Live payments returned by Razorpay"}
          </div>
          <div className="border rounded-lg overflow-hidden" style={{ borderColor: C.border }}>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider" style={{ color: C.softText, background: "rgba(31,42,26,0.04)" }}>
                  <th className="text-left  py-2 px-3 font-semibold">ID</th>
                  <th className="text-right py-2 px-3 font-semibold">Amount</th>
                  <th className="text-left  py-2 px-3 font-semibold">Status</th>
                  <th className="text-left  py-2 px-3 font-semibold">{isOrders ? "Receipt" : "Method"}</th>
                  <th className="text-left  py-2 px-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-t" style={{ borderColor: C.border }}>
                    <td className="py-2 px-3 font-medium" style={{ color: C.ink }}>{p.id}</td>
                    <td className="py-2 px-3 text-right tabular-nums" style={{ color: C.ink }}>{inr(p.amount_paise)}</td>
                    <td className="py-2 px-3" style={{ color: C.softText }}>{p.status || "—"}</td>
                    <td className="py-2 px-3" style={{ color: C.softText }}>{isOrders ? (p.receipt || "—") : (p.method || "—")}</td>
                    <td className="py-2 px-3" style={{ color: C.softText }}>{tsToDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="mx-6 mb-5 p-3 rounded-lg text-[11px]" style={{
          background: "rgba(184,134,59,0.08)", border: `1px solid ${C.ochre}`, color: C.softText
        }}>
          Handshake succeeded — but this Razorpay test account has no payments or orders yet.
          The HTTP 200 + latency + request-id above still prove the keys and network path are live.
        </div>
      )}

      {!ok && (
        <div className="mx-6 mb-5 p-3 rounded-lg text-[11px]" style={{
          background: "rgba(181,67,47,0.06)", border: `1px solid ${C.rust}`, color: C.softText
        }}>
          {data.detail || "Handshake failed."} Reconciliation ran without the live check.
        </div>
      )}
    </div>
  );
}

function MetaCell({ label, value, mono = false, wrap = false, tone }) {
  const valColor = tone === "err" ? C.rust : C.ink;
  return (
    <div className="p-2.5 rounded-md" style={{ background: "rgba(31,42,26,0.03)", border: `1px solid ${C.border}` }}>
      <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: C.softText }}>{label}</div>
      <div
        className={`${mono ? "font-mono" : ""} ${wrap ? "break-all" : "truncate"} text-[12px] mt-0.5`}
        style={{ color: valColor, fontWeight: 600 }}
        title={String(value)}
      >
        {value}
      </div>
    </div>
  );
}
