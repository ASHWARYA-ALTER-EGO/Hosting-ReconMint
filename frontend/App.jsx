import React, { useState, useEffect, useCallback, useMemo } from "react";

/* ============================================================
   MOCK DATA (copied from the original static HTML)
   ============================================================ */

const RAW_EXCEPTIONS = [
  {
    id: "pay_R2T70LJ9M1",
    date: "26 May 2025",
    amount: 15730.0,
    category: "Amount Mismatch",
    severity: "Critical",
    matchMethod: null,
    confidence: null,
    status: "Unresolved",
  },
  {
    id: "pay_M8X91K2LQ3",
    date: "26 May 2025",
    amount: 12499.0,
    category: "Amount Mismatch",
    severity: "Critical",
    matchMethod: null,
    confidence: null,
    status: "Unresolved",
  },
  {
    id: "pay_P9281JH7D2",
    date: "26 May 2025",
    amount: 9980.0,
    category: "Fee Explained",
    severity: "Warning",
    matchMethod: "Rules (Fees)",
    confidence: 100,
    status: "Unresolved",
  },
  {
    id: "pay_WQN82QK3P8",
    date: "26 May 2025",
    amount: 2199.0,
    category: "Missing in Bank",
    severity: "Critical",
    matchMethod: null,
    confidence: null,
    status: "Unresolved",
  },
  {
    id: "pay_L7Y90XP1B4",
    date: "26 May 2025",
    amount: 7499.0,
    category: "Fee Explained",
    severity: "Warning",
    matchMethod: "Rules (Fees)",
    confidence: 100,
    status: "Unresolved",
  },
  {
    id: "pay_Z6Q31RM8Y5",
    date: "26 May 2025",
    amount: 1250.0,
    category: "Amount Mismatch",
    severity: "Critical",
    matchMethod: null,
    confidence: null,
    status: "Unresolved",
  },
  {
    id: "pay_G3J86NT4K9",
    date: "26 May 2025",
    amount: 18640.0,
    category: "Other",
    severity: "Info",
    matchMethod: null,
    confidence: null,
    status: "Unresolved",
  },
  {
    id: "pay_B1P25VZ6R0",
    date: "26 May 2025",
    amount: 4780.0,
    category: "Missing in Bank",
    severity: "Critical",
    matchMethod: null,
    confidence: null,
    status: "Unresolved",
  },
];

// Pad list to 19 total records to match the sidebar/tab badge counts from the design.
const MOCK_EXCEPTIONS = [...RAW_EXCEPTIONS];
for (let i = MOCK_EXCEPTIONS.length; i < 19; i++) {
  const base = RAW_EXCEPTIONS[i % RAW_EXCEPTIONS.length];
  MOCK_EXCEPTIONS.push({ ...base, id: `${base.id}_${i}` });
}

const DEFAULT_DETAIL_TEMPLATE = {
  orderId: "order_9F2H3K",
  customer: "Amit Sharma",
  dateTime: "26 May 2025, 09:41 AM",
  ledgerLines: [
    { particulars: "Gross (Order Amount)", expected: 15730.0, actual: 15730.0, delta: 0 },
    { particulars: "(-) MDR (2.00%)", expected: 314.6, actual: 314.6, delta: 0, isSubItem: true },
    { particulars: "(-) Gateway Fee", expected: 15.0, actual: 15.0, delta: 0, isSubItem: true },
    { particulars: "(-) GST (18% on fees)", expected: 59.33, actual: 59.33, delta: 0, isSubItem: true },
    { particulars: "(-) TCS (1% of Gross)", expected: 157.3, actual: 157.3, delta: 0, isSubItem: true },
  ],
  ledgerTotals: { expectedNet: 15183.77, actualNet: 15183.0 },
  variance: -0.77,
  verifiedAgainstCount: 7,
  aiExplanation: {
    summary:
      "Gateway rounded fees to 2 decimals before tax calculation, causing a minor difference.",
    verdict: "No action required.",
    verified: true,
    confidencePct: 99.2,
    sourceCount: 2,
    factsVerifiedCount: 4,
  },
};

const MOCK_SIDEBAR_ITEMS = [
  { id: "upload", label: "Upload", icon: "fa-solid fa-arrow-up-from-bracket", active: false },
  { id: "dashboard", label: "Dashboard", icon: "fa-solid fa-chart-pie", active: false },
  { id: "exceptions-nav", label: "Exceptions", icon: "fa-solid fa-circle-exclamation", active: false },
  { id: "exceptions", label: "Exceptions", icon: "fa-regular fa-file-lines", active: true, badgeCount: 19 },
  { id: "reconciliations", label: "Reconciliations", icon: "fa-solid fa-gear", active: false },
  { id: "settings", label: "Settings", icon: "fa-solid fa-sliders", active: false },
];

