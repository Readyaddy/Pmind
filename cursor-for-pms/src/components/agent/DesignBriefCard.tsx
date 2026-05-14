"use client";

import React, { useState } from "react";
import { Palette, Layers, Sparkles, ChevronRight } from "lucide-react";

export interface DesignBriefArgs {
  context: string;
  suggested_styles?: string[];
}

interface Props {
  args: DesignBriefArgs;
  status: "running" | "done";
  onSubmit: (brief: string) => void;
}

const AESTHETICS = [
  {
    id: "glassmorphism",
    label: "Glassmorphism",
    desc: "Frosted glass, depth, blur",
    refs: "Linear, Stripe",
    preview: "linear-gradient(135deg, rgba(167,139,250,0.25) 0%, rgba(99,102,241,0.12) 100%)",
    border: "rgba(167,139,250,0.3)",
  },
  {
    id: "editorial",
    label: "Editorial",
    desc: "Serif type, whitespace",
    refs: "Notion, Readwise",
    preview: "linear-gradient(135deg, #faf8f5 0%, #f0ebe3 100%)",
    border: "rgba(120,113,108,0.2)",
  },
  {
    id: "neo-tech",
    label: "Neo-tech",
    desc: "Terminal, mono, sharp",
    refs: "Vercel, Railway",
    preview: "linear-gradient(135deg, #0a0a0a 0%, #18181b 100%)",
    border: "rgba(34,211,238,0.25)",
  },
  {
    id: "brutalist",
    label: "Brutalist",
    desc: "Raw, bold, stark",
    refs: "Figma Blog",
    preview: "linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)",
    border: "rgba(249,115,22,0.3)",
  },
  {
    id: "organic",
    label: "Organic",
    desc: "Rounded, pastel, soft",
    refs: "Luma, Craft",
    preview: "linear-gradient(135deg, #f0fdf4 0%, #bbf7d0 100%)",
    border: "rgba(52,211,153,0.3)",
  },
  {
    id: "retro",
    label: "Retro / Bold",
    desc: "Expressive, playful",
    refs: "Framer",
    preview: "linear-gradient(135deg, #fff1f2 0%, #fecdd3 100%)",
    border: "rgba(244,63,94,0.3)",
  },
];

const PALETTES = [
  {
    id: "amber-dark",
    label: "Amber & Dark",
    swatches: ["#D97706", "#1a1a1a", "#F3F2F1"],
  },
  {
    id: "arctic-blue",
    label: "Arctic & White",
    swatches: ["#3b82f6", "#f8fafc", "#0f172a"],
  },
  {
    id: "forest-ivory",
    label: "Forest & Ivory",
    swatches: ["#16a34a", "#faf7f2", "#1c1917"],
  },
  {
    id: "midnight-gold",
    label: "Midnight & Gold",
    swatches: ["#ca8a04", "#0c0a09", "#fef3c7"],
  },
  {
    id: "rose-cream",
    label: "Rose & Cream",
    swatches: ["#f43f5e", "#fff8f5", "#1c0a0a"],
  },
  {
    id: "mono-bold",
    label: "Mono + Red",
    swatches: ["#ef4444", "#0a0a0a", "#ffffff"],
  },
];

const ALL_SECTIONS = [
  "Nav",
  "Hero",
  "Features",
  "How it works",
  "Testimonials",
  "Pricing",
  "FAQ",
  "Footer",
];

