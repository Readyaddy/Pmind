"use client";

import { useParams, useRouter } from "next/navigation";
import { useCustomAuth } from "@/hooks/useCustomAuth";
import { useEffect, useRef, useState } from "react";
import {
  FileText, FolderPlus, BookOpen, ArrowRight, Upload,
  Settings2, CheckCircle2, Plug, BookMarked, ChevronRight,
  Pencil, Check, X, Sparkles, ChevronDown,
} from "lucide-react";
import KnowledgeBase from "@/components/KnowledgeBase";
import TodaySchedule from "@/components/TodaySchedule";
import Link from "next/link";

interface KnowledgeDocument {
  id: string;
  filename: string;
  file_type: string;
  created_at: string;
}

interface IntegrationStatus {
  jira:   { connected: boolean; domain?: string; email?: string };
  linear: { connected: boolean };
}

interface Template {
  id: string;
  name: string;
  category: string;
  icon: string;
}

export default function ProjectHomePage() {
  const params = useParams();
  const projectId = params?.projectId as string;
  const router = useRouter();
  const { userId } = useCustomAuth();
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocument[]>([]);
  const [projectName, setProjectName] = useState<string>("Project");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [guideOpen, setGuideOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("pmind_guide_dismissed") !== "1";
  });
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    jira: { connected: false },
    linear: { connected: false },
  });
  const [templates, setTemplates] = useState<Template[]>([]);

  const API = process.env.NEXT_PUBLIC_API_URL;

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

    fetch(`${API}/templates/`)
      .then(r => r.ok ? r.json() : [])
      .then(setTemplates)
      .catch(() => {});
  }, [userId, projectId, API]);

  const applyTemplate = async (templateId: string) => {
    if (!userId || !projectId) return;
    const res = await fetch(`${API}/templates/${templateId}/apply?project_id=${projectId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userId}` },
    });
    if (res.ok) {
      const doc = await res.json();
      window.dispatchEvent(new CustomEvent("pmind:refresh-tree", { detail: { projectId } }));
      router.push(`/projects/${projectId}/docs/${doc.id}`);
    }
  };

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

  const bothConnected = integrations.jira.connected && integrations.linear.connected;

  return (
    <div className="relative h-full overflow-y-auto thin-scroll">

      {/* ── Ambient light orb ─────────────────────────────────── */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 w-[520px] h-[520px] rounded-full opacity-60 dark:opacity-40"
        style={{ background: "radial-gradient(circle, rgba(217,119,6,0.13) 0%, transparent 70%)", filter: "blur(80px)" }}
      />

      <div className="relative px-8 py-10 max-w-5xl mx-auto">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="mb-7 pm-fade-in">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-black/30 dark:text-white/30 mb-1.5">
            Project
          </p>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                ref={nameInputRef}
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onBlur={commitName}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); commitName(); }
                  if (e.key === "Escape") { e.preventDefault(); setEditingName(false); }
                }}
                className="text-[28px] font-serif font-bold tracking-tight text-black/85 dark:text-white/85 leading-none bg-transparent border-b-2 border-amber-400 dark:border-amber outline-none min-w-0 flex-1"
              />
              <button onClick={commitName} className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber/15 text-amber-700 dark:text-amber hover:bg-amber-200 dark:hover:bg-amber/25 transition-colors flex-shrink-0">
                <Check size={14} strokeWidth={2.5} />
              </button>
              <button onClick={() => setEditingName(false)} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-black/35 dark:text-white/35 transition-colors flex-shrink-0">
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-[28px] font-serif font-bold tracking-tight text-black/85 dark:text-white/85 leading-none">
                {projectName}
              </h1>
              <button
                onClick={startEditName}
                title="Rename project"
                className="p-1.5 rounded-lg hover:bg-black/[0.06] dark:hover:bg-white/[0.06] text-black/20 dark:text-white/20 hover:text-black/60 dark:hover:text-white/60 transition-all"
              >
                <Pencil size={13} strokeWidth={2} />
              </button>
            </div>
          )}
        </div>

        {/* ── Today's Schedule — full width ──────────────────── */}
        <div className="pm-fade-in" style={{ animationDelay: "60ms" }}>
          <TodaySchedule />
        </div>

        {/* ── Getting Started Guide ───────────────────────── */}
        <div className="glass-pane rounded-2xl overflow-hidden mb-7 pm-fade-in" style={{ animationDelay: "80ms" }}>
          {/* Header row */}
          <button
            onClick={() => {
              const next = !guideOpen;
              setGuideOpen(next);
              if (!next) localStorage.setItem("pmind_guide_dismissed", "1");
              else localStorage.removeItem("pmind_guide_dismissed");
            }}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={13} className="text-amber-500 dark:text-amber" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-black/50 dark:text-white/45">
                Getting Started
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/quickstart"
                onClick={e => e.stopPropagation()}
                className="text-[11px] font-semibold text-amber-600 dark:text-amber hover:underline underline-offset-2"
              >
                Full guide →
              </Link>
              <ChevronDown
                size={13}
                className={`text-black/30 dark:text-white/30 transition-transform duration-200 ${guideOpen ? "" : "-rotate-90"}`}
              />
            </div>
          </button>

          {/* Collapsible content */}
          {guideOpen && (
            <div className="border-t border-black/5 dark:border-white/5 p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { n:"01", icon:"🧠", title:"Set up Product Brain", desc:"Add strategy & users once — AI uses it in every command." },
                  { n:"02", icon:"⌘", title:"Press ⌘K in a doc", desc:"Generate PRDs, tickets, briefs, updates, or custom prompts." },
                  { n:"03", icon:"💬", title:"Chat with your docs", desc:"Ask the AI anything about the open document or @mention files." },
                  { n:"04", icon:"📚", title:"Upload to Knowledge Base", desc:"Add PDFs & interviews — AI searches them automatically." },
                  { n:"05", icon:"@", title:"Tag with @ in chat", desc:"@mention any doc or KB file to include it in AI context." },
                  { n:"06", icon:"📅", title:"Check upcoming meetings", desc:"Connect Google Calendar to see conflicts and draft agendas." },
                  { n:"07", icon:"✦", title:"Accept AI suggestions", desc:"AI highlights edits in the doc — accept or reject one by one." },
                  { n:"08", icon:"📎", title:"View Knowledge Base files", desc:"Click any KB file in your project to view extracted content." },
                ].map((item) => (
                  <div
                    key={item.n}
                    className="glass-inset rounded-xl px-3.5 py-3 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-black/25 dark:text-white/20">{item.n}</span>
                      <span className="text-sm leading-none">{item.icon}</span>
                    </div>
                    <p className="text-[12px] font-semibold text-black/75 dark:text-white/75 leading-snug">{item.title}</p>
                    <p className="text-[11px] text-black/40 dark:text-white/35 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── 2-Column asymmetric grid ────────────────────────── */}
        <div className="grid grid-cols-5 gap-5 items-start">

          {/* ════ LEFT COLUMN (60%) ════════════════════════════ */}
          <div
            className="col-span-3 flex flex-col gap-4 pm-slide-up"
            style={{ animationDelay: "110ms" }}
          >
            {/* Primary CTA — New Document */}
            <button
              onClick={createDoc}
              className="amber-grad amber-glow hover-lift group flex items-center gap-4 p-5 rounded-2xl text-white w-full text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-white/20 dark:bg-white/15 flex items-center justify-center shrink-0 ring-1 ring-white/30">
                <FileText size={19} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[15px] leading-tight">New Document</p>
                <p className="text-[12px] text-white/65 mt-0.5">PRD, roadmap, brief, one-pager</p>
              </div>
              <ChevronRight
                size={16}
                className="text-white/50 group-hover:translate-x-0.5 group-hover:text-white/80 transition-all flex-shrink-0"
              />
            </button>

            {/* Secondary quick actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => router.push(`/projects/${projectId}`)}
                className="glass-pane hover-lift group flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all hover:border-amber-300/60 dark:hover:border-amber/40"
              >
                <FolderPlus size={16} className="text-amber-600/70 dark:text-amber/60 flex-shrink-0" />
                <div>
                  <p className="text-[12.5px] font-semibold text-black/70 dark:text-white/70">New Folder</p>
                  <p className="text-[10.5px] text-black/35 dark:text-white/35">Organise work</p>
                </div>
              </button>

              <div className="glass-pane rounded-xl hover:border-amber-300/60 dark:hover:border-amber/40 transition-all">
                <KnowledgeBase
                  projectId={projectId}
                  triggerClassName="hover-lift group flex items-center gap-3 px-4 py-3.5 text-left w-full h-full"
                />
              </div>
            </div>

            {/* ── Knowledge Base ── */}
            <div className="glass-pane rounded-2xl overflow-hidden pm-fade-in" style={{ animationDelay: "160ms" }}>
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-black/5 dark:border-white/5">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-black/40 dark:text-white/40 flex items-center gap-1.5">
                  <BookOpen size={11} /> Knowledge Base
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-black/30 dark:text-white/25">
                    {knowledgeDocs.length > 0 ? `${knowledgeDocs.length} file${knowledgeDocs.length !== 1 ? "s" : ""}` : ""}
                  </span>
                  <KnowledgeBase projectId={projectId} compact />
                </div>
              </div>

              <div className="p-3">
                {knowledgeDocs.length === 0 ? (
                  <div className="glass-inset rounded-xl p-7 text-center">
                    <div className="w-9 h-9 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center mx-auto mb-2.5">
                      <Upload size={16} className="text-black/25 dark:text-white/25" />
                    </div>
                    <p className="text-[12.5px] font-medium text-black/40 dark:text-white/40">No files uploaded yet</p>
                    <p className="text-[11px] text-black/25 dark:text-white/25 mt-1 leading-relaxed max-w-[220px] mx-auto">
                      Upload PDFs, CSVs, or research docs — the AI will reference them automatically.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {knowledgeDocs.map((doc, i) => (
                      <button
                        key={doc.id}
                        onClick={() => router.push(`/projects/${projectId}/knowledge/${doc.id}`)}
                        className="glass-inset hover-lift group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all hover:border-amber-200 dark:hover:border-amber/30 pm-fade-in"
                        style={{ animationDelay: `${200 + i * 40}ms` }}
                      >
                        <div className="w-7 h-7 rounded-lg bg-amber-100/80 dark:bg-amber/10 flex items-center justify-center flex-shrink-0">
                          <FileText size={13} className="text-amber-600 dark:text-amber" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-medium text-black/80 dark:text-white/80 truncate">{doc.filename}</p>
                          <p className="text-[10.5px] text-black/35 dark:text-white/30">
                            {new Date(doc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                        <ArrowRight
                          size={13}
                          className="text-black/15 dark:text-white/15 group-hover:text-amber-600 dark:group-hover:text-amber transition-colors flex-shrink-0"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ════ RIGHT COLUMN (40%) ═══════════════════════════ */}
          <div
            className="col-span-2 flex flex-col gap-4 pm-slide-up"
            style={{ animationDelay: "190ms" }}
          >
            {/* Templates */}
            {templates.length > 0 && (
              <div className="glass-pane rounded-2xl overflow-hidden">
                <div className="flex items-center px-4 pt-4 pb-3 border-b border-black/5 dark:border-white/5">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-black/40 dark:text-white/40 flex items-center gap-1.5">
                    <BookMarked size={11} /> Templates
                  </h2>
                </div>
                <div className="p-3 grid grid-cols-2 gap-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(t.id)}
                      className="glass-inset hover-lift group flex flex-col items-start gap-1 p-3 rounded-xl text-left transition-all hover:border-amber-200 dark:hover:border-amber/30"
                    >
                      <span className="text-base leading-none">{t.icon}</span>
                      <span className="text-[11.5px] font-semibold text-black/70 dark:text-white/70 leading-snug mt-0.5">{t.name}</span>
                      <span className="text-[9.5px] text-black/30 dark:text-white/30">{t.category}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Integrations */}
            <div className="glass-pane rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-black/5 dark:border-white/5">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-black/40 dark:text-white/40 flex items-center gap-1.5">
                  <Plug size={11} /> Issue Tracker
                </h2>
                <button
                  onClick={() => router.push(`/projects/${projectId}/settings`)}
                  className="flex items-center gap-1 text-[10px] text-black/35 dark:text-white/35 hover:text-amber-600 dark:hover:text-amber transition-colors"
                >
                  <Settings2 size={10} /> Settings
                </button>
              </div>

              <div className="p-3 flex flex-col gap-2">
                {/* Jira */}
                <div
                  className={`glass-inset flex items-center gap-3 p-3 rounded-xl transition-all ${
                    integrations.jira.connected
                      ? "border-green-200/60 dark:border-green-700/30"
                      : ""
                  }`}
                >
                  <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                    J
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-black/80 dark:text-white/80 leading-none">Jira</p>
                    {integrations.jira.domain && (
                      <p className="text-[10px] text-black/35 dark:text-white/30 truncate mt-0.5">{integrations.jira.domain}</p>
                    )}
                  </div>
                  {integrations.jira.connected ? (
                    <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                  ) : (
                    <button
                      onClick={() => router.push(`/projects/${projectId}/settings`)}
                      className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                    >
                      Connect
                    </button>
                  )}
                </div>

                {/* Linear */}
                <div
                  className={`glass-inset flex items-center gap-3 p-3 rounded-xl transition-all ${
                    integrations.linear.connected
                      ? "border-green-200/60 dark:border-green-700/30"
                      : ""
                  }`}
                >
                  <div className="w-7 h-7 rounded-lg bg-[#5E6AD2] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                    L
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-black/80 dark:text-white/80 leading-none">Linear</p>
                  </div>
                  {integrations.linear.connected ? (
                    <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                  ) : (
                    <button
                      onClick={() => router.push(`/projects/${projectId}/settings`)}
                      className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex-shrink-0"
                    >
                      Connect
                    </button>
                  )}
                </div>

                {!bothConnected && (
                  <p className="text-[10.5px] text-black/35 dark:text-white/30 px-1 leading-relaxed">
                    Export AI-generated tickets directly from{" "}
                    <span className="font-mono text-[9.5px] bg-black/5 dark:bg-white/5 px-1 py-0.5 rounded">Cmd+K</span>
                  </p>
                )}
              </div>
            </div>

            {/* Pro tip */}
            <div className="glass-pane rounded-2xl p-4">
              <div className="flex items-start gap-2.5">
                <span className="text-base leading-none mt-0.5">💡</span>
                <div>
                  <p className="text-[11.5px] font-semibold text-amber-800 dark:text-amber mb-1">Pro tip</p>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber/65 leading-relaxed">
                    Upload CSVs, Excel sheets, or research PDFs — then ask the AI to calculate metrics,
                    spot trends, or draft updates grounded in your actual data.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
