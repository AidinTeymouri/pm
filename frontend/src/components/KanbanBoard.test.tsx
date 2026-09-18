import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";
import * as boardApi from "@/lib/board-api";
import * as aiChat from "@/lib/ai-chat";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

const cloneBoard = () => JSON.parse(JSON.stringify(initialData));

const renderBoard = async ({
  onLogout = vi.fn(),
  onSessionExpired = vi.fn(),
}: { onLogout?: () => void; onSessionExpired?: () => void } = {}) => {
  render(
    <KanbanBoard onLogout={onLogout} onSessionExpired={onSessionExpired} />
  );
  await screen.findAllByTestId(/column-/i);
};

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.spyOn(boardApi, "fetchBoard").mockResolvedValue(cloneBoard());
    vi.spyOn(boardApi, "saveBoard").mockImplementation(async (board) => board);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and renders the board on mount", async () => {
    await renderBoard();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    expect(boardApi.fetchBoard).toHaveBeenCalledTimes(1);
  });

  it("shows a loading state before the board arrives", () => {
    vi.spyOn(boardApi, "fetchBoard").mockImplementation(
      () => new Promise(() => {})
    );
    render(<KanbanBoard onLogout={vi.fn()} onSessionExpired={vi.fn()} />);
    expect(screen.getByText(/loading board/i)).toBeInTheDocument();
  });

  it("shows an error state and can retry when the board fails to load", async () => {
    vi.spyOn(boardApi, "fetchBoard").mockRejectedValueOnce(
      new Error("network down")
    );
    render(<KanbanBoard onLogout={vi.fn()} onSessionExpired={vi.fn()} />);
    expect(
      await screen.findByText(/couldn.t load your board/i)
    ).toBeInTheDocument();

    vi.spyOn(boardApi, "fetchBoard").mockResolvedValueOnce(cloneBoard());
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("calls onSessionExpired when the initial fetch is unauthorized", async () => {
    const onSessionExpired = vi.fn();
    vi.spyOn(boardApi, "fetchBoard").mockRejectedValueOnce(
      new boardApi.UnauthorizedError()
    );
    render(
      <KanbanBoard onLogout={vi.fn()} onSessionExpired={onSessionExpired} />
    );
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
  });

  it("renames a column and persists it", async () => {
    await renderBoard();
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
    await waitFor(() => expect(boardApi.saveBoard).toHaveBeenCalled());
  });

  it("calls onLogout when the logout button is clicked", async () => {
    const onLogout = vi.fn();
    await renderBoard({ onLogout });
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("adds and removes a card, persisting each change", async () => {
    await renderBoard();
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );

    expect(within(column).getByText("New card")).toBeInTheDocument();
    await waitFor(() => expect(boardApi.saveBoard).toHaveBeenCalled());

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("reverts the change and shows an error when saving fails", async () => {
    vi.spyOn(boardApi, "saveBoard").mockRejectedValueOnce(
      new Error("save failed")
    );
    await renderBoard();
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    fireEvent.change(input, { target: { value: "Renamed" } });

    expect(
      await screen.findByText(/failed to save your change/i)
    ).toBeInTheDocument();
    await waitFor(() => expect(input).toHaveValue("Backlog"));
  });

  it("calls onSessionExpired when a save is unauthorized", async () => {
    const onSessionExpired = vi.fn();
    vi.spyOn(boardApi, "saveBoard").mockRejectedValueOnce(
      new boardApi.UnauthorizedError()
    );
    await renderBoard({ onSessionExpired });
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    fireEvent.change(input, { target: { value: "Renamed" } });

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
  });

  it("opens the chat sidebar and applies a board update from the AI without a refetch", async () => {
    const updatedBoard = cloneBoard();
    updatedBoard.columns[0] = {
      ...updatedBoard.columns[0],
      title: "Renamed By AI",
    };
    vi.spyOn(aiChat, "sendChatMessage").mockResolvedValue({
      reply: "Renamed it for you.",
      board_update: updatedBoard,
    });
    await renderBoard();

    await userEvent.click(screen.getByRole("button", { name: /chat with ai/i }));
    await userEvent.type(screen.getByLabelText("Chat message"), "rename it");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByDisplayValue("Renamed By AI")).toBeInTheDocument();
    expect(boardApi.fetchBoard).toHaveBeenCalledTimes(1);
  });

  it("closes the chat sidebar", async () => {
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: /chat with ai/i }));
    expect(screen.getByTestId("chat-sidebar")).toHaveAttribute(
      "aria-hidden",
      "false"
    );

    await userEvent.click(screen.getByRole("button", { name: /close chat/i }));
    expect(screen.getByTestId("chat-sidebar")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });
});
