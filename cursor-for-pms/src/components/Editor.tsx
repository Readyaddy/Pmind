"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Mark, mergeAttributes } from "@tiptap/core";
import { marked } from "marked";
import { useEffect, useState, useCallback } from "react";
import AICommandModal from "./AICommandModal";
import EditorToolbar from "./EditorToolbar";
import { useProductBrain } from "@/store/productBrain";
import { useEditorStore } from "@/store/editorStore";
import { useCustomAuth } from "@/hooks/useCustomAuth";
import { CheckCheck, X } from "lucide-react";
import { toast } from "sonner";

// Convert markdown → HTML so Tiptap parses it as real nodes (headings,
// bullet lists, bold, etc) instead of dumping raw "# **foo**" text.
marked.setOptions({ gfm: true, breaks: true });

function mdToHtml(md: string): string {
  // marked.parse returns string in sync mode (default). Use a try/catch in
  // case the input is malformed; fall back to escaping the raw text.
  try {
    return marked.parse(md, { async: false }) as string;
  } catch {
    return md.replace(/[<>&]/g, (c) =>
      c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
    );
  }
}

// Tiptap mark that highlights AI-suggested text in amber
const SuggestionMark = Mark.create({
  name: "suggestion",
  addAttributes() {
    return {
      id:          { default: "" },
      replacement: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "mark[data-suggestion]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "mark",
      mergeAttributes(HTMLAttributes, {
        "data-suggestion": "",
        "data-sid": HTMLAttributes.id,
        style: "background: rgba(254,243,199,0.85); border-radius: 2px; padding: 0 1px; cursor: pointer;",
      }),
      0,
    ];
  },
});

interface EditorProps {
  docId: string;
  projectId: string;
  initialContent?: Record<string, unknown>;
  onSave: (content: Record<string, unknown>, title: string) => void;
}