/* ============================================================
   API SERVICE LAYER
   ============================================================
   Everything network-related lives in this block. Swap USE_MOCKS
   to false once your backend endpoints are live — every function
   already contains the exact fetch() call needed, commented out
   and ready to uncomment.

   HOW TO CONNECT TO A REAL BACKEND:
   1. Set API_BASE_URL below (or wire it to an env var, e.g.
      import.meta.env.VITE_API_BASE_URL for Vite, or
      process.env.REACT_APP_API_BASE_URL for CRA).
   2. Set USE_MOCKS = false.
   3. Uncomment the real fetch() implementation inside each
      function and delete/comment out the mock branch.
   4. If your API requires auth, fill in getAuthHeaders() below —
      every real call already spreads ...getAuthHeaders() into
      its headers object.
   5. Adjust field names in the response mapping if your backend's
      JSON shape differs from what's documented per-endpoint.
   ============================================================ */

// ---- Configuration -----------------------------------------------------

/** Toggle this to false once real endpoints are wired up. */
const USE_MOCKS = true;

/**
 * Base URL for all API requests. In a real project, prefer an env var:
 *   Vite:  import.meta.env.VITE_API_BASE_URL
 *   CRA:   process.env.REACT_APP_API_BASE_URL
 * Falls back to a relative path so it works behind a reverse proxy too.
 */
const API_BASE_URL = "/api/v1";

/**
 * Centralized endpoint paths. Update these to match your backend's
 * actual routes — everything else in this file references these
 * constants, so you only need to change them in one place.
 */
const ENDPOINTS = {
  // GET    -> list exceptions for a given reconciliation run
  EXCEPTIONS_LIST: (runId) => `${API_BASE_URL}/runs/${runId}/exceptions`,
  // GET    -> single exception detail
  EXCEPTION_DETAIL: (id) => `${API_BASE_URL}/exceptions/${id}`,
  // POST   -> resolve a single exception
  EXCEPTION_RESOLVE: (id) => `${API_BASE_URL}/decisions/${id}/resolve`,
  // GET    -> sidebar navigation items
  NAVIGATION: `${API_BASE_URL}/navigation`,
};

/**
 * The active reconciliation run this UI is scoped to.
 * TODO: Replace with the real run id — e.g. pulled from route params
 * (React Router: useParams()), a global app context/store, or a
 * "current run" selector elsewhere in the app.
 */
const CURRENT_RUN_ID = "run_current";

/**
 * Returns auth headers to attach to every authenticated request.
 * TODO: Wire this up to your actual auth solution, e.g.:
 *   const token = localStorage.getItem("authToken");
 *   return token ? { Authorization: `Bearer ${token}` } : {};
 * Or if using cookies/session auth, you may not need this at all —
 * just make sure fetch() calls include `credentials: "include"`.
 */
function getAuthHeaders() {
  return {
    // Authorization: `Bearer ${yourTokenHere}`,
  };
}

/**
 * Shared response handler: throws a descriptive Error for non-2xx
 * responses so calling hooks can surface it via their `error` state.
 * TODO: Adjust to match your backend's error envelope, e.g. if errors
 * come back as { error: { message, code } } instead of { message }.
 */
async function handleResponse(response) {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {
      // Response wasn't JSON — fall back to status-based message.
    }
    throw new Error(message);
  }
  // Handle "204 No Content" style responses (e.g. some DELETE/POST endpoints).
  if (response.status === 204) return null;
  return response.json();
}

// ---- Mock helpers (used only while USE_MOCKS === true) -----------------

function delay(ms = 300 + Math.random() * 500) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maybeThrow(context) {
  if (Math.random() < 0.05) {
    throw new Error(`Simulated network error while ${context}`);
  }
}

function computeSeverityCounts() {
  const counts = { all: 0, critical: 0, warning: 0, info: 0 };
  for (const e of MOCK_EXCEPTIONS) {
    counts.all += 1;
    if (e.severity === "Critical") counts.critical += 1;
    else if (e.severity === "Warning") counts.warning += 1;
    else counts.info += 1;
  }
  return counts;
}

// ---- Endpoint: List Exceptions ------------------------------------------

/**
 * Fetch a paginated, filterable list of exceptions.
 *
 * REAL ENDPOINT:
 *   GET {API_BASE_URL}/runs/{runId}/exceptions
 *   Query params:
 *     - severity   string   "Critical" | "Warning" | "Info" | "All" (omit or "All" = no filter)
 *     - page       number   1-indexed page number
 *     - page_size  number   items per page (default 8)
 *     - search     string   free-text search, matched against payment_id
 *
 * EXPECTED RESPONSE SHAPE (200):
 *   {
 *     "exceptions": [
 *       {
 *         "id": "pay_R2T70LJ9M1",
 *         "date": "26 May 2025",
 *         "amount": 15730.00,
 *         "category": "Amount Mismatch",   // "Amount Mismatch" | "Fee Explained" | "Missing in Bank" | "Other"
 *         "severity": "Critical",          // "Critical" | "Warning" | "Info"
 *         "matchMethod": null,             // string | null
 *         "confidence": null,              // number (0-100) | null
 *         "status": "Unresolved"           // "Unresolved" | "Resolved"
 *       },
 *       ...
 *     ],
 *     "severity_counts": { "all": 19, "critical": 12, "warning": 4, "info": 3 },
 *     "total": 19
 *   }
 *
 * ERROR RESPONSES:
 *   400 - invalid query params (e.g. bad severity value)
 *   401 - unauthenticated
 *   404 - run id not found
 *   500 - server error
 *
 * @param {Object} params
 * @param {"All"|"Critical"|"Warning"|"Info"} [params.severity="All"]
 * @param {number} [params.page=1]
 * @param {number} [params.pageSize=8]
 * @param {string} [params.search=""]
 * @returns {Promise<{ exceptions: Array<Object>, severityCounts: Object, total: number }>}
 */
