import React from "react";

const ITEMS = [
  { id: "upload", label: "Upload", icon: "fa-solid fa-arrow-up-from-bracket" },
  { id: "dashboard", label: "Dashboard", icon: "fa-solid fa-table-columns" },
  { id: "exceptions", label: "Exceptions", icon: "fa-solid fa-circle-exclamation" },
  { id: "ask", label: "Ask the agent", icon: "fa-solid fa-wand-magic-sparkles" },
  { id: "reports", label: "Reports", icon: "fa-regular fa-file-lines", badge: "Soon" },
  { id: "data-sources", label: "Data Sources", icon: "fa-solid fa-database", badge: "Soon" },
  { id: "reconciliations", label: "Reconciliations", icon: "fa-solid fa-arrows-rotate", badge: "Soon" },
  { id: "settings", label: "Settings", icon: "fa-solid fa-gear", badge: "Soon" },
];

export default function Sidebar({ active, onNavigate, exceptionCount }) {
  return (
    <aside className="w-72 bg-white border-r border-slate-100 flex flex-col justify-between h-full overflow-y-auto flex-shrink-0">
      <div>
        <div className="p-8 flex items-center">
          <i className="fa-solid fa-layer-group text-slate-800 text-2xl mr-3"></i>
          <span className="text-xl font-semibold text-slate-900 tracking-tight">ReconMint</span>
        </div>
        <nav className="px-6 mt-2">
          {ITEMS.map((item) => {
            const disabled = Boolean(item.badge);
            return (
              <div
                key={item.id}
                onClick={() => !disabled && onNavigate(item.id)}
                className={`sidebar-item ${active === item.id ? "active" : ""} ${
                  disabled ? "opacity-60 cursor-default" : ""
                }`}
              >
                <i className={item.icon}></i>
                <span>{item.label}</span>
                {item.id === "exceptions" && exceptionCount != null && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                    {exceptionCount}
                  </span>
                )}
                {item.badge && <span className="badge">{item.badge}</span>}
              </div>
            );
          })}
        </nav>
      </div>
      <div className="p-6 border-t border-slate-100">
        <div className="flex items-center p-3 rounded-xl">
          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center mr-3 text-slate-500 border border-slate-200">
            <i className="fa-regular fa-user text-sm"></i>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800">FinNext Pvt. Ltd.</div>
            <div className="text-xs text-slate-500 mt-0.5">Workspace</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
