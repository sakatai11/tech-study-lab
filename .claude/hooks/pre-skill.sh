#!/bin/sh
set -eu

command -v jq >/dev/null 2>&1 || {
  printf '%s\n' 'jq is required by Claude skill hooks. Install jq and retry.' >&2
  exit 127
}

repo_root=$(git rev-parse --show-toplevel)
skill=$(jq -r '.tool_input.skill // empty')
[ -z "$skill" ] || "$repo_root/.ai/hooks/log-skill-usage.sh" --runtime claude --skill "$skill" --status started --source hook
