import React, { useEffect, useMemo, useState } from "react";

/**
 * AgentCockpit
 * ------------------------------------------------------------------
 * Mission-control style 3x3 grid of agent stations. Replaces the
 * vertical AgentTrace list on the Upload page so a judge's first
 * glance reads as a spatial ops dashboard, not a CI pipeline.
 *
 * 7 agent stations + 2 status cells (Mission Clock, Decisions Counter).
 *
 * Aesthetic: paper-cream fill, ink borders, mono typography, subtle
 * corner brackets on active cells (radar-screen affordance), rust
 * pulsing dot for "transmitting", moss stamp for "verified".
 *
 * Props:
 *   steps        array of {title, detail, ms, status, via, substeps}
 *                (matches the shape AgentTrace already consumes)
 *   totalMs      cumulative elapsed time in ms for the Mission Clock cell
 *   decisions    integer count of decisions written for the Decisions cell
 *   done         boolean: all reveal steps have played
 * ------------------------------------------------------------------
 */

// Palette matches the rest of the ledger aesthetic exactly. Do not tweak in isolation.
const C = {
  ink: "#1F2A1A",
  inkSoft: "#5C6752",
  paper: "#FBFBF3",
  paperAlt: "#F3F6ED",
  sage: "#EEF2E4",
  line: "rgba(31,42,26,0.14)",
  lineStrong: "rgba(31,42,26,0.28)",
  rust: "#B5432F",
  rustDeep: "#8F3323",
  moss: "#4B7B4E",
  mossSoft: "rgba(75,123,78,0.10)",
  gold: "#B8863B",
  rzpBlue: "#3395FF",
};

// Ordered by their real position in the reconcile flow, but rendered as a spatial
// grid (row-major). Each entry defines the station's identity so we can render
// even when a matching backend stage hasn't come in yet (empty "STANDBY" state).
const STATIONS = [
  {
    key: "razorpay", number: "01", name: "Razorpay-check Agent",
    role: "live API grounding", icon: "fa-shield-check",
    match: /razorpay/i, accent: C.rzpBlue,
    explain: "Calls api.razorpay.com at ingest with your test keys and pulls 3 real records. Proves the pipeline is grounded in the live sponsor product, not a schema imitation.",
  },
  {
    key: "ingest", number: "02", name: "Ingest Agent",
    role: "schema + hygiene", icon: "fa-file-import",
    match: /ingest|validat/i, accent: C.ink,
    explain: "Detects your file's column shape (recognises 60+ merchant-export spellings), normalises dates to IST, coerces amounts to integer paise. No float math.",
  },
  {
    key: "match", number: "03", name: "Match Agent",
    role: "exact UTR + paise", icon: "fa-equals",
    match: /reconstruct|exact match|match agent/i, accent: C.moss,
    explain: "Reconstructs the fee schedule (MDR 2%, GST 18% on MDR, TCS 1%) independently, then matches each settlement to a bank credit on exact UTR + paise-exact amount.",
  },
  {
    key: "fuzzy", number: "04", name: "Fuzzy Agent",
    role: "near-miss recovery", icon: "fa-magnifying-glass",
    match: /fuzzy/i, accent: C.moss,
    explain: "For anything the exact pass missed, an amount-bucket index scans ±Rs.1 candidates and scores amount + date + UTR similarity. Accepts at confidence >= 0.85.",
  },
  {
    key: "repair", number: "05", name: "Repair Agent",
    role: "per-record branching", icon: "fa-code-branch",
    match: /repair/i, accent: C.rust,
    explain: "Every settlement that survived the two passes gets three repair strategies tried in order: normalize UTR, widen date window, tight fuzzy. First winner accepts. Every attempt logged.",
  },
  {
    key: "triage", number: "06", name: "Triage Agent",
    role: "route each exception", icon: "fa-sitemap",
    match: /triag/i, accent: C.gold,
    explain: "Routes each unmatched record: auto-resolve, needs human explanation, or escalate. Severity assigned via written rules on the resolution type and gap size.",
  },
  {
    key: "audit", number: "07", name: "Audit Agent",
    role: "persist + verify", icon: "fa-stamp",
    match: /verif|logg|audit/i, accent: C.ink,
    explain: "Writes every decision to SQLite. Every rupee on the Dashboard maps back to one row here. This is what makes any answer 'provable' instead of 'summarised'.",
  },
];

