#!/bin/sh

# Claude Code を起動するシェルから source する。トークンはプロセス環境に
# だけ保持し、このローダーから標準出力やログへ書き出さない。
_ai_load_claude_code_oauth_token() {
  case $- in
    *x*)
      _ai_secrets_restore_xtrace=1
      set +x
      ;;
    *)
      _ai_secrets_restore_xtrace=0
      ;;
  esac

  _ai_secrets_service=AI_CLAUDE_CODE_OAUTH_TOKEN
  _ai_secrets_account=claude
  unset CLAUDE_CODE_OAUTH_TOKEN

  if ! command -v security >/dev/null 2>&1; then
    printf '%s\n' "error: macOS security command is unavailable; Claude Code OAuth token was not loaded" >&2
    _ai_secrets_status=1
  elif ! _ai_secrets_token=$(security find-generic-password \
    -s "$_ai_secrets_service" \
    -a "$_ai_secrets_account" \
    -w 2>/dev/null); then
    printf '%s\n' "error: Claude Code OAuth token is not registered in Keychain (service: $_ai_secrets_service, account: $_ai_secrets_account)" >&2
    _ai_secrets_status=1
  elif [ -z "$_ai_secrets_token" ]; then
    printf '%s\n' "error: Claude Code OAuth token in Keychain is empty (service: $_ai_secrets_service, account: $_ai_secrets_account)" >&2
    _ai_secrets_status=1
  else
    CLAUDE_CODE_OAUTH_TOKEN=$_ai_secrets_token
    export CLAUDE_CODE_OAUTH_TOKEN
    _ai_secrets_status=0
  fi

  unset _ai_secrets_token _ai_secrets_service _ai_secrets_account

  if [ "$_ai_secrets_restore_xtrace" -eq 1 ]; then
    set -x
  fi
  unset _ai_secrets_restore_xtrace

  return "$_ai_secrets_status"
}

if _ai_load_claude_code_oauth_token; then
  _ai_secrets_load_status=0
else
  _ai_secrets_load_status=$?
fi
unset -f _ai_load_claude_code_oauth_token
unset _ai_secrets_status

if [ "$_ai_secrets_load_status" -ne 0 ]; then
  unset _ai_secrets_load_status
  return 1 2>/dev/null || exit 1
fi
unset _ai_secrets_load_status
