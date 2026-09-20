# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is a Project Management MVP (Kanban board with AI chat). All 10 parts of the build are complete: scaffolding, Docker packaging, hardcoded-user auth, SQLite-backed persistence, the FastAPI backend API, OpenRouter AI connectivity, and the AI chat sidebar. The frontend is fully wired to the real backend (no more in-memory-only demo state), and `backend/`/`scripts/` are populated, not placeholders. Read `docs/PLAN.md` for the full build history and success criteria per part, and `docs/DATABASE.md`/`docs/schema.json` for the persistence layer. Keep `docs/PLAN.md` up to date as any new work lands beyond Part 10.

## Commands

All frontend commands run from `frontend/`:

```bash
npm run dev              # start Next.js dev server
npm run build             # production build
npm run lint               # eslint
npm run test:unit          # vitest (unit/component tests)
npm run test:unit:watch    # vitest watch mode
npm run test:e2e           # playwright e2e tests (auto-starts dev server on 127.0.0.1:3000)
npm run test:all           # unit then e2e
```

Run a single vitest test file with `npx vitest run src/lib/kanban.test.ts`. Run a single playwright test with `npx playwright test tests/kanban.spec.ts -g "adds a card"`.

Backend commands run from `backend/`:

```bash
uv sync                                  # install dependencies
uv run uvicorn app.main:app --reload     # dev server on :8000
uv run pytest                            # run tests
```

`backend/data/pm.db` is created automatically on first run (gitignored — delete it to reset to the seeded demo board).

## Architecture

The frontend (`frontend/`) is a Next.js 16 / React 19 app using the App Router, Tailwind v4, and `@dnd-kit` for drag-and-drop. It is gated behind a login screen and fully backed by the FastAPI backend — board state is fetched/persisted through the real API, not local-only state.

The backend (`backend/`) is a FastAPI app managed with `uv`, serving the built frontend as static files at `/`, a hardcoded-user session-cookie login, a SQLite-backed board API, and an OpenRouter-based AI chat endpoint that can propose board edits via structured outputs.

- `src/lib/kanban.ts` is the core data model and pure logic: `BoardData` (a `columns` array of `{id, title, cardIds}` plus a `cards` lookup keyed by id) and `moveCard`, the pure reducer-style function that computes the new column state for any drag-and-drop move (within a column, onto a column, or between columns). This is the single place board-mutation logic should live; keep it framework-free and unit-test changes here in `kanban.test.ts`. `initialData` is no longer used at runtime (kept as a test fixture) — the backend seeds a fresh database with the same shape (`INITIAL_BOARD` in `backend/app/db.py`).
- `src/components/KanbanBoard.tsx` fetches/persists `BoardData` through `src/lib/board-api.ts` (`useState<BoardData | null>` seeded from `GET /api/board`, optimistic updates with rollback on a failed `PUT /api/board`) and owns the `DndContext`; it wires drag events to `moveCard` and owns the add/delete/rename card handlers, passing data and callbacks down to `KanbanColumn` -> `KanbanCard`/`KanbanCardPreview`/`NewCardForm`. It also owns the AI chat sidebar (`ChatSidebar`), applying `board_update` responses directly to its state. There is no global state management beyond this component — state lives at the top of the tree and flows down via props.
- `src/app/page.tsx` is the auth gate and only route: it checks `GET /api/session` on mount and renders `LoginForm` or `KanbanBoard` accordingly — there is no separate `/login` route.
- `backend/app/board.py` exposes `load_board`/`write_board` as the single read/write path for a user's board, used by both the REST board routes and the AI chat endpoint (`backend/app/ai.py`); `BoardData`'s pydantic validator rejects inconsistent payloads (duplicate ids, dangling card references) before anything is persisted.

See `frontend/AGENTS.md` and `backend/AGENTS.md` for the full structure and testing setup of each half, and `docs/PLAN.md` for how this was built part by part.

### Testing setup

- Vitest (`vitest.config.ts`) runs component/unit tests under `src/**/*.{test,spec}.{ts,tsx}` with jsdom, `@testing-library/react`, and a setup file at `src/test/setup.ts`.
- Playwright (`playwright.config.ts`) runs e2e specs under `tests/` against a dev server it starts itself on `127.0.0.1:3000`.

## Technical decisions (from docs/PLAN.md)

- Backend: Python FastAPI, serving the built Next.js static site at `/`; package management via `uv`.
- AI: OpenRouter, model `openai/gpt-oss-120b`, key in root `.env` as `OPENROUTER_API_KEY`.
- Database: SQLite, created on first run if missing.
- Packaging: everything runs in a single Docker container, locally only, with start/stop scripts per OS in `scripts/`.
- Auth for the MVP is a single hardcoded user (`user`/`password`); the schema should still support multiple users. Only one Kanban board per user.

## Coding standards

- Use latest, idiomatic versions of libraries as of today.
- Keep it simple: no over-engineering, no unnecessary defensive programming, no speculative features.
- Be concise; keep docs/READMEs minimal. No emojis, ever.
- When debugging, find the root cause with evidence before applying a fix — do not guess.

## Color scheme

- Accent Yellow `#ecad0a` — accent lines, highlights
- Blue Primary `#209dd7` — links, key sections
- Purple Secondary `#753991` — submit buttons, important actions
- Dark Navy `#032147` — main headings
- Gray Text `#888888` — supporting text, labels
