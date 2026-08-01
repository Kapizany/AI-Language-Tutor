#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_commands=(docker node npm uv terraform)
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Comando obrigatório ausente: $command_name" >&2
    exit 1
  fi
done

test -f "$project_root/frontend/.env.local" || {
  echo "Crie frontend/.env.local a partir de frontend/.env.example." >&2
  exit 1
}
test -f "$project_root/backend/.env" || {
  echo "Crie backend/.env a partir de backend/.env.example." >&2
  exit 1
}
test -f "$project_root/supabase/config.toml"

npm --prefix "$project_root/frontend" ci --ignore-scripts
(cd "$project_root/backend" && uv sync --frozen --dev)
npx --yes supabase@latest start
npx --yes supabase@latest db reset

echo "Setup local verificado. Inicie frontend e backend em terminais separados."
