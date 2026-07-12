#!/bin/sh

# Block comments that defer work instead of implementing it. The script reads
# normalized text from stdin so Claude and Codex adapters can share it.
set -eu

if grep -qiE '(^|[[:space:]]|\+)(//|#|/\*)[[:space:]]*(TODO|FIXME|HACK|XXX)([[:space:]:]|$)'; then
  printf '%s\n' '先送りコード（TODO/FIXME/HACK/XXX）が検出されました。今すぐ実装してください。' >&2
  exit 2
fi
