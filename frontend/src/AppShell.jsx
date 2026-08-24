import React, { useState, useCallback, useRef } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Toast from "./components/Toast.jsx";
import UploadPage from "./pages/UploadPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import ExceptionsPage from "./pages/ExceptionsPage.jsx";
import AskPage from "./pages/AskPage.jsx";
import * as api from "./api.js";

export default function AppShell() {
  const [view, setView] = useState("upload");
  const [run, setRun] = useState(null); // { runId, meta, isDemo, severityCounts }
  const [evalData, setEvalData] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

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
      if (isDemo) {
        try {
          setEvalData(await api.getEvalDemo());
        } catch {
          setEvalData(null);
        }
      } else {
        setEvalData(null);
      }
      setView("dashboard");
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
    },
    [afterRun]
  );

  const runUpload = useCallback(
    async (files, useLlm = false) => {
      const resp = await api.reconcileUpload(files, useLlm);
      await afterRun(resp, false);
    },
    [afterRun]
  );

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar active={view} onNavigate={setView} exceptionCount={exceptionCount} />
      <main className="flex-1 overflow-hidden bg-[#fcfcfc]">
        {view === "upload" && (
          <UploadPage onRunDemo={runDemo} onRunUpload={runUpload} showToast={showToast} />
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
          <ExceptionsPage run={run} showToast={showToast} onGoUpload={() => setView("upload")} />
        )}
        {view === "ask" && (
          <AskPage run={run} showToast={showToast} onGoUpload={() => setView("upload")} />
        )}
      </main>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
