import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";

/**
 * ExcelViewerCard
 * ------------------------------------------------------------------
 * Self-contained spreadsheet preview panel, styled to match the
 * ReconMint dashboard (white card, slate borders, custom-shadow).
 * Parses workbooks client-side with SheetJS (xlsx).
 *
 * Props:
 *  - title           string   card heading (default "Source Files")
 *  - fileUrl         string   optional URL to auto-load a workbook
 *  - fileName        string   display name for the auto-loaded file
 *  - allowUpload     bool     show the "Upload" button (default true)
 *  - height          number   viewer height in px (default 420)
 * ------------------------------------------------------------------
 */

const ZOOM_STEPS = [75, 90, 100, 110, 125, 150];

function readWorkbookFromArrayBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  return wb;
}

function sheetToGrid(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });
  return rows;
}

function colLabel(n) {
  let s = "";
  let num = n + 1;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

function EmptyPanel({ onUploadClick, allowUpload, loading, error }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10">
      {loading ? (
        <>
          <div className="w-8 h-8 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
          <p className="text-sm text-slate-500">Loading workbook…</p>
        </>
      ) : error ? (
        <>
          <i className="fa-solid fa-triangle-exclamation text-2xl text-red-400 mb-3"></i>
          <p className="text-sm font-medium text-slate-600 mb-1">Couldn't load this file</p>
          <p className="text-xs text-slate-400 max-w-xs">{error}</p>
        </>
      ) : (
        <>
          <i className="fa-solid fa-file-excel text-3xl text-emerald-400/70 mb-3"></i>
          <p className="text-sm font-medium text-slate-600 mb-1">No file loaded</p>
          <p className="text-xs text-slate-400 mb-5 max-w-xs">
            Preview the bank statement or ledger behind this run — upload an XLSX / CSV file.
          </p>
        </>
      )}
      {allowUpload && (
        <button
          onClick={onUploadClick}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          <i className="fa-solid fa-upload text-slate-400"></i>
          Upload file
        </button>
      )}
    </div>
  );
}

