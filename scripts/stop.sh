#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="pm-app"

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

echo "Stopped"
