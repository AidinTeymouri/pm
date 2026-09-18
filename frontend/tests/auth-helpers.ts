import type { Page } from "@playwright/test";

export const mockAuthenticatedSession = (page: Page) =>
  page.route("**/api/session", (route) =>
    route.fulfill({ json: { authenticated: true, username: "user" } })
  );

export const mockUnauthenticatedSession = (page: Page) =>
  page.route("**/api/session", (route) =>
    route.fulfill({ json: { authenticated: false, username: null } })
  );
