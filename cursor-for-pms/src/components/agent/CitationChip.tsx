"use client";

import { useState, useRef, useEffect } from "react";
import { BookOpen, FileText } from "lucide-react";

export interface Source {
  id: string;
  kind: "kb" | "doc";
  title: string;
  snippet?: string;
}

export default function CitationChip({
  index,
  source,
}: {
  index: number;
  source: Source | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const Icon = source?.kind === "doc" ? FileText : BookOpen;

  return (
    <span ref={ref} className="relative inline-block align-baseline">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 mx-[2px] rounded-md text-[10px] font-bold leading-none align-text-top transition-all duration-150 bg-amber-50 text-amber-700 ring-1 ring-amber-300/50 hover:bg-amber-100 hover:ring-amber-400/70 hover:scale-105 dark:bg-amber/[0.12] dark:text-amber dark:ring-amber/30 dark:hover:bg-amber/20"
        title={source?.title ?? "Source"}
      >
        {index}
      </button>
      {open && source && (
        <span className="pm-pop-in absolute bottom-full left-0 mb-1.5 z-50 w-72 rounded-xl shadow-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-black/5 dark:border-white/10 p-3.5 text-[11px] normal-case font-normal tracking-normal leading-relaxed">
          <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-700 dark:text-amber mb-2">
            <Icon size={10} className="opacity-80" />
            {source.kind === "kb" ? "Knowledge base" : "Document"}
          </span>
          <span className="block font-semibold text-black/85 dark:text-white/85 mb-2 leading-snug">
            {source.title}
          </span>
          {source.snippet && (
            <span className="block text-black/55 dark:text-white/55 line-clamp-4 italic border-l-2 border-amber-300/40 dark:border-amber/30 pl-2.5">
              {source.snippet}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
