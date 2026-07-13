#!/bin/sh

# Format supported files passed as repository-relative or absolute paths.
set -eu

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

for file in "$@"; do
  case "$file" in
    *.ts|*.tsx|*.js|*.jsx|*.json)
      pnpm exec biome check --write --no-errors-on-unmatched "$file"
      ;;
  esac
done
