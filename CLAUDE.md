# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is a Project Management MVP (Kanban board with AI chat). Only the frontend demo exists so far (Parts 1-3 of the plan below); `backend/` and `scripts/` are empty placeholders awaiting the FastAPI backend, Docker setup, and start/stop scripts. Read `docs/PLAN.md` before starting work — it defines the full build sequence (scaffolding, auth, database, backend API, AI connectivity, AI chat sidebar) as a checklist that should be kept up to date as parts are completed.

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

There is no backend yet, so there are no backend build/test commands to document until Part 2 of the plan lands.

## Architecture

The frontend (`frontend/`) is a Next.js 16 / React 19 app using the App Router, Tailwind v4, and `@dnd-kit` for drag-and-drop. It is currently a static, in-memory demo — no backend calls yet.

- `src/lib/kanban.ts` is the core data model and pure logic: `BoardData` (a `columns` array of `{id, title, cardIds}` plus a `cards` lookup keyed by id) and `moveCard`, the pure reducer-style function that computes the new column state for any drag-and-drop move (within a column, onto a column, or between columns). This is the single place board-mutation logic should live; keep it framework-free and unit-test changes here in `kanban.test.ts`.
- `src/components/KanbanBoard.tsx` owns all board state (`useState<BoardData>`) and the `DndContext`; it wires drag events to `moveCard` and owns the add/delete/rename card handlers, passing data and callbacks down to `KanbanColumn` -> `KanbanCard`/`KanbanCardPreview`/`NewCardForm`. There is no global state management beyond this component — state lives at the top of the tree and flows down via props.
- `src/app/page.tsx` just renders `KanbanBoard`; there is no routing beyond the single page yet (auth/login will change this in Part 4 of the plan).

Once the backend exists, expect `KanbanBoard` to switch from local `useState` seeded by `initialData` to fetching/persisting `BoardData` through the FastAPI API — `moveCard` and the rest of `kanban.ts` should still be reusable as-is since they only operate on `BoardData`.

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
