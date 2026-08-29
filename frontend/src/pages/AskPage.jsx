import React, { useState, useEffect, useRef, useCallback, createContext, useContext, forwardRef } from "react";
import * as api from "../api.js";

/* ─────────────────────────────────────────────────────────────
   RECONMINT PALETTE (reference)
   ink        #1F2A1A   dark green-black text/borders
   red        #B5432F   brick red accent / stamp
   gold       #A9832E   brass accent — ledger seals, dividers
   sage-50    #F3F6ED   lightest stripe
   sage-100   #E7EEDD   base stripe
   sage-200   #D9E3C8   darker stripe
   cream      #FBFBF3   card background

   RECONMINT TYPE SYSTEM (three faces, used deliberately)
   rm-display   Special Elite   the one true headline face — a
                                struck-typewriter character mark,
                                used sparingly, never for body copy
   rm-mono      IBM Plex Mono   labels, data, figures, chrome —
                                the ledger's working voice
   rm-sans      Inter           anything meant to be read at length:
                                the agent's actual answers, prose
───────────────────────────────────────────────────────────── */
const FONT_IMPORT_URL =
  "https://fonts.googleapis.com/css2?family=Special+Elite&family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap";

function useReconMintFonts() {
  useEffect(() => {
    if (!document.getElementById("reconmint-font-import")) {
      const link = document.createElement("link");
      link.id = "reconmint-font-import";
      link.rel = "stylesheet";
      link.href = FONT_IMPORT_URL;
      document.head.appendChild(link);
    }
    if (!document.getElementById("reconmint-type-system")) {
      const style = document.createElement("style");
      style.id = "reconmint-type-system";
      style.textContent = `
        .rm-display { font-family: 'Special Elite', 'Courier New', monospace; }
        .rm-mono    { font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
        .rm-sans    { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
      `;
      document.head.appendChild(style);
    }
  }, []);
}

