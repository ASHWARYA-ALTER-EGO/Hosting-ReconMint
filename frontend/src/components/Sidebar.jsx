import { useState, useRef, useEffect } from "react";

const NAV_ITEMS = [
  { key: "upload", label: "Upload", icon: "fa-arrow-up-from-bracket" },
  { key: "dashboard", label: "Dashboard", icon: "fa-table-columns" },
  { key: "exceptions", label: "Exceptions", icon: "fa-circle-exclamation", countKey: "exceptionCount" },
  { key: "ask", label: "Ask the agent", icon: "fa-wand-magic-sparkles" },
];

const EASE = "cubic-bezier(0.4,0,0.2,1)";

/**
 * The sidebar is its own surface, a ledger cover, not another sheet of the
 * same cream paper as the content pane it sits beside. Ink already existed
 * in the palette as a text/border color; here it gets a real job.
 */
/**
 * The sidebar is its own surface, a soft ledger wash, a shade deeper than
 * the content pane's paper so it reads as distinct without going dark.
 */
const C = {
  washTop: "#E6EFD8",      // sidebar base, top
  washBase: "#D7E4C2",     // sidebar base, subtle gradient toward the foot
  ink: "#1F2A1A",          // dark ledger ink — text, and the logo chip only
  brass: "#A9832E",        // premium hairline / seal accent, used sparingly
  red: "#B5432F",          // brand red, badges + counters
  redDeep: "#8F3323",      // active nav text, tuned for light backgrounds
  moss: "#4B7B4E",
  cream: "#FBFBF3",        // the content pane's paper, used for the CTA + toggle
  card: "#EEF3E1",         // active nav background, a touch deeper than the wash
  border: "rgba(31,42,26,0.10)",
  borderStrong: "rgba(31,42,26,0.16)",
  t60: "#5C6752",
  t40: "#8A9478",
};

const WORKSPACE_KEY = "reconmint_workspace_name_v1";

/**
 * Label that fades + slides out (rather than hard-disappearing) as the
 * sidebar collapses, so text and icons never look like they're snapping.
 */
