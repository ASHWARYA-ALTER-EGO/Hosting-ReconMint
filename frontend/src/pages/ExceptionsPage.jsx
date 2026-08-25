import React, { useState, useEffect, useMemo, useCallback } from "react";
import * as api from "../api.js";
import FeeWaterfall from "../components/FeeWaterfall.jsx";
import SourceFilesCard from "../components/SourceFilesCard.jsx";

const PAGE_SIZE = 8;

const SEV_DOT = { Critical: "bg-red-500", Warning: "bg-amber-400", Info: "bg-blue-400" };
const SEV_TEXT = { Critical: "text-red-700 bg-red-50 border-red-100", Warning: "text-amber-700 bg-amber-50 border-amber-100", Info: "text-blue-700 bg-blue-50 border-blue-100" };
const CAT_CHIP = {
  "Amount Mismatch": "bg-red-50 text-red-700 border-red-100",
  "Missing in Bank": "bg-purple-50 text-purple-700 border-purple-100",
  Chargeback: "bg-orange-50 text-orange-700 border-orange-100",
  Duplicate: "bg-slate-100 text-slate-600 border-slate-200",
  "No Order": "bg-rose-50 text-rose-700 border-rose-100",
  Other: "bg-slate-100 text-slate-600 border-slate-200",
};

function EmptyState({ onGoUpload }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
      <i className="fa-solid fa-circle-exclamation text-4xl mb-4 opacity-40"></i>
      <p className="text-lg font-medium text-slate-500 mb-1">No run loaded</p>
      <p className="text-sm mb-6">Run a reconciliation first to review its exceptions.</p>
      <button onClick={onGoUpload} className="gradient-btn text-white px-6 py-2.5 rounded-xl text-sm font-medium">Go to Upload</button>
    </div>
  );
}

