import type { BoardData } from "@/lib/kanban";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

const parseBoardResponse = async (response: Response): Promise<BoardData> => {
  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error("Board request failed");
  }
  return response.json();
};

export const fetchBoard = async (): Promise<BoardData> => {
  const response = await fetch("/api/board", { credentials: "include" });
  return parseBoardResponse(response);
};

export const saveBoard = async (board: BoardData): Promise<BoardData> => {
  const response = await fetch("/api/board", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(board),
  });
  return parseBoardResponse(response);
};
