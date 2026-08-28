import React, { useState, useCallback, useRef, useEffect } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Toast from "./components/Toast.jsx";
import UploadPage from "./pages/UploadPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import ExceptionsPage from "./pages/ExceptionsPage.jsx";
import AskPage from "./pages/AskPage.jsx";
import ReconMintLanding from "./pages/ReconMintLanding.jsx";
import * as api from "./api.js";

const RUN_STORAGE_KEY = "reconmint_last_run";

function loadStoredRun() {
  try {
    const raw = sessionStorage.getItem(RUN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
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

  useEffect(() => {
    try {
      if (run) sessionStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(run));
      else sessionStorage.removeItem(RUN_STORAGE_KEY);
    } catch {
      /* sessionStorage may be unavailable */
    }
  }, [run]);

  const showToast = useCallback((message, tone = "success") => {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const exceptionCount = run?.meta?.exceptions_total ?? null;

  const afterRun = useCallback(
    async (resp, isDemo) => {
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
          <DashboardPage
            run={run}
            evalData={evalData}
            onExport={() => run && window.open(api.auditExportUrl(run.runId), "_blank")}
            onGoUpload={() => setView("upload")}
            onGoExceptions={() => setView("exceptions")}
          />
        )}
        {view === "exceptions" && (
          <ExceptionsPage run={run} showToast={showToast}
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
