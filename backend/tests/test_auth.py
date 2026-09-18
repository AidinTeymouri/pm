def test_session_initially_unauthenticated(client):
    response = client.get("/api/session")
    assert response.status_code == 200
    assert response.json() == {"authenticated": False, "username": None}


def test_login_rejects_wrong_credentials(client):
    response = client.post(
        "/api/login", json={"username": "user", "password": "wrong"}
    )
    assert response.status_code == 401
    assert client.get("/api/session").json()["authenticated"] is False


def test_login_rejects_unknown_username(client):
    response = client.post(
        "/api/login", json={"username": "nobody", "password": "password"}
    )
    assert response.status_code == 401


def test_login_logout_flow(client):
    login_response = client.post(
        "/api/login", json={"username": "user", "password": "password"}
    )
    assert login_response.status_code == 200
    assert login_response.json() == {"username": "user"}

    session_response = client.get("/api/session")
    assert session_response.json() == {"authenticated": True, "username": "user"}

    logout_response = client.post("/api/logout")
    assert logout_response.status_code == 200
    assert logout_response.json() == {"ok": True}

    session_after_logout = client.get("/api/session")
    assert session_after_logout.json() == {"authenticated": False, "username": None}
