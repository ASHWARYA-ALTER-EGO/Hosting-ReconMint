import React, { useEffect, useRef, useState } from "react";

/**
 * ReconMint landing page, v4.
 *
 * Same ledger-book design language throughout: greenbar paper, tractor-feed
 * perforation, a rubber ink stamp, carbon-copy receipts. This pass:
 *  - replaces the unpkg-based Lenis loader (blocked by artifact sandbox CSP,
 *    which is why scroll silently failed) with a dependency-free rAF smooth
 *    scroll + smooth anchor-nav, so it actually works in this environment.
 *  - blows the ink stamp up into a real hero moment.
 *  - adds a set of restrained premium touches: a gold progress rail, a
 *    letterpress emboss on headings, a gloss sweep on primary buttons, a
 *    cursor-tracked spotlight on feature cards, and a heavier, more tactile
 *    stamp with a paper-crease shadow under it.
 *
 * Swap YOUR_NAME and YOUR_GITHUB_URL below with your real details.
 */

const YOUR_NAME = "Ashwarya Pradhan";
const YOUR_GITHUB_URL = "https://github.com/pradhanashwarya2122";
const YOUR_GITHUB_HANDLE = "@pradhanashwarya2122";
const REPO_URL = "https://github.com/pradhanashwarya2122";

// Swap for the real demo video's YouTube ID.
const DEMO_VIDEO_ID = "dQw4w9WgXcQ";

const FONT_IMPORT_URL =
  "https://fonts.googleapis.com/css2?family=Special+Elite&family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap";

const INK = "#22301F";
const INK_SOFT = "#55624F";
const PAPER = "#EDF2E7";
const STRIPE = "#DCE8D3";
const RULE = "#B7C4AC";
const STAMP_RED = "#A8402F";
const CARBON_BLUE = "#35507A";
const VERIFY_GREEN = "#2E6B4C";
const PANEL = "#F5F8F1";
const GOLD = "#C9A24B";
const GOLD_SOFT = "#D9C08A";

