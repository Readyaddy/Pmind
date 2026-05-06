import { useState, useRef, useEffect } from "react";
import { Upload, X, FileText, Loader2, Trash2 } from "lucide-react";
import { useCustomAuth as useAuth } from "@/hooks/useCustomAuth";

interface KnowledgeDocument {
  id: string;
  filename: string;
  file_type: string;
  created_at: string;
}

export default function KnowledgeBase({
  projectId,
  compact = false,
  triggerClassName,
}: {
  projectId: string;
  compact?: boolean;
  triggerClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { userId } = useAuth();

  useEffect(() => {
    if (isOpen && projectId) {
      loadDocuments();
    }
  }, [isOpen, projectId]);

  const loadDocuments = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/knowledge/?project_id=${projectId}`, {
        headers: { Authorization: `Bearer ${userId}` },
      });
      if (res.ok) {
        setDocuments(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project_id", projectId);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/knowledge/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${userId}` }, // multipart/form-data boundary is automatically set
        body: formData,
      });

      if (res.ok) {
        await loadDocuments();
      } else {
        alert("Upload failed. Ensure it's a PDF, DOCX, or TXT.");
      }
    } catch (e) {
      console.error(e);
      alert("Upload failed.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/knowledge/${docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userId}` },
      });
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      {compact ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber hover:underline"
        >
          <Upload size={12} />
          Upload file
        </button>
      ) : triggerClassName ? (
        <button onClick={() => setIsOpen(true)} className={triggerClassName}>
          <Upload size={18} className="text-amber-600 dark:text-amber" />
          <span className="text-sm font-semibold text-black/70 dark:text-white/70">Upload to KB</span>
          <span className="text-xs text-black/40 dark:text-white/40">PDFs, interviews, docs</span>
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="w-full mt-2 text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40 hover:text-amber-600 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-between"
        >
          <span>Knowledge Base</span>
          <Upload size={12} />
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm">
          <div className="w-[480px] bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 shadow-2xl rounded-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
              <h3 className="font-serif font-semibold text-lg text-black/80 dark:text-white/80">Project Knowledge Base</h3>
              <button onClick={() => setIsOpen(false)} className="text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-black/60 dark:text-white/60">
                Upload user interviews, strategy docs, or PDFs. The AI will automatically search through them when answering questions in the chat.
              </p>

              <div 
                className="border-2 border-dashed border-black/10 dark:border-white/10 rounded-xl p-8 text-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".pdf,.txt,.docx"
                  onChange={handleFileChange}
                />
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2 text-amber-600">
                    <Loader2 size={24} className="animate-spin" />
                    <span className="text-sm font-semibold">Processing & Embedding...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-black/40 dark:text-white/40">
                    <Upload size={24} />
                    <span className="text-sm font-semibold">Click to upload (PDF, DOCX, TXT)</span>
                  </div>
                )}
              </div>

              {documents.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40 mb-1">Uploaded Files</h4>
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileText size={16} className="text-amber-600 flex-shrink-0" />
                        <span className="text-sm font-medium text-black/80 dark:text-white/80 truncate">{doc.filename}</span>
                      </div>
                      <button 
                        onClick={() => handleDelete(doc.id)}
                        className="text-black/30 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
