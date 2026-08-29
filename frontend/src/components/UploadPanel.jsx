import React, { useState, useRef, useEffect } from "react";
import Folder from "./Folder.jsx";
import AgentTrace from "./AgentTrace.jsx";

const SLOTS = [
  { id: "orders", name: "Orders", icon: "fa-solid fa-cart-shopping", color: "blue", key: "order" },
  { id: "settlement", name: "Settlement Report", icon: "fa-regular fa-file-lines", color: "green", key: "settle" },
  { id: "bank", name: "Bank Statement", icon: "fa-solid fa-building-columns", color: "purple", key: "bank" },
];

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function assignFiles(fileList) {
  const files = { orders: null, settlement: null, bank: null };
  const remaining = [];
  for (const f of Array.from(fileList)) {
    const lower = f.name.toLowerCase();
    const slot = SLOTS.find((s) => lower.includes(s.key) && !files[s.id]);
    if (slot) files[slot.id] = f;
    else remaining.push(f);
  }
  for (const f of remaining) {
    const empty = SLOTS.find((s) => !files[s.id]);
    if (empty) files[empty.id] = f;
  }
  return files;
}

/**
 * UploadPanel — the file intake + live agent trace, extracted so it can be
 * dropped into the Dashboard (empty state) or opened as a "New run" modal
 * once a dashboard already has data.
 *
 * Props:
 *  - onRunDemo(silent) -> Promise<result>
 *  - onRunUpload(files, silent) -> Promise<result>
 *  - showToast(msg, type)
 *  - onComplete(result)   called once the trace finishes rendering (Continue button)
 *  - onClose()            optional — renders a close (x) affordance, for modal usage
 *  - variant              "inline" (default, page/empty-state) | "modal" (compact chrome)
 */
