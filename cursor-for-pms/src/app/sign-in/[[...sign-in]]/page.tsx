"use client";

import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background glow orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-amber-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-amber-500/8 blur-[100px] pointer-events-none" />
      <div className="absolute top-[30%] right-[15%] w-[300px] h-[300px] rounded-full bg-orange-700/6 blur-[80px] pointer-events-none" />

      {/* Grid texture overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Back link */}
      <Link
        href="/"
        className="flex items-center gap-1.5 text-xs text-white/25 hover:text-white/55 transition-colors mb-10 self-start max-w-sm w-full mx-auto relative z-10"
      >
        <ArrowLeft size={12} /> Back to home
      </Link>

      {/* Logo + headline */}
      <div className="mb-8 text-center relative z-10">
        <div className="flex items-center justify-center gap-2.5 mb-3">
          <div
            style={{
              width: 32,
              height: 32,
              background: "linear-gradient(145deg, #D97706 0%, #92400e 100%)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Georgia, serif",
              fontSize: 15,
              fontWeight: 700,
              color: "rgba(255,255,255,0.95)",
              boxShadow: "0 4px 18px rgba(217,119,6,0.40), 0 0 0 1px rgba(217,119,6,0.2)",
            }}
          >
            P
          </div>
          <span
            className="font-serif text-2xl font-bold text-white tracking-tight"
            style={{ fontFamily: "Georgia, serif" }}
          >
            PMind
          </span>
        </div>
        <p className="text-white/35 text-sm leading-relaxed max-w-[240px] mx-auto">
          Your AI-native workspace for product work
        </p>
      </div>

      {/* Clerk SignIn */}
      <div className="relative z-10 w-full max-w-sm">
        <SignIn
          appearance={{
            variables: {
              colorBackground: "#111111",
              colorInputBackground: "#1c1c1c",
              colorInputText: "#f5f5f5",
              colorText: "#e5e5e5",
              colorTextSecondary: "#737373",
              colorPrimary: "#F59E0B",
              colorDanger: "#ef4444",
              colorNeutral: "#ffffff",
              borderRadius: "0.75rem",
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: "14px",
            },
            elements: {
              card: "shadow-2xl border border-white/[0.07] bg-[#111111]",
              headerTitle: "text-white font-semibold",
              headerSubtitle: "text-white/40",
              footerActionLink: "text-amber-400 hover:text-amber-300",
              formButtonPrimary:
                "bg-amber-500 hover:bg-amber-400 text-white font-semibold shadow-lg shadow-amber-900/30 transition-all",
              formFieldInput:
                "bg-[#1c1c1c] border-white/10 text-white focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition-all",
              formFieldLabel: "text-white/50 text-xs font-medium",
              dividerLine: "bg-white/8",
              dividerText: "text-white/25 text-xs",
              // Social buttons (Google, etc.) — force light background so they're visible on dark
              socialButtonsBlockButton:
                "bg-white hover:bg-gray-100 border border-gray-200 text-gray-900 font-medium shadow-sm transition-all",
              socialButtonsBlockButtonText: "text-gray-900 font-medium",
              socialButtonsBlockButtonArrow: "text-gray-500",
              identityPreviewText: "text-white/70",
              identityPreviewEditButtonIcon: "text-amber-400",
              alternativeMethodsBlockButton:
                "bg-white/5 hover:bg-white/8 border border-white/8 text-white/70 transition-all",
            },
          }}
        />
      </div>

      {/* Bottom tagline */}
      <p className="mt-10 text-white/15 text-xs text-center relative z-10">
        Built for PMs who ship fast
      </p>
    </div>
  );
}
