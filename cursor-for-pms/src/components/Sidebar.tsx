"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  FilePlus,
  Trash2,
  Pencil,
  Settings2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCustomAuth as useAuth } from "@/hooks/useCustomAuth";
import { ThemeToggle } from "./ThemeToggle";
import KnowledgeBase from "./KnowledgeBase";
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

// ── Inline rename input for project names ─────────────────────────────────────

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

// ── Sidebar ───────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [treeByProject, setTreeByProject] = useState<
    Record<string, { folders: FlatFolder[]; docs: FlatDoc[] }>
  >({});
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState<PendingCreate>(null);
  const [plan, setPlan] = useState<string>("free");

  // Refs to avoid stale closures in stable callbacks
  const loadedProjectsRef = useRef<Set<string>>(new Set());
  const renamingValueRef = useRef<string>("");
  const pendingCreateRef = useRef<PendingCreate>(null);
  pendingCreateRef.current = pendingCreate;

  const { userId } = useAuth();
  const router = useRouter();
  const params = useParams();
  const activeProjectId = params?.projectId as string | undefined;
  const activeDocId = params?.docId as string | undefined;

  const API = process.env.NEXT_PUBLIC_API_URL;

  const authHeader = useCallback(
    () => ({ Authorization: `Bearer ${userId}`, "Content-Type": "application/json" }),
    [userId]
  );

  // ── Load projects ────────────────────────────────────────────────────────

  const loadProjects = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${API}/projects/`, {
        headers: { Authorization: `Bearer ${userId}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        if (activeProjectId) {
          setExpanded((prev) => new Set([...prev, activeProjectId]));
        }
      }
    } catch { /* backend unreachable */ }
  }, [userId, activeProjectId, API]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Load subscription plan for bottom badge
  useEffect(() => {
    if (!userId) return;
    fetch(`${API}/billing/subscription`, { headers: { Authorization: `Bearer ${userId}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.plan) setPlan(data.plan); })
      .catch(() => {});
  }, [userId, API]);

  // ── Load tree (guarded by ref so each project is fetched exactly once) ───

  const loadTree = useCallback(
    async (projectId: string) => {
      if (!userId || loadedProjectsRef.current.has(projectId)) return;
      loadedProjectsRef.current.add(projectId);
      try {
        const res = await fetch(`${API}/projects/${projectId}/tree`, {
          headers: { Authorization: `Bearer ${userId}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTreeByProject((prev) => ({ ...prev, [projectId]: data }));
        }
      } catch { /* ignore */ }
    },
    [userId, API]
  );

  useEffect(() => {
    expanded.forEach((pid) => loadTree(pid));
  }, [expanded, loadTree]);

  // Build nested tree from flat lists (memoized)
  const trees = useMemo(() => {
    const result: Record<string, TreeNode[]> = {};
    for (const [pid, data] of Object.entries(treeByProject)) {
      result[pid] = buildTree(data.folders, data.docs, null);
    }
    return result;
  }, [treeByProject]);

  // ── Project operations ───────────────────────────────────────────────────

  const createProject = async () => {
    if (!userId) return;
    const res = await fetch(`${API}/projects/`, {
      method: "POST",
      headers: authHeader(),
      body: JSON.stringify({ name: "New Project" }),
    });
    if (!res.ok) return;
    const project = await res.json();
    setProjects((prev) => [project, ...prev]);
    setExpanded((prev) => new Set([...prev, project.id]));
    setTreeByProject((prev) => ({ ...prev, [project.id]: { folders: [], docs: [] } }));
    loadedProjectsRef.current.add(project.id);
    renamingValueRef.current = "New Project";
    setRenamingProjectId(project.id);
  };

  const deleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!userId) return;
    await fetch(`${API}/projects/${projectId}`, { method: "DELETE", headers: authHeader() });
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (activeProjectId === projectId) router.push("/projects");
  };

  const commitProjectRename = async (projectId: string, name: string) => {
    setRenamingProjectId(null);
    const trimmed = name.trim() || "New Project";
    await fetch(`${API}/projects/${projectId}`, {
      method: "PUT",
      headers: authHeader(),
      body: JSON.stringify({ name: trimmed }),
    });
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, name: trimmed } : p)));
  };

  // ── Tree callbacks (stable — read state via refs) ────────────────────────

  const onToggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const makeOnNavigate = useCallback(
    (projectId: string) => (docId: string) => {
      router.push(`/projects/${projectId}/docs/${docId}`);
    },
    [router]
  );

  const onRenameStart = useCallback((id: string) => {
    setRenamingId(id);
  }, []);

  const onRenameCancel = useCallback(() => {
    setRenamingId(null);
  }, []);

  const makeOnRenameCommit = useCallback(
    (projectId: string) =>
      async (node: TreeNode, name: string) => {
        setRenamingId(null);
        const trimmed = name.trim();
        if (!trimmed || trimmed === node.name) return;

        if (node.type === "folder") {
          await fetch(`${API}/folders/${node.id}`, {
            method: "PUT",
            headers: authHeader(),
            body: JSON.stringify({ name: trimmed }),
          });
          setTreeByProject((prev) => ({
            ...prev,
            [projectId]: {
              ...prev[projectId],
              folders: prev[projectId].folders.map((f) =>
                f.id === node.id ? { ...f, name: trimmed } : f
              ),
            },
          }));
        } else {
          await fetch(`${API}/documents/${node.id}`, {
            method: "PUT",
            headers: authHeader(),
            body: JSON.stringify({ title: trimmed }),
          });
          setTreeByProject((prev) => ({
            ...prev,
            [projectId]: {
              ...prev[projectId],
              docs: prev[projectId].docs.map((d) =>
                d.id === node.id ? { ...d, title: trimmed } : d
              ),
            },
          }));
        }
      },
    [API, authHeader]
  );

  const makeOnCreateStart = useCallback(
    (projectId: string) =>
      (parentFolderId: string | null, type: "folder" | "doc") => {
        setPendingCreate({ parentFolderId, type, projectId });
      },
    []
  );

  const onPendingCancel = useCallback(() => {
    setPendingCreate(null);
  }, []);

  const makeOnPendingCommit = useCallback(
    (projectId: string) => async (name: string) => {
      const pc = pendingCreateRef.current;
      setPendingCreate(null);
      const trimmed = name.trim();
      if (!pc || !trimmed) return;

      if (pc.type === "folder") {
        const res = await fetch(`${API}/projects/${projectId}/folders/`, {
          method: "POST",
          headers: authHeader(),
          body: JSON.stringify({ name: trimmed, parent_folder_id: pc.parentFolderId }),
        });
        if (!res.ok) return;
        const folder = await res.json();
        setTreeByProject((prev) => ({
          ...prev,
          [projectId]: {
            ...prev[projectId],
            folders: [...(prev[projectId]?.folders ?? []), folder],
          },
        }));
      } else {
        const res = await fetch(`${API}/projects/${projectId}/documents/`, {
          method: "POST",
          headers: authHeader(),
          body: JSON.stringify({ folder_id: pc.parentFolderId }),
        });
        if (!res.ok) return;
        const doc = await res.json();
        // Rename doc to user-provided name if different from default
        if (trimmed !== "Untitled") {
          await fetch(`${API}/documents/${doc.id}`, {
            method: "PUT",
            headers: authHeader(),
            body: JSON.stringify({ title: trimmed }),
          });
          doc.title = trimmed;
        }
        setTreeByProject((prev) => ({
          ...prev,
          [projectId]: {
            ...prev[projectId],
            docs: [...(prev[projectId]?.docs ?? []), doc],
          },
        }));
        router.push(`/projects/${projectId}/docs/${doc.id}`);
      }
    },
    [API, authHeader, router]
  );

  const makeOnDeleteFolder = useCallback(
    (projectId: string) => async (folderId: string) => {
      await fetch(`${API}/folders/${folderId}`, { method: "DELETE", headers: authHeader() });
      // Reload tree so all children are removed
      loadedProjectsRef.current.delete(projectId);
      loadTree(projectId);
    },
    [API, authHeader, loadTree]
  );

  const makeOnDeleteDoc = useCallback(
    (projectId: string) => async (docId: string) => {
      await fetch(`${API}/documents/${docId}`, { method: "DELETE", headers: authHeader() });
      setTreeByProject((prev) => ({
        ...prev,
        [projectId]: {
          ...prev[projectId],
          docs: prev[projectId].docs.filter((d) => d.id !== docId),
        },
      }));
      if (activeDocId === docId) router.push(`/projects/${projectId}`);
    },
    [API, authHeader, activeDocId, router]
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-60 glass-pane h-full flex flex-col rounded-2xl shadow-2xl flex-shrink-0 transition-colors relative z-10">
      {/* Header */}
      <div className="px-4 py-3 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
        <span className="font-mono tracking-widest uppercase text-[10px] font-semibold text-black/30 dark:text-white/30">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={createProject}
            title="New project"
            className="p-1 rounded-md text-black/40 dark:text-white/40 hover:text-amber-700 dark:hover:text-amber hover:bg-black/5 dark:hover:bg-white/5 transition-all"
          >
            <Plus size={14} />
          </button>
          <ThemeToggle />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1 text-sm min-h-0">
        {projects.length === 0 && (
          <p className="text-center text-xs text-black/25 dark:text-white/25 mt-10 px-4">
            No projects yet.
            <br />
            <button
              onClick={createProject}
              className="mt-2 text-amber-600 dark:text-amber hover:underline"
            >
              Create one
            </button>
          </p>
        )}

        {projects.map((project) => {
          const isExpanded = expanded.has(project.id);
          const isActiveProject = activeProjectId === project.id;
          const isRenamingProject = renamingProjectId === project.id;
          const tree = trees[project.id] ?? [];
          const pendingAtRoot =
            pendingCreate?.projectId === project.id &&
            pendingCreate.parentFolderId === null;

          // Build stable TreeCtx for this project
          const treeCtx: TreeCtx = {
            projectId: project.id,
            activeDocId,
            expandedFolders,
            renamingId,
            pendingCreate,
            onToggleFolder,
            onNavigate: makeOnNavigate(project.id),
            onRenameStart,
            onRenameCommit: makeOnRenameCommit(project.id),
            onRenameCancel,
            onCreateStart: makeOnCreateStart(project.id),
            onPendingCommit: makeOnPendingCommit(project.id),
            onPendingCancel,
            onDeleteFolder: makeOnDeleteFolder(project.id),
            onDeleteDoc: makeOnDeleteDoc(project.id),
          };

          return (
            <div key={project.id}>
              {/* Project row */}
              <div
                className={`group flex items-center gap-1 pr-1 py-1.5 mx-1 rounded-lg cursor-pointer transition-all ${
                  isActiveProject
                    ? "text-amber-800 dark:text-amber"
                    : "text-black/80 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/5"
                }`}
                style={{ paddingLeft: "8px" }}
                onClick={() => {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(project.id)) next.delete(project.id);
                    else next.add(project.id);
                    return next;
                  });
                  router.push(`/projects/${project.id}`);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  renamingValueRef.current = project.name;
                  setRenamingProjectId(project.id);
                }}
              >
                <span className="flex-shrink-0 w-3 flex items-center justify-center">
                  {isExpanded ? (
                    <ChevronDown size={11} className="opacity-40" />
                  ) : (
                    <ChevronRight size={11} className="opacity-40" />
                  )}
                </span>

                {isRenamingProject ? (
                  <ProjectRenameInput
                    initialName={project.name}
                    onCommit={(name) => commitProjectRename(project.id, name)}
                    onCancel={() => setRenamingProjectId(null)}
                  />
                ) : (
                  <span className="truncate text-[13px] font-semibold flex-1 leading-none py-[1px]">
                    {project.name}
                  </span>
                )}

                {!isRenamingProject && (
                  <span className="flex-shrink-0 flex items-center gap-px">
                    {/* Settings gear — always visible */}
                    <button
                      title="Settings & Integrations"
                      className={`p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${
                        activeProjectId === project.id
                          ? "text-amber-600/60 dark:text-amber/60 hover:text-amber-800 dark:hover:text-amber"
                          : "text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/projects/${project.id}/settings`);
                      }}
                    >
                      <Settings2 size={12} />
                    </button>
                    {/* Edit controls — visible on hover */}
                    <span className="flex items-center gap-px opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        title="Rename project"
                        className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          renamingValueRef.current = project.name;
                          setRenamingProjectId(project.id);
                        }}
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        title="New folder"
                        className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded((prev) => new Set([...prev, project.id]));
                          setPendingCreate({
                            parentFolderId: null,
                            type: "folder",
                            projectId: project.id,
                          });
                        }}
                      >
                        <FolderPlus size={11} />
                      </button>
                      <button
                        title="New document"
                        className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded((prev) => new Set([...prev, project.id]));
                          setPendingCreate({
                            parentFolderId: null,
                            type: "doc",
                            projectId: project.id,
                          });
                        }}
                      >
                        <FilePlus size={11} />
                      </button>
                      <button
                        title="Delete project"
                        className="p-0.5 rounded hover:bg-red-500/10 text-black/30 dark:text-white/30 hover:text-red-500 transition-colors"
                        onClick={(e) => deleteProject(e, project.id)}
                      >
                        <Trash2 size={10} />
                      </button>
                    </span>
                  </span>
                )}
              </div>

              {/* Expanded tree */}
              {isExpanded && (
                <TreeContext.Provider value={treeCtx}>
                  <div className="mb-0.5">
                    {pendingAtRoot && (
                      <RootPendingCreateInput
                        type={pendingCreate!.type}
                        depth={0}
                      />
                    )}
                    {tree.map((node) => (
                      <FileTreeItem key={node.id} node={node} depth={0} />
                    ))}
                    <div className="mt-2 border-t border-black/5 dark:border-white/5 pt-1">
                      <KnowledgeBase projectId={project.id} />
                    </div>
                  </div>
                </TreeContext.Provider>
              )}
            </div>
          );
        })}
      </div>

      {/* Plan badge */}
      <div className="px-3 py-2.5 border-t border-black/5 dark:border-white/5 flex items-center justify-between gap-2">
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            plan === "pro" || plan === "team"
              ? "bg-amber-100 dark:bg-amber/10 text-amber-800 dark:text-amber"
              : "bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40"
          }`}
        >
          {plan === "pro" ? "⭐ Pro" : plan === "team" ? "⭐ Team" : "Free"}
        </span>
        {plan === "free" && (
          <Link
            href="/billing"
            className="text-[10px] text-amber-600 dark:text-amber hover:underline font-medium flex items-center gap-0.5"
          >
            <Zap size={9} /> Upgrade
          </Link>
        )}
      </div>
    </div>
  );
}
