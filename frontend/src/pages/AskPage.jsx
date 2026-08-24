import React, { useState, useEffect, useRef } from "react";
import * as api from "../api.js";

function EmptyState({ onGoUpload }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
      <i className="fa-solid fa-wand-magic-sparkles text-4xl mb-4 opacity-40"></i>
      <p className="text-lg font-medium text-slate-500 mb-1">No run loaded</p>
      <p className="text-sm mb-6">Reconcile a batch first, then ask the agent about it.</p>
      <button onClick={onGoUpload} className="gradient-btn text-white px-6 py-2.5 rounded-xl text-sm font-medium">Go to Upload</button>
    </div>
  );
}

const STEP_ICON = { done: "fa-check", caught: "fa-shield-halved", running: "fa-spinner fa-spin", refused: "fa-ban" };
const STEP_COLOR = { done: "text-emerald-500 border-emerald-200 bg-emerald-50", caught: "text-amber-600 border-amber-200 bg-amber-50", running: "text-slate-500 border-slate-200 bg-white", refused: "text-red-500 border-red-200 bg-red-50" };

// The Agent Trace — proves it's an agent (plan -> compute -> verify -> answer), driven by real steps.
function AgentTrace({ trace }) {
  return (
    <div className="mb-5">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <i className="fa-solid fa-diagram-project"></i> Agent trace
      </div>
      <div className="relative">
        {trace.map((s, i) => (
          <div key={i} className="flex items-start gap-3 pb-4 last:pb-0 relative">
            {i < trace.length - 1 && <div className="absolute left-[13px] top-7 bottom-0 w-px bg-slate-200"></div>}
            <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-[11px] flex-shrink-0 z-10 ${STEP_COLOR[s.status] || STEP_COLOR.done}`}>
              <i className={`fa-solid ${STEP_ICON[s.status] || "fa-check"}`}></i>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">{s.title}</span>
                {s.via && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium uppercase tracking-wide">{s.via}</span>}
                <span className="text-[10px] text-slate-400 font-mono ml-auto">{s.ms}ms</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{s.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnswerCard({ turn }) {
  const { answer, figures, rows, verified, trace, source } = turn.result;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 premium-shadow p-6 mb-6">
      <AgentTrace trace={trace} />
      <div className="border-t border-slate-100 pt-5">
        <p className="text-base text-slate-800 font-medium leading-relaxed mb-4">{answer}</p>
        {figures.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {figures.map((f, i) => (
              <div key={i} className="inline-flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
                <span className="text-xs text-slate-500 font-medium">{f.label}</span>
                <span className="text-sm font-mono font-semibold text-slate-900">{typeof f.value === "number" && !Number.isInteger(f.value) ? api.formatINR(f.value) : f.value}</span>
                <i className="fa-solid fa-circle-check text-emerald-500 text-xs" title="verified against computed data"></i>
              </div>
            ))}
          </div>
        )}
        {rows && rows.length > 0 && (
          <div className="border border-slate-100 rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] text-slate-400 uppercase bg-slate-50/60"><th className="text-left py-2 px-3">Payment</th><th className="text-right py-2 px-3">Amount</th><th className="text-left py-2 px-3">Severity</th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {rows.slice(0, 8).map((r, i) => (
                  <tr key={i}><td className="py-2 px-3 font-medium text-slate-700">{r.id}</td><td className="py-2 px-3 text-right font-mono text-slate-800">{api.formatINR(r.amount)}</td><td className="py-2 px-3 text-slate-500">{r.severity}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={`inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full ${verified ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"}`}>
          <i className={`fa-solid ${verified ? "fa-shield-halved" : "fa-triangle-exclamation"}`}></i>
          {verified ? "Every figure verified against computed data" : "Could not verify — refused"}
        </div>
      </div>
    </div>
  );
}

export default function AskPage({ run, showToast, onGoUpload }) {
  const [examples, setExamples] = useState([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    api.getAskExamples().then((d) => setExamples(d.examples || [])).catch(() => {});
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [history, busy]);

  if (!run) return <EmptyState onGoUpload={onGoUpload} />;

  const ask = async (q) => {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    try {
      const result = await api.askAgent(run.runId, question);
      setHistory((h) => [...h, { question, result }]);
    } catch (e) {
      showToast(String(e.message), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="px-8 py-5 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Ask the agent</h1>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-white px-2 py-1 rounded">Autonomous</span>
        </div>
        <p className="text-slate-500 text-sm mt-1">It plans, computes deterministically, verifies every figure, and refuses to state a number it can't prove.</p>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-6 bg-[#fcfcfc]">
        <div className="max-w-3xl mx-auto">
          {history.length === 0 && (
            <div className="text-center text-slate-400 py-10">
              <i className="fa-solid fa-comments text-3xl mb-3 opacity-40"></i>
              <p className="text-sm">Ask a question about this reconciliation run.</p>
            </div>
          )}
          {history.map((turn, i) => (
            <div key={i}>
              <div className="flex justify-end mb-3">
                <div className="bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[80%]">{turn.question}</div>
              </div>
              <AnswerCard turn={turn} />
            </div>
          ))}
          {busy && (
            <div className="bg-white rounded-2xl border border-slate-100 p-6 flex items-center gap-3 text-slate-500 text-sm">
              <div className="w-5 h-5 rounded-full border-2 border-slate-900 border-t-transparent animate-spin"></div>
              Agent is reasoning…
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 bg-white px-8 py-4">
        <div className="max-w-3xl mx-auto">
          {examples.length > 0 && history.length === 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {examples.map((ex, i) => (
                <button key={i} onClick={() => ask(ex)} disabled={busy}
                  className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5 hover:bg-slate-100 disabled:opacity-60">{ex}</button>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="Ask about fees, exceptions, a payment id…"
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400" />
            <button onClick={() => ask()} disabled={busy || !input.trim()}
              className="gradient-btn text-white px-6 py-3 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-2">
              <i className="fa-solid fa-paper-plane"></i> Ask
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
