#!/bin/sh
set -eu

repo_root=$(git rev-parse --show-toplevel)
payload=$(cat)

paths=$(printf '%s' "$payload" | jq -r '
  .tool_input.file_path // .input.file_path // .arguments.file_path // empty,
  (.tool_input.patch // .input.patch // .arguments.patch // empty
    | try capture("(?m)^\\*\\*\\* (?:Update|Add) File: (?<path>.+)$").path catch empty)
')

if [ -n "$paths" ]; then
  # shellcheck disable=SC2086 -- paths are emitted as one path per line.
  printf '%s\n' "$paths" | while IFS= read -r path; do
    [ -z "$path" ] || "$repo_root/.ai/hooks/format-changed-file.sh" "$path"
  done
fi
