"use client";

import { useParams, useRouter } from "next/navigation";
import { useCustomAuth } from "@/hooks/useCustomAuth";
import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Trash2, Loader2, Download, ChevronDown, ChevronRight } from "lucide-react";

interface KnowledgeDoc {
  id: string;
  filename: string;
  file_type: string;
  created_at: string;
  storage_path?: string;
}

interface KnowledgeChunk {
  id: string;
  content: string;
}

export default function KnowledgeDocPage() {
  const params = useParams();
  const projectId = params?.projectId as string;
  const docId = params?.docId as string;
  const router = useRouter();
  const { userId } = useCustomAuth();

  const [doc, setDoc] = useState<KnowledgeDoc | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string>("");
  const [docxHtml, setDocxHtml] = useState<string>("");
  const [txtContent, setTxtContent] = useState<string>("");
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const [chunksOpen, setChunksOpen] = useState(false);

  const API = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    if (!userId || !docId) return;
    setLoading(true);

    const authH = { Authorization: `Bearer ${userId}` };

    const loadFile = async (docData: KnowledgeDoc) => {
      setFileLoading(true);
      try {
        const res = await fetch(`${API}/knowledge/${docData.id}/url`, { headers: authH });
        if (!res.ok) { setFileLoading(false); return; }
        const { url, file_type } = await res.json();
        setFileType(file_type || docData.file_type || "");

        const ft = (file_type || docData.file_type || "").toLowerCase();
        const fname = docData.filename.toLowerCase();

        if (fname.endsWith(".pdf") || ft.includes("pdf")) {
          setFileUrl(url);
        } else if (fname.endsWith(".txt") || ft.includes("text/plain")) {
          const textRes = await fetch(url);
          const text = await textRes.text();
          setTxtContent(text);
        } else if (fname.endsWith(".docx") || ft.includes("officedocument")) {
          const arrayBuf = await (await fetch(url)).arrayBuffer();
          const mammoth = (await import("mammoth")).default;
          const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuf });
          setDocxHtml(result.value);
        } else {
          setFileUrl(url);
        }
      } catch (e) {
        console.error("File load error:", e);
      } finally {
        setFileLoading(false);
      }
    };

    Promise.all([
      fetch(`${API}/knowledge/${docId}`, { headers: authH }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/knowledge/${docId}/chunks`, { headers: authH }).then(r => r.ok ? r.json() : []),
    ])
      .then(([docData, chunksData]) => {
        setDoc(docData);
        setChunks(chunksData);
        if (docData?.storage_path) {
          loadFile(docData);
        }
      })
      .finally(() => setLoading(false));
  }, [userId, docId, API]);

  const handleDelete = async () => {
    if (!confirm("Delete this document and all its embeddings?")) return;
    await fetch(`${API}/knowledge/${docId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${userId}` },
    });
    router.push(`/projects/${projectId}`);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-amber-600 dark:text-amber" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-black/50 dark:text-white/50">Document not found.</p>
          <button onClick={() => router.back()} className="mt-3 text-sm text-amber-600 dark:text-amber hover:underline">
            Go back
          </button>
        </div>
      </div>
    );
  }

  const isPdf = doc.filename.toLowerCase().endsWith(".pdf");
  const isDocx = doc.filename.toLowerCase().endsWith(".docx");
  const isTxt = doc.filename.toLowerCase().endsWith(".txt");
  const hasFileView = fileUrl || docxHtml || txtContent;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-white/60 dark:bg-black/20 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="flex items-center gap-1.5 text-xs text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={12} /> Back
          </button>
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-amber-600 dark:text-amber" />
            <span className="text-sm font-semibold text-black/80 dark:text-white/80 truncate max-w-xs">{doc.filename}</span>
            <span className="text-xs text-black/30 dark:text-white/30">
              · {chunks.length} chunks indexed · {new Date(doc.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {fileUrl && (
            <a
              href={fileUrl}
              download={doc.filename}
              className="flex items-center gap-1.5 text-xs text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white px-2 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <Download size={13} /> Download
            </a>
          )}
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 text-xs text-black/30 dark:text-white/30 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {fileLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-black/40 dark:text-white/40">
              <Loader2 size={24} className="animate-spin text-amber-600 dark:text-amber" />
              <p className="text-sm">Loading file...</p>
            </div>
          </div>
        ) : isPdf && fileUrl ? (
          /* ── PDF Viewer ── */
          <iframe
            src={fileUrl}
            className="flex-1 w-full border-0"
            title={doc.filename}
          />
        ) : isDocx && docxHtml ? (
          /* ── DOCX Viewer ── */
          <div className="flex-1 overflow-y-auto px-10 py-8">
            <div
              className="prose prose-sm dark:prose-invert max-w-3xl mx-auto"
              dangerouslySetInnerHTML={{ __html: docxHtml }}
            />
          </div>
        ) : isTxt && txtContent ? (
          /* ── TXT Viewer ── */
          <div className="flex-1 overflow-y-auto px-10 py-8">
            <pre className="max-w-3xl mx-auto text-sm text-black/70 dark:text-white/70 whitespace-pre-wrap font-mono leading-relaxed">
              {txtContent}
            </pre>
          </div>
        ) : (
          /* ── No file stored — show chunks only ── */
          <div className="flex-1 overflow-y-auto px-10 py-8 max-w-3xl mx-auto w-full">
            <div className="mb-6 p-3 rounded-xl bg-amber-50 dark:bg-amber/5 border border-amber-100 dark:border-amber/10">
              <p className="text-xs text-amber-700 dark:text-amber/70">
                ⚠️ The original file wasn&apos;t stored (uploaded before storage was enabled). Re-upload the file to enable the preview. The AI still has full access to the indexed content below.
              </p>
            </div>
          </div>
        )}

        {/* Chunks accordion (always visible at bottom or full view when no file) */}
        <div className={`flex-shrink-0 border-t border-black/5 dark:border-white/5 ${!hasFileView && !fileLoading ? "flex-1 overflow-y-auto" : ""}`}>
          <button
            onClick={() => setChunksOpen(p => !p)}
            className="w-full flex items-center justify-between px-6 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40"
          >
            <span>📦 Indexed Chunks ({chunks.length})</span>
            {chunksOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>

          {chunksOpen && (
            <div className="max-h-72 overflow-y-auto px-6 pb-6 flex flex-col gap-3">
              {chunks.map((chunk, i) => (
                <div
                  key={chunk.id}
                  className="p-3 rounded-xl bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/5"
                >
                  <p className="text-[10px] font-mono text-black/30 dark:text-white/30 mb-1">Chunk {i + 1}</p>
                  <p className="text-xs text-black/60 dark:text-white/60 leading-relaxed whitespace-pre-wrap">{chunk.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