export default function UploadPanel({
  onRunDemo,
  onRunUpload,
  showToast,
  onComplete,
  onClose,
  variant = "inline",
}) {
  const [files, setFiles] = useState({ orders: null, settlement: null, bank: null });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false); // false | "demo" | "upload"
  const [runResult, setRunResult] = useState(null);
  const [revealed, setRevealed] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!runResult) return;
    const n = (runResult.trace || []).length;
    setRevealed(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setRevealed(i);
      if (i >= n) clearInterval(id);
    }, 380);
    return () => clearInterval(id);
  }, [runResult]);

  const chosen = SLOTS.map((s) => ({ ...s, file: files[s.id] })).filter((s) => s.file);
  const allThree = chosen.length === 3;

  const onPick = (e) => {
    setError(null);
    setFiles((prev) => ({ ...prev, ...assignFiles(e.target.files) }));
  };
  const removeFile = (id) => setFiles((prev) => ({ ...prev, [id]: null }));
  const validClient = (f) => f && /\.(csv|xlsx|xlsm|xls|xlsb)$/i.test(f.name) && f.size > 0;

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    setError(null);
    if (e.dataTransfer?.files?.length) {
      setFiles((prev) => ({ ...prev, ...assignFiles(e.dataTransfer.files) }));
    }
  };

  const runUpload = async () => {
    setError(null);
    if (!allThree) {
      setError({ title: "Missing files", items: ["Please add all 3 files (orders, settlement, bank) as CSV or Excel."] });
      return;
    }
    setBusy("upload");
    try {
      const resp = await onRunUpload({ orders: files.orders, settlement: files.settlement, bank: files.bank }, true);
      setRunResult(resp);
    } catch (err) {
      setError({ title: "Validation Errors", items: [String(err.message)] });
      showToast?.(String(err.message), "error");
    } finally {
      setBusy(false);
    }
  };

  const runDemo = async () => {
    setError(null);
    setBusy("demo");
    try {
      const resp = await onRunDemo(false);
      setRunResult(resp);
    } catch (err) {
      showToast?.(String(err.message), "error");
    } finally {
      setBusy(false);
    }
  };

  const folderItems = SLOTS.map((s) => (files[s.id] ? files[s.id].name : s.name));
  const isModal = variant === "modal";

  return (
    <div className={isModal ? "upnl-modal-shell" : "upnl-inline-shell"}>
      <div className={isModal ? "flex items-center justify-between mb-6" : "hidden"}>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">New reconciliation run</h2>
          <p className="text-sm text-slate-500 mt-0.5">Upload orders, settlement report and bank statement.</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors duration-150"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>

      <div className={`grid ${isModal ? "grid-cols-1 lg:grid-cols-2 gap-6" : "grid-cols-2 gap-8"}`}>
        {/* intake */}
        <section className="group/card bg-white p-7 rounded-2xl border border-slate-100 flex flex-col upnl-shadow hover:border-teal-100 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_32px_-16px_rgba(15,118,110,0.18)] transition-all duration-300">
          <h3 className="text-xs font-semibold text-slate-400 tracking-wider mb-2 uppercase">File Intake</h3>
          <p className="text-sm text-slate-500 mb-5">Upload any 3 CSV or Excel files to start.</p>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`flex-1 rounded-2xl flex flex-col items-center justify-center p-7 upnl-inset-shadow border cursor-pointer transition-all duration-200 ${
              dragActive
                ? "bg-teal-50/60 border-teal-300 shadow-[inset_0_0_0_1px_rgba(15,118,110,0.15)]"
                : "bg-slate-50 border-slate-100 hover:bg-teal-50/30 hover:border-teal-200"
            }`}
          >
            <div
              className="mb-4 flex items-center justify-center transition-transform duration-300"
              style={{ height: 78, transform: dragActive ? "scale(1.06)" : "scale(1)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <Folder color={dragActive ? "#0F766E" : "#0f172a"} size={0.78} items={folderItems} />
            </div>
            <div className="text-sm font-semibold text-slate-800 mb-1">Drop files here</div>
            <div className="text-xs text-slate-500 mb-4">
              or <span className="text-teal-700 font-medium underline underline-offset-2 decoration-teal-300">browse</span> from your device
            </div>
            <div className="text-[11px] text-slate-400 font-medium">CSV or Excel (.xlsx, .xls, .xlsm, .xlsb) · max 50MB each</div>
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xlsm,.xls,.xlsb,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" multiple className="hidden" onChange={onPick} />
          </div>
        </section>

        {/* detected */}
        <section className="flex flex-col">
          <div className="flex justify-between items-center mb-4 px-1">
            <h3 className="text-xs font-semibold text-slate-400 tracking-wider uppercase">
              Detected <span className="normal-case font-medium text-slate-400 ml-1">({chosen.length} of 3)</span>
            </h3>
            {chosen.length > 0 && (
              <button
                onClick={() => setFiles({ orders: null, settlement: null, bank: null })}
                className="text-xs text-slate-500 font-medium hover:text-teal-700 transition-colors duration-200"
              >
                <i className="fa-solid fa-rotate-right mr-1.5"></i> Clear
              </button>
            )}
          </div>
          {chosen.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-2xl p-8 text-slate-400 hover:border-teal-200 hover:bg-teal-50/20 transition-colors duration-300">
              <i className="fa-regular fa-file-lines text-2xl mb-3 opacity-50"></i>
              <p className="text-sm font-medium">No files yet. Choose 3 CSV or Excel files, or use sample data.</p>
            </div>
          ) : (
            <div className="flex-1 space-y-3">
              {chosen.map((s) => (
                <div
                  key={s.id}
                  className="upnl-file-card group hover:border-teal-200 hover:shadow-[0_4px_16px_-8px_rgba(15,118,110,0.22)] hover:-translate-y-0.5 transition-all duration-200 animate-[upnlFade_0.35s_ease-out]"
                >
                  <div className={`upnl-file-icon ${s.color} transition-transform duration-200 group-hover:scale-105`}>
                    <i className={`${s.icon} opacity-80`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 text-sm">{s.name}</div>
                    <div className="text-xs text-slate-500 mt-1 font-medium truncate">
                      {s.file.name} &nbsp;•&nbsp; {humanSize(s.file.size)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className={`upnl-status-badge ${validClient(s.file) ? "!bg-teal-50 !text-teal-700" : "invalid"}`}>
                      {validClient(s.file) ? "Valid" : "Not a table"}
                    </div>
                    <button
                      onClick={() => removeFile(s.id)}
                      className="text-slate-300 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 transition-colors duration-200"
                    >
                      <i className="fa-regular fa-trash-can"></i>
                    </button>
                  </div>
                </div>
              ))}
              {allThree && (
                <div className="bg-teal-50/60 border border-teal-100 rounded-xl p-3.5 flex items-center text-sm text-teal-900 animate-[upnlFade_0.4s_ease-out]">
                  <i className="fa-regular fa-circle-check text-teal-600 mr-3 text-lg"></i>
                  <span className="font-medium mr-1 text-teal-700">All files look good.</span> Ready to reconcile.
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* actions */}
      <div className="flex justify-center items-center gap-5 mt-8 mb-2">
        <button
          onClick={runUpload}
          disabled={busy}
          className="upnl-gradient-btn text-white px-8 py-3 rounded-xl font-medium shadow-lg shadow-teal-900/20 flex items-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-teal-900/25 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {busy === "upload" ? (
            <>
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin mr-2.5" />
              Reconciling…
            </>
          ) : (
            <>
              Reconcile now <i className="fa-solid fa-arrow-right ml-2.5 opacity-80"></i>
            </>
          )}
        </button>
        <span className="text-slate-400 text-sm font-medium">or</span>
        <button
          onClick={runDemo}
          disabled={busy}
          className="bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl font-medium shadow-sm hover:border-teal-200 hover:text-teal-700 hover:bg-teal-50/30 hover:-translate-y-0.5 active:translate-y-0 flex items-center transition-all duration-200 disabled:opacity-60 disabled:hover:translate-y-0"
        >
          <i className="fa-solid fa-cloud-arrow-up mr-2.5 text-slate-400"></i>
          {busy === "demo" ? "Running demo…" : "Try sample data"}
        </button>
      </div>

      {error && (
        <div className="bg-[#fff1f2] border border-[#ffe4e6] rounded-2xl p-5 mt-4 relative animate-[upnlFade_0.3s_ease-out]">
          <button
            onClick={() => setError(null)}
            className="absolute top-5 right-5 text-[#f43f5e] opacity-60 hover:opacity-100 transition-opacity duration-150"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
          <div className="flex items-start">
            <i className="fa-solid fa-triangle-exclamation text-[#f43f5e] mt-0.5 mr-4 text-lg"></i>
            <div className="flex-1">
              <h3 className="text-xs font-semibold text-[#e11d48] uppercase tracking-wider mb-2">{error.title}</h3>
              <ul className="text-sm text-[#881337] space-y-1.5 list-disc ml-5">
                {error.items.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {busy && !runResult && (
        <div className="bg-white border border-slate-100 rounded-2xl p-7 upnl-shadow flex items-center gap-5 mt-4">
          <div className="relative w-10 h-10 flex-shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-teal-100" />
            <div className="absolute inset-0 rounded-full border-2 border-teal-600 border-t-transparent animate-spin"></div>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800">Dispatching the reconciliation agent…</div>
            <div className="text-xs text-slate-500 mt-1">Plan → match → fuzzy → triage → verify.</div>
          </div>
        </div>
      )}

      {runResult && (() => {
        const full = runResult.trace || [];
        const done = revealed >= full.length;
        const shown = full.slice(0, revealed);
        const displaySteps = done ? full : [...shown, { ...(full[revealed] || {}), status: "running", ms: null }];
        const m = runResult.meta;
        return (
          <div className="bg-white border border-slate-100 rounded-2xl p-7 upnl-shadow mt-4">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl text-white flex items-center justify-center transition-colors duration-500 ${
                    done ? "bg-teal-600" : "bg-slate-900"
                  }`}
                >
                  <i className={`fa-solid ${done ? "fa-circle-check" : "fa-microchip"}`}></i>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    Reconciliation agent
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors duration-300 ${
                        done ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {done ? "Complete" : "Working"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {done
                      ? `${m.settlement_active} records reconciled in ${m.elapsed_seconds}s · ${m.exceptions_total} exceptions`
                      : "Autonomous: plan → match → fuzzy → triage → verify"}
                  </div>
                </div>
              </div>
              {done && (
                <button
                  onClick={() => onComplete?.(runResult)}
                  className="upnl-gradient-btn text-white px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                >
                  View dashboard <i className="fa-solid fa-arrow-right"></i>
                </button>
              )}
            </div>
            <AgentTrace trace={displaySteps} label="Multi-agent reconciliation log · 7 sub-agents, each making real decisions" />
            {done && (
              <div className="mt-5 flex items-center gap-2 text-xs font-medium text-teal-800 bg-teal-50/70 border border-teal-100 rounded-lg px-3 py-2 w-fit animate-[upnlFade_0.4s_ease-out]">
                <i className="fa-solid fa-shield-halved text-teal-600"></i>
                Every stage deterministic and audited · {runResult.decisions_logged} decisions logged.
              </div>
            )}
          </div>
        );
      })()}

      <style>{`
        @keyframes upnlFade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .upnl-gradient-btn {
          background: linear-gradient(180deg, #0F9C8E 0%, #0F766E 100%);
        }
        .upnl-gradient-btn:hover {
          background: linear-gradient(180deg, #14B8A6 0%, #0F9C8E 100%);
        }
        .upnl-file-icon {
          width: 38px; height: 38px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          margin-right: 14px; flex-shrink: 0;
        }
        .upnl-file-icon.blue { background: #ecfeff; color: #0F766E; }
        .upnl-file-icon.green { background: #f0fdfa; color: #0d9488; }
        .upnl-file-icon.purple { background: #f0fdfa; color: #115e59; }
        .upnl-file-card {
          display: flex; align-items: center; background: white;
          border: 1px solid #f1f5f9; border-radius: 16px; padding: 13px 15px;
          box-shadow: 0 1px 2px rgba(15,23,42,0.03);
        }
        .upnl-status-badge {
          font-size: 10.5px; font-weight: 600; padding: 4px 10px; border-radius: 999px;
          background: #f0fdfa; color: #0F766E; white-space: nowrap;
        }
        .upnl-status-badge.invalid { background: #fef2f2; color: #ef4444; }
        .upnl-shadow { box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 12px 24px -12px rgba(15,23,42,0.06); }
        .upnl-inset-shadow { box-shadow: inset 0 1px 2px rgba(15,23,42,0.02); }
        .upnl-inline-shell { width: 100%; }
        .upnl-modal-shell { width: 100%; }
      `}</style>
    </div>
  );
}
