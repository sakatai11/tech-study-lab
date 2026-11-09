#!/bin/sh
set -eu

repo_root=$(git rev-parse --show-toplevel)
loader="$repo_root/.ai/scripts/load-secrets.sh"
review_wrapper="$repo_root/.ai/scripts/run-claude-review.sh"
test_dir=$(mktemp -d)
mock_bin="$test_dir/mock-bin"
empty_bin="$test_dir/empty-bin"
output_file="$test_dir/output"
fake_secret='sentinel-secret-value-for-tests'
fake_service_token='sentinel-service-account-token-for-tests'
fake_ref='op://Test Vault/Claude Code/oauth token'
export AI_CLAUDE_CODE_OAUTH_TOKEN_REF="$fake_ref"
# 開発者のローカル Git 設定と無関係に検証する。
unset GIT_CONFIG_COUNT GIT_CONFIG_PARAMETERS
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

trap 'rm -rf "$test_dir"' EXIT
mkdir -p "$mock_bin" "$empty_bin"

printf '%s\n' \
  '#!/bin/sh' \
  'if [ "$#" -ne 3 ] ||' \
  '  [ "$1" != "read" ] ||' \
  '  [ "$2" != "--no-newline" ] ||' \
  '  [ "$3" != "$MOCK_OP_REF" ]; then' \
  '  exit 64' \
  'fi' \
  '[ "${OP_SERVICE_ACCOUNT_TOKEN:-}" = "$MOCK_SERVICE_TOKEN" ] || exit 66' \
  '[ "${OP_CONNECT_HOST+x}" != x ] && [ "${OP_CONNECT_TOKEN+x}" != x ] || exit 67' \
  'case ${MOCK_OP_MODE:-success} in' \
  '  success) printf "%s" "${MOCK_OP_SECRET:-}" ;;' \
  '  missing) printf "%s\n" "$MOCK_OP_SECRET" >&2; exit 44 ;;' \
  '  empty) exit 0 ;;' \
  '  *) exit 65 ;;' \
  'esac' > "$mock_bin/op"
chmod +x "$mock_bin/op"
export MOCK_OP_REF="$fake_ref" MOCK_OP_SECRET="$fake_secret"
export MOCK_SERVICE_TOKEN="$fake_service_token"
unset OP_SERVICE_ACCOUNT_TOKEN

cat > "$mock_bin/security" <<'MOCK_SECURITY'
#!/bin/sh
[ "$#" -eq 6 ] && [ "$1" = find-generic-password ] &&
  [ "$2" = -s ] && [ "$3" = "${MOCK_KEYCHAIN_SERVICE:-AI_CLAUDE_REVIEW_1PASSWORD_SERVICE_ACCOUNT_TOKEN}" ] &&
  [ "$4" = -a ] && [ "$5" = tech-study-lab ] && [ "$6" = -w ] || exit 64
case ${MOCK_SECURITY_MODE:-success} in
  success) printf '%s' "$MOCK_SERVICE_TOKEN" ;;
  missing) printf '%s' "$MOCK_SERVICE_TOKEN" >&2; exit 44 ;;
  empty) exit 0 ;;
esac
MOCK_SECURITY
chmod +x "$mock_bin/security"

printf '%s\n' \
  '#!/bin/sh' \
  '[ "$#" -eq 3 ] && [ "$1" = "config" ] && [ "$2" = "--get" ] &&' \
  '  [ "$3" = "${MOCK_GIT_KEY:-ai.claudeOAuthTokenRef}" ] || exit 64' \
  '[ -n "${MOCK_GIT_REF:-}" ] || exit 1' \
  'printf "%s\n" "$MOCK_GIT_REF"' > "$mock_bin/git"
chmod +x "$mock_bin/git"

