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
  payload?: unknown;
  // Gemini 2.5 thinking models attach a thought_signature to every function
  // call.  It must be echoed back on resume; we carry it opaquely as a string.
  _thought_sig?: string;
}

import { Sparkles, Zap, TrendingUp, Calendar, Database, GitBranch, Globe, LayoutTemplate } from "lucide-react";

const TOOL_META: Record<string, { label: string; icon: React.ElementType; verb: string }> = {
  search_kb:          { label: "Knowledge base",    icon: BookOpen,    verb: "Searching" },
  list_docs:          { label: "Project docs",      icon: FolderSearch, verb: "Listing" },
  read_doc:           { label: "Document",          icon: FileText,    verb: "Reading" },
  read:               { label: "Document",          icon: FileText,    verb: "Reading" },
  search_docs:        { label: "Project docs",      icon: Search,      verb: "Searching" },
  search_workspace:   { label: "Workspace",         icon: Search,      verb: "Searching" },
  create_doc:         { label: "New document",      icon: FilePlus,    verb: "Creating" },
  edit_doc:           { label: "Document",          icon: Pencil,      verb: "Updating" },
  create_folder:      { label: "New folder",        icon: FolderPlus,  verb: "Creating" },
  list_discovery_themes:   { label: "Themes",       icon: TrendingUp,  verb: "Loading" },
  list_discovery_insights: { label: "Insights",     icon: Sparkles,    verb: "Loading" },
  list_opportunities:      { label: "Opportunities",icon: Zap,         verb: "Loading" },
  save_opportunity:        { label: "Opportunity",  icon: Zap,         verb: "Saving" },
  list_jira_boards:        { label: "Jira boards",  icon: GitBranch,   verb: "Listing" },
  fetch_jira_sprint:       { label: "Jira sprint",  icon: GitBranch,   verb: "Loading" },
  search_jira:             { label: "Jira",          icon: GitBranch,   verb: "Searching" },
  get_jira_issue:          { label: "Jira issue",   icon: GitBranch,   verb: "Reading" },
  create_jira_issue:       { label: "Jira issue",   icon: GitBranch,   verb: "Creating" },
  create_jira_sprint:      { label: "Jira sprint",  icon: GitBranch,   verb: "Creating" },
  check_calendar:          { label: "Calendar",     icon: Calendar,    verb: "Checking" },
  render_ui:               { label: "UI",           icon: Globe,       verb: "Rendering" },
  render_diagram:          { label: "Diagram",      icon: LayoutTemplate, verb: "Drawing" },
  handoff_to_whiteboard:   { label: "Whiteboard",   icon: LayoutTemplate, verb: "Handing off to" },
  design_brief:            { label: "Design brief", icon: Globe,       verb: "Preparing" },
  analyze_data:            { label: "Data",         icon: Database,    verb: "Analyzing" },
  handoff_to_designer:     { label: "Designer",     icon: Globe,       verb: "Handing off to" },
  handoff_to_analyst:      { label: "Analyst",      icon: Database,    verb: "Handing off to" },
  handoff_to_pm:           { label: "PM Agent",     icon: FileText,    verb: "Handing off to" },
  handoff_to_opportunity:  { label: "Opportunity Agent", icon: Zap,    verb: "Handing off to" },
  handoff_to_calendar:     { label: "Calendar Agent", icon: Calendar,  verb: "Handing off to" },
};

/** Strip UUIDs and doc: / kb: prefixes to show human-readable text. */
function cleanArgValue(val: unknown): string {
  if (val == null) return "";
  const s = typeof val === "string" ? val : JSON.stringify(val);
  // Strip doc:/kb: prefixes and UUIDs (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  return s
    .replace(/^(doc|kb):/i, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || s.slice(0, 60);
}

function formatArg(val: unknown): string {
  const cleaned = cleanArgValue(val);
  return cleaned.length > 60 ? cleaned.slice(0, 60) + "…" : cleaned;
}

export default function ToolCallBlock({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_META[call.name] ?? { label: call.name.replace(/_/g, " "), icon: Search, verb: "Running" };
  const Icon = meta.icon;

  const argEntries = Object.entries(call.args || {});
  // Pick the most human-readable arg to show inline
  const primaryArg = argEntries.find(([k]) =>
    ["query", "title", "name", "jql", "issue_key", "source_id", "doc_id", "board_id", "intent"].includes(k)
  );
  const argSummary = primaryArg
    ? formatArg(primaryArg[1])
    : argEntries.filter(([, v]) => typeof v === "string" || typeof v === "number")
        .map(([, v]) => formatArg(v)).filter(Boolean).join(" · ");

  const isRunning = call.status === "running" || call.status === "approved";

  return (
    <div className="pm-fade-in rounded-xl overflow-hidden border border-black/[0.055] dark:border-white/[0.07] bg-black/[0.02] dark:bg-white/[0.03]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/[0.025] dark:hover:bg-white/[0.025] transition-colors group"
      >
        <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-100 dark:bg-amber/15 flex-shrink-0">
          <Icon size={11} className="text-amber-700 dark:text-amber" />
        </span>
        <span className="flex-1 min-w-0 flex items-center gap-2">
          {isRunning ? (
            <span className="text-[11.5px] font-medium pm-shimmer-text">
              {meta.verb} {meta.label.toLowerCase()}…
            </span>
          ) : (
            <span className="text-[11.5px] font-medium text-black/65 dark:text-white/65">
              {meta.label}
            </span>
          )}
          {argSummary && !isRunning && (
            <span className="text-[11px] text-black/35 dark:text-white/35 truncate">
              &quot;{argSummary}&quot;
            </span>
          )}
        </span>
        <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {isRunning && <Loader2 size={11} className="animate-spin text-amber-400" />}
          {call.status === "done" && <Check size={11} className="text-emerald-500" strokeWidth={2.5} />}
          {call.status === "error" && (
            <span className="text-[9px] text-red-500 font-bold uppercase tracking-wider">err</span>
          )}
          <ChevronRight
            size={10}
            className={`text-black/20 dark:text-white/20 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          />
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1.5 border-t border-black/5 dark:border-white/[0.06] space-y-2 pm-fade-in">
          {call.summary && (
            <p className="text-[11.5px] text-black/55 dark:text-white/50 leading-relaxed">{call.summary}</p>
          )}
          {call.sources && call.sources.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {call.sources.map((s) => {
                const SrcIcon = s.kind === "kb" ? BookOpen : FileText;
                return (
                  <span
                    key={s.id}
                    title={s.snippet}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber/10 text-amber-800 dark:text-amber text-[10px] max-w-[220px] ring-1 ring-amber-200/60 dark:ring-amber/20"
                  >
                    <SrcIcon size={9} className="flex-shrink-0 opacity-70" />
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
