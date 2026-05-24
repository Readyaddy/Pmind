"use client";

import { useState } from "react";
import { Check, X, ChevronRight, FilePlus, Pencil, FolderPlus, Lock, Lightbulb, Rocket, GitBranch } from "lucide-react";
import type { ToolCall } from "./ToolCallBlock";

const TOOL_META: Record<string, { label: string; icon: React.ElementType }> = {
  create_doc:         { label: "Create document",   icon: FilePlus },
  edit_doc:           { label: "Edit document",     icon: Pencil },
  create_folder:      { label: "Create folder",     icon: FolderPlus },
  save_opportunity:   { label: "Save opportunity",  icon: Lightbulb },
  promote_to_feature: { label: "Promote to feature", icon: Rocket },
  create_jira_issue:  { label: "Create Jira issue", icon: GitBranch },
  create_jira_sprint: { label: "Create Jira sprint", icon: GitBranch },
};

function previewArgs(name: string, args: Record<string, unknown>): string {
  if (name === "create_doc") return String(args.title ?? "(untitled)");
  if (name === "create_folder") return String(args.name ?? "(unnamed)");
  if (name === "edit_doc") return `doc ${String(args.doc_id ?? "?")}`;
  if (name === "save_opportunity") return String(args.title ?? "(untitled opportunity)");
  if (name === "promote_to_feature") {
    const ids = Array.isArray(args.opportunity_ids) ? (args.opportunity_ids as unknown[]).length : 0;
    return `${String(args.name ?? "(unnamed feature)")} · ${ids} opportunity(ies)`;
  }
  if (name === "create_jira_issue") {
    const parts = [String(args.project_key ?? ""), String(args.title ?? "(untitled)")].filter(Boolean);
    if (args.issue_type) parts.push(String(args.issue_type));
    return parts.join(" · ");
  }
  if (name === "create_jira_sprint") {
    return `${String(args.name ?? "(unnamed sprint)")} · board ${String(args.board_id ?? "?")}`;
  }
  return JSON.stringify(args);
}

