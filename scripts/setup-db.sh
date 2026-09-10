#!/usr/bin/env bash
set -euo pipefail
export DOCKER_HOST="${DOCKER_HOST:-tcp://127.0.0.1:2375}"
export PATH="/workspace/bin:$PATH"
cd "$(dirname "$0")/.."
docker compose up -d
echo "Waiting for postgres..."
for i in $(seq 1 40); do
  if docker compose exec -T postgres pg_isready -U hne -d human_nature_engine >/dev/null 2>&1; then
    echo "Postgres ready"
    exit 0
  fi
  sleep 1
done
echo "Postgres did not become ready" >&2
exit 1
