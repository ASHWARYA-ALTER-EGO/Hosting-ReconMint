// ReconMint API layer + mappers. Talks to the FastAPI backend and adapts its snake_case /
// paise / lowercase-severity shapes into the camelCase shapes the pages render.

function resolveApiBase() {
  // 1. Build-time env var (preferred for Railway: set VITE_API_BASE_URL at build)
  const fromEnv = import.meta.env?.VITE_API_BASE_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, "");

  // 2. Runtime override via a small window global — lets a hosted deploy point
  //    at a different backend without rebuilding. Frontend hosts (Cloudflare
  //    Pages, Vercel, static Railway) can inject this in a <script> tag.
  if (typeof window !== "undefined") {
    const runtime = window.__RECONMINT_CONFIG__?.apiBaseUrl
      || window.__RECONMINT_API_BASE__;
    if (runtime) return String(runtime).replace(/\/$/, "");
  }

  // 3. localStorage override (persistent per browser). Useful for a judge who
  //    wants to point the deployed frontend at a different backend for testing.
  //    Set with: localStorage.setItem("reconmint_api_base", "https://…")
  try {
    const stored = typeof localStorage !== "undefined"
      && localStorage.getItem("reconmint_api_base");
    if (stored) return String(stored).replace(/\/$/, "");
  } catch { /* private mode */ }

  // 4. Production fallback: same-origin. Requires a reverse proxy from the
  //    frontend host to the backend for /reconcile, /runs, /ask, etc.
  if (import.meta.env?.PROD) return "";

  // 5. Local dev.
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
  let res;
  try {
    res = await fetch(API_BASE + path, opts);
  } catch (e) {
    // Network-level failure (DNS, CORS preflight refused, mixed content, offline).
    // Craft a message the user can act on instead of a bare "Failed to fetch".
    const base = API_BASE || "<same-origin>";
    throw new Error(
      `Could not reach the ReconMint backend at ${base}${path}. ` +
      `Likely causes: (1) VITE_API_BASE_URL is not set for this build - set it ` +
      `on the frontend service and redeploy; (2) the backend service is asleep or ` +
      `down; (3) CORS: set RECONMINT_CORS_ORIGINS on the backend to your frontend origin. ` +
      `Underlying error: ${e.message}`
    );
  }
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

export function saveChecklistState(decisionId, state) {
  return req(`/decisions/${decisionId}/checklist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
}

export function resolveDecision(decisionId, { reason, note } = {}) {
  return req(`/decisions/${decisionId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason || null, note: note || null }),
  });
}

export function getResolutions(runId) {
  return req(`/runs/${runId}/resolutions`);
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

export function cfoBriefUrl(runId) {
  return `${API_BASE}/runs/${runId}/cfo-brief.html`;
}

export function sourceFileUrl(name) {
  return `${API_BASE}/data/source/${name}`;
}

export function runSourceFileUrl(runId, name) {
  return `${API_BASE}/runs/${runId}/source/${name}`;
}

export function getRunBreakdown(runId) {
  return req(`/runs/${runId}/breakdown`);
}

export function getCashPosition(runId) {
  return req(`/runs/${runId}/cash-position`);
}

export function getCashForecast(runId, { horizon = 7, tPlus = 2, asOf } = {}) {
  const params = new URLSearchParams({ horizon_days: String(horizon), t_plus: String(tPlus) });
  if (asOf) params.set("as_of", asOf);
  return req(`/runs/${runId}/cash-forecast?${params.toString()}`);
}

export function getTaxExposure(runId) {
  return req(`/runs/${runId}/tax-exposure`);
}

export function getFeeSlabAdvice(runId, { multiplier = 12 } = {}) {
  return req(`/runs/${runId}/fee-slab-advice?annual_volume_multiplier=${multiplier}`);
}

export function getBenchmark() {
  return req(`/benchmark`);
}

export function getQualitySignals(runId) {
  return req(`/runs/${runId}/quality-signals`);
}

export function getRazorpayVerification(runId) {
  return req(`/runs/${runId}/razorpay-verification`);
}

export function razorpayHealth() {
  return req(`/razorpay/health`);
}

export function adjustmentMemoJsonUrl(decisionId) {
  return `${API_BASE}/decisions/${decisionId}/adjustment-memo`;
}

export function adjustmentMemoHtmlUrl(decisionId) {
  return `${API_BASE}/decisions/${decisionId}/adjustment-memo.html`;
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