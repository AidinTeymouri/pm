from fastapi.testclient import TestClient

from app.auth import PASSWORD, USERNAME


def _login(client: TestClient) -> None:
    response = client.post(
        "/api/login", json={"username": USERNAME, "password": PASSWORD}
    )
    assert response.status_code == 200


def test_get_board_requires_auth(client):
    response = client.get("/api/board")
    assert response.status_code == 401


def test_put_board_requires_auth(client):
    response = client.put("/api/board", json={"columns": [], "cards": {}})
    assert response.status_code == 401


def test_get_board_returns_seeded_board(client):
    _login(client)
    response = client.get("/api/board")
    assert response.status_code == 200

    board = response.json()
    assert [column["id"] for column in board["columns"]] == [
        "col-backlog",
        "col-discovery",
        "col-progress",
        "col-review",
        "col-done",
    ]
    assert board["columns"][0]["cardIds"] == ["card-1", "card-2"]
    assert board["cards"]["card-1"]["title"] == "Align roadmap themes"
    assert len(board["cards"]) == 8


def test_put_board_persists_changes(client):
    _login(client)
    board = client.get("/api/board").json()

    board["columns"][0]["title"] = "Renamed Column"
    board["cards"]["card-1"]["title"] = "Updated title"
    moved_card = board["columns"][0]["cardIds"].pop()
    board["columns"][1]["cardIds"].append(moved_card)

    put_response = client.put("/api/board", json=board)
    assert put_response.status_code == 200

    refreshed = client.get("/api/board").json()
    assert refreshed["columns"][0]["title"] == "Renamed Column"
    assert refreshed["cards"]["card-1"]["title"] == "Updated title"
    assert moved_card in refreshed["columns"][1]["cardIds"]
    assert moved_card not in refreshed["columns"][0]["cardIds"]


def test_put_board_rejects_dangling_card_reference(client):
    _login(client)
    response = client.put(
        "/api/board",
        json={
            "columns": [{"id": "col-x", "title": "X", "cardIds": ["missing"]}],
            "cards": {},
        },
    )
    assert response.status_code == 422


def test_put_board_rejects_card_in_two_columns(client):
    _login(client)
    payload = {
        "columns": [
            {"id": "col-a", "title": "A", "cardIds": ["card-1"]},
            {"id": "col-b", "title": "B", "cardIds": ["card-1"]},
        ],
        "cards": {"card-1": {"id": "card-1", "title": "T", "details": ""}},
    }
    response = client.put("/api/board", json=payload)
    assert response.status_code == 422


def test_put_board_rejects_duplicate_column_ids(client):
    _login(client)
    payload = {
        "columns": [
            {"id": "col-a", "title": "A", "cardIds": []},
            {"id": "col-a", "title": "B", "cardIds": []},
        ],
        "cards": {},
    }
    response = client.put("/api/board", json=payload)
    assert response.status_code == 422


def test_put_board_rejects_malformed_payload(client):
    _login(client)
    response = client.put("/api/board", json={"columns": "not-a-list"})
    assert response.status_code == 422
