import React from "react";
import { formatINR } from "../api.js";

function EmptyState({ onGoUpload }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
      <i className="fa-solid fa-table-columns text-4xl mb-4 opacity-40"></i>
      <p className="text-lg font-medium text-slate-500 mb-1">No reconciliation run yet</p>
      <p className="text-sm mb-6">Run a reconciliation to see the overview.</p>
      <button onClick={onGoUpload} className="gradient-btn text-white px-6 py-2.5 rounded-xl text-sm font-medium">
        Go to Upload
      </button>
    </div>
  );
}

function MetricCard({ title, subtitle, value, footnote, tone }) {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200 custom-shadow flex flex-col justify-between">
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          {title} {subtitle && <span className="text-slate-400 normal-case font-normal">{subtitle}</span>}
        </h3>
        <div className="text-3xl font-bold text-slate-800 tracking-tight" style={{ animation: "countUp .5s ease" }}>{value}</div>
      </div>
      {footnote && <div className={`mt-4 text-xs ${tone === "negative" ? "text-red-500 font-medium" : "text-slate-500"}`}>{footnote}</div>}
    </div>
  );
}

function AccuracyCard({ acc }) {
  const pct = (n) => `${Math.round(n * 100)}%`;
  return (
    <div className="bg-white rounded-xl p-6 border border-slate-200 custom-shadow">
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">Detection Accuracy</h2>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">vs ground truth</span>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[["Precision", pct(acc.precision)], ["Recall", pct(acc.recall)], ["F1", acc.f1.toFixed(2)]].map(([k, v]) => (
          <div key={k} className="text-center">
            <div className="text-2xl font-bold text-slate-800">{v}</div>
            <div className="text-xs text-slate-500 mt-1">{k}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs bg-slate-50 rounded-lg p-3 border border-slate-100">
        <span className="text-slate-600"><span className="font-semibold text-emerald-600">{acc.false_negatives}</span> missed (false negatives)</span>
        <span className="text-slate-600"><span className="font-semibold text-amber-600">{acc.false_positives}</span> over-flagged (false positives)</span>
      </div>
    </div>
  );
}

function StackedBreakdown({ segments, total }) {
  return (
    <div className="bg-white rounded-xl p-6 border border-slate-200 custom-shadow">
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">Reconciliation Breakdown</h2>
      </div>
      <div className="h-6 w-full flex rounded-full overflow-hidden mb-8">
        {segments.map((s) => (
          <div key={s.label} className={s.color} style={{ width: `${(s.count / total) * 100}%` }} title={s.label}></div>
        ))}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {segments.map((s) => (
            <tr key={s.label} className="border-b border-slate-50">
              <td className="py-3 flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${s.color} block`}></span>
                <span className="text-slate-600">{s.label}</span>
              </td>
              <td className="py-3 text-right font-medium text-slate-800">{s.count}</td>
              <td className="py-3 text-right text-slate-500 w-20">{((s.count / total) * 100).toFixed(2)}%</td>
            </tr>
          ))}
          <tr>
            <td className="py-3 font-medium text-slate-800">Total</td>
            <td className="py-3 text-right font-bold text-slate-800">{total}</td>
            <td className="py-3 text-right font-medium text-slate-800 w-20">100.00%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function buildWaterfall(bd) {
  const total = bd.total;
  const scale = 170 / total;
  const steps = [];
  const push = (label, value, color, height, marginBottom, tooltip, showConnector = true) =>
    steps.push({ label, value, color, height, marginBottom, tooltip, showConnector });

  push(["Ingested"], `${total}`, "bg-slate-300", total * scale, 0, `Total ingested: ${total}`);
  let running = total;
  running -= bd.duplicates;
  push(["Duplicates"], `-${bd.duplicates}`, "bg-red-400", Math.max(bd.duplicates * scale, 2), running * scale, `Duplicates removed: ${bd.duplicates}`);
  running -= bd.ghost_credits;
  push(["Ghost", "credits"], `-${bd.ghost_credits}`, "bg-purple-400", Math.max(bd.ghost_credits * scale, 2), running * scale, `Ghost bank credits: ${bd.ghost_credits}`);
  push(["Valid", "records"], `${running}`, "bg-slate-400", running * scale, 0, `Valid records: ${running}`);
  running -= bd.auto_matched;
  push(["Auto", "matched"], `-${bd.auto_matched}`, "bg-emerald-500", bd.auto_matched * scale, running * scale, `Auto (exact): ${bd.auto_matched}`);
  running -= bd.fuzzy_matched;
  push(["Fuzzy", "matched"], `-${bd.fuzzy_matched}`, "bg-emerald-400", Math.max(bd.fuzzy_matched * scale, 2), running * scale, `Fuzzy (AI): ${bd.fuzzy_matched}`);
  running -= bd.fee_anomaly;
  push(["Fee", "anomaly"], `-${bd.fee_anomaly}`, "bg-amber-400", Math.max(bd.fee_anomaly * scale, 2), running * scale, `Fee anomalies: ${bd.fee_anomaly}`);
  push(["Unresolved"], `${running}`, "bg-red-500", Math.max(running * scale, 2), 0, `Unresolved: ${running}`, false);
  return steps;
}

function Waterfall({ bd }) {
  const steps = buildWaterfall(bd);
  return (
    <div className="bg-white rounded-xl p-6 border border-slate-200 custom-shadow flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">Record Reconciliation Waterfall</h2>
      </div>
      <div className="flex-1 w-full overflow-x-auto pb-4">
        <div className="waterfall-container min-w-[500px]">
          {steps.map((s, i) => (
            <div key={i} className="waterfall-bar-wrapper">
              <div className="wf-tooltip">{s.tooltip}</div>
              <div className={`waterfall-bar ${s.color}`} style={{ height: `${s.height}px`, marginBottom: `${s.marginBottom}px` }}>
                <div className="bar-value">{s.value}</div>
              </div>
              {s.showConnector && <div className="connector" style={{ top: `calc(100% - ${s.height + s.marginBottom}px)` }}></div>}
              <div className="mt-4 text-[10px] text-center text-slate-600 font-medium leading-tight">
                {s.label.map((w, j) => <React.Fragment key={j}>{j > 0 && <br />}{w}</React.Fragment>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FooterStrip({ meta }) {
  const stats = [
    { icon: "fa-solid fa-microchip", bg: "bg-blue-50", color: "text-blue-500", label: "AI cost (this run)", value: `$${(meta.llm_cost_usd_total || 0).toFixed(4)}` },
    { icon: "fa-solid fa-brain", bg: "bg-orange-50", color: "text-orange-500", label: "Model", value: meta.llm_calls ? "gpt-4o-mini" : "not used" },
    { icon: "fa-regular fa-circle-check", bg: "bg-green-50", color: "text-green-500", label: "AI explanations", value: `${meta.llm_verified_count || 0} verified / ${meta.llm_calls || 0} calls` },
  ];
  return (
    <footer className="bg-white rounded-xl border border-slate-200 p-4 custom-shadow flex items-center divide-x divide-slate-200">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-3 px-6 flex-1">
          <div className={`w-8 h-8 rounded-full ${s.bg} flex items-center justify-center ${s.color}`}><i className={s.icon}></i></div>
          <div>
            <div className="text-xs text-slate-400">{s.label}</div>
            <div className="text-sm font-semibold text-slate-800">{s.value}</div>
          </div>
        </div>
      ))}
    </footer>
  );
}

export default function DashboardPage({ run, evalData, onExport, onGoUpload, onGoExceptions }) {
  if (!run) return <EmptyState onGoUpload={onGoUpload} />;
  const m = run.meta;
  const amount = formatINR((m.reconciled_amount_paise || 0) / 100);
  const exceptionsPct = m.settlement_active ? ((m.exceptions_total / m.settlement_active) * 100).toFixed(2) : "0";

  // breakdown: full 6-bucket for demo (evalData), else 2-bucket from meta
  const segments = evalData
    ? [
        { label: "Auto Matched (Exact)", color: "bg-emerald-500", count: evalData.breakdown.auto_matched },
        { label: "Fuzzy Matched (AI)", color: "bg-emerald-400", count: evalData.breakdown.fuzzy_matched },
        { label: "Fee Anomaly", color: "bg-amber-400", count: evalData.breakdown.fee_anomaly },
        { label: "Unresolved", color: "bg-red-500", count: evalData.breakdown.unresolved },
        { label: "Duplicates", color: "bg-red-400", count: evalData.breakdown.duplicates },
        { label: "Ghost Credits", color: "bg-purple-400", count: evalData.breakdown.ghost_credits },
      ]
    : [
        { label: "Reconciled", color: "bg-emerald-500", count: m.reconciled_total },
        { label: "Exceptions", color: "bg-red-500", count: m.exceptions_total },
      ];
  const bdTotal = evalData ? evalData.breakdown.total : m.reconciled_total + m.exceptions_total;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Reconciliation Overview</h1>
          <div className="flex items-center text-xs text-slate-500 mt-1 gap-2 flex-wrap">
            {run.isDemo && <><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-sm">Demo run (synthetic data)</span><span>•</span></>}
            <span>Run ID: {run.runId}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onExport} className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-md bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 custom-shadow">
            <i className="fa-solid fa-download text-slate-400"></i><span>Audit export (CSV)</span>
          </button>
          <button onClick={onGoExceptions} className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-md bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 custom-shadow">
            <i className="fa-solid fa-circle-exclamation text-slate-400"></i><span>View exceptions</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <MetricCard title="Match Rate" subtitle="(Reconciled)" value={`${m.reconciled_rate_pct}%`} footnote={`${m.match_rate_pct}% matched (incl. fuzzy)`} />
          <MetricCard title="Records Processed" value={`${m.settlement_active}`} footnote={`${m.dataset_size} rows ingested`} />
          <MetricCard title="Processing Time" value={`${m.elapsed_seconds}s`} footnote={`Throughput: ${Math.round(m.throughput_rps).toLocaleString("en-IN")} rec/s`} />
          <MetricCard title="Amount Reconciled" value={amount} footnote="net settled, verified" />
          <MetricCard title="Exceptions" subtitle="(Needs review)" value={`${m.exceptions_total}`} footnote={`${exceptionsPct}% of records`} tone="negative" />
        </section>

        {evalData && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AccuracyCard acc={evalData.accuracy} />
            <FooterStrip meta={m} />
          </section>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StackedBreakdown segments={segments} total={bdTotal} />
          {evalData ? (
            <Waterfall bd={evalData.breakdown} />
          ) : (
            <div className="bg-white rounded-xl p-6 border border-slate-200 custom-shadow flex items-center justify-center text-sm text-slate-400 text-center">
              Full breakdown &amp; accuracy are shown for demo runs (which have ground truth).
            </div>
          )}
        </section>

        {!evalData && <FooterStrip meta={m} />}
      </div>
    </div>
  );
}