export default function DesignBriefCard({ args, status, onSubmit }: Props) {
  const suggestedId =
    args.suggested_styles?.[0]?.toLowerCase().replace(/[\s/]+/g, "-") ?? "";
  const initialStyle =
    AESTHETICS.find((a) => a.id === suggestedId)?.id ?? "";

  const [selectedStyle, setSelectedStyle] = useState<string>(initialStyle);
  const [selectedPalette, setSelectedPalette] = useState<string>("amber-dark");
  const [selectedSections, setSelectedSections] = useState<string[]>([
    "Nav",
    "Hero",
    "Features",
    "Footer",
  ]);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const toggleSection = (s: string) =>
    setSelectedSections((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  const handleBuild = () => {
    if (!selectedStyle || submitted) return;
    const palette = PALETTES.find((p) => p.id === selectedPalette);
    const aesthetic = AESTHETICS.find((a) => a.id === selectedStyle);
    const parts = [
      `Build this: ${args.context}`,
      `Aesthetic direction: ${aesthetic?.label} — ${aesthetic?.desc}`,
      `Color palette: ${palette?.label} (${palette?.swatches.join(", ")})`,
    ];
    if (selectedSections.length > 0)
      parts.push(`Sections: ${selectedSections.join(", ")}`);
    if (notes.trim()) parts.push(`Extra requirements: ${notes.trim()}`);
    parts.push("Build the full design now using render_ui.");
    setSubmitted(true);
    onSubmit(parts.join("\n"));
  };

  if (submitted) {
    return (
      <div className="w-full rounded-xl border border-amber-500/20 bg-amber-50/30 dark:bg-amber/5 px-3.5 py-2.5 flex items-center gap-2 text-[12px] text-amber-700/70 dark:text-amber/60">
        <Sparkles size={12} className="animate-pulse flex-shrink-0" />
        Building your design…
      </div>
    );
  }

  const canBuild = !!selectedStyle;

  return (
    <div className="w-full rounded-xl border border-black/[0.07] dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.03] overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-black/[0.05] dark:border-white/[0.05] flex items-center gap-2 bg-gradient-to-r from-amber-50/80 to-transparent dark:from-amber/[0.04] dark:to-transparent">
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center flex-shrink-0 shadow-sm">
          <Palette size={11} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-black/60 dark:text-white/55">
            Design Brief
          </p>
          <p className="text-[11.5px] text-black/50 dark:text-white/45 truncate leading-snug">
            {args.context}
          </p>
        </div>
      </div>

      <div className="p-3.5 space-y-4">
        {/* ── Aesthetic ── */}
        <section>
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-black/35 dark:text-white/30 mb-2">
            <Layers size={9} strokeWidth={2.5} />
            Aesthetic
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {AESTHETICS.map((a) => {
              const active = selectedStyle === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedStyle(a.id)}
                  className={`text-left p-2 rounded-lg border transition-all ${
                    active
                      ? "border-amber-400/60 ring-1 ring-amber-400/30 dark:ring-amber/25 bg-amber-50/70 dark:bg-amber/[0.08]"
                      : "border-black/[0.07] dark:border-white/[0.07] hover:border-black/[0.13] dark:hover:border-white/[0.13] bg-white/40 dark:bg-white/[0.02]"
                  }`}
                >
                  <div
                    className="w-full h-[22px] rounded-md mb-1.5"
                    style={{
                      background: a.preview,
                      border: `1px solid ${a.border}`,
                    }}
                  />
                  <p
                    className={`text-[10px] font-semibold leading-tight ${
                      active
                        ? "text-amber-800 dark:text-amber"
                        : "text-black/65 dark:text-white/60"
                    }`}
                  >
                    {a.label}
                  </p>
                  <p className="text-[9px] text-black/30 dark:text-white/25 leading-tight mt-0.5 truncate">
                    {a.refs}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Color palette ── */}
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/35 dark:text-white/30 mb-2">
            Color Palette
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {PALETTES.map((p) => {
              const active = selectedPalette === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPalette(p.id)}
                  className={`text-left p-2 rounded-lg border transition-all ${
                    active
                      ? "border-amber-400/60 ring-1 ring-amber-400/30 dark:ring-amber/25 bg-amber-50/70 dark:bg-amber/[0.08]"
                      : "border-black/[0.07] dark:border-white/[0.07] hover:border-black/[0.13] dark:hover:border-white/[0.13] bg-white/40 dark:bg-white/[0.02]"
                  }`}
                >
                  <div className="flex gap-0.5 mb-1.5">
                    {p.swatches.map((c, i) => (
                      <div
                        key={i}
                        className="h-[14px] flex-1 rounded border border-black/10"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <p
                    className={`text-[9.5px] font-medium leading-tight ${
                      active
                        ? "text-amber-800 dark:text-amber"
                        : "text-black/55 dark:text-white/45"
                    }`}
                  >
                    {p.label}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Sections ── */}
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/35 dark:text-white/30 mb-2">
            Sections
          </p>
          <div className="flex flex-wrap gap-1">
            {ALL_SECTIONS.map((s) => {
              const active = selectedSections.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleSection(s)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
                    active
                      ? "bg-amber-100/80 dark:bg-amber/[0.14] border-amber-400/50 dark:border-amber/35 text-amber-800 dark:text-amber"
                      : "bg-transparent border-black/[0.09] dark:border-white/[0.09] text-black/45 dark:text-white/40 hover:border-black/[0.18] dark:hover:border-white/[0.18]"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Notes ── */}
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/35 dark:text-white/30 mb-1.5">
            Extra notes
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. serif headings, countdown timer, dark hero…"
            rows={2}
            className="w-full text-[11.5px] rounded-lg border border-black/[0.09] dark:border-white/[0.09] bg-white/50 dark:bg-white/[0.04] px-2.5 py-2 placeholder:text-black/25 dark:placeholder:text-white/20 text-black/75 dark:text-white/70 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400/35 dark:focus:ring-amber/25 focus:border-amber-300/50 transition-all leading-relaxed"
          />
        </section>

        {/* ── Build button ── */}
        <button
          onClick={handleBuild}
          disabled={!canBuild}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12.5px] font-semibold text-white transition-all amber-grad hover-lift disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0"
        >
          <Sparkles size={12} strokeWidth={2} />
          Build it
          <ChevronRight size={12} strokeWidth={2.5} />
        </button>

        {!canBuild && (
          <p className="text-center text-[10px] text-black/30 dark:text-white/25 -mt-2">
            Pick an aesthetic to continue
          </p>
        )}
      </div>
    </div>
  );
}
