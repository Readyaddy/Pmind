"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Eye, Code2, ExternalLink, Check, Save } from "lucide-react";

export interface DesignContent {
  _type: "design";
  html: string;
  css: string;
  js: string;
  framework?: "vanilla" | "tailwind";
}

interface Props {
  content: DesignContent;
  title: string;
  onSave: (content: DesignContent, title: string) => void;
}

type Tab = "preview" | "html" | "css" | "js";

function buildSrcDoc(c: DesignContent, t: string): string {
  const useTailwind = c.framework === "tailwind";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.replace(/[<>]/g, "")}</title>
${useTailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : ""}
<style>
  html, body { margin: 0; padding: 0; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  ${c.css ?? ""}
</style>
</head>
<body>
${c.html ?? ""}
${c.js ? `<script>${c.js}</script>` : ""}
</body>
</html>`;
}

export default function DesignViewer({ content: initial, title: initialTitle, onSave }: Props) {
  const [content, setContent] = useState<DesignContent>(initial);
  const [title, setTitle] = useState(initialTitle);
  const [tab, setTab] = useState<Tab>("preview");
  const [saved, setSaved] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const srcDoc = useMemo(() => buildSrcDoc(content, title), [content, title]);

  // Debounced auto-save: onSave omitted — adding it restarts the debounce on every
  // parent re-render. Stable identity not guaranteed by callers.
  useEffect(() => {
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => onSave(content, title), 2000);
    return () => clearTimeout(saveTimeout.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title]);

  const handleSaveNow = () => {
    clearTimeout(saveTimeout.current);
    onSave(content, title);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const openInNewTab = () => {
    const blob = new Blob([srcDoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const TABS: { value: Tab; label: string }[] = [
    { value: "preview", label: "Preview" },
    { value: "html", label: "HTML" },
    ...(content.css ? [{ value: "css" as Tab, label: "CSS" }] : []),
    ...(content.js ? [{ value: "js" as Tab, label: "JS" }] : []),
  ];

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-[#0d0d0d]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-black/[0.06] dark:border-white/[0.06] bg-white/80 dark:bg-black/50 backdrop-blur-sm flex-shrink-0">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 text-[13px] font-semibold bg-transparent border-0 outline-none text-black/80 dark:text-white/80 min-w-0"
        />

        <div className="flex items-center gap-0.5 bg-black/[0.04] dark:bg-white/[0.04] rounded-lg p-0.5">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                tab === value
                  ? "bg-white dark:bg-zinc-800 text-amber-700 dark:text-amber shadow-sm"
                  : "text-black/45 dark:text-white/45 hover:text-black/70 dark:hover:text-white/70"
              }`}
            >
              {value === "preview" ? <Eye size={11} strokeWidth={2} /> : <Code2 size={11} strokeWidth={2} />}
              {label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-black/[0.08] dark:bg-white/[0.08]" />

        <button
          onClick={openInNewTab}
          className="p-1.5 rounded-lg text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-all"
          title="Open in new tab"
        >
          <ExternalLink size={13} strokeWidth={2} />
        </button>

        <button
          onClick={handleSaveNow}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold bg-amber-600 dark:bg-amber text-white dark:text-zinc-900 hover:bg-amber-700 dark:hover:bg-amber/90 transition-all"
        >
          {saved ? (
            <><Check size={11} strokeWidth={2.5} /> Saved</>
          ) : (
            <><Save size={11} strokeWidth={2} /> Save</>
          )}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {tab === "preview" ? (
          <iframe
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            title={title}
            className="w-full h-full border-0 bg-white"
          />
        ) : (
          <textarea
            className="w-full h-full resize-none font-mono text-[12.5px] leading-relaxed p-4 bg-black/[0.02] dark:bg-black/20 text-black/80 dark:text-white/75 border-0 outline-none"
            value={content[tab as "html" | "css" | "js"] ?? ""}
            onChange={(e) =>
              setContent((prev) => ({ ...prev, [tab]: e.target.value }))
            }
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
