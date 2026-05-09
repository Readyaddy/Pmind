"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, FileText, Loader2, Trash2 } from "lucide-react";
import { useCustomAuth as useAuth } from "@/hooks/useCustomAuth";

interface KnowledgeDocument {
  id: string;
  filename: string;
  file_type: string;
  created_at: string;
}

/**
 * Sidebar version of the knowledge base — file list is always visible,
 * upload is a small inline button. No modal, no project picker (a project
 * is always required here).
 */
export default function KnowledgeBaseInline({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { userId } = useAuth();
  const API = process.env.NEXT_PUBLIC_API_URL;

  const load = useCallback(async () => {
    if (!projectId || !userId) return;
    try {
      const res = await fetch(`${API}/knowledge/?project_id=${projectId}`, {
        headers: { Authorization: `Bearer ${userId}` },
      });
      if (res.ok) setDocs(await res.json());
    } catch { /* ignore */ }
  }, [API, projectId, userId]);

  useEffect(() => { void load(); }, [load]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("project_id", projectId);
      const res = await fetch(`${API}/knowledge/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${userId}` },
        body: fd,
      });
      if (res.ok) {
        await load();
      } else {
        setError("Upload failed — must be PDF, DOCX, or TXT.");
      }
    } catch {
      setError("Upload failed.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      await fetch(`${API}/knowledge/${docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userId}` },
      });
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch { /* ignore */ }
  };

  return (
    <div className="px-2 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1.5 py-1 mb-1">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-black/40 dark:text-white/40">
          Knowledge Base
        </span>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber hover:text-amber-900 dark:hover:text-amber-300 transition-colors disabled:opacity-50"
          title="Upload PDF, DOCX, or TXT"
        >
          {isUploading ? (
            <>
              <Loader2 size={9} className="animate-spin" /> Uploading
            </>
          ) : (
            <>
              <Upload size={9} strokeWidth={2.5} /> Upload
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.docx"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-[10px] text-red-600 dark:text-red-400 px-1.5 mb-1.5">{error}</p>
      )}

      {/* File list */}
      {docs.length === 0 && !isUploading ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full mt-1 px-2.5 py-3 rounded-lg border border-dashed border-black/10 dark:border-white/10 hover:border-amber-400/60 dark:hover:border-amber/40 hover:bg-amber-50/30 dark:hover:bg-amber/[0.04] transition-all text-center group"
        >
          <Upload size={11} className="mx-auto mb-1 text-black/30 dark:text-white/25 group-hover:text-amber-600 dark:group-hover:text-amber transition-colors" />
          <p className="text-[10px] text-black/40 dark:text-white/35 group-hover:text-amber-700 dark:group-hover:text-amber leading-snug">
            Drop interviews,<br />research, PDFs
          </p>
        </button>
      ) : (
        <div className="flex flex-col gap-0.5">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="group flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-black/[0.025] dark:hover:bg-white/[0.025] transition-colors"
              title={doc.filename}
            >
              <FileText size={10} className="text-amber-700/70 dark:text-amber/70 flex-shrink-0" />
              <span className="flex-1 min-w-0 text-[11px] text-black/65 dark:text-white/55 truncate">
                {doc.filename}
              </span>
              <button
                onClick={() => handleDelete(doc.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-black/30 dark:text-white/30 hover:text-red-500 transition-all"
                title="Remove from KB"
              >
                <Trash2 size={9} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
