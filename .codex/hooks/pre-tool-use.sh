#!/bin/sh
set -eu

command -v jq >/dev/null 2>&1 || {
  printf '%s\n' 'jq is required by Codex tool hooks. Install jq and retry.' >&2
  exit 127
}

repo_root=$(git rev-parse --show-toplevel)
payload=$(cat)
content=$(printf '%s' "$payload" | jq -r '(.tool_input.patch // .tool_input.new_string // .tool_input.content // .input.patch // .input.new_string // .input.content // .arguments.patch // .arguments.new_string // .arguments.content) // empty')
printf '%s\n' "$content" | "$repo_root/.ai/hooks/block-deferred-markers.sh"