async function fetchExceptions({ severity = "All", page = 1, pageSize = 8, search = "" }) {
  if (USE_MOCKS) {
    await delay();
    maybeThrow("fetching exceptions");

    let filtered = MOCK_EXCEPTIONS;
    if (severity !== "All") {
      filtered = filtered.filter((e) => e.severity === severity);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((e) => e.id.toLowerCase().includes(q));
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);

    return {
      exceptions: pageItems,
      severityCounts: computeSeverityCounts(),
      total,
    };
  }

  // ---- REAL IMPLEMENTATION (uncomment once backend is live) -----------
  // const url = new URL(ENDPOINTS.EXCEPTIONS_LIST(CURRENT_RUN_ID), window.location.origin);
  // if (severity && severity !== "All") url.searchParams.set("severity", severity);
  // url.searchParams.set("page", String(page));
  // url.searchParams.set("page_size", String(pageSize));
  // if (search) url.searchParams.set("search", search);
  //
  // const response = await fetch(url.toString(), {
  //   method: "GET",
  //   headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  //   credentials: "include", // remove if not using cookie-based auth
  // });
  // const data = await handleResponse(response);
  //
  // // Map snake_case backend fields to the camelCase shape the UI expects.
  // return {
  //   exceptions: data.exceptions,
  //   severityCounts: {
  //     all: data.severity_counts.all,
  //     critical: data.severity_counts.critical,
  //     warning: data.severity_counts.warning,
  //     info: data.severity_counts.info,
  //   },
  //   total: data.total,
  // };

  throw new Error("fetchExceptions: real API not yet connected (USE_MOCKS is true)");
}

// ---- Endpoint: Exception Detail ------------------------------------------

/**
 * Fetch full detail for a single exception (powers the right-hand drawer).
 *
 * REAL ENDPOINT:
 *   GET {API_BASE_URL}/exceptions/{id}
 *
 * EXPECTED RESPONSE SHAPE (200):
 *   {
 *     "id": "pay_R2T70LJ9M1",
 *     "orderId": "order_9F2H3K",
 *     "customer": "Amit Sharma",
 *     "date": "26 May 2025",
 *     "dateTime": "26 May 2025, 09:41 AM",
 *     "amount": 15730.00,
 *     "category": "Amount Mismatch",
 *     "severity": "Critical",
 *     "status": "Unresolved",
 *     "ledgerLines": [
 *       { "particulars": "Gross (Order Amount)", "expected": 15730.00, "actual": 15730.00, "delta": 0, "isSubItem": false },
 *       { "particulars": "(-) MDR (2.00%)",       "expected": 314.60,  "actual": 314.60,  "delta": 0, "isSubItem": true },
 *       ...
 *     ],
 *     "ledgerTotals": { "expectedNet": 15183.77, "actualNet": 15183.00 },
 *     "variance": -0.77,
 *     "verifiedAgainstCount": 7,
 *     "aiExplanation": {
 *       "summary": "Gateway rounded fees to 2 decimals before tax calculation, causing a minor difference.",
 *       "verdict": "No action required.",
 *       "verified": true,
 *       "confidencePct": 99.2,
 *       "sourceCount": 2,
 *       "factsVerifiedCount": 4
 *     }
 *   }
 *
 * ERROR RESPONSES:
 *   401 - unauthenticated
 *   404 - exception id not found
 *   500 - server error
 *
 * @param {string} id - the exception/payment id, e.g. "pay_R2T70LJ9M1"
 * @returns {Promise<Object>} full exception detail object
 */
async function fetchExceptionById(id) {
  if (USE_MOCKS) {
    await delay();
    maybeThrow(`fetching exception ${id}`);

    const summary = MOCK_EXCEPTIONS.find((e) => e.id === id) || MOCK_EXCEPTIONS[0];
    return {
      ...summary,
      ...DEFAULT_DETAIL_TEMPLATE,
      orderId: `order_${id.slice(-6).toUpperCase()}`,
    };
  }

  // ---- REAL IMPLEMENTATION (uncomment once backend is live) -----------
  // const response = await fetch(ENDPOINTS.EXCEPTION_DETAIL(id), {
  //   method: "GET",
  //   headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  //   credentials: "include",
  // });
  // return handleResponse(response);

  throw new Error("fetchExceptionById: real API not yet connected (USE_MOCKS is true)");
}

// ---- Endpoint: Resolve Exception ------------------------------------------