export MOCK_REAL_NODE="$(command -v node)"
printf '%s\n' '#!/bin/sh' 'exec "$MOCK_REAL_NODE" "$@"' > "$mock_bin/node"
chmod +x "$mock_bin/node"
export MOCK_CLAUDE_PREFLIGHT="$test_dir/claude-preflight.sh"
cat > "$MOCK_CLAUDE_PREFLIGHT" <<'MOCK_PREFLIGHT'
# CLI の設定再適用後に選ばれた認証方式を返す。
mock_auth_status() {
  if [ "${MOCK_REQUIRE_CLEAN_AUTH:-0}" = 1 ]; then
    [ -z "${ANTHROPIC_API_KEY:-}${ANTHROPIC_AUTH_TOKEN:-}${ANTHROPIC_BASE_URL:-}" ] || exit 90
    [ -z "${CLAUDE_CODE_USE_BEDROCK:-}${CLAUDE_CODE_USE_VERTEX:-}${CLAUDE_CODE_USE_FOUNDRY:-}" ] || exit 91
  fi
  _first= _second= _third= _settings_seen=0
  for _arg in "$@"; do
    _first=$_second; _second=$_third; _third=$_arg
    if [ "$_arg" = "${MOCK_EXPECT_SETTINGS:-unset}" ]; then _settings_seen=1; fi
  done
  if [ "$_first" != auth ] || [ "$_second" != status ] || [ "$_third" != --json ]; then
    return 0
  fi
  if [ "${MOCK_EXPECT_SETTINGS+x}" = x ]; then [ "$_settings_seen" = 1 ] || exit 92; fi
  # 認証確認がレビュー用の標準入力を消費しないことも検証する。
  if IFS= read -r _unexpected_input; then exit 93; fi
  case ${MOCK_AUTH_MODE:-oauth} in
    oauth) printf '%s\n' '{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}' ;;
    api_key) printf '%s\n' '{"loggedIn":true,"authMethod":"api_key","apiProvider":"firstParty"}' ;;
    cloud) printf '%s\n' '{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"bedrock"}' ;;
    signed_out) printf '%s\n' '{"loggedIn":false,"authMethod":"oauth_token","apiProvider":"firstParty"}' ;;
    malformed) printf '%s\n' "$MOCK_OP_SECRET" ;;
    nonzero) printf '%s\n' '{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}'; exit 1 ;;
  esac
  exit 0
}
MOCK_PREFLIGHT

printf '%s\n' \
  '#!/bin/sh' \
  '. "$MOCK_CLAUDE_PREFLIGHT"' \
  'mock_auth_status "$@"' \
  'if [ "${1:-}" = --settings ]; then shift 2; fi' \
  '[ "$CLAUDE_CODE_OAUTH_TOKEN" = "$MOCK_OP_SECRET" ] || exit 70' \
  '[ "${OP_SERVICE_ACCOUNT_TOKEN+x}" != x ] || exit 74' \
  '[ "$#" -eq 2 ] || exit 71' \
  '[ "$1" = "auth" ] || exit 72' \
  '[ "$2" = "status" ] || exit 73' \
  'printf "%s\n" "mock Claude invocation passed"' > "$mock_bin/claude"
chmod +x "$mock_bin/claude"

if ! MOCK_OP_MODE=success \
  PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh -c '. "$1"; [ "$CLAUDE_CODE_OAUTH_TOKEN" = "$MOCK_OP_SECRET" ]' \
  sh "$loader" > "$output_file" 2>&1; then
  printf '%s\n' "success case failed" >&2
  exit 1
fi
if [ -s "$output_file" ]; then
  printf '%s\n' "success case unexpectedly wrote output" >&2
  exit 1
fi

if PATH="$empty_bin" /bin/sh -c '. "$1"' sh "$loader" > "$output_file" 2>&1; then
  printf '%s\n' "missing op command case unexpectedly succeeded" >&2
  exit 1
fi
grep -F 'error: 1Password CLI (op) is unavailable' "$output_file" >/dev/null

if MOCK_OP_MODE=missing \
  PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh -c '. "$1"' sh "$loader" > "$output_file" 2>&1; then
  printf '%s\n' "1Password access failure case unexpectedly succeeded" >&2
  exit 1
fi
grep -F 'error: could not load Claude Code OAuth token from 1Password' "$output_file" >/dev/null
if grep -F "$fake_secret" "$output_file" >/dev/null ||
  grep -F "$fake_service_token" "$output_file" >/dev/null; then
  printf '%s\n' "raw op error unexpectedly leaked" >&2
  exit 1
fi

if MOCK_OP_MODE=empty \
  PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh -c '. "$1"' sh "$loader" > "$output_file" 2>&1; then
  printf '%s\n' "empty token case unexpectedly succeeded" >&2
  exit 1
fi
grep -F 'error: Claude Code OAuth token in 1Password is empty' "$output_file" >/dev/null

