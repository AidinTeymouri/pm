import { UnauthorizedError } from "@/lib/board-api";
import type { BoardData } from "@/lib/kanban";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResult = {
  reply: string;
  board_update: BoardData | null;
};

export const sendChatMessage = async (
  message: string,
  history: ChatMessage[]
): Promise<ChatResult> => {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error("Chat request failed");
  }
  return response.json();
};
