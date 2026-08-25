import { useState } from "react";

const NAV_ITEMS = [
  { key: "upload", label: "Upload", icon: "fa-arrow-up-from-bracket" },
  { key: "dashboard", label: "Dashboard", icon: "fa-table-columns" },
  { key: "exceptions", label: "Exceptions", icon: "fa-circle-exclamation", countKey: "exceptionCount" },
  { key: "ask", label: "Ask the agent", icon: "fa-wand-magic-sparkles" },
];

const EASE = "cubic-bezier(0.4,0,0.2,1)";

/**
 * Label that fades + slides out (rather than hard-disappearing) as the
 * sidebar collapses, so text and icons never look like they're snapping.
 */
function FadeLabel({ collapsed, className = "", children }) {
  return (
    <span
      className={`overflow-hidden whitespace-nowrap ${className}`}
      style={{
        maxWidth: collapsed ? 0 : 200,
        opacity: collapsed ? 0 : 1,
        transform: collapsed ? "translateX(-6px)" : "translateX(0)",
        transition: `max-width 0.25s ${EASE}, opacity 0.15s ${EASE}, transform 0.25s ${EASE}`,
      }}
    >
      {children}
    </span>
  );
}

/**
 * App sidebar with a collapse/expand toggle.
 * Width transitions smoothly in BOTH directions (same `transition` applies
 * regardless of collapsed state), labels fade/slide instead of popping,
 * and the toggle chevron rotates 180° rather than swapping icons.
 */
export default function Sidebar({
  active = "upload",
  onNavigate = () => {},
  exceptionCount = null,
  onHome = () => {},
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="h-full flex-shrink-0 bg-white border-r border-slate-100 flex flex-col relative"
      style={{
        width: collapsed ? 72 : 260,
        transition: `width 0.25s ${EASE}`,
        overflow: "visible",
      }}
    >
      {/* Collapse toggle — floats on the top-right edge of the sidebar */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute top-5 w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 text-slate-400 hover:text-slate-700 flex items-center justify-center active:scale-90 z-10"
        style={{
          right: -14,
          transition: `right 0.25s ${EASE}, box-shadow 0.15s ${EASE}, color 0.15s ${EASE}, border-color 0.15s ${EASE}, transform 0.1s ${EASE}`,
        }}
      >
        <i
          className="fa-solid fa-chevron-left text-[11px]"
          style={{
            display: "inline-block",
            transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
            transition: `transform 0.25s ${EASE}`,
          }}
        />
      </button>

      {/* Brand */}
      <button
        type="button"
        onClick={onHome}
        title={collapsed ? "ReconMint — home" : undefined}
        className="flex items-center gap-2.5 px-5 py-5 text-left hover:opacity-80 transition-opacity duration-150"
      >
        <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0 overflow-hidden">
          <img 
            src="/favicon.png" 
            alt="ReconMint" 
            className="w-5 h-5 object-contain" 
          />
        </div>
        <FadeLabel collapsed={collapsed} className="font-bold text-slate-900 text-[17px] tracking-tight">
          ReconMint
        </FadeLabel>
      </button>

      {/* Nav */}
      <nav className="flex-1 px-3 flex flex-col gap-1 mt-2">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          const count = item.countKey === "exceptionCount" ? exceptionCount : null;
          return (
            <button
              type="button"
              key={item.key}
              onClick={() => onNavigate(item.key)}
              title={collapsed ? item.label : undefined}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium active:scale-[0.98] ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              }`}
              style={{ transition: `background-color 0.15s ${EASE}, color 0.15s ${EASE}, transform 0.1s ${EASE}` }}
            >
              <span className="relative flex-shrink-0 w-4 flex items-center justify-center">
                <i className={`fa-solid ${item.icon} text-[15px] text-center block`} />
                <span
                  className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none"
                  style={{
                    opacity: collapsed && count > 0 ? 1 : 0,
                    transform: collapsed && count > 0 ? "scale(1)" : "scale(0)",
                    transition: `opacity 0.2s ${EASE}, transform 0.2s ${EASE}`,
                  }}
                >
                  {count > 99 ? "99+" : count}
                </span>
              </span>

              <FadeLabel collapsed={collapsed}>{item.label}</FadeLabel>

              <span
                className="ml-auto"
                style={{
                  opacity: !collapsed && count > 0 ? 1 : 0,
                  transform: !collapsed && count > 0 ? "scale(1)" : "scale(0.5)",
                  transition: `opacity 0.2s ${EASE}, transform 0.2s ${EASE}`,
                }}
              >
                <span
                  className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-blue-100 text-blue-700" : "bg-red-50 text-red-600"
                  }`}
                >
                  {count > 99 ? "99+" : count}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Workspace footer */}
      <div className="border-t border-slate-100 px-3 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
            <i className="fa-solid fa-user text-slate-400 text-xs" />
          </div>
          <FadeLabel collapsed={collapsed} className="min-w-0 block">
            <div className="text-sm font-semibold text-slate-900 truncate">
              FinNext Pvt. Ltd.
            </div>
            <div className="text-xs text-slate-400 truncate">Workspace</div>
          </FadeLabel>
        </div>
      </div>
    </aside>
  );
}