# Code review

Full-repo review as of 2026-09-20 (commit `cb2a92d`, all of Parts 1-10 in
`docs/PLAN.md` complete). Covers `backend/`, `frontend/`, `scripts/`,
`Dockerfile`, and the docs. Verified against the running codebase, not just
reading: `uv run pytest` (35/35 pass), `npm run lint` (clean), `npx vitest
run` (39/39 pass), `npm run build` (succeeds, type-checks clean).

Overall the codebase is in good shape: small, single-purpose modules, one
read/write path for the board reused by both the REST API and the AI chat
endpoint, board consistency validated at every boundary, and test coverage
that actually exercises the tricky cases (duplicate ids, dangling card
references, retry/give-up paths on the AI chat endpoint). No correctness bugs
or security vulnerabilities were found in application logic. Findings below
are mostly documentation drift, MVP-scoped hardening, and small polish items.

## Findings

### 1. CLAUDE.md's "Project state" section is stale (High — fix first)

`CLAUDE.md:9-10` still says: *"Only the frontend demo exists so far (Parts
1-3 of the plan below); `backend/` and `scripts/` are empty placeholders
awaiting the FastAPI backend..."*

This is no longer true. Per `docs/PLAN.md` and git history (`21e4bb8 Add
FastAPI backend, auth, database, and AI chat (Parts 2-9)`, `fec9d24 Add AI
chat sidebar to the Kanban UI (Part 10)`), the backend, database, auth,
Docker packaging, and AI chat are all built and tested. Because CLAUDE.md is
loaded as project instructions on every session, this stale paragraph
actively misleads any future Claude Code session (and any human skimming it)
about what exists — e.g., it would suggest re-scaffolding a backend that
already has 35 passing tests.

**Action:** rewrite the "Project state" paragraph to reflect that Parts 1-10
are complete, and point to `docs/PLAN.md` for the checklist/history instead
of restating it.

### 2. No keyboard support for drag-and-drop (Medium) — Fixed

`frontend/src/components/KanbanBoard.tsx:60-64` wires only a `PointerSensor`
into `useSensors`:

```ts
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 6 },
  })
);
```

`@dnd-kit` ships a `KeyboardSensor` (with `sortableKeyboardCoordinates`) built
for exactly this case, but it isn't included. As it stands, moving a card
between columns or reordering within a column is impossible without a mouse
or touch pointer — there's no way to do it via keyboard alone.

**Action:** add `KeyboardSensor` alongside `PointerSensor`, or explicitly
note this as an accepted MVP limitation if keyboard support is out of scope.

**Resolved:** `KanbanBoard.tsx` now registers `KeyboardSensor` (with
`sortableKeyboardCoordinates` from `@dnd-kit/sortable`) alongside
`PointerSensor`. `KanbanCard`'s draggable element already spread
`useSortable`'s `attributes`/`listeners`, which provide the
focus/keydown wiring dnd-kit needs, so no other component changes were
required. Verified: `npm run lint`, `npx vitest run` (39/39), `npm run
build`, and `npx playwright test tests/kanban.spec.ts` (pointer-based
drag e2e, 4/4) all still pass.

### 3. `tsc --noEmit` fails on every test file (Low, latent) — Fixed

`npx tsc --noEmit` reports ~35 errors, all `Cannot find name 'describe' /
'it' / 'expect' / 'vi'` in `*.test.ts(x)` files. Root cause:
`frontend/src/test/vitest.d.ts:1-2` only references `types="vitest"`, not
`types="vitest/globals"`, so the ambient globals Vitest injects at runtime
(via `test.globals: true` in `vitest.config.ts:10`) aren't visible to a bare
`tsc` invocation.

This isn't breaking anything today — `npm run build` (Next's own type-check
step) and `npx vitest run` both currently pass — but it's a trap for later:
the moment anyone adds a standalone `"typecheck": "tsc --noEmit"` script
(a common addition, and currently absent from `package.json`), CI would fail
on every test file.

**Action:** add `/// <reference types="vitest/globals" />` to
`vitest.d.ts` (or `"types": ["vitest/globals"]` in `tsconfig.json`) so a
future standalone typecheck step doesn't break on day one.

**Resolved:** `vitest.d.ts` now references `types="vitest/globals"` instead
of plain `types="vitest"`. `npx tsc --noEmit` now exits clean with no
output (previously ~35 errors).

### 4. Rename input fires a network write per keystroke (Low, already known) — Fixed

