# Frontend

Next.js 16 / React 19 app (App Router, Tailwind v4, `@dnd-kit`). The app
gates access behind the backend's hardcoded-user login (Part 4) and the
Kanban board is now fully backed by the real API (Part 7 of `docs/PLAN.md`)
— see `docs/PLAN.md` for where this fits in the overall build.

`next.config.ts` sets `output: "export"`: `npm run build` produces a static
`out/` directory (no Node server needed at runtime). The root `Dockerfile`
builds this and copies `out/` into the FastAPI backend's `static/` dir, which
serves it at `/`. Keep this in mind before using anything that needs a
Next.js server (`next/image` optimization, server actions, dynamic routes,
middleware) — those aren't compatible with static export.

## Structure

- `src/lib/kanban.ts` — the data model and pure logic. `BoardData` is a
  `columns` array (`{id, title, cardIds}`) plus a `cards` lookup keyed by id.
  `moveCard(columns, activeId, overId)` is the pure reducer used for every
  drag-and-drop move: reordering within a column, dropping onto a column
  (moves to the end), or moving between columns at a specific position. Also
  exports `createId(prefix)` for generating new card ids, and `initialData`
  — no longer used at runtime (the board now comes from the API, see
  `board-api.ts` below) but kept as the shared fixture for tests, since it's
  exactly what the backend seeds a fresh database with (`INITIAL_BOARD` in
  `backend/app/db.py`). This file has no framework dependencies and is
  unit-tested in `kanban.test.ts` — any board-mutation logic changes belong
  here, not in components.
- `src/lib/board-api.ts` — thin `fetch` wrappers around the backend's board
  API: `fetchBoard()` (GETs `/api/board`) and `saveBoard(board)` (PUTs
  `/api/board`). Both throw `UnauthorizedError` on a 401 specifically (so
  callers can distinguish "session expired" from any other failure) and a
  generic `Error` otherwise.
- `src/components/KanbanBoard.tsx` — the only stateful component for board
  data. On mount, calls `fetchBoard()` into `board: BoardData | null` +
  a `status: "loading" | "ready" | "error"` state (`null`/`"error"` render a
  loading/retry screen instead of the board). Owns the `DndContext` (pointer
  sensor with a 6px activation distance, `closestCorners` collision
  detection) and all mutation handlers (`handleDragEnd` calls `moveCard`;
  `handleRenameColumn`, `handleAddCard`, `handleDeleteCard`), each routed
  through `updateBoard(updater)`: it applies the updater optimistically via
  `setBoard`, then calls `saveBoard` in the background — on failure it
  rolls back to the pre-update board and shows an inline "Failed to save
  your change" message; on `UnauthorizedError` (session expired mid-session)
  it calls the `onSessionExpired` prop instead of showing an error. Renders
  a `DragOverlay` with `KanbanCardPreview` for the card being dragged.
  Note: `KanbanColumn`'s rename input persists on every keystroke (one
  `saveBoard` call per character, not debounced) — a pre-existing pattern
  from when this was local-only state, now with a real network cost. A
  failure on a stale keystroke's save rolls back to that keystroke's
  snapshot even if later keystrokes already saved successfully; harmless in
  practice (rename is idempotent and rare to fail) but worth debouncing if
  this ever becomes a real reliability issue.
- `src/components/KanbanColumn.tsx` — renders one column's header (rename),
  its list of `KanbanCard`s, and `NewCardForm`.
- `src/components/KanbanCard.tsx` / `KanbanCardPreview.tsx` — a card in place
  vs. the overlay shown while dragging.
- `src/components/NewCardForm.tsx` — inline form to add a card to a column.
- `src/lib/auth.ts` — thin `fetch` wrappers around the backend's auth API:
  `fetchSession()` (GETs `/api/session`, always resolves — falls back to
  `{authenticated: false, username: null}` on a non-OK response rather than
  throwing), `login(username, password)` (POSTs `/api/login`, throws on
  failure), `logout()` (POSTs `/api/logout`). All use `credentials:
  "include"` so the session cookie round-trips.
- `src/components/LoginForm.tsx` — the login screen: controlled
  username/password inputs, calls `login`, shows an inline error on failure,
  calls `onSuccess()` on success. No routing involved.
- `src/app/page.tsx` — the auth gate and only route. On mount, calls
  `fetchSession()`; renders a loading state, then either `LoginForm` (not
  authenticated) or `KanbanBoard` (authenticated, with `onLogout` — calls
  `logout()` then flips back to the login form — and `onSessionExpired` —
  flips back to the login form without calling `logout()`, since the
  backend already dropped the session; wired to `KanbanBoard`'s board
  fetch/save 401s). There is no separate `/login` route — the static export
  has a single page, and this conditional render is the entire "route
  protection."
- `src/app/layout.tsx` / `globals.css` — root layout and the color-scheme
  CSS variables (see CLAUDE.md's Color scheme section).

There is no global state management beyond component-local `useState`; state
lives at the top of the tree (`page.tsx` for auth, `KanbanBoard` for the
board) and flows down via props.

## Testing

- Vitest (`vitest.config.ts`): unit/component tests under
  `src/**/*.{test,spec}.{ts,tsx}`, jsdom + `@testing-library/react`, setup at
  `src/test/setup.ts`. Covers `kanban.ts`, `auth.ts`/`board-api.ts` (fetch
  mocked via `vi.stubGlobal`), `LoginForm`, `KanbanBoard` (`fetchBoard`/
  `saveBoard` mocked via `vi.spyOn` on the `board-api` module — covers
  loading/error/retry, optimistic update + rollback on a failed save, and
  `onSessionExpired` on a 401), and `page.tsx` (the auth gate, with
  `fetchSession`/`logout` mocked via `vi.spyOn`).
- Playwright (`playwright.config.ts`): e2e specs under `tests/`
  (`kanban.spec.ts`, `auth.spec.ts`), auto-starts the dev server on
  `127.0.0.1:3000`. Since `next dev` has no real backend attached, both specs
  mock the `/api/*` routes via `page.route` — see `tests/auth-helpers.ts`
  (`mockAuthenticatedSession`/`mockUnauthenticatedSession`) and
  `tests/board-helpers.ts` (`mockBoardApi` — a small stateful GET/PUT mock
  of `/api/board`, seeded with the same data as `initialData`/
  `INITIAL_BOARD`, so `kanban.spec.ts`'s reload test can verify a change
  round-trips through a PUT and comes back on the next GET). Real
  frontend+backend integration (actual cookies, actual FastAPI session and
  SQLite persistence, including surviving a full container restart) is
  verified manually against the Docker container, not automated here — see
  the Part 4 and Part 7 entries in `docs/PLAN.md` for what was checked.

## Commands

Run from this directory:

```bash
npm run dev              # start Next.js dev server
npm run build             # production build
npm run lint               # eslint
npm run test:unit          # vitest (unit/component tests)
npm run test:unit:watch    # vitest watch mode
npm run test:e2e           # playwright e2e tests
npm run test:all           # unit then e2e
```

Single test file: `npx vitest run src/lib/kanban.test.ts`.
Single e2e test: `npx playwright test tests/kanban.spec.ts -g "adds a card"`.
