"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MessageSquare,
  Send,
  Plus,
  Trash2,
  History,
  Image as ImageIcon,
  CheckSquare,
  X,
  Bot,
  Sparkles,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useCustomAuth } from "@/hooks/useCustomAuth";
import { useEditorStore } from "@/store/editorStore";
import { useProductBrain } from "@/store/productBrain";
import { useActiveProject } from "@/store/activeProject";
import ToolCallBlock, { type ToolCall } from "./agent/ToolCallBlock";
import CitationChip, { type Source } from "./agent/CitationChip";
import PermissionPrompt from "./agent/PermissionPrompt";
import MentionPicker, { type MentionItem } from "./agent/MentionPicker";
import ArtifactCard, { type ArtifactArgs } from "./agent/ArtifactCard";
import CritiqueCard, { type Critique } from "./agent/CritiqueCard";

const PERMISSION_TOOLS = new Set(["create_doc", "edit_doc", "create_folder"]);
const TREE_REFRESH_TOOLS = new Set(["create_doc", "edit_doc", "create_folder"]);

type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "tool"; call: ToolCall };

interface Message {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  sources: Source[]; // accumulated across tool_results in this message
  errored?: boolean;
}

interface Thread {
  id: string;
  title: string;
  updated_at: string;
}

interface PendingDecision {
  tool_call_id: string;
  decision: "approve" | "deny";
  reason?: string;
}

// Helpers ─────────────────────────────────────────────────────────────────────

const messageText = (m: Message): string =>
  m.parts.filter((p) => p.kind === "text").map((p) => (p as { text: string }).text).join("");

function appendText(parts: MessagePart[], delta: string): MessagePart[] {
  if (parts.length > 0 && parts[parts.length - 1].kind === "text") {
    const last = parts[parts.length - 1] as { kind: "text"; text: string };
    return [...parts.slice(0, -1), { kind: "text", text: last.text + delta }];
  }
  return [...parts, { kind: "text", text: delta }];
}

function upsertToolCall(parts: MessagePart[], call: ToolCall): MessagePart[] {
  const idx = parts.findIndex((p) => p.kind === "tool" && p.call.id === call.id);
  if (idx === -1) return [...parts, { kind: "tool", call }];
  return parts.map((p, i) => (i === idx ? { kind: "tool", call } : p));
}

function updateToolCall(
  parts: MessagePart[],
  id: string,
  update: Partial<ToolCall>,
): MessagePart[] {
  return parts.map((p) => {
    if (p.kind !== "tool" || p.call.id !== id) return p;
    return { kind: "tool", call: { ...p.call, ...update } };
  });
}

// Walk a rendered React tree replacing string children "foo [1] bar" with
// inline citation chips. Recursive so [n] markers inside <strong>, <em>,
// <td>, list items, etc. all get injected without tearing the markdown.
function injectCitations(node: React.ReactNode, sources: Source[]): React.ReactNode {
  if (typeof node === "string") {
    if (!/\[\d+\]/.test(node)) return node;
    const segs = node.split(/(\[\d+\])/g);
    return segs.map((s, i) => {
      const m = s.match(/^\[(\d+)\]$/);
      if (m) {
        const n = parseInt(m[1], 10);
        return (
          <CitationChip
            key={`c-${i}`}
            index={n}
            source={sources[n - 1] ?? null}
          />
        );
      }
      return <React.Fragment key={`s-${i}`}>{s}</React.Fragment>;
    });
  }
  if (Array.isArray(node)) {
    return node.map((c, i) => (
      <React.Fragment key={`f-${i}`}>{injectCitations(c, sources)}</React.Fragment>
    ));
  }
  if (
    React.isValidElement(node) &&
    (node.props as { children?: React.ReactNode })?.children !== undefined
  ) {
    const props = node.props as { children: React.ReactNode };
    return React.cloneElement(
      node,
      undefined,
      injectCitations(props.children, sources),
    );
  }
  return node;
}

// Render the entire text as one markdown tree, then inject citation chips
// recursively so block-level elements (tables, lists, code blocks) survive.
function renderTextWithCitations(text: string, sources: Source[]) {
  const wrap = (Tag: keyof React.JSX.IntrinsicElements) => {
    const Wrapped = ({ children, ...rest }: { children?: React.ReactNode }) =>
      React.createElement(Tag, rest, injectCitations(children, sources));
    Wrapped.displayName = `MD_${Tag}`;
    return Wrapped;
  };
  const components: Components = {
    p: wrap("p"),
    li: wrap("li"),
    td: wrap("td"),
    th: wrap("th"),
    h1: wrap("h1"),
    h2: wrap("h2"),
    h3: wrap("h3"),
    h4: wrap("h4"),
    blockquote: wrap("blockquote"),
  };
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </ReactMarkdown>
  );
}

