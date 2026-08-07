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

trap 'rm -rf "$test_dir"' EXIT
mkdir -p "$mock_bin" "$empty_bin"

printf '%s\n' \
  '#!/bin/sh' \
  'if [ "$#" -ne 6 ] ||' \
  '  [ "$1" != "find-generic-password" ] ||' \
  '  [ "$2" != "-s" ] ||' \
  '  [ "$3" != "AI_CLAUDE_CODE_OAUTH_TOKEN" ] ||' \
  '  [ "$4" != "-a" ] ||' \
  '  [ "$5" != "claude" ] ||' \
  '  [ "$6" != "-w" ]; then' \
  '  exit 64' \
  'fi' \
  'case ${MOCK_SECURITY_MODE:-success} in' \
  '  success) printf "%s" "${MOCK_SECURITY_SECRET:-}" ;;' \
  '  missing) printf "%s\n" "mock Keychain miss" >&2; exit 44 ;;' \
  '  empty) exit 0 ;;' \
  '  *) exit 65 ;;' \
  'esac' > "$mock_bin/security"
chmod +x "$mock_bin/security"

printf '%s\n' \
  '#!/bin/sh' \
  '[ "$CLAUDE_CODE_OAUTH_TOKEN" = "$MOCK_SECURITY_SECRET" ] || exit 70' \
  '[ "$#" -eq 2 ] || exit 71' \
  '[ "$1" = "auth" ] || exit 72' \
  '[ "$2" = "status" ] || exit 73' \
  'printf "%s\n" "mock Claude invocation passed"' > "$mock_bin/claude"
chmod +x "$mock_bin/claude"

if ! MOCK_SECURITY_MODE=success \
  MOCK_SECURITY_SECRET="$fake_secret" \
  PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh -c '. "$1"; [ "$CLAUDE_CODE_OAUTH_TOKEN" = "$MOCK_SECURITY_SECRET" ]' \
  sh "$loader" > "$output_file" 2>&1; then
  printf '%s\n' "success case failed" >&2
  exit 1
fi
if [ -s "$output_file" ]; then
  printf '%s\n' "success case unexpectedly wrote output" >&2
  exit 1
fi

if PATH="$empty_bin" /bin/sh -c '. "$1"' sh "$loader" > "$output_file" 2>&1; then
  printf '%s\n' "missing security command case unexpectedly succeeded" >&2
  exit 1
fi
grep -F 'error: macOS security command is unavailable' "$output_file" >/dev/null

if MOCK_SECURITY_MODE=missing \
  PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh -c '. "$1"' sh "$loader" > "$output_file" 2>&1; then
  printf '%s\n' "missing Keychain item case unexpectedly succeeded" >&2
  exit 1
fi
grep -F 'error: Claude Code OAuth token is not registered in Keychain' "$output_file" >/dev/null
if grep -F 'mock Keychain miss' "$output_file" >/dev/null; then
  printf '%s\n' "raw security error unexpectedly leaked" >&2
  exit 1
fi

if MOCK_SECURITY_MODE=empty \
  PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh -c '. "$1"' sh "$loader" > "$output_file" 2>&1; then
  printf '%s\n' "empty token case unexpectedly succeeded" >&2
  exit 1
fi
grep -F 'error: Claude Code OAuth token in Keychain is empty' "$output_file" >/dev/null

if ! MOCK_SECURITY_MODE=success \
  MOCK_SECURITY_SECRET="$fake_secret" \
  PATH="$mock_bin:/usr/bin:/bin" \
  /bin/sh -c '
    set -x
    . "$1"
    set +x
    [ "$CLAUDE_CODE_OAUTH_TOKEN" = "$MOCK_SECURITY_SECRET" ]
  ' sh "$loader" > "$output_file" 2>&1; then
  printf '%s\n' "xtrace case failed" >&2
  exit 1
fi
if grep -F "$fake_secret" "$output_file" >/dev/null; then
  printf '%s\n' "token leaked while xtrace was enabled" >&2
  exit 1
fi

if ! MOCK_SECURITY_MODE=success \
  MOCK_SECURITY_SECRET="$fake_secret" \
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

printf '%s\n' "load-secrets tests passed!"
