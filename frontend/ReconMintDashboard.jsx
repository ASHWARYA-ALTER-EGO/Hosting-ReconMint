import React from "react";

// ============================================================
// ReconMint Dashboard — single-file React (JSX) conversion
// Drop this component into any React app. Requires:
//   1. Tailwind CSS (the original used the Tailwind CDN build
//      with the `forms` and `container-queries` plugins)
//   2. Font Awesome 6 (loaded via CDN link in original <head>)
// Both are referenced below in the usage note at the bottom
// of this file.
// ============================================================

// ------------------------------------------------------------
// Inline styles for the custom (non-Tailwind) CSS rules from
// the original <style data-purpose="custom-styles"> block.
// Injected once via a <style> tag so no external CSS file is
// required.
// ------------------------------------------------------------
const CUSTOM_STYLES = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
    background-color: #f9fafb; /* bg-gray-50 */
  }
  .custom-shadow {
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  }

  /* Waterfall Specific Styles */
  .waterfall-container {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    height: 240px;
    padding-top: 40px;
    position: relative;
  }
  .waterfall-bar-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    flex: 1;
    height: 100%;
    justify-content: flex-end;
  }
  .waterfall-bar {
    width: 48px;
    border-radius: 4px;
    position: relative;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .waterfall-bar:hover {
    opacity: 0.8;
  }

  /* Connectors */
  .connector {
    position: absolute;
    border-top: 1px dashed #cbd5e1;
    width: 100%;
    left: 50%;
    z-index: 0;
  }

  /* Tooltip */
  .tooltip {
    visibility: hidden;
    opacity: 0;
    position: absolute;
    bottom: calc(100% + 28px); /* Account for the label above bar */
    left: 50%;
    transform: translateX(-50%);
    background-color: #1e293b;
    color: white;
    text-align: center;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 11px;
    white-space: nowrap;
    z-index: 50;
    transition: opacity 0.2s;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    pointer-events: none;
  }
  .tooltip::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -5px;
    border-width: 5px;
    border-style: solid;
    border-color: #1e293b transparent transparent transparent;
  }
  .waterfall-bar-wrapper:hover .tooltip {
    visibility: visible;
    opacity: 1;
  }

  /* Value Label Positioning (Top of bar) */
  .bar-value {
    position: absolute;
    top: -24px;
    width: 100%;
    text-align: center;
    font-size: 12px;
    font-weight: 600;
    color: #334155;
  }
