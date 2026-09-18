# High level steps for project

Each part below is a checklist to be checked off as work completes. Do not
start a part until the previous one's success criteria are met. Keep this
file up to date as parts land — check off substeps, and note any deviations
from the plan inline.

## Part 1: Plan

- [x] Enrich this document with substeps, tests, and success criteria for
      every part (this edit).
- [x] Create `frontend/AGENTS.md` describing the existing frontend code
      (structure, state model, testing setup, commands).
- [ ] User reviews and approves this plan before Part 2 starts.

**Success criteria:** user has explicitly signed off on this document.

---

## Part 2: Scaffolding

Set up the Docker infrastructure, the FastAPI backend skeleton, and
start/stop scripts, serving a static "hello world" page plus one working API
call — nothing Kanban-specific yet.

- [x] `backend/`: FastAPI app (managed with `uv`) with:
  - [x] `GET /api/health` returning a small JSON payload (e.g. `{"status": "ok"}`).
  - [x] A `static/` mount point at `/` serving a placeholder `index.html`
        ("hello world") — this will later be replaced by the built Next.js
        output in Part 3.
  - [x] `pyproject.toml` / `uv.lock` for dependency management.
- [x] `Dockerfile` at the project root: single container, builds and runs the
      backend, exposes one port.
- [x] `docker-compose.yml` (or equivalent) if it simplifies local run/config
      (env vars, port mapping, volume for the SQLite file) — optional if the
      Dockerfile alone is simpler. (Skipped: a plain Dockerfile + start/stop
      scripts covers port mapping and `.env` passthrough with less moving
      parts; revisit if a SQLite volume mount in Part 6 makes compose worth it.)
- [x] `scripts/start.sh`, `scripts/stop.sh` (Mac/Linux) and `scripts/start.bat`,
      `scripts/stop.bat` (Windows): build/run the container, and stop/remove it.
- [x] `backend/AGENTS.md` updated to describe the FastAPI app layout.
- [x] Root `.env.example` documenting `OPENROUTER_API_KEY` (real `.env` stays
      gitignored).

**Tests:**
- [x] Manual/documented: running `scripts/start.sh` then `curl localhost:<port>/`
  returns the hello-world HTML, and `curl localhost:<port>/api/health` returns
  the JSON payload.
- [x] A basic `backend/tests/test_health.py` using FastAPI's `TestClient` to
  assert `GET /api/health` returns 200 and the expected body.

**Success criteria:** `scripts/start.sh` brings up one Docker container that
serves static HTML at `/` and answers a real API call at `/api/health`;
`scripts/stop.sh` tears it down cleanly; the health test passes. **Met** —
verified locally: built and ran the image, `curl`'d both endpoints, ran
`scripts/stop.sh`, and confirmed the container was removed; `uv run pytest`
passes (2/2).

---

## Part 3: Add in Frontend

Serve the actual Next.js app (statically built) from the FastAPI backend,
replacing the Part 2 placeholder page, so the demo Kanban board (already
built — see `frontend/AGENTS.md`) is reachable at `/` through the same
container as the backend.