/**
 * Mark an exception as resolved, optionally attaching a resolution note.
 *
 * REAL ENDPOINT:
 *   POST {API_BASE_URL}/decisions/{id}/resolve
 *   Request body:
 *     { "resolution_note": "Confirmed rounding difference, closing out." }
 *
 * EXPECTED RESPONSE SHAPE (200):
 *   { "success": true }
 *
 * ERROR RESPONSES:
 *   400 - invalid/missing note if your backend requires one
 *   401 - unauthenticated
 *   404 - exception id not found
 *   409 - exception already resolved / conflicting state
 *   500 - server error
 *
 * @param {string} id - the exception/payment id to resolve
 * @param {string} [note] - optional free-text resolution note
 * @returns {Promise<{ success: boolean }>}
 */
async function resolveException(id, note) {
  if (USE_MOCKS) {
    await delay();
    maybeThrow(`resolving exception ${id}`);
    console.info(`[mock] resolved ${id} with note:`, note || "(none)");
    return { success: true };
  }

  // ---- REAL IMPLEMENTATION (uncomment once backend is live) -----------
  // const response = await fetch(ENDPOINTS.EXCEPTION_RESOLVE(id), {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  //   credentials: "include",
  //   body: JSON.stringify({ resolution_note: note ?? "" }),
  // });
  // return handleResponse(response);

  throw new Error("resolveException: real API not yet connected (USE_MOCKS is true)");
}

// ---- Endpoint: Sidebar Navigation ------------------------------------------

/**
 * Fetch sidebar navigation items (labels, icons, active state, badge counts).
 *
 * REAL ENDPOINT:
 *   GET {API_BASE_URL}/navigation
 *
 * EXPECTED RESPONSE SHAPE (200):
 *   [
 *     { "id": "upload",       "label": "Upload",         "icon": "fa-solid fa-arrow-up-from-bracket", "path": "/upload",       "active": false },
 *     { "id": "dashboard",    "label": "Dashboard",      "icon": "fa-solid fa-chart-pie",             "path": "/dashboard",    "active": false },
 *     { "id": "exceptions",   "label": "Exceptions",     "icon": "fa-regular fa-file-lines",          "path": "/exceptions",   "active": true, "badgeCount": 19 },
 *     { "id": "reconciliations", "label": "Reconciliations", "icon": "fa-solid fa-gear",              "path": "/reconciliations", "active": false },
 *     { "id": "settings",     "label": "Settings",       "icon": "fa-solid fa-sliders",               "path": "/settings",     "active": false }
 *   ]
 *
 * NOTE: `icon` values are expected to be full Font Awesome class strings
 * (e.g. "fa-solid fa-gear") so they can be dropped directly into an <i> tag.
 *
 * ERROR RESPONSES:
 *   401 - unauthenticated
 *   500 - server error
 *
 * @returns {Promise<Array<Object>>}
 */
async function fetchSidebarItems() {
  if (USE_MOCKS) {
    await delay(200 + Math.random() * 200);
    maybeThrow("fetching sidebar items");
    return MOCK_SIDEBAR_ITEMS;
  }

  // ---- REAL IMPLEMENTATION (uncomment once backend is live) -----------
  // const response = await fetch(ENDPOINTS.NAVIGATION, {
  //   method: "GET",
  //   headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  //   credentials: "include",
  // });
  // return handleResponse(response);

  throw new Error("fetchSidebarItems: real API not yet connected (USE_MOCKS is true)");
}

/* ============================================================
   HELPERS
   ============================================================ */

const fmt = (n) =>
  Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CATEGORY_STYLE = {
  "Amount Mismatch": "bg-red-50 text-red-700 border-red-100/50",
  "Fee Explained": "bg-amber-50 text-amber-700 border-amber-100/50",
  "Missing in Bank": "bg-purple-50 text-purple-700 border-purple-100/50",
  Other: "bg-slate-100 text-slate-600 border-slate-200/50",
};

const SEVERITY_DOT = {
  Critical: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]",
  Warning: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]",
  Info: "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]",
};

const SEVERITY_PILL = {
  Critical: "bg-red-100 text-red-700",
  Warning: "bg-amber-100 text-amber-700",
  Info: "bg-blue-100 text-blue-700",
};

/* ============================================================
   CUSTOM HOOKS
   ============================================================ */

