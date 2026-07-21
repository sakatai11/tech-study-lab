#!/bin/sh
set -eu

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

expect_blocked() {
  if "$@"; then
    printf '%s\n' "expected hook to block: $*" >&2
    exit 1
  fi
}

expect_blocked sh -c './.claude/hooks/pre-edit.sh < .ai/hooks/fixtures/claude-edit-todo.json'
./.claude/hooks/pre-edit.sh < .ai/hooks/fixtures/claude-edit-clean.json
expect_blocked sh -c './.codex/hooks/pre-tool-use.sh < .ai/hooks/fixtures/codex-apply-patch-todo.json'

log_dir=$(mktemp -d)
trap 'rm -rf "$log_dir"' EXIT
AI_HARNESS_LOG_DIR="$log_dir" ./.codex/hooks/user-prompt-submit.sh < .ai/hooks/fixtures/codex-user-prompt.json
AI_HARNESS_LOG_DIR="$log_dir" ./.ai/hooks/log-skill-usage.sh --runtime codex --skill skill-audit --status started
AI_HARNESS_LOG_DIR="$log_dir" ./.ai/hooks/log-skill-usage.sh --runtime codex --skill skill-audit --status completed
AI_HARNESS_LOG_DIR="$log_dir" ./.claude/hooks/pre-skill.sh < .ai/hooks/fixtures/claude-skill.json
AI_HARNESS_LOG_DIR="$log_dir" ./.claude/hooks/post-skill.sh < .ai/hooks/fixtures/claude-skill.json
./.codex/hooks/post-tool-use.sh < .ai/hooks/fixtures/codex-post-tool-use.json

jq -e -s '
  length == 5
  and .[0].runtime == "codex"
  and .[0].status == "requested"
  and .[1].status == "started"
  and .[2].status == "completed"
  and .[3].runtime == "claude"
  and .[3].status == "started"
  and .[4].status == "completed"
' "$log_dir/skill-usage.jsonl" >/dev/null

node scripts/sync-agent-config.mjs --check

# 外部CLIの認証と通信をSandbox内の結果だけで誤判定しない契約を固定する。
check_agent_contract() {
  label=$1
  expected=$2
  file=$3

  if ! grep -F "$expected" "$file" >/dev/null; then
    printf '%s\n' "agent contract check failed: $label ($file)" >&2
    exit 1
  fi
}

extract_section() {
  _file=$1
  _start=$2
  _end=$3

  awk '
    BEGIN {
      start = ARGV[1]
      end = ARGV[2]
      ARGV[1] = ""
      ARGV[2] = ""
    }
    $0 == start { active = 1; found_start = 1 }
    active && $0 == end { found_end = 1; exit }
    active { print }
    END {
      if (!found_start || !found_end) {
        exit 1
      }
    }
  ' "$_start" "$_end" "$_file"
}

check_section_contract() {
  label=$1
  section=$2
  expected=$3

  if ! printf '%s\n' "$section" | grep -F "$expected" >/dev/null; then
    printf '%s\n' "section contract check failed: $label" >&2
    exit 1
  fi
}

printf '%s\n' "Checking agent contract consistency..."
check_agent_contract "sandbox auth visibility" 'Sandbox 内で `signed out` の場合' .ai/agents/coderabbit-reviewer.md
check_agent_contract "escalated auth/network retry" '正規の権限昇格経路で再確認してください' .codex/agents/coderabbit-reviewer.toml
check_agent_contract "communication is not authentication" '通信失敗を未認証と報告しない' .ai/runtime-compatibility.md
check_agent_contract "auth-required after outside check" 'Sandbox 外でも未認証と確認された `auth-required`' .ai/skills/issue-dev-orchestrate/SKILL.md
review_mode_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '5. **レビュー方式を選択する**。実装前に、利用可能なユーザー確認機能で必ず次のどちらかを選んでもらい、選択結果を `<scratchpad>/review-mode-<N>.md` に記録する。' '## エージェント起動の共通ルール（ツール呼び出し崩れの防止）')
cli_review_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '### CodeRabbit CLIを選んだ場合' '### GitHub Appを選んだ場合')
github_app_completion_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '5. GitHub App方式で**PRを作成した場合に限り**、設定済みのCodeRabbit AppによるPRレビューを最大10分待機し、PR review・review thread・通常コメントを確認する。Appを起動する未確認のメンションやWebhookを推測して実行してはならない。PRを作成しなかった場合はAppレビュー未実行として完了報告へ進む。App未導入、レビュー未到着、または取得不能なら、その事実を報告してユーザーに次の指示を求める。' '7. ユーザーに完了報告する: 実装サマリ／選択されたレビュー方式／CodeRabbit結果または未取得理由／テスト結果／作業ブランチ名／PR URL（作成した場合）。')
agent_egress_gate=$(awk '/^1\. \*\*方式と外部送信同意の確認\*\*/ { print; exit }' .ai/agents/coderabbit-reviewer.md)

check_section_contract "review mode selection" "$review_mode_section" 'GitHub App（推奨）'
check_section_contract "cli selection records mode" "$review_mode_section" 'reviewMode: coderabbit-cli'
check_section_contract "cli review mode" "$cli_review_section" 'reviewMode: coderabbit-cli'
check_section_contract "cli egress consent" "$cli_review_section" 'externalEgressApproved: true'
check_section_contract "cli consent fallback" "$cli_review_section" 'external-egress-confirmation-required'
check_section_contract "github app waits only after pr" "$github_app_completion_section" 'PRを作成した場合に限り'
check_section_contract "github app verifies latest head" "$github_app_completion_section" '古いHEADのレビューだけで再レビュー済みと扱ってはならない'
check_section_contract "agent mode and egress gate" "$agent_egress_gate" 'reviewMode: coderabbit-cli'
check_section_contract "agent requires egress consent" "$agent_egress_gate" 'externalEgressApproved: true'
check_section_contract "agent rejects github app mode" "$agent_egress_gate" '方式がGitHub App・不明の場合'
check_section_contract "agent blocks command and escalation" "$agent_egress_gate" 'レビューコマンドも権限昇格も実行せず'
check_section_contract "agent returns explicit consent status" "$agent_egress_gate" 'external-egress-confirmation-required'
printf '%s\n' "Agent contract checks passed!"