`;

// ------------------------------------------------------------
// Mock data — copied 1:1 from the original static HTML markup.
// ------------------------------------------------------------
const SIDEBAR_ITEMS = [
  { id: "upload", label: "Upload", icon: "fa-solid fa-arrow-up-from-bracket", active: false },
  { id: "dashboard", label: "Dashboard", icon: "fa-solid fa-table-columns", active: true },
  { id: "exceptions", label: "Exceptions", icon: "fa-solid fa-circle-exclamation", active: false },
  { id: "reports", label: "Reports", icon: "fa-regular fa-file-lines", active: false },
  { id: "reconciliations", label: "Reconciliations", icon: "fa-solid fa-arrows-rotate", active: false },
  { id: "settings", label: "Settings", icon: "fa-solid fa-gear", active: false },
];

const HEADER_INFO = {
  title: "Reconciliation Overview",
  isDemoRun: true,
  batchId: "DEMO-2025-05-26-01",
  runTimestamp: "26 May 2025, 10:24 AM",
  dateRangeLabel: "26 May 2025 - 26 May 2025",
};

const METRICS = [
  {
    id: "match-rate",
    title: "Match Rate",
    subtitle: "(Resolved)",
    value: "96.73%",
    trend: { direction: "up", value: "2.84 pp", label: "vs last run (23 May 2025)" },
  },
  {
    id: "records-processed",
    title: "Records Processed",
    value: "325",
    footnote: "100% of 512",
  },
  {
    id: "processing-time",
    title: "Processing Time",
    value: "0.16s",
    subFootnote: "Total time",
    footnote: "Throughput: 3,200 rec/s",
  },
  {
    id: "amount-reconciled",
    title: "Amount Reconciled",
    value: "₹ 1,72,24,920.50",
    valueSize: "text-2xl",
    footnote: "96.73% of total amount",
  },
  {
    id: "exceptions",
    title: "Exceptions",
    subtitle: "(Unresolved)",
    value: "19",
    footnote: "of total records",
    footnotePrefix: "3.71%",
    footnoteTone: "negative",
  },
];

const BREAKDOWN = {
  sourceLabel: "Based on ground truth (answer_key.csv)",
  total: 512,
  segments: [
    { id: "clean-matched", label: "Clean Matched (Auto)", color: "bg-emerald-500", count: 356, percent: "69.53" },
    { id: "fee-explained", label: "Fee Explained (Rules)", color: "bg-amber-400", count: 89, percent: "17.38" },
    { id: "fuzzy-matched", label: "Fuzzy Matched (AI)", color: "bg-blue-500", count: 48, percent: "9.38" },
    { id: "exceptions", label: "Exceptions (Unresolved)", color: "bg-red-500", count: 19, percent: "3.71" },
  ],
};

const WATERFALL_STEPS = [
  {
    id: "ingested",
    label: ["Ingested"],
    sublabel: "Total",
    displayValue: "512",
    valueColorClass: "",
    color: "bg-slate-300",
    heightPx: 180,
    marginBottomPx: 0,
    tooltipLines: ["Total Ingested: 512", "100% of batch"],
    showConnector: true,
  },
  {
    id: "duplicates-invalid",
    label: ["Duplicates /", "Invalid"],
    sublabel: "1.39%",
    displayValue: "-7",
    valueColorClass: "text-red-600",
    color: "bg-red-400",
    heightPx: 3,
    marginBottomPx: 177,
    tooltipLines: ["Duplicates / Invalid: -7", "Removed from process"],
    showConnector: true,
  },
  {
    id: "valid-records",
    label: ["Valid", "Records"],
    sublabel: "Total",
    displayValue: "505",
    valueColorClass: "",
    color: "bg-slate-400",
    heightPx: 177,
    marginBottomPx: 0,
    tooltipLines: ["Valid Records: 505", "Base for reconciliation"],
    showConnector: true,
  },
  {
    id: "auto-matched",
    label: ["Auto", "Matched"],
    sublabel: "70.50%",
    displayValue: "-356",
    valueColorClass: "text-emerald-600",
    color: "bg-emerald-500",
    heightPx: 125,
    marginBottomPx: 52,
    tooltipLines: ["Auto Matched: -356", "Clean 1:1 matches"],
    showConnector: true,
  },
  {
    id: "fee-explained",
    label: ["Fee", "Explained"],
    sublabel: "17.62%",
    displayValue: "-89",
    valueColorClass: "text-emerald-600",
    color: "bg-emerald-400",
    heightPx: 31,
    marginBottomPx: 21,
    tooltipLines: ["Fee Explained: -89", "Resolved via rules"],
    showConnector: true,
  },
  {
    id: "fuzzy-matched",
    label: ["Fuzzy", "Matched"],
    sublabel: "9.50%",
    displayValue: "-48",
    valueColorClass: "text-emerald-600",
    color: "bg-emerald-300",
    heightPx: 14,
    marginBottomPx: 7,
    tooltipLines: ["Fuzzy Matched: -48", "Resolved via AI"],
    showConnector: true,
  },
  {
    id: "exceptions",
    label: ["Exceptions"],
    sublabel: "3.76%",
    sublabelClass: "font-semibold text-red-500",
    displayValue: "19",
    valueColorClass: "text-red-600",
    color: "bg-red-500",
    heightPx: 7,
    marginBottomPx: 0,
    tooltipLines: ["Exceptions: 19", "Unresolved records"],
    showConnector: false,
  },
];

const FOOTER_STATS = [
  {
    id: "ai-cost",
    icon: "fa-solid fa-microchip",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-500",
    label: "AI cost (this run)",
    value: "$0.0008",
  },
  {
    id: "model",
    icon: "fa-solid fa-brain",
    iconBg: "bg-orange-50",
    iconColor: "text-orange-500",
    label: "Model",
    value: "gpt-4o-mini",
  },
  {
    id: "ai-explanations",
    icon: "fa-regular fa-circle-check",
    iconBg: "bg-green-50",
    iconColor: "text-green-500",
    label: "AI explanations generated",
    value: "12 (all verified)",
    valueBold: "12",
    valueRest: " (all verified)",
  },
];

// ------------------------------------------------------------
// Sidebar
// ------------------------------------------------------------
function Sidebar({ items }) {
  return (
    <aside
      className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex h-full"
      data-purpose="sidebar"
    >
      <div className="h-16 flex items-center px-6 border-b border-slate-100">
        <div className="flex items-center gap-2 text-blue-600 font-bold text-xl">
          <i className="fa-solid fa-layer-group"></i>
          <span>ReconMint</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {items.map((item) => (
          <a
            key={item.id}
            href="#"
            className={
              item.active
                ? "flex items-center gap-3 px-3 py-2 text-blue-600 bg-blue-50 rounded-md transition-colors"
                : "flex items-center gap-3 px-3 py-2 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
            }
          >
            <i
              className={`${item.icon} w-5 text-center ${
                item.active ? "" : "text-slate-400"
              }`}
            ></i>
            <span className="text-sm font-medium">{item.label}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}

// ------------------------------------------------------------
// Header
// ------------------------------------------------------------
function Header({ info }) {
  return (
    <header
      className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-start lg:items-center flex-col lg:flex-row gap-4"
      data-purpose="header"
    >
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{info.title}</h1>
        <div className="flex items-center text-xs text-slate-500 mt-1 gap-2 flex-wrap">
          {info.isDemoRun && (
            <>
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-sm">
                Demo run (synthetic data)
              </span>
              <span>•</span>
            </>
          )}
          <span>Batch ID: {info.batchId}</span>
          <span>•</span>
          <span>{info.runTimestamp}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-md bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 custom-shadow">
          <span>{info.dateRangeLabel}</span>
          <i className="fa-regular fa-calendar text-slate-400"></i>
        </button>
        <button className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-md bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 custom-shadow">
          <i className="fa-solid fa-download text-slate-400"></i>
          <span>Audit export (CSV)</span>
        </button>
        <button className="p-1.5 border border-slate-300 rounded-md bg-white text-slate-500 hover:bg-slate-50 custom-shadow">
          <i className="fa-solid fa-ellipsis"></i>
        </button>
      </div>
    </header>
  );
}

// ------------------------------------------------------------
// Metrics Row
// ------------------------------------------------------------
function MetricCard({ metric }) {
  return (
    <div className="bg-white rounded-lg p-5 border border-slate-200 custom-shadow flex flex-col justify-between">
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          {metric.title}{" "}
          {metric.subtitle && (
            <span className="text-slate-400 normal-case font-normal">{metric.subtitle}</span>
          )}
        </h3>
        <div className={`${metric.valueSize || "text-3xl"} font-bold text-slate-800 ${metric.valueSize ? "tracking-tight" : ""}`}>
          {metric.value}
        </div>
        {metric.subFootnote && (
          <div className="text-xs text-slate-500 mt-1">{metric.subFootnote}</div>
        )}
      </div>

      {metric.trend && (
        <div className="mt-4 flex items-center text-xs">
          <span className="bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded flex items-center gap-1 font-medium">
            <i className="fa-solid fa-arrow-up text-[10px]"></i> {metric.trend.value}
          </span>
          <span className="text-slate-400 ml-2">{metric.trend.label}</span>
        </div>
      )}

      {metric.footnote && !metric.footnotePrefix && (
        <div className="mt-4 text-xs text-slate-500">{metric.footnote}</div>
      )}

      {metric.footnotePrefix && (
        <div
          className={`mt-4 text-xs ${
            metric.footnoteTone === "negative" ? "text-red-500 font-medium" : "text-slate-500"
          }`}
        >
          {metric.footnotePrefix}{" "}
          <span className="text-slate-500 font-normal">{metric.footnote}</span>
        </div>
      )}
    </div>
  );
}

function MetricsRow({ metrics }) {
  return (
    <section
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4"
      data-purpose="metrics-row"
    >
      {metrics.map((metric) => (
        <MetricCard key={metric.id} metric={metric} />
      ))}
    </section>
  );
}

// ------------------------------------------------------------
// Reconciliation Breakdown chart
// ------------------------------------------------------------
function BreakdownChart({ data }) {
  return (
    <div className="bg-white rounded-lg p-6 border border-slate-200 custom-shadow">
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
          Reconciliation Breakdown
        </h2>
        <span className="text-[10px] text-slate-400 uppercase tracking-wide bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
          {data.sourceLabel}
        </span>
      </div>

      {/* Stacked Bar */}
      <div className="h-6 w-full flex rounded-full overflow-hidden mb-8">
        {data.segments.map((segment) => (
          <div
            key={segment.id}
            className={segment.color}
            style={{ width: `${segment.percent}%` }}
          ></div>
        ))}
      </div>

      {/* Legend Table */}
      <table className="w-full text-sm">
        <tbody>
          {data.segments.map((segment) => (
            <tr key={segment.id} className="border-b border-slate-50">
              <td className="py-3 flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${segment.color} block`}></span>
                <span className="text-slate-600">{segment.label}</span>
              </td>
              <td className="py-3 text-right font-medium text-slate-800">{segment.count}</td>
              <td className="py-3 text-right text-slate-500 w-20">{segment.percent}%</td>
            </tr>
          ))}
          <tr>
            <td className="py-3 font-medium text-slate-800">Total</td>
            <td className="py-3 text-right font-bold text-slate-800">{data.total}</td>
            <td className="py-3 text-right font-medium text-slate-800 w-20">100.00%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------
