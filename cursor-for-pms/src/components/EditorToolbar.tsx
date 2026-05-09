"use client";

import { Editor } from "@tiptap/react";
import { useRef } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code,
  Code2,
  Minus,
  Link2,
  Image as ImageIcon,
  Table as TableIcon,
  Undo,
  Redo,
} from "lucide-react";

interface Props {
  editor: Editor | null;
}

function ToolBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={`p-1.5 rounded-lg transition-all ${
        active
          ? "bg-amber-100/80 dark:bg-amber/15 text-amber-700 dark:text-amber ring-1 ring-amber-200/60 dark:ring-amber/20"
          : "text-black/45 dark:text-white/40 hover:text-amber-700 dark:hover:text-amber hover:bg-amber-50/50 dark:hover:bg-amber/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-black/[0.08] dark:bg-white/[0.08] mx-1" />;
}

export default function EditorToolbar({ editor }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const insertImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        editor.chain().focus().setImage({ src: reader.result }).run();
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const setLink = () => {
    const url = window.prompt("Enter URL:");
    if (!url) return;
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  return (
    <div className="sticky top-0 z-10 flex items-center gap-0.5 px-4 py-2 border-b border-black/[0.04] dark:border-white/[0.04] bg-white/75 dark:bg-black/45 backdrop-blur-xl backdrop-saturate-150 overflow-x-auto scrollbar-hide shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_2px_8px_-2px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_0_rgba(255,217,153,0.06)_inset,0_2px_8px_-2px_rgba(0,0,0,0.2)]">
      {/* History */}
      <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Undo (⌘Z)">
        <Undo size={14} />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Redo (⌘⇧Z)">
        <Redo size={14} />
      </ToolBtn>

      <Divider />

      {/* Headings */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        <Heading1 size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <Heading2 size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <Heading3 size={14} />
      </ToolBtn>

      <Divider />

      {/* Text styles */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold (⌘B)"
      >
        <Bold size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic (⌘I)"
      >
        <Italic size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Underline (⌘U)"
      >
        <UnderlineIcon size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
        title="Inline code"
      >
        <Code size={14} />
      </ToolBtn>

      <Divider />

      {/* Lists */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Bullet list"
      >
        <List size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Ordered list"
      >
        <ListOrdered size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive("taskList")}
        title="Task list (checkboxes)"
      >
        <ListChecks size={14} />
      </ToolBtn>

      <Divider />

      {/* Blocks */}
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        title="Blockquote"
      >
        <Quote size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        title="Code block"
      >
        <Code2 size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal rule"
      >
        <Minus size={14} />
      </ToolBtn>
      <ToolBtn
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
        active={editor.isActive("table")}
        title="Insert table"
      >
        <TableIcon size={14} />
      </ToolBtn>

      <Divider />

      {/* Insert */}
      <ToolBtn onClick={setLink} active={editor.isActive("link")} title="Insert link">
        <Link2 size={14} />
      </ToolBtn>
      <ToolBtn onClick={() => fileInputRef.current?.click()} title="Insert image">
        <ImageIcon size={14} />
      </ToolBtn>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={insertImage}
      />
    </div>
  );
}
