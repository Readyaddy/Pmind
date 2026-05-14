"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  title: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/25 dark:bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-[340px] bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 shadow-2xl rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <AlertTriangle size={15} className="text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[14px] text-black/85 dark:text-white/85 leading-snug">
              {title}
            </h3>
            {message && (
              <p className="mt-1 text-[12.5px] text-black/50 dark:text-white/45 leading-relaxed">
                {message}
              </p>
            )}
          </div>
        </div>
        <div className="px-5 pb-4 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3.5 py-1.5 text-[12.5px] font-medium text-black/60 dark:text-white/50 hover:text-black dark:hover:text-white rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="px-3.5 py-1.5 text-[12.5px] font-semibold text-white bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500 rounded-lg transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
