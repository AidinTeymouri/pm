import json
import os

import httpx
import pytest

from app.ai import CHAT_RESPONSE_FORMAT
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


def _mock_model_reply(monkeypatch, model_output: dict) -> None:
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *a, **k: FakeResponse(
            200, {"choices": [{"message": {"content": json.dumps(model_output)}}]}
        ),
    )


def test_chat_requires_auth(client):
    response = client.post("/api/ai/chat", json={"message": "hi"})
    assert response.status_code == 401


def test_chat_sends_board_and_history(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["json"] = json
        return FakeResponse(
            200,
            {
                "choices": [
                    {"message": {"content": '{"reply": "hi", "board_update": null}'}}
                ]
            },
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    _login(client)

    response = client.post(
        "/api/ai/chat",
        json={
            "message": "what columns do I have?",
            "history": [
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "hi there"},
            ],
        },
    )
    assert response.status_code == 200
    assert response.json() == {"reply": "hi", "board_update": None}

    sent_messages = captured["json"]["messages"]
    assert sent_messages[0]["role"] == "system"
    assert "col-backlog" in sent_messages[0]["content"]
    assert sent_messages[1] == {"role": "user", "content": "hello"}
    assert sent_messages[2] == {"role": "assistant", "content": "hi there"}
    assert sent_messages[3] == {
        "role": "user",
        "content": "what columns do I have?",
    }
    assert captured["json"]["response_format"] == CHAT_RESPONSE_FORMAT

    # a reply-only response must not touch the board
    refreshed = client.get("/api/board").json()
    assert len(refreshed["columns"]) == 5


def test_chat_persists_board_update(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    _login(client)

    board = client.get("/api/board").json()
    payload = {"columns": board["columns"], "cards": list(board["cards"].values())}
    payload["cards"].append({"id": "card-9", "title": "New via AI", "details": ""})
    payload["columns"][0]["cardIds"].append("card-9")

    _mock_model_reply(monkeypatch, {"reply": "Added it!", "board_update": payload})

    response = client.post("/api/ai/chat", json={"message": "add a card"})
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "Added it!"
    assert body["board_update"]["cards"]["card-9"]["title"] == "New via AI"

    refreshed = client.get("/api/board").json()
    assert "card-9" in refreshed["cards"]
    assert "card-9" in refreshed["columns"][0]["cardIds"]


def test_chat_rejects_malformed_model_output(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *a, **k: FakeResponse(
            200, {"choices": [{"message": {"content": '{"not_reply": "oops"}'}}]}
        ),
    )
    _login(client)

    response = client.post("/api/ai/chat", json={"message": "hi"})
    assert response.status_code == 502


def test_chat_rejects_invalid_board_update(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    _login(client)

    _mock_model_reply(
        monkeypatch,
        {
            "reply": "done",
            "board_update": {
                "columns": [
                    {"id": "col-x", "title": "X", "cardIds": ["missing-card"]}
                ],
                "cards": [],
            },
        },
    )

    response = client.post("/api/ai/chat", json={"message": "hi"})
    assert response.status_code == 502

    refreshed = client.get("/api/board").json()
    assert len(refreshed["columns"]) == 5


def test_chat_retries_once_after_invalid_board_update(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    _login(client)

    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append(json)
        if len(calls) == 1:
            content = (
                '{"reply": "done", "board_update": '
                '{"columns": [{"id": "col-x", "title": "X", "cardIds": '
                '["missing-card"]}], "cards": []}}'
            )
        else:
            content = '{"reply": "fixed", "board_update": null}'
        return FakeResponse(200, {"choices": [{"message": {"content": content}}]})

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post("/api/ai/chat", json={"message": "add a card"})
    assert response.status_code == 200
    assert response.json() == {"reply": "fixed", "board_update": None}
    assert len(calls) == 2

    second_call_messages = calls[1]["messages"]
    assert second_call_messages[-2]["role"] == "assistant"
    assert "board_update was invalid" in second_call_messages[-1]["content"]


def test_chat_gives_up_after_max_attempts(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    _login(client)

    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append(json)
        return FakeResponse(
            200, {"choices": [{"message": {"content": '{"not_reply": "oops"}'}}]}
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    response = client.post("/api/ai/chat", json={"message": "hi"})
    assert response.status_code == 502
    assert len(calls) == 2


def test_chat_upstream_error_returns_502(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResponse(500, {}))
    _login(client)

    response = client.post("/api/ai/chat", json={"message": "hi"})
    assert response.status_code == 502


@pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"),
    reason="requires a real OPENROUTER_API_KEY to call the live OpenRouter API",
)
def test_chat_live_no_change_question(client):
    _login(client)
    response = client.post(
        "/api/ai/chat", json={"message": "What columns do I have?"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reply"]
    assert body["board_update"] is None

    refreshed = client.get("/api/board").json()
    assert len(refreshed["columns"]) == 5


@pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"),
    reason="requires a real OPENROUTER_API_KEY to call the live OpenRouter API",
)
def test_chat_live_add_card(client):
    _login(client)
    response = client.post(
        "/api/ai/chat",
        json={"message": "Add a card called 'Buy milk' to the Backlog column."},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["board_update"] is not None

    refreshed = client.get("/api/board").json()
    titles = [card["title"] for card in refreshed["cards"].values()]
    assert any("milk" in title.lower() for title in titles)
