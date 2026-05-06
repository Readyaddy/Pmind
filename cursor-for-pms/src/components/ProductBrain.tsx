"use client";

import { useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useProductBrain } from "@/store/productBrain";
import { useCustomAuth } from "@/hooks/useCustomAuth";
import { Brain } from "lucide-react";

export default function ProductBrain({ projectId: projectIdProp }: { projectId?: string }) {
  const params = useParams();
  const projectId = projectIdProp ?? (params?.projectId as string | undefined);
  const { getContext, setContext } = useProductBrain();
  const context = projectId ? getContext(projectId) : "";
  const { userId } = useCustomAuth();
  const API = process.env.NEXT_PUBLIC_API_URL;

  const authH = useCallback(
    () => ({ Authorization: `Bearer ${userId}`, "Content-Type": "application/json" }),
    [userId]
  );

  // Seed from DB on mount if localStorage is empty
  useEffect(() => {
    if (!projectId || !userId) return;
    if (getContext(projectId)) return; // already have local value
    fetch(`${API}/context/${projectId}/context`, { headers: authH() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.content) setContext(projectId, data.content);
      })
      .catch(() => {});
  }, [projectId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced save to DB on change
  useEffect(() => {
    if (!projectId || !userId || context === undefined) return;
    const t = setTimeout(() => {
      fetch(`${API}/context/${projectId}/context`, {
        method: "PUT",
        headers: authH(),
        body: JSON.stringify({ content: context }),
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [context, projectId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (value: string) => {
    if (projectId) setContext(projectId, value);
  };

  return (
    <div className="w-72 glass-pane h-full flex flex-col rounded-2xl shadow-2xl flex-shrink-0 transition-colors relative z-10">
      <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center gap-3">
        <Brain size={18} className="text-amber-700 dark:text-amber dark:amber-glow" />
        <span className="font-serif tracking-[0.2em] uppercase text-[11px] font-bold text-black/80 dark:text-ivory">
          Product Brain
        </span>
        {context && (
          <span className="ml-auto text-[9px] font-bold uppercase tracking-widest bg-amber-50 dark:bg-amber/10 text-amber-800 dark:text-amber px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber/20 dark:amber-glow">
            Active
          </span>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col gap-4 overflow-y-auto">
        <p className="text-[13px] text-black/60 dark:text-white/60 leading-relaxed font-light">
          Paste your product strategy, target user, roadmap priorities, or any context the AI should
          know. It&apos;s injected into every AI call.
        </p>
        <textarea
          value={context}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={
            "Paste your product context here...\n\nExamples:\n- Product strategy doc\n- Target user description\n- Current roadmap priorities\n- Key metrics you're optimizing for"
          }
          className="flex-1 text-[13px] leading-relaxed border border-black/10 dark:border-white/10 rounded-xl p-4 resize-none bg-white/50 dark:bg-black/20 text-black dark:text-ivory focus:outline-none focus:ring-1 focus:ring-amber-500 dark:focus:ring-amber/50 transition-colors min-h-[300px] shadow-inner"
        />
        <p className="text-[10px] tracking-widest font-medium text-black/40 dark:text-white/40 uppercase text-center mt-2">
          {context.length > 0 ? `${context.length} chars · injected · synced` : "Empty · Generic output"}
        </p>
      </div>
    </div>
  );
}