export default function ExcelViewerCard({
  title = "Source Files",
  fileUrl,
  fileName,
  allowUpload = true,
  height = 420,
}) {
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);

  const [workbook, setWorkbook] = useState(null);
  const [activeFileName, setActiveFileName] = useState(fileName || "");
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zoomIndex, setZoomIndex] = useState(2); // 100%
  const [search, setSearch] = useState("");
  const [rawBuffer, setRawBuffer] = useState(null);

  const zoom = ZOOM_STEPS[zoomIndex];

  const loadFromArrayBuffer = useCallback((buffer, name) => {
    setLoading(true);
    setError(null);
    try {
      const wb = readWorkbookFromArrayBuffer(buffer);
      setWorkbook(wb);
      setActiveFileName(name);
      setActiveSheetIndex(0);
      setRawBuffer(buffer);
    } catch (e) {
      setError(e?.message || "This file could not be parsed as a spreadsheet.");
      setWorkbook(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(fileUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch file (${res.status})`);
        return res.arrayBuffer();
      })
      .then((buffer) => {
        if (cancelled) return;
        loadFromArrayBuffer(buffer, fileName || fileUrl.split("/").pop() || "workbook.xlsx");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || "Unable to fetch file.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const buffer = await file.arrayBuffer();
    loadFromArrayBuffer(buffer, file.name);
  };

  const handleDownload = () => {
    if (!rawBuffer || !activeFileName) return;
    const blob = new Blob([rawBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const sheetNames = workbook?.SheetNames || [];
  const activeSheet = workbook ? workbook.Sheets[sheetNames[activeSheetIndex]] : null;

  const grid = useMemo(() => {
    if (!activeSheet) return [];
    return sheetToGrid(activeSheet);
  }, [activeSheet]);

  const colCount = useMemo(() => {
    return grid.reduce((max, row) => Math.max(max, row.length), 0);
  }, [grid]);

  const searchLower = search.trim().toLowerCase();
  const matchCount = useMemo(() => {
    if (!searchLower) return 0;
    let count = 0;
    for (const row of grid) {
      for (const cell of row) {
        if (String(cell).toLowerCase().includes(searchLower)) count += 1;
      }
    }
    return count;
  }, [grid, searchLower]);

  const cellMatches = (val) =>
    searchLower && String(val).toLowerCase().includes(searchLower);

  return (
    <div className="bg-white rounded-xl border border-slate-200 custom-shadow flex flex-col overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <i className="fa-solid fa-file-excel"></i>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">{title}</h2>
            {activeFileName ? (
              <p className="text-xs text-slate-400 truncate max-w-[220px]">{activeFileName}</p>
            ) : (
              <p className="text-xs text-slate-400">No file loaded</p>
            )}
          </div>
        </div>

        {workbook && (
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative hidden sm:block">
              <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sheet"
                className="w-36 pl-7 pr-2 py-1.5 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300 transition-colors"
              />
            </div>
            {searchLower && (
              <span className="text-[11px] text-slate-400 hidden sm:inline">{matchCount} match{matchCount !== 1 ? "es" : ""}</span>
            )}

            <div className="flex items-center gap-0.5 border border-slate-200 rounded-md overflow-hidden">
              <button
                onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
                disabled={zoomIndex === 0}
                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white"
                aria-label="Zoom out"
              >
                <i className="fa-solid fa-minus text-[10px]"></i>
              </button>
              <span className="text-[11px] text-slate-500 w-9 text-center select-none">{zoom}%</span>
              <button
                onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
                disabled={zoomIndex === ZOOM_STEPS.length - 1}
                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white"
                aria-label="Zoom in"
              >
                <i className="fa-solid fa-plus text-[10px]"></i>
              </button>
            </div>

            <button
              onClick={handleDownload}
              className="w-7 h-7 flex items-center justify-center text-slate-500 border border-slate-200 rounded-md hover:bg-slate-50"
              aria-label="Download"
              title="Download original file"
            >
              <i className="fa-solid fa-download text-xs"></i>
            </button>

            {allowUpload && (
              <button
                onClick={handleUploadClick}
                className="w-7 h-7 flex items-center justify-center text-slate-500 border border-slate-200 rounded-md hover:bg-slate-50"
                aria-label="Upload new file"
                title="Upload a different file"
              >
                <i className="fa-solid fa-upload text-xs"></i>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {!workbook ? (
        <div style={{ height }} className="flex flex-col">
          <EmptyPanel
            onUploadClick={handleUploadClick}
            allowUpload={allowUpload}
            loading={loading}
            error={error}
          />
        </div>
      ) : (
        <>
          <div
            ref={containerRef}
            style={{ height }}
            className="overflow-auto bg-slate-50/40"
          >
            <table
              className="border-collapse"
              style={{ fontSize: `${11 * (zoom / 100)}px` }}
            >
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-20 bg-slate-100 border border-slate-200 text-slate-400 font-medium w-10 min-w-[40px]"></th>
                  {Array.from({ length: colCount }).map((_, c) => (
                    <th
                      key={c}
                      className="sticky top-0 z-10 bg-slate-100 border border-slate-200 text-slate-500 font-medium px-2 py-1 whitespace-nowrap min-w-[90px]"
                    >
                      {colLabel(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((row, r) => (
                  <tr key={r}>
                    <td className="sticky left-0 z-10 bg-slate-100 border border-slate-200 text-slate-400 text-center font-medium px-2">
                      {r + 1}
                    </td>
                    {Array.from({ length: colCount }).map((_, c) => {
                      const val = row[c] ?? "";
                      const isMatch = cellMatches(val);
                      return (
                        <td
                          key={c}
                          className={`border border-slate-200 px-2 py-1 whitespace-nowrap text-slate-700 bg-white ${
                            isMatch ? "bg-amber-100/70 ring-1 ring-inset ring-amber-300" : ""
                          }`}
                        >
                          {String(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {grid.length === 0 && (
                  <tr>
                    <td colSpan={colCount + 1} className="text-center text-slate-400 py-8 text-xs">
                      This sheet is empty.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Sheet tabs */}
          {sheetNames.length > 1 && (
            <div className="flex items-center gap-1 px-3 py-2 border-t border-slate-100 bg-slate-50/60 overflow-x-auto">
              {sheetNames.map((name, i) => (
                <button
                  key={name}
                  onClick={() => setActiveSheetIndex(i)}
                  className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    i === activeSheetIndex
                      ? "bg-white text-slate-800 border border-slate-200 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
