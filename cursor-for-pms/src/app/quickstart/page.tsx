"use client";

import Link from "next/link";
import { useEffect } from "react";

const AMBER = "#D97706";
const AMBER_HI = "#F59E0B";
const TEXT = "#F5F2EE";
const TEXT2 = "rgba(245,242,238,0.55)";
const TEXT3 = "rgba(245,242,238,0.28)";
const SERIF = "var(--font-playfair),Georgia,serif";
const MONO = "'JetBrains Mono',monospace";

const steps = [
  {
    n: "01", icon: "⬡", title: "Create a project",
    desc: "Open the project picker in the top-left sidebar and click New project. Each project gets its own documents, knowledge base, and AI context — completely isolated from other projects.",
    tip: "Name it after a product, team, or initiative. You can rename it any time by clicking the pencil icon next to the project name.",
    commands: [] as string[],
  },
  {
    n: "02", icon: "🧠", title: "Set up your Product Brain",
    desc: "Click the Product Brain panel on the right side of any document. Paste your product strategy, target users, tech constraints, and north-star metrics. The AI reads this before every command — you never explain your product again.",
    tip: 'Be specific: "B2B SaaS, mobile-first, no third-party SDKs, ship Q2" produces much better output than "we build an app."',
    commands: [] as string[],
  },
  {
    n: "03", icon: "📄", title: "Create a document",
    desc: "Click New Document on your project home page or the + button in the sidebar. You get a rich editor — write freely, paste markdown, or drag-and-drop images. Documents auto-save every 2 seconds.",
    tip: "The document title is shown at the top. Click the pencil icon next to it to rename inline — no separate settings page needed.",
    commands: [] as string[],
  },
  {
    n: "04", icon: "⌘", title: "Press ⌘K for AI commands",
    desc: "Inside any document, press ⌘K (Ctrl+K on Windows). A command palette opens — choose what to generate. Each command is grounded in your Product Brain and the current document content.",
    tip: "Use the Custom prompt option for anything not covered by the presets — the AI still reads your full product context.",
    commands: ["Write PRD", "Break into tickets", "Product brief", "Stakeholder update", "Synthesize research", "Custom prompt"],
  },
  {
    n: "05", icon: "💬", title: "Chat with your documents",
    desc: "The AI Chat panel lives on the right side. It always reads your currently open document. Ask it to find gaps in your PRD, simplify for execs, challenge assumptions, or draft a TL;DR.",
    tip: "Type @ in the chat box to mention specific docs or KB files by name. The AI reads them directly — not just a summary.",
    commands: [] as string[],
  },
  {
    n: "06", icon: "📚", title: "Build your Knowledge Base",
    desc: "Click Knowledge Base in your project or the Upload button. Drop in PDFs, DOCX, CSVs, user interview transcripts, or research reports. The AI chunks and embeds them — then searches automatically when you ask questions.",
    tip: "Upload your user research before asking the AI to synthesize insights. The quality difference is significant compared to asking without context.",
    commands: [] as string[],
  },
  {
    n: "07", icon: "@", title: "Tag files in chat",
    desc: "Type @ in the AI chat box to see a list of your documents and KB files. Select one to include it directly in the AI context. Use this when you want the AI to reference a specific interview or compare two docs.",
    tip: "You can tag multiple files in one message. The AI gets their full content, not just a summary.",
    commands: [] as string[],
  },
  {
    n: "08", icon: "📅", title: "See your calendar",
    desc: "Connect Google Calendar in Clerk settings (add the calendar.readonly scope). Your project home page shows upcoming meetings with conflict detection — back-to-back, overlapping, and marathon blocks are all flagged automatically.",
    tip: "Click any meeting card to pre-fill the chat with an agenda-drafting prompt for that meeting.",
    commands: [] as string[],
  },
];

