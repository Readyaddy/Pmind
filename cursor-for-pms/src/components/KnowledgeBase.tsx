"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, X, FileText, Loader2, Trash2, ChevronRight, Eye } from "lucide-react";
import { useCustomAuth as useAuth } from "@/hooks/useCustomAuth";
import { useRouter } from "next/navigation";
import ConfirmDialog from "./ConfirmDialog";

interface KnowledgeDocument {
  id: string;
  filename: string;
  file_type: string;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  color: string;
}

export default function KnowledgeBase({
  projectId: propProjectId,
  compact = false,
  triggerClassName,
}: {
  projectId?: string;
  compact?: boolean;
  triggerClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"pick-project" | "upload">(propProjectId ? "upload" : "pick-project");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(propProjectId ?? null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<KnowledgeDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { userId } = useAuth();
  const API = process.env.NEXT_PUBLIC_API_URL;
  const router = useRouter();

  // Reset to correct initial step each time modal opens
  const openModal = () => {
    if (propProjectId) {
      setSelectedProjectId(propProjectId);
      setStep("upload");
    } else {
      setSelectedProjectId(null);
      setStep("pick-project");
    }
    setIsOpen(true);
  };

  // Load project list when on pick-project step
  useEffect(() => {
    if (!isOpen || step !== "pick-project" || !userId) return;
    fetch(`${API}/projects/`, { headers: { Authorization: `Bearer ${userId}` } })
      .then(r => r.ok ? r.json() : [])
      .then(setProjects)
      .catch(() => {});
  }, [isOpen, step, userId, API]);

  // Load documents when on upload step
  useEffect(() => {
    if (!isOpen || step !== "upload" || !selectedProjectId || !userId) return;
    fetch(`${API}/knowledge/?project_id=${selectedProjectId}`, {
      headers: { Authorization: `Bearer ${userId}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(setDocuments)
      .catch(() => {});
  }, [isOpen, step, selectedProjectId, userId, API]);

  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });

  const uploadFiles = async (files: File[]) => {
    if (!selectedProjectId || files.length === 0) return;
    setIsUploading(true);
    setUploadProgress({ done: 0, total: files.length });

    const failures: string[] = [];
    let cursor = 0;
    const runners = Array.from({ length: Math.min(3, files.length) }, async () => {
      while (cursor < files.length) {
        const file = files[cursor++];
        try {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("project_id", selectedProjectId);
          const res = await fetch(`${API}/knowledge/`, {
            method: "POST",
            headers: { Authorization: `Bearer ${userId}` },
            body: fd,
          });
          if (!res.ok) failures.push(file.name);
        } catch {
          failures.push(file.name);
        } finally {
          setUploadProgress(p => ({ ...p, done: p.done + 1 }));
        }
      }
    });
    await Promise.all(runners);

    // Refresh document list once at the end
    try {
      const updated = await fetch(`${API}/knowledge/?project_id=${selectedProjectId}`, {
        headers: { Authorization: `Bearer ${userId}` },
      });
      if (updated.ok) setDocuments(await updated.json());
    } catch { /* ignore */ }

    if (failures.length) {
      alert(
        failures.length === files.length
          ? "All uploads failed. Check the file types are readable."
          : `${failures.length} of ${files.length} failed: ${failures.slice(0, 5).join(", ")}${failures.length > 5 ? "…" : ""}`
      );
    }

    setIsUploading(false);
    setUploadProgress({ done: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) await uploadFiles(files);
  };

  const handleDelete = async (docId: string) => {
    try {
      await fetch(`${API}/knowledge/${docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userId}` },
      });
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch { /* ignore */ }
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <>
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete.filename}"?`}
          message="This file and all its embedded content will be permanently deleted."
          onConfirm={() => { handleDelete(confirmDelete.id); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {compact ? (
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber hover:underline"
        >
          <Upload size={12} /> Upload file
        </button>
      ) : triggerClassName ? (
        <button onClick={openModal} className={triggerClassName}>
          <Upload size={18} className="text-amber-600 dark:text-amber" />
          <span className="text-sm font-semibold text-black/70 dark:text-white/70">Upload to KB</span>
          <span className="text-xs text-black/40 dark:text-white/40">PDFs, interviews, docs</span>
        </button>
      ) : (
        <button
          onClick={openModal}
          className="w-full mt-2 text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40 hover:text-amber-600 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-between"
        >
          <span>Knowledge Base</span>
          <Upload size={12} />
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/40 backdrop-blur-sm">
          <div className="w-[480px] bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 shadow-2xl rounded-2xl overflow-hidden flex flex-col">

            {/* Header */}
            <div className="px-5 py-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {step === "upload" && !propProjectId && (
                  <button
                    onClick={() => setStep("pick-project")}
                    className="text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white mr-1"
                  >
                    <ChevronRight size={16} className="rotate-180" />
                  </button>
                )}
                <h3 className="font-serif font-semibold text-lg text-black/80 dark:text-white/80">
                  {step === "pick-project" ? "Which project?" : "Knowledge Base"}
                </h3>
                {step === "upload" && selectedProject && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber/10 text-amber-700 dark:text-amber font-medium">
                    {selectedProject.name}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">

              {/* Step 1: Project picker */}
              {step === "pick-project" && (
                <>
                  <p className="text-sm text-black/60 dark:text-white/60">
                    Select the project this file belongs to. It will be available for AI queries within that project.
                  </p>
                  {projects.length === 0 ? (
                    <p className="text-sm text-black/40 dark:text-white/40 text-center py-6">No projects yet.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {projects.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setSelectedProjectId(p.id); setStep("upload"); }}
                          className="flex items-center gap-3 p-3 rounded-xl border border-black/5 dark:border-white/5 hover:border-amber-300 dark:hover:border-amber/40 hover:bg-amber-50/50 dark:hover:bg-amber/5 transition-all text-left"
                        >
                          <div
                            className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
                            style={{ background: p.color || "#D97706" }}
                          >
                            {p.name[0].toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-black/80 dark:text-white/80">{p.name}</span>
                          <ChevronRight size={14} className="ml-auto text-black/20 dark:text-white/20" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Step 2: Upload */}
              {step === "upload" && (
                <>
                  <p className="text-sm text-black/60 dark:text-white/60">
                    Upload user interviews, strategy docs, or PDFs. The AI will automatically search through them when answering questions in the chat.
                  </p>

                  <div
                    className="border-2 border-dashed border-black/10 dark:border-white/10 rounded-xl p-8 text-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const files = Array.from(e.dataTransfer.files || []);
                      if (files.length) void uploadFiles(files);
                    }}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="*"
                      multiple
                      onChange={handleFileChange}
                    />
                    {isUploading ? (
                      <div className="flex flex-col items-center gap-2 text-amber-600">
                        <Loader2 size={24} className="animate-spin" />
                        <span className="text-sm font-semibold">
                          {uploadProgress.total > 1
                            ? `Processing ${uploadProgress.done}/${uploadProgress.total}…`
                            : "Processing & Embedding…"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-black/40 dark:text-white/40">
                        <Upload size={24} />
                        <div>
                          <p className="text-sm font-semibold">Click or drag & drop to upload</p>
                          <p className="text-xs mt-1 text-black/30 dark:text-white/30">
                            Multiple files supported · PDF · DOCX · MD · TXT · CSV · JSON · HTML · YAML
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {documents.length > 0 && (
                    <div className="mt-2 flex flex-col gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40 mb-1">
                        Uploaded Files
                      </h4>
                      {documents.map(doc => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5"
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <FileText size={16} className="text-amber-600 flex-shrink-0" />
                            <span className="text-sm font-medium text-black/80 dark:text-white/80 truncate">{doc.filename}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setIsOpen(false);
                                router.push(`/projects/${selectedProjectId}/knowledge/${doc.id}`);
                              }}
                              className="text-black/30 hover:text-amber-600 dark:hover:text-amber transition-colors p-1"
                              title="View file"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(doc)}
                              className="text-black/30 hover:text-red-500 transition-colors p-1"
                              title="Delete file"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
