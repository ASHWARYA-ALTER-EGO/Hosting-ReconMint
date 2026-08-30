import React, { useEffect, useMemo, useState } from "react";
import * as api from "../api.js";

// Truth-Anchor Agent card. Replaces the old always-visible "Live Razorpay records"
// pulse card. The premise: for every exception in this run, appeal to the live
// Razorpay API and treat the API response as ground truth. If the merchant's CSV
// disagrees with the API, that is a real finding (stale export, wrong id, ghost
// record) that no amount of three-way file matching could reveal on its own.
//
// This is the actual use of the sponsor API in ReconMint. It is a second verifier,
// alongside the hallucination verifier: one guards the LLM, one guards the source
// data. The Razorpay-blue accent is kept, but the card behaves as a finance
// finding, not as a badge.

const RZP_BLUE = "#3395FF";
const RZP_BLUE_DARK = "#0057BA";
const INK = "#1F2A1A";
const SOFT = "#5C6752";
const CARD = "#FBFBF3";
const BORDER = "rgba(31,42,26,0.14)";
const BORDER_STRONG = "rgba(31,42,26,0.28)";
const MOSS = "#4B7B4E";
const RUST = "#B5432F";
const OCHRE = "#B8863B";

function inr(paise) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2,
  }).format((paise || 0) / 100);
}

function VerdictBadge({ v }) {
  const map = {
    matches:     { bg: "rgba(75,123,78,0.10)", fg: MOSS,  label: "CSV MATCHES" },
    stale_csv:   { bg: "rgba(181,67,47,0.10)", fg: RUST,  label: "STALE CSV"    },
    not_found:   { bg: "rgba(184,134,59,0.12)", fg: OCHRE, label: "GHOST ID"    },
    unreachable: { bg: "rgba(107,118,96,0.10)", fg: SOFT,  label: "UNREACHABLE" },
  };
  const s = map[v] || { bg: "transparent", fg: SOFT, label: (v || "").toUpperCase() };
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px", borderRadius: 3,
      background: s.bg, color: s.fg, fontSize: 9.5, fontWeight: 700,
      letterSpacing: "0.08em", border: `1px solid ${s.fg}`, whiteSpace: "nowrap",
    }}>{s.label}</span>
  );
}

