#!/bin/sh

# レビュー用 CLI を起動するシェルから source する。キーはプロセス環境に
# だけ保持し、このローダーから標準出力やログへ書き出さない。
_ai_load_review_secret() {
  case $- in
    *x*)
      _ai_secrets_restore_xtrace=1
      set +x
      ;;
    *)
      _ai_secrets_restore_xtrace=0
      ;;
  esac

  case ${_ai_review_secret_target:-claude} in
    claude)
      _ai_secrets_destination=CLAUDE_CODE_OAUTH_TOKEN
      _ai_secrets_ref=${AI_CLAUDE_CODE_OAUTH_TOKEN_REF:-}
      _ai_secrets_ref_env=AI_CLAUDE_CODE_OAUTH_TOKEN_REF
      _ai_secrets_git_key=ai.claudeOAuthTokenRef
      _ai_secrets_keychain_service=AI_CLAUDE_REVIEW_1PASSWORD_SERVICE_ACCOUNT_TOKEN
      _ai_secrets_label='Claude Code OAuth token'
      ;;
    jev)
      _ai_secrets_destination=TYPESAFE_API_KEY
      _ai_secrets_ref=${AI_JEV_API_KEY_REF:-}
      _ai_secrets_ref_env=AI_JEV_API_KEY_REF
      _ai_secrets_git_key=ai.jevApiKeyRef
      _ai_secrets_keychain_service=AI_JEV_1PASSWORD_SERVICE_ACCOUNT_TOKEN
      _ai_secrets_label='Jev API key'
      ;;
    *)
      printf '%s\n' 'error: unsupported review secret target' >&2
      if [ "$_ai_secrets_restore_xtrace" -eq 1 ]; then set -x; fi
      unset _ai_secrets_restore_xtrace
      return 1
      ;;
  esac

  unset "$_ai_secrets_destination"
  if [ -z "$_ai_secrets_ref" ] && command -v git >/dev/null 2>&1; then
    _ai_secrets_ref=$(git config --get "$_ai_secrets_git_key" 2>/dev/null) || _ai_secrets_ref=
  fi

  case $_ai_secrets_ref in
    op://?*/?*/?*) _ai_secrets_valid_ref=1 ;;
    *) _ai_secrets_valid_ref=0 ;;
  esac

  if [ "$_ai_secrets_valid_ref" -ne 1 ]; then
    printf '%s\n' "error: set $_ai_secrets_ref_env or Git config $_ai_secrets_git_key to an op://vault/item/field reference" >&2
    _ai_secrets_status=1
  elif ! command -v op >/dev/null 2>&1; then
    printf '%s\n' "error: 1Password CLI (op) is unavailable; $_ai_secrets_label was not loaded" >&2
    _ai_secrets_status=1
  elif ! command -v security >/dev/null 2>&1; then
    printf '%s\n' "error: macOS security command is unavailable; 1Password service account token was not loaded" >&2
    _ai_secrets_status=1
  elif ! _ai_secrets_service_token=$(security find-generic-password \
    -s "$_ai_secrets_keychain_service" \
    -a tech-study-lab -w 2>/dev/null); then
    printf '%s\n' "error: could not load 1Password service account token from Keychain" >&2
    _ai_secrets_status=1
  elif [ -z "$_ai_secrets_service_token" ]; then
    printf '%s\n' "error: 1Password service account token in Keychain is empty" >&2
    _ai_secrets_status=1
  elif ! _ai_secrets_token=$(
    # op は空文字でも Connect 環境変数の存在を優先するため、完全に除外する。
    unset OP_CONNECT_HOST OP_CONNECT_TOKEN
    OP_SERVICE_ACCOUNT_TOKEN="$_ai_secrets_service_token" \
      op read --no-newline "$_ai_secrets_ref" 2>/dev/null
  ); then
    printf '%s\n' "error: could not load $_ai_secrets_label from 1Password; check service account access, token validity, and the secret reference" >&2
    _ai_secrets_status=1
  elif [ -z "$_ai_secrets_token" ]; then
    printf '%s\n' "error: $_ai_secrets_label in 1Password is empty" >&2
    _ai_secrets_status=1
  else
    export "$_ai_secrets_destination=$_ai_secrets_token"
    _ai_secrets_status=0
  fi

  unset _ai_secrets_token _ai_secrets_service_token _ai_secrets_ref _ai_secrets_valid_ref
  unset _ai_secrets_destination _ai_secrets_ref_env _ai_secrets_git_key
  unset _ai_secrets_keychain_service _ai_secrets_label

  if [ "$_ai_secrets_restore_xtrace" -eq 1 ]; then
    set -x
  fi
  unset _ai_secrets_restore_xtrace

  return "$_ai_secrets_status"
}

if _ai_load_review_secret; then
  _ai_secrets_load_status=0
else
  _ai_secrets_load_status=$?
fi
unset -f _ai_load_review_secret
unset _ai_secrets_status
unset _ai_review_secret_target

if [ "$_ai_secrets_load_status" -ne 0 ]; then
  unset _ai_secrets_load_status
  return 1 2>/dev/null || exit 1
fi
unset _ai_secrets_load_status
