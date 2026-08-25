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
 *  - focusRow        number   1-based row number to scroll to + highlight
 *  - focusColumn     string|number  column letter ("C") or 0-based index to highlight
 *  - focusToken      any      change this value to re-trigger the focus jump/pulse
 *                              even if focusRow/focusColumn are unchanged (e.g. clicking
 *                              the same cell reference twice in a row)
 *  - onFocusHandled  fn       optional callback fired once the jump/pulse has run
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

// Accepts "C", "c", or a numeric/string index and returns a 0-based column index.
function resolveColumnIndex(focusColumn) {
  if (focusColumn === null || focusColumn === undefined || focusColumn === "") return null;
  if (typeof focusColumn === "number") return focusColumn;
  const s = String(focusColumn).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const letters = s.toUpperCase().replace(/[^A-Z]/g, "");
  if (!letters) return null;
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
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
  focusRow = null,
  focusColumn = null,
  focusToken = null,
  onFocusHandled,
}) {
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  const cellRefs = useRef(new Map());

  const [workbook, setWorkbook] = useState(null);
  const [activeFileName, setActiveFileName] = useState(fileName || "");
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zoomIndex, setZoomIndex] = useState(2); // 100%
  const [search, setSearch] = useState("");
  const [rawBuffer, setRawBuffer] = useState(null);

  // Selection state: the cell the user clicked, or the one we jumped to via focusRow/focusColumn.
  const [selected, setSelected] = useState(null); // { row, col } — row is 0-based data row
  const [pulseKey, setPulseKey] = useState(0); // bump to replay the pulse animation
  const [hoveredCell, setHoveredCell] = useState(null); // { row, col }

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
      setSelected(null);
      setHoveredCell(null);
      cellRefs.current.clear();
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

  // Jump to + highlight the requested row/column whenever they (or focusToken) change.
  useEffect(() => {
    if (!workbook || focusRow === null || focusRow === undefined) return;

    const rowIdx = focusRow - 1; // grid is 0-based, row 1 = first data row
    const colIdx = resolveColumnIndex(focusColumn);

    if (rowIdx < 0 || rowIdx >= grid.length) return;

    setSelected({ row: rowIdx, col: colIdx });

    const key = colIdx !== null ? `${rowIdx}:${colIdx}` : `${rowIdx}:row`;
    const target = cellRefs.current.get(key) || cellRefs.current.get(`${rowIdx}:row`);

    if (target && containerRef.current) {
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }

    setPulseKey((k) => k + 1);

    if (onFocusHandled) {
      const t = setTimeout(() => onFocusHandled(), 50);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbook, activeSheetIndex, focusRow, focusColumn, focusToken, grid.length]);

  const clearSelection = () => setSelected(null);

  const registerCellRef = (key) => (el) => {
    if (el) cellRefs.current.set(key, el);
    else cellRefs.current.delete(key);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 custom-shadow flex flex-col overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        className="hidden"
        onChange={handleFileChange}
      />

      <style>{`
        @keyframes evc-cell-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.55), 0 0 0 0 rgba(16,185,129,0.0); }
          40%  { box-shadow: 0 0 0 4px rgba(16,185,129,0.28), 0 0 18px 4px rgba(16,185,129,0.35); }
          100% { box-shadow: 0 0 0 2px rgba(16,185,129,0.45), 0 0 0 0 rgba(16,185,129,0.0); }
        }
        @keyframes evc-row-sweep {
          0%   { background-position: -120% 0; }
          100% { background-position: 220% 0; }
        }
        @keyframes evc-select-pop {
          0%   { transform: scale(1); }
          35%  { transform: scale(1.045); }
          100% { transform: scale(1); }
        }
        .evc-cell-focused {
          animation: evc-cell-pulse 1.05s cubic-bezier(0.22, 1, 0.36, 1) 1;
          position: relative;
          z-index: 5;
        }
        .evc-row-focused td {
          background-image: linear-gradient(
            100deg,
            transparent 0%,
            rgba(16,185,129,0.16) 45%,
            rgba(16,185,129,0.16) 55%,
            transparent 100%
          );
          background-size: 220% 100%;
          animation: evc-row-sweep 1.1s ease-out 1;
        }
        .evc-cell-selected {
          animation: evc-select-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) 1;
        }
      `}</style>

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
            {selected && (
              <button
                onClick={clearSelection}
                className="hidden md:flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                title="Clear highlighted cell"
              >
                <i className="fa-solid fa-location-crosshairs text-[10px]"></i>
                {colLabel(selected.col ?? 0)}
                {selected.row + 1}
                <i className="fa-solid fa-xmark text-[10px] ml-0.5 opacity-60"></i>
              </button>
            )}
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

      {/* Mobile-visible selection badge */}
      {workbook && selected && (
        <div className="md:hidden flex items-center justify-between px-5 py-2 bg-emerald-50 border-b border-emerald-100">
          <span className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
            <i className="fa-solid fa-location-crosshairs text-[10px]"></i>
            Highlighted {colLabel(selected.col ?? 0)}{selected.row + 1}
          </span>
          <button onClick={clearSelection} className="text-emerald-600 text-xs">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

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
                  {Array.from({ length: colCount }).map((_, c) => {
                    const isFocusedCol = selected && selected.col === c;
                    return (
                      <th
                        key={c}
                        className={`sticky top-0 z-10 border border-slate-200 font-medium px-2 py-1 whitespace-nowrap min-w-[90px] transition-colors duration-200 ${
                          isFocusedCol
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {colLabel(c)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {grid.map((row, r) => {
                  const isFocusedRow = selected && selected.row === r && selected.col === null;
                  const rowHasFocusedCell = selected && selected.row === r && selected.col !== null;
                  return (
                    <tr
                      key={`${r}-${pulseKey && isFocusedRow ? pulseKey : "s"}`}
                      ref={registerCellRef(`${r}:row`)}
                      className={isFocusedRow ? "evc-row-focused" : ""}
                    >
                      <td
                        className={`sticky left-0 z-10 border border-slate-200 text-center font-medium px-2 transition-colors duration-200 ${
                          selected && selected.row === r
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {r + 1}
                      </td>
                      {Array.from({ length: colCount }).map((_, c) => {
                        const val = row[c] ?? "";
                        const isMatch = cellMatches(val);
                        const isFocusedCell = rowHasFocusedCell && selected.col === c;
                        const isHovered = hoveredCell && hoveredCell.row === r && hoveredCell.col === c;
                        const cellKey = `${r}:${c}`;

                        return (
                          <td
                            key={c}
                            ref={isFocusedCell ? registerCellRef(cellKey) : undefined}
                            onMouseEnter={() => setHoveredCell({ row: r, col: c })}
                            onMouseLeave={() =>
                              setHoveredCell((h) => (h && h.row === r && h.col === c ? null : h))
                            }
                            onClick={() => {
                              setSelected({ row: r, col: c });
                              setPulseKey((k) => k + 1);
                            }}
                            className={[
                              "relative border px-2 py-1 whitespace-nowrap text-slate-700 cursor-pointer select-none",
                              "transition-all duration-150 ease-out",
                              isMatch ? "bg-amber-100/70 ring-1 ring-inset ring-amber-300" : "bg-white",
                              isHovered && !isFocusedCell
                                ? "bg-emerald-50/70 -translate-y-px shadow-[0_2px_6px_-2px_rgba(16,185,129,0.35)] border-emerald-200 z-[1]"
                                : "border-slate-200",
                              isFocusedCell
                                ? "evc-cell-selected evc-cell-focused bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/70 text-emerald-800 font-medium z-[2]"
                                : "",
                            ].join(" ")}
                          >
                            {String(val)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
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