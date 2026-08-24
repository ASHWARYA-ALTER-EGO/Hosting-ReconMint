import React, { useState, useEffect, useRef, useCallback, createContext, useContext, forwardRef } from "react";
import * as api from "../api.js";

/* ─────────────────────────────────────────────────────────────
   BORDER BEAM  (self-contained, light-mode, premium/smooth)
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
      <div className="relative rounded-2xl bg-white">{children}</div>

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
   TOOLTIP (tiny, inline, light)
───────────────────────────────────────────────────────────── */
function Tip({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && (
        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-800 text-white text-[11px] px-2 py-1 shadow-lg z-50">
          {label}
        </span>
      )}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   ICONS (inline SVG, no external icon lib needed)
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
    <div className="flex items-center gap-3 px-1 py-2">
      <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
      <span className="font-mono text-xs text-slate-500 tabular-nums">{fmt(time)}</span>
      <div className="flex flex-1 items-end justify-center gap-[2px] h-7">
        {Array.from({ length: bars }).map((_, i) => (
          <span key={i} className="w-[3px] rounded-full bg-slate-300"
            style={{
              height: `${20 + Math.random() * 60}%`,
              animation: `pulse 0.6s ease-in-out ${i * 0.04}s infinite alternate`,
            }} />
        ))}
      </div>
      <button onClick={() => onStop(time)}
        className="ml-2 text-xs font-medium text-red-500 hover:text-red-600 transition-colors">
        Stop
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   MODE TOGGLE BUTTON (Search / Think / Canvas)
───────────────────────────────────────────────────────────── */
function ModeBtn({ active, onClick, icon: IconEl, label, activeColor }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200 ${active
        ? `border-current ${activeColor}`
        : "border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100"}`}>
      <span className={`transition-transform duration-200 ${active ? "scale-110" : ""}`}><IconEl /></span>
      {active && <span className="overflow-hidden whitespace-nowrap">{label}</span>}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   PROMPT INPUT BOX  (light mode)
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

  /* auto-resize textarea */
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

  /* paste to upload */
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
      className={`rounded-2xl border transition-all duration-300 bg-white shadow-sm ${focused ? "border-slate-400 shadow-md ring-2 ring-slate-900/5" : "border-slate-200"} ${isLoading && "border-violet-300"} ${className}`}
      onDragOver={e => { e.preventDefault(); }}
      onDrop={e => {
        e.preventDefault();
        const f = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"));
        if (f) processFile(f);
      }}
    >
      {/* file previews */}
      {files.length > 0 && !isRecording && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {files.map((file, i) => (
            <div key={i} className="relative group h-16 w-16 rounded-xl overflow-hidden border border-slate-200">
              {previews[file.name] && <img src={previews[file.name]} alt={file.name} className="h-full w-full object-cover" />}
              <button onClick={() => { setFiles([]); setPreviews({}); }}
                className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Icon.X />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* textarea or recorder */}
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
              className="w-full resize-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none leading-relaxed disabled:opacity-50"
              style={{ minHeight: 40, maxHeight: 180 }}
            />
          )}
      </div>

      {/* action bar */}
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-1">
        <div className="flex items-center gap-0.5 flex-wrap">
          {/* attach */}
          <Tip label="Attach image">
            <button onClick={() => fileInputRef.current?.click()} disabled={isRecording}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-40">
              <Icon.Paperclip />
            </button>
          </Tip>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }} />

          <span className="mx-1 h-4 w-px bg-slate-200" />

          <ModeBtn active={mode === "search"} onClick={() => toggleMode("search")}
            icon={Icon.Globe} label="Search" activeColor="text-sky-600 bg-sky-50" />
          <ModeBtn active={mode === "think"} onClick={() => toggleMode("think")}
            icon={Icon.Brain} label="Think" activeColor="text-violet-600 bg-violet-50" />
          <ModeBtn active={mode === "canvas"} onClick={() => toggleMode("canvas")}
            icon={Icon.Code} label="Canvas" activeColor="text-orange-500 bg-orange-50" />
        </div>

        {/* send / mic / stop */}
        <Tip label={isLoading ? "Stop" : isRecording ? "Stop recording" : hasContent ? "Send" : "Voice message"}>
          <button
            onClick={() => {
              if (isLoading) return; // parent handles stop
              if (isRecording) { setIsRecording(false); }
              else if (hasContent) { handleSubmit(); }
              else { setIsRecording(true); }
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 font-medium
              ${isRecording ? "bg-red-100 text-red-500 hover:bg-red-200"
                : hasContent ? "bg-slate-900 text-white hover:bg-slate-700 shadow-sm"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
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
    <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
      <svg className="w-10 h-10 mb-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3c4.97 0 9 3.582 9 8s-4.03 8-9 8a9.9 9.9 0 0 1-4.01-.833L3 20l1.338-3.124C3.493 15.67 3 13.885 3 12c0-4.418 4.03-8 9-8Z"/></svg>
      <p className="text-base font-semibold text-slate-600 mb-1">No run loaded</p>
      <p className="text-sm text-slate-400 mb-6">Reconcile a batch first, then ask the agent about it.</p>
      <button onClick={onGoUpload}
        className="bg-slate-900 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-slate-700 transition-colors shadow-sm">
        Go to Upload
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   AGENT TRACE  (premium)
───────────────────────────────────────────────────────────── */
const STEP_STYLES = {
  done:    { ring: "border-emerald-200 bg-emerald-50 text-emerald-600", line: "bg-emerald-200" },
  caught:  { ring: "border-amber-200 bg-amber-50 text-amber-600",   line: "bg-amber-200" },
  running: { ring: "border-slate-200 bg-white text-slate-400",      line: "bg-slate-150" },
  refused: { ring: "border-red-200 bg-red-50 text-red-500",         line: "bg-red-200" },
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
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.12em] flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          Reasoning trace
        </p>
        <span className="text-[10px] font-mono text-slate-300">
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
                <div className={`absolute left-[11px] top-6 bottom-[-2px] w-px ${style.line}`} />
              )}
              <div className={`relative z-10 mt-0.5 w-[22px] h-[22px] rounded-full border flex items-center justify-center flex-shrink-0 ${style.ring}`}>
                {STEP_ICON[s.status] || STEP_ICON.done}
              </div>
              <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-4"}`}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[13px] font-medium text-slate-700">{s.title}</span>
                  {s.via && (
                    <span className="text-[9px] font-mono uppercase tracking-wide text-slate-400 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">
                      {s.via}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-slate-300 ml-auto tabular-nums">
                    {s.ms}ms
                  </span>
                </div>
                {s.detail && (
                  <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">{s.detail}</p>
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
   ANSWER CARD
───────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────
   ANSWER CARD  (premium)
───────────────────────────────────────────────────────────── */
function AnswerCard({ turn }) {
  const { answer, figures = [], rows = [], verified, trace } = turn.result;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden mb-6">
      <div className="p-6 pb-5">
        <AgentTrace trace={trace} />

        <div className="border-t border-slate-100 pt-5">
          <p className="text-[14.5px] text-slate-800 leading-[1.7] tracking-[-0.005em]">
            {answer}
          </p>
        </div>
      </div>

      {figures.length > 0 && (
        <div className="px-6 pb-5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.12em] mb-2.5">
            Key figures
          </p>
          <div className="flex flex-wrap gap-2">
            {figures.map((f, i) => (
              <div
                key={i}
                className="group flex items-center gap-2.5 bg-slate-50/70 border border-slate-100 rounded-xl px-3.5 py-2 hover:border-slate-200 transition-colors"
              >
                <span className="text-[11px] text-slate-500 font-medium">{f.label}</span>
                <span className="text-[13px] font-semibold text-slate-900 font-mono tabular-nums">
                  {typeof f.value === "number" && !Number.isInteger(f.value)
                    ? api.formatINR?.(f.value) ?? f.value
                    : f.value}
                </span>
                <svg className="w-3 h-3 text-emerald-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0L3.3 9.5a1 1 0 1 1 1.4-1.4l3.6 3.6 6.7-6.7a1 1 0 0 1 1.4 0Z" clipRule="evenodd"/>
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="px-6 pb-5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.12em] mb-2.5">
            Supporting rows
          </p>
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-slate-400 uppercase tracking-wider bg-slate-50/70">
                  <th className="text-left py-2.5 px-3.5 font-semibold">Payment</th>
                  <th className="text-right py-2.5 px-3.5 font-semibold">Amount</th>
                  <th className="text-left py-2.5 px-3.5 font-semibold">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.slice(0, 8).map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 px-3.5 font-medium text-slate-700 font-mono text-[12.5px]">{r.id}</td>
                    <td className="py-2.5 px-3.5 text-right font-mono text-slate-800 text-[12.5px] tabular-nums">
                      {api.formatINR?.(r.amount) ?? r.amount}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                        r.severity === "high" ? "bg-red-50 text-red-600"
                        : r.severity === "medium" ? "bg-amber-50 text-amber-600"
                        : "bg-slate-100 text-slate-500"
                      }`}>
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

      <div className={`flex items-center gap-2 px-6 py-3.5 border-t ${
        verified ? "bg-emerald-50/40 border-emerald-100/70" : "bg-red-50/40 border-red-100/70"
      }`}>
        <span className={`flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 ${
          verified ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-500"
        }`}>
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
        <span className={`text-[12px] font-medium ${verified ? "text-emerald-700" : "text-red-700"}`}>
          {verified ? "Every figure independently verified" : "Could not verify one or more figures — answer withheld"}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   EXAMPLE CHIPS
───────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────
   EXAMPLE CHIPS  (rotating, premium)
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
    <div className="mb-3">
      <div className="flex items-center gap-1.5 mb-2">
        <svg className="w-3 h-3 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.5-6.5-2.1 2.1M8.6 15.4l-2.1 2.1m0-11 2.1 2.1m8.8 8.8 2.1 2.1" />
        </svg>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Try asking</span>
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
            }}
            className="group relative text-xs text-slate-600 bg-white border border-slate-200 rounded-full px-3.5 py-1.5
                       hover:border-slate-300 hover:shadow-[0_1px_6px_rgba(15,23,42,0.06)] hover:-translate-y-px
                       active:translate-y-0 transition-all duration-200 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            <span className="relative z-10">{ex}</span>
            <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-r from-slate-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
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
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* header */}
      <header className="px-8 py-5 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Ask the Agent</h1>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-white px-2 py-1 rounded-md">Autonomous</span>
        </div>
        <p className="text-slate-500 text-xs mt-1 leading-relaxed">
          Plans, computes deterministically, verifies every figure, and refuses to state a number it can't prove.
        </p>
      </header>

      {/* chat scroll area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 bg-slate-50/40">
        <div className="max-w-2xl mx-auto">
          {history.length === 0 && (
            <div className="text-center text-slate-400 py-16">
              <svg className="w-8 h-8 mx-auto mb-3 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3c4.97 0 9 3.582 9 8s-4.03 8-9 8a9.9 9.9 0 0 1-4.01-.833L3 20l1.338-3.124C3.493 15.67 3 13.885 3 12c0-4.418 4.03-8 9-8Z"/></svg>
              <p className="text-sm text-slate-400">Ask a question about this reconciliation run.</p>
            </div>
          )}

          {history.map((turn, i) => (
            <div key={i}>
              {/* user bubble */}
              <div className="flex justify-end mb-3">
                <div className="bg-slate-900 text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-md max-w-[80%] leading-relaxed shadow-sm">
                  {turn.question}
                </div>
              </div>
              {/* agent answer */}
              <AnswerCard turn={turn} />
            </div>
          ))}

          {/* loading state */}
          {busy && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-3 text-slate-500 text-sm mb-5">
              <div className="w-4 h-4 rounded-full border-2 border-slate-900 border-t-transparent animate-spin flex-shrink-0" />
              Agent is reasoning…
            </div>
          )}
        </div>
      </div>

      {/* input area */}
      <div className="border-t border-slate-100 bg-white px-6 py-4">
        <div className="max-w-2xl mx-auto">
          {/* example chips — shown only before first message */}
          {examples.length > 0 && history.length === 0 && (
            <ExampleChips examples={examples} onAsk={ask} disabled={busy} />
          )}

          {/* prompt box with border beam glow when active */}
          <BorderBeam active={busy} duration={2}>
            <PromptInputBox
              isLoading={busy}
              placeholder="Ask about fees, exceptions, a payment id…"
              onSend={handleSend}
            />
          </BorderBeam>

          <p className="text-[10px] text-slate-400 text-center mt-2">
            Press <kbd className="bg-slate-100 border border-slate-200 rounded px-1 py-0.5 font-mono text-[10px]">Enter</kbd> to send &nbsp;·&nbsp; <kbd className="bg-slate-100 border border-slate-200 rounded px-1 py-0.5 font-mono text-[10px]">Shift+Enter</kbd> for new line
          </p>
        </div>
      </div>

      {/* keyframe for voice bars */}
      <style>{`
        @keyframes pulse {
          from { opacity: 0.5; transform: scaleY(0.7); }
          to   { opacity: 1;   transform: scaleY(1.2); }
        }
      `}</style>
    </div>
  );
}