"use client";

import { useParams, useRouter } from "next/navigation";
import { useCustomAuth } from "@/hooks/useCustomAuth";
import { useEffect, useRef, useState } from "react";
import {
  FileText, ArrowRight,
  Settings2, CheckCircle2,
  Pencil, Check, X,
  Sparkles, ChevronDown, MessageSquare,
} from "lucide-react";
import TodaySchedule from "@/components/TodaySchedule";

interface IntegrationStatus {
  jira:   { connected: boolean; domain?: string; email?: string };
  linear: { connected: boolean };
}

export default function ProjectHomePage() {
  const params  = useParams();
  const projectId = params?.projectId as string;
  const router  = useRouter();
  const { userId } = useCustomAuth();

  const [projectName,   setProjectName]   = useState<string>("Project");
  const [editingName,   setEditingName]   = useState(false);
  const [nameInput,     setNameInput]     = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [integrations, setIntegrations]  = useState<IntegrationStatus>({
    jira:   { connected: false },
    linear: { connected: false },
  });
  const [guideOpen, setGuideOpen] = useState(false);
  const [discoveryCounts, setDiscoveryCounts] = useState<{ total: number; shortlisted: number; committed: number }>({ total: 0, shortlisted: 0, committed: 0 });

  const API = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    setGuideOpen(localStorage.getItem("pmind_guide_dismissed") !== "1");
  }, []);

  useEffect(() => {
    if (!userId || !projectId) return;

    fetch(`${API}/projects/`, { headers: { Authorization: `Bearer ${userId}` } })
      .then(r => r.json())
      .then((projects: { id: string; name: string }[]) => {
        const p = projects.find(p => p.id === projectId);
        if (p) setProjectName(p.name);
      })
      .catch(() => {});

    fetch(`${API}/integrations/status`, { headers: { Authorization: `Bearer ${userId}` } })
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (s) setIntegrations(s); })
      .catch(() => {});

    fetch(`${API}/discovery/opportunities?project_id=${projectId}`, {
      headers: { Authorization: `Bearer ${userId}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then((opps: { status: string }[]) => {
        const active = opps.filter(o => o.status !== "discarded");
        setDiscoveryCounts({
          total:       active.length,
          shortlisted: opps.filter(o => o.status === "shortlisted").length,
          committed:   opps.filter(o => o.status === "committed").length,
        });
      })
      .catch(() => {});
  }, [userId, projectId, API]);

  const startEditName = () => {
    setNameInput(projectName);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  };

  const commitName = async () => {
    setEditingName(false);
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === projectName) return;
    setProjectName(trimmed);
    await fetch(`${API}/projects/${projectId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${userId}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    }).catch(() => {});
  };

  const createDoc = async () => {
    if (!userId || !projectId) return;
    const res = await fetch(`${API}/projects/${projectId}/documents/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userId}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const doc = await res.json();
      window.dispatchEvent(new CustomEvent("pmind:refresh-tree", { detail: { projectId } }));
      router.push(`/projects/${projectId}/docs/${doc.id}`);
    }
  };

  // ── Derived display values ────────────────────────────────────────────────
  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  const integrationsConnected =
    (integrations.jira.connected ? 1 : 0) + (integrations.linear.connected ? 1 : 0);

  return (
    <div className="h-full overflow-y-auto thin-scroll">
      <div className="px-6 sm:px-10 py-14 max-w-4xl mx-auto flex flex-col gap-10">

        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="pm-fade-in">
          <div className="min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={e => {
                    if (e.key === "Enter")  { e.preventDefault(); commitName(); }
                    if (e.key === "Escape") { e.preventDefault(); setEditingName(false); }
                  }}
                  className="editorial-display bg-transparent border-b-2 border-amber-400 dark:border-amber outline-none min-w-0 leading-none pb-0.5"
                />
                <button
                  onClick={commitName}
                  className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber/15 text-amber-700 dark:text-amber hover:bg-amber-200 dark:hover:bg-amber/25 transition-colors"
                >
                  <Check size={14} strokeWidth={2.5} />
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-black/35 dark:text-white/35 transition-colors"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="editorial-display leading-none truncate">{projectName}</h1>
                <button
                  onClick={startEditName}
                  title="Rename project"
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.06] text-black/30 dark:text-white/30 hover:text-black/60 dark:hover:text-white/60 transition-all"
                >
                  <Pencil size={13} strokeWidth={2} />
                </button>
              </div>
            )}
            <p className="text-[13px] text-black/40 dark:text-white/35 mt-2.5">{dateLabel}</p>
          </div>
        </header>

        {/* ── Quick actions — what do you want to work on? ───────── */}
        <section className="grid gap-4 sm:grid-cols-3 pm-fade-in" style={{ animationDelay: "60ms" }}>
          {/* Ask the co-pilot — primary, the AI-native heart of the product */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("pmind:prefill-chat", { detail: { text: "" } }))}
            className="amber-grad amber-glow hover-lift flex flex-col p-5 rounded-2xl text-white text-left group min-h-[150px]"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center ring-1 ring-white/25">
              <MessageSquare size={18} className="text-white" />
            </div>
            <div className="mt-auto pt-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-[15px] leading-tight">Ask your co-pilot</p>
                <ArrowRight size={16} className="text-white/40 group-hover:translate-x-1 group-hover:text-white/80 transition-all" />
              </div>
              <p className="text-[12.5px] text-white/65 mt-1">Search research, plan, summarize</p>
            </div>
          </button>

          {/* Discovery */}
          <button
            onClick={() => router.push(`/projects/${projectId}/discovery`)}
            className="glass-pane hover-lift flex flex-col p-5 rounded-2xl text-left group min-h-[150px] transition-all hover:border-amber-300/50 dark:hover:border-amber/30"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber/8 flex items-center justify-center">
              <Sparkles size={18} className="text-amber-500 dark:text-amber/80" />
            </div>
            <div className="mt-auto pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-[15px] text-black/80 dark:text-white/80 leading-tight">Discovery</p>
                  {discoveryCounts.shortlisted > 0 && (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber/15 text-amber-700 dark:text-amber">
                      {discoveryCounts.shortlisted}
                    </span>
                  )}
                </div>
                <ArrowRight size={16} className="text-black/15 dark:text-white/15 group-hover:translate-x-0.5 group-hover:text-amber-500 dark:group-hover:text-amber transition-all" />
              </div>
              <p className="text-[12.5px] text-black/35 dark:text-white/35 mt-1 truncate">
                {discoveryCounts.total > 0
                  ? `${discoveryCounts.total} active · ${discoveryCounts.committed} committed`
                  : "Turn research into opportunities"}
              </p>
            </div>
          </button>

          {/* Draft with AI */}
          <button
            onClick={createDoc}
            className="glass-pane hover-lift flex flex-col p-5 rounded-2xl text-left group min-h-[150px] transition-all hover:border-amber-300/50 dark:hover:border-amber/30"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber/8 flex items-center justify-center">
              <FileText size={18} className="text-amber-500 dark:text-amber/80" />
            </div>
            <div className="mt-auto pt-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-[15px] text-black/80 dark:text-white/80 leading-tight">Draft with AI</p>
                <ArrowRight size={16} className="text-black/15 dark:text-white/15 group-hover:translate-x-0.5 group-hover:text-amber-500 dark:group-hover:text-amber transition-all" />
              </div>
              <p className="text-[12.5px] text-black/35 dark:text-white/35 mt-1">PRD, brief, update or research</p>
            </div>
          </button>
        </section>

        {/* ── Today's schedule ───────────────────────────────────── */}
        <div className="pm-fade-in [&>div]:mb-0" style={{ animationDelay: "100ms" }}>
          <TodaySchedule />
        </div>

        {/* ── Integrations ───────────────────────────────────────── */}
        <section className="glass-pane rounded-2xl overflow-hidden pm-fade-in" style={{ animationDelay: "140ms" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.05] dark:border-white/[0.05]">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-black/55 dark:text-white/50">Integrations</span>
                <span className="text-[11px] text-black/25 dark:text-white/20">{integrationsConnected}/2 connected</span>
              </div>
              <button
                onClick={() => router.push(`/projects/${projectId}/settings`)}
                className="flex items-center gap-1.5 text-[12px] text-black/30 dark:text-white/30 hover:text-black/60 dark:hover:text-white/60 transition-colors"
              >
                <Settings2 size={12} />
                Manage
              </button>
            </div>

            <div className="p-4 grid sm:grid-cols-2 gap-2">
              {/* Jira */}
              <div className="glass-inset flex items-center gap-3.5 px-4 py-3 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                  J
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-black/75 dark:text-white/75 leading-none">Jira</p>
                  {integrations.jira.domain && (
                    <p className="text-[11px] text-black/30 dark:text-white/25 truncate mt-0.5">
                      {integrations.jira.domain}
                    </p>
                  )}
                </div>
                {integrations.jira.connected ? (
                  <CheckCircle2 size={15} className="text-green-600 dark:text-green-400 shrink-0" />
                ) : (
                  <button
                    onClick={() => router.push(`/projects/${projectId}/settings`)}
                    className="text-[12px] font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0 transition-colors"
                  >
                    Connect
                  </button>
                )}
              </div>

              {/* Linear */}
              <div className="glass-inset flex items-center gap-3.5 px-4 py-3 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-[#5E6AD2] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                  L
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-black/75 dark:text-white/75 leading-none">Linear</p>
                </div>
                {integrations.linear.connected ? (
                  <CheckCircle2 size={15} className="text-green-600 dark:text-green-400 shrink-0" />
                ) : (
                  <button
                    onClick={() => router.push(`/projects/${projectId}/settings`)}
                    className="text-[12px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 transition-colors"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
        </section>

        {/* ── Getting Started — quiet, collapsible strip at the bottom ─ */}
        <div className="glass-pane rounded-2xl overflow-hidden pm-fade-in" style={{ animationDelay: "180ms" }}>
          <button
            onClick={() => {
              const next = !guideOpen;
              setGuideOpen(next);
              if (!next) localStorage.setItem("pmind_guide_dismissed", "1");
              else localStorage.removeItem("pmind_guide_dismissed");
            }}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={13} className="text-amber-500 dark:text-amber" />
              <span className="text-[13px] font-medium text-black/55 dark:text-white/50">Getting Started</span>
              <span className="text-[11px] text-black/25 dark:text-white/20">4 quick steps</span>
            </div>
            <ChevronDown
              size={13}
              className={`text-black/25 dark:text-white/25 transition-transform duration-200 ${guideOpen ? "" : "-rotate-90"}`}
            />
          </button>

          {guideOpen && (
            <div className="border-t border-black/[0.05] dark:border-white/[0.05] p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { n:"01", icon:"🧠", title:"Set up Product Brain", desc:"Add strategy & users once — AI uses it in every command." },
                  { n:"02", icon:"⌘",  title:"Press ⌘K in a doc",    desc:"Generate PRDs, tickets, briefs, updates, or custom prompts." },
                  { n:"03", icon:"💬", title:"Chat with your docs",  desc:"Ask the AI anything about the open document or @mention files." },
                  { n:"04", icon:"📚", title:"Upload to Knowledge Base", desc:"Add PDFs & interviews — AI searches them automatically." },
                ].map((item) => (
                  <div key={item.n} className="glass-inset rounded-xl px-3.5 py-3 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-black/25 dark:text-white/20">{item.n}</span>
                      <span className="text-sm leading-none">{item.icon}</span>
                    </div>
                    <p className="text-[12px] font-semibold text-black/70 dark:text-white/70 leading-snug">{item.title}</p>
                    <p className="text-[11px] text-black/40 dark:text-white/35 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