function useDebounce(value, delayMs = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function useExceptions(debouncedSearch, pageSize = 8) {
  const [exceptions, setExceptions] = useState([]);
  const [severityCounts, setSeverityCounts] = useState({ all: 0, critical: 0, warning: 0, info: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [severityFilter, setSeverityFilterState] = useState("All");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const setSeverityFilter = useCallback((s) => {
    setSeverityFilterState(s);
    setPage(1);
  }, []);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchExceptions({
          severity: severityFilter,
          page,
          pageSize,
          search: debouncedSearch,
        });
        if (!cancelled) {
          setExceptions(result.exceptions);
          setSeverityCounts(result.severityCounts);
          setTotal(result.total);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load exceptions");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [severityFilter, page, pageSize, debouncedSearch, reloadToken]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  return {
    exceptions,
    severityCounts,
    total,
    page,
    pageSize,
    totalPages,
    isLoading,
    error,
    severityFilter,
    setSeverityFilter,
    setPage,
    refetch,
  };
}

function useExceptionDetail(id) {
  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchExceptionById(id);
        if (!cancelled) setDetail(result);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load exception detail");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, reloadToken]);

  const resolve = useCallback(
    async (note) => {
      if (!id) return false;
      setIsResolving(true);
      setResolveError(null);
      try {
        const result = await resolveException(id, note);
        if (result.success) {
          setDetail((prev) => (prev ? { ...prev, status: "Resolved" } : prev));
        }
        return result.success;
      } catch (err) {
        setResolveError(err.message || "Failed to resolve exception");
        return false;
      } finally {
        setIsResolving(false);
      }
    },
    [id]
  );

  return { detail, isLoading, error, isResolving, resolveError, resolve, refetch };
}

/* ============================================================
   SUB-COMPONENTS
   ============================================================ */

function Sidebar() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchSidebarItems()
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="w-72 border-r border-gray-100 bg-white/60 backdrop-blur-sm flex flex-col flex-shrink-0">
      <div className="p-8 flex items-center space-x-3 mb-4">
        <div className="bg-gradient-to-tr from-blue-600 to-indigo-500 p-2 rounded-xl shadow-sm">
          <i className="fa-solid fa-cube text-white text-xl" />
        </div>
        <span className="font-bold text-xl tracking-tight text-slate-800">ReconMint</span>
      </div>
      <nav className="flex-1 px-6 space-y-1.5">
        {items.map((item) =>
          item.active ? (
            <div key={item.id} className="pt-2 pb-1">
              <a
                href="#"
                className="flex items-center justify-between px-4 py-3 bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.15)] border border-blue-50/50 text-blue-700 rounded-xl transition-all duration-200 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 to-transparent" />
                <div className="flex items-center space-x-3 relative z-10">
                  <i className={`${item.icon} w-5 text-center text-blue-600`} />
                  <span className="font-semibold text-sm tracking-wide text-slate-800">
                    {item.label}
                  </span>
                </div>
                {item.badgeCount !== undefined && (
                  <span className="bg-red-500 text-white shadow-sm text-xs font-semibold px-2.5 py-0.5 rounded-full relative z-10">
                    {item.badgeCount}
                  </span>
                )}
              </a>
            </div>
          ) : (
            <a
              key={item.id}
              href="#"
              className="flex items-center space-x-3 px-4 py-3 text-slate-500 hover:text-slate-900 hover:bg-slate-50/80 rounded-xl transition-all duration-200"
            >
              <i className={`${item.icon} w-5 text-center opacity-80`} />
              <span className="font-medium text-sm tracking-wide">{item.label}</span>
            </a>
          )
        )}
      </nav>
    </aside>
  );
}

function SeverityTabs({ active, counts, onChange }) {
  const TABS = [
    { key: "All", label: "All", countKey: "all" },
    { key: "Critical", label: "Critical", countKey: "critical" },
    { key: "Warning", label: "Warning", countKey: "warning" },
    { key: "Info", label: "Info", countKey: "info" },
  ];

  return (
    <div className="flex space-x-8 text-sm">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`pb-4 -mb-[17px] font-medium flex items-center space-x-2 transition-colors ${
              isActive
                ? "border-b-2 border-blue-600 font-semibold text-slate-900"
                : "text-slate-400 hover:text-slate-700"
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "bg-slate-50 text-slate-500 border border-slate-100"
              }`}
            >
              {counts[tab.countKey]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ExceptionsToolbar({ severityFilter, severityCounts, searchInput, onSeverityChange, onSearchChange }) {
  return (
    <div className="px-8 pt-6 pb-4 flex justify-between items-end border-b border-slate-100/60">
      <SeverityTabs active={severityFilter} counts={severityCounts} onChange={onSeverityChange} />
      <div className="flex space-x-3 mb-2">
        <div className="relative group">
          <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm group-focus-within:text-blue-500 transition-colors" />
          <input
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-4 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all focus:bg-white placeholder-slate-400"
            placeholder="Search by Payment ID..."
            type="text"
          />
        </div>
        <button className="flex items-center space-x-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all bg-white shadow-sm">
          <i className="fa-solid fa-filter text-slate-400" />
          <span>Filter</span>
        </button>
        <button className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all bg-white shadow-sm">
          <i className="fa-solid fa-ellipsis" />
        </button>
      </div>
    </div>
  );
}

function ExceptionRow({ exception, isSelected, onSelect }) {
  return (
    <tr
      onClick={() => onSelect(exception.id)}
      className={`transition-colors cursor-pointer group ${
        isSelected ? "bg-blue-50/20 hover:bg-blue-50/30" : "hover:bg-slate-50/80"
      }`}
    >
      <td className="py-5 px-6 pl-8">
        <input
          type="checkbox"
          checked={isSelected}
          readOnly
          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 shadow-sm"
        />
      </td>
      <td
        className={`py-5 px-6 font-semibold transition-colors ${
          isSelected ? "text-slate-900 group-hover:text-blue-700" : "font-medium text-slate-700"
        }`}
      >
        {exception.id}
      </td>
      <td className="py-5 px-6 text-slate-500 font-medium">{exception.date}</td>
      <td className="py-5 px-6 text-right font-medium text-slate-900">{fmt(exception.amount)}</td>
      <td className="py-5 px-6">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border shadow-sm ${
            CATEGORY_STYLE[exception.category] || CATEGORY_STYLE.Other
          }`}
        >
          {exception.category}
        </span>
      </td>
      <td className="py-5 px-6">
        <div className="flex items-center space-x-2">
          {isSelected ? (
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </div>
          ) : (
            <div className={`w-2 h-2 rounded-full ${SEVERITY_DOT[exception.severity]}`} />
          )}
          <span className="text-slate-700 font-medium">{exception.severity}</span>
        </div>
      </td>
      <td className="py-5 px-6 text-slate-500 font-medium">
        {exception.matchMethod ?? <span className="text-slate-300">—</span>}
      </td>
      <td className="py-5 px-6 text-slate-500 font-medium">
        {exception.confidence !== null ? `${exception.confidence}%` : <span className="text-slate-300">—</span>}
      </td>
      <td
        className={`py-5 px-6 font-semibold ${
          exception.status === "Resolved" ? "text-emerald-500" : "text-red-500"
        }`}
      >
        {exception.status}
      </td>
    </tr>
  );
}

const COLUMNS = [
  "",
  "Payment ID",
  "Date",
  "Amount (₹)",
  "Category",
  "Severity",
  "Match Method",
  "Confidence",
  "Status",
];

function ExceptionsTable({ exceptions, selectedId, isLoading, error, onSelect, onRetry }) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
            {COLUMNS.map((col, i) => (
              <th
                key={col || `col-${i}`}
                className={`py-4 px-6 ${i === 0 ? "pl-8 w-12" : ""} ${
                  col === "Amount (₹)" ? "text-right" : ""
                }`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-sm divide-y divide-slate-50/80">
          {isLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={`skeleton-${i}`}>
                <td colSpan={COLUMNS.length} className="py-5 px-8">
                  <div className="h-4 bg-slate-100 rounded animate-pulse w-full" />
                </td>
              </tr>
            ))}

          {!isLoading && error && (
            <tr>
              <td colSpan={COLUMNS.length} className="py-16 text-center">
                <p className="text-sm font-semibold text-red-600 mb-2">Couldn't load exceptions</p>
                <p className="text-xs text-slate-400 mb-4">{error}</p>
                <button
                  onClick={onRetry}
                  className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors"
                >
                  Retry
                </button>
              </td>
            </tr>
          )}

          {!isLoading && !error && exceptions.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="py-16 text-center text-slate-400 text-sm">
                No exceptions match your filters.
              </td>
            </tr>
          )}

          {!isLoading &&
            !error &&
            exceptions.map((exception) => (
              <ExceptionRow
                key={exception.id}
                exception={exception}
                isSelected={exception.id === selectedId}
                onSelect={onSelect}
              />
            ))}
        </tbody>
      </table>
    </div>
  );
}

function PaginationFooter({ page, totalPages, pageSize, total, onPageChange }) {
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const pageNumbers = useMemo(() => {
    const pages = [];
    const maxButtons = 3;
    let start = Math.max(1, page - 1);
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    for (let p = start; p <= end; p++) pages.push(p);
    return pages;
  }, [page, totalPages]);

  return (
    <div className="p-6 border-t border-slate-100 bg-white/50 flex justify-between items-center text-sm text-slate-500">
      <span className="font-medium">
        Showing {rangeStart} to {rangeEnd} of {total}
      </span>
      <div className="flex space-x-2 shadow-sm rounded-lg p-1 bg-white border border-slate-100">
        {pageNumbers.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`w-8 h-8 flex items-center justify-center rounded-md font-semibold transition-colors ${
              p === page ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-600 font-medium"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-50 text-slate-600 font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <i className="fa-solid fa-chevron-right text-xs" />
        </button>
      </div>
    </div>
  );
}

function ExceptionsListPanel({ selectedId, onSelect }) {
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 350);

  const {
    exceptions,
    severityCounts,
    total,
    page,
    totalPages,
    pageSize,
    isLoading,
    error,
    severityFilter,
    setSeverityFilter,
    setPage,
    refetch,
  } = useExceptions(debouncedSearch);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-transparent px-8 py-8">
      <header className="mb-8">
        <div className="flex items-center space-x-4 mb-2">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Exceptions</h1>
          <span className="bg-red-50 text-red-600 border border-red-100 shadow-sm text-sm font-semibold px-3 py-1 rounded-full">
            {severityCounts.all}
          </span>
        </div>
        <p className="text-slate-500 text-sm font-medium">Unresolved records requiring review</p>
      </header>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <ExceptionsToolbar
          severityFilter={severityFilter}
          severityCounts={severityCounts}
          searchInput={searchInput}
          onSeverityChange={setSeverityFilter}
          onSearchChange={setSearchInput}
        />
        <ExceptionsTable
          exceptions={exceptions}
          selectedId={selectedId}
          isLoading={isLoading}
          error={error}
          onSelect={onSelect}
          onRetry={refetch}
        />
        <PaginationFooter
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}

function LedgerTable({ lines, totals }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100/80 mb-8 overflow-hidden">
      <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          LEDGER (Computed vs Bank)
        </h3>
      </div>
      <div className="p-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs border-b border-slate-50">
              <th className="font-medium text-left py-3 px-4">Particulars</th>
              <th className="font-medium text-right py-3 px-4">Expected (₹)</th>
              <th className="font-medium text-right py-3 px-4">Actual (₹)</th>
              <th className="font-medium text-right py-3 px-4">Δ (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {lines.map((line) => (
              <tr key={line.particulars} className="hover:bg-slate-50/50 transition-colors">
                <td
                  className={`py-3 px-4 relative ${
                    line.isSubItem ? "text-slate-500 pl-8" : "text-slate-800 font-medium"
                  }`}
                >
                  {line.isSubItem && (
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-[1px] bg-slate-300" />
                  )}
                  {line.particulars}
                </td>
                <td className="py-3 px-4 text-right text-slate-600">{fmt(line.expected)}</td>
                <td className="py-3 px-4 text-right text-slate-600">{fmt(line.actual)}</td>
                <td className="py-3 px-4 text-right text-slate-300">{fmt(line.delta)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-100 bg-slate-50/30">
            <tr>
              <td className="py-4 px-4 font-semibold text-slate-900">
                Expected Net <span className="font-normal text-slate-500 text-xs ml-1">(Calculated)</span>
              </td>
              <td className="py-4 px-4" />
              <td className="py-4 px-4 text-right font-semibold text-slate-900">{fmt(totals.expectedNet)}</td>
              <td className="py-4 px-4 text-right text-slate-300">—</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-semibold text-slate-900 border-t border-slate-100 border-dashed">
                Actual Net <span className="font-normal text-slate-500 text-xs ml-1">(Bank)</span>
              </td>
              <td className="py-3 px-4 border-t border-slate-100 border-dashed" />
              <td className="py-3 px-4 text-right font-semibold text-slate-900 border-t border-slate-100 border-dashed">
                {fmt(totals.actualNet)}
              </td>
              <td className="py-3 px-4 text-right text-slate-300 border-t border-slate-100 border-dashed">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function VarianceSection({ variance, verifiedAgainstCount }) {
  return (
    <>
      <div className="flex justify-between items-center mb-6 px-2">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">VARIANCE</h3>
        <div className="bg-red-50 text-red-600 border border-red-100 px-3 py-1 rounded-full font-bold text-sm shadow-sm">
          {variance < 0 ? "- " : "+ "}₹ {fmt(Math.abs(variance))}
        </div>
      </div>
      <div className="bg-gradient-to-r from-emerald-50 to-green-50/50 border border-emerald-100/50 rounded-xl p-4 mb-6 flex items-start space-x-4 shadow-sm">
        <div className="bg-white rounded-full p-1.5 shadow-sm border border-emerald-100 mt-0.5">
          <i className="fa-solid fa-check text-emerald-500 w-3 h-3 flex items-center justify-center text-[10px]" />
        </div>
        <div>
          <div className="text-sm font-semibold text-emerald-800">
            Verified against {verifiedAgainstCount} computed figures
          </div>
          <div className="text-xs text-emerald-600 mt-1 font-medium">
            All monetary values verified. No unsupported figures.
          </div>
        </div>
      </div>
    </>
  );
}

function AIExplanationCard({ explanation }) {
  return (
    <div className="relative bg-white rounded-2xl p-6 border border-blue-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-50 rounded-full blur-2xl opacity-60" />
      <div className="relative z-10">
        <div className="flex items-center space-x-3 mb-4">
          <div className="bg-blue-50 p-2 rounded-lg border border-blue-100/50 shadow-sm">
            <i className="fa-solid fa-wand-magic-sparkles text-blue-600 text-sm" />
          </div>
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            AI-GENERATED EXPLANATION{" "}
            {explanation.verified && (
              <span className="bg-green-100/50 text-green-700 border border-green-200/50 px-2 py-0.5 rounded-md normal-case font-semibold ml-2 text-[10px] shadow-sm">
                Verified
              </span>
            )}
          </h4>
        </div>
        <p className="text-sm text-slate-700 mb-3 leading-relaxed font-medium">{explanation.summary}</p>
        <p className="text-sm text-slate-900 font-bold mb-5">{explanation.verdict}</p>
        <div className="flex items-center space-x-3 text-xs text-slate-500 font-medium pt-4 border-t border-slate-100">
          <div className="flex items-center space-x-1.5">
            <i className="fa-solid fa-bullseye text-slate-400" />
            <span>{explanation.confidencePct}%</span>
          </div>
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span>{explanation.sourceCount} sources</span>
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span>{explanation.factsVerifiedCount} facts verified</span>
        </div>
      </div>
    </div>
  );
}

function DetailHeader({ detail, onClose }) {
  return (
    <div className="p-8 pb-6 border-b border-slate-200/50">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{detail.id}</h2>
          <div className="flex items-center space-x-2 mt-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                SEVERITY_PILL[detail.severity]
              }`}
            >
              {detail.severity}
            </span>
            <span className="text-slate-400 text-xs">•</span>
            <span className="text-slate-500 text-sm">{detail.status}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 transition-colors bg-white hover:bg-slate-50 p-2 rounded-full shadow-sm border border-slate-100"
        >
          <i className="fa-solid fa-xmark w-4 h-4 text-center" />
        </button>
      </div>
      <div className="bg-white/60 rounded-xl p-5 border border-slate-100/50 shadow-sm">
        <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
          <div className="text-slate-500 font-medium">Order ID</div>
          <div className="text-slate-900 text-right font-semibold">{detail.orderId}</div>
          <div className="text-slate-500 font-medium">Customer</div>
          <div className="text-slate-900 text-right font-medium">{detail.customer}</div>
          <div className="text-slate-500 font-medium">Date</div>
          <div className="text-slate-900 text-right font-medium">{detail.dateTime}</div>
          <div className="text-slate-500 font-medium">Amount</div>
          <div className="text-slate-900 text-right font-bold text-base">₹ {fmt(detail.amount)}</div>
        </div>
      </div>
    </div>
  );
}

function DetailFooter({ isResolving, isResolved, onResolve }) {
  return (
    <div className="p-6 border-t border-slate-200/50 flex space-x-4 bg-white/50 backdrop-blur-md">
      <button className="px-5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
        Previous
      </button>
      <div className="flex-1 flex rounded-xl shadow-[0_4px_14px_0_rgb(0,118,255,0.39)] hover:shadow-[0_6px_20px_rgba(0,118,255,0.23)] transition-all">
        <button
          onClick={onResolve}
          disabled={isResolving || isResolved}
          className="flex-1 px-5 py-2.5 bg-blue-600 border border-transparent rounded-l-xl text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isResolved ? "Resolved" : isResolving ? "Resolving..." : "Mark as Resolved"}
        </button>
        <button className="px-4 py-2.5 bg-blue-600 border-l border-blue-700/50 rounded-r-xl text-white hover:bg-blue-700 focus:outline-none transition-colors">
          <i className="fa-solid fa-chevron-down text-sm" />
        </button>
      </div>
    </div>
  );
}

function ExceptionDetailPanel({ exceptionId, onClose }) {
  const [activeTab, setActiveTab] = useState("Evidence");
  const { detail, isLoading, error, isResolving, resolveError, resolve, refetch } =
    useExceptionDetail(exceptionId);

  if (!exceptionId) {
    return (
      <aside className="w-[500px] glass-panel border-l border-white/20 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.1)] z-10 flex flex-col flex-shrink-0 items-center justify-center">
        <p className="text-sm text-slate-400 px-8 text-center">
          Select an exception from the list to see details.
        </p>
      </aside>
    );
  }

  return (
    <aside className="w-[500px] glass-panel border-l border-white/20 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.1)] z-10 flex flex-col flex-shrink-0">
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center space-y-3">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Loading exception...</p>
          </div>
        </div>
      )}

      {!isLoading && error && (
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="text-center">
            <p className="text-sm font-semibold text-red-600 mb-2">Couldn't load this exception</p>
            <p className="text-xs text-slate-400 mb-4">{error}</p>
            <button
              onClick={refetch}
              className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!isLoading && !error && detail && (
        <>
          <DetailHeader detail={detail} onClose={onClose} />

          <div className="flex border-b border-slate-200/50 px-8 text-sm">
            {["Evidence", "Explanation", "Audit Trail"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-2 mr-6 -mb-px font-medium transition-colors ${
                  activeTab === tab
                    ? "border-b-2 border-blue-600 font-semibold text-slate-900"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-8">
            {activeTab === "Evidence" && (
              <>
                <LedgerTable lines={detail.ledgerLines} totals={detail.ledgerTotals} />
                <VarianceSection variance={detail.variance} verifiedAgainstCount={detail.verifiedAgainstCount} />
                <AIExplanationCard explanation={detail.aiExplanation} />
              </>
            )}
            {activeTab === "Explanation" && <AIExplanationCard explanation={detail.aiExplanation} />}
            {activeTab === "Audit Trail" && (
              <p className="text-sm text-slate-400">No audit trail entries yet.</p>
            )}
            {resolveError && <p className="text-xs text-red-500 mt-4">{resolveError}</p>}
          </div>

          <DetailFooter isResolving={isResolving} isResolved={detail.status === "Resolved"} onResolve={() => resolve()} />
        </>
      )}
    </aside>
  );
}

/* ============================================================
   ROOT APP COMPONENT
   ============================================================ */

export default function App() {
  const [selectedId, setSelectedId] = useState("pay_R2T70LJ9M1");

  return (
    <div className="text-gray-800 h-screen flex overflow-hidden" style={{
      fontFamily: "'Inter', sans-serif",
      backgroundColor: "#f8fafc",
      backgroundImage:
        "radial-gradient(at 0% 0%, hsla(217,100%,97%,1) 0px, transparent 50%), radial-gradient(at 100% 0%, hsla(210,100%,97%,1) 0px, transparent 50%)",
    }}>
      <Sidebar />
      <main className="flex-1 flex overflow-hidden">
        <ExceptionsListPanel selectedId={selectedId} onSelect={setSelectedId} />
        <ExceptionDetailPanel exceptionId={selectedId} onClose={() => setSelectedId(null)} />
      </main>
    </div>
  );
}
