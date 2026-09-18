import os

import httpx
import pytest

from app.ai import MODEL, OPENROUTER_URL
from app.auth import PASSWORD, USERNAME


class FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


def _login(client) -> None:
    response = client.post(
        "/api/login", json={"username": USERNAME, "password": PASSWORD}
    )
    assert response.status_code == 200


def test_ping_requires_auth(client):
    response = client.post("/api/ai/ping")
    assert response.status_code == 401


def test_ping_missing_api_key(client, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    _login(client)

    response = client.post("/api/ai/ping")
    assert response.status_code == 500


def test_ping_success_sends_expected_request(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return FakeResponse(200, {"choices": [{"message": {"content": "4"}}]})

    monkeypatch.setattr(httpx, "post", fake_post)
    _login(client)

    response = client.post("/api/ai/ping")
    assert response.status_code == 200
    assert response.json() == {"answer": "4"}

    assert captured["url"] == OPENROUTER_URL
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["json"]["model"] == MODEL
    assert captured["json"]["messages"] == [
        {"role": "user", "content": "What is 2+2? Answer with just the number."}
    ]


def test_ping_upstream_error_returns_502(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResponse(401, {}))
    _login(client)

    response = client.post("/api/ai/ping")
    assert response.status_code == 502


def test_ping_rate_limit_returns_429(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResponse(429, {}))
    _login(client)

    response = client.post("/api/ai/ping")
    assert response.status_code == 429


def test_ping_network_error_returns_502(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def raise_connect_error(*args, **kwargs):
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(httpx, "post", raise_connect_error)
    _login(client)

    response = client.post("/api/ai/ping")
    assert response.status_code == 502


def test_ping_malformed_response_returns_502(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: FakeResponse(200, {"unexpected": True})
    )
    _login(client)

    response = client.post("/api/ai/ping")
    assert response.status_code == 502


@pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"),
    reason="requires a real OPENROUTER_API_KEY to call the live OpenRouter API",
)
def test_ping_live(client):
    _login(client)
    response = client.post("/api/ai/ping")
    assert response.status_code == 200
    assert "4" in response.json()["answer"]
