import React, { useState } from "react";
import ExcelViewerCard from "./ExcelViewerCard.jsx";
import { sourceFileUrl } from "../api.js";

// Tabbed source-file preview: switch between the three CSVs behind the run and view raw rows
// (the settlement report, the bank statement, the order ledger) — useful for eyeballing a
// discrepancy against the actual data the agent reconciled.
const TABS = [
  { id: "settlement", label: "Settlement report" },
  { id: "bank", label: "Bank statement" },
  { id: "orders", label: "Order ledger" },
];

export default function SourceFilesCard({ height = 420, isDemo = true }) {
  const [active, setActive] = useState("settlement");

  if (!isDemo) {
    // Uploaded runs: files live only in the browser and aren't persisted server-side.
    return <ExcelViewerCard title="Source Files" height={height} />;
  }

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
        key={active}
        title="Source Files"
        fileUrl={sourceFileUrl(active)}
        fileName={`${active}.csv`}
        allowUpload={false}
        height={height}
      />
    </div>
  );
}
