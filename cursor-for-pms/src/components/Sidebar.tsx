"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Plus,
  ChevronDown,
  FolderPlus,
  FilePlus,
  Trash2,
  Pencil,
  Settings2,
  Zap,
  Check,
  User,
} from "lucide-react";
import Link from "next/link";
import { useCustomAuth as useAuth } from "@/hooks/useCustomAuth";
import { useClerk, useUser } from "@clerk/nextjs";
import { ThemeToggle } from "./ThemeToggle";
import KnowledgeBaseInline from "./KnowledgeBaseInline";
import { useActiveProject } from "@/store/activeProject";
import {
  FileTreeItem,
  RootPendingCreateInput,
  TreeContext,
  buildTree,
  type FlatFolder,
  type FlatDoc,
  type TreeNode,
  type PendingCreate,
  type TreeCtx,
} from "./FileTreeItem";

interface Project {
  id: string;
  name: string;
  color: string;
}

function ProjectRenameInput({
  initialName,
  onCommit,
  onCancel,
}: {
  initialName: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialName);
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); onCommit(value); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
      onClick={(e) => e.stopPropagation()}
      className="flex-1 text-[13px] font-semibold bg-white dark:bg-zinc-800 border border-amber-400 dark:border-amber/60 rounded px-1 py-0 min-w-0 outline-none"
    />
  );
}

