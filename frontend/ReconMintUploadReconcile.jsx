import React, { useState } from "react";

// ============================================================
// ReconMint — Upload & Reconcile — single-file React (JSX)
// Requires:
//   1. Tailwind CSS (original used the CDN build with the
//      `forms` and `container-queries` plugins)
//   2. Font Awesome 6 (CDN link, see USAGE note at bottom)
// ============================================================

const CUSTOM_STYLES = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
    background-color: #fcfcfc;
    color: #1e293b;
  }
  .step-line {
    flex: 1;
    height: 1px;
    background-color: #cbd5e1;
    margin: 0 16px;
  }
  .step-line.active {
    background-color: #0f172a;
  }
  .sidebar-item {
    display: flex;
    align-items: center;
    padding: 0.875rem 1.25rem;
    color: #64748b;
    font-weight: 500;
    border-radius: 0.75rem;
    margin-bottom: 0.25rem;
    transition: all 0.2s ease;
    cursor: pointer;
  }
  .sidebar-item:hover {
    background-color: #f8fafc;
    color: #334155;
  }
  .sidebar-item.active {
    background-color: #f1f5f9;
    color: #0f172a;
    font-weight: 600;
  }
  .sidebar-item i {
    width: 1.5rem;
    margin-right: 0.75rem;
    text-align: center;
    font-size: 1.1rem;
  }
  .badge {
    font-size: 0.6rem;
    padding: 0.15rem 0.5rem;
    border-radius: 9999px;
    background-color: transparent;
    border: 1px solid #e2e8f0;
    color: #94a3b8;
    margin-left: auto;
    text-transform: uppercase;
    font-weight: 500;
    letter-spacing: 0.05em;
  }
  .file-card {
    border: 1px solid #f1f5f9;
    border-radius: 1rem;
    padding: 1.25rem;
    display: flex;
    align-items: center;
    background-color: white;
    margin-bottom: 1rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.01);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .file-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.03), 0 4px 6px -2px rgba(0, 0, 0, 0.01);
  }
  .file-icon {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 1.25rem;
    font-size: 1.25rem;
  }
  .file-icon.blue { background-color: #f8fafc; color: #3b82f6; border: 1px solid #f1f5f9; }
  .file-icon.green { background-color: #f8fafc; color: #10b981; border: 1px solid #f1f5f9; }
  .file-icon.purple { background-color: #f8fafc; color: #8b5cf6; border: 1px solid #f1f5f9; }

  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    background-color: #ecfdf5;
    color: #059669;
    border: 1px solid #d1fae5;
    display: flex;
    align-items: center;
  }

  .progress-track {
    height: 4px;
    background-color: #e2e8f0;
    border-radius: 2px;
    position: relative;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
    width: 100%;
  }
  .progress-fill {
    height: 100%;
    background-color: #0f172a;
    border-radius: 2px;
  }

  .premium-shadow {
      box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05);
  }
  .inset-shadow {
      box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.03);
  }
  .gradient-btn {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  }
  .gradient-btn:hover {
      background: linear-gradient(135deg, #334155 0%, #1e293b 100%);
  }
`;

// ------------------------------------------------------------
// Mock data — copied 1:1 from the original static HTML markup.
// ------------------------------------------------------------
const SIDEBAR_ITEMS = [
  { id: "upload", label: "Upload", icon: "fa-solid fa-arrow-up-from-bracket", active: true },
  { id: "dashboard", label: "Dashboard", icon: "fa-solid fa-border-all", active: false },
  { id: "exceptions", label: "Exceptions", icon: "fa-solid fa-circle-exclamation", active: false },
  { id: "reports", label: "Reports", icon: "fa-regular fa-file-lines", active: false, badge: "Soon" },
  { id: "data-sources", label: "Data Sources", icon: "fa-solid fa-database", active: false, badge: "Soon" },
  { id: "reconciliations", label: "Reconciliations", icon: "fa-solid fa-arrows-rotate", active: false, badge: "Soon" },
  { id: "settings", label: "Settings", icon: "fa-solid fa-gear", active: false, badge: "Soon" },
];

const WORKSPACE = { name: "FinNext Pvt. Ltd.", label: "Workspace" };

const PROGRESS_STEPS = [
  { id: 1, title: "Upload", subtitle: "Add your files", state: "current" },
  { id: 2, title: "Validate", subtitle: "Auto-detect & verify", state: "upcoming" },
  { id: 3, title: "Reconcile", subtitle: "Run matching engine", state: "upcoming" },
];

const DETECTED_FILES = [
  {
    id: "orders",
    icon: "fa-solid fa-cart-shopping",
    color: "blue",
    name: "Orders",
    meta: "orders_may.csv  •  12,482 rows  •  6.2 MB",
  },
  {
    id: "settlement",
    icon: "fa-regular fa-file-lines",
    color: "green",
    name: "Settlement Report",
    meta: "settlement_may.csv  •  12,479 rows  •  8.1 MB",
  },
  {
    id: "bank",
    icon: "fa-solid fa-building-columns",
    color: "purple",
    name: "Bank Statement",
    meta: "bank_may.csv  •  12,481 rows  •  7.4 MB",
  },
];

const PIPELINE_STEPS = [
  { id: "categorize", icon: "fa-solid fa-folder-tree", label: "Auto-categorize files" },
  { id: "validate", icon: "fa-solid fa-spell-check", label: "Validate format & columns" },
  { id: "quality", icon: "fa-solid fa-wand-magic-sparkles", label: "Smart data quality checks" },
  { id: "run", icon: "fa-solid fa-bolt", label: "Run reconciliation" },
];

const VALIDATION_ERROR = {
  title: "Validation Errors",
  tag: "(example)",
  errors: [{ file: "Bank Statement", message: "Missing required column 'utr'." }],
  hint: "Please upload correct CSV with columns: utr, credit_amount, credit_date, narration",
};

const RECONCILE_PROGRESS = {
  heading: "Reconciling Your Files",
  subheading: "Step 3 of 3 • Running matching engine...",
  stages: [
    { id: "ingest", label: "Ingesting files", detail: "512/512 rows", state: "done" },
    { id: "validate", label: "Validating & preparing", detail: "512/512 rows", state: "done" },
    { id: "reconcile", label: "Reconciling", detail: "Exact match in progress...", state: "active" },
  ],
  elapsed: "00:00:03",
  note: "You'll be redirected to the dashboard when it's done.",
};

const SUCCESS_MESSAGE = {
  title: "Success",
  message: "Reconciliation completed. 512 records processed in 0.16s.",
};

// ------------------------------------------------------------
// Sidebar
// ------------------------------------------------------------
function Sidebar({ items, workspace }) {
  return (
    <aside className="w-72 bg-white border-r border-slate-100 flex flex-col justify-between h-full overflow-y-auto">
      <div>
        <div className="p-8 flex items-center">
          <i className="fa-solid fa-layer-group text-slate-800 text-2xl mr-3"></i>
          <span className="text-xl font-semibold text-slate-900 tracking-tight">ReconMint</span>
        </div>
        <nav className="px-6 mt-4">
          {items.map((item) => (
            <div
              key={item.id}
              className={`sidebar-item ${item.active ? "active" : ""}`}
            >
              <i className={item.icon}></i>
              <span>{item.label}</span>
              {item.badge && <span className="badge">{item.badge}</span>}
            </div>
          ))}
        </nav>
      </div>

      <div className="p-6 border-t border-slate-100">
        <div className="flex items-center p-3 mb-4 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors">
          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center mr-3 text-slate-500 border border-slate-200">
            <i className="fa-regular fa-user text-sm"></i>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800">{workspace.name}</div>
            <div className="text-xs text-slate-500 mt-0.5">{workspace.label}</div>
          </div>
          <i className="fa-solid fa-chevron-down text-slate-400 text-xs"></i>
        </div>
        <div className="sidebar-item !mb-0 !text-slate-500 hover:!text-slate-800">
          <i className="fa-regular fa-circle-question"></i>
          <span>Help &amp; Support</span>
        </div>
        <div className="sidebar-item !mb-0 !text-slate-500 hover:!text-slate-800">
          <i className="fa-solid fa-chevron-left"></i>
          <span>Collapse</span>
        </div>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------
// Header
// ------------------------------------------------------------
function Header() {
  return (
    <header className="flex justify-between items-start mb-12">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900 mb-2 tracking-tight">
          Upload &amp; Reconcile
        </h1>
        <p className="text-slate-500 text-sm font-medium">
          Bring your sources. We'll detect, validate and reconcile.
        </p>
      </div>
      <div className="flex gap-4">
        <button className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center shadow-sm transition-all hover:shadow-md">
          <i className="fa-solid fa-wand-magic-sparkles mr-2 text-slate-400"></i> Try sample data
        </button>
        <button className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center shadow-sm transition-all hover:shadow-md">
          <i className="fa-regular fa-circle-question mr-2 text-slate-400"></i> How it works
        </button>
      </div>
    </header>
  );
}

// ------------------------------------------------------------
// Progress Tracker
// ------------------------------------------------------------
function ProgressTracker({ steps }) {
  return (
    <div className="flex items-center justify-center mb-16 max-w-2xl mx-auto">
      {steps.map((step, idx) => (
        <React.Fragment key={step.id}>
          {idx > 0 && (
            <div
              className={`step-line ${
                steps[idx - 1].state !== "upcoming" ? "active" : ""
              }`}
            ></div>
          )}
          <div className={`flex items-center ${step.state === "upcoming" ? "opacity-60" : ""}`}>
            <div
              className={
                step.state === "current"
                  ? "w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-medium text-sm shadow-sm"
                  : "w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-400 flex items-center justify-center font-medium text-sm"
              }
            >
              {step.id}
            </div>
            <div className={`ml-4 ${step.state === "upcoming" && step.id !== 2 ? "" : ""}`}>
              <div className="text-sm font-semibold text-slate-900">{step.title}</div>
              <div className="text-xs text-slate-500 mt-0.5">{step.subtitle}</div>
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ------------------------------------------------------------
// File Intake (drop zone)
// ------------------------------------------------------------
function FileIntake() {
  return (
    <section className="col-span-1 bg-white p-8 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-full premium-shadow">
      <h2 className="text-xs font-semibold text-slate-400 tracking-wider mb-2 uppercase">
        File Intake
      </h2>
      <p className="text-sm text-slate-500 mb-6">Upload any 3 CSV files to start.</p>

      <div className="flex-1 rounded-2xl flex flex-col items-center justify-center p-8 bg-slate-50 inset-shadow border border-slate-100 transition-colors group hover:bg-slate-100/50 cursor-pointer">
        <div className="w-16 h-16 mb-5 text-emerald-500 flex items-center justify-center bg-white rounded-xl border border-slate-100 shadow-sm relative group-hover:scale-105 transition-transform duration-300">
          <i className="fa-regular fa-folder-open text-2xl"></i>
          <div className="absolute -right-2 -top-2 bg-emerald-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-sm">
            <i className="fa-solid fa-plus"></i>
          </div>
        </div>
        <div className="text-base font-semibold text-slate-800 mb-1">Drop files here</div>
        <div className="text-sm text-slate-500 mb-5">
          or <span className="text-slate-800 font-medium cursor-pointer hover:underline">browse</span> from your device
        </div>
        <div className="text-xs text-slate-400 mb-8 font-medium">CSV only (max 50MB each)</div>
        <button className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium shadow-sm flex items-center hover:bg-slate-50 hover:shadow transition-all">
          <i className="fa-solid fa-cloud-arrow-up mr-2 text-slate-400"></i> Choose files
        </button>
      </div>

      <div className="mt-6 flex items-start text-xs text-slate-400 font-medium">
        <i className="fa-solid fa-shield-halved mt-0.5 mr-2 opacity-70"></i>
        <p>Files are processed locally on your machine. Nothing is stored or sent anywhere.</p>
      </div>
    </section>
  );
}

// ------------------------------------------------------------
// Detected Files
// ------------------------------------------------------------
function FileCard({ file, onRemove }) {
  return (
    <div className="file-card">
      <div className={`file-icon ${file.color}`}>
        <i className={`${file.icon} opacity-80`}></i>
      </div>
      <div className="flex-1">
        <div className="font-semibold text-slate-800 text-sm">{file.name}</div>
        <div className="text-xs text-slate-500 mt-1 font-medium">{file.meta}</div>
      </div>
      <div className="flex items-center gap-4">
        <div className="status-badge">Valid</div>
        <i className="fa-solid fa-circle-check text-emerald-500 text-xl"></i>
        <button
          onClick={() => onRemove(file.id)}
          className="text-slate-300 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-50"
        >
          <i className="fa-regular fa-trash-can"></i>
        </button>
      </div>
    </div>
  );
}

function DetectedFiles({ files, onRemove, onRescan }) {
  return (
    <section className="col-span-1 flex flex-col">
      <div className="flex justify-between items-center mb-6 px-2">
        <h2 className="text-xs font-semibold text-slate-400 tracking-wider uppercase">
          Detected Files{" "}
          <span className="normal-case font-medium text-slate-400 ml-1">
            ({files.length} of 3)
          </span>
        </h2>
        <button
          onClick={onRescan}
          className="text-xs text-slate-500 font-medium flex items-center hover:text-slate-800 transition-colors"
        >
          <i className="fa-solid fa-rotate-right mr-1.5"></i> Re-scan
        </button>
      </div>

      <div className="flex-1 space-y-4">
        {files.map((file) => (
          <FileCard key={file.id} file={file} onRemove={onRemove} />
        ))}
      </div>

      {files.length === 3 && (
        <div className="mt-6 bg-[#f0fdf4] border border-[#d1fae5] rounded-xl p-4 flex items-center text-sm text-[#065f46]">
          <i className="fa-regular fa-circle-check text-emerald-600 mr-3 text-xl"></i>
          <span className="font-medium mr-1 text-[#047857]">All files look good.</span>{" "}
          <span className="opacity-80">You can start reconciliation.</span>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------
// Pipeline strip ("Auto-categorize files" ... "Run reconciliation")
// ------------------------------------------------------------
function PipelineStrip({ steps }) {
  return (
    <div className="border-t border-b border-slate-100 py-5 mb-10">
      <div className="flex justify-between items-center text-xs text-slate-500 font-medium px-6 max-w-4xl mx-auto">
        {steps.map((step, idx) => (
          <React.Fragment key={step.id}>
            <div className="flex items-center">
              <i className={`${step.icon} mr-2.5 text-slate-400`}></i> {step.label}
            </div>
            {idx < steps.length - 1 && <div className="h-4 w-px bg-slate-200"></div>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Action buttons (Reconcile now / Try sample data)
// ------------------------------------------------------------
function ActionButtons({ onReconcile, onTrySample }) {
  return (
    <div className="flex justify-center items-center gap-6 mb-12">
      <button
        onClick={onReconcile}
        className="gradient-btn text-white px-10 py-3.5 rounded-xl font-medium shadow-lg shadow-slate-900/20 flex items-center transition-all hover:-translate-y-0.5"
      >
        Reconcile now <i className="fa-solid fa-arrow-right ml-2.5 opacity-80"></i>
      </button>
      <span className="text-slate-400 text-sm font-medium">or</span>
      <button
        onClick={onTrySample}
        className="bg-white border border-slate-200 text-slate-700 px-8 py-3.5 rounded-xl font-medium shadow-sm hover:bg-slate-50 flex items-center transition-all hover:shadow"
      >
        <i className="fa-solid fa-cloud-arrow-up mr-2.5 text-slate-400"></i> Try sample data (demo)
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// Validation error banner
// ------------------------------------------------------------
function ValidationErrorBanner({ data, onDismiss }) {
  return (
    <div className="bg-[#fff1f2] border border-[#ffe4e6] rounded-2xl p-5 mb-6 relative">
      <button
        onClick={onDismiss}
        className="absolute top-5 right-5 text-[#f43f5e] hover:text-[#e11d48] opacity-60 hover:opacity-100 transition-opacity"
      >
        <i className="fa-solid fa-xmark text-lg"></i>
      </button>
      <div className="flex items-start">
        <i className="fa-solid fa-triangle-exclamation text-[#f43f5e] mt-0.5 mr-4 text-lg"></i>
        <div className="flex-1">
          <h3 className="text-xs font-semibold text-[#e11d48] uppercase tracking-wider mb-2">
            {data.title}{" "}
            <span className="font-medium normal-case text-[#fb7185] ml-1">{data.tag}</span>
          </h3>
          <ul className="text-sm text-[#881337] space-y-1.5 list-disc ml-5 mb-4">
            {data.errors.map((err, idx) => (
              <li key={idx}>
                <span className="font-semibold">{err.file}:</span> {err.message}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[#be123c] opacity-80 mb-4 font-medium">{data.hint}</p>
        </div>
        <button className="bg-white border border-[#ffe4e6] text-[#e11d48] px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm hover:bg-[#fff1f2] transition-colors mt-2">
          Fix and re-upload
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Reconciling progress panel
// ------------------------------------------------------------
function ReconcilingProgress({ data, onCancel }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-8 mb-6 premium-shadow">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {data.heading}
      </h3>
      <p className="text-sm text-slate-400 mb-8 font-medium">{data.subheading}</p>

      <div className="flex items-center justify-between mb-10 max-w-3xl mx-auto">
        {data.stages.map((stage, idx) => (
          <React.Fragment key={stage.id}>
            <div className="flex flex-col items-center w-1/3">
              {stage.state === "active" ? (
                <div className="w-10 h-10 rounded-full border-2 border-slate-900 border-t-transparent animate-spin flex items-center justify-center mb-3 bg-white z-10 shadow-sm"></div>
              ) : (
                <div className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-900 mb-3 bg-slate-50 z-10">
                  <i className="fa-solid fa-check text-sm"></i>
                </div>
              )}
              <div className="text-sm font-semibold text-slate-800">{stage.label}</div>
              <div className="text-xs text-slate-500 mt-1">{stage.detail}</div>
            </div>
            {idx < data.stages.length - 1 &&
              (data.stages[idx + 1].state === "active" ? (
                <div className="flex-1 h-px bg-slate-200 relative -ml-20 -mr-20 mt-[-3rem] z-0">
                  <div className="absolute h-full bg-slate-900 w-1/2 opacity-20"></div>
                </div>
              ) : (
                <div className="flex-1 h-px bg-slate-900 -ml-20 -mr-20 mt-[-3rem] z-0 opacity-20"></div>
              ))}
          </React.Fragment>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-6">
        <div className="flex gap-10 items-center">
          <div>
            <div className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wider">
              Elapsed time
            </div>
            <div className="text-xl font-mono font-medium text-slate-800 tracking-tight">
              {data.elapsed}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="bg-white border border-slate-200 text-slate-600 px-5 py-2 rounded-xl text-sm font-medium shadow-sm hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
        <div className="text-sm text-slate-500 text-right max-w-xs font-medium">{data.note}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Success banner
// ------------------------------------------------------------
function SuccessBanner({ data, onDismiss }) {
  return (
    <div className="bg-[#f0fdf4] border border-[#d1fae5] rounded-xl p-4 flex items-center justify-between text-sm text-[#065f46]">
      <div className="flex items-center">
        <i className="fa-regular fa-circle-check text-emerald-600 mr-3 text-xl"></i>
        <span className="font-semibold mr-1.5 text-[#047857]">{data.title}</span>{" "}
        <span className="opacity-90">{data.message}</span>
      </div>
      <button
        onClick={onDismiss}
        className="text-emerald-600/50 hover:text-emerald-600 transition-colors"
      >
        <i className="fa-solid fa-xmark text-lg"></i>
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// Root component
// ------------------------------------------------------------
export default function ReconMintUploadReconcile() {
  const [files, setFiles] = useState(DETECTED_FILES);
  const [showValidationError, setShowValidationError] = useState(true);
  const [showReconcilingProgress, setShowReconcilingProgress] = useState(true);
  const [showSuccess, setShowSuccess] = useState(true);

  const handleRemoveFile = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleRescan = () => {
    setFiles(DETECTED_FILES);
  };

  const handleReconcile = () => {
    // TODO: kick off the reconciliation run, e.g. POST /runs
    console.log("Reconcile now clicked");
  };

  const handleTrySample = () => {
    // TODO: load sample dataset, e.g. POST /runs/sample
    console.log("Try sample data clicked");
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CUSTOM_STYLES }} />
      <div className="h-screen flex overflow-hidden">
        <Sidebar items={SIDEBAR_ITEMS} workspace={WORKSPACE} />

        <main className="flex-1 overflow-y-auto bg-[#fcfcfc]">
          <div className="max-w-6xl mx-auto p-10 lg:p-12">
            <Header />

            <ProgressTracker steps={PROGRESS_STEPS} />

            <div className="grid grid-cols-2 gap-8 mb-12">
              <FileIntake />
              <DetectedFiles files={files} onRemove={handleRemoveFile} onRescan={handleRescan} />
            </div>

            <PipelineStrip steps={PIPELINE_STEPS} />

            <ActionButtons onReconcile={handleReconcile} onTrySample={handleTrySample} />

            {/* Alerts & Progress States (Examples) */}
            {showValidationError && (
              <ValidationErrorBanner
                data={VALIDATION_ERROR}
                onDismiss={() => setShowValidationError(false)}
              />
            )}

            {showReconcilingProgress && (
              <ReconcilingProgress
                data={RECONCILE_PROGRESS}
                onCancel={() => setShowReconcilingProgress(false)}
              />
            )}

            {showSuccess && (
              <SuccessBanner data={SUCCESS_MESSAGE} onDismiss={() => setShowSuccess(false)} />
            )}
          </div>
        </main>
      </div>
    </>
  );
}

// ------------------------------------------------------------
// USAGE
// ------------------------------------------------------------
// 1. Ensure Tailwind CSS is available in your app (e.g. via the
//    CDN script the original page used:
//    <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
//    or a proper Tailwind build step).
// 2. Ensure Font Awesome 6 is loaded, e.g. in your HTML <head>:
//    <link rel="stylesheet"
//      href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" />
// 3. Import and render:
//    import ReconMintUploadReconcile from "./ReconMintUploadReconcile";
//    export default function App() { return <ReconMintUploadReconcile />; }
//
// NOTE: The "Validation Errors", "Reconciling Your Files", and
// "Success" panels were static example/demo states in the source
// HTML (all rendered simultaneously to showcase each state). They're
// preserved here as dismissible panels (via local useState) driven
// by the same mock data, rather than invented new behavior — wire
// them to your real upload/reconcile flow's state as needed.
