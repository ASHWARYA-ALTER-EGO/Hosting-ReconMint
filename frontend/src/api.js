// ReconMint API layer + mappers. Talks to the FastAPI backend and adapts its snake_case /
// paise / lowercase-severity shapes into the camelCase shapes the pages render.

function resolveApiBase() {
  const fromEnv = import.meta.env?.VITE_API_BASE_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, "");

  if (
    typeof window !== "undefined" &&
    window.__RECONMINT_CONFIG__ &&
    "apiBaseUrl" in window.__RECONMINT_CONFIG__
  ) {
    return String(window.__RECONMINT_CONFIG__.apiBaseUrl).replace(/\/$/, "");
  }

  // Production: same-origin (nginx on Railway proxies API routes to the backend).
  if (import.meta.env?.PROD) return "";
  return "http://localhost:8000";
}

const API_BASE = resolveApiBase();

// ---- formatting ----------------------------------------------------------
export function formatINR(n) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}

const SEVERITY_UI = { critical: "Critical", warning: "Warning", info: "Info" };

function categoryFromReason(reason) {
  switch (reason) {
    case "fee_anomaly":
      return "Amount Mismatch";
    case "no_matching_settlement":
      return "Missing in Bank";
    case "chargeback_no_credit":
      return "Chargeback";
    case "duplicate_payment_id":
      return "Duplicate";
    case "no_matching_order":
      return "No Order";
    default:
      return "Other";
  }
}

function mapException(d) {
  return {
    decisionId: d.id,
    id: d.record_ref,
    date: d.date || "—",
    amount: d.amount_rupees,
    category: categoryFromReason(d.reason),
    severity: SEVERITY_UI[d.severity] || "Info",
    matchMethod: d.match_method && d.match_method !== "none" ? d.match_method : null,
    confidence: d.confidence ? Math.round(d.confidence * 100) : null,
    status: "Unresolved",
    ledger: d.ledger || null,
    explanation: d.llm_explanation || d.explanation || "",
    isLlm: Boolean(d.llm_explanation),
    llmVerified: d.llm_verified,
    llmModel: d.llm_model,
    reason: d.reason,
    resolution: d.resolution,
  };
}

// ---- low-level fetch -----------------------------------------------------
async function req(path, opts = {}) {
  const res = await fetch(API_BASE + path, opts);
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 405) {
      throw new Error(
        "HTTP 405 — API request hit the frontend server, not the backend. " +
          "On Railway: set BACKEND_URL on the frontend service to your backend URL and redeploy " +
          "(or set VITE_API_BASE_URL at build time to the backend URL)."
      );
    }
    const detail = (body && body.detail) || (body && body.error) || `HTTP ${res.status}`;
    const message = Array.isArray(detail)
      ? detail.map((d) => d.msg || d.detail || JSON.stringify(d)).join("; ")
      : (typeof detail === "object" && detail !== null ? (detail.msg || JSON.stringify(detail)) : String(detail));
    throw new Error(message);
  }
  return body;
}

// ---- endpoints -----------------------------------------------------------
export function health() {
  return req("/health");
}

export function reconcileDemo(useLlm = true) {
  const fd = new URLSearchParams();
  fd.set("use_llm", String(useLlm));
  return req("/reconcile/demo", { method: "POST", body: fd });
}

export function reconcileUpload({ orders, settlement, bank }, useLlm = false) {
  const fd = new FormData();
  fd.append("orders", orders);
  fd.append("settlement", settlement);
  fd.append("bank", bank);
  fd.append("use_llm", String(useLlm));
  return req("/reconcile", { method: "POST", body: fd });
}

export function getRun(runId) {
  return req(`/runs/${runId}`);
}

export function getEvalDemo() {
  return req("/eval/demo");
}

export async function getExceptions(runId) {
  const data = await req(`/runs/${runId}/exceptions?limit=2000`);
  const items = (data.items || []).map(mapException);
  const counts = { all: 0, critical: 0, warning: 0, info: 0 };
  for (const e of items) {
    counts.all += 1;
    if (e.severity === "Critical") counts.critical += 1;
    else if (e.severity === "Warning") counts.warning += 1;
    else counts.info += 1;
  }
  return { items, counts, total: items.length };
}

export function resolveDecision(decisionId) {
  return req(`/decisions/${decisionId}/resolve`, { method: "POST" });
}

export function explainDecision(decisionId) {
  return req(`/decisions/${decisionId}/explain`, { method: "POST" });
}

export function askAgent(runId, question) {
  return req("/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId, question }),
  });
}

export function getAskExamples() {
  return req("/ask/examples");
}

export function auditExportUrl(runId) {
  return `${API_BASE}/runs/${runId}/audit-export?format=csv`;
}

export function sourceFileUrl(name) {
  return `${API_BASE}/data/source/${name}`;
}

// ---- UploadPage.jsx convenience wrappers ----------------------------------
// UploadPage.jsx calls these names directly. They're thin wrappers around the
// real endpoints above so there's only one source of truth for API calls —
// no separate stub/mock file needed. Adjust the useLlm defaults here if you
// want the Upload flow to behave differently from other callers.

export function reconcileFromUpload({ orders, settlement, bank }, useLlm = false) {
  return reconcileUpload({ orders, settlement, bank }, useLlm);
}

export function reconcileFromDemo(useLlm = true) {
  return reconcileDemo(useLlm);
}