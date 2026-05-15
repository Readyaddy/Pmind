"use client";

import { useMemo, useRef, useState, useEffect, type MutableRefObject } from "react";
import { Eye, Code2, Copy, Check, ExternalLink, Maximize2, Minimize2, Loader2, Wand2, FolderOpen, FileCode2 } from "lucide-react";
import { useRouter } from "next/navigation";

export interface PageDef {
  name: string;
  html: string;
  css?: string;
  js?: string;
}

export interface ArtifactArgs {
  title?: string;
  html?: string;
  css?: string;
  js?: string;
  framework?: "vanilla" | "tailwind";
  pages?: PageDef[];
}

type CodeTab = "preview" | "html" | "css" | "js";

function buildSrcDoc(
  { html, css, js, framework, title }: { html?: string; css?: string; js?: string; framework?: string; title?: string }
): string {
  const useTailwind = framework === "tailwind";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${(title ?? "Preview").replace(/[<>]/g, "")}</title>
<script>
/* In-memory storage polyfill — sandbox lacks allow-same-origin so
   real localStorage/sessionStorage throw SecurityError. Any third-party
   script (auth libs, analytics, etc.) gets a working ephemeral store. */
(function(){
  function makeStore(){
    var d={};
    return {
      getItem:function(k){return k in d?d[k]:null;},
      setItem:function(k,v){d[k]=String(v);},
      removeItem:function(k){delete d[k];},
      clear:function(){d={};},
      key:function(i){return Object.keys(d)[i]??null;},
      get length(){return Object.keys(d).length;}
    };
  }
  try{localStorage;}catch(e){
    try{Object.defineProperty(window,'localStorage',{value:makeStore(),writable:false});}catch(_){}
  }
  try{sessionStorage;}catch(e){
    try{Object.defineProperty(window,'sessionStorage',{value:makeStore(),writable:false});}catch(_){}
  }
})();
</script>
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
  const isMultiPage = Array.isArray(args.pages) && args.pages.length > 0;

  const [codeTab, setCodeTab] = useState<CodeTab>("preview");
  const [activePage, setActivePage] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<CodeTab | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedDocId, setSavedDocId] = useState<string | null>(existingDocId ?? null);
  const savedRef = useRef(false);
  const router = useRouter();

  // Auto-save once when status becomes "done".
  useEffect(() => {
    if (status !== "done" || savedRef.current || !projectId || !userId) return;
    if (!args.html && !isMultiPage) return;
    savedRef.current = true;
    saveDesign();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const saveDesign = async () => {
    setSaveState("saving");
    const API = process.env.NEXT_PUBLIC_API_URL;
    const targetDocId = existingDocIdRef?.current ?? existingDocId;
    try {
      if (targetDocId) {
        await fetch(`${API}/documents/${targetDocId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${userId}` },
          body: JSON.stringify({
            title: args.title ?? "Untitled Design",
            content: isMultiPage
              ? { _type: "design_multipage", pages: args.pages, framework: args.framework ?? "vanilla" }
              : { _type: "design", html: args.html ?? "", css: args.css ?? "", js: args.js ?? "", framework: args.framework ?? "vanilla" },
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
            html: isMultiPage ? (args.pages?.[0]?.html ?? "") : (args.html ?? ""),
            css: isMultiPage ? (args.pages?.[0]?.css ?? "") : (args.css ?? ""),
            js: isMultiPage ? (args.pages?.[0]?.js ?? "") : (args.js ?? ""),
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

  // Current page data (either active page from multi-page, or single-page args)
  const currentPage = isMultiPage
    ? (args.pages![activePage] ?? args.pages![0])
    : { html: args.html, css: args.css, js: args.js, name: args.title };

  const srcDoc = useMemo(
    () => buildSrcDoc({ ...currentPage, framework: args.framework, title: isMultiPage ? currentPage.name : args.title }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePage, args]
  );

  const codeFor = (t: CodeTab): string => {
    if (t === "html") return currentPage.html ?? "";
    if (t === "css") return currentPage.css ?? "";
    if (t === "js") return currentPage.js ?? "";
    return "";
  };

  const copy = async (t: CodeTab) => {
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
    value: CodeTab; label: string; icon: React.ElementType; count?: number;
  }) => (
    <button
      onClick={() => setCodeTab(value)}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
        codeTab === value
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

  const previewHeight = expanded ? "min(72vh, 720px)" : "380px";

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
        {isMultiPage && (
          <span className="text-[8.5px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400">
            {args.pages!.length} pages
          </span>
        )}
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

      {/* Multi-page file tabs */}
      {isMultiPage && (
        <div className="flex items-center gap-0.5 px-2 pt-1.5 pb-0 border-b border-black/[0.04] dark:border-white/[0.04] overflow-x-auto thin-scroll">
          {args.pages!.map((page, idx) => (
            <button
              key={idx}
              onClick={() => { setActivePage(idx); setCodeTab("preview"); }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-t-md text-[10.5px] font-semibold whitespace-nowrap border-b-2 transition-all ${
                activePage === idx
                  ? "border-amber-400 text-amber-800 dark:text-amber bg-amber-50/60 dark:bg-amber/10"
                  : "border-transparent text-black/40 dark:text-white/40 hover:text-black/65 dark:hover:text-white/65 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
              }`}
            >
              <FileCode2 size={9.5} strokeWidth={2} />
              {page.name}
            </button>
          ))}
        </div>
      )}

      {/* Code tabs (Preview / HTML / CSS / JS) */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-black/[0.04] dark:border-white/[0.04]">
        <TabBtn value="preview" label="Preview" icon={Eye} />
        <TabBtn value="html" label="HTML" icon={Code2} count={(currentPage.html ?? "").length} />
        {(currentPage.css) && <TabBtn value="css" label="CSS" icon={Code2} count={currentPage.css.length} />}
        {(currentPage.js) && <TabBtn value="js" label="JS" icon={Code2} count={currentPage.js.length} />}
        <div className="ml-auto" />
        {codeTab !== "preview" && (
          <button
            onClick={() => copy(codeTab)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-medium text-black/55 dark:text-white/55 hover:text-amber-700 dark:hover:text-amber hover:bg-amber-50/50 dark:hover:bg-amber/10 transition-all"
          >
            {copied === codeTab ? (
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
      {codeTab === "preview" ? (
        <div className="bg-white" style={{ height: previewHeight }}>
          <iframe
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            title={isMultiPage ? currentPage.name : (args.title ?? "Preview")}
            className="w-full h-full border-0 bg-white"
          />
        </div>
      ) : (
        <pre
          className="overflow-auto thin-scroll text-[11.5px] leading-relaxed font-mono p-3 bg-black/[0.025] dark:bg-black/30 text-black/80 dark:text-white/80 m-0 whitespace-pre"
          style={{ maxHeight: expanded ? "min(72vh, 720px)" : "380px" }}
        >
          {codeFor(codeTab) || <span className="italic opacity-50">Empty</span>}
        </pre>
      )}
    </div>
  );
}
