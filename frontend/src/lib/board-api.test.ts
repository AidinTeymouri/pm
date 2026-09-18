import { fetchBoard, saveBoard, UnauthorizedError } from "@/lib/board-api";
import type { BoardData } from "@/lib/kanban";

const board: BoardData = {
  columns: [{ id: "col-a", title: "A", cardIds: ["card-1"] }],
  cards: { "card-1": { id: "card-1", title: "T", details: "D" } },
};

describe("board-api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchBoard returns the parsed board on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => board,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBoard()).resolves.toEqual(board);
    expect(fetchMock).toHaveBeenCalledWith("/api/board", {
      credentials: "include",
    });
  });

  it("fetchBoard throws UnauthorizedError on a 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 })
    );

    await expect(fetchBoard()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("fetchBoard throws a generic error on other failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );

    await expect(fetchBoard()).rejects.toThrow("Board request failed");
  });

  it("saveBoard PUTs the board and returns the parsed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => board,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveBoard(board)).resolves.toEqual(board);
    expect(fetchMock).toHaveBeenCalledWith("/api/board", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(board),
    });
  });

  it("saveBoard throws UnauthorizedError on a 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 })
    );

    await expect(saveBoard(board)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
