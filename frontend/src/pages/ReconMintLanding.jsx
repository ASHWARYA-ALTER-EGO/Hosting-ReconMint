import React, { useEffect, useRef, useState } from "react";

/**
 * ReconMint landing page -- merged complete file.
 *
 * Includes:
 *  - Full ledger-book design: greenbar paper, tractor-feed perforation,
 *    rubber ink stamp, carbon-copy receipts.
 *  - Full problem section with gross-to-net ledger equation.
 *  - "Built for Razorpay" section with field register + schema fidelity receipt.
 *  - All hackathon/Track 4 references stripped. Reads as a real product.
 *  - "Watch the 2 min demo" always opens the in-page video lightbox, autoplaying.
 *  - Premium interaction pass: spring physics, cursor-tracked borders,
 *    draw-on nav underlines, ink-splatter stamp, blur-to-sharp reveals,
 *    active press states, luminous row highlights.
 */

const YOUR_NAME = "Ashwarya Pradhan";
const YOUR_GITHUB_URL = "https://github.com/pradhanashwarya2122";
const YOUR_GITHUB_HANDLE = "@pradhanashwarya2122";
const REPO_URL = "https://github.com/pradhanashwarya2122";
// Set to a real YouTube video ID once the pitch is recorded, e.g. "abc123DEF".
// null = the "Watch demo" button is not rendered at all (safer than a placeholder).
const DEMO_VIDEO_ID = null;

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
// Smooth scroll
// ---------------------------------------------------------------------------
function useSmoothScroll() {
  useEffect(() => {
    const prevHtml = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "smooth";
    function onAnchorClick(e) {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href").slice(1);
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    document.addEventListener("click", onAnchorClick);
    return () => {
      document.documentElement.style.scrollBehavior = prevHtml;
      document.removeEventListener("click", onAnchorClick);
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Reveal -- blur-to-sharp spring entry
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
          if (e.isIntersecting) { setShown(true); obs.unobserve(el); }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
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
        filter: shown ? "blur(0px)" : "blur(2px)",
        transition: `opacity 0.68s cubic-bezier(.16,1,.3,1) ${delay}ms,
                     transform 0.78s cubic-bezier(.16,1,.3,1) ${delay}ms,
                     filter 0.55s cubic-bezier(.16,1,.3,1) ${delay}ms`,
        willChange: "opacity, transform, filter",
      }}
    >
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Scroll state
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
// Gold read-progress rail -- thicker, more glow
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
      style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 40, background: "rgba(34,48,31,0.06)" }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${GOLD_SOFT}, ${GOLD}, ${GOLD_SOFT})`,
          boxShadow: `0 0 10px ${GOLD}aa, 0 0 3px ${GOLD}`,
          transition: "width 0.06s linear",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Perforation
// ---------------------------------------------------------------------------
function Perforation({ side }) {
  const holes = new Array(30).fill(0);
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute", top: 0, bottom: 0, [side]: 10, width: 20,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        alignItems: "center", padding: "18px 0", zIndex: 3,
      }}
    >
      {holes.map((_, i) => (
        <span
          key={i}
          style={{
            width: 9, height: 9, borderRadius: "50%",
            background: "#f7faf4",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.32), inset 0 -1px 1px rgba(255,255,255,0.6)",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Torn paper divider with subtle shadow lip
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
    <div style={{ position: "relative", lineHeight: 0 }}>
      <svg
        viewBox={`0 0 ${w} 20`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: "16px", display: "block", transform: flip ? "scaleY(-1)" : "none" }}
      >
        <defs>
          <filter id="tornShadow">
            <feDropShadow dx="0" dy={flip ? -2 : 2} stdDeviation="1.5" floodColor={INK} floodOpacity="0.08" />
          </filter>
        </defs>
        <path d={path} fill={PAPER} filter="url(#tornShadow)" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ink stamp -- physical slam with ink-bleed ripple on landing
// ---------------------------------------------------------------------------
function InkStamp({ label = "VERIFIED", color = STAMP_RED, delay = 0, size = 120 }) {
  const [struck, setStruck] = useState(false);
  const [ripple, setRipple] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setStruck(true);
      setTimeout(() => setRipple(true), 80);
      setTimeout(() => setRipple(false), 600);
    }, 500 + delay);
    return () => clearTimeout(t1);
  }, [delay]);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {/* ink-bleed ripple */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "12%",
          borderRadius: "50%",
          border: `2px solid ${color}`,
          opacity: ripple ? 0 : 0,
          transform: ripple ? "scale(1.18)" : "scale(0.9)",
          transition: ripple
            ? "transform 0.55s cubic-bezier(.2,1,.3,1), opacity 0.55s ease"
            : "none",
          pointerEvents: "none",
        }}
        style={{
          position: "absolute",
          inset: "12%",
          borderRadius: "50%",
          border: `2px solid ${color}`,
          opacity: ripple ? 0.22 : 0,
          transform: ripple ? "scale(1.22)" : "scale(0.9)",
          transition: ripple
            ? "transform 0.6s cubic-bezier(.2,1,.3,1), opacity 0.6s ease"
            : "none",
          pointerEvents: "none",
        }}
      />
      {/* shadow bloom */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "6%",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${color}22, transparent 70%)`,
          opacity: struck ? 0.7 : 0,
          filter: "blur(6px)",
          transition: "opacity 0.4s ease 0.1s",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transform: struck ? "rotate(-9deg) scale(1)" : "rotate(-9deg) scale(2.6)",
          opacity: struck ? 0.94 : 0,
          transition: "transform 0.28s cubic-bezier(.15,2,.3,1), opacity 0.14s ease",
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
            RECONMINT · SETTLEMENT AUDIT
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
// Video modal -- scale+blur open, Escape to close
// ---------------------------------------------------------------------------
function VideoModal({ videoId, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(20,26,17,0.76)",
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px", animation: "reconFadeIn 0.22s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative", width: "min(880px, 100%)",
          background: PAPER, border: `2px solid ${INK}`,
          boxShadow: `12px 16px 0 rgba(34,48,31,0.22), 0 0 0 1px ${INK}11`,
          padding: "14px 14px 18px",
          animation: "reconPopIn 0.3s cubic-bezier(.15,1.4,.3,1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, padding: "0 4px" }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.12em", color: INK_SOFT }}>
            {"// "}DEMO REEL, 2 MIN
          </span>
          <CloseButton onClick={onClose} />
        </div>
        <div style={{
          position: "relative", width: "100%", paddingTop: "56.25%",
          background: INK, border: `1.5px solid ${INK}`, overflow: "hidden",
        }}>
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
// Close button with hover
// ---------------------------------------------------------------------------
function CloseButton({ onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Close demo video"
      style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600,
        color: hover ? PAPER : INK,
        background: hover ? INK : "transparent",
        border: `1.5px solid ${INK}`,
        padding: "5px 11px", cursor: "pointer", letterSpacing: "0.04em",
        transition: "background 0.18s ease, color 0.18s ease",
      }}
    >
      CLOSE ✕
    </button>
  );
}