// ---------------------------------------------------------------------------
// Dependency-free smooth scroll. No external <script> tags (blocked by the
// sandbox CSP, which silently killed the old Lenis loader) — instead we
// intercept the wheel and rAF-lerp window.scrollTo, and smooth-scroll any
// in-page #anchor click. Respects prefers-reduced-motion.
// ---------------------------------------------------------------------------
function useSmoothScroll() {
  // Most CRA/Vite boilerplates set html/body/#root to height:100% with
  // overflow:hidden so their own SPA shell can scroll an inner container
  // instead. That silently caps window scroll at zero on localhost even
  // though this component itself is fine — this forces the page's own
  // scroll chain back on for every ancestor up to <html>.
  useEffect(() => {
    const styleTag = document.createElement("style");
    styleTag.setAttribute("data-reconmint-scroll-fix", "");
    styleTag.textContent = `
      html, body { height: auto !important; min-height: 100%; overflow-y: auto !important; overflow-x: hidden; }
      #root, #__next { min-height: 100%; overflow: visible !important; height: auto !important; }
    `;
    document.head.appendChild(styleTag);
    return () => styleTag.remove();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let current = window.scrollY;
    let target = window.scrollY;
    let raf = null;
    const ease = 0.09;
    const maxScroll = () =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    function onWheel(e) {
      // let horizontal-only gestures and pinch-zoom pass through untouched
      if (e.ctrlKey) return;
      e.preventDefault();
      target = Math.min(maxScroll(), Math.max(0, target + e.deltaY));
    }

    function loop() {
      current += (target - current) * ease;
      if (Math.abs(target - current) < 0.4) current = target;
      window.scrollTo(0, current);
      raf = requestAnimationFrame(loop);
    }

    function onAnchorClick(e) {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href").slice(1);
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      target = Math.min(
        maxScroll(),
        Math.max(0, el.getBoundingClientRect().top + window.scrollY - 84)
      );
    }

    // keep the lerp target honest if the browser scrolls us directly
    // (scrollbar drag, keyboard, touch)
    function onNativeScroll() {
      if (Math.abs(window.scrollY - current) > 90) {
        current = window.scrollY;
        target = window.scrollY;
      }
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("click", onAnchorClick);
    window.addEventListener("scroll", onNativeScroll, { passive: true });
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("wheel", onWheel);
      document.removeEventListener("click", onAnchorClick);
      window.removeEventListener("scroll", onNativeScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Reveal, fades and lifts a block into place the first time it enters view.
// ---------------------------------------------------------------------------
function Reveal({ children, delay = 0, y = 22, style, as: Tag = "div" }) {
  const ref = React.useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            obs.unobserve(el);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      style={{
        ...style,
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : `translateY(${y}px)`,
        transition: `opacity 0.72s cubic-bezier(.16,1,.3,1) ${delay}ms, transform 0.82s cubic-bezier(.16,1,.3,1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Scroll state, used to give the header quiet depth once the page moves
// ---------------------------------------------------------------------------
function useScrolled(threshold = 12) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

// ---------------------------------------------------------------------------
// Gold read-progress rail — a quiet, premium substitute for a plain scroll
// bar; reads as a ledger's running balance line rather than a UI widget.
// ---------------------------------------------------------------------------
function ProgressRail() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      aria-hidden="true"
      style={{ position: "fixed", top: 0, left: 0, right: 0, height: 2, zIndex: 40, background: "rgba(34,48,31,0.08)" }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${GOLD_SOFT}, ${GOLD})`,
          boxShadow: `0 0 6px ${GOLD}88`,
          transition: "width 0.08s linear",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Perforation, tractor feed holes down a margin
// ---------------------------------------------------------------------------
function Perforation({ side }) {
  const holes = new Array(30).fill(0);
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        [side]: 10,
        width: 20,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "18px 0",
        zIndex: 3,
      }}
    >
      {holes.map((_, i) => (
        <span
          key={i}
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: "#f7faf4",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.28)",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Torn paper divider between sections
// ---------------------------------------------------------------------------
function TornDivider({ flip }) {
  const w = 1200;
  const segs = 60;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const x = (w / segs) * i;
    const seedy = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
    const y = 8 + Math.sin(i * 1.7) * 3 + (i % 3 === 0 ? seedy * 5 : 0);
    pts.push(`${x},${y.toFixed(1)}`);
  }
  const path = `M0,0 L0,${pts[0].split(",")[1]} L${pts.join(" L")} L${w},0 Z`;
  return (
    <svg
      viewBox={`0 0 ${w} 20`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: "16px", display: "block", transform: flip ? "scaleY(-1)" : "none" }}
    >
      <path d={path} fill={PAPER} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The signature moment: a rubber stamp that slams into place. Bigger, more
// textured, with a faint paper-crease shadow so it reads as physically
// struck rather than pasted on.
// ---------------------------------------------------------------------------
function InkStamp({ label = "VERIFIED", color = STAMP_RED, delay = 0, size = 120 }) {
  const [struck, setStruck] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStruck(true), 500 + delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {/* crease shadow struck into the paper */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "6%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34,48,31,0.18), transparent 70%)",
          opacity: 0,
          filter: "blur(3px)",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transform: struck ? "rotate(-9deg) scale(1)" : "rotate(-9deg) scale(2.4)",
          opacity: struck ? 0.94 : 0,
          transition: "transform 0.32s cubic-bezier(.2,1.8,.3,1), opacity 0.18s ease",
          filter: "url(#reconInkTexture)",
          pointerEvents: "none",
        }}
      >
        <svg viewBox="0 0 200 200" width="100%" height="100%">
          <circle cx="100" cy="100" r="93" fill="none" stroke={color} strokeWidth="6" />
          <circle cx="100" cy="100" r="83" fill="none" stroke={color} strokeWidth="2" />
          <circle cx="100" cy="100" r="79" fill="none" stroke={color} strokeWidth="0.75" strokeDasharray="1.5 3" />
          <text x="100" y="93" textAnchor="middle" fontFamily="'Special Elite', monospace" fontSize="26" fill={color} letterSpacing="1">
            {label}
          </text>
          <text x="100" y="112" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="8.5" fill={color} letterSpacing="2.5">
            RECONMINT · TRACK 4
          </text>
          <text x="100" y="128" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="9.5" fill={color} letterSpacing="2.5">
            0 UNPROVEN RUPEES
          </text>
        </svg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo video, a ledger-styled lightbox around a YouTube embed
// ---------------------------------------------------------------------------
function VideoModal({ videoId, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(20,26,17,0.72)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        animation: "reconFadeIn 0.2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(880px, 100%)",
          background: PAPER,
          border: `2px solid ${INK}`,
          boxShadow: "10px 12px 0 rgba(0,0,0,0.28)",
          padding: "14px 14px 18px",
          animation: "reconPopIn 0.28s cubic-bezier(.2,1.4,.3,1)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
            padding: "0 4px",
          }}
        >
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.12em", color: INK_SOFT }}>
            {"// "}DEMO REEL, 2 MIN
          </span>
          <button
            onClick={onClose}
            aria-label="Close demo video"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              fontWeight: 600,
              color: INK,
              background: "transparent",
              border: `1.5px solid ${RULE}`,
              padding: "5px 11px",
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            CLOSE ✕
          </button>
        </div>
        <div
          style={{
            position: "relative",
            width: "100%",
            paddingTop: "56.25%",
            background: INK,
            border: `1.5px solid ${INK}`,
            overflow: "hidden",
          }}
        >
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            title="ReconMint demo"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------
function Eyebrow({ children, color = INK_SOFT }) {
  return (
    <div
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "11px",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color,
        marginBottom: "12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ width: 14, height: 1, background: color, opacity: 0.55, display: "inline-block" }} />
      {children}
    </div>
  );
}

// Primary/secondary button with a restrained gloss sweep on hover — the one
// "shine" moment on the page, so it doesn't compete with the stamp.
function LedgerButton({ children, primary, big, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        overflow: "hidden",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: big ? "14px" : "13px",
        fontWeight: 600,
        padding: big ? "14px 26px" : "12px 22px",
        border: `1.5px solid ${primary ? INK : RULE}`,
        background: primary ? INK : hover ? "rgba(34,48,31,0.04)" : "transparent",
        color: primary ? PAPER : INK,
        cursor: "pointer",
        letterSpacing: "0.02em",
        borderRadius: "2px",
        transform: hover ? "translateY(-1px)" : "translateY(0)",
        boxShadow: hover
          ? primary
            ? "3px 4px 0 rgba(34,48,31,0.35)"
            : "2px 3px 0 rgba(34,48,31,0.12)"
          : primary
          ? "2px 2px 0 rgba(34,48,31,0.25)"
          : "1px 1px 0 rgba(34,48,31,0.08)",
        transition: "all 0.18s ease",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: hover ? "120%" : "-40%",
          width: "35%",
          background: primary
            ? "linear-gradient(115deg, transparent, rgba(237,242,231,0.35), transparent)"
            : `linear-gradient(115deg, transparent, ${GOLD_SOFT}55, transparent)`,
          transition: "left 0.6s cubic-bezier(.2,1,.3,1)",
          pointerEvents: "none",
        }}
      />
      <span style={{ position: "relative" }}>{children}</span>
    </button>
  );
}

// Architecture rendered as a literal DR / AI / CR ledger spread
function LedgerColumns() {
  const dr = [
    "Ingest and validate",
    "Fee, GST, TCS reconstruction",
    "Exact match: UTR + paise",
    "Fuzzy recover: T+2, UTR typos",
    "Triage: resolve or escalate",
  ];
  const ai = ["Parse question into intent", "Phrase exception explanation"];
  const cr = ["Hallucination verifier", "Reject ungrounded figures", "Fall back to computed truth"];

  const col = (title, items, color, colDelay) => (
    <Reveal delay={colDelay} y={18} style={{ flex: 1, minWidth: 200 }} key={title}>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "11px",
          letterSpacing: "0.12em",
          color,
          borderBottom: `2px solid ${color}`,
          paddingBottom: "8px",
          marginBottom: "10px",
        }}
      >
        {title}
      </div>
      {items.map((it, i) => (
        <Reveal
          as="div"
          delay={colDelay + 90 + i * 55}
          y={8}
          key={it}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "12.5px",
            color: INK,
            padding: "9px 0",
            borderBottom: `1px dashed ${RULE}`,
          }}
        >
          {it}
        </Reveal>
      ))}
    </Reveal>
  );

  return (
    <div style={{ display: "flex", gap: "28px", flexWrap: "wrap" }}>
      {col("DR : DETERMINISTIC", dr, INK, 0)}
      {col("AI", ai, CARBON_BLUE, 90)}
      {col("CR : VERIFIER", cr, VERIFY_GREEN, 180)}
    </div>
  );
}

// Feature card with a faint cursor-tracked gold spotlight — a single quiet
// premium cue rather than a full tilt/parallax treatment.
function FeatureCard({ title, body, tag, color, delay }) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const ref = useRef(null);

  function onMove(e) {
    const r = ref.current.getBoundingClientRect();
    setPos({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  }

  return (
    <Reveal delay={delay} y={16}>
      <div
        ref={ref}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onMouseMove={onMove}
        style={{
          position: "relative",
          overflow: "hidden",
          background: PAPER,
          border: `1.5px solid ${hover ? INK : RULE}`,
          padding: "22px 22px 20px",
          height: "100%",
          transform: hover ? "translateY(-3px)" : "translateY(0)",
          boxShadow: hover ? "5px 6px 0 rgba(34,48,31,0.14)" : "2px 2px 0 rgba(34,48,31,0.05)",
          transition: "transform 0.22s cubic-bezier(.2,1,.3,1), box-shadow 0.22s cubic-bezier(.2,1,.3,1), border-color 0.22s ease",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(220px circle at ${pos.x}% ${pos.y}%, ${GOLD}14, transparent 70%)`,
            opacity: hover ? 1 : 0,
            transition: "opacity 0.25s ease",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.1em",
            color,
            border: `1px solid ${color}`,
            display: "inline-block",
            padding: "3px 8px",
            marginBottom: 14,
          }}
        >
          {tag}
        </div>
        <div style={{ position: "relative", fontFamily: "'Special Elite', monospace", fontSize: 16.5, marginBottom: 8 }}>
          {title}
        </div>
        <p style={{ position: "relative", fontSize: 13.5, color: INK_SOFT, lineHeight: 1.6, margin: 0 }}>{body}</p>
      </div>
    </Reveal>
  );
}

// Step card for "how it works"
function StepCard({ num, title, body, delay }) {
  return (
    <Reveal delay={delay} y={16}>
      <div style={{ position: "relative", paddingLeft: 4 }}>
        <div
          style={{
            fontFamily: "'Special Elite', monospace",
            fontSize: 30,
            color: RULE,
            lineHeight: 1,
            marginBottom: 10,
          }}
        >
          {num}
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 6, color: INK }}>
          {title}
        </div>
        <p style={{ fontSize: 13.5, color: INK_SOFT, lineHeight: 1.6, margin: 0, maxWidth: 240 }}>{body}</p>
      </div>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ReconMintLanding({ onGetStarted, onWatchDemo } = {}) {
  useSmoothScroll();
  const scrolled = useScrolled();
  const [videoOpen, setVideoOpen] = useState(false);

  // If the app shell passes onGetStarted / onWatchDemo (routing into the
  // Upload page etc.), use those. Otherwise fall back to the in-page video
  // lightbox so this file still works standalone.
  const handleGetStarted = onGetStarted || (() => {});
  const handleWatchDemo = onWatchDemo || (() => setVideoOpen(true));

  return (
    <div
      style={{
        background: PAPER,
        backgroundImage: `repeating-linear-gradient(to bottom, ${PAPER} 0px, ${PAPER} 34px, ${STRIPE} 34px, ${STRIPE} 68px)`,
        color: INK,
        fontFamily: "'Inter', sans-serif",
        minHeight: "100vh",
        position: "relative",
      }}
    >
      <style>{`
        @import url('${FONT_IMPORT_URL}');
        * { box-sizing: border-box; }
        h1, h2 {
          text-shadow: 0 1px 0 rgba(255,255,255,0.55), 0 -1px 0 rgba(34,48,31,0.12);
        }
        .rm-link { color: ${INK_SOFT}; text-decoration: none; font-size: 13px; font-family: 'IBM Plex Mono', monospace; transition: color 0.15s ease; }
        .rm-link:hover { color: ${INK}; text-decoration: underline; }
        code.rm-code { font-family: 'IBM Plex Mono', monospace; background: rgba(34,48,31,0.07); padding: 2px 6px; border: 1px solid ${RULE}; font-size: 0.88em; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
        @media (max-width: 820px) {
          .rm-hero-grid { grid-template-columns: 1fr !important; }
          .rm-metrics-grid { grid-template-columns: 1fr !important; }
          .rm-feature-grid { grid-template-columns: 1fr 1fr !important; }
          .rm-steps-grid { grid-template-columns: 1fr 1fr !important; }
          .rm-proof-grid { grid-template-columns: 1fr 1fr !important; }
          .rm-razorpay-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 540px) {
          .rm-feature-grid { grid-template-columns: 1fr !important; }
          .rm-steps-grid { grid-template-columns: 1fr !important; }
          .rm-proof-grid { grid-template-columns: 1fr !important; }
        }
        @keyframes reconFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes reconPopIn { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>

      {videoOpen && <VideoModal videoId={DEMO_VIDEO_ID} onClose={() => setVideoOpen(false)} />}

      <ProgressRail />

      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id="reconInkTexture">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" />
        </filter>
        <filter id="reconGrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0.13  0 0 0 0 0.19  0 0 0 0 0.12  0 0 0 0.02 0" />
        </filter>
      </svg>
      <svg
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1, opacity: 0.55 }}
      >
        <rect width="100%" height="100%" filter="url(#reconGrain)" />
      </svg>

      <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", padding: "0 46px" }}>
        <Perforation side="left" />
        <Perforation side="right" />

        {/* Header */}
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 0",
            borderBottom: `2px solid ${INK}`,
            flexWrap: "wrap",
            gap: 14,
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: scrolled ? "rgba(237,242,231,0.86)" : "transparent",
            backdropFilter: scrolled ? "blur(10px)" : "none",
            WebkitBackdropFilter: scrolled ? "blur(10px)" : "none",
            boxShadow: scrolled ? "0 8px 24px -14px rgba(34,48,31,0.35)" : "none",
            transition: "background 0.3s ease, box-shadow 0.3s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 30, letterSpacing: "-0.01em", color: INK }}>
              ReconMint
            </span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: INK_SOFT }}>
              LEDGER No. 0412 RM
            </span>
          </div>
          <nav style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
            <a className="rm-link" href="#how-it-works">how it works</a>
            <a className="rm-link" href="#features">product</a>
            <a className="rm-link" href="#proof">proof</a>
            <a className="rm-link" href="#builder">builder</a>
            <a
              className="rm-link"
              href={REPO_URL}
              style={{
                fontWeight: 600,
                border: `1.5px solid ${RULE}`,
                padding: "7px 14px",
                color: INK,
                textDecoration: "none",
              }}
            >
              GitHub
            </a>
            <LedgerButton primary onClick={handleGetStarted}>Get started</LedgerButton>
          </nav>
        </header>

        {/* Hero */}
        <section
          className="rm-hero-grid"
          style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 44, padding: "60px 0 66px", alignItems: "center" }}
        >
          <div>
            <Reveal delay={0} y={14}>
              <Eyebrow color={STAMP_RED}>RAZORPAY AI BUILDATHON, TRACK 4</Eyebrow>
            </Reveal>
            <Reveal delay={90} y={18}>
              <div
                style={{
                  fontFamily: "'Special Elite', monospace",
                  fontSize: "clamp(18px, 2vw, 22px)",
                  color: STAMP_RED,
                  marginBottom: 6,
                  letterSpacing: "0.01em",
                }}
              >
                ReconMint
              </div>
              <h1 style={{ fontFamily: "'Special Elite', monospace", fontSize: "clamp(34px, 4.4vw, 50px)", lineHeight: 1.22, margin: "0 0 20px" }}>
                A verification agent
                <br />
                for money.
              </h1>
            </Reveal>
            <Reveal delay={190} y={18}>
              <p style={{ fontSize: 16.5, lineHeight: 1.7, color: INK_SOFT, maxWidth: 480, marginBottom: 32 }}>
                Three way Razorpay settlement reconciliation that a merchant can actually trust,
                because the AI can't fabricate a rupee.
              </p>
            </Reveal>
            <Reveal delay={280} y={14}>
              <div style={{ display: "flex", gap: 12, marginBottom: 26, flexWrap: "wrap" }}>
                <LedgerButton primary big onClick={handleGetStarted}>Try the live demo</LedgerButton>
                <LedgerButton big onClick={handleWatchDemo}>Watch the 2 min demo</LedgerButton>
              </div>
            </Reveal>
            <Reveal delay={360} y={10}>
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: INK_SOFT }}>
                Track 4's own thesis: verification, not generation, is the bottleneck.
              </p>
            </Reveal>
          </div>

          <Reveal delay={220} y={30}>
            <div style={{ display: "flex", justifyContent: "center", position: "relative", height: 360 }}>
              <InkStamp label="VERIFIED" color={STAMP_RED} size={340} delay={480} />
            </div>
          </Reveal>
        </section>
      </div>

      <TornDivider />

      {/* The problem */}
      <div style={{ background: PANEL, position: "relative" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 46px" }}>
          <Reveal delay={0}>
            <Eyebrow>THE PROBLEM</Eyebrow>
          </Reveal>
          <Reveal delay={70}>
            <h2 style={{ fontFamily: "'Special Elite', monospace", fontSize: 26, marginBottom: 18, maxWidth: 700 }}>
              Merchants cannot tell if the money Razorpay says it settled actually landed.
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p style={{ color: INK_SOFT, maxWidth: 720, lineHeight: 1.75, fontSize: 15.5 }}>
              Fees, GST, TCS, T+2 timing, and chargebacks all mean net never equals gross, and most
              merchants still reconcile that gap by hand in a spreadsheet. Track 4's own framing is the
              right one: verification, not generation, is the bottleneck. An AI that can write a summary
              is not useful here. An AI that can prove a number is.
            </p>
          </Reveal>
        </div>
      </div>

      <TornDivider flip />

      {/* How it works */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 46px" }} id="how-it-works">
        <Reveal delay={0}>
          <Eyebrow color={CARBON_BLUE}>HOW IT WORKS</Eyebrow>
        </Reveal>
        <Reveal delay={70}>
          <h2 style={{ fontFamily: "'Special Elite', monospace", fontSize: 26, marginBottom: 34, maxWidth: 640 }}>
            Four steps. You can watch it reason the whole way through.
          </h2>
        </Reveal>
        <div className="rm-steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 30 }}>
          <StepCard num="01" title="Drop in three files" body="Order ledger, settlement report, bank statement. No setup beyond that." delay={100} />
          <StepCard num="02" title="The agent matches three ways" body="Exact match on UTR and paise, then fuzzy recovery for timing and typos." delay={170} />
          <StepCard num="03" title="It explains every exception" body="Live Agent Trace shows each decision as it happens, not after the fact." delay={240} />
          <StepCard num="04" title="You export a report" body="One click. Every figure in it is grounded in the computed ledger." delay={310} />
        </div>
      </div>

      <TornDivider />

      {/* The trust guarantee */}
      <div style={{ background: PANEL, position: "relative" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 46px" }}>
          <Reveal delay={0}>
            <Eyebrow color={STAMP_RED}>THE TRUST GUARANTEE</Eyebrow>
          </Reveal>
          <Reveal delay={70}>
            <h2 style={{ fontFamily: "'Special Elite', monospace", fontSize: 26, marginBottom: 14, maxWidth: 660 }}>
              The LLM never touches the math and never states a number it can't prove.
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p style={{ color: INK_SOFT, maxWidth: 660, lineHeight: 1.7, marginBottom: 36, fontSize: 15 }}>
              The agent loop runs in integer paise: joins, fee reconstruction, triage, the stopping rule.
              The model is confined to two jobs where language is the point: turning a question into
              structured intent, and phrasing an explanation. A verifier gates every figure it produces
              against the computed ledger before it reaches you.
            </p>
          </Reveal>
          <LedgerColumns />
        </div>
      </div>

      <TornDivider flip />

      {/* Feature highlights */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 46px" }} id="features">
        <Reveal delay={0}>
          <Eyebrow color={CARBON_BLUE}>INSIDE THE PRODUCT</Eyebrow>
        </Reveal>
        <Reveal delay={70}>
          <h2 style={{ fontFamily: "'Special Elite', monospace", fontSize: 26, marginBottom: 30, maxWidth: 620 }}>
            Six things worth clicking on.
          </h2>
        </Reveal>
        <div className="rm-feature-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
          <FeatureCard tag="LIVE" color={CARBON_BLUE} title="Live agent trace" body="Watch each reconciliation decision as it happens, with real per-stage latencies, not a spinner." delay={110} />
          <FeatureCard tag="SCORED" color={VERIFY_GREEN} title="Detection accuracy" body="Precision 0.86, recall 1.00, F1 0.93 on exception detection, measured against a hidden answer key." delay={160} />
          <FeatureCard tag="EXPLAINED" color={STAMP_RED} title="Exception drawer" body="Every flagged item opens into a fee bridge and a verified, plain English explanation." delay={210} />
          <FeatureCard tag="ASK" color={CARBON_BLUE} title="Ask the agent" body="Question in, structured intent out, deterministic compute, verifier gated phrasing back." delay={260} />
          <FeatureCard tag="SOURCE" color={VERIFY_GREEN} title="Source file viewer" body="Trace any figure back to the exact row in the order ledger, settlement, or bank statement." delay={310} />
          <FeatureCard tag="EXPORT" color={STAMP_RED} title="One click report" body="A printable reconciliation report, generated from the same grounded numbers you already saw." delay={360} />
        </div>
      </div>

      <TornDivider />

      {/* Proof band */}
      <div style={{ background: INK, color: PAPER, position: "relative", overflow: "hidden" }} id="proof">
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `linear-gradient(90deg, transparent, ${GOLD}22, transparent)`,
            opacity: 0.5,
          }}
        />
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "54px 46px", position: "relative" }}>
          <Reveal delay={0}>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.18em",
                color: GOLD_SOFT,
                marginBottom: 28,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ width: 22, height: 1, background: GOLD_SOFT, display: "inline-block" }} />
              MEASURED, NOT CLAIMED
            </div>
          </Reveal>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 0,
              border: "1px solid #33422F",
              borderRadius: "2px",
            }}
            className="rm-proof-grid"
          >
            {[
              ["97.68%", "match rate, exact + fuzzy"],
              ["P 0.86 / R 1.00", "exception detection"],
              ["~12,700 rec/s", "throughput"],
              ["7 / 11", "schema fields validated live"],
              ["42", "honest exceptions logged"],
            ].map(([value, label], i) => (
              <Reveal key={value} delay={80 + i * 70} y={10}>
                <div
                  style={{
                    position: "relative",
                    padding: "20px 22px",
                    borderLeft: i === 0 ? "none" : "1px solid #33422F",
                    height: "100%",
                    overflow: "hidden",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 2,
                      background: `linear-gradient(90deg, ${GOLD}, transparent)`,
                      opacity: 0.75,
                    }}
                  />
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 21, color: PAPER, letterSpacing: "-0.01em" }}>
                    {value}
                  </div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: "#93A38D", marginTop: 6, lineHeight: 1.5 }}>
                    {label}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* Built for Razorpay */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 46px" }}>
        <Reveal delay={0}>
          <Eyebrow color={VERIFY_GREEN}>BUILT FOR RAZORPAY</Eyebrow>
        </Reveal>
        <Reveal delay={70}>
          <h2 style={{ fontFamily: "'Special Elite', monospace", fontSize: 26, marginBottom: 14, maxWidth: 680 }}>
            Every field shape is real. Only the volume running through it is synthetic.
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <p style={{ color: INK_SOFT, maxWidth: 680, lineHeight: 1.75, fontSize: 15, marginBottom: 34 }}>
            The demo can't run against a live merchant account, so the settlement, order, and payment
            objects it reconciles are generated — but generated against the actual Razorpay Settlements
            and Payments API schema, field by field, not guessed at. Where a name, type, or unit differs
            from what a real integration returns, that gap is called out below rather than smoothed over.
          </p>
        </Reveal>

        <div
          className="rm-razorpay-grid"
          style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 22, alignItems: "start" }}
        >
          {/* Field-by-field mapping, styled as a ledger register */}
          <Reveal delay={170} y={16}>
            <div
              style={{
                background: PAPER,
                border: `1.5px solid ${INK}`,
                boxShadow: "5px 5px 0 rgba(34,48,31,0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 18px",
                  borderBottom: `1.5px solid ${INK}`,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  color: INK_SOFT,
                }}
              >
                <span>FIELD REGISTER</span>
                <span>RAZORPAY API → RECONMINT</span>
              </div>
              {[
                ["razorpay_settlement_id", "settlement_id", "exact"],
                ["utr", "utr", "exact"],
                ["amount", "gross_paise", "exact"],
                ["fees", "fee_paise", "exact"],
                ["tax", "gst_paise", "exact"],
                ["status", "settlement_status", "exact"],
                ["settled_at", "settled_at", "close · unix → IST"],
                ["order_id", "order_ref", "close · prefix stripped"],
                ["method", "payment_method", "close · casing normalized"],
                ["tds / tcs breakdown", "tcs_paise", "disclosed gap · not itemized in live API"],
              ].map(([raz, rm, kind], i) => {
                const isExact = kind === "exact";
                const tagColor = isExact ? VERIFY_GREEN : kind.startsWith("close") ? CARBON_BLUE : STAMP_RED;
                return (
                  <Reveal as="div" delay={210 + i * 45} y={8} key={raz}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr auto",
                        gap: 10,
                        alignItems: "center",
                        padding: "10px 18px",
                        borderBottom: i === 9 ? "none" : `1px dashed ${RULE}`,
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: INK }}>{raz}</span>
                      <span style={{ color: INK_SOFT }}>→ {rm}</span>
                      <span
                        style={{
                          justifySelf: "end",
                          fontSize: 9.5,
                          letterSpacing: "0.06em",
                          color: tagColor,
                          border: `1px solid ${tagColor}`,
                          padding: "2px 6px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {kind.toUpperCase()}
                      </span>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </Reveal>

          {/* Fidelity receipt + honesty note */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Reveal delay={220} y={16}>
              <div
                style={{
                  background: PANEL,
                  border: `1.5px solid ${INK}`,
                  padding: "26px 28px",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 13,
                  boxShadow: "5px 5px 0 rgba(34,48,31,0.08)",
                }}
              >
                <div style={{ borderBottom: `1px dashed ${RULE}`, paddingBottom: 10, marginBottom: 14, letterSpacing: "0.08em", color: INK_SOFT }}>
                  SCHEMA FIDELITY RECEIPT
                </div>
                {[
                  ["Exact field matches", "7 / 11"],
                  ["Close mappings", "3"],
                  ["Explicit disclosed gap", "1"],
                  ["Sample order", "order_TTqoMt4WLQVfAn"],
                  ["Verified against", "Settlements + Payments API"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: INK }}>
                    <span style={{ color: INK_SOFT }}>{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
                <div style={{ borderTop: `1px dashed ${RULE}`, marginTop: 14, paddingTop: 14, fontSize: 11.5, color: INK_SOFT, lineHeight: 1.6 }}>
                  Field shapes are real, validated live. Volume and settlement timing are synthetic,
                  and disclosed as such.
                </div>
              </div>
            </Reveal>

            <Reveal delay={280} y={16}>
              <div
                style={{
                  border: `1.5px solid ${STAMP_RED}`,
                  background: PAPER,
                  padding: "18px 20px",
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 10,
                    color: STAMP_RED,
                    border: `1px solid ${STAMP_RED}`,
                    padding: "2px 6px",
                    whiteSpace: "nowrap",
                    marginTop: 2,
                  }}
                >
                  HONESTY NOTE
                </span>
                <p style={{ margin: 0, fontSize: 12.5, color: INK_SOFT, lineHeight: 1.65 }}>
                  The live Razorpay Settlements API doesn't itemize a TDS/TCS split — that number is
                  reconstructed by ReconMint's fee engine, not pulled from the API. It's flagged here
                  instead of quietly folded into an "exact match" count.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </div>

      <TornDivider />

      {/* About / builder */}
      <div style={{ background: PANEL }} id="builder">
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "50px 46px" }}>
          <Reveal delay={0}>
            <Eyebrow>THE BUILDER</Eyebrow>
          </Reveal>
          <Reveal delay={80} y={16}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 20,
                border: `1.5px solid ${INK}`,
                background: PAPER,
                padding: "24px 26px",
                boxShadow: "4px 4px 0 rgba(34,48,31,0.08)",
              }}
            >
              <div>
                <div style={{ fontFamily: "'Special Elite', monospace", fontSize: 18, marginBottom: 6 }}>{YOUR_NAME}</div>
                <p style={{ fontSize: 13.5, color: INK_SOFT, margin: 0, maxWidth: 480, lineHeight: 1.6 }}>
                  Solo build for the Razorpay AI Buildathon, Track 4.
                </p>
              </div>
              <a
                href={YOUR_GITHUB_URL}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 13,
                  fontWeight: 600,
                  color: INK,
                  border: `1.5px solid ${INK}`,
                  padding: "10px 18px",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {YOUR_GITHUB_HANDLE} on GitHub
              </a>
            </div>
          </Reveal>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "22px 46px 40px",
          borderTop: `2px solid ${INK}`,
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: INK_SOFT }}>
          ReconMint, built solo, Razorpay AI Buildathon, Track 4.
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: INK_SOFT }}>
          0 hallucinated figures. 100% integer paise.
        </span>
      </div>
    </div>
  );
}