export default function PermissionPrompt({
  call,
  onApprove,
  onDeny,
  resolved,
}: {
  call: ToolCall;
  onApprove: (callId: string) => void;
  onDeny: (callId: string, reason?: string) => void;
  resolved?: "approved" | "denied" | null;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const meta = TOOL_META[call.name] ?? { label: call.name, icon: Lock };
  const Icon = meta.icon;

  const bodyPreview =
    call.name === "create_jira_issue"
      ? [
          call.args.issue_type ? `Type: ${call.args.issue_type}` : "",
          call.args.priority   ? `Priority: ${call.args.priority}` : "",
          call.args.parent_key ? `Parent: ${call.args.parent_key}` : "",
          call.args.description
            ? `\nDescription:\n${call.args.description}`
            : "",
        ].filter(Boolean).join("  ·  ")
    : call.name === "create_jira_sprint"
      ? [
          call.args.goal        ? `Goal: ${call.args.goal}` : "",
          call.args.start_date  ? `Start: ${call.args.start_date}` : "",
          call.args.end_date    ? `End: ${call.args.end_date}` : "",
        ].filter(Boolean).join("  ·  ")
    : call.name === "create_doc" || call.name === "edit_doc"
      ? String((call.args.content as string) ?? (call.args.new_content as string) ?? "")
      : call.name === "save_opportunity"
      ? [
          call.args.problem ? `Problem: ${call.args.problem}` : "",
          call.args.proposed_solution ? `\nDirection: ${call.args.proposed_solution}` : "",
          [
            call.args.reach != null ? `Reach ${call.args.reach}` : null,
            call.args.impact != null ? `Impact ${call.args.impact}` : null,
            call.args.confidence != null ? `Conf ${call.args.confidence}` : null,
            call.args.effort != null ? `Effort ${call.args.effort}` : null,
          ].filter(Boolean).length
            ? `\n\nScore — ${[
                call.args.reach != null ? `R${call.args.reach}` : null,
                call.args.impact != null ? `I${call.args.impact}` : null,
                call.args.confidence != null ? `C${call.args.confidence}` : null,
                call.args.effort != null ? `E${call.args.effort}` : null,
              ].filter(Boolean).join(" · ")}`
            : "",
          call.args.risks ? `\n\nRisks: ${call.args.risks}` : "",
          Array.isArray(call.args.evidence_insight_ids)
            ? `\n\nEvidence: ${(call.args.evidence_insight_ids as unknown[]).length} customer quote(s)`
            : "",
        ].join("")
      : "";

  if (resolved === "approved") {
    return (
      <div className="pm-fade-in my-1.5 rounded-xl border border-emerald-200/60 dark:border-emerald-700/30 bg-emerald-50/60 dark:bg-emerald-900/15 px-3 py-2 flex items-center gap-2">
        <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-500/15 flex-shrink-0">
          <Check size={11} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
        </span>
        <span className="text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold">
          Approved · {meta.label.toLowerCase()}
        </span>
      </div>
    );
  }

  if (resolved === "denied") {
    return (
      <div className="pm-fade-in my-1.5 rounded-xl border border-red-200/60 dark:border-red-700/30 bg-red-50/60 dark:bg-red-900/15 px-3 py-2 flex items-center gap-2">
        <span className="flex items-center justify-center w-5 h-5 rounded-md bg-red-100 dark:bg-red-500/15 flex-shrink-0">
          <X size={11} className="text-red-600 dark:text-red-400" strokeWidth={2.5} />
        </span>
        <span className="text-[11px] text-red-800 dark:text-red-300 font-semibold">
          Denied · {meta.label.toLowerCase()}
        </span>
      </div>
    );
  }

  return (
    <div className="pm-fade-in my-2 rounded-xl overflow-hidden relative bg-gradient-to-br from-amber-50/80 to-amber-100/40 dark:from-amber/[0.10] dark:to-amber/[0.04] border border-amber-300/60 dark:border-amber/30 shadow-[0_4px_16px_-6px_rgba(217,119,6,0.18)] dark:shadow-[0_4px_20px_-6px_rgba(217,119,6,0.30)]">
      {/* subtle accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 dark:from-amber/70 dark:via-amber/90 dark:to-amber" />

      <div className="px-4 py-3 pl-[18px]">
        <div className="flex items-start gap-2 mb-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber/15 ring-1 ring-amber-200/70 dark:ring-amber/25 flex-shrink-0 mt-0.5">
            <Lock size={11} className="text-amber-700 dark:text-amber" strokeWidth={2.5} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber leading-none">
              Permission needed
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <Icon size={11} className="text-black/55 dark:text-white/60 flex-shrink-0" />
              <span className="text-[12.5px] font-semibold text-black/85 dark:text-white/90 truncate">
                {meta.label}
              </span>
            </div>
            <div className="text-[11px] text-black/55 dark:text-white/55 truncate mt-0.5 font-mono">
              {previewArgs(call.name, call.args)}
            </div>
          </div>
        </div>

        {bodyPreview && (
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber/80 hover:text-amber-900 dark:hover:text-amber transition-colors -mt-0.5 mb-1.5"
          >
            <ChevronRight size={9} className={`transition-transform ${showDetails ? "rotate-90" : ""}`} />
            {showDetails ? "Hide preview" : "Preview content"}
          </button>
        )}

        {showDetails && bodyPreview && (
          <pre className="text-[11px] text-black/65 dark:text-white/60 bg-white/70 dark:bg-black/30 border border-amber-200/40 dark:border-amber/15 rounded-lg p-2.5 whitespace-pre-wrap max-h-44 overflow-y-auto thin-scroll font-mono leading-relaxed pm-fade-in">
            {bodyPreview.length > 2000 ? bodyPreview.slice(0, 2000) + "\n…" : bodyPreview}
          </pre>
        )}

        <div className="flex items-center gap-2 mt-2.5">
          <button
            onClick={() => onApprove(call.id)}
            className="amber-grad flex items-center gap-1.5 text-[11.5px] font-semibold px-3 py-1.5 rounded-lg text-white transition-all hover-lift"
          >
            <Check size={11} strokeWidth={3} /> Approve
          </button>
          <button
            onClick={() => onDeny(call.id)}
            className="flex items-center gap-1.5 text-[11.5px] font-medium px-3 py-1.5 rounded-lg bg-white/60 dark:bg-white/5 hover:bg-white/90 dark:hover:bg-white/10 text-black/65 dark:text-white/65 ring-1 ring-black/5 dark:ring-white/10 transition-colors"
          >
            <X size={11} strokeWidth={2.5} /> Deny
          </button>
        </div>
      </div>
    </div>
  );
}