export default function Sidebar() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [treeByProject, setTreeByProject] = useState<
    Record<string, { folders: FlatFolder[]; docs: FlatDoc[] }>
  >({});
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState<PendingCreate>(null);
  const [plan, setPlan] = useState<string>("free");
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingTreeIds, setLoadingTreeIds] = useState<Set<string>>(new Set());

  const loadedProjectsRef = useRef<Set<string>>(new Set());
  const renamingValueRef = useRef<string>("");
  const pendingCreateRef = useRef<PendingCreate>(null);
  pendingCreateRef.current = pendingCreate;
  const pickerRef = useRef<HTMLDivElement>(null);

  const { userId } = useAuth();
  const router = useRouter();
  const params = useParams();
  const urlProjectId = params?.projectId as string | undefined;
  const activeDocId = params?.docId as string | undefined;

  const { projectId: storedProjectId, setActiveProject } = useActiveProject();
  // The project we show in the sidebar
  const selectedProjectId = urlProjectId ?? storedProjectId ?? null;
  const selectedProject = projects.find(p => p.id === selectedProjectId) ?? null;

  const API = process.env.NEXT_PUBLIC_API_URL;

  const authHeader = useCallback(
    () => ({ Authorization: `Bearer ${userId}`, "Content-Type": "application/json" }),
    [userId]
  );

  // Close picker when clicking outside
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  // ── Load projects + plan in parallel ──────────────────────────────────────
  const loadProjects = useCallback(async () => {
    if (!userId) return;
    setLoadingProjects(true);
    try {
      const [projectsRes, planRes] = await Promise.all([
        fetch(`${API}/projects/`, { headers: { Authorization: `Bearer ${userId}` } }),
        fetch(`${API}/billing/subscription`, { headers: { Authorization: `Bearer ${userId}` } }).catch(() => null),
      ]);
      if (projectsRes.ok) {
        const data: Project[] = await projectsRes.json();
        setProjects(data);
        if (!storedProjectId && data.length > 0) {
          setActiveProject(data[0].id, data[0].name);
        }
      }
      if (planRes?.ok) {
        const sub = await planRes.json().catch(() => null);
        if (sub?.plan) setPlan(sub.plan);
      }
    } catch { /* backend unreachable */ }
    finally { setLoadingProjects(false); }
  }, [userId, API, storedProjectId, setActiveProject]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Sync URL project → store
  useEffect(() => {
    if (urlProjectId && projects.length > 0) {
      const p = projects.find(p => p.id === urlProjectId);
      if (p && p.id !== storedProjectId) {
        setActiveProject(p.id, p.name);
      }
    }
  }, [urlProjectId, projects, storedProjectId, setActiveProject]);

  // ── Load tree for selected project ────────────────────────────────────────
  const loadTree = useCallback(
    async (projectId: string, force = false) => {
      if (!userId) return;
      if (!force && loadedProjectsRef.current.has(projectId)) return;
      loadedProjectsRef.current.add(projectId);
      setLoadingTreeIds(prev => new Set(prev).add(projectId));
      try {
        const res = await fetch(`${API}/projects/${projectId}/tree`, {
          headers: { Authorization: `Bearer ${userId}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTreeByProject(prev => ({ ...prev, [projectId]: data }));
        }
      } catch { /* ignore */ }
      finally {
        setLoadingTreeIds(prev => { const s = new Set(prev); s.delete(projectId); return s; });
      }
    },
    [userId, API]
  );

  useEffect(() => {
    if (selectedProjectId) loadTree(selectedProjectId);
  }, [selectedProjectId, loadTree]);

  // Listen for external tree-refresh events
  useEffect(() => {
    const handler = (e: Event) => {
      const { projectId } = (e as CustomEvent<{ projectId: string }>).detail;
      loadedProjectsRef.current.delete(projectId);
      loadTree(projectId, true);
    };
    window.addEventListener("pmind:refresh-tree", handler);
    return () => window.removeEventListener("pmind:refresh-tree", handler);
  }, [loadTree]);

  const tree = useMemo(() => {
    if (!selectedProjectId) return [];
    const data = treeByProject[selectedProjectId];
    if (!data) return [];
    return buildTree(data.folders, data.docs, null);
  }, [treeByProject, selectedProjectId]);

  // ── Project operations ────────────────────────────────────────────────────
  const createProject = async () => {
    if (!userId) return;
    setShowPicker(false);
    const res = await fetch(`${API}/projects/`, {
      method: "POST",
      headers: authHeader(),
      body: JSON.stringify({ name: "New Project" }),
    });
    if (!res.ok) return;
    const project: Project = await res.json();
    setProjects(prev => [project, ...prev]);
    setActiveProject(project.id, project.name);
    setTreeByProject(prev => ({ ...prev, [project.id]: { folders: [], docs: [] } }));
    loadedProjectsRef.current.add(project.id);
    renamingValueRef.current = "New Project";
    setRenamingProjectId(project.id);
    router.push(`/projects/${project.id}`);
  };

  const deleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!userId) return;
    await fetch(`${API}/projects/${projectId}`, { method: "DELETE", headers: authHeader() });
    setProjects(prev => prev.filter(p => p.id !== projectId));
    if (selectedProjectId === projectId) {
      const remaining = projects.filter(p => p.id !== projectId);
      if (remaining.length > 0) {
        setActiveProject(remaining[0].id, remaining[0].name);
        router.push(`/projects/${remaining[0].id}`);
      } else {
        router.push("/projects");
      }
    }
  };

  const commitProjectRename = async (projectId: string, name: string) => {
    setRenamingProjectId(null);
    const trimmed = name.trim() || "New Project";
    await fetch(`${API}/projects/${projectId}`, {
      method: "PUT",
      headers: authHeader(),
      body: JSON.stringify({ name: trimmed }),
    });
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, name: trimmed } : p));
    if (storedProjectId === projectId) setActiveProject(projectId, trimmed);
  };

  const switchProject = (project: Project) => {
    setActiveProject(project.id, project.name);
    setShowPicker(false);
    router.push(`/projects/${project.id}`);
  };

  // ── Tree callbacks ────────────────────────────────────────────────────────
  const onToggleFolder = useCallback((folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
      return next;
    });
  }, []);

  const onNavigate = useCallback(
    (docId: string) => {
      if (selectedProjectId) router.push(`/projects/${selectedProjectId}/docs/${docId}`);
    },
    [router, selectedProjectId]
  );

  const onRenameStart = useCallback((id: string) => setRenamingId(id), []);
  const onRenameCancel = useCallback(() => setRenamingId(null), []);

  const onRenameCommit = useCallback(
    async (node: TreeNode, name: string) => {
      setRenamingId(null);
      const trimmed = name.trim();
      if (!trimmed || trimmed === node.name || !selectedProjectId) return;
      if (node.type === "folder") {
        await fetch(`${API}/folders/${node.id}`, {
          method: "PUT", headers: authHeader(), body: JSON.stringify({ name: trimmed }),
        });
        setTreeByProject(prev => ({
          ...prev,
          [selectedProjectId]: {
            ...prev[selectedProjectId],
            folders: prev[selectedProjectId].folders.map(f => f.id === node.id ? { ...f, name: trimmed } : f),
          },
        }));
      } else {
        await fetch(`${API}/documents/${node.id}`, {
          method: "PUT", headers: authHeader(), body: JSON.stringify({ title: trimmed }),
        });
        setTreeByProject(prev => ({
          ...prev,
          [selectedProjectId]: {
            ...prev[selectedProjectId],
            docs: prev[selectedProjectId].docs.map(d => d.id === node.id ? { ...d, title: trimmed } : d),
          },
        }));
      }
    },
    [API, authHeader, selectedProjectId]
  );

  const onCreateStart = useCallback(
    (parentFolderId: string | null, type: "folder" | "doc") => {
      if (selectedProjectId) setPendingCreate({ parentFolderId, type, projectId: selectedProjectId });
    },
    [selectedProjectId]
  );

  const onPendingCancel = useCallback(() => setPendingCreate(null), []);

  const onPendingCommit = useCallback(
    async (name: string) => {
      const pc = pendingCreateRef.current;
      setPendingCreate(null);
      const trimmed = name.trim();
      if (!pc || !trimmed || !selectedProjectId) return;

      if (pc.type === "folder") {
        const res = await fetch(`${API}/projects/${selectedProjectId}/folders/`, {
          method: "POST", headers: authHeader(),
          body: JSON.stringify({ name: trimmed, parent_folder_id: pc.parentFolderId }),
        });
        if (!res.ok) return;
        const folder = await res.json();
        setTreeByProject(prev => ({
          ...prev,
          [selectedProjectId]: {
            ...prev[selectedProjectId],
            folders: [...(prev[selectedProjectId]?.folders ?? []), folder],
          },
        }));
      } else {
        const res = await fetch(`${API}/projects/${selectedProjectId}/documents/`, {
          method: "POST", headers: authHeader(),
          body: JSON.stringify({ folder_id: pc.parentFolderId }),
        });
        if (!res.ok) return;
        const doc = await res.json();
        if (trimmed !== "Untitled") {
          await fetch(`${API}/documents/${doc.id}`, {
            method: "PUT", headers: authHeader(), body: JSON.stringify({ title: trimmed }),
          });
          doc.title = trimmed;
        }
        setTreeByProject(prev => ({
          ...prev,
          [selectedProjectId]: {
            ...prev[selectedProjectId],
            docs: [...(prev[selectedProjectId]?.docs ?? []), doc],
          },
        }));
        router.push(`/projects/${selectedProjectId}/docs/${doc.id}`);
      }
    },
    [API, authHeader, router, selectedProjectId]
  );

  const onDeleteFolder = useCallback(
    async (folderId: string) => {
      if (!selectedProjectId) return;
      await fetch(`${API}/folders/${folderId}`, { method: "DELETE", headers: authHeader() });
      loadedProjectsRef.current.delete(selectedProjectId);
      loadTree(selectedProjectId);
    },
    [API, authHeader, loadTree, selectedProjectId]
  );

  const onDeleteDoc = useCallback(
    async (docId: string) => {
      if (!selectedProjectId) return;
      await fetch(`${API}/documents/${docId}`, { method: "DELETE", headers: authHeader() });
      setTreeByProject(prev => ({
        ...prev,
        [selectedProjectId]: {
          ...prev[selectedProjectId],
          docs: prev[selectedProjectId].docs.filter(d => d.id !== docId),
        },
      }));
      if (activeDocId === docId) router.push(`/projects/${selectedProjectId}`);
    },
    [API, authHeader, activeDocId, router, selectedProjectId]
  );

  const treeCtx: TreeCtx | null = selectedProjectId
    ? {
        projectId: selectedProjectId,
        activeDocId,
        expandedFolders,
        renamingId,
        pendingCreate,
        onToggleFolder,
        onNavigate,
        onRenameStart,
        onRenameCommit,
        onRenameCancel,
        onCreateStart,
        onPendingCommit,
        onPendingCancel,
        onDeleteFolder,
        onDeleteDoc,
      }
    : null;

  const pendingAtRoot =
    pendingCreate?.projectId === selectedProjectId && pendingCreate?.parentFolderId === null;

  return (
    <div className="w-60 glass-pane h-full flex flex-col rounded-2xl flex-shrink-0 transition-colors relative z-10 overflow-hidden">

      {/* Project picker header */}
      <div className="relative" ref={pickerRef}>
        <div
          className="px-3 py-3 flex items-center gap-2 cursor-pointer hover:bg-black/[0.025] dark:hover:bg-white/[0.025] transition-colors border-b border-black/[0.04] dark:border-white/[0.04] group"
          onClick={() => setShowPicker(v => !v)}
        >
          {loadingProjects ? (
            <>
              <div className="w-6 h-6 rounded-lg bg-black/[0.06] dark:bg-white/[0.06] animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2 w-10 rounded bg-black/[0.05] dark:bg-white/[0.05] animate-pulse" />
                <div className="h-3 w-24 rounded bg-black/[0.07] dark:bg-white/[0.07] animate-pulse" />
              </div>
            </>
          ) : selectedProject ? (
            <>
              <div
                className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold ring-1 ring-black/10 dark:ring-white/10 shadow-sm"
                style={{ background: selectedProject.color || "#D97706" }}
              >
                {selectedProject.name[0].toUpperCase()}
              </div>

              {renamingProjectId === selectedProject.id ? (
                <ProjectRenameInput
                  initialName={selectedProject.name}
                  onCommit={name => commitProjectRename(selectedProject.id, name)}
                  onCancel={() => setRenamingProjectId(null)}
                />
              ) : (
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-black/35 dark:text-white/35">Project</div>
                  <div className="truncate text-[13px] font-semibold text-black/85 dark:text-ivory">
                    {selectedProject.name}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="w-6 h-6 rounded-lg bg-black/[0.04] dark:bg-white/[0.04] flex-shrink-0" />
              <span className="text-[13px] text-black/40 dark:text-white/40 flex-1 italic">Select project…</span>
            </>
          )}

          <ChevronDown
            size={13}
            className={`flex-shrink-0 text-black/30 dark:text-white/30 group-hover:text-black/60 dark:group-hover:text-white/60 transition-all ${showPicker ? "rotate-180" : ""}`}
          />
        </div>

        {/* Picker dropdown */}
        {showPicker && (
          <div className="absolute top-full left-2 right-2 z-50 glass-pane shadow-2xl rounded-xl overflow-hidden mt-1.5 pm-pop-in">
            <div className="px-3 py-2 border-b border-black/[0.04] dark:border-white/[0.04]">
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-black/40 dark:text-white/40">Switch project</div>
            </div>
            <div className="max-h-56 overflow-y-auto thin-scroll py-1">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => switchProject(p)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left ${
                    p.id === selectedProjectId
                      ? "bg-amber-50/60 dark:bg-amber/[0.06]"
                      : "hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                  }`}
                >
                  <div
                    className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold ring-1 ring-black/10 dark:ring-white/10"
                    style={{ background: p.color || "#D97706" }}
                  >
                    {p.name[0].toUpperCase()}
                  </div>
                  <span className="truncate text-[12.5px] text-black/80 dark:text-white/80 flex-1">{p.name}</span>
                  {p.id === selectedProjectId && (
                    <Check size={12} className="text-amber-600 dark:text-amber flex-shrink-0" strokeWidth={2.5} />
                  )}
                </button>
              ))}
            </div>
            <div className="border-t border-black/[0.04] dark:border-white/[0.04]">
              <button
                onClick={createProject}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] font-semibold text-amber-700 dark:text-amber hover:bg-amber-50/70 dark:hover:bg-amber/[0.08] transition-colors"
              >
                <Plus size={13} strokeWidth={2.5} /> New project
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Actions bar: new doc / new folder / settings */}
      {selectedProject && (
        <div className="px-2 py-1.5 border-b border-black/[0.04] dark:border-white/[0.04] flex items-center justify-between bg-black/[0.012] dark:bg-white/[0.01]">
          <div className="flex items-center gap-0.5">
            <button
              title="New document"
              onClick={() => onCreateStart(null, "doc")}
              className="p-1.5 rounded-lg text-black/40 dark:text-white/40 hover:text-amber-700 dark:hover:text-amber hover:bg-amber-50/60 dark:hover:bg-amber/10 transition-all"
            >
              <FilePlus size={13} strokeWidth={2.2} />
            </button>
            <button
              title="New folder"
              onClick={() => onCreateStart(null, "folder")}
              className="p-1.5 rounded-lg text-black/40 dark:text-white/40 hover:text-amber-700 dark:hover:text-amber hover:bg-amber-50/60 dark:hover:bg-amber/10 transition-all"
            >
              <FolderPlus size={13} strokeWidth={2.2} />
            </button>
            <div className="w-px h-3.5 bg-black/[0.06] dark:bg-white/[0.06] mx-0.5" />
            <button
              title="Rename project"
              onClick={() => {
                renamingValueRef.current = selectedProject.name;
                setRenamingProjectId(selectedProject.id);
                setShowPicker(false);
              }}
              className="p-1.5 rounded-lg text-black/35 dark:text-white/35 hover:text-amber-700 dark:hover:text-amber hover:bg-amber-50/60 dark:hover:bg-amber/10 transition-all"
            >
              <Pencil size={12} strokeWidth={2.2} />
            </button>
            <button
              title="Delete project"
              onClick={(e) => deleteProject(e, selectedProject.id)}
              className="p-1.5 rounded-lg text-black/30 dark:text-white/30 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
            >
              <Trash2 size={12} strokeWidth={2.2} />
            </button>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              title="Project settings"
              onClick={() => router.push(`/projects/${selectedProject.id}/settings`)}
              className="p-1.5 rounded-lg text-black/30 dark:text-white/30 hover:text-black/70 dark:hover:text-white/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all"
            >
              <Settings2 size={13} strokeWidth={2.2} />
            </button>
            <ThemeToggle />
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto thin-scroll py-2 text-sm min-h-0">
        {loadingProjects ? (
          <div className="px-3 py-2 space-y-2.5 pm-fade-in">
            {["75%", "55%", "85%", "65%", "70%"].map((w, i) => (
              <div key={i} className="h-5 rounded-md bg-black/[0.05] dark:bg-white/[0.05] animate-pulse" style={{ width: w }} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center mt-12 px-4 text-center pm-fade-in">
            <div className="w-9 h-9 rounded-xl bg-amber-100/60 dark:bg-amber/10 ring-1 ring-amber-200/50 dark:ring-amber/20 flex items-center justify-center mb-3">
              <Plus size={16} className="text-amber-700 dark:text-amber" strokeWidth={2.2} />
            </div>
            <p className="text-[11.5px] text-black/45 dark:text-white/40 mb-2">No projects yet</p>
            <button
              onClick={createProject}
              className="text-[11.5px] font-semibold text-amber-700 dark:text-amber hover:underline"
            >
              Create your first project →
            </button>
          </div>
        ) : !selectedProject ? (
          <p className="text-center text-[11.5px] italic text-black/30 dark:text-white/30 mt-10 px-4">
            Select a project above
          </p>
        ) : selectedProjectId && loadingTreeIds.has(selectedProjectId) ? (
          <div className="px-3 py-2 space-y-2.5 pm-fade-in">
            {["70%", "85%", "55%", "75%", "60%"].map((w, i) => (
              <div key={i} className="h-5 rounded-md bg-black/[0.05] dark:bg-white/[0.05] animate-pulse" style={{ width: w }} />
            ))}
          </div>
        ) : treeCtx ? (
          <TreeContext.Provider value={treeCtx}>
            <div>
              {/* Project home link */}
              <button
                onClick={() => router.push(`/projects/${selectedProject.id}`)}
                className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-[12px] transition-all relative ${
                  urlProjectId === selectedProject.id && !activeDocId
                    ? "text-amber-700 dark:text-amber font-semibold"
                    : "text-black/55 dark:text-white/45 hover:text-black/85 dark:hover:text-white/85 hover:bg-black/[0.025] dark:hover:bg-white/[0.025]"
                }`}
              >
                {urlProjectId === selectedProject.id && !activeDocId && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-amber-500 dark:bg-amber" />
                )}
                Home
              </button>

              {pendingAtRoot && (
                <RootPendingCreateInput type={pendingCreate!.type} depth={0} />
              )}
              {tree.map(node => (
                <FileTreeItem key={node.id} node={node} depth={0} />
              ))}
              <div className="mt-3 mx-1 pt-2 border-t border-black/[0.04] dark:border-white/[0.04]">
                <KnowledgeBaseInline projectId={selectedProject.id} />
              </div>
            </div>
          </TreeContext.Provider>
        ) : null}
      </div>

      {/* Footer — plan + user */}
      <div className="border-t border-black/[0.04] dark:border-white/[0.04] bg-gradient-to-b from-transparent to-black/[0.012] dark:to-white/[0.01]">
        <div className="px-3 pt-2 pb-1 flex items-center justify-between gap-2">
          <span
            className={`text-[9px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded-md ring-1 ${
              plan === "pro" || plan === "team"
                ? "bg-amber-100/70 dark:bg-amber/10 text-amber-800 dark:text-amber ring-amber-200/60 dark:ring-amber/20"
                : "bg-black/[0.04] dark:bg-white/[0.04] text-black/50 dark:text-white/45 ring-black/[0.06] dark:ring-white/[0.06]"
            }`}
          >
            {plan === "pro" ? "Pro" : plan === "team" ? "Team" : "Free"}
          </span>
          {plan === "free" && (
            <Link
              href="/billing"
              className="text-[10.5px] text-amber-700 dark:text-amber hover:text-amber-900 dark:hover:text-amber font-semibold flex items-center gap-1 transition-colors"
            >
              <Zap size={9} strokeWidth={2.5} /> Upgrade
            </Link>
          )}
        </div>
        <UserFooter />
      </div>
    </div>
  );
}

function UserFooter() {
  const { signOut } = useClerk();
  const { user } = useUser();
  const router = useRouter();
  const isDev = process.env.NEXT_PUBLIC_DEV_MODE === "true";

  const email = user?.primaryEmailAddress?.emailAddress ?? (isDev ? "dev@pmind.xyz" : "");
  const initials = isDev ? "D" : (user?.firstName?.[0] ?? email?.[0] ?? "?").toUpperCase();

  return (
    <div className="px-3 py-2.5 flex items-center justify-between gap-2">
      <button
        onClick={() => router.push("/profile")}
        className="flex items-center gap-2 min-w-0 group transition-opacity"
        title="View profile"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 dark:from-amber/80 dark:to-amber-700 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 ring-1 ring-amber-300/50 dark:ring-amber/30 shadow-sm group-hover:scale-105 transition-transform">
          {initials}
        </div>
        <span className="text-[11px] text-black/55 dark:text-white/45 truncate group-hover:text-black/85 dark:group-hover:text-white/85 transition-colors">{email}</span>
      </button>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={() => router.push("/profile")}
          className="p-1.5 rounded-lg text-black/30 dark:text-white/25 hover:text-black/70 dark:hover:text-white/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all"
          title="Profile"
        >
          <User size={11} strokeWidth={2.2} />
        </button>
        <button
          onClick={() => signOut(() => router.push("/"))}
          className="text-[10px] font-medium text-black/35 dark:text-white/25 hover:text-red-500 dark:hover:text-red-400 transition-colors px-1.5 py-1"
          title="Sign out"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
