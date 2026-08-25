import React, { useState, useEffect } from "react";
import ExcelViewerCard from "./ExcelViewerCard.jsx";
import { sourceFileUrl } from "../api.js";

// Tabbed source-file preview: switch between the three CSVs behind the run and view raw rows
// (the settlement report, the bank statement, the order ledger) — useful for eyeballing a
// discrepancy against the actual data the agent reconciled.
//
// Focus-target props let a caller (e.g. a discrepancy row in another card) jump straight to
// the exact record: pass `focusSheet` to auto-switch tabs, and `focusRow`/`focusColumn` to
// scroll to and highlight the matching cell inside ExcelViewerCard. Bump `focusToken` (e.g.
// with Date.now() or an incrementing counter) to re-trigger the jump even when the target
// row/column hasn't changed.
const TABS = [
  { id: "settlement", label: "Settlement report" },
  { id: "bank", label: "Bank statement" },
  { id: "orders", label: "Order ledger" },
];

export default function SourceFilesCard({
  height = 420,
  isDemo = true,
  focusSheet = null,
  focusRow = null,
  focusColumn = null,
  focusToken = null,
}) {
  const [active, setActive] = useState(focusSheet || "settlement");

  // If a caller points us at a different sheet, switch tabs to match.
  useEffect(() => {
    if (focusSheet && TABS.some((t) => t.id === focusSheet)) {
      setActive(focusSheet);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSheet, focusToken]);

  if (!isDemo) {
    // Uploaded runs: files live only in the browser and aren't persisted server-side.
    return (
      <ExcelViewerCard
        title="Source Files"
        height={height}
        focusRow={focusRow}
        focusColumn={focusColumn}
        focusToken={focusToken}
      />
    );
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
        // Deliberately NOT keyed on `active` anymore — remounting on every tab switch would
        // drop the focus/highlight state. ExcelViewerCard already resets its own view when
        // `fileUrl` changes internally.
        title="Source Files"
        fileUrl={sourceFileUrl(active)}
        fileName={`${active}.csv`}
        allowUpload={false}
        height={height}
        focusRow={active === focusSheet ? focusRow : null}
        focusColumn={active === focusSheet ? focusColumn : null}
        focusToken={focusToken}
      />
    </div>
  );
}