// ---------------------------------------------------------------------------
// Eyebrow
// ---------------------------------------------------------------------------
function Eyebrow({ children, color = INK_SOFT }) {
  return (
    <div style={{
      fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px",
      letterSpacing: "0.14em", textTransform: "uppercase", color,
      marginBottom: "12px", display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ width: 14, height: 1, background: color, opacity: 0.55, display: "inline-block" }} />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LedgerButton -- spring gloss, press state, full ink fill on primary hover
// ---------------------------------------------------------------------------
function LedgerButton({ children, primary, big, onClick }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        position: "relative", overflow: "hidden",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: big ? "14px" : "13px", fontWeight: 600,
        padding: big ? "14px 28px" : "12px 22px",
        border: `1.5px solid ${primary ? INK : hover ? INK : RULE}`,
        background: primary
          ? hover ? "#1a2418" : INK
          : hover ? "rgba(34,48,31,0.05)" : "transparent",
        color: primary ? PAPER : INK,
        cursor: "pointer", letterSpacing: "0.03em", borderRadius: "2px",
        transform: pressed
          ? "translateY(1px) scale(0.985)"
          : hover ? "translateY(-2px)" : "translateY(0)",
        boxShadow: pressed
          ? "1px 1px 0 rgba(34,48,31,0.18)"
          : hover
          ? primary
            ? `4px 5px 0 rgba(34,48,31,0.4), 0 0 0 1px ${INK}22`
            : "3px 4px 0 rgba(34,48,31,0.14)"
          : primary
          ? "2px 2px 0 rgba(34,48,31,0.25)"
          : "1px 1px 0 rgba(34,48,31,0.08)",
        transition: "transform 0.22s cubic-bezier(.2,1.4,.3,1), box-shadow 0.22s cubic-bezier(.2,1,.3,1), background 0.2s ease, border-color 0.2s ease",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute", top: 0, bottom: 0,
          left: hover ? "115%" : "-40%",
          width: "38%",
          background: primary
            ? "linear-gradient(115deg, transparent, rgba(237,242,231,0.28), transparent)"
            : `linear-gradient(115deg, transparent, ${GOLD_SOFT}66, transparent)`,
          transition: "left 0.55s cubic-bezier(.2,1,.3,1)",
          pointerEvents: "none",
        }}
      />
      <span style={{ position: "relative" }}>{children}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Nav link with draw-on underline
// ---------------------------------------------------------------------------
function NavLink({ href, children }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        color: hover ? INK : INK_SOFT,
        textDecoration: "none", fontSize: 13,
        fontFamily: "'IBM Plex Mono', monospace",
        letterSpacing: "0.02em",
        transition: "color 0.18s ease",
        paddingBottom: "2px",
      }}
    >
      {children}
      <span
        aria-hidden="true"
        style={{
          position: "absolute", left: 0, bottom: 0,
          height: "1px", background: INK,
          width: hover ? "100%" : "0%",
          transition: "width 0.26s cubic-bezier(.4,0,.2,1)",
        }}
      />
    </a>
  );
}

