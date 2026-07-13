#!/bin/sh
set -eu

repo_root=$(git rev-parse --show-toplevel)
skill=$(jq -r '.tool_input.skill // empty')
[ -z "$skill" ] || "$repo_root/.ai/hooks/log-skill-usage.sh" --runtime claude --skill "$skill" --status started --source hook
