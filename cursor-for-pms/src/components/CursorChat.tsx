"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MessageSquare,
  Send,
  Plus,
  Trash2,
  History,
  Image as ImageIcon,
  CheckSquare,
  ChevronDown,
  X,
  Bot,
  Sparkles,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useCustomAuth } from "@/hooks/useCustomAuth";
import { useEditorStore } from "@/store/editorStore";

const GEMINI_MODELS = [
  { id: "gemini-2.5-flash", label: "2.5 Flash" },
  { id: "gemini-2.5-flash-lite", label: "2.5 Flash Lite" },
  { id: "gemini-3-flash-preview", label: "3 Flash Preview" },
  { id: "gemini-3.1-flash-lite-preview", label: "3.1 Flash Lite" },
  { id: "gemini-2.0-flash", label: "2.0 Flash" },
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Thread {
  id: string;
  title: string;
  updated_at: string;
}

export default function CursorChat() {
  const params = useParams();
  const projectId = params?.projectId as string | undefined;
  const { userId } = useCustomAuth();
  const { applyFn, getText } = useEditorStore();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("pm_cursor_model") || "gemini-2.5-flash";
    }
    return "gemini-2.5-flash";
  });
  const [attachedImage, setAttachedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [applyingMsgId, setApplyingMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const API = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    if (!showModelPicker) return;
    const handler = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModelPicker]);

  useEffect(() => {
    if (!projectId || !userId) return;
    fetch(`${API}/ai/threads?project_id=${projectId}`, {
      headers: { Authorization: `Bearer ${userId}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then(setThreads)
      .catch(() => {});
  }, [projectId, userId, API]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);

  const loadThread = async (threadId: string) => {
    setActiveThreadId(threadId);
    setShowHistory(false);
    try {
      const res = await fetch(`${API}/ai/threads/${threadId}/messages`, {
        headers: { Authorization: `Bearer ${userId}` },
      });
      if (res.ok) {
        const msgs = await res.json();
        setMessages(msgs.map((m: { id: string; role: string; content: string }) => ({
          id: m.id, role: m.role, content: m.content,
        })));
      }
    } catch { /* ignore */ }
  };

  const deleteThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    await fetch(`${API}/ai/threads/${threadId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${userId}` },
    });
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (activeThreadId === threadId) { setActiveThreadId(null); setMessages([]); }
  };

  const newChat = () => {
    setActiveThreadId(null);
    setMessages([]);
    setAttachedImage(null);
    setImagePreview(null);
    setShowHistory(false);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachedImage(file);
    setImagePreview(URL.createObjectURL(file));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleApply = async (content: string, msgId: string) => {
    if (!applyFn) { alert("Open a document to use Apply."); return; }
    setApplyingMsgId(msgId);
    try { await applyFn(content); } finally { setApplyingMsgId(null); }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && !attachedImage) || isStreaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim() || "Analyze this screenshot",
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);

    const aiMessageId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: aiMessageId, role: "assistant", content: "" }]);

    try {
      let response: Response;

      if (attachedImage) {
        const formData = new FormData();
        formData.append("image", attachedImage);
        formData.append("prompt", userMessage.content);
        formData.append("document_context", getText?.() ?? "");
        formData.append("model_override", selectedModel);
        response = await fetch(`${API}/ai/review-ui`, {
          method: "POST",
          headers: { Authorization: `Bearer ${userId}` },
          body: formData,
        });
        setAttachedImage(null);
        setImagePreview(null);
      } else {
        const documentContext =
          getText?.() ??
          (document.querySelector(".ProseMirror") as HTMLElement | null)?.innerText ?? "";

        response = await fetch(`${API}/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${userId}` },
          body: JSON.stringify({
            messages: [...messages, userMessage].map((m) => ({ role: m.role, content: m.content })),
            document_context: documentContext,
            project_id: projectId,
            thread_id: activeThreadId,
            model_override: selectedModel,
          }),
        });

        const newThreadId = response.headers.get("X-Thread-Id");
        if (newThreadId && !activeThreadId) {
          setActiveThreadId(newThreadId);
          setThreads((prev) => [
            { id: newThreadId, title: userMessage.content.slice(0, 60), updated_at: new Date().toISOString() },
            ...prev,
          ]);
        }
      }

      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let aiText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            aiText += data.replace(/\\n/g, "\n");
            setMessages((prev) =>
              prev.map((msg) => msg.id === aiMessageId ? { ...msg, content: aiText } : msg)
            );
          }
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
    } finally {
      setIsStreaming(false);
    }
  };

  const selectedModelLabel = GEMINI_MODELS.find((m) => m.id === selectedModel)?.label ?? selectedModel;

  return (
    <div className="w-80 glass-pane h-full flex flex-col rounded-2xl shadow-2xl flex-shrink-0 transition-colors relative z-10">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-black/5 dark:border-white/5 flex items-center gap-2">
        <Sparkles size={14} className="text-amber-700 dark:text-amber flex-shrink-0" />
        <span className="font-serif tracking-wide text-sm font-semibold text-black/80 dark:text-ivory flex-1">
          AI Chat
        </span>

        {/* Model picker */}
        <div className="relative" ref={modelPickerRef}>
          <button
            onClick={() => setShowModelPicker((v) => !v)}
            title="Select model"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 border border-black/8 dark:border-white/8 transition-all"
          >
            <span className="max-w-[68px] truncate">{selectedModelLabel}</span>
            <ChevronDown size={9} className={`transition-transform flex-shrink-0 ${showModelPicker ? "rotate-180" : ""}`} />
          </button>

          {showModelPicker && (
            <div className="absolute right-0 top-full mt-1 z-50 glass-pane rounded-xl shadow-xl py-1 min-w-[152px]">
              <p className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-widest text-black/25 dark:text-white/25">
                Gemini Model
              </p>
              {GEMINI_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedModel(m.id);
                    localStorage.setItem("pm_cursor_model", m.id);
                    setShowModelPicker(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[12px] transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${
                    selectedModel === m.id
                      ? "text-amber-700 dark:text-amber font-semibold"
                      : "text-black/70 dark:text-white/60"
                  }`}
                >
                  {m.label}
                  {selectedModel === m.id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowHistory((v) => !v)}
          title="Chat history"
          className={`p-1 rounded-md transition-colors ${
            showHistory
              ? "text-amber-600 dark:text-amber bg-amber-50 dark:bg-amber/10"
              : "text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
          }`}
        >
          <History size={14} />
        </button>
        <button
          onClick={newChat}
          title="New chat"
          className="p-1 rounded-md text-black/30 dark:text-white/30 hover:text-amber-600 dark:hover:text-amber hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* ── Thread History Drawer ────────────────────────────── */}
      {showHistory && (
        <div className="border-b border-black/5 dark:border-white/5 max-h-52 overflow-y-auto bg-black/[0.02] dark:bg-black/20">
          {threads.length === 0 ? (
            <p className="text-[12px] text-center text-black/30 dark:text-white/30 py-5">
              No chat history yet
            </p>
          ) : (
            threads.map((thread) => (
              <div
                key={thread.id}
                role="button"
                tabIndex={0}
                onClick={() => loadThread(thread.id)}
                onKeyDown={(e) => e.key === "Enter" && loadThread(thread.id)}
                className={`group w-full flex items-center gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                  activeThreadId === thread.id
                    ? "bg-amber-50/70 dark:bg-amber/5 border-l-2 border-amber-400 dark:border-amber/60"
                    : ""
                }`}
              >
                <MessageSquare size={11} className="flex-shrink-0 text-black/20 dark:text-white/20" />
                <span className="flex-1 text-[12px] text-black/70 dark:text-white/70 truncate leading-snug">
                  {thread.title}
                </span>
                <button
                  onClick={(e) => deleteThread(e, thread.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500 text-black/30 dark:text-white/30 transition-all flex-shrink-0"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Messages ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-2 text-center">
            <Bot size={28} className="text-black/15 dark:text-white/15" />
            <div>
              <p className="text-[13px] text-black/40 dark:text-white/40 leading-relaxed">
                Ask about your document, get strategic advice, or attach a screenshot for UI review.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 w-full mt-1">
              {["Summarize this document", "Write acceptance criteria", "Identify risks"].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-left px-3 py-2 rounded-lg text-[11px] text-black/50 dark:text-white/40 border border-black/8 dark:border-white/8 hover:border-amber-400/50 dark:hover:border-amber/30 hover:text-amber-700 dark:hover:text-amber hover:bg-amber-50/50 dark:hover:bg-amber/5 transition-all"
                >
                  {s} →
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div className="flex items-center gap-1.5 text-[11px] text-black/40 dark:text-white/40 font-semibold uppercase tracking-wider">
                {msg.role === "user" ? (
                  <span>You</span>
                ) : (
                  <>
                    <Bot size={10} />
                    <span>AI</span>
                  </>
                )}
              </div>

              <div
                className={`text-[13px] leading-relaxed rounded-xl p-3 max-w-[95%] ${
                  msg.role === "user"
                    ? "bg-amber-100/50 dark:bg-amber-900/20 text-black/80 dark:text-amber-50 border border-amber-200/50 dark:border-amber/10"
                    : "bg-white/50 dark:bg-black/20 border border-black/5 dark:border-white/5 text-black dark:text-ivory chat-markdown"
                }`}
              >
                {msg.role === "assistant" ? (
                  msg.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <span className="inline-flex gap-1 items-center text-black/25 dark:text-white/25">
                      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                    </span>
                  )
                ) : (
                  msg.content
                )}
              </div>

              {msg.role === "assistant" && !isStreaming && msg.content && (
                <button
                  onClick={() => handleApply(msg.content, msg.id)}
                  disabled={applyingMsgId === msg.id || !applyFn}
                  className="flex items-center gap-1 mt-0.5 text-[10px] text-amber-600 dark:text-amber/70 hover:text-amber-800 dark:hover:text-amber transition-colors ml-1 font-medium disabled:opacity-40"
                >
                  <CheckSquare size={10} />
                  {applyingMsgId === msg.id ? "Applying…" : "Apply to document"}
                </button>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Image Preview ───────────────────────────────────── */}
      {imagePreview && (
        <div className="px-4 pb-2">
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Attached screenshot"
              className="h-16 rounded-lg border border-black/10 dark:border-white/10 object-cover"
            />
            <button
              onClick={() => { setAttachedImage(null); setImagePreview(null); }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/60 hover:bg-black/80 rounded-full text-white flex items-center justify-center transition-colors shadow"
            >
              <X size={10} />
            </button>
          </div>
        </div>
      )}

      {/* ── Input ───────────────────────────────────────────── */}
      <div className="p-4 border-t border-black/5 dark:border-white/5">
        <div className="relative flex items-end gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach screenshot for UI review"
            className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
              attachedImage
                ? "text-amber-600 dark:text-amber bg-amber-50 dark:bg-amber/10"
                : "text-black/30 dark:text-white/30 hover:text-amber-600 dark:hover:text-amber hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <ImageIcon size={15} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
            }}
            placeholder={attachedImage ? "Describe what to analyse…" : "Ask a question…"}
            rows={1}
            className="flex-1 text-[13px] leading-relaxed border border-black/10 dark:border-white/10 rounded-xl p-3 pr-10 resize-none bg-white/50 dark:bg-black/20 text-black dark:text-ivory focus:outline-none focus:ring-1 focus:ring-amber-500 dark:focus:ring-amber/50 transition-colors shadow-inner"
            style={{ maxHeight: 120 }}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={(!input.trim() && !attachedImage) || isStreaming}
            className="absolute right-2 bottom-2 p-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:hover:bg-amber-500 transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="text-[10px] text-center text-black/30 dark:text-white/30 mt-2">
          Access to your document · ⌘⇧F to search
        </p>
      </div>
    </div>
  );
}
