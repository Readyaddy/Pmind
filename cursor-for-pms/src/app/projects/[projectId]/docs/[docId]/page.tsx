"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import { useCustomAuth as useAuth } from "@/hooks/useCustomAuth";
import Editor from "@/components/Editor";
import DesignViewer, { type DesignContent } from "@/components/agent/DesignViewer";
import { Pencil, Check, X } from "lucide-react";

interface Doc {
  id: string;
  title: string;
  content: Record<string, unknown>;
}

function stripLeadingH1(content: Record<string, unknown>, title: string): Record<string, unknown> {
  const nodes = content.content as Array<Record<string, unknown>> | undefined;
  if (!nodes?.length) return content;
  const first = nodes[0];
  if (first.type !== "heading") return content;
  if ((first.attrs as Record<string, unknown>)?.level !== 1) return content;
  const textContent = (first.content as Array<{ text?: string }> | undefined)
    ?.map(n => n.text ?? "").join("").trim();
  if (textContent?.toLowerCase() !== title.trim().toLowerCase()) return content;
  return { ...content, content: nodes.slice(1) };
}

export default function DocPage({
  params,
}: {
  params: Promise<{ projectId: string; docId: string }>;
}) {
  const { projectId, docId } = use(params);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { userId } = useAuth();
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadDoc = useCallback(async () => {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/documents/${docId}`,
      { headers: { Authorization: `Bearer ${userId}` } }
    );
    if (res.ok) setDoc(await res.json());
  }, [docId, userId]);

  useEffect(() => {
    if (userId) loadDoc();
  }, [loadDoc, userId]);

  const startEditTitle = () => {
    setTitleInput(doc?.title ?? "");
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 0);
  };

  const commitTitle = useCallback(async () => {
    setEditingTitle(false);
    const trimmed = titleInput.trim();
    if (!trimmed || trimmed === doc?.title) return;
    setDoc(prev => prev ? { ...prev, title: trimmed } : prev);
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/documents/${docId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${userId}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    }).catch(() => {});
  }, [titleInput, doc?.title, docId, userId]);

  const handleSave = useCallback(
    async (content: Record<string, unknown>, title: string) => {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(async () => {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/documents/${docId}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${userId}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content, title }),
        });
      }, 2000);
    },
    [docId, userId]
  );

  if (!doc) {
    return (
      <div className="flex items-center justify-center h-full text-black/30 dark:text-white/30 text-sm">
        Loading...
      </div>
    );
  }

  if (doc.content._type === "design") {
    return (
      <DesignViewer
        content={doc.content as unknown as DesignContent}
        title={doc.title}
        onSave={(content, title) => handleSave(content as unknown as Record<string, unknown>, title)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-8 pt-6 pb-2 flex-shrink-0">
        {editingTitle ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              ref={titleInputRef}
              value={titleInput}
              onChange={e => setTitleInput(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
                if (e.key === "Escape") { e.preventDefault(); setEditingTitle(false); }
              }}
              className="text-[26px] font-serif font-bold tracking-tight text-black/85 dark:text-white/85 leading-none bg-transparent border-b-2 border-amber-400 dark:border-amber outline-none min-w-0 flex-1"
            />
            <button
              onClick={commitTitle}
              className="text-emerald-500 hover:text-emerald-600 p-1"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => setEditingTitle(false)}
              className="text-black/30 hover:text-black dark:text-white/30 dark:hover:text-white p-1"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-serif font-bold tracking-tight text-black/85 dark:text-white/85 leading-none">
              {doc.title}
            </h1>
            <button
              onClick={startEditTitle}
              className="text-black/20 dark:text-white/20 hover:text-black/60 dark:hover:text-white/60 p-1 rounded-lg hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-all"
            >
              <Pencil size={13} />
            </button>
          </div>
        )}
      </div>
      <Editor
        docId={docId}
        projectId={projectId}
        initialContent={stripLeadingH1(doc.content, doc.title)}
        onSave={handleSave}
      />
    </div>
  );
}
