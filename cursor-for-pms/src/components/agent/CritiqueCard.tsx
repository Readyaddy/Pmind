"use client";

import { useState } from "react";
import { Eye, AlertTriangle, AlertCircle, Info, Check, Sparkles, Loader2, ChevronDown } from "lucide-react";

interface Issue {
  severity: "high" | "med" | "low";
  area: string;
  detail: string;
  fix: string;
}

export interface Critique {
  verdict?: "strong" | "decent" | "weak";
  aesthetic_direction?: string;
  strengths?: string[];
  issues?: Issue[];
  improvement_summary?: string;
}

const VERDICT_META: Record<string, { label: string; tone: string }> = {
  strong: { label: "Strong", tone: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 ring-emerald-200/60 dark:ring-emerald-500/20" },
  decent: { label: "Decent", tone: "text-amber-700 dark:text-amber bg-amber-50 dark:bg-amber/10 ring-amber-200/60 dark:ring-amber/25" },
  weak:   { label: "Weak",   tone: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 ring-red-200/60 dark:ring-red-500/25" },
};

const SEVERITY_META: Record<string, { icon: React.ElementType; tone: string; label: string }> = {
  high: { icon: AlertCircle,     tone: "text-red-600 dark:text-red-400",       label: "High" },
  med:  { icon: AlertTriangle,   tone: "text-amber-700 dark:text-amber",       label: "Medium" },
  low:  { icon: Info,            tone: "text-black/40 dark:text-white/40",     label: "Low" },
};

export default function CritiqueCard({
  critique,
  status,
}: {
  critique: Critique | null;
  status: "running" | "done" | "error";
}) {
  const [expandedFix, setExpandedFix] = useState<number | null>(null);

  if (status === "running" || !critique) {
    return (
      <div className="pm-fade-in my-2 rounded-xl border border-amber-300/40 dark:border-amber/25 bg-gradient-to-br from-amber-50/60 to-amber-100/30 dark:from-amber/[0.07] dark:to-amber/[0.03] px-3.5 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={12} className="text-amber-700 dark:text-amber" strokeWidth={2.2} />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber">
            Senior designer reviewing
          </span>
          <Loader2 size={11} className="ml-auto animate-spin text-amber-500" />
        </div>
        <div className="mt-1.5 text-[11.5px] text-black/55 dark:text-white/50 italic">
          Checking typography, color, hierarchy, polish, AI-slop tells…
        </div>
      </div>
    );
  }

  const verdict = VERDICT_META[critique.verdict ?? "decent"] ?? VERDICT_META.decent;
  const issues = (critique.issues ?? []).slice().sort((a, b) => {
    const order = { high: 0, med: 1, low: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  return (
    <div className="pm-fade-in my-2 rounded-xl overflow-hidden border border-amber-300/40 dark:border-amber/25 bg-gradient-to-br from-amber-50/60 to-amber-100/30 dark:from-amber/[0.07] dark:to-amber/[0.03] shadow-[0_3px_14px_-6px_rgba(217,119,6,0.18)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber/15 ring-1 ring-amber-200/70 dark:ring-amber/25 flex-shrink-0">
          <Eye size={11} className="text-amber-800 dark:text-amber" strokeWidth={2.2} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800/80 dark:text-amber/80 leading-none">
            Design review
          </div>
          {critique.aesthetic_direction && (
            <div className="text-[12px] text-black/70 dark:text-white/70 mt-0.5 truncate italic">
              {critique.aesthetic_direction}
            </div>
          )}
        </div>
        <span className={`text-[9.5px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-md ring-1 ${verdict.tone}`}>
          {verdict.label}
        </span>
      </div>

      {/* Strengths */}
      {critique.strengths && critique.strengths.length > 0 && (
        <div className="px-3.5 pb-2.5">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-700/70 dark:text-emerald-400/70 mb-1.5">
            Strengths
          </div>
          <ul className="space-y-1">
            {critique.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-black/65 dark:text-white/65 leading-snug">
                <Check size={10} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" strokeWidth={2.5} />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Issues */}
      {issues.length > 0 && (
        <div className="px-3.5 pb-2.5">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-red-700/70 dark:text-red-400/70 mb-1.5">
            Issues to fix · {issues.length}
          </div>
          <div className="space-y-1.5">
            {issues.map((issue, i) => {
              const meta = SEVERITY_META[issue.severity] ?? SEVERITY_META.low;
              const Icon = meta.icon;
              const isOpen = expandedFix === i;
              return (
                <div
                  key={i}
                  className="rounded-lg bg-white/55 dark:bg-black/25 border border-black/5 dark:border-white/[0.06] overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedFix(isOpen ? null : i)}
                    className="w-full flex items-start gap-2 px-2.5 py-2 text-left hover:bg-black/[0.025] dark:hover:bg-white/[0.025] transition-colors"
                  >
                    <Icon size={11} className={`mt-0.5 flex-shrink-0 ${meta.tone}`} strokeWidth={2.2} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[8.5px] font-bold uppercase tracking-[0.12em] ${meta.tone}`}>
                          {meta.label}
                        </span>
                        <span className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-black/35 dark:text-white/35">
                          · {issue.area.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-black/75 dark:text-white/75 leading-snug mt-0.5">
                        {issue.detail}
                      </p>
                    </div>
                    <ChevronDown
                      size={11}
                      className={`flex-shrink-0 text-black/30 dark:text-white/30 mt-0.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-2.5 pb-2 pt-1 border-t border-black/[0.04] dark:border-white/[0.04] pm-fade-in">
                      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber mb-1">
                        Fix
                      </div>
                      <p className="text-[11.5px] text-black/70 dark:text-white/70 leading-relaxed font-mono bg-amber-50/40 dark:bg-amber/[0.04] rounded p-2 border border-amber-100/60 dark:border-amber/15">
                        {issue.fix}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {critique.improvement_summary && (
        <div className="px-3.5 py-2.5 border-t border-amber-200/40 dark:border-amber/15 bg-amber-50/30 dark:bg-amber/[0.03]">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-amber-800/80 dark:text-amber/80 mb-1">
            What to change
          </div>
          <p className="text-[11.5px] text-black/70 dark:text-white/70 leading-relaxed">
            {critique.improvement_summary}
          </p>
        </div>
      )}
    </div>
  );
}
