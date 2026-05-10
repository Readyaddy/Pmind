"use client";

import { useMemo, useRef, useState, useEffect, type MutableRefObject } from "react";
import { Eye, Code2, Copy, Check, ExternalLink, Maximize2, Minimize2, Loader2, Wand2, FolderOpen } from "lucide-react";
import { useRouter } from "next/navigation";

export interface ArtifactArgs {
  title?: string;
  html?: string;
  css?: string;
  js?: string;
  framework?: "vanilla" | "tailwind";
}

type Tab = "preview" | "html" | "css" | "js";

function buildSrcDoc({ html, css, js, framework, title }: ArtifactArgs): string {
  const useTailwind = framework === "tailwind";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${(title ?? "Preview").replace(/[<>]/g, "")}</title>
${useTailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : ""}
<style>
  html, body { margin: 0; padding: 0; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  ${css ?? ""}
</style>
</head>
<body>
${html ?? ""}
${js ? `<script>${js}</script>` : ""}
</body>
</html>`;
}

interface ArtifactCardProps {
  args: ArtifactArgs;
  status: "running" | "done" | "error";
  onRefine?: () => void;
  projectId?: string;
  userId?: string;
  existingDocId?: string;
  existingDocIdRef?: MutableRefObject<string | null>;
  onSaved?: (docId: string) => void;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function ArtifactCard({ args, status, onRefine, projectId, userId, existingDocId, existingDocIdRef, onSaved }: ArtifactCardProps) {
  const [tab, setTab] = useState<Tab>("preview");
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<Tab | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedDocId, setSavedDocId] = useState<string | null>(existingDocId ?? null);
  const savedRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const router = useRouter();

  // Auto-save once when status becomes "done"
  useEffect(() => {
    if (status !== "done" || savedRef.current || !projectId || !userId || !args.html) return;
    savedRef.current = true;
    saveDesign();
  }, [status]);

  const saveDesign = async () => {
    setSaveState("saving");
    const API = process.env.NEXT_PUBLIC_API_URL;
    // Use the ref value if available — it's always up-to-date even if the
    // React state update hasn't propagated to this component's props yet.
    const targetDocId = existingDocIdRef?.current ?? existingDocId;
    try {
      if (targetDocId) {
        await fetch(`${API}/documents/${targetDocId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${userId}` },
          body: JSON.stringify({
            title: args.title ?? "Untitled Design",
            content: { _type: "design", html: args.html ?? "", css: args.css ?? "", js: args.js ?? "", framework: args.framework ?? "vanilla" },
          }),
        });
        setSavedDocId(targetDocId);
        onSaved?.(targetDocId);
      } else {
        const res = await fetch(`${API}/projects/${projectId}/designs/`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${userId}` },
          body: JSON.stringify({
            title: args.title ?? "Untitled Design",
            html: args.html ?? "",
            css: args.css ?? "",
            js: args.js ?? "",
            framework: args.framework ?? "vanilla",
          }),
        });
        const data = await res.json();
        setSavedDocId(data.doc_id);
        onSaved?.(data.doc_id);
        window.dispatchEvent(new CustomEvent("pmind:refresh-tree", { detail: { projectId } }));
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const srcDoc = useMemo(() => buildSrcDoc(args), [args]);

  const codeFor = (t: Tab): string => {
    if (t === "html") return args.html ?? "";
    if (t === "css") return args.css ?? "";
    if (t === "js") return args.js ?? "";
    return "";
  };

  const copy = async (t: Tab) => {
    try {
      await navigator.clipboard.writeText(codeFor(t));
      setCopied(t);
      setTimeout(() => setCopied(null), 1200);
    } catch { /* clipboard blocked */ }
  };

  const openInNewTab = () => {
    const blob = new Blob([srcDoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const TabBtn = ({ value, label, icon: Icon, count }: {
    value: Tab; label: string; icon: React.ElementType; count?: number;
  }) => (
    <button
      onClick={() => setTab(value)}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
        tab === value
          ? "bg-amber-100/80 dark:bg-amber/15 text-amber-800 dark:text-amber"
          : "text-black/45 dark:text-white/45 hover:text-black/75 dark:hover:text-white/75 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
      }`}
    >
      <Icon size={11} strokeWidth={2.2} />
      <span>{label}</span>
      {count != null && count > 0 && (
        <span className="text-[9px] opacity-60 font-mono">{count}</span>
      )}
    </button>
  );

  const previewHeight = expanded ? "min(72vh, 720px)" : "320px";

  return (
    <div className="pm-fade-in my-2 rounded-xl overflow-hidden border border-black/[0.08] dark:border-white/[0.08] bg-white/55 dark:bg-black/35 backdrop-blur-sm shadow-[0_2px_8px_-3px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_12px_-3px_rgba(0,0,0,0.4)]">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-black/[0.05] dark:border-white/[0.05] bg-gradient-to-b from-black/[0.012] to-transparent dark:from-white/[0.012]">
        <div className="flex items-center gap-1 mr-1">
          <span className="w-2 h-2 rounded-full bg-red-400/70" />
          <span className="w-2 h-2 rounded-full bg-amber-400/70" />
          <span className="w-2 h-2 rounded-full bg-emerald-400/70" />
        </div>
        <span className="text-[11px] font-semibold text-black/75 dark:text-white/75 truncate flex-1">
          {args.title ?? "Untitled"}
        </span>
        {args.framework === "tailwind" && (
          <span className="text-[8.5px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400">
            Tailwind
          </span>
        )}
        {status === "running" && (
          <Loader2 size={11} className="animate-spin text-amber-500" />
        )}
        {status === "done" && onRefine && (
          <button
            onClick={onRefine}
            title="Critique and refine design"
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-amber-700 dark:text-amber bg-amber-50/80 dark:bg-amber/10 hover:bg-amber-100/80 dark:hover:bg-amber/15 ring-1 ring-amber-200/60 dark:ring-amber/20 transition-all"
          >
            <Wand2 size={9} strokeWidth={2.2} />
            <span>Refine</span>
          </button>
        )}
        {saveState === "saving" && (
          <span className="text-[9.5px] text-black/35 dark:text-white/35 italic">Saving…</span>
        )}
        {saveState === "saved" && savedDocId && (
          <button
            onClick={() => {
              const url = window.location.pathname.match(/\/projects\/([^/]+)/);
              if (url) router.push(`/projects/${url[1]}/docs/${savedDocId}`);
            }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-500/10 ring-1 ring-emerald-200/60 dark:ring-emerald-500/20 hover:bg-emerald-100/80 transition-all"
            title="Open in editor"
          >
            <FolderOpen size={9} strokeWidth={2.2} />
            <span>Saved to Designs</span>
          </button>
        )}
        {saveState === "error" && (
          <span className="text-[9.5px] text-red-500 italic">Save failed</span>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-1 rounded hover:bg-black/[0.04] dark:hover:bg-white/[0.04] text-black/50 dark:text-white/50"
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
        </button>
        <button
          onClick={openInNewTab}
          className="p-1 rounded hover:bg-black/[0.04] dark:hover:bg-white/[0.04] text-black/50 dark:text-white/50"
          title="Open in new tab"
        >
          <ExternalLink size={11} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-black/[0.04] dark:border-white/[0.04]">
        <TabBtn value="preview" label="Preview" icon={Eye} />
        <TabBtn value="html" label="HTML" icon={Code2} count={args.html?.length ?? 0} />
        {args.css && <TabBtn value="css" label="CSS" icon={Code2} count={args.css.length} />}
        {args.js && <TabBtn value="js" label="JS" icon={Code2} count={args.js.length} />}
        <div className="ml-auto" />
        {tab !== "preview" && (
          <button
            onClick={() => copy(tab)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-medium text-black/55 dark:text-white/55 hover:text-amber-700 dark:hover:text-amber hover:bg-amber-50/50 dark:hover:bg-amber/10 transition-all"
          >
            {copied === tab ? (
              <>
                <Check size={10} className="text-emerald-500" strokeWidth={2.5} />
                Copied
              </>
            ) : (
              <>
                <Copy size={10} /> Copy
              </>
            )}
          </button>
        )}
      </div>

      {/* Body */}
      {tab === "preview" ? (
        <div
          className="bg-white"
          style={{ height: previewHeight }}
        >
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            title={args.title ?? "Preview"}
            className="w-full h-full border-0 bg-white"
          />
        </div>
      ) : (
        <pre
          className="overflow-auto thin-scroll text-[11.5px] leading-relaxed font-mono p-3 bg-black/[0.025] dark:bg-black/30 text-black/80 dark:text-white/80 m-0 whitespace-pre"
          style={{ maxHeight: expanded ? "min(72vh, 720px)" : "320px" }}
        >
          {codeFor(tab) || <span className="italic opacity-50">Empty</span>}
        </pre>
      )}
    </div>
  );
}
