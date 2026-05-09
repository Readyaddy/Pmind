"use client";

import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-4">
      <Link
        href="/"
        className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors mb-10 self-start max-w-sm w-full mx-auto"
      >
        <ArrowLeft size={12} /> Back to home
      </Link>

      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div style={{ width:28, height:28, background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-playfair),Georgia,serif", fontSize:14, fontWeight:700, color:"rgba(255,255,255,0.92)", boxShadow:"0 4px 14px rgba(217,119,6,0.32)" }}>P</div>
          <span className="font-serif text-2xl font-bold text-white tracking-tight">PMind</span>
        </div>
        <p className="text-white/30 text-sm">Your AI-native PM workspace</p>
      </div>

      <SignIn
        appearance={{
          variables: {
            colorBackground: "#111111",
            colorInputBackground: "#1a1a1a",
            colorInputText: "#ffffff",
            colorText: "#e5e5e5",
            colorTextSecondary: "#737373",
            colorPrimary: "#F59E0B",
            colorDanger: "#ef4444",
            borderRadius: "0.75rem",
            fontFamily: "var(--font-inter), sans-serif",
          },
          elements: {
            card: "shadow-2xl border border-white/5",
            headerTitle: "font-serif",
            footerActionLink: "text-amber-400 hover:text-amber-300",
          },
        }}
      />
    </div>
  );
}
