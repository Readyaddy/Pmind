"use client";

import { useState } from "react";
import { Search, FileText, FolderSearch, BookOpen, Loader2, Check, ChevronRight, FilePlus, Pencil, FolderPlus } from "lucide-react";
import type { Source } from "./CitationChip";

export type ToolCallStatus =
  | "running"
  | "awaiting_permission"
  | "approved"
  | "denied"
  | "done"
  | "error";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  summary?: string;
  sources?: Source[];
  // Structured payload returned alongside summary/sources for tools that
  // produce richer output (e.g. critique_design).
  payload?: unknown;
}

const TOOL_META: Record<string, { label: string; icon: React.ElementType; verb: string }> = {
  search_kb:     { label: "Knowledge base",     icon: BookOpen,    verb: "Searching" },
  list_docs:     { label: "Project docs",       icon: FolderSearch, verb: "Listing" },
  read_doc:      { label: "Document",           icon: FileText,    verb: "Reading" },
  search_docs:   { label: "Project docs",       icon: Search,      verb: "Searching" },
  create_doc:    { label: "New document",       icon: FilePlus,    verb: "Creating" },
  edit_doc:      { label: "Document edit",      icon: Pencil,      verb: "Updating" },
  create_folder: { label: "New folder",         icon: FolderPlus,  verb: "Creating" },
};

function formatArg(val: unknown): string {
  if (typeof val === "string") return val.length > 60 ? val.slice(0, 60) + "…" : val;
  if (val == null) return "";
  return JSON.stringify(val);
}

export default function ToolCallBlock({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_META[call.name] ?? { label: call.name, icon: Search, verb: "Running" };
  const Icon = meta.icon;

  const argEntries = Object.entries(call.args || {});
  const primaryArg = argEntries.find(([k]) => ["query", "title", "doc_id", "name"].includes(k));
  const argSummary = primaryArg ? formatArg(primaryArg[1]) : argEntries.map(([, v]) => formatArg(v)).join(" · ");

  const isRunning = call.status === "running" || call.status === "approved";

  return (
    <div className="pm-fade-in my-1 rounded-lg glass-inset overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-black/[0.025] dark:hover:bg-white/[0.025] transition-colors group"
      >
        <ChevronRight
          size={10}
          className={`flex-shrink-0 text-black/30 dark:text-white/30 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
        <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-100/80 dark:bg-amber/15 flex-shrink-0">
          <Icon size={11} className="text-amber-700 dark:text-amber" />
        </span>
        <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
          {isRunning ? (
            <span className="text-[11px] font-semibold pm-shimmer-text">
              {meta.verb}…
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-black/70 dark:text-white/75">
              {meta.label}
            </span>
          )}
          {argSummary && (
            <span className="text-[11px] text-black/40 dark:text-white/40 truncate font-mono italic">
              {argSummary}
            </span>
          )}
        </span>
        <span className="ml-auto flex-shrink-0">
          {isRunning && <Loader2 size={11} className="animate-spin text-amber-500" />}
          {call.status === "done" && <Check size={12} className="text-emerald-500" strokeWidth={2.5} />}
          {call.status === "error" && (
            <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider">err</span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-2.5 pt-1 border-t border-black/5 dark:border-white/5 text-[11px] space-y-2 pm-fade-in">
          {call.summary && (
            <p className="text-black/60 dark:text-white/60 leading-relaxed">{call.summary}</p>
          )}
          {call.sources && call.sources.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {call.sources.map((s) => {
                const SrcIcon = s.kind === "kb" ? BookOpen : FileText;
                return (
                  <span
                    key={s.id}
                    title={s.snippet}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber/10 text-amber-800 dark:text-amber text-[10px] max-w-[200px] ring-1 ring-amber-200/60 dark:ring-amber/20"
                  >
                    <SrcIcon size={9} className="flex-shrink-0 opacity-80" />
                    <span className="truncate">{s.title}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