// Record Reconciliation Waterfall chart
// ------------------------------------------------------------
function WaterfallBar({ step }) {
  return (
    <div className="waterfall-bar-wrapper">
      <div className="tooltip">
        {step.tooltipLines.map((line, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <br />}
            {line}
          </React.Fragment>
        ))}
      </div>

      <div
        className={`waterfall-bar ${step.color}`}
        style={{ height: `${step.heightPx}px`, marginBottom: `${step.marginBottomPx}px` }}
      >
        <div className={`bar-value ${step.valueColorClass}`}>{step.displayValue}</div>
      </div>

      {step.showConnector && (
        <div
          className="connector"
          style={{ top: `calc(100% - ${step.heightPx + step.marginBottomPx}px)` }}
        ></div>
      )}

      <div className="mt-4 text-[10px] text-center text-slate-600 font-medium leading-tight">
        {step.label.map((word, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <br />}
            {word}
          </React.Fragment>
        ))}
      </div>
      <div className={`text-[10px] ${step.sublabelClass || "text-slate-400"}`}>
        {step.sublabel}
      </div>
    </div>
  );
}

function WaterfallChart({ steps }) {
  return (
    <div className="bg-white rounded-lg p-6 border border-slate-200 custom-shadow flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
            Record Reconciliation Waterfall
          </h2>
        </div>
        <a
          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          href="#"
        >
          View details <i className="fa-solid fa-arrow-right text-[10px]"></i>
        </a>
      </div>
      <div className="flex-1 w-full overflow-x-auto pb-4">
        <div className="waterfall-container min-w-[500px]">
          {steps.map((step) => (
            <WaterfallBar key={step.id} step={step} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Footer Status Bar
// ------------------------------------------------------------
function FooterStatus({ stats }) {
  return (
    <footer
      className="bg-white rounded-lg border border-slate-200 p-4 custom-shadow flex items-center divide-x divide-slate-200"
      data-purpose="footer-status"
    >
      {stats.map((stat) => (
        <div key={stat.id} className="flex items-center gap-3 px-6 flex-1">
          <div
            className={`w-8 h-8 rounded-full ${stat.iconBg} flex items-center justify-center ${stat.iconColor}`}
          >
            <i className={stat.icon}></i>
          </div>
          <div>
            <div className="text-xs text-slate-400">{stat.label}</div>
            <div className="text-sm font-semibold text-slate-800">
              {stat.valueBold ? (
                <>
                  <span className="font-bold">{stat.valueBold}</span>
                  {stat.valueRest}
                </>
              ) : (
                stat.value
              )}
            </div>
          </div>
        </div>
      ))}
    </footer>
  );
}

// ------------------------------------------------------------
// Root component
// ------------------------------------------------------------
export default function ReconMintDashboard() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CUSTOM_STYLES }} />
      <div className="flex h-screen overflow-hidden text-slate-800">
        <Sidebar items={SIDEBAR_ITEMS} />

        <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
          <Header info={HEADER_INFO} />

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <MetricsRow metrics={METRICS} />

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-purpose="charts-row">
              <BreakdownChart data={BREAKDOWN} />
              <WaterfallChart steps={WATERFALL_STEPS} />
            </section>

            <FooterStatus stats={FOOTER_STATS} />
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
//      href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
// 3. Import and render:
//    import ReconMintDashboard from "./ReconMintDashboard";
//    export default function App() { return <ReconMintDashboard />; }
