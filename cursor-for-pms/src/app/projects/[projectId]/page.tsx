"use client";

import { useParams, useRouter } from "next/navigation";
import { useCustomAuth } from "@/hooks/useCustomAuth";
import { useEffect, useState } from "react";
import { FileText, FolderPlus, BookOpen, ArrowRight, Upload, Settings2, CheckCircle2, Plug, BookMarked } from "lucide-react";
import KnowledgeBase from "@/components/KnowledgeBase";

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
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    jira: { connected: false },
    linear: { connected: false },
  });
  const [templates, setTemplates] = useState<Template[]>([]);

  const API = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    if (!userId || !projectId) return;
    // Load project name
    fetch(`${API}/projects/`, { headers: { Authorization: `Bearer ${userId}` } })
      .then(r => r.json())
      .then((projects: { id: string; name: string }[]) => {
        const p = projects.find(p => p.id === projectId);
        if (p) setProjectName(p.name);
      })
      .catch(() => {});

    // Load knowledge docs
    fetch(`${API}/knowledge/?project_id=${projectId}`, {
      headers: { Authorization: `Bearer ${userId}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(setKnowledgeDocs)
      .catch(() => {});

    // Load integration status
    fetch(`${API}/integrations/status`, { headers: { Authorization: `Bearer ${userId}` } })
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (s) setIntegrations(s); })
      .catch(() => {});

    // Load templates (public, no auth needed)
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
      router.push(`/projects/${projectId}/docs/${doc.id}`);
    }
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
      router.push(`/projects/${projectId}/docs/${doc.id}`);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-10 py-12 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <p className="text-xs font-mono uppercase tracking-widest text-black/30 dark:text-white/30 mb-2">Project</p>
        <h1 className="text-3xl font-serif font-bold text-black/80 dark:text-white/80">{projectName}</h1>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <button
          onClick={createDoc}
          className="group flex flex-col items-start gap-2 p-4 rounded-xl border border-black/10 dark:border-white/10 hover:border-amber-400 dark:hover:border-amber/60 bg-white/60 dark:bg-white/5 hover:bg-amber-50/50 dark:hover:bg-amber/5 transition-all text-left"
        >
          <FileText size={18} className="text-amber-600 dark:text-amber" />
          <span className="text-sm font-semibold text-black/70 dark:text-white/70">New Document</span>
          <span className="text-xs text-black/40 dark:text-white/40">PRD, roadmap, brief</span>
        </button>

        <button
          className="group flex flex-col items-start gap-2 p-4 rounded-xl border border-black/10 dark:border-white/10 hover:border-amber-400 dark:hover:border-amber/60 bg-white/60 dark:bg-white/5 hover:bg-amber-50/50 dark:hover:bg-amber/5 transition-all text-left"
          onClick={() => {
            // Trigger folder create — navigate back to sidebar
            router.push(`/projects/${projectId}`);
          }}
        >
          <FolderPlus size={18} className="text-amber-600 dark:text-amber" />
          <span className="text-sm font-semibold text-black/70 dark:text-white/70">New Folder</span>
          <span className="text-xs text-black/40 dark:text-white/40">Organise your work</span>
        </button>

        <div className="relative">
          <KnowledgeBase projectId={projectId} triggerClassName="group flex flex-col items-start gap-2 p-4 rounded-xl border border-black/10 dark:border-white/10 hover:border-amber-400 dark:hover:border-amber/60 bg-white/60 dark:bg-white/5 hover:bg-amber-50/50 dark:hover:bg-amber/5 transition-all text-left w-full h-full" />
        </div>
      </div>

      {/* Knowledge Base Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-black/40 dark:text-white/40 flex items-center gap-2">
            <BookOpen size={13} /> Knowledge Base
          </h2>
          <KnowledgeBase projectId={projectId} compact />
        </div>

        {knowledgeDocs.length === 0 ? (
          <div className="border-2 border-dashed border-black/10 dark:border-white/10 rounded-xl p-8 text-center">
            <Upload size={20} className="mx-auto mb-2 text-black/20 dark:text-white/20" />
            <p className="text-sm text-black/40 dark:text-white/40">No files uploaded yet.</p>
            <p className="text-xs text-black/30 dark:text-white/30 mt-1">Upload user interviews, PDFs, or strategy docs from the sidebar or above.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {knowledgeDocs.map(doc => (
              <button
                key={doc.id}
                onClick={() => router.push(`/projects/${projectId}/knowledge/${doc.id}`)}
                className="group flex items-center justify-between p-3 rounded-lg border border-black/5 dark:border-white/5 bg-white/60 dark:bg-white/5 hover:border-amber-300 dark:hover:border-amber/40 hover:bg-amber-50/50 dark:hover:bg-amber/5 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <FileText size={15} className="text-amber-600 dark:text-amber flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-black/80 dark:text-white/80">{doc.filename}</p>
                    <p className="text-xs text-black/40 dark:text-white/40">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <ArrowRight size={14} className="text-black/20 dark:text-white/20 group-hover:text-amber-600 dark:group-hover:text-amber transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Templates */}
      {templates.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-black/40 dark:text-white/40 flex items-center gap-2">
              <BookMarked size={13} /> Start from a Template
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t.id)}
                className="flex flex-col items-start gap-1.5 p-3 rounded-xl border border-black/10 dark:border-white/10 hover:border-amber-400 dark:hover:border-amber/60 bg-white/60 dark:bg-white/5 hover:bg-amber-50/50 dark:hover:bg-amber/5 transition-all text-left"
              >
                <span className="text-lg">{t.icon}</span>
                <span className="text-xs font-semibold text-black/70 dark:text-white/70 leading-tight">{t.name}</span>
                <span className="text-[10px] text-black/35 dark:text-white/35">{t.category}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Integrations */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-black/40 dark:text-white/40 flex items-center gap-2">
            <Plug size={13} /> Issue Tracker
          </h2>
          <button
            onClick={() => router.push(`/projects/${projectId}/settings`)}
            className="flex items-center gap-1 text-[11px] text-black/40 dark:text-white/40 hover:text-amber-600 dark:hover:text-amber transition-colors"
          >
            <Settings2 size={12} /> Settings
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Jira */}
          <div className={`rounded-xl border p-4 transition-all ${
            integrations.jira.connected
              ? "border-green-200 dark:border-green-800/40 bg-green-50/50 dark:bg-green-900/10"
              : "border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5"
          }`}>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0">J</div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-black dark:text-ivory truncate">Jira</p>
                {integrations.jira.domain && (
                  <p className="text-[11px] text-black/40 dark:text-white/40 truncate">{integrations.jira.domain}</p>
                )}
              </div>
              {integrations.jira.connected && <CheckCircle2 size={15} className="ml-auto shrink-0 text-green-500" />}
            </div>
            {integrations.jira.connected ? (
              <p className="text-[11px] text-green-700 dark:text-green-400 font-medium">Connected</p>
            ) : (
              <button
                onClick={() => router.push(`/projects/${projectId}/settings`)}
                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Connect →
              </button>
            )}
          </div>

          {/* Linear */}
          <div className={`rounded-xl border p-4 transition-all ${
            integrations.linear.connected
              ? "border-green-200 dark:border-green-800/40 bg-green-50/50 dark:bg-green-900/10"
              : "border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5"
          }`}>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#5E6AD2] flex items-center justify-center text-white text-[11px] font-bold shrink-0">L</div>
              <div>
                <p className="text-[13px] font-semibold text-black dark:text-ivory">Linear</p>
              </div>
              {integrations.linear.connected && <CheckCircle2 size={15} className="ml-auto shrink-0 text-green-500" />}
            </div>
            {integrations.linear.connected ? (
              <p className="text-[11px] text-green-700 dark:text-green-400 font-medium">Connected</p>
            ) : (
              <button
                onClick={() => router.push(`/projects/${projectId}/settings`)}
                className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Connect →
              </button>
            )}
          </div>
        </div>

        {!integrations.jira.connected && !integrations.linear.connected && (
          <p className="text-[11px] text-black/40 dark:text-white/40 mt-3 leading-relaxed">
            Connect Jira or Linear to export AI-generated tickets directly from <strong>Cmd+K → Break into tickets</strong>.
          </p>
        )}
      </div>

      {/* Tips */}
      <div className="mt-8 p-4 rounded-xl bg-amber-50 dark:bg-amber/5 border border-amber-100 dark:border-amber/10">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber mb-1">💡 Pro tip</p>
        <p className="text-xs text-amber-700 dark:text-amber/70">
          Upload user interviews or research PDFs to the Knowledge Base, then ask the AI chat anything about them. It will automatically find and reference the right sections.
        </p>
      </div>
    </div>
  );
}

