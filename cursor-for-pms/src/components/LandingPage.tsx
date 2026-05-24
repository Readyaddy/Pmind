"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const sandboxData = {
  fintech: {
    title: "Fintech Ledger (B2B SaaS)",
    brain: {
      target: "Enterprise CFOs & Procurement leads",
      constraints: "SOC2 Type II compliance. Zero external analytics libraries.",
      northStar: "Bank verification onboarding time < 2 hours (was 5 days)."
    },
    spec: {
      chatgpt: `Section: Checkout Feature

1. Introduction
This document defines requirements for the checkout page. We will build a safe and secure way for users to pay.

2. Goals
• Ensure payment fields work properly.
• Follow standard templates and payment guides.
• Make onboarding as fast as possible.`,
      pmind: (
        <>
          <strong>PRD Section: Ledger Sync Gateway</strong><br />
          Grounding Profile: <span className="text-[#F59E0B] font-medium">[B2B High-Compliance FinTech]</span><br /><br />
          <strong>1. Feature Objective</strong><br />
          Deliver bank ledger synchronization while respecting strictly audited <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">SOC2 Type II boundaries</span>. The system must process requests under zero external analytics tracking constraints to ensure absolute data privacy.<br /><br />
          <strong>2. Functional Requirements</strong><br />
          • Bank Verification: Automate credential caching using our isolated microservice, targeting a <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">verification time under 2 hours</span>.<br />
          • System Failure Protocol: In case of bank API outages, throw fallback ledger files, bypassing any third-party public analytics endpoints.
        </>
      )
    },
    stories: {
      chatgpt: `EPIC: Payment Systems

STORY-001: Pay Invoice
As a user, I want to pay my invoices online so I don't have to send checks.
AC:
1. Pay button must be visible.
2. User can type credit card numbers.`,
      pmind: (
        <>
          <strong>EPIC: Compliant Ledger Sync</strong><br />
          Grounding Profile: <span className="text-[#F59E0B] font-medium">[B2B High-Compliance FinTech]</span><br /><br />
          <strong>STORY-001 · Isolated Caching [5 pts]</strong><br />
          As an Enterprise CFO, I want bank ledger syncing to happen inside secure network boundaries so that bank data complies with <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">SOC2 Type II</span> policies.<br />
          AC: Caching utilizes isolated bank microservices; no third-party APIs called.<br /><br />
          <strong>STORY-002 · Onboarding Speed [3 pts]</strong><br />
          As a Procurement Lead, I want a bank onboarding assistant so I can finish verification in <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">under 2 hours</span>.<br />
          AC: Instant validation rules trigger upon account submission.
        </>
      )
    }
  },
  travel: {
    title: "TravelFlow (B2C Mobile)",
    brain: {
      target: "Mobile-first leisure travelers, time-sensitive",
      constraints: "Fast layout rendering on weak 3G networks. Priority Apple Pay integration.",
      northStar: "Mobile checkout completion rate > 85% (was 54%)."
    },
    spec: {
      chatgpt: `Section: Checkout Feature

1. Introduction
This document defines requirements for the checkout page. We will build a safe and secure way for users to pay.

2. Goals
• Ensure payment fields work properly.
• Follow standard templates and payment guides.
• Make onboarding as fast as possible.`,
      pmind: (
        <>
          <strong>PRD Section: Mobile Booking Checkout</strong><br />
          Grounding Profile: <span className="text-[#F59E0B] font-medium">[B2C Mobile Travel]</span><br /><br />
          <strong>1. Feature Objective</strong><br />
          Streamline mobile flight booking to increase checkout completion rates past the <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">85% target</span>. Design layouts to support instant payment on low-bandwidth <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">weak 3G networks</span>.<br /><br />
          <strong>2. Functional Requirements</strong><br />
          • Wallet Integration: <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">Apple Pay integration takes priority</span> above standard card inputs, occupying above-the-fold screen space.<br />
          • Asset Optimization: Bundle and render layout files under 80KB to maintain operational speeds in remote travel environments with poor signal.
        </>
      )
    },
    stories: {
      chatgpt: `EPIC: Payment Systems

STORY-001: Pay Invoice
As a user, I want to pay my invoices online so I don't have to send checks.
AC:
1. Pay button must be visible.
2. User can type credit card numbers.`,
      pmind: (
        <>
          <strong>EPIC: Instant Booking Redesign</strong><br />
          Grounding Profile: <span className="text-[#F59E0B] font-medium">[B2C Mobile Travel]</span><br /><br />
          <strong>STORY-001 · Apple Pay above-the-fold [3 pts]</strong><br />
          As a mobile traveler, I want a one-click <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">Apple Pay</span> checkout option so I can secure bookings without typing details on weak wifi.<br />
          AC: Apple Pay is auto-detected and positioned above standard inputs.<br /><br />
          <strong>STORY-002 · Offline Queue Loader [5 pts]</strong><br />
          As a traveler on <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">weak 3G networks</span>, I want checkout confirmations to queue offline so that checkout conversions exceed our <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">85% benchmark</span>.<br />
          AC: Data payloads compressed below 15KB per request.
        </>
      )
    }
  },
  devtool: {
    title: "DevPulse API (Dev Platform)",
    brain: {
      target: "Full-stack backend developers, CLI-first",
      constraints: "API-only endpoints, YAML configurations, <50ms response latency.",
      northStar: "Time-to-first-API-call < 5 minutes."
    },
    spec: {
      chatgpt: `Section: Checkout Feature

1. Introduction
This document defines requirements for the checkout page. We will build a safe and secure way for users to pay.

2. Goals
• Ensure payment fields work properly.
• Follow standard templates and payment guides.
• Make onboarding as fast as possible.`,
      pmind: (
        <>
          <strong>PRD Section: CLI API-Key Dispatch</strong><br />
          Grounding Profile: <span className="text-[#F59E0B] font-medium">[Developer Tool Platform]</span><br /><br />
          <strong>1. Feature Objective</strong><br />
          Deliver a zero-config API key dispatch pipeline targeting a <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">time-to-first-API-call under 5 minutes</span>. Every credential must render natively via CLI terminals.<br /><br />
          <strong>2. Functional Requirements</strong><br />
          • Configuration Format: Supply and validate key variables strictly via <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">YAML configuration files</span>.<br />
          • Latency Boundary: Maintain API gateway dispatch times within a <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">&lt;50ms response latency</span> window under high load thresholds.
        </>
      )
    },
    stories: {
      chatgpt: `EPIC: Payment Systems

STORY-001: Pay Invoice
As a user, I want to pay my invoices online so I don't have to send checks.
AC:
1. Pay button must be visible.
2. User can type credit card numbers.`,
      pmind: (
        <>
          <strong>EPIC: Dev Onboarding Redesign</strong><br />
          Grounding Profile: <span className="text-[#F59E0B] font-medium">[Developer Tool Platform]</span><br /><br />
          <strong>STORY-001 · YAML key generation [3 pts]</strong><br />
          As a developer, I want my initial credentials formatted inside a standard <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">YAML file</span> so I can start making calls in <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">under 5 minutes</span>.<br />
          AC: &apos;pmind init&apos; outputs clean, copy-pasteable YAML keys.<br /><br />
          <strong>STORY-002 · Low-Latency Gateway [8 pts]</strong><br />
          As a developer, I want key validation requests returned in <span className="bg-amber-600/10 text-[#F59E0B] px-1.5 py-0.5 rounded font-medium">under 50ms</span> to prevent pipeline bottlenecks.<br />
          AC: Validation endpoint uses edge caching, maintaining p95 latency at &lt; 35ms.
        </>
      )
    }
  }
};

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Interactive Sandbox state
  const [profile, setProfile] = useState<"fintech" | "travel" | "devtool">("fintech");
  const [task, setTask] = useState<"spec" | "stories">("spec");

  // Calculator state
  const [specsHours, setSpecsHours] = useState(6);
  const [researchHours, setResearchHours] = useState(8);
  const [ticketsHours, setTicketsHours] = useState(5);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const gctx = ctx;
    let W = 0, H = 0, t = 0, raf = 0;

    function resize() {
      W = c!.width = innerWidth;
      H = c!.height = innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const orbs = [
      { nx:0.14, ny:0.18, r:380, a:0.11, sp:0.19, ph:0.0 },
      { nx:0.82, ny:0.42, r:320, a:0.08, sp:0.14, ph:2.1 },
      { nx:0.50, ny:0.78, r:420, a:0.06, sp:0.11, ph:4.2 },
      { nx:0.92, ny:0.12, r:260, a:0.09, sp:0.22, ph:1.1 },
      { nx:0.28, ny:0.62, r:300, a:0.05, sp:0.16, ph:3.4 },
    ];
    function drawOrbs() {
      orbs.forEach(o => {
        const cx = (o.nx + Math.sin(t * o.sp + o.ph) * 0.09) * W;
        const cy = (o.ny + Math.cos(t * o.sp * 0.65 + o.ph) * 0.07) * H;
        const pulse = 1 + Math.sin(t * o.sp * 1.3 + o.ph) * 0.12;
        const r = o.r * pulse;
        const g = gctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0,    `rgba(217,119,6,${o.a})`);
        g.addColorStop(0.38, `rgba(160,70,8,${o.a * 0.42})`);
        g.addColorStop(1,    "rgba(0,0,0,0)");
        gctx.fillStyle = g;
        gctx.beginPath(); gctx.arc(cx, cy, r, 0, Math.PI * 2); gctx.fill();
      });
    }

    const pts = Array.from({ length: 110 }, () => ({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      vx: 0, vy: 0, life: Math.random(), sz: 0.55 + Math.random() * 1.1,
    }));
    function fieldAngle(x: number, y: number) {
      return (
        Math.sin(x * 0.0022 + t * 0.38) * Math.cos(y * 0.0018 + t * 0.27) +
        Math.sin((x + y) * 0.0012 + t * 0.44)
      ) * Math.PI * 1.6;
    }
    function drawParticles() {
      pts.forEach(p => {
        const ang = fieldAngle(p.x, p.y);
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
    }

    gctx.fillStyle = "#050505";
    gctx.fillRect(0, 0, innerWidth, innerHeight);

    function frame() {
      t += 0.007;
      gctx.fillStyle = "rgba(5,5,5,0.20)";
      gctx.fillRect(0, 0, W, H);
      drawOrbs(); drawParticles();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      entries => entries.forEach(x => { if (x.isIntersecting) x.target.classList.add("lp-vis"); }),
      { threshold: 0.07, rootMargin: "0px 0px -28px 0px" }
    );
    document.querySelectorAll(".lp-reveal").forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  const S = {
    amber: "#D97706" as const,
    amberHi: "#F59E0B" as const,
    text: "#F5F2EE" as const,
    text2: "rgba(245,242,238,0.65)" as const,
    text3: "rgba(245,242,238,0.35)" as const,
    serif: "var(--font-playfair),Georgia,serif" as const,
    mono: "'JetBrains Mono',monospace" as const,
    glassBorder: "1px solid rgba(255,255,255,0.06)" as const,
    amberBorder: "1px solid rgba(217,119,6,0.15)" as const,
  };

  const divider = (
    <div style={{ height:1, position:"relative", zIndex:1, background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.06) 28%,rgba(255,255,255,0.06) 72%,transparent)" }} />
  );

  // Time-savings calculations
  const hoursSaved = (specsHours * 0.65) + (researchHours * 0.75) + (ticketsHours * 0.8);
  const roundedHours = hoursSaved.toFixed(1);
  const monthlyDays = ((hoursSaved * 4.33) / 8).toFixed(0);
  const daysWord = monthlyDays === "1" ? "1 full working day" : `${monthlyDays} full working days`;
  const yearlyVal = Math.round(hoursSaved * 52 * 80);
  const formattedVal = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(yearlyVal);
  const progressPercent = Math.min(100, Math.max(10, (hoursSaved / ((25 * 0.65) + (25 * 0.75) + (25 * 0.8))) * 100));

  return (
    <div style={{ fontFamily:"var(--font-inter),-apple-system,sans-serif", background:"#050505", color:S.text, lineHeight:1.6, overflowX:"hidden", WebkitFontSmoothing:"antialiased" }}>
      {/* Background elements */}
      <canvas ref={canvasRef} style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none", opacity:0.72 }} />
      <div className="lp-bg-grain" />
      <div className="lp-bg-grid" />
      <div className="lp-bg-aurora" />
      <div className="lp-bg-amber" />
      <div className="lp-beams" aria-hidden="true">
        <div className="lp-beam" /><div className="lp-beam" /><div className="lp-beam" />
        <div className="lp-beam" /><div className="lp-beam" />
      </div>

      {/* Nav */}
      <nav style={{ position:"fixed", top:0, left:0, right:0, zIndex:600, height:64, background:"rgba(5,5,5,0.78)", backdropFilter:"blur(28px) saturate(1.5)", WebkitBackdropFilter:"blur(28px) saturate(1.5)", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ maxWidth:1120, margin:"0 auto", padding:"0 28px", height:"100%", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:28, height:28, background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:S.serif, fontSize:14, fontWeight:700, color:"rgba(255,255,255,0.95)", boxShadow:"0 4px 14px rgba(217,119,6,0.25)" }}>P</div>
            <span style={{ fontFamily:S.serif, fontWeight:700, fontSize:18, color:S.text, letterSpacing:"-0.02em" }}>PMind</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:24 }}>
            <a href="#playground" className="nav-link">Product Brain</a>
            <a href="#workflow" className="nav-link">Discovery Engine</a>
            <a href="#calculator" className="nav-link">Savings Calculator</a>
            <Link href="/sign-in" style={{ padding:"7px 18px", background:"rgba(217,119,6,0.10)", border:S.amberBorder, borderRadius:6, color:S.amberHi, fontSize:13, fontWeight:600, textDecoration:"none", transition:"background 0.15s" }}>
              Get Started free →
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ paddingTop:140, paddingBottom:48, textAlign:"center", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1120, margin:"0 auto", padding:"0 28px" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"5px 14px", marginBottom:32, background:"rgba(217,119,6,0.10)", border:S.amberBorder, borderRadius:100, fontSize:10, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:S.amberHi }}>
            <span className="lp-badge-pulse" />&nbsp;Private Beta — Limited Access
          </div>
          <h1 style={{ fontFamily:S.serif, fontSize:"clamp(44px,6.5vw,78px)", fontWeight:700, lineHeight:1.06, letterSpacing:"-0.03em", color:S.text, marginBottom:24, maxWidth:920, marginLeft:"auto", marginRight:"auto" }}>
            The first AI workspace that<br /><em style={{ fontStyle:"italic", fontWeight:400, color:S.amberHi }}>thinks in product.</em>
          </h1>
          <p style={{ fontSize:19, color:S.text2, maxWidth:620, margin:"0 auto 40px", lineHeight:1.65, fontWeight:400 }}>
            Stop re-explaining your constraints to AI that forgets by morning. PMind grounds every spec, user story, and ticket in your actual strategy.
          </p>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, flexWrap:"wrap" }}>
            <Link href="/sign-in" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"13px 28px", background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:6, color:"#fff", fontSize:14, fontWeight:600, textDecoration:"none", boxShadow:"0 4px 20px rgba(217,119,6,0.25)" }}>
              Get started free →
            </Link>
            <a href="#playground" className="btn-secondary" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"13px 28px", borderRadius:6, color:S.text, fontSize:14, fontWeight:600, textDecoration:"none" }}>
              Try Interactive Playground
            </a>
          </div>
          <div style={{ marginTop:56, fontFamily:S.mono, fontSize:11, color:S.amberHi, letterSpacing:"0.05em", textTransform:"uppercase", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            <span style={{ width:32, height:1, background:"rgba(217,119,6,0.3)" }} />
            Save 15+ Hours Per Week On Specs, Tickets & Discovery
            <span style={{ width:32, height:1, background:"rgba(217,119,6,0.3)" }} />
          </div>
        </div>
      </section>

      {/* App Mockup */}
      <section style={{ padding:"0 0 96px", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1080, margin:"0 auto", padding:"0 28px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, marginBottom:32 }}>
            <span style={{ flex:"0 0 52px", height:1, background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.08))" }} />
            <span style={{ fontFamily:S.mono, fontSize:10, letterSpacing:"0.16em", textTransform:"uppercase", color:S.text3 }}>See PMind in action</span>
            <span style={{ flex:"0 0 52px", height:1, background:"linear-gradient(90deg,rgba(255,255,255,0.08),transparent)" }} />
          </div>

          <div className="lp-reveal" style={{ position:"relative" }}>
            <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:"70%", height:280, pointerEvents:"none", zIndex:0, background:"radial-gradient(ellipse,rgba(217,119,6,0.09) 0%,transparent 65%)" }} />
            <div style={{ borderRadius:8, overflow:"hidden", boxShadow:"0 32px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(217,119,6,0.12)", position:"relative", zIndex:1 }}>
              {/* Titlebar */}
              <div style={{ background:"#0e0e0e", borderBottom:"1px solid rgba(217,119,6,0.08)", padding:"10px 14px", display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ display:"flex", gap:6 }}>
                  {["#FF5F57","#FFBD2E","#28CA41"].map(c => <div key={c} style={{ width:11, height:11, borderRadius:"50%", background:c }} />)}
                </div>
                <span style={{ fontFamily:S.mono, fontSize:11, color:"rgba(255,255,255,0.25)" }}>PRD — Checkout Flow Redesign.md — PMind</span>
              </div>

              {/* 3-panel body */}
              <div className="lp-app-body">
                {/* Sidebar */}
                <div className="lp-app-sidebar" style={{ background:"rgba(26,26,26,0.7)", backdropFilter:"blur(20px)", borderRight:"1px solid rgba(217,119,6,0.1)", display:"flex", flexDirection:"column" }}>
                  <div style={{ padding:"12px 12px 10px", borderBottom:"1px solid rgba(217,119,6,0.07)", display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:20, height:20, background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:5, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:S.serif, fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.9)", flexShrink:0 }}>P</div>
                    <span style={{ fontFamily:S.serif, fontSize:13, fontWeight:700, color:"#F3F2F1", letterSpacing:"-0.02em" }}>PMind</span>
                  </div>
                  <div style={{ flex:1, padding:"10px 8px", overflow:"hidden" }}>
                    {[{ name:"Checkout Flow", active:true },{ name:"Q2 Roadmap" },{ name:"User Research" }].map((p, i) => (
                      <div key={i}>
                        <div style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 6px", borderRadius:6, cursor:"pointer", marginBottom:2 }}>
                          <span style={{ fontSize:9, color:"rgba(243,242,241,0.28)" }}>›</span>
                          <div style={{ width:7, height:7, borderRadius:2, background:S.amber, flexShrink:0 }} />
                          <span style={{ fontSize:12, fontWeight:600, color:"#F3F2F1" }}>{p.name}</span>
                        </div>
                        {p.active && (
                          <div style={{ display:"flex", alignItems:"center", gap:7, padding:"4px 6px 4px 18px", borderRadius:5, marginBottom:1, background:"rgba(217,119,6,0.1)", cursor:"pointer" }}>
                            <span style={{ fontSize:9, color:S.amber }}>▪</span>
                            <span style={{ fontSize:12, color:S.amberHi, fontWeight:500 }}>PRD — Checkout</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ padding:"8px 10px", borderTop:"1px solid rgba(217,119,6,0.07)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ fontSize:9, color:S.text3, padding:"2px 6px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:4, letterSpacing:"0.05em", textTransform:"uppercase" }}>Free</span>
                    <span style={{ fontSize:11, color:S.text3 }}>◑</span>
                  </div>
                </div>

                {/* Editor */}
                <div style={{ display:"flex", flexDirection:"column", position:"relative", overflow:"hidden" }}>
                  <div style={{ background:"rgba(26,26,26,0.7)", backdropFilter:"blur(20px)", borderBottom:"1px solid rgba(217,119,6,0.1)", padding:"5px 10px", display:"flex", alignItems:"center", gap:1, overflow:"hidden" }}>
                    {["B","I","U","H1","H2","</>","—"].map((b, i) => (
                      <button key={i} style={{ width:26, height:26, borderRadius:5, border:"none", background:"transparent", color:"rgba(243,242,241,0.45)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:600, cursor:"pointer", flexShrink:0 }}>{b}</button>
                    ))}
                  </div>
                  <div style={{ flex:1, padding:"20px 28px", overflow:"hidden", background:"#131313", position:"relative" }}>
                    <h1 style={{ fontFamily:S.serif, fontSize:22, fontWeight:700, color:"#F3F2F1", letterSpacing:"-0.02em", marginBottom:16, lineHeight:1.2 }}>PRD: Checkout Flow Redesign</h1>
                    <div style={{ fontSize:12, color:"rgba(243,242,241,0.55)", lineHeight:1.75 }}>
                      <p style={{ fontFamily:S.serif, fontSize:14, fontWeight:700, color:"#F3F2F1", marginTop:14, marginBottom:6 }}>Problem Statement</p>
                      <p>Current checkout abandon rate is 34% — 14pp above our Q2 target. Exit survey data (n=240) shows primary friction is the 3-step address flow on mobile.</p>
                      <p style={{ marginTop:10 }}>Users expect single-page checkout. Our flow was designed for desktop in 2021.<span className="lp-amber-cur" /></p>
                    </div>
                    {/* ⌘K Modal */}
                    <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.45)", backdropFilter:"blur(2px)", display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:32 }}>
                      <div className="lp-cmd-modal" style={{ width:420, maxWidth:"92%", background:"rgba(20,17,12,0.98)", border:"1px solid rgba(217,119,6,0.28)", borderTopColor:"rgba(217,119,6,0.4)", borderRadius:8, boxShadow:"0 32px 72px rgba(0,0,0,0.8),0 0 0 1px rgba(217,119,6,0.08),0 0 40px rgba(217,119,6,0.08)", overflow:"hidden" }}>
                        <div style={{ padding:"10px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:22, height:22, borderRadius:6, background:"rgba(217,119,6,0.15)", border:"1px solid rgba(217,119,6,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:S.amberHi }}>⌘</div>
                          <span style={{ fontSize:11, fontWeight:700, color:S.amberHi, letterSpacing:"0.08em", textTransform:"uppercase" }}>AI Commands</span>
                          <span style={{ marginLeft:"auto", fontFamily:S.mono, fontSize:9, color:S.text3, padding:"2px 6px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:4 }}>ESC</span>
                        </div>
                        <div style={{ padding:8, display:"flex", flexDirection:"column", gap:3 }}>
                          {[{ name:"Write PRD", active:true },{ name:"Break into tickets" },{ name:"Product brief" },{ name:"Stakeholder update" },{ name:"Synthesize research" }].map((cmd, i) => (
                            <div key={i} style={{ padding:"8px 10px", borderRadius:7, background:cmd.active?"rgba(217,119,6,0.09)":"rgba(255,255,255,0.02)", border:`1px solid ${cmd.active?"rgba(217,119,6,0.22)":"rgba(255,255,255,0.04)"}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                <div style={{ width:5, height:5, borderRadius:"50%", background:cmd.active?S.amber:S.text3 }} />
                                <span style={{ fontSize:12, fontWeight:cmd.active?500:400, color:cmd.active?S.amberHi:"rgba(243,242,241,0.55)" }}>{cmd.name}</span>
                              </div>
                              {cmd.active && <span style={{ fontFamily:S.mono, fontSize:9, color:S.amber, padding:"2px 6px", background:"rgba(217,119,6,0.1)", border:"1px solid rgba(217,119,6,0.2)", borderRadius:4 }}>↵</span>}
                            </div>
                          ))}
                        </div>
                        <div style={{ padding:8, borderTop:"1px solid rgba(255,255,255,0.045)" }}>
                          <div style={{ width:"100%", padding:"7px 10px", fontSize:12, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:7, color:S.text3 }}>Describe what you need…</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chat */}
                <div className="lp-app-chat" style={{ background:"rgba(26,26,26,0.7)", backdropFilter:"blur(20px)", borderLeft:"1px solid rgba(217,119,6,0.1)", display:"flex", flexDirection:"column" }}>
                  <div style={{ padding:"9px 10px", borderBottom:"1px solid rgba(217,119,6,0.07)", display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:12, color:S.amber }}>✦</span>
                    <span style={{ fontSize:12, fontWeight:600, color:"#F3F2F1", flex:1 }}>AI Chat</span>
                    <span style={{ display:"flex", alignItems:"center", gap:3, padding:"3px 8px", background:"rgba(217,119,6,0.1)", border:"1px solid rgba(217,119,6,0.2)", borderRadius:5, fontFamily:S.mono, fontSize:9, color:S.amberHi }}>Gemini ▾</span>
                  </div>
                  <div style={{ flex:1, padding:"10px 8px", display:"flex", flexDirection:"column", gap:8, overflow:"hidden" }}>
                    <div style={{ alignSelf:"flex-end", maxWidth:"88%", padding:"7px 10px", borderRadius:"10px 10px 3px 10px", background:"rgba(217,119,6,0.15)", border:"1px solid rgba(217,119,6,0.2)", fontSize:11, color:"#F3F2F1", lineHeight:1.55 }}>
                      What&apos;s our current checkout abandon rate?
                    </div>
                    <div style={{ alignSelf:"flex-start", maxWidth:"96%", padding:"7px 10px", borderRadius:"10px 10px 10px 3px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.06)", fontSize:11, color:"rgba(243,242,241,0.55)", lineHeight:1.55 }}>
                      <div style={{ fontFamily:S.mono, fontSize:8, color:S.amber, letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:4 }}>PMind AI</div>
                      Based on your PRD, abandon rate is 34% — 14pp above Q2 target. Exit surveys (n=240) point to the 3-step mobile address flow as primary friction.
                      <button style={{ marginTop:6, padding:"3px 8px", fontSize:9, fontWeight:600, background:"rgba(217,119,6,0.12)", border:"1px solid rgba(217,119,6,0.22)", borderRadius:4, color:S.amberHi, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:3 }}>+ Apply to doc</button>
                    </div>
                  </div>
                  <div style={{ padding:8, borderTop:"1px solid rgba(217,119,6,0.07)", display:"flex", alignItems:"center", gap:5 }}>
                    <div style={{ flex:1, padding:"6px 8px", fontSize:11, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:7, color:S.text3 }}>Ask anything about this doc…</div>
                    <div style={{ width:26, height:26, borderRadius:6, flexShrink:0, background:"rgba(217,119,6,0.15)", border:"1px solid rgba(217,119,6,0.25)", color:S.amberHi, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11 }}>↑</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p style={{ marginTop:16, textAlign:"center", fontFamily:S.mono, fontSize:10, color:S.text3, letterSpacing:"0.08em" }}>⌘K anywhere in a document &nbsp;·&nbsp; <span style={{ color:"rgba(217,119,6,0.4)" }}>Product Brain grounded · Real-time streaming</span></p>
        </div>
      </section>

      {/* Statement */}
      <section style={{ padding:"72px 0", textAlign:"center", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1080, margin:"0 auto", padding:"0 28px" }}>
          <blockquote className="lp-reveal" style={{ fontFamily:S.serif, fontSize:"clamp(20px,3.2vw,32px)", fontStyle:"italic", color:S.text2, lineHeight:1.55, maxWidth:780, margin:"0 auto", letterSpacing:"-0.018em" }}>
            ChatGPT gives you a template.<br />
            PMind gives you output that<br />
            <strong style={{ fontStyle:"normal", fontWeight:700, color:S.text }}>knows you ship SOC2-compliant B2B SaaS to enterprise procurement teams.</strong>
          </blockquote>
        </div>
      </section>

      {divider}

      {/* Interactive Grounding Sandbox (NEW) */}
      <section id="playground" className="playground" style={{ position: "relative", zIndex: 1, background: "#090909", borderTop: "1px solid rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
        {/* Ambient background aura */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(circle at 50% 50%, rgba(217, 119, 6, 0.05) 0%, transparent 68%)" }} />
        
        <div className="container" style={{ position: "relative", zIndex: 1 }}>
          <div className="play-header lp-reveal" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", marginBottom: 20, background: "rgba(217,119,6,0.08)", border: S.amberBorder, borderRadius: 100, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: S.amberHi }}>
              <span className="lp-badge-pulse" />&nbsp;Live Grounding Demo
            </div>
            <h2 style={{ fontFamily: S.serif, fontSize: "clamp(32px, 4vw, 44px)", fontWeight: 700, marginBottom: 16 }}>
              Ground your AI in <em style={{ fontStyle: "italic", fontWeight: 400, color: S.amberHi }}>Strategy, not prompts</em>
            </h2>
            <p style={{ fontSize: 16, color: S.text2, maxWidth: 580, margin: "0 auto" }}>
              Toggle below to see how a single background constraint dynamically transforms AI outputs from fluffy templates into precise specifications.
            </p>
          </div>

          <div className="play-grid lp-reveal" style={{ marginTop: 48 }}>
            {/* Left Panel: Profile Selection */}
            <div className="sandbox-selector glass">
              <div className="profile-group">
                <span className="sb-section-title">1. Select Product Profile</span>
                <button 
                  className={`profile-btn ${profile === "fintech" ? "active" : ""}`} 
                  onClick={() => setProfile("fintech")}
                >
                  Fintech Ledger (B2B SaaS)
                </button>
                <button 
                  className={`profile-btn ${profile === "travel" ? "active" : ""}`} 
                  onClick={() => setProfile("travel")}
                >
                  TravelFlow (B2C Mobile)
                </button>
                <button 
                  className={`profile-btn ${profile === "devtool" ? "active" : ""}`} 
                  onClick={() => setProfile("devtool")}
                >
                  DevPulse API (Dev Platform)
                </button>
              </div>

              <div className="profile-group">
                <span className="sb-section-title">Active Product Brain</span>
                <div className="profile-meta-card">
                  <div className="profile-meta-title">Audience</div>
                  <div style={{ marginBottom: 8 }}>{sandboxData[profile].brain.target}</div>
                  <div className="profile-meta-title">Constraints</div>
                  <div style={{ marginBottom: 8 }}>{sandboxData[profile].brain.constraints}</div>
                  <div className="profile-meta-title">North Star Metric</div>
                  <div>{sandboxData[profile].brain.northStar}</div>
                </div>
              </div>
            </div>

            {/* Right Panel: Code Sandbox Output */}
            <div className="sandbox-screen glass">
              <div className="sandbox-tabs">
                <div className="sb-tab-group">
                  <button 
                    className={`sb-tab ${task === "spec" ? "active" : ""}`} 
                    onClick={() => setTask("spec")}
                  >
                    Draft Specification
                  </button>
                  <button 
                    className={`sb-tab ${task === "stories" ? "active" : ""}`} 
                    onClick={() => setTask("stories")}
                  >
                    Write User Stories
                  </button>
                </div>
                <div className="sb-run-indicator">
                  <span className="sb-run-dot" />Grounding Sandbox
                </div>
              </div>

              <div className="sandbox-body">
                {/* Column 1: Generic ChatGPT */}
                <div className="sb-column" style={{ borderRight: "1px solid rgba(255,255,255,0.04)", opacity: 0.45, transition: "opacity 0.25s ease" }}>
                  <div className="sb-col-header sb-chatgpt-header">Generic ChatGPT (Un-grounded)</div>
                  <div className="sb-code sb-code-chatgpt">
                    {sandboxData[profile][task].chatgpt}
                  </div>
                </div>

                {/* Column 2: PMind grounded */}
                <div className="sb-column" style={{ background: "rgba(217, 119, 6, 0.015)", transition: "all 0.25s ease" }}>
                  <div className="sb-col-header sb-pmind-header">PMind Context-Grounded AI</div>
                  <div className="sb-code sb-code-pmind">
                    {sandboxData[profile][task].pmind}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Continuous discovery flow (NEW) */}
      <section id="workflow" className="flow-sec" style={{ position: "relative", zIndex: 1 }}>
        <div className="container">
          <div className="play-header lp-reveal">
            <h2 style={{ fontFamily: S.serif, fontSize: "clamp(32px, 4vw, 44px)", fontWeight: 700, marginBottom: 16 }}>
              Continuous discovery, <em style={{ fontStyle: "italic", fontWeight: 400, color: S.amberHi }}>fully automated</em>
            </h2>
            <p style={{ fontSize: 16, color: S.text2, maxWidth: 580, margin: "0 auto" }}>
              From chaotic user feedback to a structured development backlog. PMind handles the heavy lifting so you focus on product decisions.
            </p>
          </div>

          <div className="flow-grid" style={{ display: "grid", gap: 24, marginTop: 48 }}>
            {[
              {
                num: "01",
                title: "Ingest Feedback",
                desc: "Drop user interview transcripts, Zendesk tickets, or NPS comments. Tab-aware chunking keeps speaker turns and spreadsheet rows completely whole.",
                meta: "Supports PDF, DOCX, CSV"
              },
              {
                num: "02",
                title: "Automated Insights",
                desc: "Our background analysis agents automatically harvest verbatim pain-point quotes, tag target personas, and sort findings into theme folders.",
                meta: "Assigns Severity 1–5"
              },
              {
                num: "03",
                title: "RICE Prioritization",
                desc: "The Opportunity specialist clusters insights across themes, scoring and ranking opportunities grounded directly in real customer quotes.",
                meta: "Computes RICE Scores"
              },
              {
                num: "04",
                title: "Tracker Sync",
                desc: "Select committed opportunities, break them into Epics/Stories with acceptance criteria, and export them natively to tracking boards.",
                meta: "Syncs with Jira & Linear"
              }
            ].map((step, idx) => (
              <div key={idx} className="flow-card lp-reveal">
                <div className="flow-step-num">{step.num}</div>
                <h3 style={{ fontFamily: S.serif, fontSize: 16, fontWeight: 700, marginTop: 8, marginBottom: 12 }}>{step.title}</h3>
                <p style={{ fontSize: 12.5, color: S.text2, lineHeight: 1.6 }}>{step.desc}</p>
                <div className="flow-meta">
                  {step.meta.split(" ").map((w, i) => w === "PDF," || w === "DOCX," || w === "CSV" || w === "Severity" || w === "1–5" || w === "RICE" || w === "Scores" || w === "Jira" || w === "&" || w === "Linear" ? <strong key={i} style={{ color: S.amber }}>{w} </strong> : w + " ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {divider}

      {/* Time Saved Calculator (NEW) */}
      <section id="calculator" className="calc-sec" style={{ position: "relative", zIndex: 1 }}>
        <div className="container">
          <div className="play-header lp-reveal">
            <h2 style={{ fontFamily: S.serif, fontSize: "clamp(32px, 4vw, 44px)", fontWeight: 700, marginBottom: 16 }}>
              How much time will you <em style={{ fontStyle: "italic", fontWeight: 400, color: S.amberHi }}>buy back?</em>
            </h2>
            <p style={{ fontSize: 16, color: S.text2, maxWidth: 580, margin: "0 auto" }}>
              Product managers spend over 65% of their week on writing specs, tagging feedback, and building tickets. Let&apos;s see how much time PMind saves you.
            </p>
          </div>

          <div className="calc-box glass lp-reveal" style={{ display: "grid", gap: 48, padding: 48, background: "rgba(12, 12, 12, 0.5)", border: "1px solid rgba(217, 119, 6, 0.15)" }}>
            <div className="calc-sliders">
              <div className="slider-item">
                <div className="slider-header">
                  <span className="slider-title">Drafting PRDs & Briefs</span>
                  <span className="slider-val">{specsHours} hrs/wk</span>
                </div>
                <input 
                  type="range" className="range-input" min="1" max="25" value={specsHours} 
                  onChange={(e) => setSpecsHours(parseInt(e.target.value))} 
                />
              </div>

              <div className="slider-item" style={{ marginTop: 28 }}>
                <div className="slider-header">
                  <span className="slider-title">Tagging & Synthesizing Feedback</span>
                  <span className="slider-val">{researchHours} hrs/wk</span>
                </div>
                <input 
                  type="range" className="range-input" min="1" max="25" value={researchHours} 
                  onChange={(e) => setResearchHours(parseInt(e.target.value))} 
                />
              </div>

              <div className="slider-item" style={{ marginTop: 28 }}>
                <div className="slider-header">
                  <span className="slider-title">Writing & Sizing Jira Tickets</span>
                  <span className="slider-val">{ticketsHours} hrs/wk</span>
                </div>
                <input 
                  type="range" className="range-input" min="1" max="25" value={ticketsHours} 
                  onChange={(e) => setTicketsHours(parseInt(e.target.value))} 
                />
              </div>
            </div>

            <div className="calc-results" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", background: "rgba(0,0,0,0.3)", borderRadius: 6, border: "1px solid rgba(217,119,6,0.15)", padding: "36px 24px", position: "relative", overflow: "hidden" }}>
              <div className="result-huge">{roundedHours}</div>
              <div className="result-lbl">Hours Saved Per Week</div>
              
              <div className="result-bar-wrap">
                <div className="result-bar" style={{ width: `${progressPercent}%` }} />
              </div>
              
              <p className="result-desc" style={{ fontSize: 13, color: S.text3, maxWidth: 260, lineHeight: 1.5 }}>
                Equivalent to unlocking <strong style={{ color: S.text }}>{daysWord}</strong> every month to focus on strategy and alignment.
              </p>
              
              <div className="result-value-unlocked" style={{ marginTop: 20, fontSize: 14, fontWeight: 600, color: S.text2 }}>
                Estimated Value Reclaimed: <span style={{ color: "#22c55e", textShadow: "0 0 15px rgba(34, 197, 94, 0.2)" }}>{formattedVal}</span>/year
              </div>
            </div>
          </div>
        </div>
      </section>

      {divider}

      {/* Capabilities */}
      <section style={{ padding:"88px 0", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1080, margin:"0 auto", padding:"0 28px" }}>
          <div className="lp-reveal" style={{ display:"flex", alignItems:"baseline", gap:18, marginBottom:44 }}>
            <h2 style={{ fontFamily:S.serif, fontSize:"clamp(26px,3.2vw,34px)", fontWeight:700, letterSpacing:"-0.025em", color:S.text, whiteSpace:"nowrap" }}>Core Capabilities</h2>
            <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.056)" }} />
          </div>
          <div className="lp-caps-grid lp-reveal">
            {[
              { idx:"03", title:"Document-Aware Chat", desc:"Chat side-by-side with your drafts. Challenge assumptions, find gap coverage in your specs, and compile executive updates without copy-pasting." },
              { idx:"04", title:"Grounded Context Search",     desc:"Search semantically across user interviews, support threads, and PRDs. Extract verifiable evidence with inline citations directly in your drafts." },
              { idx:"05", title:"AI Apply — Diff Controls",  desc:"Review changes with visual diff highlights before applying them. Accept, edit, or reject AI alterations line by line directly inside your editor." },
              { idx:"06", title:"Multimodal UX Audits",   desc:"Drop screenshots of staging builds or design drafts. The design agent reviews them against your product criteria, checking UX consistency and copy gaps." },
              { idx:"07", title:"Jira / Linear Native Sync",   desc:"Export story point estimates, epics, and acceptance criteria in one click. Descriptions map automatically to native tracker formats." },
              { idx:"08", title:"Collaborative Strategy",          desc:"Share a centralized Product Brain strategy profile with your product squad. Keep everyone's specs perfectly aligned.", soon:true },
            ].map((cap, i) => (
              <div key={i} className="lp-cap">
                <div style={{ fontFamily:S.mono, fontSize:9, color:S.amber, opacity:.45, letterSpacing:".06em", marginBottom:9 }}>{cap.idx}</div>
                <div style={{ fontSize:13, fontWeight:600, color:S.text, marginBottom:7, letterSpacing:"-0.012em" }}>
                  {cap.title}
                  {cap.soon && <span style={{ display:"inline-block", padding:"2px 7px", marginLeft:5, background:"rgba(255,255,255,0.038)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:4, fontSize:8, color:S.text3, letterSpacing:".07em", textTransform:"uppercase", verticalAlign:"middle" }}>Soon</span>}
                </div>
                <div style={{ fontSize:12, color:S.text2, lineHeight:1.62 }}>{cap.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {divider}

      {/* Beta Pricing & FAQ (NEW) */}
      <section className="beta-pricing-sec" style={{ padding: "96px 0", position: "relative", zIndex: 1 }}>
        <div className="container">
          <div className="pricing-card glass-amber lp-reveal" style={{ maxWidth: 600, margin: "0 auto 56px", padding: 48, textAlign: "center", position: "relative", overflow: "hidden" }}>
            <div className="pr-title">Beta Access Tier</div>
            <div className="pr-cost">$0<span style={{ fontSize: 16, color: S.text3, fontFamily: "var(--font-inter)", fontWeight: 400 }}>/month</span></div>
            <div className="pr-note">Free during private beta for accepted product managers.</div>
            <div className="pr-bullets">
              <div className="pr-bullet">Unlimited workspaces & documents</div>
              <div className="pr-bullet">Full Jira & Linear sync options</div>
              <div className="pr-bullet">Grounded strategy & RICE Opportunity trees</div>
              <div className="pr-bullet">Guaranteed lifetime 50% discount at launch</div>
            </div>
            <Link href="/sign-in" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 36px", background: "linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius: 6, color: "#fff", fontSize: 15, fontWeight: 600, textDecoration: "none", boxShadow: "0 4px 20px rgba(217,119,6,0.25)", marginTop: 24 }}>
              Apply for Private Beta →
            </Link>
          </div>

          <div className="faq-grid lp-reveal" style={{ marginTop: 80 }}>
            {[
              {
                q: "Is this just another generic ChatGPT wrapper?",
                a: "No. Standard wrappers send single-shot prompts that hallucinate templated specs. PMind features a multi-agent backend that processes files semantically, builds strategic RICE hierarchies, and forces the model to verify every generation against active strategy constraints."
              },
              {
                q: "How secure is my strategy data?",
                a: "We take security seriously. All uploads are walled behind strict, enterprise-grade user permission layers. Your strategy context remains private, and is never used to train public LLM models."
              },
              {
                q: "How does the Jira / Linear sync work?",
                a: "PMind authenticates directly with your tracker profiles. We parse epics and stories, automatically mapping descriptive blocks into native formats so developers receive clean, properly formatted requirements."
              },
              {
                q: "Can I import existing templates?",
                a: "Yes. PMind features custom Tiptap layout loaders for standard product documents, from simple one-pagers and competitive analysis maps to complete OKR templates."
              }
            ].map((faq, idx) => (
              <div key={idx} className="faq-item">
                <h4 style={{ fontFamily: S.serif, fontSize: 15, fontWeight: 700, marginBottom: 8, color: S.text }}>{faq.q}</h4>
                <p style={{ fontSize: 12.5, color: S.text2, lineHeight: 1.6 }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {divider}

      {/* CTA */}
      <section style={{ padding:"96px 0", textAlign:"center", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1080, margin:"0 auto", padding:"0 28px" }}>
          <h2 className="lp-reveal" style={{ fontFamily:S.serif, fontSize:"clamp(30px,4.2vw,50px)", fontWeight:700, lineHeight:1.15, letterSpacing:"-0.028em", color:S.text, maxWidth:660, margin:"0 auto 40px" }}>
            Done explaining your product<br />to AI that <em style={{ fontStyle:"italic", fontWeight:400, color:S.amberHi }}>forgets by morning.</em>
          </h2>
          <div className="lp-reveal lp-reveal-d1" style={{ maxWidth:520, margin:"0 auto", padding:"52px 44px", borderRadius:8, position:"relative", overflow:"hidden", background:"rgba(217,119,6,0.035)", backdropFilter:"blur(20px)", border:S.amberBorder, borderTopColor:"rgba(217,119,6,0.32)", boxShadow:"0 24px 60px rgba(0,0,0,0.55),0 0 44px rgba(217,119,6,0.07),inset 0 1px 0 rgba(217,119,6,0.12)" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:"linear-gradient(90deg,transparent,#D97706,transparent)", opacity:.32 }} />
            <Link href="/sign-in" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"15px 38px", background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:6, color:"#fff", fontSize:16, fontWeight:600, textDecoration:"none", boxShadow:"0 6px 28px rgba(217,119,6,0.3)" }}>
              Get started free →
            </Link>
            <p style={{ marginTop:22, fontFamily:S.serif, fontStyle:"italic", fontSize:15, color:"rgba(217,119,6,0.55)", letterSpacing:"-0.01em" }}>The workspace that thinks in product.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop:"1px solid rgba(255,255,255,0.046)", padding:"32px 0", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1080, margin:"0 auto", padding:"0 28px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:22, height:22, background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:5, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:S.serif, fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.92)" }}>P</div>
              <span style={{ fontFamily:S.serif, fontWeight:700, fontSize:14, color:S.text, letterSpacing:"-0.02em" }}>PMind</span>
            </div>
            <span style={{ fontSize:12, color:S.text3 }}>© 2026 PMind</span>
            <div style={{ display:"flex", alignItems:"center", gap:16 }}>
              <a href="/privacy" style={{ fontSize:12, color:S.text3, textDecoration:"none" }}>Privacy Policy</a>
              <a href="/terms" style={{ fontSize:12, color:S.text3, textDecoration:"none" }}>Terms of Service</a>
            </div>
            <span style={{ fontFamily:S.serif, fontStyle:"italic", fontSize:12, color:"rgba(217,119,6,0.36)" }}>The workspace that thinks in product.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
