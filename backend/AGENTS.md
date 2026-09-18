# Backend

FastAPI app, managed with `uv`. Serves the built frontend, a hardcoded-user
login (Part 4), a SQLite-backed Kanban board API (Part 6), an OpenRouter
connectivity check (Part 8), and a board-aware AI chat endpoint with
structured-output board edits (Part 9 of `docs/PLAN.md`).

## Structure

- `app/main.py` — the FastAPI app. Calls `load_dotenv()` against the root
  `.env` first thing (so `SESSION_SECRET`/`OPENROUTER_API_KEY` are available
  from env vars however the app is launched — `uv run`, Docker's
  `--env-file .env`, or a real deployment env — `load_dotenv` never
  overrides a var that's already set, so real env vars still win over
  `.env`). `GET /api/health` returns `{"status": "ok"}`.
  `SessionMiddleware` (signed cookie, `pm_session`) is registered so
  `request.session` works in route handlers. A `lifespan` context manager
  calls `db.init_db()` on startup. Everything else is mounted from
  `static/` at `/` (`html=True` so `/` serves `static/index.html` — the
  built frontend in Docker, a placeholder locally). API routes must be
  registered before the `/` static mount so they take precedence.
- `app/auth.py` — hardcoded credentials (`user`/`password`) and the auth
  routes: `POST /api/login` (sets `request.session["username"]` on success,
  401 on bad creds), `POST /api/logout` (clears the session), `GET
  /api/session` (`{authenticated, username}` — the frontend polls this once
  on load to decide whether to show the login form or the board).
- `app/db.py` — SQLite access. `SCHEMA_SQL` matches `docs/schema.json`
  exactly (`users` / `boards` / `columns` / `cards`, `ON DELETE CASCADE`
  throughout). `get_connection()` opens a fresh `sqlite3.Connection` per call
  (`PRAGMA foreign_keys = ON`, `row_factory = sqlite3.Row`) — no shared
  connection object, since FastAPI's sync routes run in a threadpool.
  `get_db_path()` defaults to `backend/data/pm.db` but reads the
  `PM_DB_PATH` env var first, which is how tests point it at a temp file.
  `init_db()` runs the schema (`CREATE TABLE IF NOT EXISTS`, idempotent) and
  seeds the hardcoded `user` with a board matching
  `frontend/src/lib/kanban.ts`'s `initialData` (`INITIAL_BOARD`) if that user
  doesn't exist yet.
- `app/board.py` — `BoardData`/`Column`/`Card` (the shapes the frontend
  uses, `cards` as a `dict[str, Card]`) plus `load_board(username)` and
  `write_board(username, board)` — the reusable read/write functions.
  `GET /api/board` and `PUT /api/board` are now thin wrappers around these
  (both behind `require_username`, a `Depends` that 401s if
  `request.session["username"]` is unset); `app/ai.py`'s chat endpoint
  calls the same two functions directly, so there is exactly one
  read path and one write path for the board, not one per caller.
  `PUT`/`write_board` does a full replace in one transaction — delete the
  user's `columns` (cascades to `cards`), then re-insert everything from
  the submitted body, `position` taken from array order. `BoardData`'s
  pydantic `model_validator` rejects (422, or a caught `ValidationError` in
  `app.ai`) a payload with duplicate column ids, a `cardIds` entry with no
  matching `cards` key, or a card referenced from more than one column —
  those would otherwise hit the `columns.id`/`cards.id` primary key
  constraint mid-transaction.