// ---------------------------------------------------------------------------
// LedgerColumns
// ---------------------------------------------------------------------------
function LedgerColumns() {
  const dr = ["Ingest and validate", "Fee, GST, TCS reconstruction", "Exact match: UTR + paise", "Fuzzy recover: T+2, UTR typos", "Triage: resolve or escalate"];
  const ai = ["Parse question into intent", "Phrase exception explanation"];
  const cr = ["Hallucination verifier", "Reject ungrounded figures", "Fall back to computed truth"];

  const col = (title, items, color, colDelay) => (
    <Reveal delay={colDelay} y={18} style={{ flex: 1, minWidth: 200 }} key={title}>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px",
        letterSpacing: "0.12em", color,
        borderBottom: `2px solid ${color}`, paddingBottom: "8px", marginBottom: "10px",
      }}>
        {title}
      </div>
      {items.map((it, i) => (
        <Reveal
          as="div" delay={colDelay + 90 + i * 55} y={8} key={it}
          style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: "12.5px",
            color: INK, padding: "9px 0", borderBottom: `1px dashed ${RULE}`,
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

// ---------------------------------------------------------------------------
// FeatureCard -- cursor-tracked luminous border + spotlight bg
// ---------------------------------------------------------------------------
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
          position: "relative", overflow: "hidden",
          background: PAPER,
          padding: "22px 22px 20px", height: "100%",
          transform: hover ? "translateY(-4px)" : "translateY(0)",
          transition: "transform 0.28s cubic-bezier(.2,1.2,.3,1), box-shadow 0.28s cubic-bezier(.2,1,.3,1)",
          boxShadow: hover
            ? `6px 8px 0 rgba(34,48,31,0.16), 0 0 0 1.5px ${INK}`
            : `2px 2px 0 rgba(34,48,31,0.05), 0 0 0 1.5px ${RULE}`,
        }}
      >
        {/* cursor spotlight bg */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0,
            background: `radial-gradient(240px circle at ${pos.x}% ${pos.y}%, ${GOLD}18, transparent 70%)`,
            opacity: hover ? 1 : 0,
            transition: "opacity 0.3s ease",
            pointerEvents: "none",
          }}
        />
        {/* cursor spotlight border glow */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0,
            background: `radial-gradient(180px circle at ${pos.x}% ${pos.y}%, ${color}30, transparent 60%)`,
            opacity: hover ? 1 : 0,
            transition: "opacity 0.3s ease",
            pointerEvents: "none",
            mixBlendMode: "multiply",
          }}
        />
        <div style={{
          position: "relative",
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
          letterSpacing: "0.1em", color,
          border: `1px solid ${color}`,
          display: "inline-block", padding: "3px 8px", marginBottom: 14,
        }}>
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