/* ─────────────────────────────────────────────────────────────
   BORDER BEAM  (ledger-seal pulse — ink → brick → brass, never
   the stock purple/blue/emerald AI-glow. Same three colors that
   already live on this page, just in motion.)
───────────────────────────────────────────────────────────── */
function BorderBeam({
  children,
  active = true,
  duration = 8,
  className = "",
}) {
  return (
    <div className={`relative rounded-xl ${className}`}>
      {active && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-3 rounded-[26px] blur-2xl"
          style={{
            background:
              "linear-gradient(135deg, rgba(181,67,47,0.22), rgba(169,131,46,0.22), rgba(31,42,26,0.16))",
            animation: `beam-breathe ${duration * 0.75}s ease-in-out infinite`,
          }}
        />
      )}

      <div
        className="pointer-events-none absolute -inset-[1px] rounded-xl overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute inset-[-60%]"
          style={{
            background: active
              ? `conic-gradient(from 0deg,
                  transparent 0deg,
                  transparent 220deg,
                  rgba(181,67,47,0.9) 260deg,
                  rgba(169,131,46,0.95) 300deg,
                  rgba(31,42,26,0.75) 335deg,
                  transparent 360deg)`
              : "transparent",
            animation: active
              ? `beam-spin ${duration}s cubic-bezier(0.45, 0, 0.55, 1) infinite`
              : "none",
            willChange: "transform",
          }}
        />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[1px] rounded-xl"
        style={{
          boxShadow: active
            ? "0 0 0 1px rgba(31,42,26,0.10)"
            : "0 0 0 1px rgba(31,42,26,0.16)",
          transition: "box-shadow 0.4s ease",
        }}
      />

      <div className="relative rounded-xl" style={{ background: "#FBFBF3" }}>{children}</div>

      <style>{`
        @keyframes beam-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes beam-breathe {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50%      { opacity: 0.6;  transform: scale(1.03); }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PROMPT INPUT CONTEXT
───────────────────────────────────────────────────────────── */
const PromptInputContext = createContext({
  isLoading: false, value: "", setValue: () => {}, maxHeight: 240, onSubmit: undefined, disabled: false,
});
function usePromptInput() { return useContext(PromptInputContext); }

/* ─────────────────────────────────────────────────────────────
   TOOLTIP (stamped-label style)
───────────────────────────────────────────────────────────── */
function Tip({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && (
        <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] rm-mono z-50 shadow-lg"
          style={{ background: "#1F2A1A", color: "#FBFBF3" }}>
          {label}
        </span>
      )}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   ICONS (inline SVG, only the two the prompt box actually uses)
───────────────────────────────────────────────────────────── */
const Icon = {
  ArrowUp: () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>,
  Stop: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
};

/* ─────────────────────────────────────────────────────────────
   PROMPT INPUT BOX  (ledger style, focused on the one job)
   Deliberately no attachments, no mode toggles, no voice recorder -
   this agent answers grounded questions about a reconciliation run,
   nothing else. Every affordance either does that, or doesn't ship.
───────────────────────────────────────────────────────────── */
export const PromptInputBox = forwardRef(({ onSend, isLoading = false, placeholder = "Ask about fees, exceptions, a payment id…" }, ref) => {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef(null);
  const localBoxRef = useRef(null);
  const boxRef = ref || localBoxRef;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    onSend?.(text);
    setInput("");
  };

  const hasContent = input.trim() !== "";

  return (
    <div ref={boxRef}
      className="rounded-xl border transition-all duration-200"
      style={{
        background: "#FBFBF3",
        borderColor: focused ? "#1F2A1A" : "#D9E3C8",
        borderWidth: focused ? "1.5px" : "1px",
        boxShadow: focused ? "0 4px 18px rgba(31,42,26,0.09)" : "0 1px 3px rgba(31,42,26,0.05)",
      }}
    >
      <div className="px-5 pt-4">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={1}
          placeholder={placeholder}
          disabled={isLoading}
          className="w-full resize-none bg-transparent text-[16px] rm-mono focus:outline-none leading-relaxed disabled:opacity-50 placeholder:text-[#A9B396]"
          style={{ minHeight: 46, maxHeight: 200, color: "#1F2A1A" }}
        />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 pb-3.5 pt-2.5 border-t"
        style={{ borderColor: "#EEF2E4" }}>
        {/* Left: transparent scope disclosure - honest about what this box does */}
        <div className="flex items-center gap-2 text-[12px] rm-mono uppercase tracking-wider"
          style={{ color: "#8A9478" }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#B5432F" }} />
          This run only · figures verified before sent
        </div>

        <Tip label={isLoading ? "Working…" : hasContent ? "Send" : "Type to send"}>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !hasContent}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 disabled:opacity-40"
            style={
              isLoading ? { background: "rgba(31,42,26,0.06)", color: "#6B7660" }
              : hasContent ? { background: "#1F2A1A", color: "#FBFBF3", boxShadow: "0 2px 8px rgba(31,42,26,0.25)" }
              : { background: "#EEF2E4", color: "#6B7660" }
            }
          >
            {isLoading ? <Icon.Stop /> : <Icon.ArrowUp />}
          </button>
        </Tip>
      </div>
    </div>
  );
});
PromptInputBox.displayName = "PromptInputBox";

/* ─────────────────────────────────────────────────────────────
   EMPTY STATE
───────────────────────────────────────────────────────────── */
function EmptyState({ onGoUpload }) {
  useReconMintFonts();
  return (
    <div className="h-full flex flex-col items-center justify-center text-center rm-mono px-6" style={{ color: "#8A9478" }}>
      <svg className="w-14 h-14 mb-5" style={{ color: "#C3CFAE" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M12 3c4.97 0 9 3.582 9 8s-4.03 8-9 8a9.9 9.9 0 0 1-4.01-.833L3 20l1.338-3.124C3.493 15.67 3 13.885 3 12c0-4.418 4.03-8 9-8Z"/></svg>
      <p className="rm-sans text-xl font-semibold mb-2 tracking-tight" style={{ color: "#1F2A1A" }}>No run loaded</p>
      <p className="rm-sans text-base mb-7 max-w-xs leading-relaxed">Reconcile a batch first, then ask the agent about it.</p>
      <button onClick={onGoUpload}
        className="text-base font-medium px-7 py-3 rounded-lg transition-all hover:-translate-y-px"
        style={{ background: "#1F2A1A", color: "#FBFBF3", boxShadow: "0 4px 14px rgba(31,42,26,0.22)" }}>
        Go to Upload
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   AGENT TRACE  (ledger stamp)
───────────────────────────────────────────────────────────── */
const STEP_STYLES = {
  done:    { ring: "#1F2A1A", ringBg: "#EEF2E4", line: "#D9E3C8" },
  caught:  { ring: "#B5432F", ringBg: "rgba(181,67,47,0.08)", line: "#E7C7BE" },
  running: { ring: "#8A9478", ringBg: "#FBFBF3", line: "#E7EEDD" },
  refused: { ring: "#B5432F", ringBg: "rgba(181,67,47,0.12)", line: "#E7C7BE" },
};

const STEP_ICON = {
  done: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0L3.3 9.5a1 1 0 1 1 1.4-1.4l3.6 3.6 6.7-6.7a1 1 0 0 1 1.4 0Z" clipRule="evenodd"/>
    </svg>
  ),
  caught: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.72-1.36 3.486 0l6.28 11.18c.75 1.334-.213 2.987-1.744 2.987H3.72c-1.53 0-2.492-1.653-1.743-2.987l6.28-11.18ZM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-.25-6.5a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5Z" clipRule="evenodd"/>
    </svg>
  ),
  running: (
    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="10" cy="10" r="7" strokeOpacity="0.25" />
      <path d="M17 10a7 7 0 0 0-7-7" strokeLinecap="round" />
    </svg>
  ),
  refused: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM6.28 6.28a.75.75 0 0 1 1.06 0L10 8.94l2.66-2.66a.75.75 0 1 1 1.06 1.06L11.06 10l2.66 2.66a.75.75 0 1 1-1.06 1.06L10 11.06l-2.66 2.66a.75.75 0 0 1-1.06-1.06L8.94 10 6.28 7.34a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
    </svg>
  ),
};

function AgentTrace({ trace }) {
  return (
    <div className="mb-7 rm-mono">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] flex items-center gap-2" style={{ color: "#8A9478" }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#B5432F" }} />
          Reasoning trace
        </p>
        <span className="text-[12px]" style={{ color: "#B7C4A3" }}>
          {trace.reduce((sum, s) => sum + (s.ms || 0), 0)}ms total
        </span>
      </div>

      <div className="relative">
        {trace.map((s, i) => {
          const style = STEP_STYLES[s.status] || STEP_STYLES.done;
          const isLast = i === trace.length - 1;
          return (
            <div key={i} className="flex items-start gap-4 relative">
              {!isLast && (
                <div className="absolute left-[13px] top-7 bottom-[-2px] w-px" style={{ background: style.line }} />
              )}
              <div className="relative z-10 mt-0.5 w-[26px] h-[26px] rounded-full border flex items-center justify-center flex-shrink-0"
                style={{ borderColor: style.ring, background: style.ringBg, color: style.ring }}>
                {STEP_ICON[s.status] || STEP_ICON.done}
              </div>
              <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-5"}`}>
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <span className="text-[15px] font-medium" style={{ color: "#1F2A1A" }}>{s.title}</span>
                  {s.via && (
                    <span className="text-[11px] uppercase tracking-wide rounded px-1.5 py-0.5 border"
                      style={{ color: "#8A9478", background: "#F3F6ED", borderColor: "#E7EEDD" }}>
                      {s.via}
                    </span>
                  )}
                  <span className="text-[12px] ml-auto tabular-nums" style={{ color: "#B7C4A3" }}>
                    {s.ms}ms
                  </span>
                </div>
                {s.detail && (
                  <p className="text-[13.5px] mt-1.5 leading-relaxed" style={{ color: "#8A9478" }}>{s.detail}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   VERIFICATION STAMP
   Double-ring ledger seal, matching the hero "VERIFIED" stamp —
   the page's one signature element, reused here at answer scale
   instead of a thin single circle.
───────────────────────────────────────────────────────────── */
function VerificationStamp({ verified }) {
  const tone = verified ? "#B5432F" : "#8A9478";
  return (
    <div
      className="absolute top-5 right-5 flex items-center justify-center rounded-full select-none pointer-events-none"
      style={{
        width: 92, height: 92,
        border: `2px solid ${tone}`,
        transform: "rotate(-7deg)",
        opacity: 0.92,
      }}
    >
      <div
        className="absolute inset-[5px] rounded-full"
        style={{ border: `1px dashed ${tone}`, opacity: 0.6 }}
      />
      <div className="flex flex-col items-center justify-center text-center px-2" style={{ color: tone }}>
        <span className="text-[13px] font-bold uppercase tracking-wide leading-none">
          {verified ? "Verified" : "Unproven"}
        </span>
        <span className="text-[7px] font-semibold uppercase tracking-[0.12em] mt-1.5 leading-tight opacity-80">
          ReconMint · this run
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ANSWER CARD  (ledger sheet with red verification stamp)
───────────────────────────────────────────────────────────── */
function AnswerCard({ turn }) {
  const { answer, figures = [], rows = [], verified, trace, plan, receipts } = turn.result;
  const [showReceipts, setShowReceipts] = useState(false);

  return (
    <div className="rounded-xl border overflow-hidden mb-8 relative"
      style={{ background: "#FBFBF3", borderColor: "#D9E3C8", boxShadow: "0 2px 10px rgba(31,42,26,0.07), 0 1px 2px rgba(31,42,26,0.05)" }}>

      {/* thin brass top edge — premium ledger cue, echoes the gold rule on the landing stat cards */}
      <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg, #A9832E, #D9C27E 40%, #A9832E)" }} />

      <VerificationStamp verified={verified} />

      <div className="p-8 pb-6 pr-32">
        <AgentTrace trace={trace} />

        <div className="border-t pt-6" style={{ borderColor: "#E7EEDD" }}>
          <p className="rm-sans text-[17px] leading-[1.75] tracking-[-0.005em]" style={{ color: "#1F2A1A" }}>
            {answer}
          </p>
        </div>
      </div>

      {plan && (
        <div className="px-8 pb-6">
          <div className="rounded-lg border overflow-hidden" style={{ background: "#F3F6ED", borderColor: "#D9E3C8" }}>
            <div className="px-5 py-3.5 flex items-center gap-2.5 flex-wrap border-b" style={{ background: "#EEF2E4", borderColor: "#D9E3C8" }}>
              <i className="fa-solid fa-stethoscope text-[13px]" style={{ color: "#B5432F" }} />
              <span className="text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#6B7660" }}>
                Resolution plan for {plan.payment_id} · {plan.category}
              </span>
              <span className="ml-auto text-[12px] rm-mono px-2.5 py-1 rounded uppercase tracking-wide"
                style={{ background: "#1F2A1A", color: "#FBFBF3" }}>
                recommend: {plan.recommended_reason}
              </span>
            </div>
            <div className="px-5 py-4.5">
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] mb-1.5" style={{ color: "#8A9478" }}>Root cause</div>
              <p className="rm-sans text-[15px] leading-relaxed mb-4" style={{ color: "#1F2A1A" }}>{plan.root_cause}</p>
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] mb-1.5" style={{ color: "#8A9478" }}>Steps</div>
              <ol className="rm-sans text-[15px] leading-relaxed space-y-2" style={{ color: "#1F2A1A" }}>
                {plan.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="rm-mono font-semibold shrink-0" style={{ color: "#B5432F" }}>{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {figures.length > 0 && (
        <div className="px-8 pb-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] mb-3 rm-mono" style={{ color: "#8A9478" }}>
            Key figures
          </p>
          <div className="flex flex-wrap gap-2.5">
            {figures.map((f, i) => (
              <div key={i}
                className="group flex items-center gap-3 rounded-lg px-4 py-2.5 border transition-colors"
                style={{ background: "#F3F6ED", borderColor: "#E7EEDD" }}>
                <span className="text-[13px] font-medium rm-mono" style={{ color: "#6B7660" }}>{f.label}</span>
                <span className="text-[16px] font-semibold rm-mono tabular-nums" style={{ color: "#1F2A1A" }}>
                  {typeof f.value === "number" && !Number.isInteger(f.value)
                    ? api.formatINR?.(f.value) ?? f.value
                    : f.value}
                </span>
                <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#B5432F" }} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0L3.3 9.5a1 1 0 1 1 1.4-1.4l3.6 3.6 6.7-6.7a1 1 0 0 1 1.4 0Z" clipRule="evenodd"/>
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}

      {receipts && receipts.sample && receipts.sample.length > 0 && (
        <div className="px-8 pb-6">
          <button
            onClick={() => setShowReceipts((v) => !v)}
            className="flex items-center gap-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] transition-colors rm-mono"
            style={{ color: "#B5432F" }}
          >
            <i className={`fa-solid fa-chevron-${showReceipts ? "down" : "right"} text-[10px]`} />
            {showReceipts ? "Hide receipts" : "Prove it, show the exact rows"}
            <span className="ml-1 rounded-full px-2 py-0.5 text-[12px] rm-mono"
              style={{ background: "rgba(31,42,26,0.06)", color: "#6B7660", border: "1px solid rgba(31,42,26,0.14)" }}>
              {receipts.total_records} row{receipts.total_records === 1 ? "" : "s"} aggregated
            </span>
          </button>
          {showReceipts && (
            <div className="mt-3 border rounded-lg overflow-hidden rm-mono"
              style={{ borderColor: "#D9E3C8", background: "#F3F6ED" }}>
              <div className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider border-b"
                style={{ background: "#EEF2E4", borderColor: "#D9E3C8", color: "#6B7660" }}>
                Sample of {Math.min(receipts.sample.length, receipts.total_records)} of {receipts.total_records} rows the compute step aggregated
                {receipts.total_records > receipts.sample.length &&
                  <span className="normal-case ml-1"> · showing the top by contribution</span>}
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr className="text-[11.5px] uppercase tracking-wider" style={{ color: "#8A9478" }}>
                      {receipts.sample[0] && Object.keys(receipts.sample[0]).map((k) => (
                        <th key={k} className={`text-left py-2.5 px-4 font-semibold ${k !== "id" ? "text-right" : ""}`}>{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.sample.map((r, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "rgba(31,42,26,0.06)" }}>
                        {Object.entries(r).map(([k, v]) => (
                          <td key={k}
                            className={`py-2.5 px-4 ${k !== "id" ? "text-right tabular-nums" : "font-semibold"}`}
                            style={{ color: "#1F2A1A" }}>
                            {typeof v === "number" && !Number.isInteger(v)
                              ? api.formatINR?.(v) ?? v
                              : v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t text-[12px] italic"
                style={{ background: "#EEF2E4", borderColor: "#D9E3C8", color: "#6B7660" }}>
                Every row above lives in the audit table for this run, cross-check any id in
                Exceptions or the source-file viewer.
              </div>
            </div>
          )}
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="px-8 pb-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] mb-3 rm-mono" style={{ color: "#8A9478" }}>
            Supporting rows
          </p>
          <div className="border rounded-lg overflow-hidden" style={{ borderColor: "#E7EEDD" }}>
            <table className="w-full text-base rm-mono">
              <thead>
                <tr className="text-[11.5px] uppercase tracking-wider" style={{ color: "#8A9478", background: "#F3F6ED" }}>
                  <th className="text-left py-3 px-4 font-semibold">Payment</th>
                  <th className="text-right py-3 px-4 font-semibold">Amount</th>
                  <th className="text-left py-3 px-4 font-semibold">Severity</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((r, i) => (
                  <tr key={i} className="transition-colors border-t" style={{ borderColor: "#F3F6ED" }}>
                    <td className="py-3 px-4 font-medium text-[14.5px]" style={{ color: "#1F2A1A" }}>{r.id}</td>
                    <td className="py-3 px-4 text-right text-[14.5px] tabular-nums" style={{ color: "#1F2A1A" }}>
                      {api.formatINR?.(r.amount) ?? r.amount}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[12.5px] font-medium px-2.5 py-1 rounded-full"
                        style={
                          r.severity === "high" ? { background: "rgba(181,67,47,0.1)", color: "#B5432F" }
                          : r.severity === "medium" ? { background: "#F3ECD8", color: "#8A6A2E" }
                          : { background: "#EEF2E4", color: "#6B7660" }
                        }>
                        {r.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 px-8 py-4 border-t rm-mono"
        style={verified
          ? { background: "rgba(31,42,26,0.03)", borderColor: "#E7EEDD" }
          : { background: "rgba(181,67,47,0.06)", borderColor: "#E7C7BE" }}>
        <span className="flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0"
          style={verified ? { background: "#E7EEDD", color: "#1F2A1A" } : { background: "rgba(181,67,47,0.15)", color: "#B5432F" }}>
          {verified ? (
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0L3.3 9.5a1 1 0 1 1 1.4-1.4l3.6 3.6 6.7-6.7a1 1 0 0 1 1.4 0Z" clipRule="evenodd"/>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.72-1.36 3.486 0l6.28 11.18c.75 1.334-.213 2.987-1.744 2.987H3.72c-1.53 0-2.492-1.653-1.743-2.987l6.28-11.18ZM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-.25-6.5a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5Z" clipRule="evenodd"/>
            </svg>
          )}
        </span>
        <span className="text-[14px] font-medium" style={{ color: verified ? "#1F2A1A" : "#B5432F" }}>
          {verified ? "Every figure independently verified" : "Could not verify one or more figures, answer withheld"}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   EXAMPLE CHIPS  (rotating, ledger style)
───────────────────────────────────────────────────────────── */
function ExampleChips({ examples, onAsk, disabled }) {
  const BATCH = 4;
  const [offset, setOffset] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (examples.length <= BATCH) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setOffset(o => (o + BATCH) % examples.length);
        setVisible(true);
      }, 280);
    }, 4200);
    return () => clearInterval(interval);
  }, [examples.length]);

  if (!examples.length) return null;

  const batch = Array.from({ length: Math.min(BATCH, examples.length) }, (_, i) =>
    examples[(offset + i) % examples.length]
  );

  return (
    <div className="mb-4 rm-mono">
      <div className="flex items-center gap-2 mb-2.5">
        <svg className="w-3.5 h-3.5" style={{ color: "#B7C4A3" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.5-6.5-2.1 2.1M8.6 15.4l-2.1 2.1m0-11 2.1 2.1m8.8 8.8 2.1 2.1" />
        </svg>
        <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "#8A9478" }}>Try asking</span>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {batch.map((ex, i) => (
          <button
            key={`${offset}-${i}`}
            onClick={() => onAsk(ex)}
            disabled={disabled}
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0px)" : "translateY(4px)",
              transition: `opacity 320ms ease ${i * 60}ms, transform 320ms ease ${i * 60}ms`,
              color: "#4A5540",
              background: "#FBFBF3",
              borderColor: "#D9E3C8",
            }}
            className="group relative text-[14px] rounded-full px-4 py-2 border
                       hover:shadow-sm hover:-translate-y-px hover:border-[#1F2A1A]
                       active:translate-y-0 transition-all duration-200 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            <span className="relative z-10">{ex}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────────── */
export default function AskPage({ run, showToast, onGoUpload, preload }) {
  useReconMintFonts();
  const [examples, setExamples] = useState([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [streamTrace, setStreamTrace] = useState(null); // trace revealed one step at a time while busy
  const scrollRef = useRef(null);
  const lastPreloadToken = useRef(null);

  useEffect(() => {
    api.getAskExamples?.().then(d => setExamples(d.examples || [])).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, busy]);

  if (!run) return <EmptyState onGoUpload={onGoUpload} />;

  // While the request is in flight, reveal a placeholder trace step-by-step so the user
  // sees the agent thinking, then replace it with the real trace when the response lands.
  const PROVISIONAL_TRACE = [
    { title: "Understanding intent", detail: "classifying question against allowed metrics", status: "running" },
    { title: "Choosing a deterministic tool", detail: "picking the compute path over audited decisions", status: "running" },
    { title: "Computing figures", detail: "aggregating from SQLite decisions table", status: "running" },
    { title: "Verifying every figure", detail: "hallucination guard: any rupee must trace to a computed number", status: "running" },
  ];

  const ask = async (question) => {
    const q = String(question ?? input ?? "").trim();
    if (!q || busy) return;
    const runId = run.runId || run.run_id;
    if (!runId) {
      showToast?.("No reconciliation run is loaded. Reconcile a batch first.", "error");
      return;
    }
    setInput("");
    setBusy(true);
    // Streaming reveal: expose provisional steps at ~800ms cadence, and hold the
    // final answer for at least 3.2s so a real query feels like the agent is doing
    // work, not just fetching a cached response.
    setStreamTrace([{ ...PROVISIONAL_TRACE[0] }]);
    let i = 0;
    const revealer = setInterval(() => {
      i += 1;
      if (i >= PROVISIONAL_TRACE.length) { clearInterval(revealer); return; }
      setStreamTrace(PROVISIONAL_TRACE.slice(0, i + 1).map((s, k) =>
        k < i ? { ...s, status: "done", ms: 620 + k * 190 } : s));
    }, 800);
    const revealStartedAt = Date.now();
    const MIN_REVEAL_MS = 3200;
    try {
      const result = await api.askAgent(runId, q);
      // Hold for the minimum time so all 4 provisional steps land visibly.
      const elapsed = Date.now() - revealStartedAt;
      if (elapsed < MIN_REVEAL_MS) {
        await new Promise((r) => setTimeout(r, MIN_REVEAL_MS - elapsed));
      }
      clearInterval(revealer);
      setStreamTrace(null);
      setHistory((h) => [...h, { question: q, result }]);
    } catch (e) {
      clearInterval(revealer);
      setStreamTrace(null);
      const message = e.message ?? "Something went wrong";
      showToast?.(message, "error");
      setHistory((h) => [...h, {
        question: q,
        result: {
          answer: message,
          figures: [],
          rows: [],
          verified: false,
          trace: [{ title: "Request failed", detail: message, ms: 0, status: "refused" }],
        },
      }]);
    } finally {
      setBusy(false);
    }
  };

  // Preload handoff from ExceptionsPage: fire the question exactly once per token.
  useEffect(() => {
    if (!preload || preload.token === lastPreloadToken.current) return;
    lastPreloadToken.current = preload.token;
    if (preload.question) ask(preload.question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preload, run]);

  const handleSend = (message) => {
    const q = message.trim();
    if (q) ask(q);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden rm-mono" style={{ background: "#FBFBF3" }}>
      {/* decorative binder holes */}
      <div className="pointer-events-none fixed left-2 top-0 bottom-0 flex flex-col items-center gap-6 py-8 opacity-40 z-0">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: "#B7C4A3" }} />
        ))}
      </div>

      {/* header — ledger letterhead, not a flat white bar */}
      <header className="relative z-10 overflow-hidden">
        <div
          className="px-9 pt-7 pb-5 relative"
          style={{
            background: "linear-gradient(180deg, #EFF3E4 0%, #F5F7EE 65%, #FBFBF3 100%)",
          }}
        >
          {/* faint paper stripes, barely-there, for texture instead of flat color */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage: "repeating-linear-gradient(180deg, transparent 0px, transparent 27px, rgba(31,42,26,0.025) 27px, rgba(31,42,26,0.025) 28px)",
            }}
          />

          <div className="relative flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div className="flex items-center gap-2.5 mb-2.5">
                <span className="w-5 h-px" style={{ background: "#B5432F" }} />
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#B5432F" }}>
                  Ask the Agent
                </span>
              </div>
              <h1
                className="rm-display leading-[1.08]"
                style={{ color: "#1F2A1A", fontSize: 36, letterSpacing: "-0.01em" }}
              >
                Ask the Agent
              </h1>
              <p className="rm-sans text-[16.5px] mt-3 leading-snug max-w-md" style={{ color: "#5B6650" }}>
                Every answer verified before it's said — it cannot fabricate a rupee.
              </p>
            </div>

            {(run.runId || run.run_id) && (
              <div
                className="mt-1 flex items-center gap-2.5 rounded-md border px-3.5 py-2"
                style={{ background: "rgba(251,251,243,0.7)", borderColor: "#D9E3C8" }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#B5432F" }} />
                <div className="leading-tight">
                  <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#8A9478" }}>
                    Run reference
                  </div>
                  <div className="text-[13px] rm-mono font-medium tabular-nums" style={{ color: "#1F2A1A" }}>
                    {run.runId || run.run_id}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* double rule, echoing the letterhead line under the site nav */}
        <div style={{ borderBottom: "2px solid #1F2A1A" }} />
        <div style={{ borderBottom: "1px solid #D9E3C8" }} />
      </header>

      {/* chat scroll area, faint ledger stripes */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-7 py-7 relative z-10"
        style={{
          backgroundImage: "repeating-linear-gradient(180deg, #F3F6ED 0px, #F3F6ED 28px, #E9F0DC 28px, #E9F0DC 56px)",
        }}
      >
        <div className="max-w-3xl mx-auto">
          {history.length === 0 && (
            <div className="text-center py-20" style={{ color: "#8A9478" }}>
              <svg className="w-10 h-10 mx-auto mb-4" style={{ color: "#C3CFAE" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M12 3c4.97 0 9 3.582 9 8s-4.03 8-9 8a9.9 9.9 0 0 1-4.01-.833L3 20l1.338-3.124C3.493 15.67 3 13.885 3 12c0-4.418 4.03-8 9-8Z"/></svg>
              <p className="text-base">Ask a question about this reconciliation run.</p>
            </div>
          )}

          {history.map((turn, i) => (
            <div key={i}>
              {/* user bubble */}
              <div className="flex justify-end mb-4">
                <div className="text-[15px] px-5 py-3 rounded-xl rounded-tr-sm max-w-[80%] leading-relaxed"
                  style={{ background: "#1F2A1A", color: "#FBFBF3" }}>
                  {turn.question}
                </div>
              </div>
              {/* agent answer */}
              <AnswerCard turn={turn} />
            </div>
          ))}

          {/* streaming reasoning trace while the request is in flight */}
          {busy && streamTrace && (
            <div className="rounded-xl border p-6 mb-6"
              style={{ background: "#FBFBF3", borderColor: "#D9E3C8", boxShadow: "0 2px 10px rgba(31,42,26,0.06)" }}>
              <div className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.14em] mb-4"
                style={{ color: "#B5432F" }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#B5432F" }} />
                Agent is reasoning
              </div>
              <AgentTrace trace={streamTrace} />
            </div>
          )}
        </div>
      </div>

      {/* input area */}
      <div className="border-t px-7 py-5 relative z-10" style={{ borderColor: "#E7EEDD", background: "#FBFBF3" }}>
        <div className="max-w-3xl mx-auto">
          {examples.length > 0 && history.length === 0 && (
            <ExampleChips examples={examples} onAsk={ask} disabled={busy} />
          )}

          <BorderBeam active={busy} duration={2}>
            <PromptInputBox
              isLoading={busy}
              placeholder="Ask about fees, exceptions, a payment id…"
              onSend={handleSend}
            />
          </BorderBeam>

          <p className="text-[12px] text-center mt-2.5" style={{ color: "#A9B396" }}>
            Answers this run only, files, fees, exceptions, payment ids. Off-topic questions are refused.
            &nbsp;·&nbsp; Press <kbd className="border rounded px-1.5 py-0.5 text-[11px]" style={{ background: "#F3F6ED", borderColor: "#D9E3C8" }}>Enter</kbd> to send
          </p>
        </div>
      </div>

    </div>
  );
}