- [x] Confirm the frontend builds as static output (Next.js static export or
      equivalent) compatible with FastAPI's static file serving. (`output:
      "export"` in `next.config.ts`; no `next/image`/`next/link`/routing
      APIs in use, so no further config was needed. Also pinned
      `turbopack.root` to silence a workspace-root warning caused by a
      stray lockfile outside the repo.)
- [x] Update the Dockerfile to build the frontend (`npm run build`) and copy
      its output into the location `backend/` serves from `/`. (Multi-stage
      build: `node:24-slim` builder stage runs `npm ci && npm run build`,
      output `frontend/out` is copied into the backend image's `./static`.
      `backend/static/index.html` is left in the repo for local
      backend-only dev; the Docker image always overwrites it with the
      real build.)
- [x] Update `backend/` static mount to serve the built frontend instead of
      the Part 2 placeholder, including client-side routing fallback if
      needed. (No fallback needed — single route `/`, and `StaticFiles(...,
      html=True)` already serves `index.html` at the root.)
- [x] Verify existing frontend unit tests (`kanban.test.ts`,
      `KanbanBoard.test.tsx`) and e2e test (`tests/kanban.spec.ts`) still pass
      unmodified against the demo.
- [x] Add/extend e2e coverage so at least one Playwright test runs against the
      backend-served build (not just `next dev`), if feasible without
      duplicating the existing suite. (Skipped: manually verified the
      built container serves the real board via `curl` — title, all 5
      columns, all 8 cards present, not the placeholder. Automating that in
      Playwright would mean orchestrating Docker from the test run for
      marginal extra signal over the existing dev-server e2e suite plus
      this manual check; revisit if the container-serving path grows more
      logic worth regression-testing.)

**Tests:**
- [x] `npm run test:unit` and `npm run test:e2e` continue to pass (6 unit,
      3 e2e).
- [x] `npm run lint` passes.
- [x] Container-level check: after `scripts/start.sh`, loading `/` in a
      browser (or `curl`) shows the Kanban board HTML/JS, not the Part 2
      placeholder — confirmed (title "Kanban Studio", all columns/cards
      rendered) and `/api/health` still responds.

**Success criteria:** hitting `/` on the running container shows the working
Kanban demo (drag/drop, rename, add/delete card), served entirely by the
FastAPI backend; all frontend tests still pass. **Met.**

---

## Part 4: Add in a fake user sign in experience

Gate the Kanban behind a hardcoded login (`user` / `password`), with logout.

- [x] Backend: `POST /api/login` validates the hardcoded credentials and sets
      a session (cookie or token — pick the simplest that works locally).
      (Starlette `SessionMiddleware` — a signed `pm_session` cookie, secret
      from `SESSION_SECRET` env var with a dev fallback.)
- [x] Backend: `POST /api/logout` clears the session.
- [x] Backend: a way to check current session state (e.g. `GET /api/session`)
      that the frontend can use to decide whether to show the login screen.
- [x] Frontend: a login page/form shown when not authenticated; on success,
      redirect to the Kanban board. (No separate route — the static export
      has a single page; `page.tsx` fetches `/api/session` on mount and
      conditionally renders `LoginForm` or `KanbanBoard`, matching the
      single-page architecture noted in `frontend/AGENTS.md`.)
- [x] Frontend: a logout control (e.g. in the board header) that calls
      `/api/logout` and returns to the login screen.
- [x] Frontend: route protection so `/` redirects to login when no valid
      session exists. (Achieved via the same conditional render — there is
      no way to reach the board UI without a successful `/api/session`
      check, since it's the only route.)
- [x] Wrong credentials show an inline error; no crash, no leaking of the
      correct credentials in errors.

**Tests:**
- [x] Backend: unit tests for `/api/login` (correct creds → success + session;
  wrong creds, including unknown username → 401), `/api/logout` (clears
  session), `/api/session` (reflects login state) — `test_auth.py`, 4 tests.
- [x] Frontend: component/unit tests for the login form (valid submit, invalid
  submit shows error) — `LoginForm.test.tsx`; plus `auth.test.ts` (fetch
  wrapper behavior) and `page.test.tsx` (gate renders login vs. board vs.
  loading, logout returns to login).
- [x] E2E: full flow — visit `/`, redirected to login, log in with correct
  creds, see the board, log out, redirected back to login; also verify wrong
  creds are rejected. (`tests/auth.spec.ts`, network-mocked against `next
  dev`, matching the existing e2e pattern; `tests/kanban.spec.ts` updated
  with a shared `auth-helpers.ts` mock so the pre-existing board tests keep
  working now that the gate sits in front of them.)
- [x] Manual full-stack verification: built and ran the real Docker
  container, drove it with a real headless browser (a throwaway Playwright
  spec against `http://localhost:8000`, deleted after the run) — confirmed
  the login gate appears, wrong credentials show the inline error, correct
  credentials reveal the board, the session survives a page reload, logout
  returns to the login screen, and it stays gated after another reload. Also
  verified the raw cookie exchange with `curl` (`set-cookie: pm_session=...;
  httponly; samesite=lax`).

