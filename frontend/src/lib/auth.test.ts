import { fetchSession, login, logout } from "@/lib/auth";

describe("auth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchSession returns the parsed session on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, username: "user" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSession()).resolves.toEqual({
      authenticated: true,
      username: "user",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/session", {
      credentials: "include",
    });
  });

  it("fetchSession falls back to unauthenticated on a failed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(fetchSession()).resolves.toEqual({
      authenticated: false,
      username: null,
    });
  });

  it("login resolves on a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    await expect(login("user", "password")).resolves.toBeUndefined();
  });

  it("login throws on a failed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(login("user", "wrong")).rejects.toThrow(
      "Invalid username or password"
    );
  });

  it("logout posts to the logout endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await logout();

    expect(fetchMock).toHaveBeenCalledWith("/api/logout", {
      method: "POST",
      credentials: "include",
    });
  });
});
