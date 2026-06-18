"use client";

import { useEffect, useRef, useState } from "react";
import { GitBranch, Copy, Check, Code, Eye, Loader2 } from "lucide-react";

export interface DiagramArgs {
  title: string;
  type: string;
  definition: string;
}

type Tab = "preview" | "code";

export default function DiagramCard({
  args,
  status,
}: {
  args: DiagramArgs;
  status: "running" | "done" | "error";
}) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [tab, setTab] = useState<Tab>("preview");
  const [copied, setCopied] = useState(false);
  const idRef = useRef(`diagram-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (status !== "done" || !args.definition) return;
    let cancelled = false;

    import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        fontFamily: "inherit",
        flowchart: { curve: "basis" },
      });
      mermaid
        .render(idRef.current, args.definition.trim())
        .then(({ svg: rendered }) => {
          if (!cancelled) {
            setSvg(rendered);
            setError("");
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(String(e));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [args.definition, status]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(args.definition ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const isLoading = status !== "done" || (status === "done" && !svg && !error);

  return (
    <div className="pm-fade-in my-2 rounded-xl overflow-hidden border border-black/[0.07] dark:border-white/[0.08] bg-white dark:bg-[#111]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-black/[0.06] dark:border-white/[0.06] bg-black/[0.015] dark:bg-white/[0.02]">
        <span className="flex items-center justify-center w-5 h-5 rounded-md bg-violet-100 dark:bg-violet-500/15 flex-shrink-0">
          <GitBranch size={11} className="text-violet-700 dark:text-violet-400" />
        </span>
        <span className="flex-1 text-[12px] font-semibold text-black/75 dark:text-white/80 truncate">
          {args.title || "Diagram"}
        </span>
        {args.type && (
          <span className="text-[10px] text-black/35 dark:text-white/35 font-mono uppercase tracking-wide">
            {args.type}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 px-2 pt-1.5 pb-0">
        {(["preview", "code"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              tab === t
                ? "bg-black/[0.06] dark:bg-white/[0.08] text-black/80 dark:text-white/80"
                : "text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60"
            }`}
          >
            {t === "preview" ? <Eye size={10} /> : <Code size={10} />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <button
          onClick={handleCopy}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 transition-colors"
        >
          {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Body */}
      <div className="p-3 min-h-[120px]">
        {tab === "preview" ? (
          isLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-black/30 dark:text-white/30">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-[12px]">Rendering…</span>
            </div>
          ) : error ? (
            <div className="text-[11.5px] text-red-500 dark:text-red-400 font-mono whitespace-pre-wrap p-2 bg-red-50 dark:bg-red-900/15 rounded-lg">
              {error}
            </div>
          ) : (
            <div
              className="diagram-render flex justify-center overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )
        ) : (
          <pre className="text-[11px] text-black/65 dark:text-white/60 font-mono whitespace-pre-wrap leading-relaxed bg-black/[0.025] dark:bg-white/[0.03] rounded-lg p-3 overflow-x-auto thin-scroll">
            {args.definition}
          </pre>
        )}
      </div>
    </div>
  );
}
