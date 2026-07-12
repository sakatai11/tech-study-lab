#!/bin/sh
set -eu

repo_root=$(git rev-parse --show-toplevel)
prompt=$(jq -r '.prompt // .user_prompt // .input.prompt // .input.text // empty')

# This is intentionally limited to explicit mentions. Automatic skill matching
# has no Codex hook event, so it is confirmed by the SKILL.md lifecycle calls.
printf '%s\n' "$prompt" | sed -nE 's/.*\$([A-Za-z0-9][A-Za-z0-9_-]*).*/\1/p' | while IFS= read -r skill; do
  "$repo_root/.ai/hooks/log-skill-usage.sh" --runtime codex --skill "$skill" --status requested --source hook
done
