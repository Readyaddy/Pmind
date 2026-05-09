import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How to Write a PRD with AI (Without Sounding Like a Template) — PMind",
  description: "Most AI-generated PRDs are painfully generic. Here's how to write a product requirements document with AI that's actually grounded in your product, your users, and your metrics.",
  openGraph: {
    type: "article",
    url: "https://pmind.xyz/blog/how-to-write-a-prd-with-ai",
    title: "How to Write a PRD with AI (Without Sounding Like a Template)",
    description: "Most AI-generated PRDs are painfully generic. Here's how to write one that's actually grounded in your product, users, and metrics.",
    siteName: "PMind",
  },
};

const T = {
  bg:      "#0A0A0A",
  surface: "#111111",
  border:  "rgba(217,119,6,0.12)",
  amber:   "#D97706",
  amberHi: "#F59E0B",
  text:    "#F3F2F1",
  text2:   "rgba(243,242,241,0.62)",
  text3:   "rgba(243,242,241,0.36)",
  serif:   "var(--font-playfair),Georgia,serif",
  mono:    "'JetBrains Mono','Courier New',monospace",
};

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin:"32px 0", padding:"20px 24px", background:"rgba(217,119,6,0.06)", border:"1px solid rgba(217,119,6,0.2)", borderLeft:"3px solid #D97706", borderRadius:"0 8px 8px 0" }}>
      {children}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"36px 1fr", gap:16, marginBottom:24, alignItems:"start" }}>
      <div style={{ width:36, height:36, borderRadius:10, flexShrink:0, background:"rgba(217,119,6,0.1)", border:"1px solid rgba(217,119,6,0.25)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:T.serif, fontSize:16, fontWeight:700, color:T.amberHi }}>{n}</div>
      <div>
        <h3 style={{ fontSize:15, fontWeight:600, color:T.amberHi, margin:"2px 0 8px", letterSpacing:"0.01em" }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Prompt({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin:"16px 0 24px", padding:"16px 20px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:8, fontFamily:T.mono, fontSize:13, color:"rgba(243,242,241,0.55)", lineHeight:1.7, whiteSpace:"pre-wrap" }}>
      {children}
    </div>
  );
}

function Hl({ children }: { children: React.ReactNode }) {
  return <span style={{ color: T.amberHi }}>{children}</span>;
}

function Divider() {
  return <div style={{ height:1, background:T.border, margin:"48px 0" }} />;
}

function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h2 id={id} style={{ fontFamily:T.serif, fontSize:"clamp(22px,3vw,26px)", fontWeight:700, letterSpacing:"-0.022em", color:T.text, margin:"48px 0 16px", lineHeight:1.3 }}>{children}</h2>;
}

export default function BlogPost() {
  return (
    <div style={{ background:T.bg, color:T.text, minHeight:"100vh", fontFamily:"var(--font-inter),-apple-system,sans-serif", WebkitFontSmoothing:"antialiased" }}>
      {/* Nav */}
      <nav style={{ position:"sticky", top:0, zIndex:10, borderBottom:`1px solid ${T.border}`, background:"rgba(10,10,10,0.92)", backdropFilter:"blur(12px)", padding:"0 24px", height:52, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <Link href="/" style={{ display:"flex", alignItems:"center", gap:9, textDecoration:"none" }}>
          <div style={{ width:26, height:26, borderRadius:7, background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:T.serif, fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.92)" }}>P</div>
          <span style={{ fontFamily:T.serif, fontSize:16, fontWeight:700, color:T.text, letterSpacing:"-0.02em" }}>PMind</span>
        </Link>
        <Link href="/sign-in" style={{ fontSize:13, fontWeight:600, color:T.amberHi, padding:"6px 14px", border:"1px solid rgba(217,119,6,0.3)", borderRadius:7, textDecoration:"none" }}>
          Get Started →
        </Link>
      </nav>

      {/* Layout */}
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 24px", display:"grid", gridTemplateColumns:"1fr 280px", gap:64, alignItems:"start" }}>

        {/* Article */}
        <article style={{ padding:"56px 0 96px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:28, fontSize:12, color:T.text3 }}>
            <span style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:T.amber, padding:"3px 9px", border:"1px solid rgba(217,119,6,0.28)", borderRadius:4, background:"rgba(217,119,6,0.08)" }}>Product Management</span>
            <span>May 8, 2026</span>
            <span>·</span>
            <span>8 min read</span>
          </div>

          <h1 style={{ fontFamily:T.serif, fontSize:"clamp(32px,5vw,46px)", fontWeight:700, letterSpacing:"-0.03em", lineHeight:1.18, color:T.text, marginBottom:20 }}>
            How to Write a PRD with AI <em style={{ fontStyle:"italic", fontWeight:400, color:T.amberHi }}>(Without Sounding Like a Template)</em>
          </h1>

          <p style={{ fontSize:18, color:T.text2, lineHeight:1.72, marginBottom:48, paddingBottom:48, borderBottom:`1px solid ${T.border}` }}>
            Most AI-generated PRDs are immediately recognizable — and not in a good way. They use the same five-section template, fill every bullet with buzzwords, and could describe any feature at any company. That&apos;s not an AI problem. It&apos;s a context problem. Here&apos;s how to actually write a product requirements document with AI that sounds like you wrote it.
          </p>

          <H2>Why AI-Written PRDs Are Usually Terrible</H2>
          <p style={{ fontSize:16, color:T.text2, lineHeight:1.8, marginBottom:20 }}>
            Open ChatGPT. Type &quot;write a PRD for a mobile checkout redesign.&quot; What you get back looks professional — Problem Statement, Goals, User Stories, Acceptance Criteria, Success Metrics — and is completely useless. The success metrics are made up. The user personas could describe anyone. The acceptance criteria read like they were written for a product no one has ever used.
          </p>
          <p style={{ fontSize:16, color:T.text2, lineHeight:1.8, marginBottom:20 }}>
            The problem isn&apos;t that AI can&apos;t write PRDs. It&apos;s that <strong style={{ color:T.text, fontWeight:600 }}>you gave the AI nothing to work with.</strong> No context about your users. No existing metrics to tie goals to. No constraints from engineering. No information about what your product already does.
          </p>
          <p style={{ fontSize:16, color:T.text2, lineHeight:1.8, marginBottom:20 }}>
            A PRD written without context is a template. A PRD written with context is a specification. The difference is everything.
          </p>

          <Callout>
            <p style={{ margin:0, fontSize:15, color:T.text2, lineHeight:1.8 }}><strong style={{ color:T.amberHi }}>The core principle:</strong> The quality of AI output is directly proportional to the quality of context you provide. Garbage in, garbage out — but this cuts both ways. The better your context, the better the AI writes.</p>
          </Callout>

          <H2>What Goes Into a Good PRD</H2>
          <p style={{ fontSize:16, color:T.text2, lineHeight:1.8, marginBottom:20 }}>
            Before using AI to write anything, it helps to know what a good PRD actually contains. Different teams have different templates, but the sections that consistently matter are:
          </p>
          <ul style={{ margin:"0 0 20px 20px" }}>
            {[
              ["Problem statement", "The specific problem you're solving, with evidence (data, user quotes, support tickets). This is the foundation. If this section is weak, the rest of the document doesn't matter."],
              ["User stories", "Written from the perspective of specific, real user types at your company. Not generic personas."],
              ["Acceptance criteria", "Concrete, testable conditions that define \"done.\" These need to match how your engineering team actually tests."],
              ["Success metrics", "Tied to metrics you already track. If you measure checkout completion rate today, your PRD should reference that specific number."],
              ["Out of scope", "Often the most valuable section. Explicit decisions about what you're not building prevent scope creep later."],
            ].map(([title, desc], i) => (
              <li key={i} style={{ fontSize:16, color:T.text2, lineHeight:1.8, marginBottom:8 }}>
                <strong style={{ color:T.text, fontWeight:600 }}>{title}</strong> — {desc}
              </li>
            ))}
          </ul>

          <H2 id="step-by-step">Step-by-Step: Writing a PRD with AI</H2>

          <div style={{ marginBottom:28 }}>
            <Step n={1} title="Write your product context first — once">
              <p style={{ margin:0, fontSize:15, color:T.text2, lineHeight:1.8 }}>Before touching any AI tool, write 200–300 words about your product. This is not part of the PRD. It&apos;s context you&apos;ll inject into every AI prompt. Include: what your product does, who your primary users are, key metrics you currently track, your tech stack (so ticket estimates are realistic), and any constraints that affect decisions.</p>
              <p style={{ marginTop:12, marginBottom:0, fontSize:15, color:T.text2, lineHeight:1.8 }}>You only write this once. Every subsequent AI interaction references it.</p>
            </Step>

            <Step n={2} title="Start with the problem statement, not the full PRD">
              <p style={{ margin:"0 0 12px", fontSize:15, color:T.text2, lineHeight:1.8 }}>Don&apos;t ask AI to &quot;write a PRD.&quot; Ask it to write the problem statement first. This is the most important section and the one most worth getting right before moving on.</p>
              <Prompt><Hl>Context:</Hl>{" [paste your product context]\n\n"}<Hl>Problem:</Hl>{" Our checkout abandonment is 34% vs 18% industry benchmark.\nDrop-off is concentrated at payment selection — step 3 of 4.\n\nWrite a problem statement for a PRD addressing this. Reference\nthe specific data. Keep it under 150 words."}</Prompt>
              <p style={{ margin:0, fontSize:15, color:T.text2, lineHeight:1.8 }}>Iterate on this until it accurately captures the real problem in your product&apos;s language. Everything else in the PRD flows from here.</p>
            </Step>

            <Step n={3} title="Generate each section sequentially, with the previous as input">
              <p style={{ margin:"0 0 12px", fontSize:15, color:T.text2, lineHeight:1.8 }}>Once the problem statement is solid, generate user stories — but reference the problem statement you just wrote. Then generate acceptance criteria referencing those user stories. Each section builds on the last, which forces coherence across the document.</p>
              <Prompt><Hl>Problem statement:</Hl>{" [paste what you just wrote]\n\n"}<Hl>Our users:</Hl>{" Mobile-first buyers aged 25–40. High intent, trust-driven.\nFrequent abandoners have saved payment methods but don't see them.\n\nWrite 3 user stories for this feature. Use the format:\n\"As a [specific user type], I want [action] so that [outcome].\"\nReference the actual drop-off data in at least one story."}</Prompt>
            </Step>

            <Step n={4} title="Write success metrics tied to numbers you already track">
              <p style={{ margin:"0 0 12px", fontSize:15, color:T.text2, lineHeight:1.8 }}>This is where most AI-written PRDs lose credibility. The AI will invent metrics if you let it. Instead, tell it exactly which metrics your team currently monitors.</p>
              <Prompt>{"We currently track: checkout_completion_rate (66%), payment_step_drop_off (34%),\nrepeat_purchase_rate (monthly), and payment_load_time_p95.\n\nBased on the problem statement above, write success metrics for this feature.\nUse our existing metrics. Include a primary metric, two secondary metrics,\nand a guardrail metric we should not regress on."}</Prompt>
            </Step>

            <Step n={5} title="Break it into tickets as the final step">
              <p style={{ margin:"0 0 12px", fontSize:15, color:T.text2, lineHeight:1.8 }}>After the PRD is complete, use AI to decompose it into engineering tickets. With the full context of the PRD, the AI can write tickets that reference the correct services and match your team&apos;s acceptance criteria format.</p>
              <Prompt><Hl>Here is the full PRD:</Hl>{" [paste]\nOur engineering team uses JIRA. Story points: Fibonacci (1,2,3,5,8,13).\nBackend is Node.js microservices. Mobile is React Native.\n\nBreak this into development tickets. Each ticket needs: title, description,\nacceptance criteria (BDD format), story points, and any dependencies."}</Prompt>
            </Step>
          </div>

          <Divider />

          <H2>The Prompts That Actually Work</H2>
          <p style={{ fontSize:16, color:T.text2, lineHeight:1.8, marginBottom:20 }}>After the structure, prompting technique matters. The AI interactions that produce the best PRD sections share a few patterns:</p>

          {[
            ["Be specific about format", `"Write acceptance criteria" produces generic output. "Write acceptance criteria in BDD format (Given/When/Then), maximum 3 per story, that a QA engineer could test without asking me a clarifying question" produces something testable.`],
            ["Constrain the output length", "AI expands to fill space. Every section of a PRD should have a target length. Problem statement: 100–150 words. Each user story: one sentence. Acceptance criteria: 3 per story. Constraints force precision."],
            ["Ask for what you're leaving out", `One of the most useful prompts: "Based on this PRD, what are the three most important things I haven't defined yet that will cause problems in engineering?" This is where AI genuinely adds value — it sees gaps that are invisible to the person who wrote the document.`],
            ["Treat the first output as a draft to react to, not a document to ship", "The best use of AI in PRD writing is getting from blank page to something you have opinions about. The editing pass — where you fix what the AI got wrong and adjust the language to match how your team talks — is where the document becomes yours."],
          ].map(([title, body], i) => (
            <div key={i}>
              <h3 style={{ fontSize:15, fontWeight:600, color:T.amberHi, margin:"32px 0 12px", letterSpacing:"0.01em" }}>{title}</h3>
              <p style={{ fontSize:16, color:T.text2, lineHeight:1.8, marginBottom:20 }}>{body}</p>
            </div>
          ))}

          <Divider />

          <H2>What AI Still Can&apos;t Do</H2>
          <p style={{ fontSize:16, color:T.text2, lineHeight:1.8, marginBottom:20 }}>A few sections of every PRD should stay entirely human-written:</p>
          <ul style={{ margin:"0 0 20px 20px" }}>
            {[
              ["The \"Why now\" section.", "AI doesn't know your roadmap, your competitive landscape, or the internal conversation that made this feature a priority. This context exists only in your head."],
              ["Stakeholder alignment notes.", "Which team raised the concern, which exec needs to sign off, which constraint came from a specific conversation — AI can't know this."],
              ["The out-of-scope section.", "The explicit decisions about what you're not building are strategic. They reflect tradeoffs only you can make."],
            ].map(([title, desc], i) => (
              <li key={i} style={{ fontSize:16, color:T.text2, lineHeight:1.8, marginBottom:8 }}>
                <strong style={{ color:T.text, fontWeight:600 }}>{title}</strong> {desc}
              </li>
            ))}
          </ul>

          <Divider />

          <H2>Putting It Into Practice</H2>
          <p style={{ fontSize:16, color:T.text2, lineHeight:1.8, marginBottom:20 }}>
            The workflow above works in any AI tool, but it requires re-pasting your product context into every conversation, every time. The problem compounds as your team grows — different PMs have different versions of the context, some outdated, some incomplete.
          </p>
          <p style={{ fontSize:16, color:T.text2, lineHeight:1.8, marginBottom:20 }}>
            This is the problem PMind is built to solve. You write your product context once in the <strong style={{ color:T.text }}>Product Brain</strong> sidebar — your product strategy, user personas, current metrics, tech constraints — and it&apos;s injected automatically into every AI generation. Press <kbd style={{ padding:"2px 6px", background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:4, fontSize:13, fontFamily:"monospace" }}>⌘K</kbd> anywhere in a document to generate a PRD section, break epics into tickets, write a stakeholder update, or synthesize research — all grounded in your product, not a generic template.
          </p>

          {/* CTA */}
          <div style={{ marginTop:56, padding:36, borderRadius:14, background:"rgba(217,119,6,0.06)", border:"1px solid rgba(217,119,6,0.2)", textAlign:"center" }}>
            <h2 style={{ fontFamily:T.serif, fontSize:24, fontWeight:700, color:T.text, margin:"0 0 12px" }}>Write your next PRD in PMind</h2>
            <p style={{ fontSize:15, color:T.text2, lineHeight:1.7, margin:"0 0 24px", maxWidth:480, marginLeft:"auto", marginRight:"auto" }}>Paste your product context once. Every PRD, ticket breakdown, and brief is grounded in it — automatically.</p>
            <Link href="/sign-in" style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"14px 32px", fontSize:15, fontWeight:600, background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:9, color:"#fff", textDecoration:"none", boxShadow:"0 8px 28px rgba(217,119,6,0.35)" }}>
              Get started free →
            </Link>
          </div>
        </article>

        {/* Sidebar */}
        <aside style={{ padding:"56px 0", position:"sticky", top:68 }}>
          <div style={{ padding:20, borderRadius:12, background:T.surface, border:`1px solid ${T.border}`, marginBottom:20 }}>
            <div style={{ fontSize:10, fontWeight:600, letterSpacing:"0.12em", textTransform:"uppercase", color:T.text3, marginBottom:14 }}>About PMind</div>
            <h3 style={{ fontSize:15, fontWeight:600, color:T.text, margin:"0 0 8px" }}>AI workspace built for PMs</h3>
            <p style={{ fontSize:13, color:T.text3, lineHeight:1.65, margin:"0 0 16px" }}>Write PRDs, generate tickets, and synthesize research — grounded in your product context, not generic templates.</p>
            <Link href="/sign-in" style={{ display:"block", textAlign:"center", padding:9, fontSize:13, fontWeight:600, color:T.amberHi, border:"1px solid rgba(217,119,6,0.3)", borderRadius:7, textDecoration:"none", background:"rgba(217,119,6,0.07)" }}>
              Get Started →
            </Link>
          </div>

          <div style={{ padding:20, borderRadius:12, background:T.surface, border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:10, fontWeight:600, letterSpacing:"0.12em", textTransform:"uppercase", color:T.text3, marginBottom:14 }}>In This Article</div>
            <ul style={{ listStyle:"none", margin:0, padding:0 }}>
              {[
                ["#step-by-step","Why AI PRDs fail"],
                ["#step-by-step","What a good PRD needs"],
                ["#step-by-step","Step-by-step with AI"],
                ["#step-by-step","Prompts that actually work"],
                ["#step-by-step","What AI can't do"],
              ].map(([href, label], i) => (
                <li key={i} style={{ marginBottom:10 }}>
                  <a href={href} style={{ fontSize:13, color:T.text3, textDecoration:"none" }}>{label}</a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer style={{ borderTop:`1px solid ${T.border}`, padding:"28px 24px", textAlign:"center", fontSize:13, color:T.text3 }}>
        <p><Link href="/" style={{ color:T.amber, textDecoration:"none" }}>← Back to PMind</Link> &nbsp;·&nbsp; © 2026 PMind</p>
      </footer>
    </div>
  );
}
