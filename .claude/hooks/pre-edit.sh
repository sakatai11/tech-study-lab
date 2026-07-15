#!/bin/sh
set -eu

command -v jq >/dev/null 2>&1 || {
  printf '%s\n' 'jq is required by Claude edit hooks. Install jq and retry.' >&2
  exit 127
}

repo_root=$(git rev-parse --show-toplevel)
payload=$(cat)
content=$(printf '%s' "$payload" | jq -r '(.tool_input.new_string // .tool_input.content) // empty')
printf '%s\n' "$content" | "$repo_root/.ai/hooks/block-deferred-markers.sh"