if ! MOCK_OP_MODE=success \
  PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh -c '
    set -x
    . "$1"
    set +x
    [ "$CLAUDE_CODE_OAUTH_TOKEN" = "$MOCK_OP_SECRET" ]
  ' sh "$loader" > "$output_file" 2>&1; then
  printf '%s\n' "xtrace case failed" >&2
  exit 1
fi
if grep -F "$fake_secret" "$output_file" >/dev/null ||
  grep -F "$fake_service_token" "$output_file" >/dev/null; then
  printf '%s\n' "token leaked while xtrace was enabled" >&2
  exit 1
fi

if ! MOCK_OP_MODE=success \
  OP_SERVICE_ACCOUNT_TOKEN=unrelated-token \
  PATH="$mock_bin:/usr/bin:/bin" \
  "$review_wrapper" auth status > "$output_file" 2>&1; then
  printf '%s\n' "Claude review wrapper case failed" >&2
  exit 1
fi
grep -F 'mock Claude invocation passed' "$output_file" >/dev/null
if grep -F "$fake_secret" "$output_file" >/dev/null; then
  printf '%s\n' "Claude review wrapper leaked the token" >&2
  exit 1
fi

# 継承した API キー・別プロバイダー指定を専用 OAuth より優先させない。
if ! MOCK_REQUIRE_CLEAN_AUTH=1 \
  ANTHROPIC_API_KEY="$fake_secret" ANTHROPIC_AUTH_TOKEN=unrelated-token \
  ANTHROPIC_BASE_URL=https://unrelated.invalid \
  CLAUDE_CODE_USE_BEDROCK=1 CLAUDE_CODE_USE_VERTEX=1 CLAUDE_CODE_USE_FOUNDRY=1 \
  PATH="$mock_bin:/usr/bin:/bin" \
  "$review_wrapper" auth status > "$output_file" 2>&1; then
  printf '%s\n' 'competing credentials reached the Claude CLI' >&2
  exit 1
fi

# 設定からの API キー再注入や、認証確認自体の失敗ではレビューを開始しない。
for auth_mode in api_key cloud signed_out malformed nonzero; do
  if MOCK_AUTH_MODE="$auth_mode" PATH="$mock_bin:/usr/bin:/bin" \
    /bin/sh -x "$review_wrapper" auth status > "$output_file" 2>&1; then
    printf '%s\n' 'non-OAuth or failed preflight did not stop Claude' >&2
    exit 1
  fi
  grep -F 'error: Claude review requires' "$output_file" >/dev/null
  if grep -F 'mock Claude invocation passed' "$output_file" >/dev/null ||
    grep -F "$fake_secret" "$output_file" >/dev/null; then
    printf '%s\n' 'preflight failure started Claude or exposed raw output' >&2
    exit 1
  fi
done

# 呼び出し時の設定オプションも認証確認へ渡す。
fixture_settings='{"env":{"API_TIMEOUT_MS":"1000"}}'
if ! MOCK_EXPECT_SETTINGS="$fixture_settings" PATH="$mock_bin:/usr/bin:/bin" \
  "$review_wrapper" --settings "$fixture_settings" auth status > "$output_file" 2>&1; then
  printf '%s\n' 'settings were not included in the authentication preflight' >&2
  exit 1
fi
if MOCK_AUTH_MODE=api_key MOCK_EXPECT_SETTINGS="$fixture_settings" \
  PATH="$mock_bin:/usr/bin:/bin" \
  "$review_wrapper" --settings "$fixture_settings" auth status > "$output_file" 2>&1; then
  printf '%s\n' 'settings reinjection bypassed the OAuth check' >&2
  exit 1
fi

# 他のオプションの値を認証モードの切り替えと誤認した場合も停止する。
if PATH="$mock_bin:/usr/bin:/bin" \
  "$review_wrapper" --system-prompt --safe-mode auth status > "$output_file" 2>&1; then
  printf '%s\n' 'ambiguous mode option bypassed the authentication check' >&2
  exit 1
fi
grep -F 'error: Claude review requires' "$output_file" >/dev/null

# 参照先は Git 設定から読み、環境変数で明示された参照先を優先する。
if ! AI_CLAUDE_CODE_OAUTH_TOKEN_REF= \
  MOCK_GIT_REF="$fake_ref" \
  PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh -c '. "$1"; [ "$CLAUDE_CODE_OAUTH_TOKEN" = "$MOCK_OP_SECRET" ]' \
  sh "$loader" > "$output_file" 2>&1; then
  printf '%s\n' "Git reference case failed" >&2
  exit 1
