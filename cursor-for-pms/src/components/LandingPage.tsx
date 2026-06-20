"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Product Brain playground data ────────────────────────────────────────────
const sandboxData = {
  fintech: {
    label: "Fintech Ledger (B2B SaaS)",
    brain: { audience: "Enterprise CFOs & Procurement leads", constraint: "SOC2 Type II. Zero external analytics.", northStar: "Bank verification < 2 hrs (was 5 days)." },
    spec: {
      generic: `Section: Checkout Feature\n\n1. Introduction\nThis document defines requirements for the checkout page. We will build a safe and secure way for users to pay.\n\n2. Goals\n• Ensure payment fields work properly.\n• Follow standard templates.\n• Make onboarding as fast as possible.`,
      pmind: { title: "PRD: Ledger Sync Gateway", profile: "B2B High-Compliance FinTech", lines: ["Deliver bank ledger sync inside SOC2 Type II boundaries — zero external analytics.", "Bank Verification: Isolated microservice targets < 2 hr onboarding.", "Failure protocol: fallback ledger files, no third-party endpoints called."] },
    },
    stories: {
      generic: `EPIC: Payment Systems\n\nSTORY-001: Pay Invoice\nAs a user, I want to pay my invoices online.\nAC:\n1. Pay button visible.\n2. User can enter card numbers.`,
      pmind: { title: "EPIC: Compliant Ledger Sync", profile: "B2B High-Compliance FinTech", lines: ["STORY-001 · Isolated Caching [5 pts] — Ledger sync inside secure network boundaries, SOC2 compliant.", "STORY-002 · Onboarding Speed [3 pts] — Bank verification assistant targeting < 2 hr completion.", "AC: No third-party APIs called; instant validation rules on submission."] },
    },
  },
  travel: {
    label: "TravelFlow (B2C Mobile)",
    brain: { audience: "Mobile-first leisure travelers", constraint: "Weak 3G networks. Apple Pay priority.", northStar: "Mobile checkout completion > 85% (was 54%)." },
    spec: {
      generic: `Section: Checkout Feature\n\n1. Introduction\nThis document defines requirements for the checkout page. We will build a safe and secure way for users to pay.\n\n2. Goals\n• Ensure payment fields work properly.\n• Follow standard templates.\n• Make onboarding as fast as possible.`,
      pmind: { title: "PRD: Mobile Booking Checkout", profile: "B2C Mobile Travel", lines: ["Streamline mobile checkout past the 85% completion target.", "Apple Pay occupies above-the-fold screen space — takes priority over card inputs.", "Asset bundles < 80 KB to stay fast on weak 3G."] },
    },
    stories: {
      generic: `EPIC: Payment Systems\n\nSTORY-001: Pay Invoice\nAs a user, I want to pay my invoices online.\nAC:\n1. Pay button visible.\n2. User can enter card numbers.`,
      pmind: { title: "EPIC: Instant Booking Redesign", profile: "B2C Mobile Travel", lines: ["STORY-001 · Apple Pay above-the-fold [3 pts] — one-click checkout without typing on weak wifi.", "STORY-002 · Offline Queue [5 pts] — checkout confirmations queue offline, payloads < 15 KB.", "AC: Auto-detect Apple Pay; target p95 load < 1.2 s on 3G."] },
    },
  },
  devtool: {
    label: "DevPulse API (Dev Platform)",
    brain: { audience: "Full-stack backend developers, CLI-first", constraint: "YAML config, < 50 ms latency.", northStar: "Time-to-first-API-call < 5 min." },
    spec: {
      generic: `Section: Checkout Feature\n\n1. Introduction\nThis document defines requirements for the checkout page. We will build a safe and secure way for users to pay.\n\n2. Goals\n• Ensure payment fields work properly.\n• Follow standard templates.\n• Make onboarding as fast as possible.`,
      pmind: { title: "PRD: CLI API-Key Dispatch", profile: "Developer Tool Platform", lines: ["Zero-config API key dispatch targeting time-to-first-call < 5 min.", "Credentials rendered natively via CLI; config via YAML files only.", "Gateway dispatch < 50 ms p95; edge-cached validation."] },
    },
    stories: {
      generic: `EPIC: Payment Systems\n\nSTORY-001: Pay Invoice\nAs a user, I want to pay my invoices online.\nAC:\n1. Pay button visible.\n2. User can enter card numbers.`,
      pmind: { title: "EPIC: Dev Onboarding Redesign", profile: "Developer Tool Platform", lines: ["STORY-001 · YAML key generation [3 pts] — 'pmind init' outputs copy-pasteable YAML keys.", "STORY-002 · Low-Latency Gateway [8 pts] — validation in < 50 ms, p95 at < 35 ms.", "AC: Edge cache on validation endpoint; zero third-party credential logging."] },
    },
  },
} as const;

