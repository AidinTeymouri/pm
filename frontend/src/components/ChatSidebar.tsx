"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";
import type { BoardData } from "@/lib/kanban";
import { sendChatMessage, type ChatMessage } from "@/lib/ai-chat";
import { UnauthorizedError } from "@/lib/board-api";

type ChatSidebarProps = {
  open: boolean;
  onClose: () => void;
  onBoardUpdate: (board: BoardData) => void;
  onSessionExpired: () => void;
};

export const ChatSidebar = ({
  open,
  onClose,
  onBoardUpdate,
  onSessionExpired,
}: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, sending]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const history = messages;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const result = await sendChatMessage(trimmed, history);
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
      if (result.board_update) {
        onBoardUpdate(result.board_update);
      }
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onSessionExpired();
        return;
      }
      setError("Failed to get a response. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-[rgba(3,33,71,0.25)]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        aria-hidden={!open}
        data-testid="chat-sidebar"
        className={clsx(
          "fixed right-0 top-0 z-40 flex h-full w-full max-w-sm flex-col border-l border-[var(--stroke)] bg-[var(--surface-strong)] shadow-[var(--shadow)] transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--stroke)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
              Assistant
            </p>
            <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
              Board Chat
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Close
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <p className="text-sm leading-6 text-[var(--gray-text)]">
              Ask me about your board, or tell me to make changes — like
              &quot;move the design review card to Done&quot;.
            </p>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              data-testid="chat-message"
              data-role={message.role}
              className={clsx(
                "max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-5",
                message.role === "user"
                  ? "ml-auto bg-[var(--secondary-purple)] text-white"
                  : "bg-[var(--surface)] text-[var(--navy-dark)]"
              )}
            >
              {message.content}
            </div>
          ))}
          {sending && (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              Thinking...
            </p>
          )}
        </div>

        {error && (
          <p className="px-5 pb-2 text-sm font-medium text-red-600">{error}</p>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex gap-2 border-t border-[var(--stroke)] p-4"
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about your board..."
            aria-label="Chat message"
            disabled={sending}
            className="flex-1 rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--navy-dark)] outline-none"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </aside>
    </>
  );
};