function FadeLabel({ collapsed, className = "", children }) {
  return (
    <span
      className={`overflow-hidden whitespace-nowrap font-mono ${className}`}
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

function initialsOf(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

/**
 * App sidebar with a collapse/expand toggle.
 * Width transitions smoothly in BOTH directions, labels fade/slide instead
 * of popping, and the toggle chevron rotates 180° rather than swapping icons.
 */
export default function Sidebar({
  active = "upload",
  onNavigate = () => {},
  exceptionCount = null,
  onHome = () => {},
  workspaceName: workspaceNameProp,
  onWorkspaceNameChange,
}) {
  const [collapsed, setCollapsed] = useState(false);

  // ── editable workspace name, user input instead of a hardcoded string ──
  const [workspaceName, setWorkspaceName] = useState(() => {
    if (workspaceNameProp) return workspaceNameProp;
    try {
      return localStorage.getItem(WORKSPACE_KEY) || "Your Workspace";
    } catch {
      return "Your Workspace";
    }
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(workspaceName);
  const inputRef = useRef(null);

  useEffect(() => {
    if (workspaceNameProp && workspaceNameProp !== workspaceName) setWorkspaceName(workspaceNameProp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceNameProp]);

  useEffect(() => {
    if (editing) {
      setDraft(workspaceName);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitName = () => {
    const clean = draft.trim() || "Your Workspace";
    setWorkspaceName(clean);
    setEditing(false);
    try {
      localStorage.setItem(WORKSPACE_KEY, clean);
    } catch {
      /* best-effort persistence only */
    }
    onWorkspaceNameChange?.(clean);
  };

  return (
    <aside
      className="h-full flex-shrink-0 flex flex-col relative font-mono"
      style={{
        width: collapsed ? 72 : 260,
        transition: `width 0.25s ${EASE}`,
        overflow: "visible",
        background: `linear-gradient(180deg, ${C.washTop} 0%, ${C.washBase} 100%)`,
        borderRight: `1px solid ${C.borderStrong}`,
        boxShadow: "1px 0 0 rgba(169,131,46,0.10)",
      }}
    >
      {/* Collapse toggle — a paper tab bridging the dark cover and the cream content pane */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute top-5 w-7 h-7 rounded-full flex items-center justify-center active:scale-90 z-10"
        style={{
          right: -14,
          background: C.cream,
          border: `1px solid ${C.brass}`,
          color: C.ink,
          boxShadow: "0 1px 3px rgba(31,42,26,0.16)",
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

      {/* Brand, ledger mark, echoes "LEDGER No." on the hero */}
      <button
        type="button"
        onClick={onHome}
        title={collapsed ? "ReconMint, home" : undefined}
        className="flex items-center gap-3 px-5 pt-6 pb-5 text-left hover:opacity-90 transition-opacity duration-150"
      >
        <div
          className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
          style={{ background: C.ink, boxShadow: "0 1px 3px rgba(31,42,26,0.25)" }}
        >
          <img src="/favicon.png" alt="ReconMint" className="w-8 h-8 object-contain" />
        </div>
        <FadeLabel collapsed={collapsed} className="min-w-0 block">
          <div className="font-bold text-[20px] tracking-tight leading-tight" style={{ color: C.ink, fontFamily: "'Special Elite', monospace" }}>
            ReconMint
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] mt-0.5" style={{ color: C.brass }}>
            Ledger No. 0412 RM
          </div>
        </FadeLabel>
      </button>

      {/* brass hairline, the cover's one seam */}
      <div className="mx-5 mb-4" style={{ height: 1, background: `linear-gradient(90deg, ${C.brass} 0%, rgba(169,131,46,0) 85%)`, opacity: 0.5 }} />

      {/* Quick action, new reconciliation — inverted paper tab against the dark cover */}
      <div className="px-3 mb-2">
        <button
          type="button"
          onClick={() => onNavigate("upload")}
          title={collapsed ? "New reconciliation" : undefined}
          className="w-full flex items-center gap-2.5 rounded-lg text-sm font-semibold active:scale-[0.98] justify-center"
          style={{
            padding: collapsed ? "10px 0" : "10px 12px",
            background: C.ink,
            color: C.cream,
            boxShadow: "0 1px 3px rgba(31,42,26,0.18)",
            transition: `transform 0.1s ${EASE}, background-color 0.15s ${EASE}`,
          }}
        >
          <i className="fa-solid fa-plus text-[12px]" />
          <FadeLabel collapsed={collapsed}>New reconciliation</FadeLabel>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 flex flex-col gap-1 mt-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          const count = item.countKey === "exceptionCount" ? exceptionCount : null;
          return (
            <button
              type="button"
              key={item.key}
              onClick={() => onNavigate(item.key)}
              title={collapsed ? item.label : undefined}
              className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium active:scale-[0.98]"
              style={{
                background: isActive ? C.card : "transparent",
                color: isActive ? C.redDeep : C.t60,
                borderLeft: isActive ? `2px solid ${C.red}` : "2px solid transparent",
                transition: `background-color 0.15s ${EASE}, color 0.15s ${EASE}, transform 0.1s ${EASE}, border-color 0.15s ${EASE}`,
              }}
              onMouseOver={(e) => { if (!isActive) e.currentTarget.style.background = C.card; }}
              onMouseOut={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <span className="relative flex-shrink-0 w-4 flex items-center justify-center">
                <i className={`fa-solid ${item.icon} text-[15px] text-center block`} />
                <span
                  className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-[3px] rounded-full text-[9px] font-bold flex items-center justify-center leading-none"
                  style={{
                    background: C.red,
                    color: C.cream,
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
                  className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: isActive ? "rgba(181,67,47,0.14)" : C.cream,
                    color: isActive ? C.redDeep : C.red,
                    border: isActive ? "none" : `1px solid ${C.borderStrong}`,
                  }}
                >
                  {count > 99 ? "99+" : count}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Workspace footer, editable name, user input instead of hardcoded */}
      <div className="px-3 py-4" style={{ borderTop: `1px solid ${C.border}` }}>
        {editing && !collapsed ? (
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
              style={{ background: C.card, color: C.redDeep, border: `1px solid ${C.borderStrong}` }}
            >
              {initialsOf(draft)}
            </div>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") { setDraft(workspaceName); setEditing(false); }
              }}
              onBlur={commitName}
              maxLength={40}
              placeholder="Workspace name"
              className="min-w-0 flex-1 text-sm font-semibold bg-transparent focus:outline-none border-b"
              style={{ color: C.ink, borderColor: C.brass }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => !collapsed && setEditing(true)}
            title={collapsed ? workspaceName : "Click to rename workspace"}
            className="w-full flex items-center gap-2.5 group text-left"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
              style={{ background: C.card, color: C.redDeep, border: `1px solid ${C.borderStrong}` }}
            >
              {initialsOf(workspaceName)}
            </div>
            <FadeLabel collapsed={collapsed} className="min-w-0 block flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: C.ink }}>
                  {workspaceName}
                </div>
                <i
                  className="fa-solid fa-pen text-[9px] opacity-0 group-hover:opacity-70 transition-opacity duration-150 flex-shrink-0"
                  style={{ color: C.brass }}
                />
              </div>
              <div className="text-xs truncate" style={{ color: C.t40 }}>Workspace</div>
            </FadeLabel>
          </button>
        )}
      </div>
    </aside>
  );
}