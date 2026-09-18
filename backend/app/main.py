import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.ai import router as ai_router
from app.auth import router as auth_router
from app.board import router as board_router
from app.db import init_db

BACKEND_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BACKEND_DIR / "static"

load_dotenv(BACKEND_DIR.parent / ".env")

SESSION_SECRET = os.environ.get("SESSION_SECRET", "dev-secret-change-me")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, session_cookie="pm_session")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(board_router)
app.include_router(ai_router)

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
