"use client";

import { useState, useRef, useEffect } from "react";
import TicketExportModal from "./TicketExportModal";
import { useCustomAuth } from "@/hooks/useCustomAuth";

const COMMANDS = [
  { id: "prd", label: "Write PRD", placeholder: "Describe the feature or problem..." },
  { id: "tickets", label: "Break into tickets", placeholder: "Paste your epic description..." },
  { id: "brief", label: "Product brief", placeholder: "What are we building?" },
  { id: "update", label: "Stakeholder update", placeholder: "What happened this week?" },
  { id: "interview", label: "Synthesize research", placeholder: "Paste your raw user interview notes..." },
  { id: "custom", label: "Custom", placeholder: "Ask anything..." },
];

interface Props {
  onClose: () => void;
  onOutput: (text: string) => void;
  projectId: string;
  productContext: string;
  documentContext: string;
}

export default function AICommandModal({
  onClose,
  onOutput,
  projectId,
  productContext,
  documentContext,
}: Props) {
  const [selectedCommand, setSelectedCommand] = useState(COMMANDS[0]);
  const [userInput, setUserInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [thinkingPhrase, setThinkingPhrase] = useState("Thinking...");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { userId } = useCustomAuth();

  const THINKING_PHRASES = [
    "Thinking...",
    "Reading your context...",
    "Crafting a response...",
    "Analyzing the brief...",
    "Putting it together...",
  ];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isStreaming || streamedText) return;
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % THINKING_PHRASES.length;
      setThinkingPhrase(THINKING_PHRASES[i]);
    }, 1800);
    return () => clearInterval(interval);
  }, [isStreaming, streamedText]);

  const handleSubmit = async () => {
    if (!userInput.trim() || isStreaming) return;
    setIsStreaming(true);
    setStreamedText("");

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/ai/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userId}`,
          },
          body: JSON.stringify({
            command: selectedCommand.id,
            user_input: userInput,
            project_id: projectId,
            product_context: productContext,
            document_context: documentContext,
            model_override:
              (typeof window !== "undefined" && localStorage.getItem("pm_cursor_model")) ||
              "gemini-2.5-flash",
          }),
        }
      );

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ") && !line.includes("[DONE]")) {
            // Unescape newlines encoded by the backend
            const text = line.slice(6).replace(/\\n/g, "\n");
            fullText += text;
            setStreamedText(fullText);
          }
        }
      }

      onOutput(fullText);
      // For tickets: stay open and offer export instead of immediately closing
      if (selectedCommand.id !== "tickets") {
        onClose();
      }
    } catch (err) {
      console.error("AI error:", err);
      setIsStreaming(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/20 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 transition-colors"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white/90 dark:bg-[#0A0A0A]/90 backdrop-blur-xl rounded-xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.1)] dark:shadow-[0_0_50px_-15px_rgba(217,119,6,0.3)] border border-black/5 dark:border-white/5 w-[600px] overflow-hidden glass-pane">
        {/* Command selector */}
        <div className="flex gap-1 p-3 border-b border-black/5 dark:border-white/5 overflow-x-auto">
          {COMMANDS.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => setSelectedCommand(cmd)}
              className={`px-3 py-1.5 rounded-md text-[13px] whitespace-nowrap transition-all ${
                selectedCommand.id === cmd.id
                  ? "bg-amber-50 dark:bg-amber/10 text-amber-800 dark:text-amber font-medium dark:amber-glow border border-amber-200 dark:border-amber/20"
                  : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 border border-transparent"
              }`}
            >
              {cmd.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="p-4 bg-transparent">
          <textarea
            ref={inputRef}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
              if (e.key === "Escape") onClose();
            }}
            placeholder={selectedCommand.placeholder}
            className="w-full resize-none border-0 outline-none text-[15px] leading-relaxed bg-transparent text-black dark:text-ivory placeholder-black/30 dark:placeholder-white/30 min-h-[100px]"
          />
        </div>

        {/* Thinking indicator — shown before first chunk arrives */}
        {isStreaming && !streamedText && (
          <div className="px-4 py-3 border-t border-black/5 dark:border-white/5 bg-black/5 dark:bg-black/20 flex items-center gap-2.5">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <p className="text-[12px] text-black/50 dark:text-white/50 italic transition-all">{thinkingPhrase}</p>
          </div>
        )}

        {/* Streaming preview */}
        {streamedText && (
          <div className="px-4 pb-3 max-h-48 overflow-y-auto border-t border-black/5 dark:border-white/5 bg-black/5 dark:bg-black/20">
            <p className="text-[11px] uppercase tracking-wider text-black/50 dark:text-white/50 mt-3 mb-2 font-serif">Generating</p>
            <p className="text-[15px] leading-relaxed text-black dark:text-ivory whitespace-pre-wrap">
              {streamedText}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-3 border-t border-black/5 dark:border-white/5 bg-black/5 dark:bg-black/40 backdrop-blur-md">
          <span className="text-[11px] uppercase tracking-wider text-black/50 dark:text-white/50">
            {productContext
              ? "✓ Product Context Active"
              : "⚠ No Context"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[13px] text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors border border-transparent"
            >
              Cancel
            </button>
            {/* Show Export button for tickets after generation */}
            {selectedCommand.id === "tickets" && streamedText && !isStreaming && (
              <button
                onClick={() => setShowExportModal(true)}
                className="px-4 py-1.5 text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-all"
              >
                Export to Jira / Linear ↗
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!userInput.trim() || isStreaming}
              className="px-4 py-1.5 text-[13px] font-medium bg-amber-600 dark:bg-amber text-white dark:text-[#1A1A1A] rounded-md hover:bg-amber-700 dark:hover:bg-amber/90 disabled:opacity-50 transition-all dark:amber-glow"
            >
              {isStreaming ? "Generating..." : "Generate ↵"}
            </button>
          </div>
        </div>
      </div>

      {/* Ticket Export Modal — renders on top when user clicks Export */}
      {showExportModal && (
        <TicketExportModal
          userInput={userInput}
          productContext={productContext}
          documentContext={documentContext}
          onClose={() => {
            setShowExportModal(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}