// Convert UI messages → wire format (preserving tool_calls and tool_results so
// the server can find pending calls).
function serializeForWire(messages: Message[]): Array<{
  role: "user" | "assistant" | "tool";
  content?: string;
  blocks?: Array<Record<string, unknown>>;
}> {
  const out: Array<{
    role: "user" | "assistant" | "tool";
    content?: string;
    blocks?: Array<Record<string, unknown>>;
  }> = [];

  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: messageText(m) });
      continue;
    }
    // assistant: blocks for text + tool_calls
    const asstBlocks: Array<Record<string, unknown>> = [];
    const toolBlocks: Array<Record<string, unknown>> = [];
    for (const p of m.parts) {
      if (p.kind === "text" && p.text) {
        asstBlocks.push({ type: "text", text: p.text });
      } else if (p.kind === "tool") {
        asstBlocks.push({
          type: "tool_call",
          id: p.call.id,
          name: p.call.name,
          args: p.call.args,
          ...(p.call._thought_sig ? { _thought_sig: p.call._thought_sig } : {}),
        });
        // If this call already has a result on the client, mirror it as a
        // tool_result in the following tool turn so the server doesn't think
        // it's still pending.
        if (p.call.status === "done" && (p.call.summary || p.call.sources)) {
          toolBlocks.push({
            type: "tool_result",
            tool_call_id: p.call.id,
            name: p.call.name,
            content: p.call.summary || "",
          });
        }
      }
    }
    if (asstBlocks.length) out.push({ role: "assistant", blocks: asstBlocks });
    if (toolBlocks.length) out.push({ role: "tool", blocks: toolBlocks });
  }
  return out;
}

function isPermissionVisual(call: ToolCall): boolean {
  if (!PERMISSION_TOOLS.has(call.name)) return false;
  return (
    call.status === "awaiting_permission" ||
    call.status === "denied" ||
    call.status === "approved"
  );
}

// Component ───────────────────────────────────────────────────────────────────