function findStep(steps, matcher) {
  return steps.find((s) => matcher.test(s.title || ""));
}

function statusOf(step) {
  if (!step) return "standby";
  if (step.status === "running") return "transmitting";
  if (step.status === "refused") return "refused";
  if (step.status === "caught") return "caught";
  return "verified";
}

// The right-side verdict chip content. Uses the substeps + counts already emitted
// by the backend so the wording stays truthful.
function verdictOf(step) {
  if (!step) return null;
  // Pull the first "N accepted / N deferred / N flagged" style substep if present.
  const subs = step.substeps || [];
  const preferred = subs.find((s) =>
    /(accepted|matched|deferred|flagged|recovered|written|escalate|reconcile)/i.test(s)
  );
  return preferred || step.detail || null;
}

function CornerBrackets({ color }) {
  const s = 10;
  const w = 1.5;
  const box = {
    position: "absolute",
    width: s,
    height: s,
    borderColor: color,
    borderStyle: "solid",
    pointerEvents: "none",
  };
  return (
    <>
      <span style={{ ...box, top: 4, left: 4, borderWidth: `${w}px 0 0 ${w}px` }} />
      <span style={{ ...box, top: 4, right: 4, borderWidth: `${w}px ${w}px 0 0` }} />
      <span style={{ ...box, bottom: 4, left: 4, borderWidth: `0 0 ${w}px ${w}px` }} />
      <span style={{ ...box, bottom: 4, right: 4, borderWidth: `0 ${w}px ${w}px 0` }} />
    </>
  );
}

function StatusDot({ status }) {
  const color = {
    standby: C.line, transmitting: C.rust, verified: C.moss,
    refused: C.rustDeep, caught: C.gold,
  }[status];
  const label = {
    standby: "STANDBY", transmitting: "TRANSMITTING",
    verified: "VERDICT LOGGED", refused: "REFUSED", caught: "CAUGHT",
  }[status];
  const shouldPulse = status === "transmitting";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 8, height: 8, borderRadius: "50%", background: color,
          boxShadow: shouldPulse ? `0 0 0 0 ${color}66` : "none",
          animation: shouldPulse ? "cockpit-pulse 1.4s ease-in-out infinite" : "none",
        }}
      />
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 9,
        letterSpacing: "0.14em", color, fontWeight: 700,
      }}>
        {label}
      </span>
    </div>
  );
}