export default function Editor({ projectId, initialContent, onSave }: EditorProps) {
  const [showAIModal, setShowAIModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ id: string; replacement: string }>>([]);
  const [floatTool, setFloatTool] = useState<{ id: string; x: number; y: number } | null>(null);
  const { getContext } = useProductBrain();
  const context = getContext(projectId);
  const { registerEditor, unregisterEditor, setDocTitle } = useEditorStore();
  const { userId } = useCustomAuth();

  const API = process.env.NEXT_PUBLIC_API_URL;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start writing, or press ⌘K for AI…",
      }),
      SuggestionMark,
      Underline,
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-amber-600 dark:text-amber underline underline-offset-2" } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: initialContent || "",
    editorProps: {
      attributes: {
        class:
          "prose prose-lg dark:prose-bespoke max-w-none focus:outline-none min-h-screen p-8 pb-32 transition-colors",
      },
    },
    onUpdate: ({ editor }) => {
      const content = editor.getJSON() as Record<string, unknown>;
      const firstLine = editor.getText().split("\n")[0]?.trim() || "Untitled";
      setIsSaving(true);
      onSave(content, firstLine);
      setDocTitle(firstLine);
      setTimeout(() => setIsSaving(false), 2200);
    },
  });

  // Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowAIModal(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Paste-as-markdown: when the clipboard has plain text containing markdown
  // syntax (and no rich HTML), parse it through `marked` so tables, headings,
  // task lists, etc. render instead of dropping in as a literal "# Hello".
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const looksLikeMarkdown = (s: string) =>
      /(^|\n)\s*#{1,6}\s|(\*\*|__|`|~~|>\s)|(^|\n)\s*[-*+]\s|(^|\n)\s*\d+\.\s|(^|\n)\s*\|.*\|/m.test(s);
    const handler = (e: ClipboardEvent) => {
      const cd = e.clipboardData;
      if (!cd) return;
      const html = cd.getData("text/html").trim();
      const text = cd.getData("text/plain").trim();
      // If the clipboard already has rich HTML, let Tiptap parse it normally
      if (html) return;
      if (!text || !looksLikeMarkdown(text)) return;
      let parsed: string;
      try { parsed = mdToHtml(text); } catch { return; }
      e.preventDefault();
      editor.chain().focus().insertContent(parsed).run();
    };
    dom.addEventListener("paste", handler);
    return () => dom.removeEventListener("paste", handler);
  }, [editor]);


  // Find `needle` across node boundaries, return {from, to} in doc positions.
  // Works even when the text spans multiple text nodes (e.g. across formatted spans).
  const findInDoc = useCallback(
    (needle: string): { from: number; to: number } | null => {
      if (!editor || !needle) return null;
      const chars: { char: string; pos: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text) {
          for (let i = 0; i < node.text.length; i++) {
            chars.push({ char: node.text[i], pos: pos + i });
          }
        }
      });
      const flat = chars.map((c) => c.char).join("");
      // Try exact match first, then case-insensitive, then trimmed
      let idx = flat.indexOf(needle);
      if (idx === -1) idx = flat.toLowerCase().indexOf(needle.toLowerCase());
      if (idx === -1) idx = flat.indexOf(needle.trim());
      if (idx === -1) return null;
      const end = Math.min(idx + needle.length - 1, chars.length - 1);
      return { from: chars[idx].pos, to: chars[end].pos + 1 };
    },
    [editor]
  );

  // Apply AI suggestion: call /ai/apply, mark changed regions; fall back to insert.
  const applyChanges = useCallback(
    async (suggestion: string) => {
      if (!editor || !userId) return;

      const toastId = toast.loading("Analysing changes…");
      try {
        const res = await fetch(`${API}/ai/apply`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userId}`,
          },
          body: JSON.stringify({
            current_content: editor.getText(),
            ai_suggestion: suggestion,
            model_override: localStorage.getItem("pm_cursor_model") || "gemini-2.5-flash",
          }),
        });

        if (!res.ok) {
          toast.error("Apply failed — AI couldn't parse the changes.", { id: toastId });
          return;
        }

        const data = await res.json();
        const changes: { find: string; replace: string }[] = Array.isArray(data.changes)
          ? data.changes
          : [];

        const { schema } = editor.state;
        const suggType = schema.marks.suggestion;

        const newSuggestions: Array<{ id: string; replacement: string }> = [];

        if (suggType && changes.length > 0) {
          for (let i = 0; i < changes.length; i++) {
            const { find, replace } = changes[i];
            const range = findInDoc(find);
            if (!range) continue;
            const id = `s_${Date.now()}_${i}`;
            editor.view.dispatch(
              editor.state.tr.addMark(range.from, range.to, suggType.create({ id, replacement: replace }))
            );
            newSuggestions.push({ id, replacement: replace });
          }
        }

        const matched = newSuggestions.length;

        if (matched > 0) {
          setSuggestions(newSuggestions);
          toast.success(
            `${matched} suggestion${matched > 1 ? "s" : ""} highlighted — click any to accept or reject.`,
            { id: toastId }
          );
        } else {
          // Fallback: insert suggestion as a new section at end of document
          editor
            .chain()
            .focus("end")
            .insertContent("<hr/>")
            .insertContent(mdToHtml(suggestion))
            .run();
          toast.info("Couldn't match exact text — suggestion inserted at end of document.", {
            id: toastId,
          });
        }
      } catch (err) {
        console.error("Apply error:", err);
        toast.error("Apply failed — see console for details.", { id: toastId });
      }
    },
    [editor, userId, API, findInDoc]
  );

  // ── Helpers: scan doc for all nodes carrying a given suggestion id ──
  const collectByID = useCallback(
    (id: string) => {
      if (!editor) return [];
      const suggType = editor.state.schema.marks.suggestion;
      if (!suggType) return [];
      const hits: Array<{ from: number; to: number; text: string }> = [];
      editor.state.doc.descendants((node, pos) => {
        if (!node.isText) return;
        const m = node.marks.find((mk) => mk.type === suggType && mk.attrs.id === id);
        if (m) hits.push({ from: pos, to: pos + node.nodeSize, text: m.attrs.replacement as string });
      });
      return hits;
    },
    [editor]
  );

  // Accept one suggestion by id
  const acceptSuggestion = useCallback(
    (id: string) => {
      if (!editor) return;
      const hits = collectByID(id);
      if (!hits.length) return;
      let tr = editor.state.tr;
      [...hits].reverse().forEach(({ from, to, text }) => {
        tr = text
          ? tr.replaceWith(from, to, editor.state.schema.text(text))
          : tr.delete(from, to);
      });
      editor.view.dispatch(tr);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      setFloatTool(null);
    },
    [editor, collectByID]
  );

  // Reject one suggestion by id (remove mark, keep original text)
  const rejectSuggestion = useCallback(
    (id: string) => {
      if (!editor) return;
      const suggType = editor.state.schema.marks.suggestion;
      if (!suggType) return;
      const hits = collectByID(id);
      if (!hits.length) return;
      let tr = editor.state.tr;
      [...hits].reverse().forEach(({ from, to }) => {
        tr = tr.removeMark(from, to, suggType);
      });
      editor.view.dispatch(tr);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      setFloatTool(null);
    },
    [editor, collectByID]
  );

  // Bulk accept all
  const acceptAllSuggestions = useCallback(() => {
    suggestions.forEach((s) => acceptSuggestion(s.id));
    setSuggestions([]);
    setFloatTool(null);
  }, [suggestions, acceptSuggestion]);

  // Bulk reject all
  const rejectAllSuggestions = useCallback(() => {
    suggestions.forEach((s) => rejectSuggestion(s.id));
    setSuggestions([]);
    setFloatTool(null);
  }, [suggestions, rejectSuggestion]);

  // Click on highlighted text → show per-suggestion floating toolbar
  const handleEditorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const markEl = (e.target as HTMLElement).closest("mark[data-suggestion]") as HTMLElement | null;
    if (!markEl) { setFloatTool(null); return; }
    const id = markEl.getAttribute("data-sid") || "";
    if (!id) return;
    const rect = markEl.getBoundingClientRect();
    setFloatTool({ id, x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  // Register/unregister with EditorStore so CursorChat can call applyChanges
  useEffect(() => {
    if (!editor) return;
    const initialTitle = editor.getText().split("\n")[0]?.trim() || "Untitled";
    registerEditor(applyChanges, () => editor.getText(), initialTitle);
    return () => unregisterEditor();
  }, [editor, applyChanges, registerEditor, unregisterEditor]);

  const handleAIOutput = useCallback(
    (text: string) => {
      if (!editor) return;
      const html = mdToHtml(text);
      const isEmpty = editor.getText().trim().length === 0;
      if (isEmpty) {
        editor.chain().focus().insertContent(html).run();
      } else {
        editor.chain().focus("end").insertContent("<p></p>").insertContent(html).run();
      }
    },
    [editor]
  );

  return (
    <div className="relative h-full overflow-y-auto" onClick={handleEditorClick}>
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />

      {/* Per-suggestion floating toolbar — appears above clicked highlight */}
      {floatTool && (
        <div
          className="fixed z-30 flex items-center gap-1 p-1 rounded-lg bg-gray-900/95 border border-white/10 shadow-2xl backdrop-blur"
          style={{ left: floatTool.x, top: floatTool.y, transform: "translate(-50%, calc(-100% - 6px))" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => acceptSuggestion(floatTool.id)}
            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-green-500 hover:bg-green-600 text-white transition-colors"
          >
            <CheckCheck size={11} /> Accept
          </button>
          <button
            onClick={() => rejectSuggestion(floatTool.id)}
            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
          >
            <X size={11} /> Reject
          </button>
        </div>
      )}

      {/* Bottom bar — bulk accept / reject all when multiple suggestions pending */}
      {suggestions.length > 0 && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber/10 border border-amber-200 dark:border-amber/30 shadow-lg z-20">
          <span className="text-[12px] font-medium text-amber-800 dark:text-amber">
            {suggestions.length} suggestion{suggestions.length > 1 ? "s" : ""} — click to review
          </span>
          <button
            onClick={acceptAllSuggestions}
            className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors"
          >
            <CheckCheck size={12} /> Accept all
          </button>
          <button
            onClick={rejectAllSuggestions}
            className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-black/70 dark:text-white/70 transition-colors"
          >
            <X size={12} /> Reject all
          </button>
        </div>
      )}

      {/* Status bar */}
      <div className="fixed bottom-4 right-80 flex items-center gap-4 text-xs text-black/40 dark:text-white/40 pointer-events-none">
        {isSaving && <span>Saving…</span>}
        <span>
          Press{" "}
          <kbd className="px-1 py-0.5 bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 rounded text-black/70 dark:text-ivory shadow-sm">
            ⌘K
          </kbd>{" "}
          for AI
        </span>
      </div>

      {showAIModal && (
        <AICommandModal
          onClose={() => setShowAIModal(false)}
          onOutput={handleAIOutput}
          projectId={projectId}
          productContext={context}
          documentContext={editor?.getText() || ""}
        />
      )}
    </div>
  );
}
