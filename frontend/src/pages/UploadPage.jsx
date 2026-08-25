import React, { useState, useRef, useEffect, useCallback } from "react";
import Folder from "../components/Folder.jsx";
import AgentTrace from "../components/AgentTrace.jsx";

// ─── Font Import ──────────────────────────────────────────────
const FONT_IMPORT_URL =
  "https://fonts.googleapis.com/css2?family=Special+Elite&family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap";

// ─── Placeholder — swap for your real shared sample dataset ───
const SAMPLE_DATASET_URL = "https://drive.google.com/drive/folders/PLACEHOLDER_SAMPLE_DATASET";

const SLOTS = [
  { id: "orders", name: "Orders", short: "Orders export", icon: "fa-solid fa-cart-shopping", key: "order" },
  { id: "settlement", name: "Settlement Report", short: "Settlement", icon: "fa-regular fa-file-lines", key: "settle" },
  { id: "bank", name: "Bank Statement", short: "Bank statement", icon: "fa-solid fa-building-columns", key: "bank" },
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

let chipSeq = 0;
function toChips(fileList) {
  return Array.from(fileList).map((file) => ({ id: `chip_${Date.now()}_${chipSeq++}`, file }));
}

export default function UploadPage({ onRunDemo, onRunUpload, showToast, onGoDashboard }) {
  const [files, setFiles] = useState({ orders: null, settlement: null, bank: null });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [revealed, setRevealed] = useState(0);
  const [showInfo, setShowInfo] = useState(true);

  // ── explicit labeling state ──────────────────────────────────
  const [slotDragOver, setSlotDragOver] = useState(null); // slot id currently dragged-over
  const [combinedDragActive, setCombinedDragActive] = useState(false);
  const [askSingle, setAskSingle] = useState(null); // { file } — ambiguous single file needs a label
  const [assignChips, setAssignChips] = useState([]); // pending chips from a multi-file batch drop
  const [assignPanelOpen, setAssignPanelOpen] = useState(false);
  const [dragChipId, setDragChipId] = useState(null); // chip currently being dragged onto a slot
  const [assignHoverSlot, setAssignHoverSlot] = useState(null);
  const [justAssigned, setJustAssigned] = useState(null); // slot id — brief confirm pulse

  const slotInputRefs = { orders: useRef(null), settlement: useRef(null), bank: useRef(null) };
  const combinedInputRef = useRef(null);

  // auto-close the batch panel ~1s after the last file gets a label
  useEffect(() => {
    if (assignPanelOpen && assignChips.length === 0) {
      const t = setTimeout(() => setAssignPanelOpen(false), 1000);
      return () => clearTimeout(t);
    }
  }, [assignChips, assignPanelOpen]);

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
  const openSlots = SLOTS.filter((s) => !files[s.id]);

  const flashAssigned = (slotId) => {
    setJustAssigned(slotId);
    setTimeout(() => setJustAssigned((cur) => (cur === slotId ? null : cur)), 900);
  };

  // ── direct, per-slot assignment (the "one at a time" flow) ────
  const assignToSlot = useCallback((slotId, file) => {
    setError(null);
    setFiles((prev) => ({ ...prev, [slotId]: file }));
    flashAssigned(slotId);
  }, []);

  const removeFile = (id) => setFiles((prev) => ({ ...prev, [id]: null }));

  // ── batch drop → assignment panel (the "all at once" flow) ────
  const openAssignPanel = (fileList) => {
    setError(null);
    setAssignChips(toChips(fileList));
    setAssignPanelOpen(true);
  };

  const assignChipToSlot = (chipId, slotId) => {
    const chip = assignChips.find((c) => c.id === chipId);
    if (!chip) return;
    // if the slot is already taken, bump the old occupant back into the pending tray
    setFiles((prev) => {
      const bumped = prev[slotId];
      const next = { ...prev, [slotId]: chip.file };
      if (bumped) {
        setAssignChips((cs) => [...cs.filter((c) => c.id !== chipId), { id: `chip_${Date.now()}_${chipSeq++}`, file: bumped }]);
      } else {
        setAssignChips((cs) => cs.filter((c) => c.id !== chipId));
      }
      return next;
    });
    flashAssigned(slotId);
  };

  const closeAssignPanel = () => { setAssignChips([]); setAssignPanelOpen(false); };

  // ── generic drop target used by the combined "drop up to 3" zone ──
  const handleCombinedDrop = (e) => {
    e.preventDefault();
    setCombinedDragActive(false);
    if (!e.dataTransfer?.files?.length) return;
    const list = Array.from(e.dataTransfer.files);
    if (list.length === 1) setAskSingle({ file: list[0] });
    else openAssignPanel(list);
  };
  const handleCombinedPick = (e) => {
    if (!e.target.files?.length) return;
    const list = Array.from(e.target.files);
    if (list.length === 1) setAskSingle({ file: list[0] });
    else openAssignPanel(list);
    e.target.value = "";
  };

  const confirmSingle = (slotId) => {
    if (!askSingle) return;
    assignToSlot(slotId, askSingle.file);
    setAskSingle(null);
  };

  const validClient = (f) => f && f.name.toLowerCase().endsWith(".csv") && f.size > 0;

  const runUpload = async () => {
    setError(null);
    if (!allThree) {
      setError({
        title: "Missing files",
        items: [`Please label all 3 files before reconciling — ${openSlots.map((s) => s.name).join(", ")} still needed.`],
      });
      return;
    }
    const invalid = chosen.filter((s) => !validClient(s.file));
    if (invalid.length) {
      setError({
        title: "Validation errors",
        items: invalid.map((s) => `${s.name}: "${s.file.name}" doesn't look like a valid CSV — check the file and try again.`),
      });
      return;
    }
    setBusy("upload");
    try {
      const resp = await onRunUpload({ orders: files.orders, settlement: files.settlement, bank: files.bank }, false);
      setRunResult(resp);
    } catch (err) {
      // Most "validation errors" here trace back to a file landing in the wrong
      // slot — surface the message plainly and let the person re-label below.
      setError({ title: "Validation errors", items: [String(err.message)] });
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

  const folderItems = SLOTS.map((s) => (files[s.id] ? files[s.id].name : s.name));

  return (
    <div className="h-full overflow-y-auto rm-page">
      <style>{`
        @import url('${FONT_IMPORT_URL}');

        :root {
          --rm-bg: #EAF1DE;
          --rm-card: #FBFBF3;
          --rm-card-alt: #E9F0DC;
          --rm-ink: #1F2A1A;
          --rm-ink-soft: #5C6752;
          --rm-rust: #B5432F;
          --rm-rust-deep: #8F3323;
          --rm-rust-wash: #F4E2DB;
          --rm-moss: #4B7B4E;
          --rm-moss-wash: #E3ECDD;
          --rm-line: rgba(31,42,26,0.14);
          --rm-line-soft: rgba(31,42,26,0.08);
        }

        .rm-page {
          background:
            radial-gradient(ellipse 700px 400px at 12% 0%, rgba(181,67,47,0.045), transparent 60%),
            radial-gradient(ellipse 700px 500px at 100% 100%, rgba(75,123,78,0.06), transparent 60%),
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
        @keyframes assignPulse {
          0% { box-shadow: 0 0 0 0 rgba(75,123,78,0.45); }
          100% { box-shadow: 0 0 0 10px rgba(75,123,78,0); }
        }
        .rm-assign-pulse { animation: assignPulse 0.9s ease-out; }
        @keyframes panelIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .rm-panel-in { animation: panelIn 0.28s cubic-bezier(0.22,1,0.36,1); }

        .gradient-btn {
          background: var(--rm-ink);
          border: 1px solid var(--rm-ink);
        }
        .gradient-btn:hover {
          background: #34402c;
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
          box-shadow: 0 1px 2px rgba(31,42,26,0.04), 0 8px 20px -12px rgba(31,42,26,0.12);
        }

        .status-badge {
          font-size: 10.5px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 999px;
          background: var(--rm-moss-wash);
          color: var(--rm-moss);
          border: 1px solid rgba(75,123,78,0.3);
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .status-badge.invalid {
          background: var(--rm-rust-wash);
          color: var(--rm-rust-deep);
          border-color: rgba(143,51,35,0.25);
        }

        .premium-shadow {
          box-shadow: 0 1px 2px rgba(31,42,26,0.04), 0 16px 32px -18px rgba(31,42,26,0.16);
        }
        .inset-shadow {
          box-shadow: inset 0 2px 4px rgba(31,42,26,0.05);
        }

        /* ─── Typewriter / Ledger typography ────────────────── */
        .rm-heading { font-family: 'Special Elite', monospace; letter-spacing: -0.01em; color: var(--rm-ink); }
        .rm-heading-sm { font-family: 'Special Elite', monospace; letter-spacing: 0.02em; color: var(--rm-ink); }
        .rm-mono { font-family: 'IBM Plex Mono', monospace; }
        .rm-body { font-family: 'Inter', sans-serif; }
        .rm-label { font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.14em; text-transform: uppercase; }

        .rm-card-flat { background: var(--rm-card); border: 1px solid var(--rm-line); border-radius: 14px; }

        .rm-stamp {
          display: inline-flex; align-items: center; gap: 8px;
          border: 2px solid var(--rm-rust); color: var(--rm-rust-deep);
          border-radius: 999px; padding: 6px 16px; transform: rotate(-8deg);
          animation: stampIn 0.5s ease-out; background: var(--rm-rust-wash);
        }

        .rm-step-box { flex: 1; border-radius: 12px; padding: 16px 18px; display: flex; align-items: center; gap: 12px; transition: all 0.25s ease; }
        .rm-step-box.active { background: var(--rm-card); border: 1px solid var(--rm-rust); box-shadow: 0 1px 2px rgba(31,42,26,0.04), 0 12px 24px -14px rgba(181,67,47,0.35); }
        .rm-step-box.done { background: var(--rm-moss-wash); border: 1px solid rgba(75,123,78,0.35); }
        .rm-step-box.upcoming { background: transparent; border: 1px dashed var(--rm-line); }
        .rm-step-connector { width: 28px; height: 1px; background: var(--rm-line); flex-shrink: 0; }
        .rm-step-num { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 13px; }

        /* per-slot mini dropzones */
        .rm-slot {
          border-radius: 12px;
          border: 1.5px dashed var(--rm-line);
          background: var(--rm-card-alt);
          padding: 16px;
          transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
          cursor: pointer;
        }
        .rm-slot:hover { border-color: var(--rm-ink); }
        .rm-slot.drag { border-color: var(--rm-rust); background: var(--rm-rust-wash); transform: translateY(-2px) scale(1.01); }
        .rm-slot.filled { border-style: solid; border-color: rgba(75,123,78,0.4); background: var(--rm-moss-wash); cursor: default; }

        /* assignment-panel drop targets */
        .rm-target {
          border-radius: 12px;
          border: 1.5px dashed var(--rm-line);
          background: var(--rm-card-alt);
          transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
        }
        .rm-target.hover { border-color: var(--rm-rust); background: var(--rm-rust-wash); transform: scale(1.02); }
        .rm-target.filled { border-style: solid; border-color: rgba(75,123,78,0.4); background: var(--rm-moss-wash); }

        .rm-chip {
          display: flex; align-items: center; gap: 10px;
          background: var(--rm-card); border: 1px solid var(--rm-line); border-radius: 10px;
          padding: 10px 12px; cursor: grab; user-select: none;
          transition: box-shadow 0.15s ease, transform 0.15s ease, opacity 0.15s ease;
        }
        .rm-chip:active { cursor: grabbing; }
        .rm-chip.dragging { opacity: 0.4; }
      `}</style>

      <div className="max-w-6xl mx-auto p-10 lg:p-12 relative" style={{ zIndex: 1 }}>
        {/* header */}
        <header className="flex justify-between items-start mb-10 pb-6" style={{ borderBottom: "2px solid var(--rm-ink)" }}>
          <div>
            <p className="rm-label text-[11px] mb-2" style={{ color: "var(--rm-rust)" }}>
              — Reconciliation workspace
            </p>
            <h1 className="rm-heading text-5xl mb-2 tracking-tight">Upload &amp; Reconcile</h1>
            <p className="rm-body text-sm font-medium" style={{ color: "var(--rm-ink-soft)" }}>
              Bring your sources. We'll validate and reconcile — you tell us which file is which.
            </p>
          </div>
          <button
            onClick={runDemo}
            disabled={busy}
            className="rm-mono group px-5 py-2.5 text-sm font-medium rounded-lg flex items-center transition-all duration-200 disabled:opacity-60 hover:-translate-y-0.5"
            style={{ background: "var(--rm-card)", border: "1px solid var(--rm-ink)", color: "var(--rm-ink)", boxShadow: "0 1px 2px rgba(31,42,26,0.04), 0 8px 16px -10px rgba(31,42,26,0.2)" }}
          >
            <i className="fa-solid fa-wand-magic-sparkles mr-2" style={{ color: "var(--rm-rust)" }}></i> Try sample data
          </button>
        </header>

        {/* info banner */}
        {showInfo && (
          <div className="flex items-start gap-3 rounded-xl px-5 py-4 mb-8 animate-[fadeSlideIn_0.35s_ease-out] rm-card-flat premium-shadow">
            <i className="fa-solid fa-circle-info text-sm mt-0.5 flex-shrink-0" style={{ color: "var(--rm-rust)" }}></i>
            <p className="rm-body text-sm leading-relaxed flex-1" style={{ color: "var(--rm-ink-soft)" }}>
              Upload your <strong className="font-semibold" style={{ color: "var(--rm-ink)" }}>order export</strong>,{" "}
              <strong className="font-semibold" style={{ color: "var(--rm-ink)" }}>settlement report</strong>, and{" "}
              <strong className="font-semibold" style={{ color: "var(--rm-ink)" }}>bank statement</strong> for the same period — drop each
              into its own slot below, or drop all 3 together and we'll ask you to confirm which is which.
              {" "}Don't have files handy?{" "}
              <a
                href={SAMPLE_DATASET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2"
                style={{ color: "var(--rm-rust-deep)" }}
              >
                Grab the sample dataset <i className="fa-solid fa-arrow-up-right-from-square text-[10px] ml-0.5"></i>
              </a>
              .
            </p>
            <button onClick={() => setShowInfo(false)} className="flex-shrink-0 transition-colors duration-150 mt-0.5" style={{ color: "var(--rm-rust)" }}>
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        )}

        {/* progress tracker */}
        <div className="flex items-center mb-14">
          {PROGRESS_STEPS.map((step, idx) => {
            const stepState = step.id < currentStep ? "done" : step.id === currentStep ? "active" : "upcoming";
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
                        ? { background: "#fff", color: "var(--rm-moss)", border: "1px solid var(--rm-moss)" }
                        : { background: "transparent", color: "var(--rm-ink-soft)", opacity: 0.5, border: "1px solid var(--rm-line)" }
                    }
                  >
                    {stepState === "done" ? <i className="fa-solid fa-check text-xs"></i> : step.id}
                  </div>
                  <div>
                    <div className="rm-heading-sm" style={{ fontSize: "14px", fontWeight: 600, color: stepState === "upcoming" ? "var(--rm-ink-soft)" : "var(--rm-ink)", opacity: stepState === "upcoming" ? 0.6 : 1 }}>
                      {step.title}
                    </div>
                    <div className="rm-body text-xs mt-0.5" style={{ color: "var(--rm-ink-soft)", opacity: stepState === "upcoming" ? 0.6 : 0.85 }}>
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
          <section className="rm-card-flat p-8 flex flex-col premium-shadow transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <h2 className="rm-label text-xs font-semibold" style={{ color: "var(--rm-rust)" }}>File Intake</h2>
              <span className="rm-mono text-[10px]" style={{ color: "var(--rm-ink-soft)" }}>one by one, or all at once</span>
            </div>
            <p className="rm-body text-sm mb-5" style={{ color: "var(--rm-ink-soft)" }}>
              Drop each file into its labeled slot — or drop all 3 into the tray and assign them in one go.
            </p>

            {/* ── three explicit, self-labeling drop targets ───────── */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {SLOTS.map((s) => {
                const filled = !!files[s.id];
                const isDrag = slotDragOver === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => !filled && slotInputRefs[s.id].current?.click()}
                    onDragOver={(e) => { e.preventDefault(); if (!filled) setSlotDragOver(s.id); }}
                    onDragLeave={() => setSlotDragOver((cur) => (cur === s.id ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setSlotDragOver(null);
                      const f = e.dataTransfer?.files?.[0];
                      if (f) assignToSlot(s.id, f);
                    }}
                    className={`rm-slot flex flex-col items-center text-center ${isDrag ? "drag" : ""} ${filled ? "filled" : ""} ${justAssigned === s.id ? "rm-assign-pulse" : ""}`}
                  >
                    <i className={`${s.icon} text-lg mb-2`} style={{ color: filled ? "var(--rm-moss)" : "var(--rm-rust)" }}></i>
                    <div className="rm-heading-sm text-[13px] font-semibold leading-tight">{s.name}</div>
                    {filled ? (
                      <div className="mt-2 w-full">
                        <div className="rm-mono text-[10px] truncate px-1" style={{ color: "var(--rm-ink-soft)" }}>{files[s.id].name}</div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(s.id); }}
                          className="rm-mono text-[10px] font-semibold mt-1.5"
                          style={{ color: "var(--rm-rust-deep)" }}
                        >
                          <i className="fa-regular fa-trash-can mr-1"></i>Replace
                        </button>
                      </div>
                    ) : (
                      <div className="rm-body text-[11px] mt-1.5" style={{ color: "var(--rm-ink-soft)" }}>drop or click</div>
                    )}
                    <input
                      ref={slotInputRefs[s.id]}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) assignToSlot(s.id, f); e.target.value = ""; }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 h-px" style={{ background: "var(--rm-line)" }} />
              <span className="rm-mono text-[10px]" style={{ color: "var(--rm-ink-soft)" }}>OR DROP ALL 3 TOGETHER</span>
              <div className="flex-1 h-px" style={{ background: "var(--rm-line)" }} />
            </div>

            <div
              onClick={() => combinedInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setCombinedDragActive(true); }}
              onDragLeave={() => setCombinedDragActive(false)}
              onDrop={handleCombinedDrop}
              className="flex-1 rounded-xl flex flex-col items-center justify-center p-6 inset-shadow cursor-pointer transition-all duration-200"
              style={{
                background: combinedDragActive ? "var(--rm-rust-wash)" : "var(--rm-card-alt)",
                border: combinedDragActive ? "2px dashed var(--rm-rust)" : "2px dashed var(--rm-line)",
              }}
            >
              <div className="mb-3 flex items-center justify-center transition-transform duration-300" style={{ height: 70, transform: combinedDragActive ? "scale(1.06)" : "scale(1)" }} onClick={(e) => e.stopPropagation()}>
                <Folder color={combinedDragActive ? "#B5432F" : "#1F2A1A"} size={0.75} items={folderItems} />
              </div>
              <div className="rm-heading-sm text-sm font-semibold mb-1">Drop up to 3 files here</div>
              <div className="rm-body text-xs mb-1" style={{ color: "var(--rm-ink-soft)" }}>
                or <span className="font-medium underline underline-offset-2" style={{ color: "var(--rm-rust-deep)" }}>browse</span> from your device
              </div>
              <div className="rm-mono text-[11px] font-medium" style={{ color: "var(--rm-ink-soft)" }}>CSV only (max 50MB each) · we'll ask which is which</div>
              <input ref={combinedInputRef} type="file" accept=".csv" multiple className="hidden" onChange={handleCombinedPick} />
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
                <button onClick={() => setFiles({ orders: null, settlement: null, bank: null })} className="rm-mono text-xs font-medium transition-colors duration-200" style={{ color: "var(--rm-ink-soft)" }}>
                  <i className="fa-solid fa-rotate-right mr-1.5"></i> Clear
                </button>
              )}
            </div>
            {chosen.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center rounded-xl p-10 transition-colors duration-300" style={{ border: "1px dashed var(--rm-line)", color: "var(--rm-ink-soft)", background: "var(--rm-card-alt)" }}>
                <i className="fa-regular fa-file-lines text-3xl mb-3 opacity-40"></i>
                <p className="rm-body text-sm font-medium">No files yet. Label 3 CSVs above, or use sample data.</p>
              </div>
            ) : (
              <div className="flex-1 space-y-4">
                {chosen.map((s) => (
                  <div key={s.id} className="file-card group hover:-translate-y-0.5 transition-all duration-200 animate-[fadeSlideIn_0.35s_ease-out]">
                    <div className="file-icon transition-transform duration-200 group-hover:scale-105"><i className={`${s.icon} opacity-90`}></i></div>
                    <div className="flex-1">
                      <div className="rm-heading-sm font-semibold text-sm">{s.name}</div>
                      <div className="rm-mono text-xs mt-1 font-medium" style={{ color: "var(--rm-ink-soft)" }}>
                        {s.file.name} &nbsp;•&nbsp; {humanSize(s.file.size)}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`rm-mono status-badge ${validClient(s.file) ? "" : "invalid"}`}>{validClient(s.file) ? "Valid" : "Not CSV"}</div>
                      <button onClick={() => removeFile(s.id)} className="p-1.5 rounded-md transition-colors duration-200" style={{ color: "var(--rm-ink-soft)" }}>
                        <i className="fa-regular fa-trash-can"></i>
                      </button>
                    </div>
                  </div>
                ))}
                {allThree && (
                  <div className="rounded-xl p-4 flex items-center text-sm animate-[fadeSlideIn_0.4s_ease-out]" style={{ background: "var(--rm-moss-wash)", border: "1px solid var(--rm-moss)" }}>
                    <i className="fa-regular fa-circle-check mr-3 text-xl" style={{ color: "var(--rm-moss)" }}></i>
                    <span className="rm-heading-sm font-medium mr-1" style={{ color: "var(--rm-ink)" }}>All files labeled.</span>
                    <span className="rm-body" style={{ color: "var(--rm-ink-soft)" }}>You can start reconciliation.</span>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* actions */}
        <div className="flex justify-center items-center gap-6 mb-8">
          <button onClick={runUpload} disabled={busy} className="rm-mono gradient-btn text-white px-10 py-3.5 rounded-lg font-medium flex items-center transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0" style={{ boxShadow: "0 8px 20px -8px rgba(31,42,26,0.4)" }}>
            {busy === "upload" ? (<><span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin mr-2.5" />Reconciling…</>) : (<>Reconcile now <i className="fa-solid fa-arrow-right ml-2.5 opacity-80"></i></>)}
          </button>
          <span className="rm-body text-sm font-medium" style={{ color: "var(--rm-ink-soft)" }}>or</span>
          <button onClick={runDemo} disabled={busy} className="rm-mono px-8 py-3.5 rounded-lg font-medium hover:-translate-y-0.5 active:translate-y-0 flex items-center transition-all duration-200 disabled:opacity-60 disabled:hover:translate-y-0" style={{ background: "var(--rm-card)", border: "1px solid var(--rm-ink)", color: "var(--rm-ink)", boxShadow: "0 1px 2px rgba(31,42,26,0.04), 0 8px 16px -10px rgba(31,42,26,0.2)" }}>
            <i className="fa-solid fa-cloud-arrow-up mr-2.5" style={{ color: "var(--rm-rust)" }}></i>
            {busy === "demo" ? "Running demo…" : "Try sample data (demo)"}
          </button>
        </div>
        <div className="text-center -mt-4 mb-8">
          <a href={SAMPLE_DATASET_URL} target="_blank" rel="noopener noreferrer" className="rm-mono text-xs font-medium underline underline-offset-2" style={{ color: "var(--rm-ink-soft)" }}>
            or download the sample CSVs from Google Drive to test locally →
          </a>
        </div>

        {/* validation error */}
        {error && (
          <div className="rounded-xl p-5 mb-6 relative animate-[fadeSlideIn_0.3s_ease-out]" style={{ background: "var(--rm-rust-wash)", border: "1px solid var(--rm-rust)" }}>
            <button onClick={() => setError(null)} className="absolute top-5 right-5 opacity-60 hover:opacity-100 transition-opacity duration-150" style={{ color: "var(--rm-rust-deep)" }}>
              <i className="fa-solid fa-xmark text-lg"></i>
            </button>
            <div className="flex items-start">
              <i className="fa-solid fa-triangle-exclamation mt-0.5 mr-4 text-lg" style={{ color: "var(--rm-rust-deep)" }}></i>
              <div className="flex-1">
                <h3 className="rm-label text-xs font-semibold mb-2" style={{ color: "var(--rm-rust-deep)" }}>{error.title}</h3>
                <ul className="rm-body text-sm space-y-1.5 list-disc ml-5" style={{ color: "var(--rm-ink)" }}>
                  {error.items.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
                <p className="rm-body text-xs mt-2.5" style={{ color: "var(--rm-ink-soft)" }}>
                  Tip: this usually means a file landed in the wrong slot. Use the labeled drop targets above to re-assign it, then try again.
                </p>
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
          const displaySteps = done ? full : [...shown, { ...(full[revealed] || {}), status: "running", ms: null }];
          const m = runResult.meta;
          return (
            <div className="rm-card-flat p-8 premium-shadow">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-500" style={{ background: "var(--rm-ink)", color: "var(--rm-card)" }}>
                    <i className={`fa-solid ${done ? "fa-circle-check" : "fa-microchip"}`}></i>
                  </div>
                  <div>
                    <div className="rm-heading-sm text-sm font-semibold flex items-center gap-2">
                      Reconciliation agent
                      {done ? (
                        <span className="rm-stamp rm-mono text-[10px] font-semibold" style={{ transform: "rotate(-6deg)", padding: "2px 10px" }}>Verified</span>
                      ) : (
                        <span className="rm-mono text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--rm-card-alt)", border: "1px solid var(--rm-line)", color: "var(--rm-ink-soft)" }}>Working</span>
                      )}
                    </div>
                    <div className="rm-body text-xs mt-0.5" style={{ color: "var(--rm-ink-soft)" }}>
                      {done ? `${m.settlement_active} records reconciled in ${m.elapsed_seconds}s · ${m.exceptions_total} exceptions` : "Autonomous: plan → match → fuzzy → triage → verify"}
                    </div>
                  </div>
                </div>
                {done && (
                  <button onClick={onGoDashboard} className="rm-mono gradient-btn text-white px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200">
                    View dashboard <i className="fa-solid fa-arrow-right"></i>
                  </button>
                )}
              </div>
              <AgentTrace trace={displaySteps} label="Live reconciliation trace" />
              {done && (
                <div className="mt-5 flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2 w-fit animate-[fadeSlideIn_0.4s_ease-out]" style={{ background: "var(--rm-moss-wash)", border: "1px solid var(--rm-moss)", color: "var(--rm-ink)" }}>
                  <i className="fa-solid fa-shield-halved" style={{ color: "var(--rm-moss)" }}></i>
                  <span className="rm-body">Every stage deterministic and audited — {runResult.decisions_logged} decisions logged.</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── explicit "which file is this?" ask — single ambiguous drop ── */}
      {askSingle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(31,42,26,0.45)" }} onClick={() => setAskSingle(null)}>
          <div className="rm-card-flat rm-panel-in p-7 w-full max-w-sm premium-shadow" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-1">
              <i className="fa-regular fa-file-lines text-lg" style={{ color: "var(--rm-rust)" }}></i>
              <h3 className="rm-heading-sm text-base font-semibold">Which file is this?</h3>
            </div>
            <p className="rm-mono text-xs mb-5 truncate" style={{ color: "var(--rm-ink-soft)" }}>{askSingle.file.name}</p>
            <div className="space-y-2">
              {SLOTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => confirmSingle(s.id)}
                  className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-all duration-150 hover:-translate-y-0.5"
                  style={{ background: "var(--rm-card-alt)", border: "1px solid var(--rm-line)" }}
                >
                  <i className={`${s.icon}`} style={{ color: "var(--rm-rust)" }}></i>
                  <span className="rm-heading-sm text-sm font-semibold flex-1">{s.name}</span>
                  {files[s.id] && <span className="rm-mono text-[10px]" style={{ color: "var(--rm-ink-soft)" }}>replaces current</span>}
                </button>
              ))}
            </div>
            <button onClick={() => setAskSingle(null)} className="rm-mono text-xs font-medium mt-4 w-full text-center" style={{ color: "var(--rm-ink-soft)" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── batch assignment panel — drop-3-at-once flow ── */}
      {assignPanelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(31,42,26,0.45)" }}>
          <div className="rm-card-flat rm-panel-in p-8 w-full max-w-2xl premium-shadow">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="rm-heading-sm text-lg font-semibold">Which file is which?</h3>
                <p className="rm-body text-sm mt-1" style={{ color: "var(--rm-ink-soft)" }}>
                  Drag each file onto its slot — or tap a slot, then tap a file.
                </p>
              </div>
              <button onClick={closeAssignPanel} className="transition-colors duration-150" style={{ color: "var(--rm-ink-soft)" }}>
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            {/* slot targets */}
            <div className="grid grid-cols-3 gap-3 my-6">
              {SLOTS.map((s) => {
                const filled = !!files[s.id];
                const isHover = assignHoverSlot === s.id;
                return (
                  <div
                    key={s.id}
                    onDragOver={(e) => { e.preventDefault(); setAssignHoverSlot(s.id); }}
                    onDragLeave={() => setAssignHoverSlot((cur) => (cur === s.id ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setAssignHoverSlot(null);
                      if (dragChipId) { assignChipToSlot(dragChipId, s.id); setDragChipId(null); }
                    }}
                    className={`rm-target flex flex-col items-center text-center p-4 min-h-[110px] justify-center ${isHover ? "hover" : ""} ${filled ? "filled" : ""} ${justAssigned === s.id ? "rm-assign-pulse" : ""}`}
                  >
                    <i className={`${s.icon} text-lg mb-2`} style={{ color: filled ? "var(--rm-moss)" : "var(--rm-rust)" }}></i>
                    <div className="rm-heading-sm text-[13px] font-semibold leading-tight">{s.name}</div>
                    {filled ? (
                      <div className="rm-mono text-[10px] mt-1 truncate max-w-full px-1" style={{ color: "var(--rm-ink-soft)" }}>{files[s.id].name}</div>
                    ) : (
                      <div className="rm-body text-[11px] mt-1" style={{ color: "var(--rm-ink-soft)" }}>drop here</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* pending files tray */}
            {assignChips.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px" style={{ background: "var(--rm-line)" }} />
                  <span className="rm-mono text-[10px]" style={{ color: "var(--rm-ink-soft)" }}>UNLABELED — {assignChips.length} LEFT</span>
                  <div className="flex-1 h-px" style={{ background: "var(--rm-line)" }} />
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {assignChips.map((chip) => (
                    <div
                      key={chip.id}
                      draggable
                      onDragStart={() => setDragChipId(chip.id)}
                      onDragEnd={() => setDragChipId(null)}
                      className={`rm-chip ${dragChipId === chip.id ? "dragging" : ""}`}
                    >
                      <i className="fa-solid fa-grip-vertical text-xs" style={{ color: "var(--rm-ink-soft)" }}></i>
                      <i className="fa-regular fa-file-lines text-sm" style={{ color: "var(--rm-rust)" }}></i>
                      <span className="rm-mono text-xs truncate max-w-[160px]">{chip.file.name}</span>
                      {/* click-to-assign fallback for touch / non-drag devices */}
                      <select
                        defaultValue=""
                        onChange={(e) => { if (e.target.value) assignChipToSlot(chip.id, e.target.value); }}
                        className="rm-mono text-[10px] rounded ml-1 px-1 py-0.5"
                        style={{ border: "1px solid var(--rm-line)", background: "var(--rm-card)", color: "var(--rm-ink-soft)" }}
                      >
                        <option value="" disabled>assign…</option>
                        {SLOTS.map((s) => <option key={s.id} value={s.id}>{s.short}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </>
            )}

            {assignChips.length === 0 && (
              <div className="rounded-lg p-3 flex items-center gap-2 text-sm mt-2" style={{ background: "var(--rm-moss-wash)", border: "1px solid var(--rm-moss)" }}>
                <i className="fa-regular fa-circle-check" style={{ color: "var(--rm-moss)" }}></i>
                <span className="rm-body" style={{ color: "var(--rm-ink)" }}>All set — closing…</span>
              </div>
            )}

            <div className="flex justify-end mt-6">
              <button
                onClick={closeAssignPanel}
                className="rm-mono gradient-btn text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
              >
                Done labeling
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}