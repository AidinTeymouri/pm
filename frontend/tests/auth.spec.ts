import { expect, test } from "@playwright/test";
import { mockUnauthenticatedSession } from "./auth-helpers";
import { mockBoardApi } from "./board-helpers";

test("shows a login form and rejects wrong credentials", async ({ page }) => {
  await mockUnauthenticatedSession(page);
  await page.route("**/api/login", (route) =>
    route.fulfill({
      status: 401,
      json: { detail: "Invalid username or password" },
    })
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /sign in/i })
  ).toBeVisible();

  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
});

test("logs in, sees the board, and logs out", async ({ page }) => {
  await mockUnauthenticatedSession(page);
  await mockBoardApi(page);
  await page.route("**/api/login", (route) =>
    route.fulfill({ json: { username: "user" } })
  );
  await page.route("**/api/logout", (route) =>
    route.fulfill({ json: { ok: true } })
  );

  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(
    page.getByRole("heading", { name: "Kanban Studio" })
  ).toBeVisible();

  await page.getByRole("button", { name: /log out/i }).click();
  await expect(
    page.getByRole("heading", { name: /sign in/i })
  ).toBeVisible();
});
