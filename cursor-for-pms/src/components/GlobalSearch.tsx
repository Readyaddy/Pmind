"use client";

import { useState, useEffect, useRef } from "react";
import { Search, FileText, BookOpen, X, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCustomAuth } from "@/hooks/useCustomAuth";

interface SearchResult {
  type: "document" | "knowledge";
  id: string;
  title?: string;
  content: string;
  project_id?: string;
  knowledge_document_id?: string;
  similarity: number;
}

export default function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { userId } = useCustomAuth();
  const router = useRouter();
  const API = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/ai/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userId}`,
          },
          body: JSON.stringify({ query, scope: "all" }),
        });
        const data = await res.json();
        setResults(data.results || []);
      } catch { /* ignore */ }
      setLoading(false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, userId, API]);

  const handleSelect = (result: SearchResult) => {
    if (result.type === "document" && result.project_id) {
      router.push(`/projects/${result.project_id}/docs/${result.id}`);
    } else if (result.type === "knowledge" && result.knowledge_document_id && result.project_id) {
      router.push(`/projects/${result.project_id}/knowledge/${result.knowledge_document_id}`);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 dark:bg-black/70 backdrop-blur-sm z-[100] flex items-start justify-center pt-[15vh]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[600px] bg-white dark:bg-[#0A0A0A] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-black/5 dark:border-white/5">
          <Search size={16} className="text-black/40 dark:text-white/40 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder="Search documents and knowledge base..."
            className="flex-1 text-[15px] bg-transparent outline-none text-black dark:text-ivory placeholder-black/30 dark:placeholder-white/30"
          />
          {loading && (
            <span className="text-[11px] text-black/30 dark:text-white/30 flex-shrink-0">
              Searching…
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-black/40 dark:text-white/40 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {results.length > 0 && (
          <div className="max-h-[400px] overflow-y-auto py-2">
            <div className="px-3 pb-1">
              <span className="text-[10px] uppercase tracking-widest text-black/30 dark:text-white/30">
                Results
              </span>
            </div>
            {results.map((result, i) => (
              <button
                key={i}
                onClick={() => handleSelect(result)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 text-left transition-colors"
              >
                <div className="mt-0.5 flex-shrink-0">
                  {result.type === "document" ? (
                    <FileText size={14} className="text-amber-600 dark:text-amber" />
                  ) : (
                    <BookOpen size={14} className="text-blue-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-black dark:text-ivory truncate">
                    {result.title || result.content.slice(0, 60)}
                  </p>
                  <p className="text-[11px] text-black/40 dark:text-white/40 line-clamp-2 mt-0.5 leading-relaxed">
                    {result.content}
                  </p>
                </div>
                <ArrowRight size={12} className="text-black/20 dark:text-white/20 flex-shrink-0 mt-1" />
              </button>
            ))}
          </div>
        )}

        {query && !loading && results.length === 0 && (
          <div className="px-4 py-10 text-center text-[13px] text-black/40 dark:text-white/40">
            No results found for &quot;{query}&quot;
          </div>
        )}

        {!query && (
          <div className="px-4 py-8 text-center">
            <p className="text-[12px] text-black/30 dark:text-white/30">
              Search across all documents and knowledge base
            </p>
            <p className="text-[11px] text-black/20 dark:text-white/20 mt-1">
              Tip: searches by semantic meaning, not just keywords
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
