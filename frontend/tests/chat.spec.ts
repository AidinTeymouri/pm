import { expect, test } from "@playwright/test";
import { mockAuthenticatedSession } from "./auth-helpers";
import { defaultBoard, mockBoardApi } from "./board-helpers";

test.beforeEach(async ({ page }) => {
  await mockAuthenticatedSession(page);
  await mockBoardApi(page);
});

test("chats with the AI and applies a board update without a manual reload", async ({
  page,
}) => {
  const updatedBoard = JSON.parse(JSON.stringify(defaultBoard));
  updatedBoard.columns[0].cardIds = updatedBoard.columns[0].cardIds.filter(
    (id: string) => id !== "card-1"
  );
  updatedBoard.columns[4].cardIds.push("card-1");

  await page.route("**/api/ai/chat", async (route) => {
    await route.fulfill({
      json: { reply: "Moved it for you.", board_update: updatedBoard },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /chat with ai/i }).click();
  await page.getByLabel("Chat message").fill("Move card-1 to Done");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByText("Moved it for you.")).toBeVisible();
  await expect(
    page.getByTestId("column-col-done").getByTestId("card-card-1")
  ).toBeVisible();
});
