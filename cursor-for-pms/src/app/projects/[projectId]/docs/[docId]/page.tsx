"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import { useCustomAuth as useAuth } from "@/hooks/useCustomAuth";
import Editor from "@/components/Editor";
import DesignViewer, { type DesignContent } from "@/components/agent/DesignViewer";

interface Doc {
  id: string;
  title: string;
  content: Record<string, unknown>;
}

export default function DocPage({
  params,
}: {
  params: Promise<{ projectId: string; docId: string }>;
}) {
  const { projectId, docId } = use(params);
  const [doc, setDoc] = useState<Doc | null>(null);
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
    <Editor
      docId={docId}
      projectId={projectId}
      initialContent={doc.content}
      onSave={handleSave}
    />
  );
}