`frontend/src/components/KanbanColumn.tsx:42-47`'s title `<input>` calls
`onRename` on every `onChange`, and `KanbanBoard.tsx:108-115`'s
`handleRenameColumn` routes every call through `updateBoard`, which triggers
a `saveBoard` PUT per keystroke. This is already called out as a known,
accepted tradeoff in `frontend/AGENTS.md` (harmless today since rename is
idempotent and rarely fails), but it's worth fixing opportunistically since
it's a real per-keystroke network cost and a real (if currently harmless)
race window between a stale keystroke's rollback and a later keystroke's
successful save.

**Action:** debounce the rename save (e.g. ~400ms) rather than firing on
every keystroke. Low priority — not causing observed problems.

**Resolved:** `KanbanBoard.tsx`'s `handleRenameColumn` now updates local
state immediately (so the input stays responsive) but debounces the actual
`saveBoard` call by 400ms, coalescing a burst of keystrokes into one PUT.
It also fixes the previously-noted rollback race: on a failed save it now
reverts to the board state from *before the whole typing burst started*
(tracked via a ref, cleared once a debounced save is issued), not just the
immediately-preceding keystroke's snapshot.

### 5. MVP-scoped auth hardening gaps (Low, by design) — Not changed, on purpose

Three small items in `backend/app/auth.py` and `backend/app/main.py`, all
consistent with "single hardcoded local user" being an explicit MVP
decision (`CLAUDE.md`'s Auth section) rather than bugs:

- `backend/app/auth.py:22` compares credentials with plain `!=`, which is
  not constant-time (a theoretical timing side channel).
- No rate limiting or lockout on `POST /api/login` — brute-forceable given
  enough attempts.
- `backend/app/main.py:20`'s `SESSION_SECRET` falls back to a hardcoded
  `"dev-secret-change-me"` if the env var is unset, which would make session
  cookies forgeable if this were ever exposed beyond localhost.

**Action:** none required for the current local-only MVP scope. Flagging so
that if this project is ever deployed anywhere reachable beyond localhost,
these three are the first things to revisit — none of them are appropriate
to fix speculatively right now per the "no unnecessary defensive
programming" standard in CLAUDE.md.

### 6. `frontend/README.md` is unmodified `create-next-app` boilerplate (Low) — Fixed

It's 15 lines of generic run/test commands and doesn't mention the backend,
Docker, or auth — while `frontend/AGENTS.md` already documents all of that
in depth. Not actively wrong, just redundant/thin next to the AGENTS.md file.

**Action:** either trim it further (point to `frontend/AGENTS.md` and the
root `CLAUDE.md`) or leave as-is — low priority, not blocking anything.

**Resolved:** trimmed to a short pointer at `frontend/AGENTS.md` and the
root `CLAUDE.md`, plus the same run/test commands it had before.

## Explicitly checked and found fine (no action needed)

- **Secrets hygiene:** `.env` (containing a real `OPENROUTER_API_KEY`) is
  correctly gitignored and has never been committed (`git log --all -- .env`
  is empty); `.env.example` is a blank template. No build artifacts
  (`frontend/out/`, `test-results/`, `backend/data/pm.db`,
  `.pytest_cache/`) are tracked either.
- **Board consistency:** `BoardData`'s `model_validator`
  (`backend/app/board.py:27-41`) rejects duplicate column ids, dangling
  `cardIds` references, and cards claimed by two columns, at every
  write boundary (`PUT /api/board` and the AI chat endpoint) — covered by
  dedicated tests in `test_board.py`.
- **AI structured-output reliability:** the two live-API failure modes
  documented in `docs/PLAN.md` Part 9 (DeepInfra ignoring
  `response_format`, the model occasionally dropping cards from `cards`
  while still referencing them in `cardIds`) were root-caused with evidence
  (10/10 vs. frequent-failure comparisons) and mitigated
  (`provider.ignore`, one corrective retry via `MAX_CHAT_ATTEMPTS`) rather
  than guessed at — matches CLAUDE.md's "root cause before fix" standard.
  The remaining residual failure mode (502 after both attempts fail) is
  handled as a normal, non-corrupting error path, not a crash.
- **Single read/write path:** `load_board`/`write_board` in
  `backend/app/board.py` are called by both the REST board routes and
  `backend/app/ai.py`'s chat endpoint — no duplicated persistence logic.
- **Test coverage:** 35/35 backend tests, 39/39 frontend unit tests, 8/8 (per
  `docs/PLAN.md`) e2e tests all currently pass; lint is clean; `next build`
  type-checks and builds cleanly.
