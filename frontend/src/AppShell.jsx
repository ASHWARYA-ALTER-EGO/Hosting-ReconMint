import React, { useState, useCallback, useRef, useEffect } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Toast from "./components/Toast.jsx";
import UploadPage from "./pages/UploadPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import ExceptionsPage from "./pages/ExceptionsPage.jsx";
import AskPage from "./pages/AskPage.jsx";
import ReconMintLanding from "./pages/ReconMintLanding.jsx";
import * as api from "./api.js";

// Session persistence — keep the operator's last run alive across page reloads and
// even browser restarts, so refreshing the tab doesn't force a re-reconcile. We
// use localStorage (survives tab close) with a 24-hour TTL, plus a cookie for
// good measure so it's visible in DevTools too. On app mount we verify the run
// still exists on the backend (a restart wipes the audit DB); if not we silently
// drop the stored run and land on the landing page.

const RUN_STORAGE_KEY = "reconmint_last_run";
const COOKIE_KEY = "reconmint_last_run";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;  // 24 hours

function readCookie(name) {
  try {
    const kv = document.cookie.split("; ").find((r) => r.startsWith(`${name}=`));
    return kv ? decodeURIComponent(kv.split("=", 2)[1]) : null;
  } catch { return null; }
}
function writeCookie(name, value, maxAgeSec) {
  try {
    const parts = [`${name}=${encodeURIComponent(value)}`, `path=/`, `max-age=${maxAgeSec}`, "SameSite=Lax"];
    document.cookie = parts.join("; ");
  } catch { /* noop */ }
}
function clearCookie(name) {
  try { document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`; } catch { /* noop */ }
}

function loadStoredRun() {
  try {
    const raw = localStorage.getItem(RUN_STORAGE_KEY);
    if (!raw) {
      // fallback: reconstruct minimal run from cookie if localStorage was cleared
      const cookieRunId = readCookie(COOKIE_KEY);
      return cookieRunId ? { runId: cookieRunId, meta: null, savedAt: 0, hydrating: true } : null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.runId) return null;
    const age = Date.now() - (parsed.savedAt || 0);
    if (age > SESSION_TTL_MS) {
      localStorage.removeItem(RUN_STORAGE_KEY);
      clearCookie(COOKIE_KEY);
      return null;
    }
    return { ...parsed, hydrating: true };  // mark for backend re-verification
  } catch {
    return null;
  }
}

export default function AppShell() {
  const [view, setView] = useState("landing");
  const [run, setRun] = useState(loadStoredRun); // { runId, meta, isDemo, severityCounts }
  const [evalData, setEvalData] = useState(null);
  const [toast, setToast] = useState(null);
  const [askPreload, setAskPreload] = useState(null); // { question, token } — one-shot handoff to AskPage
  const toastTimer = useRef(null);

  const askAbout = useCallback((question) => {
    setAskPreload({ question, token: Date.now() });
    setView("ask");
  }, []);

  // Persist run to localStorage + cookie on every change so a tab close / browser
  // restart still gives the operator their last run back within the 24h TTL.
  useEffect(() => {
    try {
      if (run && run.runId && !run.hydrating) {
        const payload = { ...run, hydrating: undefined, savedAt: Date.now() };
        localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(payload));
        writeCookie(COOKIE_KEY, run.runId, Math.floor(SESSION_TTL_MS / 1000));
      } else if (!run) {
        localStorage.removeItem(RUN_STORAGE_KEY);
        clearCookie(COOKIE_KEY);
      }
    } catch { /* storage may be unavailable */ }
  }, [run]);

  // On mount: if we loaded a stored run, verify with backend that it still exists
  // (a restart wipes the audit DB). If gone, silently clear. If present, rehydrate
  // the full meta + breakdown so the Dashboard etc. work without a re-reconcile.
  useEffect(() => {
    if (!run || !run.hydrating) return;
    let cancelled = false;
    (async () => {
      try {
        const meta = await api.getRun(run.runId);
        if (cancelled) return;
        const [breakdown, evalRes] = await Promise.all([
          api.getRunBreakdown(run.runId).catch(() => null),
          run.isDemo ? api.getEvalDemo().catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setRun({ runId: run.runId, meta, isDemo: !!run.isDemo,
                 severityCounts: run.severityCounts || null });
        if (evalRes) {
          if (breakdown) evalRes.breakdown = breakdown;
          setEvalData(evalRes);
        } else if (breakdown) {
          setEvalData({ breakdown });
        }
        showToast("Restored your last reconciliation run.");
      } catch (e) {
        // Distinguish "backend confirmed the run is gone" (404) from "backend unreachable"
        // (network / CORS / sleep). Only clear on real 404. On network error, keep the
        // stored run so the operator's data survives a bad wifi moment.
        if (cancelled) return;
        const msg = String(e?.message || "");
        if (msg.includes("not found") || msg.includes("404")) {
          setRun(null);
        } else {
          // Keep the run object; the operator can still browse Dashboard/Exceptions/Ask
          // once the backend comes back. Fetches on those pages will retry on their own.
          showToast?.("Backend unreachable, keeping your last run in memory.", "warn");
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = useCallback((message, tone = "success") => {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const exceptionCount = run?.meta?.exceptions_total ?? null;

  const afterRun = useCallback(
    async (resp, isDemo) => {
      // IMPORTANT: clear stale evalData FIRST so components never render mixed state
      // (e.g. showing the previous demo's F1 accuracy alongside a fresh upload's numbers).
      setEvalData(null);
      setRun({
        runId: resp.run_id,
        meta: resp.meta,
        severityCounts: resp.severity_counts,
        isDemo,
      });
      // For every run (demo or uploaded) fetch the mutually-exclusive breakdown so
      // the Waterfall + StackedBreakdown always render from real decisions.
      // Demo runs additionally get the eval harness (precision/recall vs ground truth).
      try {
        const [breakdown, evalRes] = await Promise.all([
          api.getRunBreakdown(resp.run_id).catch(() => null),
          isDemo ? api.getEvalDemo().catch(() => null) : Promise.resolve(null),
        ]);
        if (evalRes) {
          if (breakdown) evalRes.breakdown = breakdown;
          setEvalData(evalRes);
        } else if (breakdown) {
          setEvalData({ breakdown });
        } else {
          setEvalData(null);
        }
      } catch {
        setEvalData(null);
      }
      showToast(
        `Reconciliation complete. ${resp.meta.settlement_active} records in ${resp.meta.elapsed_seconds}s.`
      );
    },
    [showToast]
  );

  const runDemo = useCallback(
    async (useLlm = false) => {
      const resp = await api.reconcileDemo(useLlm);
      await afterRun(resp, true);
      return resp;
    },
    [afterRun]
  );

  const runUpload = useCallback(
    async (files, useLlm = false) => {
      const resp = await api.reconcileUpload(files, useLlm);
      await afterRun(resp, false);
      return resp;
    },
    [afterRun]
  );

  // The landing page is full-bleed (no app sidebar). Its CTAs enter the app at Upload.
  if (view === "landing") {
    return (
      <div className="h-screen overflow-y-auto">
        <ReconMintLanding
          onGetStarted={() => setView("upload")}
          onWatchDemo={() => setView("upload")}
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar active={view} onNavigate={setView} exceptionCount={exceptionCount} onHome={() => setView("landing")} />
      <main className="flex-1 overflow-hidden bg-[#fcfcfc]">
        {view === "upload" && (
          <UploadPage onRunDemo={runDemo} onRunUpload={runUpload} showToast={showToast}
            onGoDashboard={() => setView("dashboard")} />
        )}
        {view === "dashboard" && (
          // key={run?.runId} force-remounts every child on run change so no card can
          // ever render mixed state from a previous run (belt + suspenders on top of
          // the per-component useEffect resets).
          <DashboardPage
            key={run?.runId || "no-run"}
            run={run}
            evalData={evalData}
            onExport={() => run && window.open(api.auditExportUrl(run.runId), "_blank")}
            onGoUpload={() => setView("upload")}
            onGoExceptions={() => setView("exceptions")}
          />
        )}
        {view === "exceptions" && (
          <ExceptionsPage key={run?.runId || "no-run"} run={run} showToast={showToast}
            onGoUpload={() => setView("upload")}
            onAskAbout={askAbout} />
        )}
        {view === "ask" && (
          <AskPage run={run} showToast={showToast}
            onGoUpload={() => setView("upload")}
            preload={askPreload} />
        )}
      </main>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
