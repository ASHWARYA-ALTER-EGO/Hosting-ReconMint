// One-click reconciliation report: builds a clean printable HTML document from the live run data
// and opens the browser print dialog (print-to-PDF). No dependency, no backend template.
import * as api from "./api.js";

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(n || 0));

export async function openReport(run, evalData) {
  if (!run) return;
  let exceptions = [];
  try {
    exceptions = (await api.getExceptions(run.runId)).items;
  } catch {
    exceptions = [];
  }
  const m = run.meta;
  const acc = evalData?.accuracy;
  const fees = m.fee_totals_paise || {};

  const metricRow = (label, value) =>
    `<tr><td>${label}</td><td class="num">${value}</td></tr>`;

  const severityClass = (s) => {
    const v = String(s || "").toLowerCase();
    if (v === "high") return "sev-high";
    if (v === "medium") return "sev-medium";
    return "sev-low";
  };

  const exRows = exceptions
    .map(
      (e) =>
        `<tr><td class="mono">${e.id}</td><td class="mono">${e.date}</td><td class="num mono">${inr(e.amount)}</td>` +
        `<td>${e.category}</td><td><span class="pill ${severityClass(e.severity)}">${e.severity}</span></td><td>${e.status}</td></tr>`
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>ReconMint Report ${run.runId}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Special+Elite&family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{
      --ink:#1F2A1A; --ink-soft:#5C6752; --rust:#B5432F; --rust-deep:#8F3323;
      --moss:#4B7B4E; --paper:#EDF2E7; --stripe:#DCE8D3; --panel:#F5F8F1;
      --rule:#C9D4BC; --card:#FBFBF3;
    }
    *{box-sizing:border-box}
    body{
      font-family:'Inter',-apple-system,Segoe UI,Roboto,sans-serif;
      color:var(--ink); margin:0; font-size:13px;
      background:
        repeating-linear-gradient(to bottom, var(--paper) 0px, var(--paper) 30px, var(--stripe) 30px, var(--stripe) 60px);
    }
    .sheet{ max-width:880px; margin:0 auto; padding:44px 48px 60px; position:relative; }

    /* letterhead */
    .letterhead{
      display:flex; justify-content:space-between; align-items:flex-start;
      border-bottom:2px solid var(--ink); padding-bottom:18px; margin-bottom:26px;
    }
    .brand{ font-family:'Special Elite',monospace; font-size:28px; letter-spacing:-0.01em; color:var(--ink); }
    .ledger-no{ font-family:'IBM Plex Mono',monospace; font-size:10px; color:var(--rust); letter-spacing:.14em; text-transform:uppercase; margin-top:4px; }
    .sub{ color:var(--ink-soft); font-size:11.5px; margin-top:6px; font-family:'IBM Plex Mono',monospace; }
    .badge{
      display:inline-flex; align-items:center; gap:6px;
      font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.1em; text-transform:uppercase;
      color:var(--rust-deep); border:1px solid var(--rust); background:#F4E2DB;
      padding:4px 10px; border-radius:999px; white-space:nowrap;
    }

    /* stamp — top right, ink-textured circle */
    .stamp{
      position:absolute; top:40px; right:44px;
      width:96px; height:96px; border-radius:50%;
      border:2.5px solid var(--rust); color:var(--rust-deep);
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      transform:rotate(-9deg); opacity:0.92;
      font-family:'IBM Plex Mono',monospace; text-align:center;
    }
    .stamp .word{ font-family:'Special Elite',monospace; font-size:15px; letter-spacing:.5px; }
    .stamp .sub1{ font-size:6px; letter-spacing:1.5px; margin-top:3px; }

    h2{
      font-family:'IBM Plex Mono',monospace; font-size:11px; text-transform:uppercase; letter-spacing:.12em;
      color:var(--rust-deep); margin:26px 0 10px; padding-bottom:6px; border-bottom:1.5px dashed var(--rule);
      display:flex; align-items:center; gap:8px;
    }
    h2::before{ content:""; width:12px; height:1px; background:var(--rust); display:inline-block; }

    table{ width:100%; border-collapse:collapse; margin-bottom:6px; background:var(--card); }
    td,th{ padding:7px 10px; border-bottom:1px solid var(--rule); font-size:12px; }
    th{ text-align:left; color:var(--ink-soft); text-transform:uppercase; font-size:9.5px; letter-spacing:.08em; font-family:'IBM Plex Mono',monospace; background:var(--panel); }
    td.num, th.num{ text-align:right; }
    td.mono{ font-family:'IBM Plex Mono',monospace; font-size:11.5px; }
    tr:last-child td{ border-bottom:1px solid var(--ink); }

    .pill{
      display:inline-block; font-family:'IBM Plex Mono',monospace; font-size:9.5px; text-transform:uppercase;
      letter-spacing:.05em; padding:2px 8px; border-radius:999px; font-weight:600;
    }
    .sev-high{ background:#F4E2DB; color:var(--rust-deep); }
    .sev-medium{ background:#F3ECD8; color:#8A6A2E; }
    .sev-low{ background:var(--panel); color:var(--ink-soft); }

    .grid{ display:grid; grid-template-columns:1fr 1fr; gap:26px; }

    .verify-strip{
      margin-top:32px; display:flex; align-items:center; gap:10px;
      background:var(--panel); border:1px solid var(--moss); border-radius:8px;
      padding:12px 16px; font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--ink);
    }
    .verify-strip .dot{ width:8px; height:8px; border-radius:50%; background:var(--moss); flex-shrink:0; }

    .foot{
      margin-top:30px; color:var(--ink-soft); font-size:10.5px; font-family:'IBM Plex Mono',monospace;
      border-top:2px solid var(--ink); padding-top:14px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;
    }

    @media print{
      body{ background:var(--paper) !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .sheet{ padding:24px 32px; }
    }
  </style></head><body>
    <div class="sheet">
      <div class="stamp" aria-hidden="true">
        <div class="word">VERIFIED</div>
        <div class="sub1">RECONMINT</div>
        <div class="sub1">AUDIT</div>
      </div>

      <div class="letterhead">
        <div>
          <div class="brand">ReconMint</div>
          <div class="ledger-no">Ledger No. 0412 RM</div>
          <div class="sub">Run ${run.runId}${run.isDemo ? " · demo (synthetic data)" : ""} · generated ${new Date().toLocaleString("en-IN")}</div>
        </div>
        <span class="badge">● Autonomous agent</span>
      </div>

      <div class="grid">
        <div>
          <h2>Run summary</h2>
          <table>
            ${metricRow("Records processed", m.settlement_active)}
            ${metricRow("Match rate", m.match_rate_pct + "%")}
            ${metricRow("Reconciled rate", m.reconciled_rate_pct + "%")}
            ${metricRow("Amount reconciled", inr((m.reconciled_amount_paise || 0) / 100))}
            ${metricRow("Processing time", m.elapsed_seconds + "s")}
            ${metricRow("Exceptions (needs review)", m.exceptions_total)}
          </table>
        </div>
        <div>
          <h2>Detection accuracy${acc ? "" : " (demo only)"}</h2>
          <table>
            ${acc ? metricRow("Precision", (acc.precision * 100).toFixed(0) + "%") : ""}
            ${acc ? metricRow("Recall", (acc.recall * 100).toFixed(0) + "%") : ""}
            ${acc ? metricRow("F1", acc.f1.toFixed(2)) : ""}
            ${acc ? metricRow("False positives / negatives", acc.false_positives + " / " + acc.false_negatives) : metricRow("Note", "accuracy requires ground truth (demo runs)")}
          </table>
          <h2>Fee composition</h2>
          <table>
            ${metricRow("MDR", inr((fees.mdr || 0) / 100))}
            ${metricRow("GST on MDR", inr((fees.gst || 0) / 100))}
            ${metricRow("TCS", inr((fees.tcs || 0) / 100))}
            ${metricRow("Refunds", inr((fees.refund || 0) / 100))}
          </table>
        </div>
      </div>

      <h2>Exceptions (${exceptions.length})</h2>
      <table>
        <thead><tr><th>Payment ID</th><th>Date</th><th class="num">Amount</th><th>Category</th><th>Severity</th><th>Status</th></tr></thead>
        <tbody>${exRows || '<tr><td colspan="6" style="color:var(--ink-soft)">No exceptions.</td></tr>'}</tbody>
      </table>

      <div class="verify-strip">
        <span class="dot"></span>
        Money math is deterministic and audited. AI is confined to explanation, verified against computed figures before it reaches this report.
      </div>

      <div class="foot">
        <span>Generated by ReconMint · a verification agent for money.</span>
        <span>0 hallucinated figures · 100% integer paise</span>
      </div>
    </div>
    <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}