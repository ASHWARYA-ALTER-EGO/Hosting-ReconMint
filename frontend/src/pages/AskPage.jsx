import React, { useState, useEffect, useRef, useCallback, createContext, useContext, forwardRef } from "react";
import * as api from "../api.js";

/* ─────────────────────────────────────────────────────────────
   RECONMINT PALETTE (reference)
   ink        #1F2A1A   dark green-black text/borders
   red        #B5432F   brick red accent / stamp
   sage-50    #F3F6ED   lightest stripe
   sage-100   #E7EEDD   base stripe
   sage-200   #D9E3C8   darker stripe
   cream      #FBFBF3   card background
───────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────
   BORDER BEAM  (ledger-stamp version — dashed red ring pulse
   instead of a soft rainbow glow)
───────────────────────────────────────────────────────────── */
function BorderBeam({
  children,
  active = true,
  duration = 8,       // slower = smoother, premium feel. 6-10s is the sweet spot
  className = "",
}) {
  return (
    <div className={`relative rounded-2xl ${className}`}>
      {/* soft ambient glow behind everything — very subtle, slow breathing */}
      {active && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-3 rounded-[28px] blur-2xl"
          style={{
            background:
              "linear-gradient(135deg, rgba(129,140,248,0.35), rgba(56,189,248,0.35), rgba(52,211,153,0.35))",
            animation: `beam-breathe ${duration * 0.75}s ease-in-out infinite`,
          }}
        />
      )}

      {/* thin animated ring — the actual traveling beam */}
      <div
        className="absolute -inset-[1px] rounded-2xl overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute inset-[-60%]"
          style={{
            background: active
              ? `conic-gradient(from 0deg,
                  transparent 0deg,
                  transparent 220deg,
                  rgba(129,140,248,0.9) 260deg,
                  rgba(56,189,248,0.95) 300deg,
                  rgba(52,211,153,0.9) 335deg,
                  transparent 360deg)`
              : "transparent",
            animation: active
              ? `beam-spin ${duration}s cubic-bezier(0.45, 0, 0.55, 1) infinite`
              : "none",
            willChange: "transform",
          }}
        />
      </div>

      {/* faint static ring so the box has definition even between beam passes */}
      <div
        aria-hidden="true"
        className="absolute -inset-[1px] rounded-2xl pointer-events-none"
        style={{
          boxShadow: active
            ? "0 0 0 1px rgba(148, 163, 184, 0.12)"
            : "0 0 0 1px rgba(148, 163, 184, 0.18)",
          transition: "box-shadow 0.4s ease",
        }}
      />

      {/* the actual content, floating cleanly on top */}
      <div className="relative rounded-2xl" style={{ background: "#FBFBF3" }}>{children}</div>

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
        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-[11px] font-mono z-50"
          style={{ background: "#1F2A1A", color: "#FBFBF3" }}>
          {label}
        </span>
      )}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   ICONS (inline SVG)
───────────────────────────────────────────────────────────── */
const Icon = {
  Paperclip: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,
  Globe: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20A14.5 14.5 0 0 0 12 2"/><path d="M2 12h20"/></svg>,
  Brain: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>,
  Code: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  Mic: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>,
  MicOff: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>,
  ArrowUp: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>,
  Stop: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  X: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
};