function DriftRow({ label, csv, apiVal, drift }) {
  const off = drift != null && drift !== 0;
  const arrow = drift > 0 ? "▲" : (drift < 0 ? "▼" : "");
  return (
    <tr style={{ borderBottom: `1px dashed ${BORDER}` }}>
      <td style={{ padding: "5px 8px", color: SOFT, fontSize: 10.5, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</td>
      <td style={{ padding: "5px 8px", textAlign: "right", color: INK, fontVariantNumeric: "tabular-nums" }}>{inr(csv)}</td>
      <td style={{ padding: "5px 8px", textAlign: "right", color: INK, fontVariantNumeric: "tabular-nums" }}>{apiVal == null ? "-" : inr(apiVal)}</td>
      <td style={{
        padding: "5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums",
        color: off ? RUST : SOFT, fontWeight: off ? 700 : 400,
      }}>
        {drift == null ? "-" : (drift === 0 ? "0" : `${arrow} ${inr(Math.abs(drift))}`)}
      </td>
    </tr>
  );
}

function FindingRow({ f }) {
  const csv = f.csv || {};
  const api = f.api || {};
  const drift = f.drift || {};
  return (
    <div style={{
      border: `1px solid ${BORDER}`,
      background: "#fff",
      borderRadius: 4,
      padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <VerdictBadge v={f.verdict} />
          <code style={{ color: INK, fontWeight: 600, fontSize: 12 }}>{f.payment_id}</code>
        </div>
        <div style={{ fontSize: 10, color: SOFT }}>appealed to <span style={{ color: RZP_BLUE_DARK, fontWeight: 600 }}>api.razorpay.com</span></div>
      </div>
      <div style={{ fontSize: 11.5, color: INK, lineHeight: 1.5 }}>{f.headline}</div>
      {(f.verdict === "matches" || f.verdict === "stale_csv") && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, marginTop: 4 }}>
          <thead>
            <tr style={{ color: SOFT, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              <th style={{ textAlign: "left", padding: "3px 8px", fontWeight: 700 }}>Field</th>
              <th style={{ textAlign: "right", padding: "3px 8px", fontWeight: 700 }}>Your CSV</th>
              <th style={{ textAlign: "right", padding: "3px 8px", fontWeight: 700, color: RZP_BLUE_DARK }}>Live Razorpay</th>
              <th style={{ textAlign: "right", padding: "3px 8px", fontWeight: 700 }}>Drift</th>
            </tr>
          </thead>
          <tbody>
            <DriftRow label="Gross" csv={csv.gross_paise} apiVal={api.gross_paise} drift={drift.gross_paise} />
            <DriftRow label="Fee (MDR)" csv={csv.fee_paise} apiVal={api.fee_paise} drift={drift.fee_paise} />
            <DriftRow label="Tax (GST)" csv={csv.tax_paise} apiVal={api.tax_paise} drift={drift.tax_paise} />
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function TruthAnchorCard({ runId, onJumpToException }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = () => {
    if (!runId) return;
    setLoading(true); setErr(null);
    api.scanTruthAnchor(runId, { limit: 15 })
      .then(setData)
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setData(null); setErr(null); setExpanded(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const summary = data?.summary || { matches: 0, stale_csv: 0, not_found: 0, unreachable: 0 };
  const totalFindings = (summary.stale_csv || 0) + (summary.not_found || 0);
  const topFindings = useMemo(
    () => (data?.findings || []).filter((f) => f.verdict === "stale_csv" || f.verdict === "not_found").slice(0, 3),
    [data]
  );

  // Not configured state: kept honest, matches previous card's tone.
  if (data && data.keys_configured === false) {
    return (
      <div style={{
        border: `1.5px solid ${OCHRE}`, background: "rgba(184,134,59,0.06)",
        borderRadius: 8, padding: "12px 16px",
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: OCHRE }} />
          <b style={{ color: OCHRE, textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 10 }}>
            Truth-Anchor Agent · dormant
          </b>
        </div>
        <div style={{ marginTop: 6, color: SOFT }}>{data.detail}</div>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{
        border: `1.5px solid ${RUST}`, background: "rgba(181,67,47,0.06)",
        borderRadius: 8, padding: "12px 16px",
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: INK,
      }}>
        <b style={{ color: RUST }}>Truth-Anchor Agent unavailable.</b>{" "}
        <span style={{ color: SOFT }}>{err}</span>
      </div>
    );
  }

  return (
    <div style={{
      border: `1.5px solid ${RZP_BLUE}`,
      background: "linear-gradient(135deg, rgba(51,149,255,0.03), rgba(51,149,255,0.07))",
      borderRadius: 8, overflow: "hidden",
      fontFamily: "'IBM Plex Mono', monospace",
      boxShadow: "0 1px 2px rgba(31,42,26,0.06)",
    }}>
      {/* Header row: identity + headline count + expand */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "12px 16px", cursor: "pointer",
          borderBottom: expanded ? `1px solid ${BORDER}` : "none",
        }}
      >
        <div style={{
          background: RZP_BLUE, color: "#fff", padding: "5px 9px", borderRadius: 4,
          fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: "#fff",
            animation: "rzp-pulse 1.6s ease-in-out infinite",
          }} />
          TRUTH-ANCHOR AGENT
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: INK }}>
            {loading ? (
              <span style={{ color: SOFT }}>Appealing exceptions to <b style={{ color: RZP_BLUE_DARK }}>api.razorpay.com</b>…</span>
            ) : totalFindings > 0 ? (
              <>
                <b style={{ color: RUST }}>{totalFindings} anomal{totalFindings === 1 ? "y" : "ies"} your CSV hid.</b>{" "}
                <span style={{ color: SOFT }}>{summary.matches} matched · scanned {data?.scanned ?? 0}</span>
              </>
            ) : data?.scanned ? (
              <>
                <b style={{ color: MOSS }}>All {summary.matches} exceptions verified against Razorpay.</b>{" "}
                <span style={{ color: SOFT }}>Your CSV agrees with the live record to the paise.</span>
              </>
            ) : (
              <span style={{ color: SOFT }}>No settlement exceptions to appeal.</span>
            )}
          </span>
        </div>
        {data && (
          <button
            type="button"
            style={{
              fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
              padding: "4px 10px", border: `1px solid ${RZP_BLUE}`, background: "transparent",
              color: RZP_BLUE_DARK, borderRadius: 4, cursor: "pointer", flexShrink: 0,
            }}
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          >
            {expanded ? "hide details" : "see appeals"}
          </button>
        )}
      </div>

      {expanded && data && (
        <div style={{ padding: "12px 16px 14px" }}>
          <div style={{
            fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase",
            color: SOFT, marginBottom: 8, fontWeight: 700,
          }}>
            How this works
          </div>
          <div style={{ fontSize: 11.5, color: INK, lineHeight: 1.55, marginBottom: 12 }}>
            For every settlement exception, the Truth-Anchor Agent calls
            {" "}<span style={{ color: RZP_BLUE_DARK, fontWeight: 600 }}>GET api.razorpay.com/v1/payments/&#123;id&#125;</span>{" "}
            and treats the API's response as ground truth. If your uploaded CSV disagrees on gross, fee or tax, the CSV is stale. If the payment id does not exist upstream, it is a ghost row. Findings link back to the Exceptions list so you can act.
          </div>

          {/* Top findings preview */}
          {topFindings.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {topFindings.map((f) => (
                <FindingRow key={f.payment_id} f={f} />
              ))}
              {totalFindings > topFindings.length && (
                <button
                  type="button"
                  onClick={() => onJumpToException?.()}
                  style={{
                    alignSelf: "flex-start", fontSize: 10.5, letterSpacing: "0.08em",
                    textTransform: "uppercase", padding: "6px 12px",
                    border: `1px solid ${INK}`, background: INK, color: "#FBFBF3",
                    borderRadius: 4, cursor: "pointer", fontWeight: 700,
                  }}
                >
                  Review all {totalFindings} findings in Exceptions →
                </button>
              )}
            </div>
          ) : (
            <div style={{
              fontSize: 11, color: SOFT, fontStyle: "italic",
              padding: "8px 10px", background: "rgba(75,123,78,0.05)",
              border: `1px dashed ${MOSS}`, borderRadius: 4,
            }}>
              Nothing to appeal. Every exception's CSV values agree with the live Razorpay record to the paise.
            </div>
          )}

          <div style={{ marginTop: 10, borderTop: `1px solid ${BORDER}`, paddingTop: 8, fontSize: 10, color: SOFT }}>
            Scan capped at 15 payments. Cached per run.{" "}
            <button
              type="button"
              onClick={load}
              disabled={loading}
              style={{
                background: "transparent", border: "none", color: RZP_BLUE_DARK,
                cursor: loading ? "wait" : "pointer", textDecoration: "underline",
                fontFamily: "inherit", fontSize: 10, padding: 0,
              }}
            >
              {loading ? "scanning…" : "re-run scan"}
            </button>
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
