import React, { useState, useEffect } from "react";
import ExcelViewerCard from "./ExcelViewerCard.jsx";
import { sourceFileUrl, runSourceFileUrl } from "../api.js";

// Tabbed source-file preview. For any run (uploaded or demo), the three source files are
// served under /runs/<run_id>/source/<name> so callers can jump straight to the exact row
// that produced an exception (pass focusSheet + focusRowId + focusColumn).
const TABS = [
  { id: "settlement", label: "Settlement report" },
  { id: "bank", label: "Bank statement" },
  { id: "orders", label: "Order ledger" },
];

export default function SourceFilesCard({
  height = 420,
  isDemo = true,
  runId = null,
  focusSheet = null,
  focusRow = null,
  focusRowId = null,
  focusColumn = null,
  focusToken = null,
}) {
  const [active, setActive] = useState(focusSheet || "settlement");

  useEffect(() => {
    if (focusSheet && TABS.some((t) => t.id === focusSheet)) {
      setActive(focusSheet);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSheet, focusToken]);

  const urlFor = (name) => (runId ? runSourceFileUrl(runId, name) : sourceFileUrl(name));

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              active === t.id
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ExcelViewerCard
        title="Source Files"
        fileUrl={urlFor(active)}
        fileName={`${active}.csv`}
        allowUpload={false}
        height={height}
        focusRow={active === focusSheet ? focusRow : null}
        focusRowId={active === focusSheet ? focusRowId : null}
        focusColumn={active === focusSheet ? focusColumn : null}
        focusToken={focusToken}
      />
    </div>
  );
}
