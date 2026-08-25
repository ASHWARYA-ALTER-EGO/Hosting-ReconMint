import React, { useState, useRef, useEffect } from "react";
import Folder from "../components/Folder.jsx";
import AgentTrace from "../components/AgentTrace.jsx";

// ─── Font Import ──────────────────────────────────────────────
const FONT_IMPORT_URL =
  "https://fonts.googleapis.com/css2?family=Special+Elite&family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap";

const SLOTS = [
  { id: "orders", name: "Orders", icon: "fa-solid fa-cart-shopping", color: "blue", key: "order" },
  { id: "settlement", name: "Settlement Report", icon: "fa-regular fa-file-lines", color: "green", key: "settle" },
  { id: "bank", name: "Bank Statement", icon: "fa-solid fa-building-columns", color: "purple", key: "bank" },
];

const PROGRESS_STEPS = [
  { id: 1, title: "Upload", subtitle: "Add your files" },
  { id: 2, title: "Validate", subtitle: "Auto-detect & verify" },
  { id: 3, title: "Reconcile", subtitle: "Run matching engine" },
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

export default function UploadPage({ onRunDemo, onRunUpload, showToast, onGoDashboard }) {
  const [files, setFiles] = useState({ orders: null, settlement: null, bank: null });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [revealed, setRevealed] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
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
    }, 420);
    return () => clearInterval(id);
  }, [runResult]);

  const chosen = SLOTS.map((s) => ({ ...s, file: files[s.id] })).filter((s) => s.file);
  const allThree = chosen.length === 3;
  const currentStep = allThree ? 3 : chosen.length > 0 ? 2 : 1;

  const onPick = (e) => {
    setError(null);
    setFiles((prev) => ({ ...prev, ...assignFiles(e.target.files) }));
  };
  const removeFile = (id) => setFiles((prev) => ({ ...prev, [id]: null }));

  const validClient = (f) => f && f.name.toLowerCase().endsWith(".csv") && f.size > 0;

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
      setError({ title: "Missing files", items: ["Please add all 3 CSV files (orders, settlement, bank)."] });
      return;
    }
    setBusy("upload");
    try {
      const resp = await onRunUpload({ orders: files.orders, settlement: files.settlement, bank: files.bank }, false);
      setRunResult(resp);
    } catch (err) {
      setError({ title: "Validation Errors", items: [String(err.message)] });
      showToast(String(err.message), "error");
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
      showToast(String(err.message), "error");
    } finally {
      setBusy(false);
    }
  };

  const folderItems = SLOTS.map((s) =>
    files[s.id] ? files[s.id].name : s.name
  );

  return (
    <div className="h-full overflow-y-auto rm-page">
      <style>{`
        @import url('${FONT_IMPORT_URL}');

        :root {
          --rm-bg: #f3efe4;
          --rm-card: #fbf9f2;
          --rm-card-alt: #f6f1e4;
          --rm-ink: #262019;
          --rm-ink-soft: #766c5b;
          --rm-rust: #b1432e;
          --rm-rust-deep: #8f3323;
          --rm-rust-wash: #f4e2db;
          --rm-line: rgba(38,32,25,0.12);
          --rm-line-soft: rgba(38,32,25,0.08);
        }

        .rm-page {
          background:
            radial-gradient(ellipse 700px 400px at 12% 0%, rgba(177,67,46,0.05), transparent 60%),
            radial-gradient(ellipse 700px 500px at 100% 100%, rgba(177,67,46,0.04), transparent 60%),
            var(--rm-bg);
          position: relative;
        }

        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes stampIn {
          0% { opacity: 0; transform: scale(1.4) rotate(-14deg); }
          60% { opacity: 1; transform: scale(0.94) rotate(-9deg); }
          100% { opacity: 1; transform: scale(1) rotate(-8deg); }
        }

        .gradient-btn {
          background: var(--rm-ink);
          border: 1px solid var(--rm-ink);
        }
        .gradient-btn:hover {
          background: #3a3226;
        }

        .file-icon {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 16px;
          flex-shrink: 0;
          border: 1px solid var(--rm-line);
          background: var(--rm-card-alt);
          color: var(--rm-rust-deep);
        }

        .file-card {
          display: flex;
          align-items: center;
          background: var(--rm-card);
          border: 1px solid var(--rm-line);
          border-radius: 10px;
          padding: 14px 16px;
          box-shadow: 0 1px 2px rgba(38,32,25,0.04), 0 8px 20px -12px rgba(38,32,25,0.12);
        }

        .status-badge {
          font-size: 10.5px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 999px;
          background: var(--rm-card-alt);
          color: var(--rm-ink-soft);
          border: 1px solid var(--rm-line);
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .status-badge.invalid {
          background: var(--rm-rust-wash);
          color: var(--rm-rust-deep);
          border-color: rgba(143,51,35,0.25);
        }

        .premium-shadow {
          box-shadow: 0 1px 2px rgba(38,32,25,0.04), 0 16px 32px -18px rgba(38,32,25,0.16);
        }
        .inset-shadow {
          box-shadow: inset 0 2px 4px rgba(38,32,25,0.05);
        }

        /* ─── Typewriter / Ledger typography ────────────────── */
        .rm-heading {
          font-family: 'Special Elite', monospace;
          letter-spacing: -0.01em;
          color: var(--rm-ink);
        }
        .rm-heading-sm {
          font-family: 'Special Elite', monospace;
          letter-spacing: 0.02em;
          color: var(--rm-ink);
        }
        .rm-mono {
          font-family: 'IBM Plex Mono', monospace;
        }
        .rm-body {
          font-family: 'Inter', sans-serif;
        }
        .rm-label {
          font-family: 'IBM Plex Mono', monospace;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .rm-card-flat {
          background: var(--rm-card);
          border: 1px solid var(--rm-line);
          border-radius: 14px;
        }

        .rm-stamp {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 2px solid var(--rm-rust);
          color: var(--rm-rust-deep);
          border-radius: 999px;
          padding: 6px 16px;
          transform: rotate(-8deg);
          animation: stampIn 0.5s ease-out;
          background: var(--rm-rust-wash);
        }

        /* step boxes */
        .rm-step-box {
          flex: 1;
          border-radius: 12px;
          padding: 16px 18px;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.25s ease;
        }
        .rm-step-box.active {
          background: var(--rm-card);
          border: 1px solid var(--rm-rust);
          box-shadow: 0 1px 2px rgba(38,32,25,0.04), 0 12px 24px -14px rgba(177,67,46,0.35);
        }
        .rm-step-box.done {
          background: var(--rm-rust-wash);
          border: 1px solid rgba(177,67,46,0.35);
        }
        .rm-step-box.upcoming {
          background: transparent;
          border: 1px dashed var(--rm-line);
        }
        .rm-step-connector {
          width: 28px;
          height: 1px;
          background: var(--rm-line);
          flex-shrink: 0;
        }
        .rm-step-num {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 700;
          font-size: 13px;
        }
      `}</style>

      <div className="max-w-6xl mx-auto p-10 lg:p-12 relative" style={{ zIndex: 1 }}>
        {/* header */}
        <header className="flex justify-between items-start mb-10 pb-6" style={{ borderBottom: "2px solid var(--rm-ink)" }}>
          <div>
            <p className="rm-label text-[11px] mb-2" style={{ color: "var(--rm-rust)" }}>
              — Reconciliation workspace
            </p>
            <h1 className="rm-heading text-5xl mb-2 tracking-tight">
              Upload &amp; Reconcile
            </h1>
            <p className="rm-body text-sm font-medium" style={{ color: "var(--rm-ink-soft)" }}>
              Bring your sources. We'll detect, validate and reconcile.
            </p>
          </div>
          <button
            onClick={runDemo}
            disabled={busy}
            className="rm-mono group px-5 py-2.5 text-sm font-medium rounded-lg flex items-center transition-all duration-200 disabled:opacity-60 hover:-translate-y-0.5"
            style={{ background: "var(--rm-card)", border: "1px solid var(--rm-ink)", color: "var(--rm-ink)", boxShadow: "0 1px 2px rgba(38,32,25,0.04), 0 8px 16px -10px rgba(38,32,25,0.2)" }}
          >
            <i className="fa-solid fa-wand-magic-sparkles mr-2" style={{ color: "var(--rm-rust)" }}></i> Try sample data
          </button>
        </header>

        {/* info banner */}
        {showInfo && (
          <div className="flex items-start gap-3 rounded-xl px-5 py-4 mb-8 animate-[fadeSlideIn_0.35s_ease-out] rm-card-flat premium-shadow">
            <i className="fa-solid fa-circle-info text-sm mt-0.5 flex-shrink-0" style={{ color: "var(--rm-rust)" }}></i>
            <p className="rm-body text-sm leading-relaxed flex-1" style={{ color: "var(--rm-ink-soft)" }}>
              Upload your <strong className="font-semibold" style={{ color: "var(--rm-ink)" }}>order export</strong>, <strong className="font-semibold" style={{ color: "var(--rm-ink)" }}>settlement report</strong>, and{" "}
              <strong className="font-semibold" style={{ color: "var(--rm-ink)" }}>bank statement</strong> for the same period. We'll match them line by line and flag anything that doesn't tie out.
            </p>
            <button
              onClick={() => setShowInfo(false)}
              className="flex-shrink-0 transition-colors duration-150 mt-0.5"
              style={{ color: "var(--rm-rust)" }}
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        )}

        {/* progress tracker — boxed steps */}
        <div className="flex items-center mb-14">
          {PROGRESS_STEPS.map((step, idx) => {
            const stepState =
              step.id < currentStep ? "done" : step.id === currentStep ? "active" : "upcoming";
            return (
              <React.Fragment key={step.id}>
                {idx > 0 && <div className="rm-step-connector" />}
                <div className={`rm-step-box ${stepState}`}>
                  <div
                    className="rm-step-num"
                    style={
                      stepState === "active"
                        ? { background: "var(--rm-rust)", color: "#fff" }
                        : stepState === "done"
                        ? { background: "#fff", color: "var(--rm-rust)", border: "1px solid var(--rm-rust)" }
                        : { background: "transparent", color: "var(--rm-ink-soft)", opacity: 0.5, border: "1px solid var(--rm-line)" }
                    }
                  >
                    {stepState === "done" ? <i className="fa-solid fa-check text-xs"></i> : step.id}
                  </div>
                  <div>
                    <div
                      className="rm-heading-sm"
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: stepState === "upcoming" ? "var(--rm-ink-soft)" : "var(--rm-ink)",
                        opacity: stepState === "upcoming" ? 0.6 : 1,
                      }}
                    >
                      {step.title}
                    </div>
                    <div
                      className="rm-body text-xs mt-0.5"
                      style={{ color: "var(--rm-ink-soft)", opacity: stepState === "upcoming" ? 0.6 : 0.85 }}
                    >
                      {step.subtitle}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-8 mb-10">
          {/* intake */}
          <section className="group/card rm-card-flat p-8 flex flex-col premium-shadow transition-all duration-300">
            <h2 className="rm-label text-xs font-semibold mb-2" style={{ color: "var(--rm-rust)" }}>
              File Intake
            </h2>
            <p className="rm-body text-sm mb-6" style={{ color: "var(--rm-ink-soft)" }}>Upload any 3 CSV files to start.</p>
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className="flex-1 rounded-xl flex flex-col items-center justify-center p-8 inset-shadow cursor-pointer transition-all duration-200"
              style={{
                background: dragActive ? "var(--rm-rust-wash)" : "var(--rm-card-alt)",
                border: dragActive ? "2px dashed var(--rm-rust)" : "2px dashed var(--rm-line)",
              }}
            >
              <div
                className="mb-5 flex items-center justify-center transition-transform duration-300"
                style={{ height: 90, transform: dragActive ? "scale(1.06)" : "scale(1)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <Folder color={dragActive ? "#b1432e" : "#262019"} size={0.9} items={folderItems} />
              </div>
              <div className="rm-heading-sm text-base font-semibold mb-1">Drop files here</div>
              <div className="rm-body text-sm mb-5" style={{ color: "var(--rm-ink-soft)" }}>
                or <span className="font-medium underline underline-offset-2" style={{ color: "var(--rm-rust-deep)" }}>browse</span> from your device
              </div>
              <div className="rm-mono text-xs font-medium" style={{ color: "var(--rm-ink-soft)" }}>CSV only (max 50MB each)</div>
              <input ref={inputRef} type="file" accept=".csv" multiple className="hidden" onChange={onPick} />
            </div>
            <div className="mt-6 flex items-start text-xs font-medium" style={{ color: "var(--rm-ink-soft)" }}>
              <i className="fa-solid fa-shield-halved mt-0.5 mr-2" style={{ color: "var(--rm-rust)", opacity: 0.8 }}></i>
              <p className="rm-body">Files are processed locally. Nothing is stored or sent anywhere except your own backend.</p>
            </div>
          </section>

          {/* detected */}
          <section className="rm-card-flat p-8 flex flex-col premium-shadow">
            <div className="flex justify-between items-center mb-6">
              <h2 className="rm-label text-xs font-semibold" style={{ color: "var(--rm-rust)" }}>
                Detected Files <span className="rm-body normal-case font-medium ml-1" style={{ color: "var(--rm-ink-soft)" }}>({chosen.length} of 3)</span>
              </h2>
              {chosen.length > 0 && (
                <button onClick={() => setFiles({ orders: null, settlement: null, bank: null })}
                  className="rm-mono text-xs font-medium transition-colors duration-200"
                  style={{ color: "var(--rm-ink-soft)" }}>
                  <i className="fa-solid fa-rotate-right mr-1.5"></i> Clear
                </button>
              )}
            </div>
            {chosen.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center rounded-xl p-10 transition-colors duration-300"
                style={{ border: "1px dashed var(--rm-line)", color: "var(--rm-ink-soft)", background: "var(--rm-card-alt)" }}>
                <i className="fa-regular fa-file-lines text-3xl mb-3 opacity-40"></i>
                <p className="rm-body text-sm font-medium">No files yet. Choose 3 CSVs, or use sample data.</p>
              </div>
            ) : (
              <div className="flex-1 space-y-4">
                {chosen.map((s) => (
                  <div key={s.id} className="file-card group hover:-translate-y-0.5 transition-all duration-200 animate-[fadeSlideIn_0.35s_ease-out]">
                    <div className={`file-icon ${s.color} transition-transform duration-200 group-hover:scale-105`}><i className={`${s.icon} opacity-90`}></i></div>
                    <div className="flex-1">
                      <div className="rm-heading-sm font-semibold text-sm">{s.name}</div>
                      <div className="rm-mono text-xs mt-1 font-medium" style={{ color: "var(--rm-ink-soft)" }}>
                        {s.file.name} &nbsp;•&nbsp; {humanSize(s.file.size)}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`rm-mono status-badge ${validClient(s.file) ? "" : "invalid"}`}>
                        {validClient(s.file) ? "Valid" : "Not CSV"}
                      </div>
                      <button onClick={() => removeFile(s.id)} className="p-1.5 rounded-md transition-colors duration-200"
                        style={{ color: "var(--rm-ink-soft)" }}>
                        <i className="fa-regular fa-trash-can"></i>
                      </button>
                    </div>
                  </div>
                ))}
                {allThree && (
                  <div className="rounded-xl p-4 flex items-center text-sm animate-[fadeSlideIn_0.4s_ease-out]"
                    style={{ background: "var(--rm-rust-wash)", border: "1px solid var(--rm-rust)" }}>
                    <i className="fa-regular fa-circle-check mr-3 text-xl" style={{ color: "var(--rm-rust)" }}></i>
                    <span className="rm-heading-sm font-medium mr-1" style={{ color: "var(--rm-rust-deep)" }}>All files look good.</span>
                    <span className="rm-body" style={{ color: "var(--rm-ink-soft)" }}>You can start reconciliation.</span>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* actions */}
        <div className="flex justify-center items-center gap-6 mb-8">
          <button onClick={runUpload} disabled={busy}
            className="rm-mono gradient-btn text-white px-10 py-3.5 rounded-lg font-medium flex items-center transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
            style={{ boxShadow: "0 8px 20px -8px rgba(38,32,25,0.4)" }}>
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
          <span className="rm-body text-sm font-medium" style={{ color: "var(--rm-ink-soft)" }}>or</span>
          <button onClick={runDemo} disabled={busy}
            className="rm-mono px-8 py-3.5 rounded-lg font-medium hover:-translate-y-0.5 active:translate-y-0 flex items-center transition-all duration-200 disabled:opacity-60 disabled:hover:translate-y-0"
            style={{ background: "var(--rm-card)", border: "1px solid var(--rm-ink)", color: "var(--rm-ink)", boxShadow: "0 1px 2px rgba(38,32,25,0.04), 0 8px 16px -10px rgba(38,32,25,0.2)" }}>
            <i className="fa-solid fa-cloud-arrow-up mr-2.5" style={{ color: "var(--rm-rust)" }}></i>
            {busy === "demo" ? "Running demo…" : "Try sample data (demo)"}
          </button>
        </div>

        {/* validation error */}
        {error && (
          <div className="rounded-xl p-5 mb-6 relative animate-[fadeSlideIn_0.3s_ease-out]"
            style={{ background: "var(--rm-rust-wash)", border: "1px solid var(--rm-rust)" }}>
            <button onClick={() => setError(null)} className="absolute top-5 right-5 opacity-60 hover:opacity-100 transition-opacity duration-150"
              style={{ color: "var(--rm-rust-deep)" }}>
              <i className="fa-solid fa-xmark text-lg"></i>
            </button>
            <div className="flex items-start">
              <i className="fa-solid fa-triangle-exclamation mt-0.5 mr-4 text-lg" style={{ color: "var(--rm-rust-deep)" }}></i>
              <div className="flex-1">
                <h3 className="rm-label text-xs font-semibold mb-2" style={{ color: "var(--rm-rust-deep)" }}>{error.title}</h3>
                <ul className="rm-body text-sm space-y-1.5 list-disc ml-5" style={{ color: "var(--rm-ink)" }}>
                  {error.items.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* dispatching spinner */}
        {busy && !runResult && (
          <div className="rm-card-flat p-8 premium-shadow flex items-center gap-5">
            <div className="relative w-10 h-10 flex-shrink-0">
              <div className="absolute inset-0 rounded-full" style={{ border: "2px solid var(--rm-line)" }} />
              <div className="absolute inset-0 rounded-full animate-spin" style={{ border: "2px solid var(--rm-rust)", borderTopColor: "transparent" }}></div>
            </div>
            <div>
              <div className="rm-heading-sm text-sm font-semibold">Dispatching the reconciliation agent…</div>
              <div className="rm-mono text-xs mt-1" style={{ color: "var(--rm-ink-soft)" }}>Plan → match → fuzzy → triage → verify.</div>
            </div>
          </div>
        )}

        {/* LIVE agent trace */}
        {runResult && (() => {
          const full = runResult.trace || [];
          const done = revealed >= full.length;
          const shown = full.slice(0, revealed);
          const displaySteps = done
            ? full
            : [...shown, { ...(full[revealed] || {}), status: "running", ms: null }];
          const m = runResult.meta;
          return (
            <div className="rm-card-flat p-8 premium-shadow">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-500"
                    style={{ background: "var(--rm-ink)", color: "var(--rm-card)" }}>
                    <i className={`fa-solid ${done ? "fa-circle-check" : "fa-microchip"}`}></i>
                  </div>
                  <div>
                    <div className="rm-heading-sm text-sm font-semibold flex items-center gap-2">
                      Reconciliation agent
                      {done ? (
                        <span className="rm-stamp rm-mono text-[10px] font-semibold" style={{ transform: "rotate(-6deg)", padding: "2px 10px" }}>
                          Verified
                        </span>
                      ) : (
                        <span className="rm-mono text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: "var(--rm-card-alt)", border: "1px solid var(--rm-line)", color: "var(--rm-ink-soft)" }}>
                          Working
                        </span>
                      )}
                    </div>
                    <div className="rm-body text-xs mt-0.5" style={{ color: "var(--rm-ink-soft)" }}>
                      {done
                        ? `${m.settlement_active} records reconciled in ${m.elapsed_seconds}s · ${m.exceptions_total} exceptions`
                        : "Autonomous: plan → match → fuzzy → triage → verify"}
                    </div>
                  </div>
                </div>
                {done && (
                  <button onClick={onGoDashboard}
                    className="rm-mono gradient-btn text-white px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200">
                    View dashboard <i className="fa-solid fa-arrow-right"></i>
                  </button>
                )}
              </div>
              <AgentTrace trace={displaySteps} label="Live reconciliation trace" />
              {done && (
                <div className="mt-5 flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2 w-fit animate-[fadeSlideIn_0.4s_ease-out]"
                  style={{ background: "var(--rm-rust-wash)", border: "1px solid var(--rm-rust)", color: "var(--rm-rust-deep)" }}>
                  <i className="fa-solid fa-shield-halved"></i>
                  <span className="rm-body">Every stage deterministic and audited — {runResult.decisions_logged} decisions logged.</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}