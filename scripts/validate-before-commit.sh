#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
task_uv_cache="${UV_CACHE_DIR:-/tmp/lume-tutor-uv-cache}"
staged_files="$(git -C "$project_root" diff --cached --name-only --diff-filter=ACMRD)"

if [ -z "$staged_files" ]; then
  exit 0
fi

has_staged_path() {
  printf '%s\n' "$staged_files" | grep -Eq "$1"
}

if has_staged_path '^frontend/'; then
  echo "Validando frontend..."
  npm --prefix "$project_root/frontend" run lint
  npm --prefix "$project_root/frontend" run typecheck
  npm --prefix "$project_root/frontend" test
  npm --prefix "$project_root/frontend" run build
fi

if has_staged_path '^backend/'; then
  echo "Validando backend..."
  (
    cd "$project_root/backend"
    UV_CACHE_DIR="$task_uv_cache" uv run --frozen ruff check .
    UV_CACHE_DIR="$task_uv_cache" uv run --frozen ruff format --check .
    UV_CACHE_DIR="$task_uv_cache" uv run --frozen mypy app
    UV_CACHE_DIR="$task_uv_cache" uv run --frozen pytest
  )
fi

if has_staged_path '^(supabase/(migrations|tests)/|scripts/test-database\.sh$)'; then
  echo "Validando migrations e políticas do banco..."
  "$project_root/scripts/test-database.sh"
fi

if has_staged_path '^infra/terraform/'; then
  echo "Validando formatação Terraform..."
  terraform -chdir="$project_root/infra/terraform" fmt -check -recursive
fi

if has_staged_path '^(\.githooks/|scripts/(validate-before-commit|install-git-hooks)\.sh$)'; then
  echo "Validando scripts dos hooks..."
  bash -n \
    "$project_root/.githooks/pre-commit" \
    "$project_root/scripts/validate-before-commit.sh" \
    "$project_root/scripts/install-git-hooks.sh"
fi

echo "Todos os checks locais passaram."
