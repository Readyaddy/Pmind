"use client";

import { createContext, useContext, useState, useRef, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FolderPlus,
  FilePlus,
  Trash2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FlatFolder {
  id: string;
  name: string;
  parent_folder_id: string | null;
}

export interface FlatDoc {
  id: string;
  title: string;
  folder_id: string | null;
}

export interface FolderNode {
  id: string;
  name: string;
  type: "folder";
  parentFolderId: string | null;
  children: TreeNode[];
}

export interface DocNode {
  id: string;
  name: string;
  type: "doc";
  folderId: string | null;
}

export type TreeNode = FolderNode | DocNode;

export type PendingCreate = {
  parentFolderId: string | null;
  projectId: string;
  type: "folder" | "doc";
} | null;

// ── Tree builder ─────────────────────────────────────────────────────────────

export function buildTree(
  folders: FlatFolder[],
  docs: FlatDoc[],
  parentId: string | null = null
): TreeNode[] {
  const childFolders: FolderNode[] = folders
    .filter((f) => f.parent_folder_id === parentId)
    .map((f) => ({
      id: f.id,
      name: f.name,
      type: "folder",
      parentFolderId: f.parent_folder_id,
      children: buildTree(folders, docs, f.id),
    }));
  const childDocs: DocNode[] = docs
    .filter((d) => d.folder_id === parentId)
    .map((d) => ({
      id: d.id,
      name: d.title || "Untitled",
      type: "doc",
      folderId: d.folder_id,
    }));
  return [...childFolders, ...childDocs];
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface TreeCtx {
  projectId: string;
  activeDocId?: string;
  expandedFolders: Set<string>;
  renamingId: string | null;
  pendingCreate: PendingCreate;
  onToggleFolder: (id: string) => void;
  onNavigate: (docId: string) => void;
  onRenameStart: (id: string) => void;
  onRenameCommit: (node: TreeNode, name: string) => void;
  onRenameCancel: () => void;
  onCreateStart: (parentFolderId: string | null, type: "folder" | "doc") => void;
  onPendingCommit: (name: string) => void;
  onPendingCancel: () => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteDoc: (docId: string) => void;
  onRequestDelete: (node: TreeNode) => void;
}

export const TreeContext = createContext<TreeCtx | null>(null);

function useTreeCtx(): TreeCtx {
  const ctx = useContext(TreeContext);
  if (!ctx) throw new Error("TreeContext not provided");
  return ctx;
}

// ── Inline rename input ───────────────────────────────────────────────────────

function RenameInput({
  initialName,
  onCommit,
  onCancel,
}: {
  initialName: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialName);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
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
      className="flex-1 text-[12px] bg-white dark:bg-zinc-800 border border-amber-400 dark:border-amber/60 rounded px-1 py-0 min-w-0 outline-none"
    />
  );
}

// ── Pending-create input (ghost item) ────────────────────────────────────────

function PendingCreateInput({
  depth,
  type,
}: {
  depth: number;
  type: "folder" | "doc";
}) {
  const ctx = useTreeCtx();
  const [name, setName] = useState("");
  const indent = depth * 12;

  return (
    <div
      className="flex items-center gap-1 px-2 py-[3px] mx-1"
      style={{ paddingLeft: `${indent + 8}px` }}
    >
      <span className="flex-shrink-0 w-3" />
      {type === "folder" ? (
        <Folder size={13} className="flex-shrink-0 text-amber-500 dark:text-amber opacity-60 flex-shrink-0" />
      ) : (
        <FileText size={12} className="flex-shrink-0 opacity-50 flex-shrink-0" />
      )}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => ctx.onPendingCommit(name)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); ctx.onPendingCommit(name); }
          if (e.key === "Escape") { e.preventDefault(); ctx.onPendingCancel(); }
        }}
        placeholder={type === "folder" ? "folder name" : "file name"}
        className="flex-1 text-[12px] bg-white dark:bg-zinc-800 border border-amber-400 dark:border-amber/60 rounded px-1 py-0 min-w-0 outline-none"
      />
    </div>
  );
}

