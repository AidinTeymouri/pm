from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

USERNAME = "user"
PASSWORD = "password"

router = APIRouter(prefix="/api")


class LoginRequest(BaseModel):
    username: str
    password: str


class SessionResponse(BaseModel):
    authenticated: bool
    username: str | None


@router.post("/login")
def login(payload: LoginRequest, request: Request) -> dict[str, str]:
    if payload.username != USERNAME or payload.password != PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    request.session["username"] = payload.username
    return {"username": payload.username}


@router.post("/logout")
def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"ok": True}


@router.get("/session")
def get_session(request: Request) -> SessionResponse:
    username = request.session.get("username")
    return SessionResponse(authenticated=username is not None, username=username)