export default function CursorChat() {
  const params = useParams();
  const { projectId: activeProjectId } = useActiveProject();
  const projectId = (params?.projectId as string | undefined) ?? activeProjectId ?? undefined;
  const { userId } = useCustomAuth();
  const { applyFn, getText, docTitle } = useEditorStore();
  const productContext = useProductBrain((s) =>
    projectId ? s.contexts[projectId] ?? "" : "",
  );

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [attachedImage, setAttachedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [applyingMsgId, setApplyingMsgId] = useState<string | null>(null);
  const [providerLabel, setProviderLabel] = useState<string>("");
  const [agentPlan, setAgentPlan] = useState<"free" | "pro" | "team">("free");
  const [proModels, setProModels] = useState<{ id: string; label: string; description: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() =>
    typeof window !== "undefined" ? (localStorage.getItem("pm_cursor_agent_model") ?? "") : ""
  );
  const [trustWrites, setTrustWrites] = useState(false);

  // @-mention state
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const [mentionTrigger, setMentionTrigger] = useState<{
    start: number;       // index of '@' in input
    query: string;       // text after '@' so far
  } | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  // Tagged files attached to the next outgoing message
  const [mentions, setMentions] = useState<MentionItem[]>([]);

  const [lastDesignDocId, setLastDesignDocId] = useState<string | null>(null);
  const lastDesignDocIdRef = useRef<string | null>(null);
  const isRefiningRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Message[]>(messages);
  const trustWritesRef = useRef(trustWrites);
  messagesRef.current = messages;
  trustWritesRef.current = trustWrites;

  const API = process.env.NEXT_PUBLIC_API_URL;

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
    if (!userId) return;
    const CACHE_KEY = `pm_agent_info_${userId}`;
    const TTL = 5 * 60 * 1000; // 5 minutes
    const applyInfo = (d: Record<string, unknown>) => {
      const provider = (d.provider as string) || "";
      setProviderLabel(provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "");
      setAgentPlan((d.plan as "free" | "pro" | "team") ?? "free");
      if (Array.isArray(d.pro_models)) setProModels(d.pro_models as typeof proModels);
    };
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: Record<string, unknown>; ts: number };
        if (Date.now() - ts < TTL) { applyInfo(data); return; }
      }
    } catch { /* ignore bad cache */ }
    fetch(`${API}/ai/agent/info`, { headers: { Authorization: `Bearer ${userId}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        applyInfo(d);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: d, ts: Date.now() })); } catch { /* ignore */ }
      })
      .catch(() => {});
  }, [API, userId]);

  // Load taggable files (project docs + KB) when project changes
  useEffect(() => {
    if (!projectId || !userId) return;
    Promise.all([
      fetch(`${API}/projects/${projectId}/documents/`, {
        headers: { Authorization: `Bearer ${userId}` },
      }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`${API}/knowledge/?project_id=${projectId}`, {
        headers: { Authorization: `Bearer ${userId}` },
      }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([docs, kb]) => {
      const docItems = Array.isArray(docs)
        ? docs.map((d: { id: string; title: string }) => ({
            id: d.id,
            name: d.title || "Untitled",
            kind: "doc" as const,
          }))
        : [];
      const kbItems = Array.isArray(kb)
        ? kb.map((k: { id: string; filename: string }) => ({
            id: k.id,
            name: k.filename,
            kind: "kb" as const,
          }))
        : [];
      setMentionItems([...docItems, ...kbItems]);
    }).catch(() => {});
  }, [API, projectId, userId]);

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
        setMessages(
          msgs.map((m: { id: string; role: string; content: string }) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            parts: [{ kind: "text", text: m.content }],
            sources: [],
          })),
        );
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

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) {
      setAttachedImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleApply = async (content: string, msgId: string) => {
    if (!applyFn) { alert("Open a document to use Apply."); return; }
    setApplyingMsgId(msgId);
    try { await applyFn(content); } finally { setApplyingMsgId(null); }
  };

  // ── @-mention ─────────────────────────────────────────────────────────────
  // Detect "@query" right before the cursor and surface the picker.
  const updateMentionTrigger = useCallback((value: string, cursorPos: number) => {
    const before = value.slice(0, cursorPos);
    // Find the last '@' that isn't preceded by a non-whitespace
    const at = before.lastIndexOf("@");
    if (at === -1) { setMentionTrigger(null); return; }
    // '@' must be at start or after whitespace
    if (at > 0 && !/\s/.test(before[at - 1])) { setMentionTrigger(null); return; }
    const query = before.slice(at + 1);
    // Cancel if there's whitespace in the query (user moved past the mention)
    if (/\s/.test(query)) { setMentionTrigger(null); return; }
    setMentionTrigger({ start: at, query });
    setMentionIdx(0);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    updateMentionTrigger(value, e.target.selectionStart ?? value.length);
  };

  const filteredMentions = mentionTrigger
    ? mentionItems
        .filter((it) =>
          it.name.toLowerCase().includes(mentionTrigger.query.toLowerCase()),
        )
        .slice(0, 8)
    : [];

  const pickMention = useCallback((item: MentionItem) => {
    if (!mentionTrigger) return;
    const before = input.slice(0, mentionTrigger.start);
    const afterCursor = input.slice(
      (textareaRef.current?.selectionStart ?? input.length),
    );
    const insertion = `@${item.name} `;
    const newValue = before + insertion + afterCursor;
    setInput(newValue);
    setMentionTrigger(null);
    // Add to mentions if not already there
    setMentions((prev) =>
      prev.find((m) => m.id === item.id && m.kind === item.kind)
        ? prev
        : [...prev, item],
    );
    // Restore cursor position after the insertion
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      const newPos = before.length + insertion.length;
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    });
  }, [input, mentionTrigger]);

  // ── Stream a /ai/agent SSE response into an existing assistant message ────
  // Returns the list of awaiting_permission tool_call ids that arrived in
  // this stream (so trust-mode can auto-approve them).
  const streamAgentInto = useCallback(async (
    aiId: string,
    body: Record<string, unknown>,
  ): Promise<string[]> => {
    const awaitingIds: string[] = [];
    const response = await fetch(`${API}/ai/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${userId}` },
      body: JSON.stringify(body),
    });

    const newThreadId = response.headers.get("X-Thread-Id");
    if (newThreadId && !activeThreadId) {
      setActiveThreadId(newThreadId);
    }

    if (!response.body) throw new Error("No response body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let sawTreeMutation = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIdx;
      while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);

        let eventType = "message";
        let dataStr = "";
        for (const line of raw.split("\n")) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim();
          else if (line.startsWith("data: ")) dataStr += line.slice(6);
        }
        if (!dataStr) continue;
        let payload: Record<string, unknown>;
        try { payload = JSON.parse(dataStr); } catch { continue; }

        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== aiId) return m;
            if (eventType === "text") {
              const delta = (payload.delta as string) ?? "";
              return { ...m, parts: appendText(m.parts, delta) };
            }
            if (eventType === "tool_call") {
              const status = (payload.status as ToolCall["status"]) ?? "running";
              const callId = payload.id as string;
              if (status === "awaiting_permission") awaitingIds.push(callId);
              const existingPart = m.parts.find(
                (p) => p.kind === "tool" && p.call.id === callId,
              );
              const existing =
                existingPart && existingPart.kind === "tool"
                  ? existingPart.call
                  : null;
              const call: ToolCall = {
                id: callId,
                name: payload.name as string,
                args: (payload.args as Record<string, unknown>) ?? {},
                status,
                summary: existing?.summary,
                sources: existing?.sources,
                _thought_sig: (payload._thought_sig as string) ?? existing?._thought_sig,
              };
              return { ...m, parts: upsertToolCall(m.parts, call) };
            }
            if (eventType === "tool_result") {
              const id = payload.id as string;
              const sources = (payload.sources as Source[]) ?? [];
              const matched = m.parts.find(
                (p) => p.kind === "tool" && p.call.id === id,
              );
              if (matched && matched.kind === "tool" && TREE_REFRESH_TOOLS.has(matched.call.name)) {
                sawTreeMutation = true;
              }
              return {
                ...m,
                parts: updateToolCall(m.parts, id, {
                  status: "done",
                  summary: payload.summary as string,
                  sources,
                  payload: payload.payload,
                }),
                sources: [...m.sources, ...sources],
              };
            }
            if (eventType === "error") {
              const err = (payload.message as string) ?? "Agent error";
              return {
                ...m,
                parts: appendText(m.parts, `\n\n_Error: ${err}_`),
                errored: true,
              };
            }
            return m;
          }),
        );

        if (eventType === "done") break;
      }
    }

    if (sawTreeMutation && projectId) {
      window.dispatchEvent(
        new CustomEvent("pmind:refresh-tree", { detail: { projectId } }),
      );
    }
    return awaitingIds;
  }, [API, userId, activeThreadId, projectId]);

  // ── Resume an in-flight assistant message with permission decisions ───────
  const resumeAgent = useCallback(async (
    aiId: string,
    decisions: PendingDecision[],
  ) => {
    if (!projectId) return;

    // Mark gated calls per their decision so the UI flips immediately
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== aiId) return m;
        let parts = m.parts;
        for (const d of decisions) {
          parts = updateToolCall(parts, d.tool_call_id, {
            status: d.decision === "approve" ? "approved" : "denied",
          });
        }
        return { ...m, parts };
      }),
    );

    setIsStreaming(true);
    try {
      const documentContext =
        getText?.() ??
        (document.querySelector(".ProseMirror") as HTMLElement | null)?.innerText ??
        "";
      const wire = serializeForWire(messagesRef.current);
      const awaitingIds = await streamAgentInto(aiId, {
        messages: wire,
        document_context: documentContext,
        product_context: productContext,
        project_id: projectId,
        thread_id: activeThreadId,
        pending_decisions: decisions,
        ...(selectedModel ? { model_override: selectedModel } : {}),
      });

      if (trustWritesRef.current && awaitingIds.length > 0) {
        await resumeAgent(
          aiId,
          awaitingIds.map((id) => ({ tool_call_id: id, decision: "approve" })),
        );
      }
    } catch (err) {
      console.error("Resume error:", err);
      setMessages((prev) =>
        prev.map((m) => m.id === aiId
          ? { ...m, parts: appendText(m.parts, "\n\n_Connection error._"), errored: true }
          : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }, [activeThreadId, productContext, projectId, getText, streamAgentInto]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault();
    const effectiveInput = overrideText ?? input;
    if ((!effectiveInput.trim() && !attachedImage) || isStreaming) return;

    const userText = effectiveInput.trim() || "Analyze this screenshot";
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      parts: [{ kind: "text", text: userText }],
      sources: [],
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);

    const aiId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: aiId, role: "assistant", parts: [], sources: [] }]);

    try {
      // Image path: existing /ai/review-ui (vision)
      if (attachedImage) {
        const formData = new FormData();
        formData.append("image", attachedImage);
        formData.append("prompt", userText);
        formData.append("document_context", getText?.() ?? "");
        if (selectedModel) formData.append("model_override", selectedModel);
        const response = await fetch(`${API}/ai/review-ui`, {
          method: "POST",
          headers: { Authorization: `Bearer ${userId}` },
          body: formData,
        });
        setAttachedImage(null);
        setImagePreview(null);

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
                prev.map((m) => m.id === aiId
                  ? { ...m, parts: [{ kind: "text", text: aiText }] }
                  : m,
                ),
              );
            }
          }
        }
        return;
      }

      // Text path: agent endpoint
      const documentContext =
        getText?.() ??
        (document.querySelector(".ProseMirror") as HTMLElement | null)?.innerText ??
        "";

      // Snapshot message list synchronously: messages state may not have userMsg
      // appended yet by the time we serialize.
      const wire = serializeForWire([...messagesRef.current, userMsg]);

      // Track whether this was a brand-new thread to prepend it after
      const wasNewThread = !activeThreadId;
      const mentionedDocIds = mentions.filter((m) => m.kind === "doc").map((m) => m.id);
      const mentionedKbIds = mentions.filter((m) => m.kind === "kb").map((m) => m.id);
      // Clear mentions for next turn
      setMentions([]);
      const awaitingIds = await streamAgentInto(aiId, {
        messages: wire,
        document_context: documentContext,
        product_context: productContext,
        project_id: projectId,
        thread_id: activeThreadId,
        mentioned_doc_ids: mentionedDocIds,
        ...(selectedModel ? { model_override: selectedModel } : {}),
        mentioned_kb_ids: mentionedKbIds,
      });

      if (wasNewThread) {
        // streamAgentInto set activeThreadId already; pull it for the list
        const tid = (typeof window !== "undefined"
          ? null
          : null);
        // Fall back to refresh
        if (projectId && userId) {
          fetch(`${API}/ai/threads?project_id=${projectId}`, {
            headers: { Authorization: `Bearer ${userId}` },
          })
            .then((r) => (r.ok ? r.json() : []))
            .then(setThreads)
            .catch(() => {});
        }
        void tid; // keep linter happy
      }

      if (trustWritesRef.current && awaitingIds.length > 0) {
        await resumeAgent(
          aiId,
          awaitingIds.map((id) => ({ tool_call_id: id, decision: "approve" })),
        );
      }
    } catch (err) {
      console.error("Agent error:", err);
      setMessages((prev) =>
        prev.map((m) => m.id === aiId
          ? { ...m, parts: appendText(m.parts, "\n\n_Connection error._"), errored: true }
          : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  };

  // ── Permission handlers ───────────────────────────────────────────────────
  const handleApprove = useCallback(
    (msgId: string, callId: string) => {
      void resumeAgent(msgId, [{ tool_call_id: callId, decision: "approve" }]);
    },
    [resumeAgent],
  );

  const handleDeny = useCallback(
    (msgId: string, callId: string, reason?: string) => {
      void resumeAgent(msgId, [{ tool_call_id: callId, decision: "deny", reason }]);
    },
    [resumeAgent],
  );

  return (
    <div className="w-[420px] glass-pane h-full flex flex-col rounded-2xl flex-shrink-0 transition-colors relative z-10 overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.04] flex items-center gap-1.5 relative">
        {/* subtle amber accent line on the left edge */}
        <div className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r bg-gradient-to-b from-amber-400/0 via-amber-500/40 to-amber-400/0 dark:via-amber/50" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-amber-100 to-amber-200/60 dark:from-amber/15 dark:to-amber/5 ring-1 ring-amber-200/60 dark:ring-amber/20 flex-shrink-0">
            <Sparkles size={11} className="text-amber-700 dark:text-amber" strokeWidth={2.2} />
          </span>
          <span className="font-serif text-[15px] font-semibold tracking-tight text-black/85 dark:text-ivory leading-none">
            Agent
          </span>
          {providerLabel && (
            <span
              title="Effective LLM provider for this user"
              className="text-[9px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-md bg-amber-100/80 dark:bg-amber/10 text-amber-700 dark:text-amber ring-1 ring-amber-200/50 dark:ring-amber/20"
            >
              {providerLabel}
            </span>
          )}
          {proModels.length > 0 && (
            <select
              value={agentPlan === "free" ? "" : selectedModel}
              onChange={(e) => {
                if (agentPlan === "free") return;
                setSelectedModel(e.target.value);
                localStorage.setItem("pm_cursor_agent_model", e.target.value);
              }}
              title={agentPlan === "free" ? "Upgrade to Pro to choose model" : "Choose model"}
              className={`text-[10px] font-semibold bg-white dark:bg-zinc-800 border border-black/15 dark:border-white/15 rounded-md px-1.5 py-0.5 outline-none transition-colors ${
                agentPlan === "free"
                  ? "text-black/30 dark:text-white/30 cursor-not-allowed opacity-60"
                  : "text-black/70 dark:text-white/80 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700"
              }`}
            >
              <option value="">Auto</option>
              {proModels.map((m) => (
                <option key={m.id} value={m.id} title={m.description} disabled={agentPlan === "free"}>
                  {m.label}{m.id.includes("preview") ? " ✦" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          onClick={() => setTrustWrites((v) => !v)}
          title={trustWrites ? "Auto-approving writes — click to require approval" : "Require approval for writes (default)"}
          className={`p-1.5 rounded-md transition-all ${
            trustWrites
              ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-200/60 dark:ring-emerald-500/20"
              : "text-black/35 dark:text-white/35 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
          }`}
        >
          {trustWrites ? <ShieldCheck size={13} strokeWidth={2.2} /> : <Shield size={13} strokeWidth={2.2} />}
        </button>
        <button
          onClick={() => setShowHistory((v) => !v)}
          title="Chat history"
          className={`p-1.5 rounded-md transition-all ${
            showHistory
              ? "text-amber-600 dark:text-amber bg-amber-50 dark:bg-amber/10 ring-1 ring-amber-200/60 dark:ring-amber/20"
              : "text-black/35 dark:text-white/35 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
          }`}
        >
          <History size={13} strokeWidth={2.2} />
        </button>
        <button
          onClick={newChat}
          title="New chat"
          className="p-1.5 rounded-md text-black/35 dark:text-white/35 hover:text-amber-600 dark:hover:text-amber hover:bg-amber-50/60 dark:hover:bg-amber/10 transition-all"
        >
          <Plus size={13} strokeWidth={2.2} />
        </button>
      </div>

      {/* ── Thread history ──────────────────────────────────────────── */}
      {showHistory && (
        <div className="border-b border-black/[0.04] dark:border-white/[0.04] max-h-56 overflow-y-auto thin-scroll bg-black/[0.015] dark:bg-black/20 pm-fade-in">
          {threads.length === 0 ? (
            <p className="text-[11.5px] italic text-center text-black/30 dark:text-white/30 py-6">
              No conversations yet
            </p>
          ) : (
            <div className="py-1">
              {threads.map((thread) => (
                <div
                  key={thread.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => loadThread(thread.id)}
                  onKeyDown={(e) => e.key === "Enter" && loadThread(thread.id)}
                  className={`group w-full flex items-center gap-2 px-4 py-2 text-left cursor-pointer transition-colors relative ${
                    activeThreadId === thread.id
                      ? "bg-amber-50/70 dark:bg-amber/[0.06]"
                      : "hover:bg-black/[0.025] dark:hover:bg-white/[0.025]"
                  }`}
                >
                  {activeThreadId === thread.id && (
                    <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-amber-500 dark:bg-amber" />
                  )}
                  <MessageSquare size={10} className="flex-shrink-0 text-black/25 dark:text-white/25" />
                  <span className="flex-1 text-[12px] text-black/75 dark:text-white/75 truncate leading-snug">
                    {thread.title}
                  </span>
                  <button
                    onClick={(e) => deleteThread(e, thread.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 text-black/30 dark:text-white/30 transition-all flex-shrink-0"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Messages ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto thin-scroll px-4 py-5 flex flex-col gap-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 px-3 text-center pm-fade-in">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-amber-400/10 blur-xl scale-150" />
              <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-100/80 to-amber-200/50 dark:from-amber/15 dark:to-amber/5 ring-1 ring-amber-200/60 dark:ring-amber/20">
                <Sparkles size={20} className="text-amber-700 dark:text-amber" strokeWidth={1.8} />
              </div>
            </div>
            <div className="space-y-1.5">
              <h3 className="font-serif text-[18px] font-semibold tracking-tight text-black/85 dark:text-ivory leading-tight">
                Your PM co-pilot
              </h3>
              <p className="text-[12.5px] text-black/45 dark:text-white/45 leading-relaxed max-w-[300px]">
                Searches your research, reads your docs, and drafts artifacts — grounded in your actual data.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full mt-1">
              {[
                { label: "Draft a PRD from my customer interviews", icon: "📋" },
                { label: "What are the top pain points users mention?", icon: "🔍" },
                { label: "Summarise what's already in this project", icon: "📂" },
              ].map((s) => (
                <button
                  key={s.label}
                  onClick={() => setInput(s.label)}
                  className="group text-left px-3.5 py-3 rounded-xl text-[12px] text-black/60 dark:text-white/50 glass-inset hover:bg-amber-50/70 dark:hover:bg-amber/[0.06] hover:text-amber-900 dark:hover:text-amber transition-all flex items-center gap-2.5 hover-lift"
                >
                  <span className="text-[14px] flex-shrink-0">{s.icon}</span>
                  <span className="flex-1 leading-snug">{s.label}</span>
                  <span className="text-amber-400/50 group-hover:text-amber-500 dark:text-amber/30 dark:group-hover:text-amber transition-colors flex-shrink-0">↵</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-1.5 pm-slide-up ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                {/* Sender label */}
                <div className="flex items-center gap-1.5 text-[10px] text-black/30 dark:text-white/25 font-bold uppercase tracking-[0.14em] px-0.5">
                  {msg.role === "user" ? (
                    <span>You</span>
                  ) : (
                    <>
                      <Bot size={9} className="text-amber-500/60 dark:text-amber/50" />
                      <span>Agent</span>
                    </>
                  )}
                </div>

                {msg.role === "user" ? (
                  /* ── User bubble ─────────────────────────────── */
                  <div className="max-w-[92%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-amber-100 text-amber-950 ring-1 ring-amber-200/80 dark:bg-amber-500/15 dark:text-amber-50 dark:ring-amber-400/25 text-[13.5px] leading-relaxed">
                    {messageText(msg)}
                  </div>
                ) : (
                  /* ── Assistant message — parts rendered in natural order ── */
                  <div className="w-full flex flex-col gap-2">

                    {msg.parts.length === 0 ? (
                      /* Initial thinking indicator — shown before first SSE event */
                      <div className="flex items-center gap-2 py-1 text-[11.5px] text-black/40 dark:text-white/35">
                        <span className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50 animate-bounce [animation-delay:0ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50 animate-bounce [animation-delay:160ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50 animate-bounce [animation-delay:320ms]" />
                        </span>
                        <span className="italic">Thinking…</span>
                      </div>
                    ) : (
                      /* Render parts in the order they arrived — text before tool blocks,
                         tool blocks where they appear, final text after tool results */
                      msg.parts.map((part, i) => {
                        if (part.kind === "tool") {
                          if (part.call.name === "render_ui") {
                            const uiStatus: "running" | "done" | "error" =
                              part.call.status === "done" ? "done"
                              : part.call.status === "error" ? "error"
                              : "running";
                            return (
                              <ArtifactCard
                                key={`art-${part.call.id}-${i}`}
                                args={part.call.args as ArtifactArgs}
                                status={uiStatus}
                                projectId={projectId}
                                userId={userId ?? undefined}
                                existingDocId={lastDesignDocId ?? undefined}
                                existingDocIdRef={lastDesignDocIdRef}
                                onSaved={(docId) => {
                                  lastDesignDocIdRef.current = docId;
                                  setLastDesignDocId(docId);
                                  isRefiningRef.current = false;
                                }}
                                onRefine={uiStatus === "done" ? () => {
                                  isRefiningRef.current = true;
                                  void handleSubmit(undefined, "Please critique this design using critique_design, then create an improved version with render_ui addressing all high-severity issues.");
                                } : undefined}
                              />
                            );
                          }

                          if (part.call.name === "critique_design") {
                            return (
                              <CritiqueCard
                                key={`crit-${part.call.id}-${i}`}
                                critique={(part.call.payload as Critique) ?? null}
                                status={part.call.status === "done" ? "done" : part.call.status === "error" ? "error" : "running"}
                              />
                            );
                          }

                          if (isPermissionVisual(part.call)) {
                            const resolved =
                              part.call.status === "approved" ? "approved"
                              : part.call.status === "denied" ? "denied"
                              : null;
                            return (
                              <PermissionPrompt
                                key={`perm-${part.call.id}-${i}`}
                                call={part.call}
                                resolved={resolved}
                                onApprove={(cid) => handleApprove(msg.id, cid)}
                                onDeny={(cid, reason) => handleDeny(msg.id, cid, reason)}
                              />
                            );
                          }

                          return <ToolCallBlock key={`tool-${part.call.id}-${i}`} call={part.call} />;
                        }

                        if (part.kind === "text" && part.text.trim()) {
                          return (
                            <div
                              key={`text-${i}`}
                              className="text-[13.5px] leading-[1.75] text-black/85 dark:text-ivory/90 chat-markdown"
                            >
                              {renderTextWithCitations(part.text, msg.sources)}
                            </div>
                          );
                        }

                        return null;
                      })
                    )}

                    {/* Deduplicated sources after all content */}
                    {msg.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[...new Map(msg.sources.map((s) => [s.id, s])).values()]
                          .slice(0, 10)
                          .map((s, idx) => (
                            <CitationChip key={s.id} index={idx + 1} source={s} />
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Apply button */}
                {msg.role === "assistant" && !isStreaming && messageText(msg).trim() && applyFn && (
                  <button
                    onClick={() => handleApply(messageText(msg), msg.id)}
                    disabled={applyingMsgId === msg.id}
                    className="flex items-center gap-1.5 mt-0.5 text-[10px] text-amber-700/70 dark:text-amber/60 hover:text-amber-900 dark:hover:text-amber transition-colors ml-0.5 font-semibold tracking-wide disabled:opacity-40 group max-w-full"
                    title={docTitle ? `Apply suggestions to "${docTitle}"` : "Apply to the open document"}
                  >
                    <CheckSquare size={10} className="group-hover:rotate-3 transition-transform flex-shrink-0" />
                    <span className="truncate">
                      {applyingMsgId === msg.id
                        ? "Applying…"
                        : docTitle
                        ? `Apply to "${docTitle}"`
                        : "Apply to open document"}
                    </span>
                  </button>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Image preview ───────────────────────────────────────────── */}
      {imagePreview && (
        <div className="px-4 pb-2 pm-fade-in">
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Attached screenshot"
              className="h-16 rounded-lg ring-1 ring-black/10 dark:ring-white/10 object-cover shadow-md"
            />
            <button
              onClick={() => { setAttachedImage(null); setImagePreview(null); }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/70 hover:bg-black/85 rounded-full text-white flex items-center justify-center transition-colors shadow-lg"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {/* ── Input ───────────────────────────────────────────────────── */}
      <div className="p-3 border-t border-black/[0.04] dark:border-white/[0.04] bg-gradient-to-b from-transparent to-black/[0.015] dark:to-white/[0.01] relative">
        {/* @-mention picker */}
        {mentionTrigger && (
          <MentionPicker
            items={filteredMentions}
            selectedIndex={mentionIdx}
            onPick={pickMention}
            onClose={() => setMentionTrigger(null)}
          />
        )}

        {/* Tagged-files chips */}
        {mentions.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {mentions.map((m) => (
              <span
                key={`${m.kind}:${m.id}`}
                className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-md bg-amber-100/70 dark:bg-amber/15 text-amber-800 dark:text-amber text-[10.5px] font-medium ring-1 ring-amber-200/60 dark:ring-amber/25 max-w-[180px]"
              >
                <span className="text-amber-600/80 dark:text-amber/70">@</span>
                <span className="truncate">{m.name}</span>
                <button
                  onClick={() =>
                    setMentions((prev) =>
                      prev.filter((p) => !(p.id === m.id && p.kind === m.kind)),
                    )
                  }
                  className="rounded p-0.5 hover:bg-amber-200/60 dark:hover:bg-amber/20 text-amber-700 dark:text-amber"
                  title="Remove"
                >
                  <X size={9} strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-1.5 rounded-2xl glass-inset p-1.5 transition-all focus-within:ring-2 focus-within:ring-amber-400/40 dark:focus-within:ring-amber/30 focus-within:bg-white/80 dark:focus-within:bg-white/[0.04]">
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
            className={`p-2 rounded-xl transition-all flex-shrink-0 ${
              attachedImage
                ? "text-amber-700 dark:text-amber bg-amber-100/70 dark:bg-amber/15"
                : "text-black/35 dark:text-white/35 hover:text-amber-700 dark:hover:text-amber hover:bg-amber-50/60 dark:hover:bg-amber/10"
            }`}
          >
            <ImageIcon size={14} strokeWidth={2} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              // Picker shortcuts (when open)
              if (mentionTrigger && filteredMentions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIdx((i) => (i + 1) % filteredMentions.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIdx((i) => (i - 1 + filteredMentions.length) % filteredMentions.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  pickMention(filteredMentions[mentionIdx]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMentionTrigger(null);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            onSelect={(e) => {
              const ta = e.currentTarget;
              updateMentionTrigger(ta.value, ta.selectionStart ?? ta.value.length);
            }}
            placeholder={attachedImage ? "Describe what to analyse…" : "Ask the agent…  type @ to tag a file"}
            rows={1}
            className="flex-1 text-[13px] leading-relaxed bg-transparent py-2 pr-1 resize-none text-black dark:text-ivory placeholder:text-black/30 dark:placeholder:text-white/30 focus:outline-none"
            style={{ maxHeight: 120 }}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={(!input.trim() && !attachedImage) || isStreaming}
            className="amber-grad p-2 rounded-xl text-white disabled:opacity-30 disabled:hover:shadow-none transition-all flex-shrink-0 hover-lift disabled:hover:translate-y-0"
          >
            <Send size={13} strokeWidth={2.2} />
          </button>
        </div>
        <p className="text-[10px] text-center text-black/35 dark:text-white/30 mt-2 font-medium tracking-wide">
          {trustWrites ? (
            <span className="inline-flex items-center gap-1 text-emerald-700/80 dark:text-emerald-400/80">
              <ShieldCheck size={9} /> Auto-approving writes
              <span className="text-black/25 dark:text-white/20 mx-1">·</span>
              <span className="text-black/35 dark:text-white/30">⌘⇧F to search</span>
            </span>
          ) : (
            <>
              Asks before creating or editing
              <span className="text-black/20 dark:text-white/15 mx-1.5">·</span>
              ⌘⇧F to search
            </>
          )}
        </p>
      </div>
    </div>
  );
}