fi
if ! MOCK_GIT_REF='op://Other/Item/field' \
  PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh -c '. "$1"; [ "$CLAUDE_CODE_OAUTH_TOKEN" = "$MOCK_OP_SECRET" ]' \
  sh "$loader" > "$output_file" 2>&1; then
  printf '%s\n' "environment reference precedence case failed" >&2
  exit 1
fi

# 未設定・不正な参照先では既存のトークンを使わず、必ず失敗する。
for invalid_ref in '' 'plaintext-value' 'op://vault/item'; do
  if ! AI_CLAUDE_CODE_OAUTH_TOKEN_REF="$invalid_ref" \
    MOCK_GIT_REF= \
    CLAUDE_CODE_OAUTH_TOKEN=stale-token \
    PATH="$mock_bin:/usr/bin:/bin" \
    /bin/sh -c '
      if . "$1"; then exit 80; fi
      [ "${CLAUDE_CODE_OAUTH_TOKEN+x}" != x ]
    ' sh "$loader" > "$output_file" 2>&1; then
    printf '%s\n' "invalid reference did not fail closed" >&2
    exit 1
  fi
  grep -F 'error: set AI_CLAUDE_CODE_OAUTH_TOKEN_REF' "$output_file" >/dev/null
done

# 1Password が拒否した場合も Claude を起動しない。
if MOCK_OP_MODE=missing \
  CLAUDE_CODE_OAUTH_TOKEN=stale-token \
  PATH="$mock_bin:/usr/bin:/bin" \
  "$review_wrapper" auth status > "$output_file" 2>&1; then
  printf '%s\n' "Claude started after 1Password failed" >&2
  exit 1
fi
grep -F 'error: could not load Claude Code OAuth token from 1Password' "$output_file" >/dev/null
if grep -F 'mock Claude invocation passed' "$output_file" >/dev/null ||
  grep -F "$fake_secret" "$output_file" >/dev/null; then
  printf '%s\n' "failure invoked Claude or leaked a token" >&2
  exit 1
fi

# サービスアカウントを取得できない場合はアプリ連携へ戻らず停止する。
for security_mode in missing empty; do
  if MOCK_SECURITY_MODE="$security_mode" \
    PATH="$mock_bin:/usr/bin:/bin" \
    "$review_wrapper" auth status > "$output_file" 2>&1; then
    printf '%s\n' "service account failure did not stop Claude" >&2
    exit 1
  fi
  grep -F 'error:' "$output_file" >/dev/null
  if grep -F "$fake_service_token" "$output_file" >/dev/null ||
    grep -F 'mock Claude invocation passed' "$output_file" >/dev/null; then
    printf '%s\n' "service account failure leaked a token or invoked Claude" >&2
    exit 1
  fi
done

# 別方式の資格情報があっても専用サービスアカウントを使用する。
if ! OP_SERVICE_ACCOUNT_TOKEN=unrelated-token \
  OP_CONNECT_HOST=https://unrelated.invalid OP_CONNECT_TOKEN=unrelated-token \
  PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh -c '. "$1"; [ "$CLAUDE_CODE_OAUTH_TOKEN" = "$MOCK_OP_SECRET" ]' \
  sh "$loader" > "$output_file" 2>&1; then
  printf '%s\n' "service account credential isolation failed" >&2
  exit 1
fi

# レビュー引数と標準入力（diff）がそのまま Claude に渡る。
cat > "$mock_bin/claude" <<'MOCK_CLAUDE'
#!/bin/sh
. "$MOCK_CLAUDE_PREFLIGHT"
mock_auth_status "$@"
[ "$CLAUDE_CODE_OAUTH_TOKEN" = "$MOCK_OP_SECRET" ] || exit 70
[ "${OP_SERVICE_ACCOUNT_TOKEN+x}" != x ] || exit 75
[ "$#" -eq 4 ] || exit 71
[ "$1" = "--model" ] && [ "$2" = "opus" ] || exit 72
[ "$3" = "-p" ] && [ "$4" = "review prompt with spaces" ] || exit 73
IFS= read -r diff
[ "$diff" = 'review diff' ] || exit 74
printf '%s\n' 'mock review passed'
MOCK_CLAUDE
if ! PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh -c 'printf "%s\n" "review diff" | "$1" --model opus -p "review prompt with spaces"' \
  sh "$review_wrapper" > "$output_file" 2>&1; then
  printf '%s\n' "review arguments or stdin were not preserved" >&2
  exit 1