function Drawer({ item, onClose, onResolve, resolving, onExplain, explaining }) {
  const led = item.ledger;
  return (
    <aside className="w-[500px] glass-panel border-l border-white/20 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.1)] z-10 flex flex-col flex-shrink-0 h-full">
      <div className="p-8 pb-6 border-b border-slate-200/50">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{item.id}</h2>
            <div className="flex items-center space-x-2 mt-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${SEV_TEXT[item.severity]}`}>{item.severity}</span>
              <span className="text-slate-400 text-xs">•</span>
              <span className="text-slate-500 text-sm">{item.status}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 bg-white p-2 rounded-full shadow-sm border border-slate-100"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="bg-white/60 rounded-xl p-5 border border-slate-100/50 shadow-sm grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
          <div className="text-slate-500 font-medium">Category</div><div className="text-slate-900 text-right font-semibold">{item.category}</div>
          <div className="text-slate-500 font-medium">Date</div><div className="text-slate-900 text-right font-medium">{item.date}</div>
          <div className="text-slate-500 font-medium">Match</div><div className="text-slate-900 text-right font-medium">{item.matchMethod || "—"}{item.confidence ? ` (${item.confidence}%)` : ""}</div>
          <div className="text-slate-500 font-medium">Amount</div><div className="text-slate-900 text-right font-bold text-base">{api.formatINR(item.amount)}</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {led && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 mb-6 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ledger (Computed vs Bank)</h3>
            </div>
            <div className="p-4 text-sm">
              {led.lines.map((l, i) => (
                <div key={i} className={`flex justify-between py-2 ${l.isSubItem ? "text-slate-500 pl-4" : "text-slate-800 font-medium"}`}>
                  <span>{l.particulars}</span>
                  <span>{api.formatINR(l.isSubItem ? l.value : l.expected)}</span>
                </div>
              ))}
              <div className="border-t border-slate-100 mt-2 pt-3 space-y-2">
                <div className="flex justify-between"><span className="text-slate-600">Expected Net (Calculated)</span><span className="font-semibold text-slate-900">{api.formatINR(led.expectedNet)}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Actual Net (Bank)</span><span className="font-semibold text-slate-900">{api.formatINR(led.actualNet)}</span></div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Variance</span>
                  <span className={`px-3 py-1 rounded-full font-bold text-sm border ${led.variance ? "bg-red-50 text-red-600 border-red-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"}`}>
                    {led.variance < 0 ? "-" : ""}{api.formatINR(Math.abs(led.variance))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {led && <div className="mb-6"><FeeWaterfall ledger={led} /></div>}

        <div className="bg-gradient-to-r from-emerald-50 to-green-50/50 border border-emerald-100/50 rounded-xl p-4 mb-6 flex items-start gap-3">
          <div className="bg-white rounded-full p-1.5 shadow-sm border border-emerald-100 mt-0.5"><i className="fa-solid fa-check text-emerald-500 text-[10px]"></i></div>
          <div>
            <div className="text-sm font-semibold text-emerald-800">Verified against {led ? led.verifiedAgainstCount : "computed"} figures</div>
            <div className="text-xs text-emerald-600 mt-1 font-medium">All monetary values verified. No unsupported figures.</div>
          </div>
        </div>

        <div className="relative bg-white rounded-2xl p-6 border border-blue-100 shadow-sm overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-50 p-2 rounded-lg border border-blue-100/50"><i className="fa-solid fa-wand-magic-sparkles text-blue-600 text-sm"></i></div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              {item.isLlm ? "AI-generated explanation" : "Deterministic explanation"}
              {item.llmVerified && <span className="bg-green-100/50 text-green-700 border border-green-200/50 px-2 py-0.5 rounded-md normal-case font-semibold ml-2 text-[10px]">Verified</span>}
            </h4>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed font-medium">{item.explanation}</p>
          {item.isLlm ? (
            <div className="flex items-center gap-3 text-xs text-slate-500 font-medium pt-4 mt-4 border-t border-slate-100">
              <span><i className="fa-solid fa-microchip text-slate-400 mr-1"></i>{item.llmModel || "gpt-4o-mini"}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
              <span>3 files cross-checked</span>
            </div>
          ) : (
            <button onClick={() => onExplain(item)} disabled={explaining}
              className="mt-4 w-full text-sm font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-lg py-2 hover:bg-blue-100 disabled:opacity-60 flex items-center justify-center gap-2">
              <i className="fa-solid fa-wand-magic-sparkles"></i>
              {explaining ? "Generating verified explanation…" : "Explain with AI"}
            </button>
          )}
        </div>
      </div>

      <div className="p-6 border-t border-slate-200/50 flex gap-4 bg-white/50">
        <button onClick={() => onResolve(item)} disabled={resolving}
          className="flex-1 px-5 py-2.5 bg-blue-600 rounded-xl text-sm font-semibold text-white hover:bg-blue-700 shadow-md disabled:opacity-60">
          {resolving ? "Resolving…" : "Mark as Resolved"}
        </button>
      </div>
    </aside>
  );
}

export default function ExceptionsPage({ run, showToast, onGoUpload }) {
  const [data, setData] = useState(null); // {items, counts, total}
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [showSource, setShowSource] = useState(false);

  const load = useCallback(async () => {
    if (!run) return;
    setLoading(true);
    try {
      setData(await api.getExceptions(run.runId));
    } catch (e) {
      showToast(String(e.message), "error");
    } finally {
      setLoading(false);
    }
  }, [run, showToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let out = data.items;
    if (tab !== "All") out = out.filter((e) => e.severity === tab);
    if (search.trim()) out = out.filter((e) => e.id.toLowerCase().includes(search.trim().toLowerCase()));
    return out;
  }, [data, tab, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [tab, search]);

  const resolve = async (item) => {
    setResolving(true);
    try {
      await api.resolveDecision(item.decisionId);
      showToast(`Resolved ${item.id}`);
      setSelected(null);
      await load();
    } catch (e) {
      showToast(String(e.message), "error");
    } finally {
      setResolving(false);
    }
  };

  const explain = async (item) => {
    setExplaining(true);
    try {
      const r = await api.explainDecision(item.decisionId);
      const upd = { ...item, explanation: r.explanation, isLlm: true, llmVerified: r.verified, llmModel: r.model };
      setSelected(upd);
      setData((d) => ({ ...d, items: d.items.map((x) => (x.decisionId === item.decisionId ? upd : x)) }));
      showToast(r.verified ? "AI explanation verified against computed figures" : "AI explanation generated");
    } catch (e) {
      showToast(String(e.message), "error");
    } finally {
      setExplaining(false);
    }
  };

  if (!run) return <EmptyState onGoUpload={onGoUpload} />;
  const counts = data?.counts || { all: 0, critical: 0, warning: 0, info: 0 };

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "radial-gradient(at 0% 0%, hsla(217,100%,97%,1) 0px, transparent 50%), radial-gradient(at 100% 0%, hsla(210,100%,97%,1) 0px, transparent 50%)" }}>
      <div className="flex-1 flex flex-col min-w-0 px-8 py-8 overflow-y-auto">
        <header className="mb-6 flex justify-between items-start">
          <div>
            <div className="flex items-center space-x-3 mb-1">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Exceptions</h1>
              <span className="bg-red-50 text-red-600 border border-red-100 text-sm font-semibold px-3 py-1 rounded-full">{counts.all}</span>
            </div>
            <p className="text-slate-500 text-sm font-medium">Unresolved records requiring review</p>
          </div>
          <button onClick={() => setShowSource((s) => !s)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              showSource ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
            <i className="fa-solid fa-file-excel"></i>
            {showSource ? "Hide source data" : "View source data"}
          </button>
        </header>

        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-sm border border-slate-100 flex-1 min-h-[440px] flex flex-col overflow-hidden">
          <div className="px-6 pt-5 pb-3 flex justify-between items-end border-b border-slate-100/60">
            <div className="flex space-x-6 text-sm">
              {[["All", counts.all], ["Critical", counts.critical], ["Warning", counts.warning], ["Info", counts.info]].map(([label, n]) => (
                <button key={label} onClick={() => setTab(label)}
                  className={`pb-3 flex items-center gap-2 -mb-[13px] border-b-2 ${tab === label ? "border-blue-600 font-semibold text-slate-900" : "border-transparent text-slate-400 hover:text-slate-700 font-medium"}`}>
                  <span>{label}</span>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${tab === label ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-500 border border-slate-100"}`}>{n}</span>
                </button>
              ))}
            </div>
            <div className="relative mb-2">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by Payment ID..."
                className="pl-10 pr-4 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white" />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="p-16 text-center text-slate-400"><i className="fa-solid fa-spinner fa-spin text-2xl"></i></div>
            ) : filtered.length === 0 ? (
              <div className="p-16 text-center text-slate-400">
                <i className="fa-regular fa-circle-check text-3xl mb-3 text-emerald-400"></i>
                <p className="text-sm font-medium">Nothing here — no matching exceptions.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
                    <th className="py-3.5 px-6">Payment ID</th><th className="py-3.5 px-6">Date</th>
                    <th className="py-3.5 px-6 text-right">Amount (₹)</th><th className="py-3.5 px-6">Category</th>
                    <th className="py-3.5 px-6">Severity</th><th className="py-3.5 px-6">Match</th>
                    <th className="py-3.5 px-6">Confidence</th><th className="py-3.5 px-6">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-50/80">
                  {pageItems.map((e) => (
                    <tr key={e.decisionId} onClick={() => setSelected(e)}
                      className={`cursor-pointer transition-colors ${selected?.decisionId === e.decisionId ? "bg-blue-50/40" : "hover:bg-slate-50/80"}`}>
                      <td className="py-4 px-6 font-semibold text-slate-900">{e.id}</td>
                      <td className="py-4 px-6 text-slate-500 font-medium">{e.date}</td>
                      <td className="py-4 px-6 text-right font-medium text-slate-900">{Number(e.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      <td className="py-4 px-6"><span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold border ${CAT_CHIP[e.category] || CAT_CHIP.Other}`}>{e.category}</span></td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${SEV_DOT[e.severity]}`}></span>
                          <span className="text-slate-700 font-medium">{e.severity}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-500 font-medium">{e.matchMethod || "—"}</td>
                      <td className="py-4 px-6 text-slate-500 font-medium">{e.confidence ? `${e.confidence}%` : "—"}</td>
                      <td className="py-4 px-6 font-semibold text-red-500">{e.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="p-5 border-t border-slate-100 flex justify-between items-center text-sm text-slate-500">
            <span className="font-medium">
              {filtered.length === 0 ? "0 results" : `Showing ${(page - 1) * PAGE_SIZE + 1} to ${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
            </span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="w-8 h-8 rounded-md hover:bg-slate-50 text-slate-600 disabled:opacity-40"><i className="fa-solid fa-chevron-left text-xs"></i></button>
              <span className="px-3 h-8 flex items-center rounded-md bg-blue-50 text-blue-700 font-semibold">{page} / {pageCount}</span>
              <button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="w-8 h-8 rounded-md hover:bg-slate-50 text-slate-600 disabled:opacity-40"><i className="fa-solid fa-chevron-right text-xs"></i></button>
            </div>
          </div>
        </div>

        {showSource && (
          <div className="mt-6">
            <p className="text-xs text-slate-500 mb-3">Cross-reference an exception against the raw rows the agent reconciled. Use search to find a payment ID.</p>
            <SourceFilesCard isDemo={run.isDemo} height={340} />
          </div>
        )}
      </div>

      {selected && <Drawer item={selected} onClose={() => setSelected(null)} onResolve={resolve} resolving={resolving} onExplain={explain} explaining={explaining} />}
    </div>
  );
}
