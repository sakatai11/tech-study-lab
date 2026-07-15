#!/bin/sh
set -eu

command -v jq >/dev/null 2>&1 || {
  printf '%s\n' 'jq is required by Claude edit hooks. Install jq and retry.' >&2
  exit 127
}

repo_root=$(git rev-parse --show-toplevel)
path=$(jq -r '.tool_input.file_path // empty')
[ -z "$path" ] || "$repo_root/.ai/hooks/format-changed-file.sh" "$path"
