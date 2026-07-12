#!/bin/sh
set -eu

repo_root=$(git rev-parse --show-toplevel)
path=$(jq -r '.tool_input.file_path // empty')
[ -z "$path" ] || "$repo_root/.ai/hooks/format-changed-file.sh" "$path"
