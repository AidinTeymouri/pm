import { sendChatMessage } from "@/lib/ai-chat";
import { UnauthorizedError } from "@/lib/board-api";

describe("ai-chat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the message and history and returns the parsed result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: "hi", board_update: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const history = [{ role: "user" as const, content: "earlier" }];
    await expect(sendChatMessage("hello", history)).resolves.toEqual({
      reply: "hi",
      board_update: null,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/chat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello", history }),
    });
  });

  it("throws UnauthorizedError on a 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 })
    );
    await expect(sendChatMessage("hello", [])).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it("throws a generic error on other failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );
    await expect(sendChatMessage("hello", [])).rejects.toThrow(
      "Chat request failed"
    );
  });
});
