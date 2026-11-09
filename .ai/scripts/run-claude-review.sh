#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# ローダーと Claude CLI を同じプロセスで実行し、トークンを引数・標準入力・
# ファイルへコピーせず、環境変数としてだけ子プロセスへ引き継ぐ。
_ai_review_secret_target=claude
. "$script_dir/load-secrets.sh"

if ! command -v claude >/dev/null 2>&1; then
  printf '%s\n' "error: claude command is unavailable" >&2
  exit 1
fi

# 1Password のアクセス権を Claude CLI に引き継がない。
unset OP_SERVICE_ACCOUNT_TOKEN
exec claude "$@"
