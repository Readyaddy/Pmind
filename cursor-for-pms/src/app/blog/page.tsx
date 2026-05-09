import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — PMind",
  description: "Product management insights, AI workflows, and PM best practices from the PMind team.",
};

const POSTS = [
  {
    slug: "how-to-write-a-prd-with-ai",
    tag: "Product Management",
    date: "May 8, 2026",
    read: "8 min read",
    title: "How to Write a PRD with AI (Without Sounding Like a Template)",
    intro: "Most AI-generated PRDs are immediately recognizable — and not in a good way. Here's how to write one that's actually grounded in your product, your users, and your metrics.",
  },
];

export default function BlogIndex() {
  return (
    <div className="blog-root">
      {/* Nav */}
      <nav className="blog-nav">
        <Link href="/" className="blog-nav-logo">
          <div className="blog-nav-mark">P</div>
          <span className="blog-nav-name">PMind</span>
        </Link>
        <Link href="/sign-in" className="blog-nav-cta">Get Started →</Link>
      </nav>

      <div style={{ maxWidth:780, margin:"0 auto", padding:"64px 24px 96px" }}>
        <div style={{ marginBottom:48 }}>
          <p style={{ fontFamily:"monospace", fontSize:10, letterSpacing:"0.14em", textTransform:"uppercase", color:"rgba(243,242,241,0.36)", marginBottom:12 }}>PMind Blog</p>
          <h1 style={{ fontFamily:"var(--font-playfair),Georgia,serif", fontSize:"clamp(32px,5vw,42px)", fontWeight:700, letterSpacing:"-0.03em", color:"#F3F2F1", lineHeight:1.15 }}>
            Product thinking,<br />grounded in practice.
          </h1>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:1, background:"rgba(255,255,255,0.04)", borderRadius:12, overflow:"hidden" }}>
          {POSTS.map(post => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="blog-card">
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, fontSize:12, color:"rgba(243,242,241,0.36)" }}>
                <span style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:"#D97706", padding:"2px 8px", border:"1px solid rgba(217,119,6,0.28)", borderRadius:4, background:"rgba(217,119,6,0.08)" }}>{post.tag}</span>
                <span>{post.date}</span>
                <span>·</span>
                <span>{post.read}</span>
              </div>
              <h2 style={{ fontFamily:"var(--font-playfair),Georgia,serif", fontSize:"clamp(18px,2.4vw,22px)", fontWeight:700, letterSpacing:"-0.022em", color:"#F3F2F1", margin:"0 0 10px", lineHeight:1.25 }}>{post.title}</h2>
              <p style={{ fontSize:14, color:"rgba(243,242,241,0.62)", lineHeight:1.7, margin:0, maxWidth:560 }}>{post.intro}</p>
              <div style={{ marginTop:16, fontSize:13, fontWeight:600, color:"#F59E0B" }}>Read article →</div>
            </Link>
          ))}
        </div>
      </div>

      <footer style={{ borderTop:"1px solid rgba(217,119,6,0.12)", padding:"28px 24px", textAlign:"center", fontSize:13, color:"rgba(243,242,241,0.36)" }}>
        <p><Link href="/" style={{ color:"#D97706", textDecoration:"none" }}>← Back to PMind</Link> &nbsp;·&nbsp; © 2026 PMind</p>
      </footer>
    </div>
  );
}
