#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

chmod +x \
  .githooks/pre-commit \
  scripts/install-git-hooks.sh \
  scripts/smoke-local.sh \
  scripts/test-database.sh \
  scripts/validate-all.sh \
  scripts/validate-before-commit.sh
git config --local core.hooksPath .githooks

echo "Hooks instalados em .githooks."
echo "Frontend, backend e banco serão validados somente quando arquivos relacionados estiverem staged."
