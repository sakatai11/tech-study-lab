#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
execute=0
offline=0
for arg in "$@"; do
  case $arg in
    --execute) execute=1 ;;
    --dry-run|--help) offline=1 ;;
  esac
done

# 候補の確認とヘルプでは Keychain も 1Password も呼ばない。
if [ "$execute" -eq 1 ] && [ "$offline" -eq 0 ]; then
  _ai_review_secret_target=jev
  . "$script_dir/load-secrets.sh"
fi

# サービスアカウントの権限を Jev runner に引き継がない。
unset OP_SERVICE_ACCOUNT_TOKEN
exec node "$script_dir/../../scripts/review-design-references.mjs" "$@"