export default function QuickstartPage() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((x) => {
          if (x.isIntersecting) x.target.classList.add("lp-vis");
        }),
      { threshold: 0.06 }
    );
    document.querySelectorAll(".qs-reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div
      style={{
        fontFamily: "var(--font-inter),-apple-system,sans-serif",
        background: "#080808",
        color: TEXT,
        lineHeight: 1.6,
        overflowX: "hidden",
        WebkitFontSmoothing: "antialiased",
        minHeight: "100vh",
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
          background:
            "radial-gradient(ellipse 80% 60% at 20% 0%,rgba(217,119,6,0.09) 0%,transparent 60%)," +
            "radial-gradient(ellipse 60% 50% at 80% 100%,rgba(160,70,8,0.07) 0%,transparent 60%)",
        }}
      />
      <div className="lp-bg-grain" />

      {/* Nav */}
      <nav
        style={{
          position: "sticky", top: 0, zIndex: 100, height: 54,
          background: "rgba(8,8,8,0.82)", backdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255,255,255,0.046)",
        }}
      >
        <div
          style={{
            maxWidth: 860, margin: "0 auto", padding: "0 28px",
            height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
              <div
                style={{
                  width: 24, height: 24,
                  background: "linear-gradient(145deg,#D97706 0%,#92400e 100%)",
                  borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: SERIF, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.92)",
                }}
              >
                P
              </div>
              <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 15, color: TEXT, letterSpacing: "-0.02em" }}>PMind</span>
            </Link>
            <span style={{ color: "rgba(255,255,255,0.12)", fontSize: 16 }}>/</span>
            <span style={{ fontSize: 13, color: TEXT2 }}>Quickstart</span>
          </div>
          <Link
            href="/sign-in"
            style={{
              fontSize: 12, color: AMBER_HI, textDecoration: "none", fontWeight: 600,
              padding: "6px 14px", background: "rgba(217,119,6,0.10)",
              border: "1px solid rgba(217,119,6,0.22)", borderRadius: 7,
            }}
          >
            Open PMind →
          </Link>
        </div>
      </nav>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "0 28px 96px", position: "relative", zIndex: 1 }}>

        {/* Hero */}
        <div style={{ paddingTop: 72, paddingBottom: 60, textAlign: "center" }}>
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 14px", marginBottom: 32,
              background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.20)",
              borderRadius: 100, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
              textTransform: "uppercase", color: AMBER_HI,
            }}
          >
            Quickstart Guide
          </div>
          <h1
            style={{
              fontFamily: SERIF, fontSize: "clamp(36px,5vw,58px)", fontWeight: 700,
              lineHeight: 1.08, letterSpacing: "-0.03em", color: TEXT, marginBottom: 20,
            }}
          >
            Up and running
            <br />
            <em style={{ fontStyle: "italic", fontWeight: 400, color: AMBER_HI }}>in 5 minutes.</em>
          </h1>
          <p style={{ fontSize: 16, color: TEXT2, maxWidth: 440, margin: "0 auto", lineHeight: 1.7 }}>
            Everything you need to start writing better product docs with AI grounded in your actual context.
          </p>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {steps.map((step, i) => (
            <div
              key={step.n}
              className="qs-reveal"
              style={{
                display: "flex", gap: 28, padding: "36px 0",
                borderBottom: i < steps.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                opacity: 0, transform: "translateY(12px)",
                transition: `opacity 0.38s ease ${i * 0.04}s, transform 0.38s ease ${i * 0.04}s`,
              }}
            >
              {/* Step number + connector line */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 44 }}>
                <div
                  style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: i === 0
                      ? "linear-gradient(145deg,rgba(217,119,6,0.28) 0%,rgba(160,70,8,0.18) 100%)"
                      : "rgba(255,255,255,0.042)",
                    border: `1px solid ${i === 0 ? "rgba(217,119,6,0.35)" : "rgba(255,255,255,0.07)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: MONO, fontSize: 11, fontWeight: 700,
                    color: i === 0 ? AMBER_HI : TEXT3, letterSpacing: "0.04em",
                  }}
                >
                  {step.n}
                </div>
                {i < steps.length - 1 && (
                  <div
                    style={{
                      flex: 1, width: 1, marginTop: 10,
                      background: "linear-gradient(180deg,rgba(217,119,6,0.16) 0%,rgba(255,255,255,0.04) 100%)",
                    }}
                  />
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, paddingTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{step.icon}</span>
                  <h2
                    style={{
                      fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: TEXT,
                      letterSpacing: "-0.02em", lineHeight: 1, margin: 0,
                    }}
                  >
                    {step.title}
                  </h2>
                </div>

                <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.78, maxWidth: 580, marginBottom: 16 }}>
                  {step.desc}
                </p>

                {/* Command badges */}
                {step.commands.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                    {step.commands.map((cmd, ci) => (
                      <span
                        key={ci}
                        style={{
                          padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                          background: ci === 0 ? "rgba(217,119,6,0.12)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${ci === 0 ? "rgba(217,119,6,0.28)" : "rgba(255,255,255,0.07)"}`,
                          color: ci === 0 ? AMBER_HI : TEXT2,
                        }}
                      >
                        {cmd}
                      </span>
                    ))}
                  </div>
                )}

                {/* Tip */}
                <div
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px",
                    background: "rgba(217,119,6,0.05)", borderLeft: "2px solid rgba(217,119,6,0.32)",
                    borderRadius: "0 6px 6px 0",
                  }}
                >
                  <span style={{ fontSize: 12, color: AMBER, marginTop: 1, flexShrink: 0 }}>💡</span>
                  <p style={{ fontSize: 12, color: "rgba(217,119,6,0.72)", lineHeight: 1.65, margin: 0 }}>
                    {step.tip}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Key insight banner */}
        <div
          className="qs-reveal"
          style={{
            marginTop: 56, padding: "28px 32px", borderRadius: 16,
            background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.18)",
            borderTopColor: "rgba(217,119,6,0.32)",
            opacity: 0, transform: "translateY(12px)",
            transition: "opacity 0.38s ease 0.12s, transform 0.38s ease 0.12s",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div
              style={{
                width: 36, height: 36, borderRadius: 8,
                background: "rgba(217,119,6,0.18)", border: "1px solid rgba(217,119,6,0.28)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, fontSize: 16,
              }}
            >
              ✦
            </div>
            <div>
              <p style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, color: TEXT, marginBottom: 8, letterSpacing: "-0.01em" }}>
                The key insight
              </p>
              <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.75, maxWidth: 560, margin: 0 }}>
                PMind&apos;s AI reads your{" "}
                <strong style={{ color: TEXT }}>Product Brain</strong> before every command, every chat reply, and every synthesis.
                The more specific you are — your users, constraints, north-star metric, and current focus — the more your outputs will
                sound like <em>you</em>, not a generic template.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div
          className="qs-reveal"
          style={{
            marginTop: 56, textAlign: "center",
            opacity: 0, transform: "translateY(12px)",
            transition: "opacity 0.38s ease 0.2s, transform 0.38s ease 0.2s",
          }}
        >
          <Link
            href="/sign-in"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 32px",
              background: "linear-gradient(145deg,#D97706 0%,#92400e 100%)",
              borderRadius: 9, color: "#fff", fontSize: 15, fontWeight: 600,
              textDecoration: "none", boxShadow: "0 6px 28px rgba(217,119,6,0.28)",
            }}
          >
            Start building →
          </Link>
          <p style={{ marginTop: 14, fontSize: 12, color: TEXT3 }}>Free to start · No credit card required</p>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid rgba(255,255,255,0.046)", padding: "24px 0",
          position: "relative", zIndex: 1,
        }}
      >
        <div
          style={{
            maxWidth: 860, margin: "0 auto", padding: "0 28px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 12,
          }}
        >
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 7, textDecoration: "none" }}>
            <div
              style={{
                width: 20, height: 20, background: "linear-gradient(145deg,#D97706 0%,#92400e 100%)",
                borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: SERIF, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.92)",
              }}
            >
              P
            </div>
            <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 13, color: TEXT, letterSpacing: "-0.02em" }}>PMind</span>
          </Link>
          <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 12, color: "rgba(217,119,6,0.35)" }}>
            The workspace that thinks in product.
          </span>
        </div>
      </footer>

      <style>{`
        .qs-reveal.lp-vis {
          opacity: 1 !important;
          transform: translateY(0) !important;
        }
      `}</style>
    </div>
  );
}
