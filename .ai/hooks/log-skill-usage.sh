#!/bin/sh

# Append a runtime-neutral skill lifecycle event to a local, ignored JSONL log.
set -eu

usage() {
  printf '%s\n' 'usage: log-skill-usage.sh --runtime <claude|codex> --skill <name> --status <requested|started|completed> [--source <hook|skill>]' >&2
  exit 64
}

runtime=
skill=
status=
source=skill

while [ "$#" -gt 0 ]; do
  case "$1" in
    --runtime) runtime=${2-}; shift 2 ;;
    --skill) skill=${2-}; shift 2 ;;
    --status) status=${2-}; shift 2 ;;
    --source) source=${2-}; shift 2 ;;
    *) usage ;;
  esac
done

[ -n "$runtime" ] && [ -n "$skill" ] && [ -n "$status" ] || usage

repo_root=$(git rev-parse --show-toplevel)
log_dir=${AI_HARNESS_LOG_DIR:-"$repo_root/.ai/logs"}
mkdir -p "$log_dir"

jq -cn \
  --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
  --arg runtime "$runtime" \
  --arg skill "$skill" \
  --arg status "$status" \
  --arg source "$source" \
  '{ts: $ts, runtime: $runtime, skill: $skill, status: $status, source: $source}' \
  >> "$log_dir/skill-usage.jsonl"
