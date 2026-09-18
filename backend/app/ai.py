import os
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, ValidationError

from app.board import BoardData, Card, Column, load_board, require_username, write_board

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-oss-120b"

router = APIRouter(prefix="/api/ai")


class OpenRouterError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class PingResponse(BaseModel):
    answer: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


# What we ask the model to produce. `cards` is an array here (not the
# `dict[str, Card]` BoardData uses) because strict JSON Schema structured
# outputs don't support map/record-shaped objects with arbitrary keys —
# only fixed `properties`. Converted to/from BoardData at the API boundary.
class BoardUpdateCard(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    title: str
    details: str


class BoardUpdateColumn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    title: str
    cardIds: list[str]


class BoardUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    columns: list[BoardUpdateColumn]
    cards: list[BoardUpdateCard]


class ChatModelOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reply: str
    board_update: BoardUpdatePayload | None


class ChatResponse(BaseModel):
    reply: str
    board_update: BoardData | None


CHAT_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "chat_response",
        "strict": True,
        "schema": ChatModelOutput.model_json_schema(),
    },
}


def call_openrouter(
    messages: list[dict[str, str]], response_format: dict | None = None
) -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise OpenRouterError(500, "OPENROUTER_API_KEY is not configured")

    payload: dict = {"model": MODEL, "messages": messages}
    if response_format is not None:
        payload["response_format"] = response_format
        # DeepInfra (one of the providers OpenRouter routes this model to)
        # silently ignores response_format and returns prose instead of JSON
        # in roughly half of requests, even with provider.require_parameters
        # set. Confirmed empirically: 10/10 structured calls succeeded with
        # DeepInfra excluded, vs. frequent failures without this.
        payload["provider"] = {"ignore": ["DeepInfra"]}

    try:
        response = httpx.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30.0,
        )
    except httpx.HTTPError as error:
        raise OpenRouterError(502, "Could not reach OpenRouter") from error

    if response.status_code == 429:
        raise OpenRouterError(429, "OpenRouter rate limit exceeded")
    if response.status_code != 200:
        raise OpenRouterError(
            502, f"OpenRouter request failed with status {response.status_code}"
        )

    try:
        return response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as error:
        raise OpenRouterError(502, "Unexpected response from OpenRouter") from error


@router.post("/ping")
def ping(username: str = Depends(require_username)) -> PingResponse:
    try:
        answer = call_openrouter(
            [
                {
                    "role": "user",
                    "content": "What is 2+2? Answer with just the number.",
                }
            ]
        )
    except OpenRouterError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail)
    return PingResponse(answer=answer.strip())


def _board_update_to_board_data(update: BoardUpdatePayload) -> BoardData:
    return BoardData(
        columns=[
            Column(id=column.id, title=column.title, cardIds=column.cardIds)
            for column in update.columns
        ],
        cards={
            card.id: Card(id=card.id, title=card.title, details=card.details)
            for card in update.cards
        },
    )


def _build_chat_messages(
    board: BoardData, history: list[ChatMessage], message: str
) -> list[dict[str, str]]:
    system_prompt = (
        "You are an assistant embedded in a Kanban board app. You can see the "
        "user's current board and chat with them about it. The board as JSON:\n"
        f"{board.model_dump_json()}\n\n"
        "Always reply conversationally in `reply`. If, and only if, the user's "
        "message asks you to create, edit, move, or delete a card, or rename a "
        "column, set `board_update` to the COMPLETE updated board: it REPLACES "
        "the whole board, so it must include every column and every card that "
        "should still exist, not just the ones you changed. Every card id that "
        "appears in any column's cardIds MUST have a matching entry in the "
        "cards array — never drop an existing card from the cards array while "
        "still referencing its id in cardIds. If the user's message doesn't "
        "require a board change, set `board_update` to null. Column and card "
        "ids in `board_update` must be unique; reuse existing ids for "
        "unchanged items and invent new ones (e.g. 'card-<short-random-"
        "string>') for new cards."
    )
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(item.model_dump() for item in history)
    messages.append({"role": "user", "content": message})
    return messages


MAX_CHAT_ATTEMPTS = 2


def _request_chat_output(
    messages: list[dict[str, str]],
) -> tuple[ChatModelOutput, BoardData | None]:
    """Calls OpenRouter and validates the structured response, retrying once
    with corrective context if the model's output doesn't parse or its
    board_update doesn't reference a self-consistent board. This model
    reliably produces schema-shaped JSON but occasionally drops cards from
    the cards array while still referencing them in cardIds (observed
    empirically across providers) — a corrective retry recovers most of
    those cases without risking an infinite loop."""
    attempt_messages = messages
    last_error = "AI response did not match the expected schema"

    for _ in range(MAX_CHAT_ATTEMPTS):
        content = call_openrouter(attempt_messages, response_format=CHAT_RESPONSE_FORMAT)

        try:
            model_output = ChatModelOutput.model_validate_json(content)
        except (ValidationError, ValueError) as error:
            last_error = "AI response did not match the expected schema"
            attempt_messages = messages + [
                {"role": "assistant", "content": content},
                {
                    "role": "user",
                    "content": (
                        f"That response was not valid JSON matching the schema "
                        f"({error}). Please try again."
                    ),
                },
            ]
            continue

        if model_output.board_update is None:
            return model_output, None

        try:
            board_data = _board_update_to_board_data(model_output.board_update)
        except ValidationError as error:
            last_error = "AI proposed an invalid board update"
            attempt_messages = messages + [
                {"role": "assistant", "content": content},
                {
                    "role": "user",
                    "content": (
                        f"That board_update was invalid ({error}). Remember to "
                        "include every existing card in the cards array, even "
                        "ones you didn't change. Please try again."
                    ),
                },
            ]
            continue

        return model_output, board_data

    raise OpenRouterError(502, last_error)


@router.post("/chat")
def chat(
    request: ChatRequest, username: str = Depends(require_username)
) -> ChatResponse:
    board = load_board(username)
    messages = _build_chat_messages(board, request.history, request.message)

    try:
        model_output, board_data = _request_chat_output(messages)
    except OpenRouterError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail)

    if board_data is None:
        return ChatResponse(reply=model_output.reply, board_update=None)

    saved_board = write_board(username, board_data)
    return ChatResponse(reply=model_output.reply, board_update=saved_board)