// ---------------------------------------------------------------------------
// StepCard
// ---------------------------------------------------------------------------
function StepCard({ num, title, body, delay }) {
  return (
    <Reveal delay={delay} y={16}>
      <div style={{ position: "relative", paddingLeft: 4 }}>
        <div style={{ fontFamily: "'Special Elite', monospace", fontSize: 30, color: RULE, lineHeight: 1, marginBottom: 10 }}>
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
// EquationRow -- highlight sweep on reveal
// ---------------------------------------------------------------------------
function EquationRow({ label, sign, value, tone, delay }) {
  const [lit, setLit] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { entries.forEach((e) => { if (e.isIntersecting) { setTimeout(() => setLit(true), delay); obs.unobserve(el); } }); },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [delay]);

  return (
    <Reveal delay={delay} y={8}>
      <div
        ref={ref}
        style={{
          display: "grid", gridTemplateColumns: "28px 1fr auto",
          alignItems: "baseline", gap: 12,
          padding: "10px 0", borderBottom: `1px dashed ${RULE}`,
          fontFamily: "'IBM Plex Mono', monospace",
          background: lit ? `${tone}08` : "transparent",
          transition: "background 0.5s ease",
        }}
      >
        <span style={{ color: tone, fontWeight: 700, fontSize: 15 }}>{sign}</span>
        <span style={{ fontSize: 13.5, color: INK }}>{label}</span>
        <span style={{ fontSize: 13, color: INK_SOFT }}>{value}</span>
      </div>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// GitHub/builder link with ink-fill hover
// ---------------------------------------------------------------------------
function InkFillLink({ href, children, style: extraStyle }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <a
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600,
        color: hover ? PAPER : INK,
        background: hover ? INK : "transparent",
        border: `1.5px solid ${INK}`,
        padding: "10px 18px", textDecoration: "none", whiteSpace: "nowrap",
        display: "inline-block",
        transform: pressed ? "translateY(1px) scale(0.98)" : hover ? "translateY(-1px)" : "translateY(0)",
        boxShadow: pressed ? "none" : hover ? "3px 4px 0 rgba(34,48,31,0.28)" : "1px 1px 0 rgba(34,48,31,0.08)",
        transition: "background 0.22s ease, color 0.22s ease, transform 0.2s cubic-bezier(.2,1.4,.3,1), box-shadow 0.2s ease",
        ...extraStyle,
      }}
    >
      {children}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ReconMintLanding({ onGetStarted } = {}) {
  useSmoothScroll();
  const scrolled = useScrolled();
  const [videoOpen, setVideoOpen] = useState(false);

  const handleGetStarted = onGetStarted || (() => {});
  const handleWatchDemo = () => setVideoOpen(true);

  return (
    <div
      style={{
        background: PAPER,
        backgroundImage: `repeating-linear-gradient(to bottom, ${PAPER} 0px, ${PAPER} 34px, ${STRIPE} 34px, ${STRIPE} 68px)`,
        color: INK, fontFamily: "'Inter', sans-serif",
        minHeight: "100vh", position: "relative",
      }}
    >
      <style>{`
        @import url('${FONT_IMPORT_URL}');
        * { box-sizing: border-box; }
        h1, h2 { text-shadow: 0 1px 0 rgba(255,255,255,0.55), 0 -1px 0 rgba(34,48,31,0.12); }
        code.rm-code {
          font-family: 'IBM Plex Mono', monospace;
          background: rgba(34,48,31,0.07); padding: 2px 6px;
          border: 1px solid ${RULE}; font-size: 0.88em;
        }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
        @media (max-width: 820px) {
          .rm-hero-grid { grid-template-columns: 1fr !important; }
          .rm-metrics-grid { grid-template-columns: 1fr !important; }
          .rm-feature-grid { grid-template-columns: 1fr 1fr !important; }
          .rm-steps-grid { grid-template-columns: 1fr 1fr !important; }
          .rm-proof-grid { grid-template-columns: 1fr 1fr !important; }
          .rm-gap-grid { grid-template-columns: 1fr !important; }
          .rm-razorpay-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 540px) {
          .rm-feature-grid { grid-template-columns: 1fr !important; }
          .rm-steps-grid { grid-template-columns: 1fr !important; }
          .rm-proof-grid { grid-template-columns: 1fr !important; }
        }
        @keyframes reconFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes reconPopIn {
          from { opacity: 0; transform: scale(0.94) translateY(12px); filter: blur(4px); }
          to { opacity: 1; transform: scale(1) translateY(0); filter: blur(0px); }
        }
      `}</style>

      {videoOpen && DEMO_VIDEO_ID && <VideoModal videoId={DEMO_VIDEO_ID} onClose={() => setVideoOpen(false)} />}

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
      <svg aria-hidden="true" style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1, opacity: 0.55 }}>
        <rect width="100%" height="100%" filter="url(#reconGrain)" />
      </svg>

      <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", padding: "0 46px" }}>
        <Perforation side="left" />
        <Perforation side="right" />

        {/* Header */}
        <header style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "20px 0", borderBottom: `2px solid ${INK}`,
          flexWrap: "wrap", gap: 14,
          position: "sticky", top: 0, zIndex: 20,
          background: scrolled ? "rgba(237,242,231,0.88)" : "transparent",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(12px)" : "none",
          boxShadow: scrolled ? `0 10px 28px -16px rgba(34,48,31,0.32), 0 1px 0 ${RULE}66` : "none",
          transition: "background 0.35s ease, box-shadow 0.35s ease, backdrop-filter 0.35s ease",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontFamily: "'Special Elite', monospace", fontSize: 30, letterSpacing: "-0.01em", color: INK }}>
              ReconMint
            </span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: INK_SOFT }}>
              LEDGER No. 0412 RM
            </span>
          </div>
          <nav style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
            <NavLink href="#how-it-works">how it works</NavLink>
            <NavLink href="#features">product</NavLink>
            <NavLink href="#proof">proof</NavLink>
            <NavLink href="#razorpay">schema</NavLink>
            <NavLink href="#builder">builder</NavLink>
            <InkFillLink href={REPO_URL} extraStyle={{ fontSize: 13, padding: "7px 14px" }}>
              GitHub
            </InkFillLink>
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
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, fontWeight: 700,
                  letterSpacing: "0.14em", textTransform: "uppercase",
                  background: "#3395FF", color: "#fff",
                  padding: "4px 9px", borderRadius: 3,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", opacity: 0.9 }} />
                  Built on Razorpay
                </span>
                <span style={{
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, fontWeight: 700,
                  letterSpacing: "0.14em", textTransform: "uppercase",
                  color: STAMP_RED, border: `1px solid ${STAMP_RED}`,
                  padding: "3px 8px", borderRadius: 3,
                }}>
                  Buildathon · Track 4 · AI Finance Controller
                </span>
              </div>
              <Eyebrow color={STAMP_RED}>SETTLEMENT RECONCILIATION</Eyebrow>
            </Reveal>
            <Reveal delay={90} y={18}>
              <div style={{ fontFamily: "'Special Elite', monospace", fontSize: "clamp(18px, 2vw, 22px)", color: STAMP_RED, marginBottom: 6, letterSpacing: "0.01em" }}>
                ReconMint
              </div>
              <h1 style={{ fontFamily: "'Special Elite', monospace", fontSize: "clamp(34px, 4.4vw, 50px)", lineHeight: 1.22, margin: "0 0 20px" }}>
                An AI Finance Controller
                <br />
                for the books and the cash.
              </h1>
            </Reveal>
            <Reveal delay={190} y={18}>
              <p style={{ fontSize: 16.5, lineHeight: 1.7, color: INK_SOFT, maxWidth: 480, marginBottom: 32 }}>
                Three-way payment gateway settlement reconciliation that a merchant can actually trust,
                because the AI cannot fabricate a rupee.
              </p>
            </Reveal>
            <Reveal delay={280} y={14}>
              <div style={{ display: "flex", gap: 12, marginBottom: 26, flexWrap: "wrap" }}>
                <LedgerButton primary big onClick={handleGetStarted}>Try the live demo</LedgerButton>
                {DEMO_VIDEO_ID && (
                  <LedgerButton big onClick={handleWatchDemo}>Watch the 2 min demo</LedgerButton>
                )}
                <InkFillLink href={REPO_URL} extraStyle={{ fontSize: 13, padding: "10px 18px" }}>
                  Read the code &nbsp;→
                </InkFillLink>
              </div>
            </Reveal>
            <Reveal delay={360} y={10}>
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: INK_SOFT }}>
                Verification, not generation, is the bottleneck.
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

      {/* The Problem */}
      <div style={{ background: PANEL, position: "relative" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 46px" }}>
          <Reveal delay={0}><Eyebrow>THE PROBLEM</Eyebrow></Reveal>
          <Reveal delay={70}>
            <h2 style={{ fontFamily: "'Special Elite', monospace", fontSize: 26, marginBottom: 18, maxWidth: 700 }}>
              Merchants cannot tell if the money their payment gateway says it settled actually landed.
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p style={{ color: INK_SOFT, maxWidth: 720, lineHeight: 1.75, fontSize: 15.5, marginBottom: 34 }}>
              Fees, GST, TCS, T+2 settlement timing, and chargebacks all mean net never equals gross.
              Most merchants still reconcile that gap by hand, in a spreadsheet, once a month, after
              the fact. The right framing is a simple one: verification, not generation, is the
              bottleneck. An AI that can write a summary of what happened is not useful here. An AI that
              can prove a number, row by row, is.
            </p>
          </Reveal>

          <Reveal delay={200}>
            <div className="rm-gap-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
              <div style={{ background: PAPER, border: `1.5px solid ${INK}`, boxShadow: `6px 6px 0 rgba(34,48,31,0.08), 0 0 0 0.5px ${INK}11` }}>
                <div style={{
                  padding: "12px 18px", borderBottom: `1.5px solid ${INK}`,
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
                  letterSpacing: "0.1em", color: INK_SOFT,
                }}>
                  WHY NET NEVER EQUALS GROSS
                </div>
                <div style={{ padding: "6px 18px 4px" }}>
                  <EquationRow label="Order amount (gross)" sign="" value="what the customer paid" tone={INK} delay={0} />
                  <EquationRow label="Gateway fee" sign="-" value="platform commission" tone={STAMP_RED} delay={40} />
                  <EquationRow label="GST on fee" sign="-" value="tax on the commission" tone={STAMP_RED} delay={80} />
                  <EquationRow label="TCS withheld" sign="-" value="collected at source" tone={STAMP_RED} delay={120} />
                  <EquationRow label="Chargebacks / refunds" sign="-" value="reversed after settlement" tone={STAMP_RED} delay={160} />
                  <EquationRow label="T+2 timing shift" sign="~" value="lands 1-3 days later" tone={CARBON_BLUE} delay={200} />
                  <div style={{
                    display: "grid", gridTemplateColumns: "28px 1fr auto",
                    gap: 12, padding: "12px 0 8px",
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}>
                    <span style={{ color: VERIFY_GREEN, fontWeight: 700, fontSize: 15 }}>=</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Net settled</span>
                    <span style={{ fontSize: 13, color: VERIFY_GREEN, fontWeight: 600 }}>what actually lands</span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ border: `1.5px solid ${RULE}`, background: PAPER, padding: "18px 20px" }}>
                  <div style={{ fontFamily: "'Special Elite', monospace", fontSize: 15, marginBottom: 8 }}>
                    Six variables, one line item
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: INK_SOFT, lineHeight: 1.65 }}>
                    Every one of those deductions is legitimate, but they land at different times, in
                    different combinations, per order. A single settlement batch can mix same-day and
                    delayed payouts, partial refunds, and fee-schedule changes, all in one CSV row.
                    Spotting which rows don't add up by eye doesn't scale past a few hundred orders.
                  </p>
                </div>
                <div style={{
                  border: `1.5px solid ${STAMP_RED}`, background: PAPER,
                  padding: "18px 20px", display: "flex", gap: 12, alignItems: "flex-start",
                }}>
                  <span style={{
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                    color: STAMP_RED, border: `1px solid ${STAMP_RED}`,
                    padding: "2px 6px", whiteSpace: "nowrap", marginTop: 2,
                  }}>
                    WHY IT MATTERS
                  </span>
                  <p style={{ margin: 0, fontSize: 12.5, color: INK_SOFT, lineHeight: 1.65 }}>
                    A few unresolved rows a month look trivial. Left uninvestigated across a year, that's
                    silent revenue leakage: money the business is owed but never chases down, because no
                    one had the time to prove which rows were actually wrong.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      <TornDivider flip />

      {/* How it works */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 46px" }} id="how-it-works">
        <Reveal delay={0}><Eyebrow color={CARBON_BLUE}>HOW IT WORKS</Eyebrow></Reveal>
        <Reveal delay={70}>
          <h2 style={{ fontFamily: "'Special Elite', monospace", fontSize: 26, marginBottom: 34, maxWidth: 640 }}>
            Four steps. You can watch it reason the whole way through.
          </h2>
        </Reveal>
        <div className="rm-steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 30 }}>
          <StepCard num="01" title="Drop in three files" body="Order ledger, settlement report, bank statement. Any reasonable column shape, the loader figures it out." delay={100} />
          <StepCard num="02" title="The agent matches four ways" body="Exact on UTR + paise, then fuzzy with an amount-bucket index, then the Repair Agent tries three strategies per unmatched record." delay={170} />
          <StepCard num="03" title="It shows you every choice it made" body="Live Agent Trace during ingest. Per-record Decisions tree in the drawer. Every attempt logged in the audit table." delay={240} />
          <StepCard num="04" title="Resolve, and the loop closes" body="Pick a resolution reason, get a printable adjustment memo plus a JSON webhook payload naming the downstream target." delay={310} />
        </div>
      </div>

      <TornDivider />

      {/* Trust guarantee */}
      <div style={{ background: PANEL, position: "relative" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 46px" }}>
          <Reveal delay={0}><Eyebrow color={STAMP_RED}>THE TRUST GUARANTEE</Eyebrow></Reveal>
          <Reveal delay={70}>
            <h2 style={{ fontFamily: "'Special Elite', monospace", fontSize: 26, marginBottom: 14, maxWidth: 660 }}>
              The LLM never touches the math and never states a number it cannot prove.
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

      {/* Feature highlights - covers every direction in the Track 4 brief */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 46px" }} id="features">
        <Reveal delay={0}><Eyebrow color={CARBON_BLUE}>INSIDE THE PRODUCT</Eyebrow></Reveal>
        <Reveal delay={70}>
          <h2 style={{ fontFamily: "'Special Elite', monospace", fontSize: 26, marginBottom: 10, maxWidth: 720 }}>
            Every direction in the Track&nbsp;4 brief, in one product.
          </h2>
        </Reveal>
        <Reveal delay={130}>
          <p style={{ color: INK_SOFT, maxWidth: 660, lineHeight: 1.7, marginBottom: 30, fontSize: 14 }}>
            Multi-source reconciliation, settlement Q&amp;A, forward cash forecasting, tax-line
            matching. Plus a live sponsor-API handshake, a per-record Repair Agent, and a
            downstream artifact that closes the finance-ops loop.
          </p>
        </Reveal>
        <div className="rm-feature-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
          {/* Row 1 - the Track-4 named directions */}
          <FeatureCard tag="CASH · NOW" color={VERIFY_GREEN} title="Cash Position, live" body="Four mutually exclusive buckets: Cleared, In-flight, At-risk, Ghost. Net Available headline the CFO can actually spend." delay={110} />
          <FeatureCard tag="CASH · +7d" color={CARBON_BLUE} title="Forward Cash Forecast" body="Every in-flight settlement projected forward using the T+2 business-day rule. Past-due list surfaces automatically." delay={160} />
          <FeatureCard tag="TAX" color={STAMP_RED} title="Tax-line Matcher" body="MDR, GST on MDR, TCS reconstructed against Razorpay's schedule. Recover vs Reserve exposure per record." delay={210} />

          {/* Row 2 - the agent proof + revenue advice + sponsor grounding */}
          <FeatureCard tag="AGENT" color={CARBON_BLUE} title="Repair Agent branching" body="Per record, three strategies tried in order. First winner accepts. Every attempt logged in the Decisions tree." delay={260} />
          <FeatureCard tag="ADVICE" color={VERIFY_GREEN} title="Fee-slab recommendation" body="Reads observed MDR, compares against Razorpay slabs, projects annual savings. Turns audit into revenue advice." delay={310} />
          <FeatureCard tag="SPONSOR" color={STAMP_RED} title="Live Razorpay handshake" body="At ingest we call api.razorpay.com/v1/orders with the test keys. Real IDs. Real X-Request-Id an auditor can quote." delay={360} />

          {/* Row 3 - the loop-closing + verified Q&A + benchmark */}
          <FeatureCard tag="LOOP" color={CARBON_BLUE} title="Adjustment memo · closes the loop" body="Resolve any exception and you get a printable HTML memo plus a JSON webhook payload naming the downstream target." delay={410} />
          <FeatureCard tag="ASK" color={VERIFY_GREEN} title="Verified Q&A agent" body="Parse intent, compute deterministically, hallucination-verify every rupee, phrase the answer. Click 'Prove it' for the receipts." delay={460} />
          <FeatureCard tag="SCALE" color={STAMP_RED} title="149,250 rows in 3.6 min" body="Stress benchmark on 1k / 10k / 50k row generations. 687 rec/s peak with full per-record agent branching enabled." delay={510} />
        </div>
      </div>

      <TornDivider />

      {/* Proof band */}
      <div style={{ background: INK, color: PAPER, position: "relative", overflow: "hidden" }} id="proof">
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0,
          backgroundImage: `linear-gradient(90deg, transparent, ${GOLD}22, transparent)`,
          opacity: 0.5,
        }} />
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "54px 46px", position: "relative" }}>
          <Reveal delay={0}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
              letterSpacing: "0.18em", color: GOLD_SOFT, marginBottom: 28,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ width: 22, height: 1, background: GOLD_SOFT, display: "inline-block" }} />
              MEASURED, NOT CLAIMED
            </div>
          </Reveal>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0, border: "1px solid #33422F", borderRadius: "2px" }}
            className="rm-proof-grid"
          >
            {[
              ["149,250 rows", "verified in 217s on the stress benchmark"],
              ["F1 = 1.00", "on the ground-truth demo eval"],
              ["687 rec/s", "peak with full per-record agent branching"],
              ["3 strategies / record", "Repair Agent, first winner accepts >= 0.85"],
              ["0 fake rupees", "every figure traces to a row in the audit table"],
            ].map(([value, label], i) => (
              <Reveal key={value} delay={80 + i * 70} y={10}>
                <div style={{
                  position: "relative", padding: "20px 22px",
                  borderLeft: i === 0 ? "none" : "1px solid #33422F",
                  height: "100%", overflow: "hidden",
                }}>
                  <span aria-hidden="true" style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: 2,
                    background: `linear-gradient(90deg, ${GOLD}, transparent)`,
                    opacity: 0.75,
                  }} />
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

      <TornDivider flip />

      {/* Built for Razorpay */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 46px" }} id="razorpay">
        <Reveal delay={0}><Eyebrow color={VERIFY_GREEN}>BUILT FOR RAZORPAY</Eyebrow></Reveal>
        <Reveal delay={70}>
          <h2 style={{ fontFamily: "'Special Elite', monospace", fontSize: 26, marginBottom: 14, maxWidth: 680 }}>
            Every field shape is real. Only the volume running through it is synthetic.
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <p style={{ color: INK_SOFT, maxWidth: 680, lineHeight: 1.75, fontSize: 15, marginBottom: 34 }}>
            The demo cannot run against a live merchant account, so the settlement, order, and payment
            objects it reconciles are generated: generated against the actual Razorpay Settlements
            and Payments API schema, field by field, not guessed at. Where a name, type, or unit differs
            from what a real integration returns, that gap is called out below rather than smoothed over.
          </p>
        </Reveal>

        <div className="rm-razorpay-grid" style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 22, alignItems: "start" }}>
          <Reveal delay={170} y={16}>
            <div style={{ background: PAPER, border: `1.5px solid ${INK}`, boxShadow: `6px 6px 0 rgba(34,48,31,0.08)` }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 18px", borderBottom: `1.5px solid ${INK}`,
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
                letterSpacing: "0.1em", color: INK_SOFT,
              }}>
                <span>FIELD REGISTER</span>
                <span>RAZORPAY API / RECONMINT</span>
              </div>
              {[
                ["razorpay_settlement_id", "settlement_id", "exact"],
                ["utr", "utr", "exact"],
                ["amount", "gross_paise", "exact"],
                ["fees", "fee_paise", "exact"],
                ["tax", "gst_paise", "exact"],
                ["status", "settlement_status", "exact"],
                ["settled_at", "settled_at", "close: unix to IST"],
                ["order_id", "order_ref", "close: prefix stripped"],
                ["method", "payment_method", "close: casing normalized"],
                ["tds / tcs breakdown", "tcs_paise", "disclosed gap: not itemized in live API"],
              ].map(([raz, rm, kind], i) => {
                const isExact = kind === "exact";
                const tagColor = isExact ? VERIFY_GREEN : kind.startsWith("close") ? CARBON_BLUE : STAMP_RED;
                return (
                  <FieldRow key={raz} raz={raz} rm={rm} kind={kind} tagColor={tagColor} isLast={i === 9} delay={210 + i * 45} />
                );
              })}
            </div>
          </Reveal>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Reveal delay={220} y={16}>
              <div style={{
                background: PANEL, border: `1.5px solid ${INK}`,
                padding: "26px 28px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13,
                boxShadow: `6px 6px 0 rgba(34,48,31,0.08)`,
              }}>
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
                  Field shapes are real, validated live. Volume and settlement timing are synthetic
                  and disclosed as such.
                </div>
              </div>
            </Reveal>

            <Reveal delay={280} y={16}>
              <div style={{
                border: `1.5px solid ${STAMP_RED}`, background: PAPER,
                padding: "18px 20px", display: "flex", gap: 12, alignItems: "flex-start",
              }}>
                <span style={{
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                  color: STAMP_RED, border: `1px solid ${STAMP_RED}`,
                  padding: "2px 6px", whiteSpace: "nowrap", marginTop: 2,
                }}>
                  HONESTY NOTE
                </span>
                <p style={{ margin: 0, fontSize: 12.5, color: INK_SOFT, lineHeight: 1.65 }}>
                  The live Razorpay Settlements API doesn't itemize a TDS/TCS split. That number is
                  reconstructed by ReconMint's fee engine, not pulled from the API. It's flagged here
                  instead of quietly folded into an "exact match" count.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </div>

      <TornDivider />

      {/* Builder */}
      <div style={{ background: PANEL }} id="builder">
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "50px 46px" }}>
          <Reveal delay={0}><Eyebrow>THE BUILDER</Eyebrow></Reveal>
          <Reveal delay={80} y={16}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              flexWrap: "wrap", gap: 20,
              border: `1.5px solid ${INK}`, background: PAPER,
              padding: "24px 26px",
              boxShadow: `5px 5px 0 rgba(34,48,31,0.08)`,
            }}>
              <div>
                <div style={{ fontFamily: "'Special Elite', monospace", fontSize: 18, marginBottom: 6 }}>{YOUR_NAME}</div>
                <p style={{ fontSize: 13.5, color: INK_SOFT, margin: 0, maxWidth: 480, lineHeight: 1.6 }}>
                  Designed and built solo, end to end: the agent loop, the verifier, and this interface.
                </p>
              </div>
              <InkFillLink href={YOUR_GITHUB_URL}>
                {YOUR_GITHUB_HANDLE} on GitHub
              </InkFillLink>
            </div>
          </Reveal>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        maxWidth: 1180, margin: "0 auto", padding: "22px 46px 40px",
        borderTop: `2px solid ${INK}`,
        display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
      }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: INK_SOFT }}>
          ReconMint: a verification agent for money.
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: INK_SOFT }}>
          0 hallucinated figures. 100% integer paise.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FieldRow -- hover highlight on individual register rows
// ---------------------------------------------------------------------------
function FieldRow({ raz, rm, kind, tagColor, isLast, delay }) {
  const [hover, setHover] = useState(false);
  return (
    <Reveal as="div" delay={delay} y={8} key={raz}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "grid", gridTemplateColumns: "1fr 1fr auto",
          gap: 10, alignItems: "center",
          padding: "10px 18px",
          borderBottom: isLast ? "none" : `1px dashed ${RULE}`,
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
          background: hover ? `${tagColor}09` : "transparent",
          transition: "background 0.2s ease",
        }}
      >
        <span style={{ color: INK }}>{raz}</span>
        <span style={{ color: INK_SOFT }}>/ {rm}</span>
        <span style={{
          justifySelf: "end", fontSize: 9.5, letterSpacing: "0.06em",
          color: tagColor, border: `1px solid ${tagColor}`,
          padding: "2px 6px", whiteSpace: "nowrap",
        }}>
          {kind.toUpperCase()}
        </span>
      </div>
    </Reveal>
  );
}