fi
grep -F 'mock review passed' "$output_file" >/dev/null

jev_wrapper="$repo_root/.ai/scripts/run-jev-review.sh"
export MOCK_JEV_SCRIPT="$repo_root/.ai/scripts/../../scripts/review-design-references.mjs"
export AI_JEV_API_KEY_REF='op://Jev Test/API Key/credential'
export MOCK_OP_REF="$AI_JEV_API_KEY_REF"
export MOCK_KEYCHAIN_SERVICE=AI_JEV_1PASSWORD_SERVICE_ACCOUNT_TOKEN
export MOCK_GIT_KEY=ai.jevApiKeyRef

cat > "$mock_bin/node" <<'MOCK_NODE'
#!/bin/sh
[ "$1" = "$MOCK_JEV_SCRIPT" ] || exit 80
shift
if [ "${MOCK_NODE_MODE:-execute}" = offline ]; then
  printf '%s\n' 'mock offline Jev passed'
  exit 0
fi
[ "$TYPESAFE_API_KEY" = "$MOCK_OP_SECRET" ] || exit 81
[ "${OP_SERVICE_ACCOUNT_TOKEN+x}" != x ] || exit 82
[ "$#" -eq 3 ] && [ "$1" = --execute ] &&
  [ "$2" = --approved-plan ] && [ "$3" = 'plan with spaces' ] || exit 83
printf '%s\n' 'mock Jev execution passed'
MOCK_NODE
chmod +x "$mock_bin/node"

# オフラインの候補確認・ヘルプ・既定動作では認証ツールを用意しない。
offline_bin="$test_dir/offline-bin"
mkdir -p "$offline_bin"
ln -s "$mock_bin/node" "$offline_bin/node"
ln -s /usr/bin/dirname "$offline_bin/dirname"
check_jev_offline() {
  if ! MOCK_NODE_MODE=offline PATH="$offline_bin" \
    /bin/sh "$jev_wrapper" "$@" > "$output_file" 2>&1; then
    printf '%s\n' 'offline Jev unexpectedly required authentication' >&2
    exit 1
  fi
  grep -F 'mock offline Jev passed' "$output_file" >/dev/null
}
check_jev_offline
check_jev_offline --help
check_jev_offline --dry-run
check_jev_offline --execute --dry-run
check_jev_offline --execute --help

# Jev 専用の Keychain 項目と参照先を使い、サービスアカウントは渡さない。
if ! OP_SERVICE_ACCOUNT_TOKEN=unrelated-token \
  PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh -x "$jev_wrapper" --execute --approved-plan 'plan with spaces' > "$output_file" 2>&1; then
  printf '%s\n' 'Jev execution or credential isolation failed' >&2
  exit 1
fi
grep -F 'mock Jev execution passed' "$output_file" >/dev/null
if grep -F "$fake_secret" "$output_file" >/dev/null ||
  grep -F "$fake_service_token" "$output_file" >/dev/null; then
  printf '%s\n' 'Jev wrapper leaked credentials through xtrace' >&2
  exit 1
fi

if ! AI_JEV_API_KEY_REF= MOCK_GIT_REF="$MOCK_OP_REF" \
  PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh "$jev_wrapper" --execute --approved-plan 'plan with spaces' > "$output_file" 2>&1; then
  printf '%s\n' 'Jev Git reference lookup failed' >&2
  exit 1
fi

if MOCK_SECURITY_MODE=missing TYPESAFE_API_KEY=stale-key \
  PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh "$jev_wrapper" --execute --approved-plan 'plan with spaces' > "$output_file" 2>&1; then
  printf '%s\n' 'Jev ran after service account retrieval failed' >&2
  exit 1
fi
grep -F 'error: could not load 1Password service account token' "$output_file" >/dev/null
if grep -F 'mock Jev execution passed' "$output_file" >/dev/null; then
  printf '%s\n' 'Jev ignored authentication failure' >&2
  exit 1
fi

printf '%s\n' "load-secrets tests passed!"
