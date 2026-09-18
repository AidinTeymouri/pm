import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, model_validator

from app.db import get_connection

router = APIRouter(prefix="/api")


class Card(BaseModel):
    id: str
    title: str
    details: str


class Column(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]

    @model_validator(mode="after")
    def check_consistency(self) -> "BoardData":
        column_ids = [column.id for column in self.columns]
        if len(column_ids) != len(set(column_ids)):
            raise ValueError("duplicate column id in columns")

        seen_card_ids: set[str] = set()
        for column in self.columns:
            for card_id in column.cardIds:
                if card_id not in self.cards:
                    raise ValueError(f"cardIds references unknown card '{card_id}'")
                if card_id in seen_card_ids:
                    raise ValueError(f"card '{card_id}' appears in more than one column")
                seen_card_ids.add(card_id)
        return self


def require_username(request: Request) -> str:
    username = request.session.get("username")
    if username is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return username


def _get_board_id(conn: sqlite3.Connection, username: str) -> int:
    user_row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user_row is None:
        raise HTTPException(status_code=404, detail="User not found")

    board_row = conn.execute(
        "SELECT id FROM boards WHERE user_id = ?", (user_row["id"],)
    ).fetchone()
    if board_row is None:
        raise HTTPException(status_code=404, detail="Board not found")

    return board_row["id"]


def load_board(username: str) -> BoardData:
    conn = get_connection()
    try:
        board_id = _get_board_id(conn, username)
        columns = conn.execute(
            "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
            (board_id,),
        ).fetchall()

        result_columns: list[Column] = []
        result_cards: dict[str, Card] = {}
        for column in columns:
            cards = conn.execute(
                "SELECT id, title, details FROM cards WHERE column_id = ? ORDER BY position",
                (column["id"],),
            ).fetchall()
            for card in cards:
                result_cards[card["id"]] = Card(
                    id=card["id"], title=card["title"], details=card["details"]
                )
            result_columns.append(
                Column(
                    id=column["id"],
                    title=column["title"],
                    cardIds=[card["id"] for card in cards],
                )
            )
        return BoardData(columns=result_columns, cards=result_cards)
    finally:
        conn.close()


def write_board(username: str, board: BoardData) -> BoardData:
    conn = get_connection()
    try:
        board_id = _get_board_id(conn, username)
        conn.execute("DELETE FROM columns WHERE board_id = ?", (board_id,))

        for column_position, column in enumerate(board.columns):
            conn.execute(
                "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
                (column.id, board_id, column.title, column_position),
            )
            for card_position, card_id in enumerate(column.cardIds):
                card = board.cards[card_id]
                conn.execute(
                    "INSERT INTO cards (id, column_id, title, details, position) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (card.id, column.id, card.title, card.details, card_position),
                )
        conn.commit()
        return board
    finally:
        conn.close()


@router.get("/board")
def get_board(username: str = Depends(require_username)) -> BoardData:
    return load_board(username)


@router.put("/board")
def put_board(board: BoardData, username: str = Depends(require_username)) -> BoardData:
    return write_board(username, board)
