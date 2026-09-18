from app.auth import USERNAME
from app.db import get_connection, init_db


def test_init_db_creates_tables_and_seeds_user(client):
    conn = get_connection()
    try:
        user = conn.execute(
            "SELECT * FROM users WHERE username = ?", (USERNAME,)
        ).fetchone()
        assert user is not None

        board = conn.execute(
            "SELECT * FROM boards WHERE user_id = ?", (user["id"],)
        ).fetchone()
        assert board is not None

        columns = conn.execute(
            "SELECT * FROM columns WHERE board_id = ? ORDER BY position",
            (board["id"],),
        ).fetchall()
        assert len(columns) == 5

        cards = conn.execute("SELECT * FROM cards").fetchall()
        assert len(cards) == 8
    finally:
        conn.close()


def test_init_db_is_idempotent(client):
    init_db()
    init_db()

    conn = get_connection()
    try:
        user_count = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        board_count = conn.execute("SELECT COUNT(*) AS c FROM boards").fetchone()["c"]
        column_count = conn.execute("SELECT COUNT(*) AS c FROM columns").fetchone()["c"]
        assert user_count == 1
        assert board_count == 1
        assert column_count == 5
    finally:
        conn.close()


def test_init_db_creates_db_file_when_missing(tmp_path, monkeypatch):
    fresh_path = tmp_path / "nested" / "fresh.db"
    monkeypatch.setenv("PM_DB_PATH", str(fresh_path))

    assert not fresh_path.exists()
    init_db()
    assert fresh_path.exists()