// ── FileTreeItem ──────────────────────────────────────────────────────────────

export function FileTreeItem({
  node,
  depth,
}: {
  node: TreeNode;
  depth: number;
}) {
  const ctx = useTreeCtx();
  const isFolder = node.type === "folder";
  const isExpanded = isFolder && ctx.expandedFolders.has(node.id);
  const isActive = !isFolder && ctx.activeDocId === node.id;
  const isRenaming = ctx.renamingId === node.id;
  const pendingInsideThis =
    isFolder && ctx.pendingCreate?.parentFolderId === node.id;

  const indent = depth * 12;

  return (
    <div>
      {/* Row */}
      <div
        className={`group flex items-center gap-1 pr-1 py-[3px] mx-1 rounded-md cursor-pointer select-none transition-colors ${
          isActive
            ? "bg-amber-50 dark:bg-amber/10 text-amber-800 dark:text-amber"
            : "text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5"
        }`}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={() => {
          if (isFolder) ctx.onToggleFolder(node.id);
          else ctx.onNavigate(node.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          ctx.onRenameStart(node.id);
        }}
      >
        {/* Chevron / spacer */}
        <span className="flex-shrink-0 w-3 flex items-center justify-center">
          {isFolder ? (
            isExpanded ? (
              <ChevronDown size={11} className="opacity-40" />
            ) : (
              <ChevronRight size={11} className="opacity-40" />
            )
          ) : null}
        </span>

        {/* Icon */}
        {isFolder ? (
          isExpanded ? (
            <FolderOpen
              size={13}
              className="flex-shrink-0 text-amber-500 dark:text-amber opacity-90"
            />
          ) : (
            <Folder
              size={13}
              className="flex-shrink-0 text-amber-500 dark:text-amber opacity-60"
            />
          )
        ) : (
          <FileText size={12} className="flex-shrink-0 opacity-50" />
        )}

        {/* Name */}
        {isRenaming ? (
          <RenameInput
            initialName={node.name}
            onCommit={(name) => ctx.onRenameCommit(node, name)}
            onCancel={ctx.onRenameCancel}
          />
        ) : (
          <span className="truncate text-[12px] flex-1 leading-none py-[1px]">
            {node.name}
          </span>
        )}

        {/* Hover actions */}
        {!isRenaming && (
          <span className="flex-shrink-0 flex items-center gap-px opacity-0 group-hover:opacity-100 transition-opacity">
            {isFolder && (
              <>
                <button
                  title="New folder"
                  className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isExpanded) ctx.onToggleFolder(node.id);
                    ctx.onCreateStart(node.id, "folder");
                  }}
                >
                  <FolderPlus size={11} />
                </button>
                <button
                  title="New document"
                  className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isExpanded) ctx.onToggleFolder(node.id);
                    ctx.onCreateStart(node.id, "doc");
                  }}
                >
                  <FilePlus size={11} />
                </button>
              </>
            )}
            <button
              title="Delete"
              className="p-0.5 rounded hover:bg-red-500/10 text-black/30 dark:text-white/30 hover:text-red-500 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                ctx.onRequestDelete(node);
              }}
            >
              <Trash2 size={10} />
            </button>
          </span>
        )}
      </div>

      {/* Children */}
      {isFolder && isExpanded && (
        <div>
          {pendingInsideThis && (
            <PendingCreateInput depth={depth + 1} type={ctx.pendingCreate!.type} />
          )}
          {(node as FolderNode).children.map((child) => (
            <FileTreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Root pending-create export (used by Sidebar for project-root level) ───────

export function RootPendingCreateInput({ type, depth }: { type: "folder" | "doc"; depth: number }) {
  return <PendingCreateInput type={type} depth={depth} />;
}
