"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // ctx is non-null from here; capture for closures
    const gctx = ctx;
    let W = 0, H = 0, t = 0, raf = 0;

    function resize() {
      W = c!.width = innerWidth;
      H = c!.height = innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const orbs = [
      { nx:0.14, ny:0.18, r:380, a:0.13, sp:0.19, ph:0.0 },
      { nx:0.82, ny:0.42, r:320, a:0.09, sp:0.14, ph:2.1 },
      { nx:0.50, ny:0.78, r:420, a:0.07, sp:0.11, ph:4.2 },
      { nx:0.92, ny:0.12, r:260, a:0.10, sp:0.22, ph:1.1 },
      { nx:0.28, ny:0.62, r:300, a:0.06, sp:0.16, ph:3.4 },
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

    gctx.fillStyle = "#080808";
    gctx.fillRect(0, 0, innerWidth, innerHeight);

    function frame() {
      t += 0.007;
      gctx.fillStyle = "rgba(8,8,8,0.20)";
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
    text2: "rgba(245,242,238,0.52)" as const,
    text3: "rgba(245,242,238,0.28)" as const,
    serif: "var(--font-playfair),Georgia,serif" as const,
    mono: "'JetBrains Mono',monospace" as const,
    glassBorder: "1px solid rgba(255,255,255,0.065)" as const,
    amberBorder: "1px solid rgba(217,119,6,0.20)" as const,
  };

  const divider = (
    <div style={{ height:1, position:"relative", zIndex:1, background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.06) 28%,rgba(255,255,255,0.06) 72%,transparent)" }} />
  );

  return (
    <div style={{ fontFamily:"var(--font-inter),-apple-system,sans-serif", background:"#080808", color:S.text, lineHeight:1.6, overflowX:"hidden", WebkitFontSmoothing:"antialiased" }}>
      {/* Background */}
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
      <nav style={{ position:"fixed", top:0, left:0, right:0, zIndex:600, height:58, background:"rgba(8,8,8,0.72)", backdropFilter:"blur(28px) saturate(1.5)", WebkitBackdropFilter:"blur(28px) saturate(1.5)", borderBottom:"1px solid rgba(255,255,255,0.046)" }}>
        <div style={{ maxWidth:1080, margin:"0 auto", padding:"0 28px", height:"100%", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:26, height:26, background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:S.serif, fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.92)", boxShadow:"0 4px 14px rgba(217,119,6,0.32)" }}>P</div>
            <span style={{ fontFamily:S.serif, fontWeight:700, fontSize:16, color:S.text, letterSpacing:"-0.02em" }}>PMind</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:20 }}>
            <Link href="/blog" style={{ fontSize:13, color:"rgba(245,242,238,0.45)", textDecoration:"none" }}>Blog</Link>
            <Link href="/billing" style={{ fontSize:13, color:"rgba(245,242,238,0.45)", textDecoration:"none" }}>Pricing</Link>
            <Link href="/sign-in" style={{ padding:"7px 18px", background:"rgba(217,119,6,0.10)", border:S.amberBorder, borderRadius:7, color:S.amberHi, fontSize:13, fontWeight:600, textDecoration:"none" }}>
              Get Started →
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ paddingTop:128, paddingBottom:56, textAlign:"center", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1080, margin:"0 auto", padding:"0 28px" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"5px 14px", marginBottom:44, background:"rgba(217,119,6,0.10)", border:S.amberBorder, borderRadius:100, fontSize:10, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:S.amberHi }}>
            <span className="lp-badge-pulse" />&nbsp;Private Beta — Limited Access
          </div>
          <h1 style={{ fontFamily:S.serif, fontSize:"clamp(46px,6.8vw,82px)", fontWeight:700, lineHeight:1.04, letterSpacing:"-0.034em", color:S.text, marginBottom:26, maxWidth:840, marginLeft:"auto", marginRight:"auto" }}>
            The workspace that<br /><em style={{ fontStyle:"italic", fontWeight:400, color:S.amberHi }}>thinks in product.</em>
          </h1>
          <p style={{ fontSize:18, color:S.text2, maxWidth:480, margin:"0 auto 44px", lineHeight:1.68 }}>
            AI grounded in your strategy, your users, and your constraints — not just your last message.
          </p>
          <Link href="/sign-in" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"14px 30px", background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:9, color:"#fff", fontSize:15, fontWeight:600, textDecoration:"none", boxShadow:"0 6px 28px rgba(217,119,6,0.3)" }}>
            Get started free →
          </Link>
        </div>
      </section>

      {/* App Mockup */}
      <section style={{ padding:"0 0 96px", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1080, margin:"0 auto", padding:"0 28px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, marginBottom:36 }}>
            <span style={{ flex:"0 0 52px", height:1, background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.08))" }} />
            <span style={{ fontFamily:S.mono, fontSize:10, letterSpacing:"0.16em", textTransform:"uppercase", color:S.text3 }}>See PMind in action</span>
            <span style={{ flex:"0 0 52px", height:1, background:"linear-gradient(90deg,rgba(255,255,255,0.08),transparent)" }} />
          </div>

          <div className="lp-reveal" style={{ position:"relative" }}>
            <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:"70%", height:280, pointerEvents:"none", zIndex:0, background:"radial-gradient(ellipse,rgba(217,119,6,0.09) 0%,transparent 65%)" }} />
            <div style={{ borderRadius:12, overflow:"hidden", boxShadow:"0 32px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(217,119,6,0.12)", position:"relative", zIndex:1 }}>
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
                    <span style={{ fontSize:11, color:S.text3 }}>☀</span>
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
                      <div className="lp-cmd-modal" style={{ width:420, maxWidth:"92%", background:"rgba(20,17,12,0.98)", border:"1px solid rgba(217,119,6,0.28)", borderTopColor:"rgba(217,119,6,0.4)", borderRadius:12, boxShadow:"0 32px 72px rgba(0,0,0,0.8),0 0 0 1px rgba(217,119,6,0.08),0 0 40px rgba(217,119,6,0.08)", overflow:"hidden" }}>
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

      {divider}

      {/* Statement */}
      <section style={{ padding:"72px 0", textAlign:"center", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1080, margin:"0 auto", padding:"0 28px" }}>
          <blockquote className="lp-reveal" style={{ fontFamily:S.serif, fontSize:"clamp(20px,3.2vw,32px)", fontStyle:"italic", color:S.text2, lineHeight:1.55, maxWidth:660, margin:"0 auto", letterSpacing:"-0.018em" }}>
            ChatGPT gives you a template.<br />
            PMind gives you output that<br />
            <strong style={{ fontStyle:"normal", fontWeight:700, color:S.text }}>knows you ship B2B SaaS to enterprise fintech teams.</strong>
          </blockquote>
        </div>
      </section>

      {divider}

      {/* Feature 1 — ⌘K */}
      <section style={{ padding:"88px 0", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1080, margin:"0 auto", padding:"0 28px" }}>
          <div className="lp-feat-grid lp-reveal">
            <div>
              <div style={{ fontFamily:S.mono, fontSize:10, color:S.amber, opacity:.55, letterSpacing:".1em", marginBottom:18 }}>01 / ⌘K</div>
              <h2 style={{ fontFamily:S.serif, fontSize:"clamp(28px,3.4vw,38px)", fontWeight:700, lineHeight:1.16, letterSpacing:"-0.026em", color:S.text, marginBottom:18 }}>
                Press ⌘K.<br />Get output that<br /><em style={{ fontStyle:"italic", fontWeight:400, color:S.amberHi }}>knows your product.</em>
              </h2>
              <p style={{ fontSize:15, color:S.text2, lineHeight:1.72, maxWidth:400 }}>Not a chat window. Not a template. Press ⌘K anywhere inside a document and choose what to generate — PRD, ticket breakdown, stakeholder update, research synthesis. The AI reads your current document and your Product Brain before writing a single word.</p>
              <div style={{ marginTop:22, padding:"12px 16px", background:"rgba(217,119,6,0.10)", borderLeft:"2px solid #D97706", borderRadius:"0 6px 6px 0", fontFamily:S.mono, fontSize:12, color:S.amberHi }}>→ Every command is grounded in your Product Brain, not a blank slate</div>
            </div>
            <div>
              <div style={{ borderRadius:13, overflow:"hidden", background:"rgba(255,255,255,0.028)", backdropFilter:"blur(20px)", border:S.glassBorder, borderTopColor:"rgba(255,255,255,0.11)", boxShadow:"0 24px 60px rgba(0,0,0,0.55),inset 0 1px 0 rgba(255,255,255,0.04)" }}>
                <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,0.04)", fontFamily:S.mono, fontSize:9, color:S.amber, letterSpacing:".1em", textTransform:"uppercase", display:"flex", alignItems:"center", gap:8, background:"rgba(14,12,8,0.8)" }}>
                  ⌘K Commands<div style={{ flex:1, height:1, background:"rgba(217,119,6,0.12)" }} />
                </div>
                <div style={{ padding:10, background:"rgba(12,10,7,0.88)" }}>
                  {["Write PRD","Break into tickets","Product brief","Stakeholder update","Synthesize research"].map((name, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 12px", borderRadius:7, marginBottom:4, background:i===0?"rgba(217,119,6,0.08)":"rgba(255,255,255,0.018)", border:`1px solid ${i===0?"rgba(217,119,6,0.2)":"rgba(255,255,255,0.042)"}` }}>
                      <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                        <div style={{ width:5, height:5, borderRadius:"50%", background:i===0?S.amber:S.text3 }} />
                        <span style={{ fontSize:13, color:i===0?S.amberHi:S.text2, fontWeight:i===0?500:400 }}>{name}</span>
                      </div>
                      {i===0 && <span style={{ fontFamily:S.mono, fontSize:9, color:S.text3, padding:"2px 6px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:4 }}>↵</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {divider}

      {/* Feature 2 — Product Brain */}
      <section style={{ padding:"88px 0", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1080, margin:"0 auto", padding:"0 28px" }}>
          <div className="lp-feat-grid-rev lp-reveal">
            <div>
              <div style={{ fontFamily:S.mono, fontSize:10, color:S.amber, opacity:.55, letterSpacing:".1em", marginBottom:18 }}>02 / Product Brain</div>
              <h2 style={{ fontFamily:S.serif, fontSize:"clamp(28px,3.4vw,38px)", fontWeight:700, lineHeight:1.16, letterSpacing:"-0.026em", color:S.text, marginBottom:18 }}>
                Tell it once.<br /><em style={{ fontStyle:"italic", fontWeight:400, color:S.amberHi }}>It never forgets.</em>
              </h2>
              <p style={{ fontSize:15, color:S.text2, lineHeight:1.72, maxWidth:400 }}>Paste your product strategy, target users, tech constraints, and success metrics into the Product Brain sidebar. Every AI output — across every document, command, and chat — is automatically grounded in it. No more re-explaining your product to every new conversation.</p>
              <div style={{ marginTop:22, padding:"12px 16px", background:"rgba(217,119,6,0.10)", borderLeft:"2px solid #D97706", borderRadius:"0 6px 6px 0", fontFamily:S.mono, fontSize:12, color:S.amberHi }}>→ One context. Every document. Zero repetition.</div>
            </div>
            <div>
              <div style={{ borderRadius:13, overflow:"hidden", background:"rgba(217,119,6,0.035)", backdropFilter:"blur(20px)", border:S.amberBorder, borderTopColor:"rgba(217,119,6,0.32)", boxShadow:"0 24px 60px rgba(0,0,0,0.55),0 0 44px rgba(217,119,6,0.07),inset 0 1px 0 rgba(217,119,6,0.12)" }}>
                <div style={{ padding:"12px 16px", background:"rgba(14,11,7,0.88)", borderBottom:"1px solid rgba(217,119,6,0.12)", display:"flex", alignItems:"center", gap:8, fontSize:10, fontWeight:700, color:"rgba(217,119,6,0.7)", letterSpacing:".12em", textTransform:"uppercase" }}>
                  <span className="lp-badge-pulse" />Product Brain
                  <span style={{ marginLeft:"auto", padding:"2px 9px", background:"rgba(217,119,6,0.12)", border:"1px solid rgba(217,119,6,0.22)", borderRadius:100, fontSize:9, color:S.amberHi, letterSpacing:".04em" }}>Active</span>
                </div>
                <div style={{ background:"rgba(12,10,7,0.86)", padding:12 }}>
                  {[
                    { label:"Product",     val:"B2C marketplace for urban professionals. High-intent mobile buyers." },
                    { label:"Target Users",val:"25–40, repeat purchasers, time-sensitive, trust-driven." },
                    { label:"Constraints", val:"No 3rd-party SDK additions. No feature flags in prod. Ship Q2." },
                    { label:"North Star",  val:"Checkout abandon <20%. Repeat purchase +15% YoY." },
                  ].map((f, i) => (
                    <div key={i} style={{ background:"rgba(255,255,255,0.018)", border:"1px solid rgba(255,255,255,0.042)", borderRadius:7, padding:"10px 12px", marginBottom:6 }}>
                      <div style={{ fontFamily:S.mono, fontSize:9, color:"rgba(217,119,6,0.52)", letterSpacing:".07em", textTransform:"uppercase", marginBottom:5 }}>{f.label}</div>
                      <div style={{ fontFamily:S.mono, fontSize:11, color:S.text2, lineHeight:1.6 }}>{f.val}</div>
                    </div>
                  ))}
                </div>
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
            <h2 style={{ fontFamily:S.serif, fontSize:"clamp(26px,3.2vw,34px)", fontWeight:700, letterSpacing:"-0.025em", color:S.text, whiteSpace:"nowrap" }}>Everything else</h2>
            <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.056)" }} />
          </div>
          <div className="lp-caps-grid lp-reveal">
            {[
              { idx:"03", title:"AI Chat — document-aware", desc:"Ask your document anything. Find gaps in your PRD, challenge assumptions, simplify for execs. AI reads the doc so you don't paste it." },
              { idx:"04", title:"Ticket Generator",         desc:"PRD → epics → stories with acceptance criteria and story points. Export directly to Jira or Linear with one click." },
              { idx:"05", title:"Knowledge Base + RAG",     desc:"Upload research reports, interview transcripts, competitive analyses. AI answers are enriched with cited excerpts — not hallucinated." },
              { idx:"06", title:"AI Apply — inline diffs",  desc:"See exactly what AI wants to change, highlighted in the document. Accept, reject, or review change by change." },
              { idx:"07", title:"UI Review — multimodal",   desc:"Attach a screenshot. Get PM-level feedback on UX gaps, missing states, and copy issues in seconds." },
              { idx:"08", title:"Team Workspaces",          desc:"Shared Product Brain across your PM team. One source of product truth — every document grounded in it.", soon:true },
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

      {/* CTA */}
      <section style={{ padding:"96px 0", textAlign:"center", position:"relative", zIndex:1 }}>
        <div style={{ maxWidth:1080, margin:"0 auto", padding:"0 28px" }}>
          <h2 className="lp-reveal" style={{ fontFamily:S.serif, fontSize:"clamp(30px,4.2vw,50px)", fontWeight:700, lineHeight:1.15, letterSpacing:"-0.028em", color:S.text, maxWidth:660, margin:"0 auto 40px" }}>
            Done explaining your product<br />to AI that <em style={{ fontStyle:"italic", fontWeight:400, color:S.amberHi }}>forgets by morning.</em>
          </h2>
          <div className="lp-reveal lp-reveal-d1" style={{ maxWidth:520, margin:"0 auto", padding:"52px 44px", borderRadius:18, position:"relative", overflow:"hidden", background:"rgba(217,119,6,0.035)", backdropFilter:"blur(20px)", border:S.amberBorder, borderTopColor:"rgba(217,119,6,0.32)", boxShadow:"0 24px 60px rgba(0,0,0,0.55),0 0 44px rgba(217,119,6,0.07),inset 0 1px 0 rgba(217,119,6,0.12)" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:"linear-gradient(90deg,transparent,#D97706,transparent)", opacity:.32 }} />
            <Link href="/sign-in" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"15px 38px", background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:9, color:"#fff", fontSize:16, fontWeight:600, textDecoration:"none", boxShadow:"0 6px 28px rgba(217,119,6,0.3)" }}>
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
            <span style={{ fontSize:12, color:S.text3 }}>© 2025 PMind</span>
            <span style={{ fontFamily:S.serif, fontStyle:"italic", fontSize:12, color:"rgba(217,119,6,0.36)" }}>The workspace that thinks in product.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
