import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import * as auth from "@/lib/auth";
import * as boardApi from "@/lib/board-api";
import { initialData } from "@/lib/kanban";

describe("Home", () => {
  beforeEach(() => {
    vi.spyOn(boardApi, "fetchBoard").mockResolvedValue(
      JSON.parse(JSON.stringify(initialData))
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the login form when unauthenticated", async () => {
    vi.spyOn(auth, "fetchSession").mockResolvedValue({
      authenticated: false,
      username: null,
    });
    render(<Home />);

    expect(
      await screen.findByRole("button", { name: /sign in/i })
    ).toBeInTheDocument();
  });

  it("shows the kanban board when authenticated", async () => {
    vi.spyOn(auth, "fetchSession").mockResolvedValue({
      authenticated: true,
      username: "user",
    });
    render(<Home />);

    expect(
      await screen.findByRole("heading", { name: /kanban studio/i })
    ).toBeInTheDocument();
  });

  it("returns to the login form after logging out", async () => {
    vi.spyOn(auth, "fetchSession").mockResolvedValue({
      authenticated: true,
      username: "user",
    });
    vi.spyOn(auth, "logout").mockResolvedValue(undefined);
    render(<Home />);

    const logoutButton = await screen.findByRole("button", {
      name: /log out/i,
    });
    await userEvent.click(logoutButton);

    expect(
      await screen.findByRole("button", { name: /sign in/i })
    ).toBeInTheDocument();
  });
});
