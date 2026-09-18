import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";
import * as aiChat from "@/lib/ai-chat";
import { UnauthorizedError } from "@/lib/board-api";
import type { BoardData } from "@/lib/kanban";

const board: BoardData = {
  columns: [{ id: "col-a", title: "A", cardIds: [] }],
  cards: {},
};

const renderSidebar = ({
  onClose = vi.fn(),
  onBoardUpdate = vi.fn(),
  onSessionExpired = vi.fn(),
}: {
  onClose?: () => void;
  onBoardUpdate?: (board: BoardData) => void;
  onSessionExpired?: () => void;
} = {}) =>
  render(
    <ChatSidebar
      open
      onClose={onClose}
      onBoardUpdate={onBoardUpdate}
      onSessionExpired={onSessionExpired}
    />
  );

const sendMessage = async (text: string) => {
  await userEvent.type(screen.getByLabelText("Chat message"), text);
  await userEvent.click(screen.getByRole("button", { name: /send/i }));
};

describe("ChatSidebar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a hint when there are no messages yet", () => {
    renderSidebar();
    expect(screen.getByText(/ask me about your board/i)).toBeInTheDocument();
  });

  it("is hidden from assistive tech when closed", () => {
    render(
      <ChatSidebar
        open={false}
        onClose={vi.fn()}
        onBoardUpdate={vi.fn()}
        onSessionExpired={vi.fn()}
      />
    );
    expect(screen.getByTestId("chat-sidebar")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });

  it("sends a message and renders the reply", async () => {
    vi.spyOn(aiChat, "sendChatMessage").mockResolvedValue({
      reply: "Here's your board.",
      board_update: null,
    });
    renderSidebar();

    await sendMessage("hello");

    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(await screen.findByText("Here's your board.")).toBeInTheDocument();
    expect(aiChat.sendChatMessage).toHaveBeenCalledWith("hello", []);
  });

  it("calls onBoardUpdate when the reply includes a board update", async () => {
    const onBoardUpdate = vi.fn();
    vi.spyOn(aiChat, "sendChatMessage").mockResolvedValue({
      reply: "Done.",
      board_update: board,
    });
    renderSidebar({ onBoardUpdate });

    await sendMessage("add a card");

    await waitFor(() => expect(onBoardUpdate).toHaveBeenCalledWith(board));
  });

  it("shows an error and keeps the user message when the request fails", async () => {
    vi.spyOn(aiChat, "sendChatMessage").mockRejectedValue(new Error("boom"));
    renderSidebar();

    await sendMessage("hello");

    expect(
      await screen.findByText(/failed to get a response/i)
    ).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("calls onSessionExpired on a 401", async () => {
    const onSessionExpired = vi.fn();
    vi.spyOn(aiChat, "sendChatMessage").mockRejectedValue(
      new UnauthorizedError()
    );
    renderSidebar({ onSessionExpired });

    await sendMessage("hello");

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    renderSidebar({ onClose });
    await userEvent.click(screen.getByRole("button", { name: /close chat/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