type Profile = keyof typeof sandboxData;
type SandboxTask = "spec" | "stories";

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [profile, setProfile] = useState<Profile>("fintech");
  const [task, setTask] = useState<SandboxTask>("spec");

  // ── Canvas animation ───────────────────────────────────────────────────────
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const gctx = ctx;
    let W = 0, H = 0, t = 0, raf = 0;

    function resize() { W = c!.width = innerWidth; H = c!.height = innerHeight; }
    resize();
    window.addEventListener("resize", resize);

    const orbs = [
      { nx:0.14, ny:0.18, r:380, a:0.11, sp:0.19, ph:0.0 },
      { nx:0.82, ny:0.42, r:320, a:0.08, sp:0.14, ph:2.1 },
      { nx:0.50, ny:0.78, r:420, a:0.06, sp:0.11, ph:4.2 },
      { nx:0.92, ny:0.12, r:260, a:0.09, sp:0.22, ph:1.1 },
      { nx:0.28, ny:0.62, r:300, a:0.05, sp:0.16, ph:3.4 },
    ];
    const pts = Array.from({ length: 110 }, () => ({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      vx: 0, vy: 0, life: Math.random(), sz: 0.55 + Math.random() * 1.1,
    }));

    function frame() {
      t += 0.007;
      gctx.fillStyle = "rgba(5,5,5,0.20)";
      gctx.fillRect(0, 0, W, H);
      orbs.forEach(o => {
        const cx = (o.nx + Math.sin(t * o.sp + o.ph) * 0.09) * W;
        const cy = (o.ny + Math.cos(t * o.sp * 0.65 + o.ph) * 0.07) * H;
        const r  = o.r * (1 + Math.sin(t * o.sp * 1.3 + o.ph) * 0.12);
        const g  = gctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0,    `rgba(217,119,6,${o.a})`);
        g.addColorStop(0.38, `rgba(160,70,8,${o.a * 0.42})`);
        g.addColorStop(1,    "rgba(0,0,0,0)");
        gctx.fillStyle = g;
        gctx.beginPath(); gctx.arc(cx, cy, r, 0, Math.PI * 2); gctx.fill();
      });
      pts.forEach(p => {
        const ang = (Math.sin(p.x * 0.0022 + t * 0.38) * Math.cos(p.y * 0.0018 + t * 0.27) + Math.sin((p.x + p.y) * 0.0012 + t * 0.44)) * Math.PI * 1.6;
        p.vx = p.vx * 0.88 + Math.cos(ang) * 0.55;
        p.vy = p.vy * 0.88 + Math.sin(ang) * 0.38;
        p.x += p.vx; p.y += p.vy; p.life += 0.0038;
        if (p.life > 1 || p.x < -8 || p.x > W + 8 || p.y < -8 || p.y > H + 8) {
          p.x = Math.random() * W; p.y = Math.random() * H; p.vx = 0; p.vy = 0; p.life = 0;
        }
        const alpha = Math.sin(p.life * Math.PI) * 0.21;
        gctx.fillStyle = p.y < H * 0.58 ? `rgba(217,128,6,${alpha})` : `rgba(200,170,120,${alpha * 0.38})`;
        gctx.beginPath(); gctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2); gctx.fill();
      });
      raf = requestAnimationFrame(frame);
    }
    gctx.fillStyle = "#050505";
    gctx.fillRect(0, 0, innerWidth, innerHeight);
    raf = requestAnimationFrame(frame);
    return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(raf); };
  }, []);

  // ── Scroll-reveal ──────────────────────────────────────────────────────────
  useEffect(() => {
    const io = new IntersectionObserver(
      entries => entries.forEach(x => { if (x.isIntersecting) x.target.classList.add("lp-vis"); }),
      { threshold: 0.07, rootMargin: "0px 0px -28px 0px" }
    );
    document.querySelectorAll(".lp-reveal").forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  const S = {
    amber:       "#D97706" as const,
    amberHi:     "#F59E0B" as const,
    text:        "#F5F2EE" as const,
    text2:       "rgba(245,242,238,0.65)" as const,
    text3:       "rgba(245,242,238,0.35)" as const,
    serif:       "var(--font-playfair),Georgia,serif" as const,
    mono:        "'JetBrains Mono',monospace" as const,
    amberBorder: "1px solid rgba(217,119,6,0.15)" as const,
  };

  const divider = <div style={{ height:1, zIndex:1, position:"relative", background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.055) 28%,rgba(255,255,255,0.055) 72%,transparent)" }} />;

  const chip = (label: string) => (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", background:"rgba(217,119,6,0.09)", border:S.amberBorder, borderRadius:100, fontFamily:S.mono, fontSize:9, color:S.amberHi, letterSpacing:"0.08em", textTransform:"uppercase" as const }}>
      <span style={{ width:4, height:4, borderRadius:"50%", background:S.amber, flexShrink:0 }} />
      {label}
    </span>
  );

  const data = sandboxData[profile];
  const output = data[task];

  return (
    <div style={{ fontFamily:"var(--font-inter),-apple-system,sans-serif", background:"#050505", color:S.text, lineHeight:1.6, overflowX:"hidden", WebkitFontSmoothing:"antialiased" }}>
      <canvas ref={canvasRef} style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none", opacity:0.72 }} />
      <div className="lp-bg-grain" />
      <div className="lp-bg-grid" />
      <div className="lp-bg-aurora" />
      <div className="lp-bg-amber" />
      <div className="lp-beams" aria-hidden="true">
        <div className="lp-beam" /><div className="lp-beam" /><div className="lp-beam" />
        <div className="lp-beam" /><div className="lp-beam" />
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav style={{ position:"fixed", top:0, left:0, right:0, zIndex:600, height:62, background:"rgba(5,5,5,0.82)", backdropFilter:"blur(28px) saturate(1.5)", WebkitBackdropFilter:"blur(28px) saturate(1.5)", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ maxWidth:1120, margin:"0 auto", padding:"0 28px", height:"100%", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:27, height:27, background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:S.serif, fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.95)", boxShadow:"0 4px 14px rgba(217,119,6,0.25)" }}>P</div>
            <span style={{ fontFamily:S.serif, fontWeight:700, fontSize:17, letterSpacing:"-0.02em" }}>PMind</span>
            <span style={{ marginLeft:4, padding:"2px 8px", background:"rgba(217,119,6,0.10)", border:S.amberBorder, borderRadius:100, fontSize:9, fontWeight:700, letterSpacing:"0.10em", textTransform:"uppercase", color:S.amberHi }}>Private Beta</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:20 }}>
            <a href="#product-brain" className="nav-link">Product Brain</a>
            <a href="#discovery"     className="nav-link">Discovery</a>
            <a href="#track-record"  className="nav-link">Track Record</a>
            <a href="#pricing"       className="nav-link">Pricing</a>
            <Link href="/sign-in" style={{ padding:"7px 16px", background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:6, color:"#fff", fontSize:13, fontWeight:600, textDecoration:"none", boxShadow:"0 2px 12px rgba(217,119,6,0.22)", whiteSpace:"nowrap" }}>
              Get started free →
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section style={{ paddingTop:144, paddingBottom:56, textAlign:"center", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1120, margin:"0 auto", padding:"0 28px" }}>
          <h1 style={{ fontFamily:S.serif, fontSize:"clamp(46px,6.2vw,80px)", fontWeight:700, lineHeight:1.04, letterSpacing:"-0.03em", marginBottom:22, maxWidth:820, marginLeft:"auto", marginRight:"auto" }}>
            The first PM workspace<br />
            <em style={{ fontStyle:"italic", fontWeight:400, color:S.amberHi }}>that remembers.</em>
          </h1>
          <p style={{ fontSize:18, color:S.text2, maxWidth:580, margin:"0 auto 36px", lineHeight:1.68, fontWeight:400 }}>
            PMind learns your product, remembers every decision you make, and tells you whether your bets actually paid off — so discovery, specs, and prioritization run on your real track record, not vibes.
          </p>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:14, flexWrap:"wrap", padding:"0 8px" }}>
            <Link href="/sign-in" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"13px 28px", background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:6, color:"#fff", fontSize:14, fontWeight:600, textDecoration:"none", boxShadow:"0 4px 20px rgba(217,119,6,0.28)" }}>
              Get started free →
            </Link>
            <a href="#demo" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"13px 22px", borderRadius:6, color:S.text, fontSize:14, fontWeight:500, textDecoration:"none", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)" }}>
              See it work ↓
            </a>
          </div>
        </div>
      </section>

      {/* ── Hero visual: Track Record scorecard ─────────────────────────────── */}
      <section style={{ padding:"0 0 96px", position:"relative", zIndex:1 }} id="demo">
        <div style={{ maxWidth:820, margin:"0 auto", padding:"0 28px" }}>
          <div className="lp-reveal" style={{ position:"relative" }}>
            <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:"80%", height:240, pointerEvents:"none", zIndex:0, background:"radial-gradient(ellipse,rgba(217,119,6,0.10) 0%,transparent 65%)" }} />
            <div style={{ borderRadius:8, overflow:"hidden", boxShadow:"0 32px 80px rgba(0,0,0,0.72),0 0 0 1px rgba(217,119,6,0.12)", position:"relative", zIndex:1 }}>
              {/* Titlebar */}
              <div style={{ background:"#0d0d0d", borderBottom:"1px solid rgba(217,119,6,0.08)", padding:"9px 14px", display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ display:"flex", gap:6 }}>
                  {["#FF5F57","#FFBD2E","#28CA41"].map(c => <div key={c} style={{ width:10, height:10, borderRadius:"50%", background:c }} />)}
                </div>
                <span style={{ fontFamily:S.mono, fontSize:11, color:"rgba(255,255,255,0.22)" }}>Track Record · Q2 2026 · PMind</span>
              </div>
              {/* Scorecard body */}
              <div style={{ background:"#111", padding:"20px 24px", display:"flex", flexDirection:"column", gap:0 }}>
                {/* Header row */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18, paddingBottom:14, borderBottom:"1px solid rgba(255,255,255,0.055)" }}>
                  <div>
                    <div style={{ fontFamily:S.serif, fontSize:15, fontWeight:700, letterSpacing:"-0.015em" }}>Your Product Bets</div>
                    <div style={{ fontFamily:S.mono, fontSize:9, color:S.text3, letterSpacing:"0.07em", textTransform:"uppercase", marginTop:3 }}>6 features reviewed · Q2 2026</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontFamily:S.serif, fontSize:22, fontWeight:700, color:S.amberHi }}>67%</div>
                    <div style={{ fontFamily:S.mono, fontSize:9, color:S.text3, letterSpacing:"0.06em", textTransform:"uppercase" }}>Calibration score</div>
                  </div>
                </div>
                {/* Bet rows */}
                {[
                  { name:"Checkout redesign",    predicted:"−10pp abandon rate",      actual:"−7pp",   hit:true,  note:"Hit" },
                  { name:"Mobile onboarding",    predicted:"+15% 30-day activation",  actual:"+12%",   hit:true,  note:"Close" },
                  { name:"Pricing A/B test",     predicted:"+8% conversion",          actual:"+2%",    hit:false, note:"Miss" },
                  { name:"Export performance",   predicted:"−40% support tickets",    actual:"−38%",   hit:true,  note:"Hit" },
                ].map((row, i) => (
                  <div key={i} className="lp-bet-row">
                    <div className="lp-bet-name" style={{ color:S.text }}>{row.name}</div>
                    <div style={{ flex:1, display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
                      <span style={{ fontSize:11, color:S.text3, fontFamily:S.mono }}>predicted</span>
                      <span style={{ fontSize:12, color:S.text2 }}>{row.predicted}</span>
                      <span style={{ fontSize:11, color:S.text3, margin:"0 2px" }}>→</span>
                      <span style={{ fontSize:12, fontWeight:600, color:row.hit ? "#4ade80" : "#f87171" }}>{row.actual}</span>
                    </div>
                    <div style={{ flexShrink:0, padding:"2px 9px", borderRadius:100, background:row.hit ? "rgba(74,222,128,0.10)" : "rgba(248,113,113,0.10)", border:`1px solid ${row.hit ? "rgba(74,222,128,0.22)" : "rgba(248,113,113,0.22)"}`, fontFamily:S.mono, fontSize:9, fontWeight:700, color:row.hit ? "#4ade80" : "#f87171", letterSpacing:"0.07em" }}>{row.note}</div>
                  </div>
                ))}
                {/* PMind insight */}
                <div style={{ marginTop:14, padding:"10px 14px", background:"rgba(217,119,6,0.06)", border:S.amberBorder, borderRadius:6, display:"flex", alignItems:"flex-start", gap:8 }}>
                  <span style={{ color:S.amber, fontSize:13, flexShrink:0, marginTop:1 }}>✦</span>
                  <p style={{ fontSize:12, color:S.text2, lineHeight:1.6, margin:0 }}>
                    <strong style={{ color:S.text }}>PMind:</strong> Your mobile bets calibrate well — 3 for 3 within 20%. Your pricing bets don&apos;t — consider raising confidence thresholds before committing.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <p style={{ marginTop:14, textAlign:"center", fontFamily:S.mono, fontSize:10, color:S.text3, letterSpacing:"0.08em" }}>Illustrative month-6 state · Your track record grows every time you ship</p>
        </div>
      </section>

      {divider}

      {/* ── Problem agitation ────────────────────────────────────────────────── */}
      <section style={{ padding:"80px 0", position:"relative", zIndex:1, textAlign:"center" }}>
        <div style={{ maxWidth:680, margin:"0 auto", padding:"0 28px" }}>
          <div className="lp-reveal">
            <p style={{ fontFamily:S.serif, fontSize:"clamp(18px,2.4vw,24px)", color:S.text2, lineHeight:1.65, fontStyle:"italic", letterSpacing:"-0.015em", marginBottom:20 }}>
              Every AI tool forgets you by morning. You re-paste your constraints, re-explain your users, re-derive the same context — every session.
            </p>
            <p style={{ fontFamily:S.serif, fontSize:"clamp(18px,2.4vw,24px)", color:S.text, lineHeight:1.65, fontStyle:"italic", letterSpacing:"-0.015em" }}>
              But the deeper problem isn&apos;t memory of context. It&apos;s that no PM tool remembers your <em style={{ color:S.amberHi }}>decisions</em> — or ever tells you if they were right.
            </p>
            <p style={{ fontSize:15, color:S.text3, marginTop:24, fontFamily:S.mono, letterSpacing:"0.04em" }}>PMind is built to close that gap.</p>
          </div>
        </div>
      </section>

      {divider}

      {/* ══ Beat 1: GROUND ════════════════════════════════════════════════════ */}
      <section id="product-brain" style={{ padding:"96px 0", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1120, margin:"0 auto", padding:"0 28px" }}>
          {/* Section label */}
          <div className="lp-reveal" style={{ display:"flex", alignItems:"center", gap:12, marginBottom:48 }}>
            <span style={{ fontFamily:S.mono, fontSize:9, color:S.amber, letterSpacing:"0.14em", textTransform:"uppercase" }}>01 · Ground</span>
            <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.05)" }} />
          </div>
          <div className="lp-reveal lp-two-col">
            <div>
              <h2 style={{ fontFamily:S.serif, fontSize:"clamp(28px,3.6vw,42px)", fontWeight:700, lineHeight:1.12, letterSpacing:"-0.025em", marginBottom:20 }}>
                It knows<br /><em style={{ fontStyle:"italic", fontWeight:400, color:S.amberHi }}>your product.</em>
              </h2>
              <p style={{ fontSize:15, color:S.text2, lineHeight:1.7, maxWidth:420, marginBottom:28 }}>
                Set your audience, constraints, and north-star metric once in your Product Brain. Every spec, story, and answer is generated against your actual strategy — not a generic template.
              </p>
              {chip("Always-on context")}
            </div>
            {/* Live demo: Product Brain card */}
            <div style={{ background:"rgba(14,14,14,0.9)", border:"1px solid rgba(217,119,6,0.12)", borderRadius:7, padding:"20px 22px" }}>
              <div style={{ fontFamily:S.mono, fontSize:9, color:S.amber, letterSpacing:"0.10em", textTransform:"uppercase", marginBottom:14, opacity:0.7 }}>Product Brain · Active</div>
              {[
                { label:"Audience", value:data.brain.audience },
                { label:"Constraint", value:data.brain.constraint },
                { label:"North Star", value:data.brain.northStar },
              ].map(row => (
                <div key={row.label} style={{ marginBottom:12 }}>
                  <div style={{ fontFamily:S.mono, fontSize:9, color:S.text3, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:3 }}>{row.label}</div>
                  <div style={{ fontSize:12.5, color:S.text, lineHeight:1.5 }}>{row.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Playground ────────────────────────────────────────────────────────── */}
      <section id="playground" className="playground" style={{ position:"relative", zIndex:1, background:"#090909", borderTop:"1px solid rgba(255,255,255,0.02)", borderBottom:"1px solid rgba(255,255,255,0.02)", padding:"0 0 80px" }}>
        <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:0, background:"radial-gradient(circle at 50% 50%, rgba(217,119,6,0.04) 0%, transparent 68%)" }} />
        <div className="container" style={{ position:"relative", zIndex:1 }}>
          <div className="play-header lp-reveal" style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"5px 14px", marginBottom:20, background:"rgba(217,119,6,0.08)", border:S.amberBorder, borderRadius:100, fontSize:10, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:S.amberHi }}>
              <span className="lp-badge-pulse" />&nbsp;Live Demo
            </div>
            <h3 style={{ fontFamily:S.serif, fontSize:"clamp(24px,3vw,34px)", fontWeight:700, marginBottom:12, textAlign:"center" }}>
              Same prompt. <em style={{ fontStyle:"italic", fontWeight:400, color:S.amberHi }}>Different world.</em>
            </h3>
            <p style={{ fontSize:15, color:S.text2, maxWidth:520, margin:"0 auto", textAlign:"center" }}>Toggle between product profiles to see how Product Brain transforms generic output into strategy-grounded specs.</p>
          </div>

          <div className="play-grid lp-reveal" style={{ marginTop:40 }}>
            {/* Profile selector */}
            <div className="sandbox-selector glass">
              <div className="profile-group">
                <span className="sb-section-title">Product Profile</span>
                {(["fintech","travel","devtool"] as Profile[]).map(p => (
                  <button key={p} className={`profile-btn ${profile === p ? "active" : ""}`} onClick={() => setProfile(p)}>
                    {sandboxData[p].label}
                  </button>
                ))}
              </div>
              <div className="profile-group">
                <span className="sb-section-title">Product Brain</span>
                <div className="profile-meta-card">
                  <div className="profile-meta-title">Audience</div>
                  <div style={{ marginBottom:8 }}>{data.brain.audience}</div>
                  <div className="profile-meta-title">Constraint</div>
                  <div style={{ marginBottom:8 }}>{data.brain.constraint}</div>
                  <div className="profile-meta-title">North Star</div>
                  <div>{data.brain.northStar}</div>
                </div>
              </div>
            </div>

            {/* Output comparison */}
            <div className="sandbox-screen glass">
              <div className="sandbox-tabs">
                <div className="sb-tab-group">
                  {(["spec","stories"] as SandboxTask[]).map(t => (
                    <button key={t} className={`sb-tab ${task === t ? "active" : ""}`} onClick={() => setTask(t)}>
                      {t === "spec" ? "Draft Specification" : "Write User Stories"}
                    </button>
                  ))}
                </div>
                <div className="sb-run-indicator"><span className="sb-run-dot" />Grounding active</div>
              </div>
              <div className="sandbox-body">
                {/* Generic */}
                <div className="sb-column" style={{ borderRight:"1px solid rgba(255,255,255,0.04)", opacity:0.45 }}>
                  <div className="sb-col-header sb-chatgpt-header">Generic ChatGPT</div>
                  <div className="sb-code sb-code-chatgpt">{output.generic}</div>
                </div>
                {/* PMind grounded */}
                <div className="sb-column" style={{ background:"rgba(217,119,6,0.015)" }}>
                  <div className="sb-col-header sb-pmind-header">PMind · Grounded</div>
                  <div className="sb-code sb-code-pmind">
                    <strong>{output.pmind.title}</strong>
                    <br />
                    <span style={{ fontSize:"0.88em", color:S.amberHi }}>Profile: [{output.pmind.profile}]</span>
                    <br /><br />
                    {output.pmind.lines.map((line, i) => <div key={i} style={{ marginBottom:6 }}>• {line}</div>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {divider}

      {/* ══ Beat 2: DISCOVER ══════════════════════════════════════════════════ */}
      <section id="discovery" style={{ padding:"96px 0", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1120, margin:"0 auto", padding:"0 28px" }}>
          <div className="lp-reveal" style={{ display:"flex", alignItems:"center", gap:12, marginBottom:48 }}>
            <span style={{ fontFamily:S.mono, fontSize:9, color:S.amber, letterSpacing:"0.14em", textTransform:"uppercase" }}>02 · Discover</span>
            <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.05)" }} />
          </div>
          <div className="lp-reveal lp-two-col">
            <div>
              <h2 style={{ fontFamily:S.serif, fontSize:"clamp(28px,3.6vw,42px)", fontWeight:700, lineHeight:1.12, letterSpacing:"-0.025em", marginBottom:20 }}>
                It remembers what<br /><em style={{ fontStyle:"italic", fontWeight:400, color:S.amberHi }}>users keep saying.</em>
              </h2>
              <p style={{ fontSize:15, color:S.text2, lineHeight:1.7, maxWidth:420, marginBottom:28 }}>
                Drop in interviews, tickets, and NPS. PMind doesn&apos;t just summarize this week&apos;s batch — it recognizes the same pain across months as one growing signal. You see what&apos;s recurring and accelerating, not a fresh pile of quotes each time.
              </p>
              {chip("Quarter-over-quarter signal tracking")}
            </div>
            {/* Live evidence surface */}
            <div style={{ background:"rgba(14,14,14,0.9)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:7, overflow:"hidden" }}>
              <div style={{ padding:"11px 16px", borderBottom:"1px solid rgba(255,255,255,0.05)", display:"flex", alignItems:"center", gap:7 }}>
                <span style={{ fontFamily:S.mono, fontSize:9, color:S.text3, letterSpacing:"0.08em", textTransform:"uppercase" }}>Top themes · last 12 months</span>
              </div>
              {[
                { name:"Slow export",          count:23, trend:"+40%", q:"Q2 2026", shipped:false },
                { name:"Onboarding confusion", count:18, trend:"+12%", q:"Q2 2026", shipped:true  },
                { name:"Pricing clarity",      count:14, trend:"+28%", q:"Q1 2026", shipped:false },
                { name:"Mobile performance",   count:11, trend:"-8%",  q:"Q1 2026", shipped:true  },
              ].map((theme, i) => (
                <div key={i} style={{ padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,0.04)", display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500, marginBottom:2 }}>{theme.name}</div>
                    <div style={{ fontFamily:S.mono, fontSize:9, color:S.text3 }}>{theme.count} users · first seen Q4 2024</div>
                  </div>
                  <div style={{ flexShrink:0, fontFamily:S.mono, fontSize:11, fontWeight:700, color: theme.trend.startsWith("+") ? "#fb923c" : "#4ade80" }}>{theme.trend}</div>
                  <div style={{ flexShrink:0, padding:"2px 7px", borderRadius:100, background: theme.shipped ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)", border:`1px solid ${theme.shipped ? "rgba(74,222,128,0.18)" : "rgba(248,113,113,0.18)"}`, fontFamily:S.mono, fontSize:8, color: theme.shipped ? "#4ade80" : "#f87171", letterSpacing:"0.06em", textTransform:"uppercase" as const }}>
                    {theme.shipped ? "shipped" : "no fix"}
                  </div>
                </div>
              ))}
              <div style={{ padding:"10px 16px", background:"rgba(217,119,6,0.05)", display:"flex", alignItems:"center", gap:7 }}>
                <span style={{ color:S.amber, fontSize:11 }}>✦</span>
                <span style={{ fontSize:11, color:S.text2 }}>&quot;Slow export&quot; — 23 users, up 40% this quarter. You&apos;ve shipped nothing against it.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {divider}

      {/* ══ Beat 3: DECIDE ════════════════════════════════════════════════════ */}
      <section style={{ padding:"96px 0", position:"relative", zIndex:1, background:"rgba(8,8,8,0.6)" }}>
        <div style={{ maxWidth:1120, margin:"0 auto", padding:"0 28px" }}>
          <div className="lp-reveal" style={{ display:"flex", alignItems:"center", gap:12, marginBottom:48 }}>
            <span style={{ fontFamily:S.mono, fontSize:9, color:S.amber, letterSpacing:"0.14em", textTransform:"uppercase" }}>03 · Decide</span>
            <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.05)" }} />
          </div>
          <div className="lp-reveal lp-two-col">
            {/* Receipt card */}
            <div style={{ background:"rgba(14,14,14,0.9)", border:"1px solid rgba(217,119,6,0.14)", borderRadius:7, overflow:"hidden", order:0 }}>
              <div style={{ padding:"11px 16px", borderBottom:"1px solid rgba(217,119,6,0.08)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontFamily:S.mono, fontSize:9, color:S.amber, letterSpacing:"0.08em", textTransform:"uppercase" }}>Decision ledger · Feature</span>
                <span style={{ padding:"2px 7px", background:"rgba(217,119,6,0.10)", border:S.amberBorder, borderRadius:100, fontFamily:S.mono, fontSize:8, color:S.amberHi, letterSpacing:"0.06em", textTransform:"uppercase" }}>Committed</span>
              </div>
              <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:14 }}>
                <div>
                  <div style={{ fontFamily:S.serif, fontSize:15, fontWeight:700, marginBottom:4 }}>Checkout flow redesign</div>
                  <div style={{ fontFamily:S.mono, fontSize:9, color:S.text3, letterSpacing:"0.06em" }}>Committed 14 Apr 2026 · Revisit 14 Jul 2026</div>
                </div>
                {[
                  { label:"Why this, why now", value:"Top pain by RICE for 2 quarters. Exit survey data confirms 3-step address flow is the #1 drop-off point on mobile." },
                  { label:"Evidence", value:"23 customer quotes · 3 themes · RICE 72" },
                  { label:"Predicted impact", value:"+15% 30-day activation rate" },
                ].map(row => (
                  <div key={row.label} style={{ paddingTop:12, borderTop:"1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ fontFamily:S.mono, fontSize:9, color:S.text3, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:4 }}>{row.label}</div>
                    <div style={{ fontSize:12.5, color:S.text, lineHeight:1.55 }}>{row.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 style={{ fontFamily:S.serif, fontSize:"clamp(28px,3.6vw,42px)", fontWeight:700, lineHeight:1.12, letterSpacing:"-0.025em", marginBottom:20 }}>
                It keeps<br /><em style={{ fontStyle:"italic", fontWeight:400, color:S.amberHi }}>the receipts.</em>
              </h2>
              <p style={{ fontSize:15, color:S.text2, lineHeight:1.7, maxWidth:420, marginBottom:28 }}>
                Commit an opportunity and PMind logs it as a tracked bet: the rationale, the evidence behind it, your predicted impact, and a revisit date. Ask &quot;why did we build this?&quot; six months later — even after the PM who decided has left — and the answer is right there.
              </p>
              {chip("Why did we build this? — answered forever")}
            </div>
          </div>
        </div>
      </section>

      {divider}

      {/* ══ Beat 4: LEARN — the headline differentiator ═══════════════════════ */}
      <section id="track-record" style={{ padding:"96px 0", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1120, margin:"0 auto", padding:"0 28px" }}>
          <div className="lp-reveal" style={{ display:"flex", alignItems:"center", gap:12, marginBottom:48 }}>
            <span style={{ fontFamily:S.mono, fontSize:9, color:S.amber, letterSpacing:"0.14em", textTransform:"uppercase" }}>04 · Learn</span>
            <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.05)" }} />
            <span style={{ fontFamily:S.mono, fontSize:9, color:S.amberHi, letterSpacing:"0.10em", textTransform:"uppercase", padding:"2px 8px", background:"rgba(217,119,6,0.10)", border:S.amberBorder, borderRadius:100 }}>The differentiator</span>
          </div>
          <div className="lp-reveal lp-two-col">
            <div>
              <h2 style={{ fontFamily:S.serif, fontSize:"clamp(28px,3.6vw,42px)", fontWeight:700, lineHeight:1.12, letterSpacing:"-0.025em", marginBottom:20 }}>
                It tells you if<br /><em style={{ fontStyle:"italic", fontWeight:400, color:S.amberHi }}>you were right.</em>
              </h2>
              <p style={{ fontSize:15, color:S.text2, lineHeight:1.7, maxWidth:420, marginBottom:16 }}>
                On the revisit date, PMind surfaces the feature and asks what actually happened. Record the actual metric and it scores the bet — right, directionally right, or miss. Over time you build a private track record of which calls land.
              </p>
              <p style={{ fontSize:15, color:S.text2, lineHeight:1.7, maxWidth:420, marginBottom:28 }}>
                That record compounds. Your next decision is grounded in your own history, not optimism.
              </p>
              {chip("No competitor can honestly claim this")}
            </div>
            {/* Mini calibration scorecard */}
            <div style={{ background:"rgba(14,14,14,0.9)", border:"1px solid rgba(74,222,128,0.12)", borderRadius:7, overflow:"hidden" }}>
              <div style={{ padding:"11px 16px", borderBottom:"1px solid rgba(255,255,255,0.05)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontFamily:S.mono, fontSize:9, color:"#4ade80", letterSpacing:"0.08em", textTransform:"uppercase" }}>Revisit triggered · 14 Jul 2026</span>
              </div>
              <div style={{ padding:"16px 18px" }}>
                <div style={{ fontFamily:S.serif, fontSize:14, fontWeight:700, marginBottom:14 }}>Checkout flow redesign</div>
                <div className="lp-two-col-sm">
                  {[
                    { label:"You predicted", value:"+15% activation", color:S.text2 },
                    { label:"What happened", value:"+12% activation", color:"#4ade80" },
                  ].map(col => (
                    <div key={col.label} style={{ padding:"10px 12px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:5 }}>
                      <div style={{ fontFamily:S.mono, fontSize:8, color:S.text3, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:5 }}>{col.label}</div>
                      <div style={{ fontSize:14, fontWeight:700, color:col.color }}>{col.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding:"10px 12px", background:"rgba(74,222,128,0.07)", border:"1px solid rgba(74,222,128,0.14)", borderRadius:5, marginBottom:12 }}>
                  <div style={{ fontFamily:S.mono, fontSize:9, color:"#4ade80", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:3 }}>Verdict</div>
                  <div style={{ fontSize:12.5, color:S.text }}>Hit — within 20% of prediction. Your mobile bets calibrate well; pricing bets still show a pattern of overestimation.</div>
                </div>
                <div style={{ fontFamily:S.mono, fontSize:9, color:S.text3, letterSpacing:"0.05em" }}>Calibration score updated · 4 of 6 bets this quarter: ✓ Hit</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {divider}

      {/* ── Why this can't be a wrapper ──────────────────────────────────────── */}
      <section style={{ padding:"80px 0", position:"relative", zIndex:1, background:"rgba(8,8,8,0.6)", textAlign:"center" }}>
        <div style={{ maxWidth:680, margin:"0 auto", padding:"0 28px" }}>
          <div className="lp-reveal">
            <h3 style={{ fontFamily:S.serif, fontSize:"clamp(20px,2.8vw,30px)", fontWeight:700, lineHeight:1.25, letterSpacing:"-0.02em", marginBottom:16 }}>
              A wrapper sends a prompt and forgets.<br />
              <em style={{ fontStyle:"italic", fontWeight:400, color:S.amberHi }}>The loop only works if the tool remembers.</em>
            </h3>
            <p style={{ fontSize:15, color:S.text2, lineHeight:1.7 }}>
              Every signal, every decision, every outcome — that accumulated memory is the product. It&apos;s also why PMind gets sharper the longer you use it, and why a fresh chat session never can.
            </p>
          </div>
        </div>
      </section>

      {divider}

      {/* ── Day-0 trajectory ─────────────────────────────────────────────────── */}
      <section style={{ padding:"88px 0", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1060, margin:"0 auto", padding:"0 28px" }}>
          <div className="lp-reveal" style={{ textAlign:"center", marginBottom:48 }}>
            <h3 style={{ fontFamily:S.serif, fontSize:"clamp(22px,2.8vw,32px)", fontWeight:700, letterSpacing:"-0.02em", marginBottom:10 }}>
              Starts on day one. Compounds from month three.
            </h3>
            <p style={{ fontSize:15, color:S.text2, maxWidth:480, margin:"0 auto" }}>
              You don&apos;t need months of data to get value. The loop opens the moment you start.
            </p>
          </div>
          <div className="lp-reveal lp-timeline-grid">
            <div className="lp-timeline-line" />
            {[
              { time:"Week 1",   title:"Grounded specs",     desc:"Product Brain is set. Every PRD, ticket, and brief reflects your real strategy — no re-explaining, no generic output.",       dot:"rgba(217,119,6,0.5)" },
              { time:"Month 3",  title:"Signal detection",   desc:"Recurring pains surface across batches. PMind tells you what's growing, what's fading, and what has no shipped solution yet.", dot:"rgba(217,119,6,0.8)" },
              { time:"Month 6",  title:"Calibrated track record", desc:"Your first revisit dates arrive. PMind scores your bets. You learn which calls land and start compounding your judgment.", dot:S.amber },
            ].map((stage, i) => (
              <div key={i} style={{ padding:"0 24px", textAlign:"center", position:"relative", zIndex:1 }}>
                <div style={{ width:14, height:14, borderRadius:"50%", background:stage.dot, margin:"0 auto 16px", boxShadow:`0 0 12px ${stage.dot}` }} />
                <div style={{ fontFamily:S.mono, fontSize:9, color:S.amberHi, letterSpacing:"0.10em", textTransform:"uppercase", marginBottom:8 }}>{stage.time}</div>
                <div style={{ fontFamily:S.serif, fontSize:15, fontWeight:700, marginBottom:8, letterSpacing:"-0.012em" }}>{stage.title}</div>
                <div style={{ fontSize:12.5, color:S.text2, lineHeight:1.65 }}>{stage.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {divider}

      {/* ── Capabilities (table stakes) ──────────────────────────────────────── */}
      <section style={{ padding:"80px 0", position:"relative", zIndex:1, background:"rgba(8,8,8,0.5)" }}>
        <div style={{ maxWidth:1060, margin:"0 auto", padding:"0 28px" }}>
          <div className="lp-reveal" style={{ display:"flex", alignItems:"baseline", gap:16, marginBottom:40 }}>
            <h3 style={{ fontFamily:S.serif, fontSize:"clamp(18px,2.2vw,24px)", fontWeight:700, letterSpacing:"-0.02em", color:S.text2, whiteSpace:"nowrap" }}>Everything else you&apos;d expect</h3>
            <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.05)" }} />
          </div>
          <div className="lp-caps-grid lp-reveal">
            {[
              { idx:"·", title:"Tiptap editor + ⌘K",       desc:"Full document editor with inline AI commands. Stream specs, tickets, and updates into the doc." },
              { idx:"·", title:"Document-aware chat",        desc:"Chat side-by-side with your draft. Challenges assumptions, fills gaps, compiles exec updates." },
              { idx:"·", title:"Grounded semantic search",   desc:"Search across interviews, tickets, and PRDs. Citations link directly back to the source." },
              { idx:"·", title:"Jira native sync",           desc:"OAuth. List boards, search JQL, push epics and stories — all from the chat." },
              { idx:"·", title:"Multi-agent backend",        desc:"PM, Opportunity, Analyst, Designer, Whiteboard, and Calendar agents — each a specialist." },
              { idx:"·", title:"Product Brain context",      desc:"Your strategy in every output. Set it once, it follows every session." },
            ].map((cap, i) => (
              <div key={i} className="lp-cap">
                <div style={{ fontSize:13, fontWeight:600, marginBottom:5, letterSpacing:"-0.01em" }}>{cap.title}</div>
                <div style={{ fontSize:12, color:S.text2, lineHeight:1.6 }}>{cap.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {divider}

      {/* ── Pricing + FAQ ─────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding:"88px 0", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1060, margin:"0 auto", padding:"0 28px" }} className="lp-pricing-faq">
          {/* Pricing */}
          <div className="lp-reveal">
            <div className="pricing-card glass-amber" style={{ padding:"36px 32px" }}>
              <div className="pr-title">Beta Access</div>
              <div className="pr-cost">$0<span style={{ fontSize:15, color:S.text3, fontWeight:400 }}>/month</span></div>
              <div className="pr-note" style={{ marginBottom:20 }}>Free during private beta.</div>
              <div className="pr-bullets">
                <div className="pr-bullet">Unlimited projects & documents</div>
                <div className="pr-bullet">Full discovery pipeline</div>
                <div className="pr-bullet">Decision ledger + outcome capture</div>
                <div className="pr-bullet">Your private track record — every decision and outcome, yours forever</div>
                <div className="pr-bullet">Jira sync · Product Brain · ⌘K editor</div>
                <div className="pr-bullet">50% lifetime discount at launch</div>
              </div>
              <Link href="/sign-in" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"12px 24px", marginTop:24, background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:6, color:"#fff", fontSize:14, fontWeight:600, textDecoration:"none", boxShadow:"0 4px 20px rgba(217,119,6,0.22)" }}>
                Apply for Beta →
              </Link>
            </div>
          </div>

          {/* FAQ */}
          <div className="lp-reveal" style={{ display:"flex", flexDirection:"column", gap:0 }}>
            {[
              { q:"Does PMind learn from my data, and is it private?", a:"Yes — your decisions and outcomes build your private track record. It's never used to train public models, and workspaces are walled per user." },
              { q:"What happens to my decision history if I leave?", a:"It's exportable and yours. That honesty is also the switching-cost moat — your track record doesn't live anywhere else." },
              { q:"How does calibration work?", a:"On each revisit date, PMind asks what actually happened. You enter the actual metric (or link your analytics), it scores the bet, and updates your calibration record." },
              { q:"How does Jira sync work?", a:"OAuth to your Jira instance. PMind can list boards, search by JQL, and push epics, stories, and acceptance criteria in native Jira format." },
              { q:"Is this just a ChatGPT wrapper?", a:"No — and the tell is memory. A wrapper can't remember your last six months of decisions or tell you which ones worked. That loop is the product." },
            ].map((faq, i) => (
              <div key={i} style={{ paddingBottom:20, marginBottom:20, borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                <h4 style={{ fontFamily:S.serif, fontSize:14, fontWeight:700, marginBottom:6, color:S.text, letterSpacing:"-0.01em", lineHeight:1.4 }}>{faq.q}</h4>
                <p style={{ fontSize:12.5, color:S.text2, lineHeight:1.65, margin:0 }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {divider}

      {/* ── Final CTA ─────────────────────────────────────────────────────────── */}
      <section style={{ padding:"96px 0", textAlign:"center", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1060, margin:"0 auto", padding:"0 28px" }}>
          <h2 className="lp-reveal" style={{ fontFamily:S.serif, fontSize:"clamp(28px,4vw,50px)", fontWeight:700, lineHeight:1.12, letterSpacing:"-0.026em", maxWidth:640, margin:"0 auto 14px" }}>
            Done explaining your product<br />to AI that forgets by morning.
          </h2>
          <p className="lp-reveal" style={{ fontSize:17, color:S.text2, marginBottom:40, fontFamily:S.serif, fontStyle:"italic" }}>
            Start building a workspace that remembers.
          </p>
          <div className="lp-reveal lp-reveal-d1" style={{ maxWidth:460, margin:"0 auto", padding:"40px 32px", borderRadius:8, background:"rgba(217,119,6,0.03)", backdropFilter:"blur(20px)", border:S.amberBorder, borderTopColor:"rgba(217,119,6,0.30)", boxShadow:"0 24px 60px rgba(0,0,0,0.55),0 0 40px rgba(217,119,6,0.06),inset 0 1px 0 rgba(217,119,6,0.10)", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:"linear-gradient(90deg,transparent,#D97706,transparent)", opacity:.28 }} />
            <Link href="/sign-in" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"14px 32px", background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:6, color:"#fff", fontSize:15, fontWeight:600, textDecoration:"none", boxShadow:"0 6px 28px rgba(217,119,6,0.28)" }}>
              Get started free →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop:"1px solid rgba(255,255,255,0.042)", padding:"28px 0", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1060, margin:"0 auto", padding:"0 28px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:20, height:20, background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:S.serif, fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.92)" }}>P</div>
            <span style={{ fontFamily:S.serif, fontWeight:700, fontSize:14, letterSpacing:"-0.02em" }}>PMind</span>
            <span style={{ fontFamily:S.serif, fontStyle:"italic", fontSize:12, color:"rgba(217,119,6,0.4)", marginLeft:6 }}>The workspace that remembers.</span>
          </div>
          <span style={{ fontSize:12, color:S.text3 }}>© 2026 PMind</span>
          <div style={{ display:"flex", gap:16 }}>
            <a href="/privacy" style={{ fontSize:12, color:S.text3, textDecoration:"none" }}>Privacy</a>
            <a href="/terms"   style={{ fontSize:12, color:S.text3, textDecoration:"none" }}>Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
