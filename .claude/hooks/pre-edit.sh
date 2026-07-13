#!/bin/sh
set -eu

repo_root=$(git rev-parse --show-toplevel)
payload=$(cat)
content=$(printf '%s' "$payload" | jq -r '(.tool_input.new_string // .tool_input.content) // empty')
printf '%s\n' "$content" | "$repo_root/.ai/hooks/block-deferred-markers.sh"
