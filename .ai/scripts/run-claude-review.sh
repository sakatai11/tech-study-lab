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
# 専用 OAuth より優先される、継承された認証情報・プロバイダー指定を除く。
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL
unset ANTHROPIC_PROFILE ANTHROPIC_FEDERATION_RULE_ID ANTHROPIC_ORGANIZATION_ID
unset CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_FOUNDRY

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'error: Node.js is required to verify Claude review authentication' >&2
  exit 1
fi
node "$script_dir/verify-claude-oauth.mjs" "$@"
exec claude "$@"
