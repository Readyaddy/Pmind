"use client";

import { useParams, useRouter } from "next/navigation";
import { useCustomAuth } from "@/hooks/useCustomAuth";
import { useEffect, useRef, useState } from "react";
import {
  FileText, ArrowRight, Upload,
  Settings2, CheckCircle2,
  Pencil, Check, X, BookOpen,
  Sparkles, ChevronDown, Command,
} from "lucide-react";
import KnowledgeBase from "@/components/KnowledgeBase";
import TodaySchedule from "@/components/TodaySchedule";

interface KnowledgeDocument {
  id: string;
  filename: string;
  file_type: string;
  created_at: string;
  discovery_value?: "high" | "medium" | "low";
  discovery_note?: string;
  doc_type?: string;
}

interface IntegrationStatus {
  jira:   { connected: boolean; domain?: string; email?: string };
  linear: { connected: boolean };
}

export default function ProjectHomePage() {
  const params  = useParams();
  const projectId = params?.projectId as string;
  const router  = useRouter();
  const { userId } = useCustomAuth();

  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocument[]>([]);
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

    fetch(`${API}/knowledge/?project_id=${projectId}`, {
      headers: { Authorization: `Bearer ${userId}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(setKnowledgeDocs)
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
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  const integrationsConnected =
    (integrations.jira.connected ? 1 : 0) + (integrations.linear.connected ? 1 : 0);

  const stats = [
    { label: "Files",   value: knowledgeDocs.length },
    { label: "Active",  value: discoveryCounts.total },
    { label: "Shipped", value: discoveryCounts.committed },
  ];

  return (
    <div className="h-full overflow-y-auto thin-scroll">
      <div className="px-6 sm:px-10 py-12 max-w-5xl mx-auto flex flex-col gap-8">

        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="pm-fade-in flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <p className="editorial-eyebrow mb-2">{greeting}</p>
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

          {/* Quick stats — at-a-glance, so the cards below can stay quiet */}
          <div className="flex items-stretch gap-2.5 shrink-0">
            {stats.map((s) => (
              <div
                key={s.label}
                className="glass-inset rounded-xl px-4 py-2.5 flex flex-col items-center justify-center min-w-[72px]"
              >
                <span className="text-[20px] font-semibold leading-none tabular-nums text-black/80 dark:text-white/85">
                  {s.value}
                </span>
                <span className="mono-meta mt-1.5 !text-[9.5px] uppercase tracking-[0.14em] !text-black/40 dark:!text-white/35">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </header>

        {/* ── Primary action + Discovery ─────────────────────────── */}
        <section className="grid gap-4 lg:grid-cols-5 pm-fade-in" style={{ animationDelay: "60ms" }}>
          {/* New Document — primary */}
          <button
            onClick={createDoc}
            className="amber-grad amber-glow hover-lift lg:col-span-3 flex items-center gap-5 px-7 py-5 rounded-2xl text-white text-left group"
          >
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0 ring-1 ring-white/25">
              <FileText size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[16px] leading-tight">New Document</p>
              <p className="text-[13px] text-white/65 mt-0.5">PRD, brief, update or research — start with AI</p>
            </div>
            <span className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-white/55 bg-white/15 rounded-lg px-2 py-1 shrink-0">
              <Command size={11} /> K
            </span>
            <ArrowRight
              size={18}
              className="text-white/40 group-hover:translate-x-1 group-hover:text-white/75 transition-all shrink-0"
            />
          </button>

          {/* Discovery — secondary */}
          <button
            onClick={() => router.push(`/projects/${projectId}/discovery`)}
            className="glass-pane hover-lift lg:col-span-2 flex items-center gap-4 px-5 py-5 rounded-2xl text-left group transition-all hover:border-amber-300/50 dark:hover:border-amber/30"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber/8 flex items-center justify-center shrink-0">
              <Sparkles size={18} className="text-amber-500 dark:text-amber/80" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-[15px] text-black/80 dark:text-white/80 leading-tight">Discovery</p>
                {discoveryCounts.shortlisted > 0 && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber/15 text-amber-700 dark:text-amber">
                    {discoveryCounts.shortlisted}
                  </span>
                )}
              </div>
              <p className="text-[12.5px] text-black/35 dark:text-white/35 mt-0.5 truncate">
                {discoveryCounts.total > 0
                  ? `${discoveryCounts.total} active · ${discoveryCounts.committed} committed`
                  : "What to build next"}
              </p>
            </div>
            <ArrowRight
              size={16}
              className="text-black/15 dark:text-white/15 group-hover:translate-x-0.5 group-hover:text-amber-500 dark:group-hover:text-amber transition-all shrink-0"
            />
          </button>
        </section>

        {/* ── Today's schedule ───────────────────────────────────── */}
        <div className="pm-fade-in [&>div]:mb-0" style={{ animationDelay: "100ms" }}>
          <TodaySchedule />
        </div>

        {/* ── Knowledge Base + Integrations grid ─────────────────── */}
        <section className="grid gap-5 lg:grid-cols-3 pm-fade-in" style={{ animationDelay: "140ms" }}>

          {/* Knowledge Base — wider column */}
          <div className="glass-pane rounded-2xl overflow-hidden lg:col-span-2 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.05] dark:border-white/[0.05]">
              <div className="flex items-center gap-2">
                <BookOpen size={14} className="text-black/30 dark:text-white/30" />
                <span className="text-[13px] font-medium text-black/55 dark:text-white/50">Knowledge Base</span>
                {knowledgeDocs.length > 0 && (
                  <span className="text-[11px] text-black/25 dark:text-white/20">
                    {knowledgeDocs.length} {knowledgeDocs.length === 1 ? "file" : "files"}
                  </span>
                )}
              </div>
              <KnowledgeBase projectId={projectId} compact />
            </div>

            <div className="p-4 flex-1">
              {knowledgeDocs.length === 0 ? (
                <div className="glass-inset rounded-xl py-12 flex flex-col items-center gap-3 text-center h-full justify-center">
                  <div className="w-10 h-10 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] flex items-center justify-center">
                    <Upload size={17} className="text-black/20 dark:text-white/20" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-black/40 dark:text-white/35">No files yet</p>
                    <p className="text-[12px] text-black/25 dark:text-white/20 mt-1 max-w-[260px] leading-relaxed">
                      Upload PDFs, CSVs, or research docs — the AI searches them on every request.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {knowledgeDocs.map((doc, i) => (
                    <button
                      key={doc.id}
                      onClick={() => router.push(`/projects/${projectId}/knowledge/${doc.id}`)}
                      className="glass-inset hover-lift group flex items-center gap-3.5 px-4 py-3 rounded-xl text-left transition-all hover:border-amber-200/70 dark:hover:border-amber/25 pm-fade-in"
                      style={{ animationDelay: `${160 + i * 30}ms` }}
                    >
                      <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber/8 flex items-center justify-center shrink-0">
                        <FileText size={14} className="text-amber-500 dark:text-amber/70" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-black/75 dark:text-white/75 truncate leading-tight">
                          {doc.filename}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <p className="text-[11px] text-black/30 dark:text-white/25">
                            {new Date(doc.created_at).toLocaleDateString("en-US", {
                              month: "short", day: "numeric",
                            })}
                          </p>
                          {doc.discovery_value && (
                            <span
                              className={`text-[10px] font-medium px-1.5 py-px rounded border ${
                                doc.discovery_value === "high"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-400 dark:border-emerald-400/20"
                                  : doc.discovery_value === "medium"
                                  ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-400/10 dark:text-blue-400 dark:border-blue-400/20"
                                  : "bg-black/[0.03] text-black/35 border-black/8 dark:bg-white/[0.03] dark:text-white/30 dark:border-white/8"
                              }`}
                              title={doc.discovery_note}
                            >
                              {doc.doc_type || (doc.discovery_value === "high" ? "Interviews" : doc.discovery_value === "medium" ? "Research" : "Reference")}
                            </span>
                          )}
                        </div>
                      </div>
                      <ArrowRight
                        size={13}
                        className="text-black/10 dark:text-white/10 group-hover:text-amber-500 dark:group-hover:text-amber/60 transition-colors shrink-0"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Integrations — narrow column */}
          <div className="glass-pane rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.05] dark:border-white/[0.05]">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-black/55 dark:text-white/50">Integrations</span>
                <span className="text-[11px] text-black/25 dark:text-white/20">{integrationsConnected}/2</span>
              </div>
              <button
                onClick={() => router.push(`/projects/${projectId}/settings`)}
                className="flex items-center gap-1.5 text-[12px] text-black/30 dark:text-white/30 hover:text-black/60 dark:hover:text-white/60 transition-colors"
              >
                <Settings2 size={12} />
                Manage
              </button>
            </div>

            <div className="p-4 flex flex-col gap-2 flex-1">
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
