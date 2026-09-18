#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE_NAME="pm-app"
CONTAINER_NAME="pm-app"
PORT="${PORT:-8000}"

mkdir -p backend/data

docker build -t "$IMAGE_NAME" .

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

if [ -f .env ]; then
  docker run -d --name "$CONTAINER_NAME" -p "$PORT:8000" -v "$(pwd)/backend/data:/app/backend/data" --env-file .env "$IMAGE_NAME"
else
  docker run -d --name "$CONTAINER_NAME" -p "$PORT:8000" -v "$(pwd)/backend/data:/app/backend/data" "$IMAGE_NAME"
fi

echo "Running at http://localhost:$PORT"
