import React from "react";

// Bottom-fixed navigation for mobile viewports (<768px). Replaces the desktop
// sidebar, which is hidden below md: because its 260px eats the entire phone
// canvas. Icons are big enough for 44px tap targets, brand palette matches
// the sidebar so a user swapping between phone and desktop feels continuity.

const NAV = [
  { key: "upload", label: "Upload", icon: "fa-arrow-up-from-bracket" },
  { key: "dashboard", label: "Dashboard", icon: "fa-table-columns" },
  { key: "exceptions", label: "Exceptions", icon: "fa-circle-exclamation", countKey: "exceptionCount" },
  { key: "ask", label: "Ask", icon: "fa-wand-magic-sparkles" },
];

const C = {
  wash: "#E6EFD8",
  ink: "#1F2A1A",
  redDeep: "#8F3323",
  red: "#B5432F",
  cream: "#FBFBF3",
  t60: "#5C6752",
  borderStrong: "rgba(31,42,26,0.16)",
  card: "#EEF3E1",
};

export default function MobileNav({ active = "upload", onNavigate = () => {}, exceptionCount = null, onHome = () => {} }) {
  return (
    <>
      {/* Top bar: brand + home tap, only on mobile */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-2.5"
        style={{
          background: C.wash,
          borderBottom: `1px solid ${C.borderStrong}`,
          boxShadow: "0 1px 3px rgba(31,42,26,0.06)",
        }}
      >
        <button
          type="button"
          onClick={onHome}
          className="flex items-center gap-2 active:scale-[0.98]"
          aria-label="ReconMint home"
        >
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center overflow-hidden flex-shrink-0"
            style={{ background: C.ink }}
          >
            <img src="/favicon.png" alt="" className="w-6 h-6 object-contain" />
          </div>
          <span
            className="font-bold text-[15px] tracking-tight"
            style={{ color: C.ink, fontFamily: "'Special Elite', monospace" }}
          >
            ReconMint
          </span>
        </button>
      </header>

      {/* Bottom nav bar, four tabs */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4"
        style={{
          background: C.wash,
          borderTop: `1px solid ${C.borderStrong}`,
          boxShadow: "0 -2px 8px rgba(31,42,26,0.08)",
          paddingBottom: "env(safe-area-inset-bottom, 0)",
        }}
      >
        {NAV.map((item) => {
          const isActive = item.key === active;
          const count = item.countKey === "exceptionCount" ? exceptionCount : null;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] active:scale-95 relative"
              style={{
                color: isActive ? C.redDeep : C.t60,
                background: isActive ? C.card : "transparent",
                transition: "background-color 0.15s, color 0.15s, transform 0.1s",
              }}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="relative">
                <i className={`fa-solid ${item.icon} text-[18px]`} />
                {count > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center leading-none"
                    style={{ background: C.red, color: C.cream }}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-semibold tracking-tight leading-none mt-1">{item.label}</span>
              {isActive && (
                <span
                  className="absolute top-0 left-2 right-2 h-[2px]"
                  style={{ background: C.red }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}