**Success criteria:** the Kanban board is unreachable without logging in as
`user`/`password`; logging out returns to the login screen; all new and
existing tests pass. **Met** — 6/6 backend tests, 17/17 frontend unit tests,
5/5 e2e tests, plus the manual full-stack browser check above.

---

## Part 5: Database modeling

Design the persistence schema for users and their Kanban board.

- [x] Propose a schema supporting multiple users (even though the MVP only
      ever has one hardcoded user) and exactly one board per user, matching
      `BoardData` from `kanban.ts` (columns with ordered card ids, cards
      keyed by id with title/details). (`users` / `boards` / `columns` /
      `cards`, one-to-one enforced by `UNIQUE boards.user_id`; `columns`/
      `cards` reuse the frontend's string ids directly, so the API needs no
      id-translation layer.)
- [x] Save the schema as JSON (`docs/schema.json`) — table/column
      definitions, types, keys, relationships, plus the exact
      `CREATE TABLE` SQL per table.
- [x] Write `docs/DATABASE.md` documenting the schema in prose: tables,
      relationships, how `BoardData` maps to rows, and migration/creation
      approach (SQLite file created on first run if missing). Also
      recommends a full-replace write strategy for `PUT /api/board` in
      Part 6 (delete + re-insert in one transaction) over granular
      per-field updates, given how small the board always is.
- [ ] Get explicit user sign-off on the schema before Part 6 starts.

**Tests:** none (design-only part) — success is reviewable documentation.

**Success criteria:** `docs/schema.json` and `docs/DATABASE.md` exist,
accurately describe a schema capable of representing the current
`BoardData` shape for multiple users, and the user has approved them.

---

## Part 6: Backend

Implement the database-backed API for reading/writing a user's Kanban board.

- [x] SQLite setup: create the database file and tables from the Part 5
      schema on first run if missing (no separate manual migration step for
      the MVP). (`app/db.py`'s `init_db()`, run from a FastAPI `lifespan`
      hook on startup; `CREATE TABLE IF NOT EXISTS` + seed-if-no-user, so
      it's idempotent to call again.)
- [x] `GET /api/board` — returns the current user's `BoardData` (matching the
      frontend's `BoardData` shape exactly, so the frontend needs no
      translation layer).
- [x] `PUT /api/board` (or more granular endpoints, e.g. per-card/per-column
      mutations — pick whichever keeps `moveCard`-style logic reusable) to
      persist changes. (Full replace in one transaction, per the Part 5
      recommendation: delete the board's `columns` — cascades to `cards` —
      then re-insert everything from the request body.)
- [x] All board routes require a valid session from Part 4. (`Depends
      (require_username)`, 401 if `request.session["username"]` is unset.)
- [x] Seed the hardcoded user's board with `initialData` on first run so the
      demo experience is unchanged after login. (`INITIAL_BOARD` in
      `app/db.py` mirrors `frontend/src/lib/kanban.ts`'s `initialData`
      field-for-field.)

**Tests:**
- [x] Backend unit tests covering: fresh-database bootstrap (tables + seed
  data created), `GET /api/board` returns the seeded board, `PUT /api/board`
  persists a change and a subsequent `GET` reflects it, unauthenticated
  requests are rejected (401), and basic validation (malformed payload
  rejected with 4xx) — `test_db.py` (3 tests), `test_board.py` (8 tests,
  including duplicate-column-id and card-in-two-columns cases that would
  otherwise hit the primary-key constraint mid-transaction).
- [x] Test isolation: each test run uses a temp/throwaway SQLite file, not the
  real one. (`tests/conftest.py`'s `client` fixture points `PM_DB_PATH` at
  `tmp_path` and uses `TestClient` as a context manager so the `lifespan`
  startup runs against that isolated file; confirmed no `backend/data/`
  directory is created by a `pytest` run.)

