#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
task_uv_cache="${UV_CACHE_DIR:-/tmp/lume-tutor-uv-cache}"

echo "Validando frontend..."
npm --prefix "$project_root/frontend" run lint
npm --prefix "$project_root/frontend" run typecheck
npm --prefix "$project_root/frontend" test
npm --prefix "$project_root/frontend" run build

echo "Validando backend..."
(
  cd "$project_root/backend"
  UV_CACHE_DIR="$task_uv_cache" uv run --frozen ruff check .
  UV_CACHE_DIR="$task_uv_cache" uv run --frozen ruff format --check .
  UV_CACHE_DIR="$task_uv_cache" uv run --frozen mypy app
  UV_CACHE_DIR="$task_uv_cache" uv run --frozen pytest
)

echo "Validando migrations e RLS..."
"$project_root/scripts/test-database.sh"

echo "Validando Terraform..."
terraform -chdir="$project_root/infra/terraform" fmt -check -recursive
terraform -chdir="$project_root/infra/terraform" validate

if [ "${RUN_E2E:-0}" = "1" ]; then
  echo "Executando E2E..."
  npm --prefix "$project_root/frontend" run test:e2e
fi

echo "Todas as validações passaram."