function AgentStation({ station, step, revealIndex, stationIndex }) {
  const status = statusOf(step);
  const isRevealed = revealIndex >= stationIndex;
  const verdict = verdictOf(step);
  const isActive = isRevealed && status !== "standby";
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div
      style={{
        position: "relative",
        minHeight: 170,
        background: isActive ? C.paper : C.paperAlt,
        border: `1.5px solid ${isActive ? C.lineStrong : C.line}`,
        padding: "16px 18px 14px",
        display: "flex", flexDirection: "column", gap: 8,
        transition: "background 700ms cubic-bezier(0.22,1,0.36,1), border-color 700ms cubic-bezier(0.22,1,0.36,1), opacity 900ms cubic-bezier(0.22,1,0.36,1), transform 900ms cubic-bezier(0.22,1,0.36,1)",
        opacity: isRevealed ? 1 : 0.28,
        transform: isRevealed ? "translateY(0)" : "translateY(8px)",
        overflow: "visible",
      }}
    >
      {isActive && <CornerBrackets color={station.accent} />}

      {/* small (?) help affordance top-right; only when active so it doesn't distract */}
      {isActive && (
        <button
          type="button"
          onClick={() => setHelpOpen((v) => !v)}
          onMouseEnter={() => setHelpOpen(true)}
          onMouseLeave={() => setHelpOpen(false)}
          aria-label={`What does ${station.name} do?`}
          style={{
            position: "absolute", top: 8, right: 8, zIndex: 3,
            width: 16, height: 16, borderRadius: "50%",
            background: helpOpen ? station.accent : C.paper,
            color: helpOpen ? "#fff" : station.accent,
            border: `1px solid ${station.accent}`,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 9, fontWeight: 700, lineHeight: 1,
            cursor: "help",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >?</button>
      )}
      {helpOpen && (
        <div style={{
          position: "absolute", top: 28, right: 8, zIndex: 10,
          width: 240, padding: "10px 12px",
          background: C.paper, border: `1.5px solid ${station.accent}`,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10.5, color: C.ink, lineHeight: 1.55,
          boxShadow: "0 6px 20px -8px rgba(31,42,26,0.2)",
        }}>
          {station.explain}
        </div>
      )}

      {/* header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, paddingRight: 24 }}>
        <div style={{
          width: 34, height: 34, flexShrink: 0,
          background: isActive ? station.accent : "transparent",
          color: isActive ? "#fff" : C.line,
          border: `1.5px solid ${isActive ? station.accent : C.line}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13,
          transition: "background 700ms ease, color 700ms ease, border-color 700ms ease",
        }}>
          <i className={`fa-solid ${station.icon}`}></i>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 9.5, letterSpacing: "0.14em",
            color: C.inkSoft, fontWeight: 700,
          }}>
            STATION {station.number}
          </div>
          <div style={{
            fontFamily: "'Special Elite', 'IBM Plex Mono', monospace",
            fontSize: 14, color: C.ink, lineHeight: 1.15, marginTop: 2,
          }}>
            {station.name}
          </div>
          <div style={{ fontSize: 10.5, color: C.inkSoft, marginTop: 1, fontFamily: "'IBM Plex Mono', monospace" }}>
            {station.role}
          </div>
        </div>
      </div>

      {/* dashed divider */}
      <div style={{ borderTop: `1px dashed ${C.line}`, marginTop: 2 }} />

      {/* verdict line */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 6 }}>
        {isRevealed ? (
          <>
            <div style={{
              fontSize: 11, color: C.ink, lineHeight: 1.45,
              fontFamily: "'IBM Plex Mono', monospace",
              minHeight: 30,
            }}>
              {verdict || (
                <span style={{ color: C.inkSoft, fontStyle: "italic" }}>
                  no verdict emitted this run
                </span>
              )}
            </div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginTop: 4,
            }}>
              <StatusDot status={status} />
              {step?.ms != null && (
                <span style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9.5, color: C.inkSoft,
                  padding: "2px 6px",
                  border: `1px solid ${C.line}`,
                }}>
                  {step.ms >= 1000 ? `${(step.ms / 1000).toFixed(2)}s` : `${step.ms}ms`}
                </span>
              )}
            </div>
          </>
        ) : (
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
            letterSpacing: "0.16em", color: C.line, textTransform: "uppercase",
          }}>
            awaiting handoff...
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCell({ title, value, sub, accent, revealIndex, stationIndex, active = true }) {
  const isRevealed = revealIndex >= stationIndex;
  return (
    <div
      style={{
        position: "relative",
        minHeight: 170,
        background: active && isRevealed ? C.ink : C.paperAlt,
        color: active && isRevealed ? C.paper : C.ink,
        border: `1.5px solid ${active && isRevealed ? C.ink : C.line}`,
        padding: "16px 18px 14px",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        transition: "background 400ms ease, color 400ms ease, opacity 500ms ease",
        opacity: isRevealed ? 1 : 0.35,
      }}
    >
      {active && isRevealed && <CornerBrackets color={accent || C.gold} />}
      <div>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9.5, letterSpacing: "0.16em", fontWeight: 700,
          color: active && isRevealed ? "#D9C08A" : C.inkSoft,
        }}>
          {title}
        </div>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 32, fontWeight: 700, marginTop: 12, letterSpacing: "-0.01em",
        }}>
          {value}
        </div>
      </div>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10, letterSpacing: "0.06em",
        color: active && isRevealed ? "#93A38D" : C.inkSoft,
      }}>
        {sub}
      </div>
    </div>
  );
}

