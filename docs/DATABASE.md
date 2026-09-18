# Database

SQLite. The schema (tables, columns, constraints, and the exact
`CREATE TABLE` statements) is defined in [`schema.json`](./schema.json) —
this document explains the reasoning and how it maps to the frontend's
`BoardData` shape (`frontend/src/lib/kanban.ts`).

## Tables

- **`users`** — one row per user. The MVP only ever creates the single
  hardcoded `user` row (matching the Part 4 login), but the schema doesn't
  assume that: `username` is unique, nothing else hardcodes a single row.
- **`boards`** — one row per user's board. `user_id` is `UNIQUE`, which is
  what actually enforces "exactly one board per user" — not application
  code.
- **`columns`** — the Kanban columns on a board, each with a `position`
  (its index in display order).
- **`cards`** — the cards in a column, each with a `position` (its index
  within that column).

`columns.id` and `cards.id` are `TEXT`, not autoincrementing integers,
because they reuse the same string ids the frontend already generates
(`createId()` in `kanban.ts`, e.g. `col-backlog`, `card-1`). This means the
API can read/write `BoardData` directly with no id-translation layer between
the database and the frontend.

Foreign keys cascade on delete (deleting a board deletes its columns, which
deletes their cards) since nothing in the app relies on orphaned rows. There
are no indexes beyond primary/unique keys — the MVP's data volume is one user
with one small board, so this isn't worth optimizing.

## Mapping to `BoardData`

```ts
type BoardData = {
  columns: { id: string; title: string; cardIds: string[] }[];
  cards: Record<string, { id: string; title: string; details: string }>;
};
```

**Reading a board** (`GET /api/board`, Part 6): look up the user's `boards`
row, then `columns` for that board ordered by `position`, then `cards` for
each column ordered by `position`. Build `BoardData.columns` from the
columns (with each column's `cardIds` taken from its ordered cards), and
`BoardData.cards` as a lookup of every card row keyed by `id`.

**Writing a board** (`PUT /api/board`, Part 6): the simplest correct
approach — and the one this schema is designed for — is a full replace
inside one transaction: delete all `columns`/`cards` for the user's board
(cascades handle the cards), then re-insert everything from the submitted
`BoardData`, assigning `position` from array order. The board is always
small (a handful of columns/cards), so there's no need for granular
per-field updates or diffing; a full replace keeps the write path simple and
matches how `KanbanBoard`'s `useState` already treats the board as one
value that gets replaced wholesale on every change.

## Creation on first run

Per `docs/PLAN.md` Part 6: on backend startup, if `backend/data/pm.db`
doesn't exist (or is missing tables), run the `CREATE TABLE` statements from
`schema.json`, then seed:
- one `users` row: `username = "user"` (matching the Part 4 hardcoded login).
- one `boards` row for that user.
- `columns`/`cards` rows matching `frontend/src/lib/kanban.ts`'s
  `initialData`, so the demo experience is unchanged once Part 7 switches
  the frontend from local state to the real API.

`backend/data/` is gitignored; the file is created by the app, not checked
in.