/* ─────────────────────────────────────────────────────────────
   VOICE RECORDER BAR
───────────────────────────────────────────────────────────── */
function VoiceRecorder({ isRecording, onStop }) {
  const [time, setTime] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isRecording) {
      setTime(0);
      timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const bars = 28;

  if (!isRecording) return null;
  return (
    <div className="flex items-center gap-3 px-1 py-2 font-mono">
      <span className="flex h-2 w-2 rounded-full" style={{ background: "#B5432F", animation: "pulse-dot 1s ease-in-out infinite" }} />
      <span className="text-xs tabular-nums" style={{ color: "#6B7660" }}>{fmt(time)}</span>
      <div className="flex flex-1 items-end justify-center gap-[2px] h-7">
        {Array.from({ length: bars }).map((_, i) => (
          <span key={i} className="w-[3px] rounded-full"
            style={{
              background: "#B7C4A3",
              height: `${20 + Math.random() * 60}%`,
              animation: `pulse 0.6s ease-in-out ${i * 0.04}s infinite alternate`,
            }} />
        ))}
      </div>
      <button onClick={() => onStop(time)}
        className="ml-2 text-xs font-medium transition-colors"
        style={{ color: "#B5432F" }}>
        Stop
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MODE TOGGLE BUTTON (Search / Think / Canvas)
───────────────────────────────────────────────────────────── */
function ModeBtn({ active, onClick, icon: IconEl, label }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-mono font-medium transition-all duration-200"
      style={active
        ? { borderColor: "#B5432F", color: "#B5432F", background: "rgba(181,67,47,0.08)" }
        : { borderColor: "transparent", color: "#8A9478" }
      }>
      <span className={`transition-transform duration-200 ${active ? "scale-110" : ""}`}><IconEl /></span>
      {active && <span className="overflow-hidden whitespace-nowrap">{label}</span>}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   PROMPT INPUT BOX  (ledger style)
───────────────────────────────────────────────────────────── */
export const PromptInputBox = forwardRef(({ onSend, isLoading = false, placeholder = "Ask about fees, exceptions, a payment id…", className = "" }, ref) => {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState({});
  const [isRecording, setIsRecording] = useState(false);
  const [mode, setMode] = useState(null); // "search" | "think" | "canvas" | null
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const boxRef = ref || useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [input]);

  const processFile = useCallback(file => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) return;
    setFiles([file]);
    const reader = new FileReader();
    reader.onload = e => setPreviews({ [file.name]: e.target.result });
    reader.readAsDataURL(file);
  }, []);

  useEffect(() => {
    const handler = e => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) { const f = item.getAsFile(); if (f) { e.preventDefault(); processFile(f); break; } }
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [processFile]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text && files.length === 0) return;
    const prefix = mode === "search" ? "[Search] " : mode === "think" ? "[Think] " : mode === "canvas" ? "[Canvas] " : "";
    onSend?.(prefix + text, files);
    setInput(""); setFiles([]); setPreviews({});
  };

  const handleRecordingStop = duration => {
    setIsRecording(false);
    onSend?.(`[Voice – ${duration}s]`, []);
  };

  const hasContent = input.trim() !== "" || files.length > 0;
  const toggleMode = m => setMode(prev => prev === m ? null : m);

  return (
    <div ref={boxRef}
      className="rounded-md border transition-all duration-300"
      style={{
        background: "#FBFBF3",
        borderColor: focused ? "#1F2A1A" : "#D9E3C8",
        borderWidth: focused ? "1.5px" : "1px",
      }}
      onDragOver={e => { e.preventDefault(); }}
      onDrop={e => {
        e.preventDefault();
        const f = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"));
        if (f) processFile(f);
      }}
    >
      {files.length > 0 && !isRecording && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {files.map((file, i) => (
            <div key={i} className="relative group h-16 w-16 rounded-md overflow-hidden border" style={{ borderColor: "#D9E3C8" }}>
              {previews[file.name] && <img src={previews[file.name]} alt={file.name} className="h-full w-full object-cover" />}
              <button onClick={() => { setFiles([]); setPreviews({}); }}
                className="absolute top-1 right-1 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(31,42,26,0.7)", color: "#FBFBF3" }}>
                <Icon.X />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 pt-3">
        {isRecording
          ? <VoiceRecorder isRecording={isRecording} onStop={handleRecordingStop} />
          : (
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              rows={1}
              placeholder={
                mode === "search" ? "Search the web…"
                  : mode === "think" ? "Think deeply…"
                  : mode === "canvas" ? "Describe for canvas…"
                  : placeholder
              }
              disabled={isLoading}
              className="w-full resize-none bg-transparent text-sm font-mono focus:outline-none leading-relaxed disabled:opacity-50"
              style={{ minHeight: 40, maxHeight: 180, color: "#1F2A1A" }}
            />
          )}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-1 border-t" style={{ borderColor: "#EEF2E4" }}>
        <div className="flex items-center gap-0.5 flex-wrap">
          <Tip label="Attach image">
            <button onClick={() => fileInputRef.current?.click()} disabled={isRecording}
              className="flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:opacity-40"
              style={{ color: "#8A9478" }}>
              <Icon.Paperclip />
            </button>
          </Tip>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }} />

          <span className="mx-1 h-4 w-px" style={{ background: "#D9E3C8" }} />

          <ModeBtn active={mode === "search"} onClick={() => toggleMode("search")} icon={Icon.Globe} label="Search" />
          <ModeBtn active={mode === "think"} onClick={() => toggleMode("think")} icon={Icon.Brain} label="Think" />
          <ModeBtn active={mode === "canvas"} onClick={() => toggleMode("canvas")} icon={Icon.Code} label="Canvas" />
        </div>

        <Tip label={isLoading ? "Stop" : isRecording ? "Stop recording" : hasContent ? "Send" : "Voice message"}>
          <button
            onClick={() => {
              if (isLoading) return;
              if (isRecording) { setIsRecording(false); }
              else if (hasContent) { handleSubmit(); }
              else { setIsRecording(true); }
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 font-medium"
            style={
              isRecording ? { background: "rgba(181,67,47,0.12)", color: "#B5432F" }
              : hasContent ? { background: "#1F2A1A", color: "#FBFBF3" }
              : { background: "#EEF2E4", color: "#6B7660" }
            }
          >
            {isLoading ? <Icon.Stop /> : isRecording ? <Icon.MicOff /> : hasContent ? <Icon.ArrowUp /> : <Icon.Mic />}
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
  return (
    <div className="h-full flex flex-col items-center justify-center text-center font-mono" style={{ color: "#8A9478" }}>
      <svg className="w-10 h-10 mb-4" style={{ color: "#C3CFAE" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3c4.97 0 9 3.582 9 8s-4.03 8-9 8a9.9 9.9 0 0 1-4.01-.833L3 20l1.338-3.124C3.493 15.67 3 13.885 3 12c0-4.418 4.03-8 9-8Z"/></svg>
      <p className="text-base font-semibold mb-1" style={{ color: "#1F2A1A" }}>No run loaded</p>
      <p className="text-sm mb-6">Reconcile a batch first, then ask the agent about it.</p>
      <button onClick={onGoUpload}
        className="text-sm font-medium px-5 py-2.5 rounded-md transition-colors"
        style={{ background: "#1F2A1A", color: "#FBFBF3" }}>
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
    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0L3.3 9.5a1 1 0 1 1 1.4-1.4l3.6 3.6 6.7-6.7a1 1 0 0 1 1.4 0Z" clipRule="evenodd"/>
    </svg>
  ),
  caught: (
    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.72-1.36 3.486 0l6.28 11.18c.75 1.334-.213 2.987-1.744 2.987H3.72c-1.53 0-2.492-1.653-1.743-2.987l6.28-11.18ZM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-.25-6.5a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5Z" clipRule="evenodd"/>
    </svg>
  ),
  running: (
    <svg className="w-3 h-3 animate-spin" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="10" cy="10" r="7" strokeOpacity="0.25" />
      <path d="M17 10a7 7 0 0 0-7-7" strokeLinecap="round" />
    </svg>
  ),
  refused: (
    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM6.28 6.28a.75.75 0 0 1 1.06 0L10 8.94l2.66-2.66a.75.75 0 1 1 1.06 1.06L11.06 10l2.66 2.66a.75.75 0 1 1-1.06 1.06L10 11.06l-2.66 2.66a.75.75 0 0 1-1.06-1.06L8.94 10 6.28 7.34a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
    </svg>
  ),
};

function AgentTrace({ trace }) {
  return (
    <div className="mb-6 font-mono">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] flex items-center gap-1.5" style={{ color: "#8A9478" }}>
          <span className="w-1 h-1 rounded-full" style={{ background: "#B5432F" }} />
          Reasoning trace
        </p>
        <span className="text-[10px]" style={{ color: "#C3CFAE" }}>
          {trace.reduce((sum, s) => sum + (s.ms || 0), 0)}ms total
        </span>
      </div>

      <div className="relative">
        {trace.map((s, i) => {
          const style = STEP_STYLES[s.status] || STEP_STYLES.done;
          const isLast = i === trace.length - 1;
          return (
            <div key={i} className="flex items-start gap-3.5 relative">
              {!isLast && (
                <div className="absolute left-[11px] top-6 bottom-[-2px] w-px" style={{ background: style.line }} />
              )}
              <div className="relative z-10 mt-0.5 w-[22px] h-[22px] rounded-full border flex items-center justify-center flex-shrink-0"
                style={{ borderColor: style.ring, background: style.ringBg, color: style.ring }}>
                {STEP_ICON[s.status] || STEP_ICON.done}
              </div>
              <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-4"}`}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[13px] font-medium" style={{ color: "#1F2A1A" }}>{s.title}</span>
                  {s.via && (
                    <span className="text-[9px] uppercase tracking-wide rounded px-1.5 py-0.5 border"
                      style={{ color: "#8A9478", background: "#F3F6ED", borderColor: "#E7EEDD" }}>
                      {s.via}
                    </span>
                  )}
                  <span className="text-[10px] ml-auto tabular-nums" style={{ color: "#C3CFAE" }}>
                    {s.ms}ms
                  </span>
                </div>
                {s.detail && (
                  <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "#8A9478" }}>{s.detail}</p>
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
   ANSWER CARD  (ledger sheet with red verification stamp)
───────────────────────────────────────────────────────────── */
function AnswerCard({ turn }) {
  const { answer, figures = [], rows = [], verified, trace } = turn.result;

  return (
    <div className="rounded-md border overflow-hidden mb-6 relative"
      style={{ background: "#FBFBF3", borderColor: "#D9E3C8", boxShadow: "0 1px 2px rgba(31,42,26,0.06)" }}>

      {/* corner stamp */}
      <div
        className="absolute top-4 right-4 flex items-center justify-center rounded-full border-2 select-none pointer-events-none"
        style={{
          width: 54, height: 54,
          borderColor: verified ? "#B5432F" : "#8A9478",
          color: verified ? "#B5432F" : "#8A9478",
          transform: "rotate(-8deg)",
          opacity: 0.85,
        }}
      >
        <span className="text-[9px] font-mono font-bold uppercase leading-tight text-center tracking-wide">
          {verified ? "Verified" : "Unproven"}
        </span>
      </div>

      <div className="p-6 pb-5 pr-20">
        <AgentTrace trace={trace} />

        <div className="border-t pt-5" style={{ borderColor: "#E7EEDD" }}>
          <p className="text-[14.5px] leading-[1.7] tracking-[-0.005em] font-mono" style={{ color: "#1F2A1A" }}>
            {answer}
          </p>
        </div>
      </div>

      {figures.length > 0 && (
        <div className="px-6 pb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-2.5 font-mono" style={{ color: "#8A9478" }}>
            Key figures
          </p>
          <div className="flex flex-wrap gap-2">
            {figures.map((f, i) => (
              <div key={i}
                className="group flex items-center gap-2.5 rounded-md px-3.5 py-2 border transition-colors"
                style={{ background: "#F3F6ED", borderColor: "#E7EEDD" }}>
                <span className="text-[11px] font-medium font-mono" style={{ color: "#6B7660" }}>{f.label}</span>
                <span className="text-[13px] font-semibold font-mono tabular-nums" style={{ color: "#1F2A1A" }}>
                  {typeof f.value === "number" && !Number.isInteger(f.value)
                    ? api.formatINR?.(f.value) ?? f.value
                    : f.value}
                </span>
                <svg className="w-3 h-3 flex-shrink-0" style={{ color: "#B5432F" }} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0L3.3 9.5a1 1 0 1 1 1.4-1.4l3.6 3.6 6.7-6.7a1 1 0 0 1 1.4 0Z" clipRule="evenodd"/>
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="px-6 pb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-2.5 font-mono" style={{ color: "#8A9478" }}>
            Supporting rows
          </p>
          <div className="border rounded-md overflow-hidden" style={{ borderColor: "#E7EEDD" }}>
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider" style={{ color: "#8A9478", background: "#F3F6ED" }}>
                  <th className="text-left py-2.5 px-3.5 font-semibold">Payment</th>
                  <th className="text-right py-2.5 px-3.5 font-semibold">Amount</th>
                  <th className="text-left py-2.5 px-3.5 font-semibold">Severity</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((r, i) => (
                  <tr key={i} className="transition-colors border-t" style={{ borderColor: "#F3F6ED" }}>
                    <td className="py-2.5 px-3.5 font-medium text-[12.5px]" style={{ color: "#1F2A1A" }}>{r.id}</td>
                    <td className="py-2.5 px-3.5 text-right text-[12.5px] tabular-nums" style={{ color: "#1F2A1A" }}>
                      {api.formatINR?.(r.amount) ?? r.amount}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded"
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

      <div className="flex items-center gap-2 px-6 py-3.5 border-t font-mono"
        style={verified
          ? { background: "rgba(31,42,26,0.03)", borderColor: "#E7EEDD" }
          : { background: "rgba(181,67,47,0.06)", borderColor: "#E7C7BE" }}>
        <span className="flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0"
          style={verified ? { background: "#E7EEDD", color: "#1F2A1A" } : { background: "rgba(181,67,47,0.15)", color: "#B5432F" }}>
          {verified ? (
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0L3.3 9.5a1 1 0 1 1 1.4-1.4l3.6 3.6 6.7-6.7a1 1 0 0 1 1.4 0Z" clipRule="evenodd"/>
            </svg>
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.72-1.36 3.486 0l6.28 11.18c.75 1.334-.213 2.987-1.744 2.987H3.72c-1.53 0-2.492-1.653-1.743-2.987l6.28-11.18ZM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-.25-6.5a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5Z" clipRule="evenodd"/>
            </svg>
          )}
        </span>
        <span className="text-[12px] font-medium" style={{ color: verified ? "#1F2A1A" : "#B5432F" }}>
          {verified ? "Every figure independently verified" : "Could not verify one or more figures — answer withheld"}
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
    <div className="mb-3 font-mono">
      <div className="flex items-center gap-1.5 mb-2">
        <svg className="w-3 h-3" style={{ color: "#C3CFAE" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.5-6.5-2.1 2.1M8.6 15.4l-2.1 2.1m0-11 2.1 2.1m8.8 8.8 2.1 2.1" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#8A9478" }}>Try asking</span>
      </div>
      <div className="flex flex-wrap gap-2">
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
            className="group relative text-xs rounded-full px-3.5 py-1.5 border
                       hover:shadow-sm hover:-translate-y-px
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
export default function AskPage({ run, showToast, onGoUpload }) {
  const [examples, setExamples] = useState([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    api.getAskExamples?.().then(d => setExamples(d.examples || [])).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, busy]);

  if (!run) return <EmptyState onGoUpload={onGoUpload} />;

  const ask = async (question) => {
    const q = (question ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    try {
      const result = await api.askAgent(run.runId, q);
      setHistory(h => [...h, { question: q, result }]);
    } catch (e) {
      showToast?.(e.message ?? "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleSend = (message) => {
    const q = message.trim();
    if (q) ask(q);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden font-mono" style={{ background: "#FBFBF3" }}>
      {/* decorative binder holes */}
      <div className="pointer-events-none fixed left-2 top-0 bottom-0 flex flex-col items-center gap-6 py-8 opacity-40 z-0">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: "#B7C4A3" }} />
        ))}
      </div>

      {/* header */}
      <header className="px-8 py-5 border-b relative z-10" style={{ borderColor: "#E7EEDD", background: "#FBFBF3" }}>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "#1F2A1A" }}>Ask the Agent</h1>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded"
            style={{ background: "#1F2A1A", color: "#FBFBF3" }}>Autonomous</span>
        </div>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: "#8A9478" }}>
          Plans, computes deterministically, verifies every figure, and refuses to state a number it can't prove.
        </p>
      </header>

      {/* chat scroll area — faint ledger stripes */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-6 relative z-10"
        style={{
          backgroundImage: "repeating-linear-gradient(180deg, #F3F6ED 0px, #F3F6ED 28px, #E9F0DC 28px, #E9F0DC 56px)",
        }}
      >
        <div className="max-w-2xl mx-auto">
          {history.length === 0 && (
            <div className="text-center py-16" style={{ color: "#8A9478" }}>
              <svg className="w-8 h-8 mx-auto mb-3" style={{ color: "#C3CFAE" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3c4.97 0 9 3.582 9 8s-4.03 8-9 8a9.9 9.9 0 0 1-4.01-.833L3 20l1.338-3.124C3.493 15.67 3 13.885 3 12c0-4.418 4.03-8 9-8Z"/></svg>
              <p className="text-sm">Ask a question about this reconciliation run.</p>
            </div>
          )}

          {history.map((turn, i) => (
            <div key={i}>
              {/* user bubble */}
              <div className="flex justify-end mb-3">
                <div className="text-sm px-4 py-2.5 rounded-md rounded-tr-sm max-w-[80%] leading-relaxed"
                  style={{ background: "#1F2A1A", color: "#FBFBF3" }}>
                  {turn.question}
                </div>
              </div>
              {/* agent answer */}
              <AnswerCard turn={turn} />
            </div>
          ))}

          {/* loading state */}
          {busy && (
            <div className="rounded-md border p-5 flex items-center gap-3 text-sm mb-5"
              style={{ background: "#FBFBF3", borderColor: "#D9E3C8", color: "#6B7660" }}>
              <div className="w-4 h-4 rounded-full border-2 animate-spin flex-shrink-0"
                style={{ borderColor: "#1F2A1A", borderTopColor: "transparent" }} />
              Agent is reasoning…
            </div>
          )}
        </div>
      </div>

      {/* input area */}
      <div className="border-t px-6 py-4 relative z-10" style={{ borderColor: "#E7EEDD", background: "#FBFBF3" }}>
        <div className="max-w-2xl mx-auto">
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

          <p className="text-[10px] text-center mt-2" style={{ color: "#B7C4A3" }}>
            Press <kbd className="border rounded px-1 py-0.5 text-[10px]" style={{ background: "#F3F6ED", borderColor: "#D9E3C8" }}>Enter</kbd> to send &nbsp;·&nbsp; <kbd className="border rounded px-1 py-0.5 text-[10px]" style={{ background: "#F3F6ED", borderColor: "#D9E3C8" }}>Shift+Enter</kbd> for new line
          </p>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          from { opacity: 0.5; transform: scaleY(0.7); }
          to   { opacity: 1;   transform: scaleY(1.2); }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}