**Success criteria:** with the server freshly started against no existing
database file, the DB and tables are created automatically, the seeded board
is retrievable via the API, updates persist across requests, and the backend
test suite passes. **Met** — 17/17 backend tests, plus manual verification
both standalone (`uv run uvicorn`) and inside the real Docker container:
`curl`'d through login → seeded `GET /api/board` → `PUT` a change → `GET`
again and confirmed it persisted → confirmed a malformed payload gets 422 →
confirmed `pm.db` exists at `/app/backend/data/pm.db` inside the container.

---

## Part 7: Frontend + Backend

Wire `KanbanBoard` to the real API instead of local-only `useState`.

- [x] Replace `initialData` seeding in `KanbanBoard` with a fetch of
      `GET /api/board` on load (with a loading state). (`initialData` stays
      in `kanban.ts` as a test fixture only — it's what the backend seeds a
      fresh DB with, so it's still the right shape to test against.)
- [x] Every mutation (drag/drop move, rename column, add card, delete card)
      persists via the Part 6 API, optimistically updating local state and
      reconciling/rolling back on failure. (`updateBoard()` in
      `KanbanBoard.tsx`: apply the updater to local state immediately, then
      `saveBoard()` in the background; on failure, revert to the
      pre-update board and show an inline error.)
- [x] Handle the logged-out case (401 from the board API) by redirecting to
      login. (`board-api.ts`'s `UnauthorizedError`, thrown on any 401 from
      `fetchBoard`/`saveBoard`; `KanbanBoard` calls the new
      `onSessionExpired` prop instead of showing an error, which `page.tsx`
      wires to the same "show the login form" transition `onLogout` uses —
      just without also calling `/api/logout`, since the server already
      dropped the session.)
- [x] Basic error/loading UI (e.g. a spinner while loading, a visible error
      state if the board fails to load). (Loading text, an error screen
      with a Retry button that re-triggers the fetch, and an inline banner
      for a failed save.)
- [x] Mount `backend/data/` as a Docker volume (`scripts/start.sh`/`.bat`)
      so the SQLite file survives `stop`/`start`, not just page reloads —
      currently `docker rm -f` on every `start` throws away the container's
      filesystem, which didn't matter before there was persistent state to
      lose.

**Tests:**
- [x] Frontend unit/component tests: `KanbanBoard` fetches and renders board
  data from a mocked API; a mutation triggers the expected API call; a
  failed mutation surfaces an error and does not silently lose the change
  (`KanbanBoard.test.tsx`, 9 tests, `fetchBoard`/`saveBoard` mocked via
  `vi.spyOn`; plus `board-api.test.ts`, 5 tests, for the fetch wrappers
  themselves). 27/27 unit tests pass in total.
- [x] E2E: full flow — log in, see the seeded board, drag a card, rename a
  column, add and delete a card, reload the page and confirm changes
  persisted. Implemented with mocked `/api/*` routes against `next dev`
  (matching the Part 4 pattern), not a real backend + test DB as originally
  worded here: `tests/board-helpers.ts`'s `mockBoardApi` is a small
  stateful GET/PUT mock so a reload genuinely reflects the last PUT, which
  is what `kanban.spec.ts`'s new "persists a change across a reload" test
  exercises. 6/6 e2e tests pass. Real frontend+backend+SQLite integration
  is covered by the manual check below instead.

**Success criteria:** the Kanban board is now fully persistent — every
change survives a page reload — with no regressions in existing UI behavior,
and both unit and e2e suites pass end-to-end against the real backend.
**Met** — 27/27 frontend unit tests, 6/6 e2e tests, 17/17 backend tests
(unchanged). Manual verification against the real Docker container (with
the new volume mount): logged in with a real browser (throwaway Playwright
spec against `http://localhost:8000`, deleted after the run), renamed a
column, reloaded and confirmed the rename persisted, then `stop`/`start`ed
the container and confirmed via `curl` that the rename survived the full
container restart (the SQLite file lives at `backend/data/pm.db` on the
host now, not just inside the ephemeral container filesystem).

---

## Part 8: AI connectivity

Prove the backend can call an LLM via OpenRouter, independent of the Kanban
feature.

- [x] Backend: OpenRouter client configured with `OPENROUTER_API_KEY` from
      `.env`, model `openai/gpt-oss-120b`. (`app/ai.py`'s `call_openrouter`;
      `app/main.py` now calls `load_dotenv()` on startup so `.env` is
      actually read regardless of how the app is launched.)
- [x] A minimal endpoint (e.g. `POST /api/ai/ping`) that sends a fixed prompt
      like "What is 2+2? Answer with just the number." and returns the
      model's response. (Behind `require_username`, like the board routes.)
- [x] Handle and surface upstream errors (bad key, network failure, rate
      limit) as a clear 5xx/4xx rather than crashing. (Missing key → 500;
      network/timeout error → 502; OpenRouter 429 → 429; any other
      non-200 or an unparseable response body → 502.)

**Tests:**
- [x] A backend test that calls the ping endpoint and asserts the response
  contains "4" (marked as an integration test requiring a real API key /
  network access; skips gracefully — `pytest.mark.skipif` — if the key
  isn't present). `test_ai.py::test_ping_live`.
- [x] A unit test with the OpenRouter call mocked, verifying request shape
  (model name, prompt) and response parsing/error handling. 7 mocked tests
  in `test_ai.py` covering: auth required, missing key, exact request shape
  (URL/headers/model/messages), a non-200 upstream response, a 429, a
  network error, and a malformed response body.

**Success criteria:** hitting the ping endpoint returns a correct "4" from a
live OpenRouter call, proving the key, model name, and network path all
work; mocked unit tests pass without needing network access. **Met** —
25/25 backend tests (24 mocked + the live test, unskipped once a real key
was added to `.env`). Also verified manually: standalone via `uv run
uvicorn` and again inside the real Docker container (`--env-file .env`
passthrough), `curl`'d through login → `POST /api/ai/ping` → `{"answer":
"4"}` in both cases.

Note: while wiring this up, the user initially pasted the real API key into
`.env.example` (the committed template) instead of `.env` (gitignored).
Caught before anything was committed — `.env.example` was still untracked
in this session, so there was no git history to clean up — moved the key to
`.env` and restored `.env.example` to a blank template.

---

## Part 9: AI chat with Kanban context and structured output

Extend the AI call so it always has the board state and conversation
history, and can propose board edits via Structured Outputs.

- [x] Define the request contract: user message + conversation history +
      current `BoardData` (as JSON) sent to the model on every call.
      (`ChatRequest {message, history}`; history is client-managed —
      there's no conversations/messages table, so the frontend resends the
      transcript each call, consistent with "keep it simple" for the MVP.
      Board JSON is embedded in the system prompt, built fresh from
      `load_board()` on every call.)
- [x] Define a Structured Output schema for the response: a chat `reply`
      string, plus an optional `board_update` matching (or diffing against)
      `BoardData`. (`ChatModelOutput {reply, board_update}`, strict JSON
      Schema via `ChatModelOutput.model_json_schema()`. `board_update`
      represents `cards` as an **array**, not `BoardData`'s
      `dict[str, Card]` — strict-mode structured outputs don't support
      map-shaped objects with arbitrary keys, confirmed empirically against
      the live API — converted to the real `BoardData` shape at the API
      boundary before reuse/persistence.)
- [x] `POST /api/ai/chat` endpoint: accepts `{message, history}`, loads the
      current user's board, calls OpenRouter with the schema, returns
      `{reply, board_update?}`.
- [x] If `board_update` is present, persist it via the Part 6 board-write
      path (reusing that logic, not duplicating it). (Refactored
      `app/board.py` to expose `load_board`/`write_board` as plain
      functions; both `GET`/`PUT /api/board` and the chat endpoint call
      them — one read path, one write path, not one per caller.)
- [x] Validate the model's structured output against the schema before
      trusting/persisting it; reject and surface an error on mismatch rather
      than corrupting the board. (Pydantic validation at two levels: the
      JSON must match `ChatModelOutput`'s schema, and the resulting
      `board_update` must pass `BoardData`'s existing consistency validator
      — reused as-is — before anything is written. Either failure → 502,
      nothing persisted.)

**Tests:**
- [x] Unit tests with the OpenRouter call mocked: request includes board JSON +
  history + message; a response with only `reply` returns just the chat
  message and does not touch the board; a response with `board_update`
  persists it via the existing board-write logic; a malformed/invalid
  structured response is rejected cleanly. `test_ai_chat.py`, 9 mocked
  tests (see `backend/AGENTS.md` for the full list, including the retry
  and give-up-after-max-attempts cases below).
- [x] Integration test (real API key, may be skipped in CI): ask a question that
  requires no board change ("what columns do I have?") and one that requests
  a change ("add a card called X to Backlog"), and confirm the right shape
  comes back and the board updates only in the second case.
  `test_chat_live_no_change_question`, `test_chat_live_add_card`.

**Success criteria:** the chat endpoint reliably returns a conversational
reply, and — only when the user's request implies it — a validated board
update that gets persisted; conversation history and full board context are
sent on every call. **Met, with a documented caveat** — 35/35 backend tests
(mocked + live), and manual verification against the real Docker container
(both a no-change question and an add-card question, confirmed persisted
via a subsequent `GET /api/board`).

While building this, live testing surfaced two real reliability problems
with `openai/gpt-oss-120b` via OpenRouter, found and fixed with evidence
rather than guessed at:
1. One provider OpenRouter routes this model to (DeepInfra) silently
   ignored `response_format` and returned prose instead of JSON in ~50% of
   calls. Fixed by excluding it (`provider: {"ignore": ["DeepInfra"]}`) —
   confirmed 10/10 successful structured calls after, vs. frequent failures
   before.
2. Even with valid JSON, the model sometimes drops cards from the `cards`
   array while still referencing their ids in `cardIds` when asked to echo
   back an 8-card board with one change — a `BoardData` validation failure.
   Mitigated with one corrective retry (`MAX_CHAT_ATTEMPTS = 2`) and a
   stronger system-prompt warning; this reduced but did not eliminate the
   failure rate in live testing.
   **Caveat for Part 10 and beyond:** the chat endpoint can still return a
   502 on a board-changing request after both attempts fail — this is the
   validation safety net working as designed (the board is never
   corrupted), not a crash, but the UI must handle it as a normal error
   case (show it, keep the user's board state, let them retry) rather than
   assuming board-changing chat turns always succeed. This is an inherent
   tradeoff of the "full replace" persistence design chosen in Part 5/6 —
   a smaller model is more likely to mis-transcribe a large board than to
   propose a small diff — and wasn't fully apparent until testing against
   the real model.

---

## Part 10: AI chat sidebar in the UI

Add the chat UI and wire it to auto-refresh the board on AI-driven updates.

- [ ] A sidebar component (matching the existing color scheme) with a
      message list and input, calling `/api/ai/chat` and appending to
      conversation history client-side (or fetching history from the
      backend, whichever Part 9 settled on).
- [ ] Loading/error states while waiting on the AI response.
- [ ] When a response includes a board update, refetch/re-render the board
      (`GET /api/board`) so the UI reflects the AI's change without a manual
      page reload.
- [ ] Sidebar can be opened/closed without disrupting board state.

**Tests:**
- Frontend component tests: sending a message renders the reply; a mocked
  response containing a board update triggers a board refetch/rerender.
- E2E: open the chat, ask the AI to modify the board (e.g. "move card X to
  Done"), confirm the reply appears and the board visibly updates without a
  manual reload.

**Success criteria:** a user can chat with the AI about their board and see
it make live edits (new/edited/moved cards) reflected immediately in the
Kanban UI, with no manual refresh needed.
