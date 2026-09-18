# Scripts

Start/stop scripts for the single Docker container (backend + static
frontend). `start` builds the image from the root `Dockerfile`, removes any
existing `pm-app` container, and runs a new one on port 8000 (override with
`PORT=<port>`), passing the root `.env` file if present. It bind-mounts
`backend/data/` (creating it first if missing) into `/app/backend/data` in
the container, so the SQLite database survives being stopped and restarted.
`stop` removes the `pm-app` container (the host's `backend/data/` is
untouched).

- `start.sh` / `stop.sh` — Mac/Linux.
- `start.bat` / `stop.bat` — Windows.