- `app/ai.py` — OpenRouter connectivity (`MODEL`, `OPENROUTER_URL`,
  `call_openrouter`) plus two endpoints, both behind `require_username`:
  - `POST /api/ai/ping` — unchanged from Part 8: a fixed "what is 2+2"
    prompt, `{"answer": "4"}`, a smoke test independent of board logic.
  - `POST /api/ai/chat` — `{message, history}` in, `{reply, board_update}`
    out. Loads the user's board via `load_board`, builds a system prompt
    embedding the full board JSON plus the update rules, and requests a
    **strict JSON Schema structured output** (`CHAT_RESPONSE_FORMAT`, built
    from `ChatModelOutput.model_json_schema()`) so the model can only
    return `{reply: string, board_update: <schema> | null}`. `board_update`
    represents `cards` as an **array**, not a dict/record — confirmed
    empirically that strict-mode structured outputs don't support
    map-shaped objects with arbitrary keys, only fixed `properties` — so
    `_board_update_to_board_data` converts it to the real `BoardData` shape
    (dict-keyed cards) before it touches `write_board` or the existing
    `BoardData` validator. If `board_update` is `null`, nothing is
    persisted. Two things had to be discovered empirically against the
    live API and are load-bearing, not just style choices:
    1. **`provider: {"ignore": ["DeepInfra"]}` is set on every structured
       call.** OpenRouter routes `openai/gpt-oss-120b` across several
       providers; DeepInfra silently ignores `response_format` and returns
       prose instead of JSON in roughly half of requests, even with
       `provider.require_parameters` set. 10/10 calls succeeded with it
       excluded vs. frequent failures without.
    2. **`_request_chat_output` retries once (`MAX_CHAT_ATTEMPTS = 2`)** if
       the model's output doesn't parse, or if `board_update` is
       schema-shaped but semantically broken — observed specifically as
       the model dropping cards from the `cards` array while still
       referencing their ids in a column's `cardIds` (a `BoardData`
       validation error). The retry appends the failed attempt plus a
       corrective message and asks again. If both attempts fail, the
       endpoint returns 502 rather than persisting anything — the board is
       never corrupted, but chat is not 100% reliable per call, since it
       depends on a mid-size model correctly echoing back the entire board
       on every board-changing turn. This is an inherent property of the
       "full replace" persistence design (Part 5/6), not a bug: a smaller
       diff-based update contract would be less error-prone but was
       rejected earlier for simplicity.
- `static/` — placeholder hello-world page for local backend-only dev; Part 3
  wired the Docker build to overwrite this with the built Next.js output.
- `tests/conftest.py` — the shared `client` fixture: sets `PM_DB_PATH` to a
  `tmp_path` file via `monkeypatch`, then yields a `TestClient` used as a
  context manager (`with TestClient(app) as ...`) so the `lifespan` startup
  (`init_db()`) actually runs against that isolated file. Every test gets a
  fresh cookie jar and a fresh, freshly-seeded database — nothing touches
  the real `backend/data/pm.db`.
- `tests/test_health.py`, `tests/test_auth.py`, `tests/test_board.py`,
  `tests/test_db.py`, `tests/test_ai.py`, `tests/test_ai_chat.py` —
  `TestClient`-based tests covering the health check, auth flow, board CRUD
  + validation, DB bootstrap/idempotency, and both AI endpoints. Mocked
  tests monkeypatch `httpx.post` directly (the module-level function, since
  `app.ai` calls `httpx.post(...)`, not an instantiated client) to check
  exact request shape and every error/retry path without hitting the
  network. `test_ai_chat.py` covers: request shape (board JSON + history +
  message, in order), a reply-only response leaves the board untouched, a
  valid `board_update` persists and is reflected in a subsequent `GET`, a
  malformed model response and an internally-inconsistent `board_update`
  both 502 without persisting anything, the retry recovers from one bad
  attempt, and giving up after `MAX_CHAT_ATTEMPTS`. Both files' `..._live`
  tests are `skipif`'d unless a real `OPENROUTER_API_KEY` is present in the
  environment (true automatically whenever a real key is in `.env`, since
  `conftest.py`'s `from app.main import app` triggers `load_dotenv()` at
  import time) — they make real calls against the live API.
- `pyproject.toml` / `uv.lock` — dependencies (`fastapi`, `uvicorn[standard]`,
  `itsdangerous` for session signing, `httpx` for the OpenRouter call,
  `python-dotenv` for `.env` loading; dev: `pytest`). No SQLite driver
  dependency — it's Python's stdlib `sqlite3`.

Session secret comes from the `SESSION_SECRET` env var (`.env`, see
`.env.example`), with a hardcoded dev fallback if unset — fine for the local,
single-user MVP. `OPENROUTER_API_KEY` has no fallback — if it's missing,
`/api/ai/ping` (and, later, the Part 9 chat endpoint) returns 500 rather than
silently doing nothing.

## Commands

Run from this directory:

```bash
uv sync                                  # install dependencies
uv run uvicorn app.main:app --reload     # dev server on :8000
uv run pytest                            # run tests
```

`backend/data/pm.db` is created automatically on first run (gitignored —
delete it to reset to the seeded demo board).

## Docker

The root `Dockerfile` builds this app with `uv sync --frozen --no-dev` and
runs it with `uvicorn` on port 8000. Build/run via `scripts/start.sh` (or
`.bat` on Windows); `scripts/stop.sh` tears the container down.
`scripts/start.sh`/`.bat` bind-mount the host's `backend/data/` into
`/app/backend/data` inside the container (creating the host directory first
if needed), so the SQLite file survives `stop`/`start` even though every
`start` does `docker rm -f` then a fresh `run`.
