"use client";

import { useEffect, useRef } from "react";
import { FileText, BookOpen } from "lucide-react";

export interface MentionItem {
  id: string;
  name: string;
  kind: "doc" | "kb";
}

export default function MentionPicker({
  items,
  selectedIndex,
  onPick,
  onClose,
}: {
  items: MentionItem[];
  selectedIndex: number;
  onPick: (item: MentionItem) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current.querySelector<HTMLButtonElement>(
      `[data-mention-idx="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (items.length === 0) {
    return (
      <div
        ref={ref}
        className="pm-pop-in absolute bottom-full left-3 right-3 mb-2 z-50 glass-pane rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="px-3 py-3 text-[11px] italic text-center text-black/40 dark:text-white/35">
          No matching files
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="pm-pop-in absolute bottom-full left-3 right-3 mb-2 z-50 glass-pane rounded-xl shadow-2xl overflow-hidden"
    >
      <div className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-black/40 dark:text-white/40 border-b border-black/[0.04] dark:border-white/[0.04]">
        Tag a file
      </div>
      <div className="max-h-56 overflow-y-auto thin-scroll py-1">
        {items.map((item, i) => {
          const Icon = item.kind === "kb" ? BookOpen : FileText;
          const active = i === selectedIndex;
          return (
            <button
              key={`${item.kind}:${item.id}`}
              data-mention-idx={i}
              onMouseDown={(e) => {
                e.preventDefault(); // keep textarea focus
                onPick(item);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                active
                  ? "bg-amber-50/80 dark:bg-amber/[0.10]"
                  : "hover:bg-black/[0.025] dark:hover:bg-white/[0.025]"
              }`}
            >
              <span
                className={`flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 ${
                  item.kind === "kb"
                    ? "bg-amber-100/70 dark:bg-amber/15"
                    : "bg-black/[0.04] dark:bg-white/[0.06]"
                }`}
              >
                <Icon
                  size={10}
                  className={
                    item.kind === "kb"
                      ? "text-amber-700 dark:text-amber"
                      : "text-black/55 dark:text-white/60"
                  }
                />
              </span>
              <span className="flex-1 min-w-0 text-[12px] truncate text-black/80 dark:text-white/80">
                {item.name}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-black/30 dark:text-white/30 flex-shrink-0">
                {item.kind === "kb" ? "KB" : "Doc"}
              </span>
            </button>
          );
        })}
      </div>
      <div className="px-3 py-1.5 border-t border-black/[0.04] dark:border-white/[0.04] text-[9.5px] text-black/35 dark:text-white/30 flex items-center justify-between">
        <span>↑↓ to navigate</span>
        <span>↵ to select · esc</span>
      </div>
    </div>
  );
}
