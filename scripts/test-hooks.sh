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

  if ! grep -F -- "$expected" "$file" >/dev/null; then
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
    !active && index($0, start) { active = 1; found_start = 1 }
    active && index($0, end) { found_end = 1; exit }
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

  if ! printf '%s\n' "$section" | grep -F -- "$expected" >/dev/null; then
    printf '%s\n' "section contract check failed: $label" >&2
    exit 1
  fi
}

check_absent_contract() {
  label=$1
  unexpected=$2
  file=$3

  if grep -F -- "$unexpected" "$file" >/dev/null; then
    printf '%s\n' "unexpected agent contract: $label ($file)" >&2
    exit 1
  fi
}

printf '%s\n' "Checking agent contract consistency..."
check_agent_contract "sandbox auth visibility" 'Sandbox 内で `signed out` の場合' .ai/agents/coderabbit-reviewer.md
check_agent_contract "escalated auth/network retry" '正規の権限昇格経路で再確認してください' .codex/agents/coderabbit-reviewer.toml
check_agent_contract "communication is not authentication" '通信失敗を未認証と報告しない' .ai/runtime-compatibility.md
check_agent_contract "auth-required after outside check" 'Sandbox 外でも未認証と確認された `auth-required`' .ai/skills/issue-dev-orchestrate/SKILL.md
review_mode_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '5. **レビュー方式を選択する**' '## エージェント起動の共通ルール')
initial_commit_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '## フェーズ4: 品質ゲートと初期実装コミット' '## フェーズ5: 初回のコミット済み差分レビュー')
cli_review_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '### CodeRabbit CLIを選んだ場合' '### GitHub Appを選んだ場合')
github_app_review_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '### GitHub Appを選んだ場合' '### 結果の統合とレビュー済みHEADの記録')
review_loop_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '## フェーズ6: 修正・品質ゲート・周回コミット・増分再レビュー' '## フェーズ7: 完了')
completion_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '## フェーズ7: 完了' '## 中断・失敗時の原則')
agent_egress_gate=$(awk '/^1\. \*\*方式と外部送信同意の確認\*\*/ { print; exit }' .ai/agents/coderabbit-reviewer.md)

check_section_contract "review mode selection" "$review_mode_section" 'GitHub App（推奨）'
check_section_contract "cli selection records mode" "$review_mode_section" 'reviewMode: coderabbit-cli'
check_section_contract "cli selection sends committed diff" "$review_mode_section" 'privateのコミット済み差分'
check_section_contract "cli review mode" "$cli_review_section" 'reviewMode: coderabbit-cli'
check_section_contract "cli egress consent" "$cli_review_section" 'externalEgressApproved: true'
check_section_contract "cli consent fallback" "$cli_review_section" 'external-egress-confirmation-required'
check_section_contract "initial quality gate" "$initial_commit_section" 'test-fixer'
check_section_contract "initial implementation commit" "$initial_commit_section" '初期実装を1コミットにする'
check_section_contract "initial commit requires clean tree" "$initial_commit_section" 'git status --short'
check_section_contract "initial review range" "$cli_review_section" 'reviewRange: develop...HEAD'
check_section_contract "initial cli committed review" "$cli_review_section" 'coderabbit review --agent --committed --base develop'
check_section_contract "github app follows initial commit" "$github_app_review_section" '初期コミット後に'
check_section_contract "github app reviews initial head" "$github_app_review_section" 'この初期コミットのHEAD'
check_section_contract "incremental review range" "$review_loop_section" '<previous-reviewed-head>...HEAD'
check_section_contract "incremental cli committed review" "$review_loop_section" 'coderabbit review --agent --committed --base-commit <previous-reviewed-head>'
check_section_contract "reviewed head scratchpad" "$review_loop_section" 'last-reviewed-head-<N>.txt'
check_section_contract "github app verifies latest head" "$review_loop_section" '古いHEADのレビューだけで再レビュー済みと扱ってはならない'
check_section_contract "completion avoids duplicate commit" "$completion_section" 'このフェーズで追加コミットは作らない'
check_section_contract "agent mode and egress gate" "$agent_egress_gate" 'reviewMode: coderabbit-cli'
check_section_contract "agent requires egress consent" "$agent_egress_gate" 'externalEgressApproved: true'
check_section_contract "agent rejects github app mode" "$agent_egress_gate" '方式がGitHub App・不明の場合'
check_section_contract "agent blocks command and escalation" "$agent_egress_gate" 'レビューコマンドも権限昇格も実行せず'
check_section_contract "agent returns explicit consent status" "$agent_egress_gate" 'external-egress-confirmation-required'
check_agent_contract "reviewer initial committed range" '初回は `git diff develop...HEAD`' .ai/agents/reviewer.md
check_agent_contract "reviewer incremental committed range" '`git diff <previous-reviewed-head>...HEAD`' .ai/agents/reviewer.md
check_agent_contract "coderabbit initial committed command" 'coderabbit review --agent --committed --base develop' .ai/agents/coderabbit-reviewer.md
check_agent_contract "coderabbit incremental committed command" 'coderabbit review --agent --committed --base-commit <previous-reviewed-head>' .ai/agents/coderabbit-reviewer.md
legacy_uncommitted_flag=$(printf '%s%s' '-t un' 'committed')
check_absent_contract "legacy uncommitted CodeRabbit flag" "$legacy_uncommitted_flag" .ai/agents/coderabbit-reviewer.md
check_absent_contract "legacy uncommitted CodeRabbit flag in orchestration" "$legacy_uncommitted_flag" .ai/skills/issue-dev-orchestrate/SKILL.md
printf '%s\n' "Agent contract checks passed!"