export default function AgentCockpit({ steps = [], totalMs = 0, decisions = 0, done = false }) {
  // Match backend stages to their spatial station positions. If a stage hasn't
  // arrived yet in the reveal, we render an "awaiting handoff" state.
  const stationsWithSteps = useMemo(
    () => STATIONS.map((s) => ({ station: s, step: findStep(steps, s.match) })),
    [steps]
  );

  // Progressive spatial reveal: cells light up in row-major order once the corresponding
  // backend step has arrived. Timer nudges the reveal even before backend delivers so
  // the grid never sits fully empty.
  const revealTargetIdx = stationsWithSteps.reduce(
    (acc, { step }, i) => (step ? Math.max(acc, i + 1) : acc),
    0
  );
  const [revealIdx, setRevealIdx] = useState(0);

  useEffect(() => {
    // Reveal one cell at a time, on a deliberate cadence so it feels premium and
    // considered rather than a build-log spamming past. 620ms per cell.
    const cap = done ? 9 : Math.min(9, revealTargetIdx + 1);
    if (revealIdx >= cap) return;
    const t = setTimeout(() => setRevealIdx((r) => Math.min(cap, r + 1)), 620);
    return () => clearTimeout(t);
  }, [revealIdx, revealTargetIdx, done]);

  // Elapsed for the mission clock — sum of all step latencies, formatted human.
  const totalSeconds = (totalMs / 1000).toFixed(2);
  const completedAgents = stationsWithSteps.filter(({ step }) =>
    step && step.status !== "running"
  ).length;

  return (
    <div style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
      {/* Cockpit header — quiet, single line, no CI-log affordances */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14, paddingBottom: 10,
        borderBottom: `1px solid ${C.line}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: done ? C.moss : C.rust,
            animation: done ? "none" : "cockpit-pulse 1.4s ease-in-out infinite",
          }} />
          <span style={{
            fontSize: 10, letterSpacing: "0.18em", color: C.rust,
            fontWeight: 700, textTransform: "uppercase",
          }}>
            Agent Cockpit · {completedAgents}/7 verdicts logged
          </span>
        </div>
        <span style={{
          fontSize: 10, letterSpacing: "0.06em", color: C.inkSoft,
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          hover the (?) on any card to see what that agent does
        </span>
      </div>

      {/* 3x3 grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 10,
      }}>
        {stationsWithSteps.map(({ station, step }, i) => (
          <AgentStation
            key={station.key}
            station={station}
            step={step}
            revealIndex={revealIdx}
            stationIndex={i}
          />
        ))}

        {/* Cell 8: total elapsed */}
        <StatusCell
          title="TOTAL ELAPSED"
          value={`${totalSeconds}s`}
          sub={`across all 7 agents`}
          accent={C.gold}
          revealIndex={revealIdx}
          stationIndex={7}
        />

        {/* Cell 9: decisions written */}
        <StatusCell
          title="DECISIONS LOGGED"
          value={decisions ? decisions.toLocaleString("en-IN") : "-"}
          sub="rows in the audit trail"
          accent={C.rust}
          revealIndex={revealIdx}
          stationIndex={8}
        />
      </div>

      <style>{`
        @keyframes cockpit-pulse {
          0%, 100% { transform: scale(0.9); opacity: 0.55; }
          50%      { transform: scale(1.25); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
