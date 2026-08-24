import React from "react";

const TONES = {
  success: { bg: "#f0fdf4", border: "#d1fae5", color: "#065f46", icon: "fa-circle-check" },
  error: { bg: "#fff1f2", border: "#ffe4e6", color: "#9f1239", icon: "fa-triangle-exclamation" },
  info: { bg: "#eff6ff", border: "#dbeafe", color: "#1e40af", icon: "fa-circle-info" },
};

export default function Toast({ toast, onClose }) {
  if (!toast) return null;
  const t = TONES[toast.tone] || TONES.info;
  return (
    <div className="fixed bottom-6 right-6 z-50 toast">
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium max-w-md"
        style={{ background: t.bg, borderColor: t.border, color: t.color }}
      >
        <i className={`fa-solid ${t.icon}`}></i>
        <span>{toast.message}</span>
        <button onClick={onClose} className="ml-2 opacity-50 hover:opacity-100">
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
  );
}
