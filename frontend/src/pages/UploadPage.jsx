import React, { useState, useRef } from "react";
import Folder from "C:\Users\Hp\Downloads\razorpay hackathon\reconmint\frontend\src\components;

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
  // fill any empty slots in order with leftovers
  for (const f of remaining) {
    const empty = SLOTS.find((s) => !files[s.id]);
    if (empty) files[empty.id] = f;
  }
  return files;
}

export default function UploadPage({ onRunDemo, onRunUpload, showToast }) {
  const [files, setFiles] = useState({ orders: null, settlement: null, bank: null });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false); // false | "demo" | "upload"
  const inputRef = useRef(null);

  const chosen = SLOTS.map((s) => ({ ...s, file: files[s.id] })).filter((s) => s.file);
  const allThree = chosen.length === 3;

  const onPick = (e) => {
    setError(null);
    setFiles((prev) => ({ ...prev, ...assignFiles(e.target.files) }));
  };
  const removeFile = (id) => setFiles((prev) => ({ ...prev, [id]: null }));

  const validClient = (f) => f && f.name.toLowerCase().endsWith(".csv") && f.size > 0;

  const runUpload = async () => {
    setError(null);
    if (!allThree) {
      setError({ title: "Missing files", items: ["Please add all 3 CSV files (orders, settlement, bank)."] });
      return;
    }
    setBusy("upload");
    try {
      await onRunUpload({ orders: files.orders, settlement: files.settlement, bank: files.bank }, false);
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
      await onRunDemo(false);
    } catch (err) {
      showToast(String(err.message), "error");
      setBusy(false);
    }
  };

  // Labels for the folder's three "papers" — reflect which slots are still open
  const folderItems = SLOTS.map((s) =>
    files[s.id] ? files[s.id].name : s.name
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-10 lg:p-12">
        {/* header */}
        <header className="flex justify-between items-start mb-10">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 mb-2 tracking-tight">Upload &amp; Reconcile</h1>
            <p className="text-slate-500 text-sm font-medium">Bring your sources. We'll detect, validate and reconcile.</p>
          </div>
          <button
            onClick={runDemo}
            disabled={busy}
            className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center shadow-sm transition-all disabled:opacity-60"
          >
            <i className="fa-solid fa-wand-magic-sparkles mr-2 text-slate-400"></i> Try sample data
          </button>
        </header>

        {/* progress tracker */}
        <div className="flex items-center justify-center mb-14 max-w-2xl mx-auto">
          {PROGRESS_STEPS.map((step, idx) => (
            <React.Fragment key={step.id}>
              {idx > 0 && <div className={`step-line ${chosen.length > 0 ? "active" : ""}`}></div>}
              <div className={`flex items-center ${idx > 0 && chosen.length === 0 ? "opacity-60" : ""}`}>
                <div className={idx === 0
                  ? "w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-medium text-sm"
                  : "w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-400 flex items-center justify-center font-medium text-sm"}>
                  {step.id}
                </div>
                <div className="ml-4">
                  <div className="text-sm font-semibold text-slate-900">{step.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{step.subtitle}</div>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-8 mb-10">
          {/* intake */}
          <section className="bg-white p-8 rounded-2xl border border-slate-100 flex flex-col premium-shadow">
            <h2 className="text-xs font-semibold text-slate-400 tracking-wider mb-2 uppercase">File Intake</h2>
            <p className="text-sm text-slate-500 mb-6">Upload any 3 CSV files to start.</p>
            <div
              onClick={() => inputRef.current?.click()}
              className="flex-1 rounded-2xl flex flex-col items-center justify-center p-8 bg-slate-50 inset-shadow border border-slate-100 group hover:bg-slate-100/50 cursor-pointer"
            >
              <div
                className="mb-5 flex items-center justify-center"
                style={{ height: 90 }}
                // Stop the folder's own click/open toggle from also opening the file picker twice
                onClick={(e) => e.stopPropagation()}
              >
                <Folder color="#0f172a" size={0.9} items={folderItems} />
              </div>
              <div className="text-base font-semibold text-slate-800 mb-1">Drop files here</div>
              <div className="text-sm text-slate-500 mb-5">or <span className="text-slate-800 font-medium underline">browse</span> from your device</div>
              <div className="text-xs text-slate-400 font-medium">CSV only (max 50MB each)</div>
              <input ref={inputRef} type="file" accept=".csv" multiple className="hidden" onChange={onPick} />
            </div>
            <div className="mt-6 flex items-start text-xs text-slate-400 font-medium">
              <i className="fa-solid fa-shield-halved mt-0.5 mr-2 opacity-70"></i>
              <p>Files are processed locally. Nothing is stored or sent anywhere except your own backend.</p>
            </div>
          </section>

          {/* detected */}
          <section className="flex flex-col">
            <div className="flex justify-between items-center mb-6 px-2">
              <h2 className="text-xs font-semibold text-slate-400 tracking-wider uppercase">
                Detected Files <span className="normal-case font-medium text-slate-400 ml-1">({chosen.length} of 3)</span>
              </h2>
              {chosen.length > 0 && (
                <button onClick={() => setFiles({ orders: null, settlement: null, bank: null })}
                  className="text-xs text-slate-500 font-medium hover:text-slate-800">
                  <i className="fa-solid fa-rotate-right mr-1.5"></i> Clear
                </button>
              )}
            </div>
            {chosen.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-2xl p-10 text-slate-400">
                <i className="fa-regular fa-file-lines text-3xl mb-3 opacity-50"></i>
                <p className="text-sm font-medium">No files yet. Choose 3 CSVs, or use sample data.</p>
              </div>
            ) : (
              <div className="flex-1 space-y-4">
                {chosen.map((s) => (
                  <div key={s.id} className="file-card">
                    <div className={`file-icon ${s.color}`}><i className={`${s.icon} opacity-80`}></i></div>
                    <div className="flex-1">
                      <div className="font-semibold text-slate-800 text-sm">{s.name}</div>
                      <div className="text-xs text-slate-500 mt-1 font-medium">
                        {s.file.name} &nbsp;•&nbsp; {humanSize(s.file.size)}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`status-badge ${validClient(s.file) ? "" : "invalid"}`}>
                        {validClient(s.file) ? "Valid" : "Not CSV"}
                      </div>
                      <button onClick={() => removeFile(s.id)} className="text-slate-300 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50">
                        <i className="fa-regular fa-trash-can"></i>
                      </button>
                    </div>
                  </div>
                ))}
                {allThree && (
                  <div className="bg-[#f0fdf4] border border-[#d1fae5] rounded-xl p-4 flex items-center text-sm text-[#065f46]">
                    <i className="fa-regular fa-circle-check text-emerald-600 mr-3 text-xl"></i>
                    <span className="font-medium mr-1 text-[#047857]">All files look good.</span> You can start reconciliation.
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* actions */}
        <div className="flex justify-center items-center gap-6 mb-8">
          <button onClick={runUpload} disabled={busy}
            className="gradient-btn text-white px-10 py-3.5 rounded-xl font-medium shadow-lg shadow-slate-900/20 flex items-center transition-all hover:-translate-y-0.5 disabled:opacity-60">
            {busy === "upload" ? "Reconciling…" : "Reconcile now"} <i className="fa-solid fa-arrow-right ml-2.5 opacity-80"></i>
          </button>
          <span className="text-slate-400 text-sm font-medium">or</span>
          <button onClick={runDemo} disabled={busy}
            className="bg-white border border-slate-200 text-slate-700 px-8 py-3.5 rounded-xl font-medium shadow-sm hover:bg-slate-50 flex items-center transition-all disabled:opacity-60">
            <i className="fa-solid fa-cloud-arrow-up mr-2.5 text-slate-400"></i>
            {busy === "demo" ? "Running demo…" : "Try sample data (demo)"}
          </button>
        </div>

        {/* validation error */}
        {error && (
          <div className="bg-[#fff1f2] border border-[#ffe4e6] rounded-2xl p-5 mb-6 relative">
            <button onClick={() => setError(null)} className="absolute top-5 right-5 text-[#f43f5e] opacity-60 hover:opacity-100">
              <i className="fa-solid fa-xmark text-lg"></i>
            </button>
            <div className="flex items-start">
              <i className="fa-solid fa-triangle-exclamation text-[#f43f5e] mt-0.5 mr-4 text-lg"></i>
              <div className="flex-1">
                <h3 className="text-xs font-semibold text-[#e11d48] uppercase tracking-wider mb-2">{error.title}</h3>
                <ul className="text-sm text-[#881337] space-y-1.5 list-disc ml-5">
                  {error.items.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* busy panel */}
        {busy && (
          <div className="bg-white border border-slate-100 rounded-2xl p-8 premium-shadow flex items-center gap-5">
            <div className="w-10 h-10 rounded-full border-2 border-slate-900 border-t-transparent animate-spin"></div>
            <div>
              <div className="text-sm font-semibold text-slate-800">Running matching engine…</div>
              <div className="text-xs text-slate-500 mt-1">Ingest → fee reconstruction → exact → fuzzy → triage. You'll land on the dashboard when done.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
