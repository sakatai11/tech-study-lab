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
# 未認証の文言は CLI ごとに異なる（codex は `Not logged in` + 終了コード1）。
# 文言の一致ではなく「認証済みと確認できたか」で判定する契約を固定する。
check_agent_contract "sandbox auth visibility" 'Sandbox 内で未認証と判定された場合は、同じ `codex login status` だけを正規の承認・権限昇格経路で再実行する' .ai/agents/codex-reviewer.md
check_agent_contract "codex auth not literal match" '未認証の判定を特定の文言の一致に依存しない' .ai/agents/codex-reviewer.md
check_agent_contract "claude auth not literal match" '未認証の判定を特定の文言の一致に依存しない' .ai/agents/claude-reviewer.md
check_agent_contract "codex auth exit code counts" '終了コードが非ゼロ、または出力が認証済みを示さない場合は、すべて未認証として扱う' .ai/agents/codex-reviewer.md
legacy_signed_out=$(printf '%s%s' 'Sandbox 内で `signed ' 'out` の場合')
check_absent_contract "legacy coderabbit signed-out wording" "$legacy_signed_out" .ai/agents/codex-reviewer.md
check_agent_contract "codex reviewer runs in phase 5" 'issue-dev-orchestrate のフェーズ5でCLI方式が選ばれ、かつホストランタイムが Claude Code の時だけ' .ai/agents/codex-reviewer.md
check_agent_contract "claude reviewer runs in phase 5" 'issue-dev-orchestrate のフェーズ5でCLI方式が選ばれ、かつホストランタイムが Codex の時だけ' .ai/agents/claude-reviewer.md
legacy_codex_phase=$(printf '%s%s' 'issue-dev-orchestrate のフェーズ' '4でCLI方式が選ばれた時だけ')
check_absent_contract "legacy codex reviewer phase 4" "$legacy_codex_phase" .ai/agents/codex-reviewer.md
check_agent_contract "reviewer runs in phase 5" 'issue-dev-orchestrate のフェーズ5（レビュー）で使用する' .ai/agents/reviewer.md
check_agent_contract "test fixer runs in phases 4 and 6" 'issue-dev-orchestrate のフェーズ4・6（品質ゲート）で使用する' .ai/agents/test-fixer.md
check_agent_contract "escalated auth/network retry" '正規の権限昇格経路で再確認してください' .codex/agents/codex-reviewer.toml
check_agent_contract "claude reviewer escalated retry" '正規の権限昇格経路で再確認してください' .codex/agents/claude-reviewer.toml
# TOML が参照する節名が runtime-compatibility.md に実在することを固定する（節名変更時の参照切れ防止）。
model_policy_section='別モデルCLIレビューのモデル方針'
check_agent_contract "model policy section exists" "## $model_policy_section" .ai/runtime-compatibility.md
check_agent_contract "codex toml points at live section" "$model_policy_section" .codex/agents/codex-reviewer.toml
check_agent_contract "claude toml points at live section" "$model_policy_section" .codex/agents/claude-reviewer.toml
check_agent_contract "codex toml pins model variant" '`-m gpt-5.6-sol`' .codex/agents/codex-reviewer.toml
check_agent_contract "codex toml pins read-only sandbox" 'sandbox_mode="read-only"' .codex/agents/codex-reviewer.toml
check_agent_contract "communication is not authentication" '通信失敗を未認証と報告しない' .ai/runtime-compatibility.md
check_agent_contract "auth-required after outside check" '`auth-required`（Sandbox 外でも未認証と確認された状態）' .ai/skills/issue-dev-orchestrate/SKILL.md
review_mode_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '4. **レビュー方式を選択する**' '## エージェント起動の共通ルール')
initial_commit_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '## フェーズ4: 品質ゲートと初期実装コミット' '## フェーズ5: 初回のコミット済み差分レビュー')
cli_review_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '### 別モデルCLIを選んだ場合' '### GitHub Appを選んだ場合')
github_app_review_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '### GitHub Appを選んだ場合' '### 結果の統合')
reviewed_head_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '### レビュー境界の記録' '## フェーズ6: 修正・品質ゲート・周回コミット・増分再レビュー')
review_loop_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '## フェーズ6: 修正・品質ゲート・周回コミット・増分再レビュー' '## フェーズ7: 完了')
completion_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '## フェーズ7: 完了' '## 中断・失敗時の原則')
agent_egress_gate=$(awk '/^1\. \*\*方式と外部送信同意の確認\*\*/ { print; exit }' .ai/agents/codex-reviewer.md)
claude_agent_egress_gate=$(awk '/^1\. \*\*方式と外部送信同意の確認\*\*/ { print; exit }' .ai/agents/claude-reviewer.md)

check_section_contract "review mode selection" "$review_mode_section" '別モデルCLI（推奨）'
check_section_contract "cli selection records mode" "$review_mode_section" 'reviewMode: cross-model-cli'
check_section_contract "cli selection records agent" "$review_mode_section" 'reviewerAgent: <codex-reviewer|claude-reviewer>'
# 両CLIともリポジトリ読み取り権限を持つ。同意は差分だけを対象にしてはならない。
check_section_contract "consent covers more than the diff" "$review_mode_section" '送信対象はコミット済み差分だけではない'
check_section_contract "consent covers repository reads" "$review_mode_section" '差分に現れないファイルも送信されうる'
check_section_contract "consent covers brief context" "$review_mode_section" 'ブリーフに含める実装方針の要約・受け入れ条件・issue の内容'
check_section_contract "cli selection maps host to agent" "$review_mode_section" '| Claude Code | `codex-reviewer` |'
check_section_contract "cli selection maps codex host" "$review_mode_section" '| Codex（App / CLI） | `claude-reviewer` |'
check_section_contract "cli selection re-consents per destination" "$review_mode_section" '送信先が変われば同意も取り直す'
check_section_contract "cli selection sends committed diff" "$review_mode_section" 'privateのコミット済み差分'
check_section_contract "cli review mode" "$cli_review_section" 'reviewMode: cross-model-cli'
check_section_contract "cli review rejects same-vendor agent" "$cli_review_section" 'ホストと同じ提供元のCLIを別モデルレビュアーとして起動しない'
check_section_contract "cli egress consent" "$cli_review_section" 'externalEgressApproved: true'
check_section_contract "cli consent fallback" "$cli_review_section" 'external-egress-confirmation-required'
check_section_contract "initial quality gate" "$initial_commit_section" 'test-fixer'
check_absent_contract "phase 4 avoids redundant test-fixer definition wording" '`.ai/agents/test-fixer.md` の定義を使って' .ai/skills/issue-dev-orchestrate/SKILL.md
check_section_contract "initial implementation commit" "$initial_commit_section" '初期実装を1コミットにする'
check_section_contract "initial commit includes quality-gate fixes" "$initial_commit_section" 'フェーズ4の品質ゲート修正を含む'
check_section_contract "initial commit excludes unrelated user changes" "$initial_commit_section" '無関係なユーザー変更は含めない'
check_section_contract "initial commit stages all current-work changes" "$initial_commit_section" 'git add -- <今回作業の変更ファイル>'
check_section_contract "initial commit requires clean tree" "$initial_commit_section" 'git status --short'
check_section_contract "initial review range" "$cli_review_section" 'reviewRange: develop...HEAD'
check_section_contract "cli review delegates command to agent" "$cli_review_section" '`.ai/agents/<エージェント名>.md` が単一ソース'
check_section_contract "cli failure is not approval" "$cli_review_section" '別モデルレビュアーの指摘ゼロや実行失敗をapproveとして扱わない'
check_section_contract "github app follows initial commit" "$github_app_review_section" '初期コミット後に'
check_section_contract "github app reviews initial head" "$github_app_review_section" 'この初期コミットのHEAD'
check_section_contract "github app splits reviewer roles" "$github_app_review_section" '`docs/design.md` 準拠と受け入れ条件の充足'
check_section_contract "fallback reviewer stores reviewed head" "$reviewed_head_section" '代替として起動した2件目の `reviewer`'
check_section_contract "fallback reviewer normal result" "$reviewed_head_section" '`approve` / `request-changes` で正常完了した場合'
check_section_contract "cross-model failure is not approval" "$reviewed_head_section" '別モデルレビュアーの失敗自体を approve として扱ってはならず'
check_section_contract "reviewed head updates only after real review" "$reviewed_head_section" '有効なレビュー経路の実レビューが `approve` / `request-changes` で正常完了したときだけ'
check_section_contract "incremental review range" "$review_loop_section" '<previous-reviewed-head>...HEAD'
check_section_contract "incremental cli base" "$review_loop_section" '別モデルレビュアーには `<previous-reviewed-head>` を base として渡し'
check_section_contract "incremental cli keeps same agent" "$review_loop_section" '初回と同じエージェント（`reviewerAgent`）を使う'
check_section_contract "reviewed head scratchpad" "$review_loop_section" 'last-reviewed-head-<N>.txt'
check_section_contract "review loop passes changed files to test fixer" "$review_loop_section" '当該周回の変更ファイル一覧'
check_section_contract "review loop scopes test fixer brief" "$review_loop_section" '`test-fixer` 用ブリーフに明記する'
check_section_contract "review loop commits only round files" "$review_loop_section" 'この一覧のファイルだけを明示して stage'
check_section_contract "github app waits for latest head" "$review_loop_section" '最新HEADに対するAppレビューを待機'
check_section_contract "review loop reuses reviewed head rule" "$review_loop_section" 'レビュー境界の更新条件はフェーズ5「レビュー境界の記録」と同じ'
check_section_contract "github app verifies latest head" "$review_loop_section" '古いHEADのレビューだけで再レビュー済みと扱ってはならない'
check_section_contract "completion avoids duplicate commit" "$completion_section" 'このフェーズで追加コミットは作らない'
check_section_contract "agent mode and egress gate" "$agent_egress_gate" 'reviewMode: cross-model-cli'
check_section_contract "agent identifies itself" "$agent_egress_gate" 'reviewerAgent: codex-reviewer'
check_section_contract "agent rejects other agent assignment" "$agent_egress_gate" '`reviewerAgent` があなた以外を指す場合'
check_section_contract "agent requires egress consent" "$agent_egress_gate" 'externalEgressApproved: true'
check_section_contract "agent rejects github app mode" "$agent_egress_gate" '方式がGitHub App・不明の場合'
check_section_contract "agent blocks command and escalation" "$agent_egress_gate" 'レビューコマンドも権限昇格も実行せず'
check_section_contract "agent returns explicit consent status" "$agent_egress_gate" 'external-egress-confirmation-required'
check_section_contract "claude agent mode and egress gate" "$claude_agent_egress_gate" 'reviewMode: cross-model-cli'
check_section_contract "claude agent identifies itself" "$claude_agent_egress_gate" 'reviewerAgent: claude-reviewer'
check_section_contract "claude agent rejects other agent assignment" "$claude_agent_egress_gate" '`reviewerAgent` があなた以外を指す場合'
check_section_contract "claude agent requires egress consent" "$claude_agent_egress_gate" 'externalEgressApproved: true'
check_section_contract "claude agent blocks command and escalation" "$claude_agent_egress_gate" 'レビューコマンドも権限昇格も実行せず'
check_section_contract "claude agent returns explicit consent status" "$claude_agent_egress_gate" 'external-egress-confirmation-required'
check_agent_contract "reviewer initial committed range" '初回は `git diff develop...HEAD`' .ai/agents/reviewer.md
check_agent_contract "reviewer incremental committed range" '`git diff <previous-reviewed-head>...HEAD`' .ai/agents/reviewer.md
check_agent_contract "reviewer defers design mapping to AGENTS.md" '`AGENTS.md`「レビュー規約」の章マッピングに従い' .ai/agents/reviewer.md
check_agent_contract "review guidelines own the design mapping" '### レビュー規約' AGENTS.md
check_agent_contract "review guidelines scope design chapters" '1500行を超えるため全文は読まない' AGENTS.md
# --base と PROMPT は codex CLI 上で排他。併用するコマンドを契約として固定しない。
check_agent_contract "codex review command" 'codex exec review --base <base> -m <model> -c sandbox_mode="read-only"' .ai/agents/codex-reviewer.md
check_agent_contract "codex review enforces read-only sandbox" '`-c sandbox_mode="read-only"` を必ず付ける' .ai/agents/codex-reviewer.md
check_agent_contract "claude review command" 'git diff <base>...HEAD | claude -p "<レビュー指示>" --model <model>' .ai/agents/claude-reviewer.md
check_agent_contract "cross-model review model is explicit" 'モデルは必ず `-m` / `--model` で明示指定する' .ai/runtime-compatibility.md
# ChatGPT アカウント認証では素の gpt-5.6 が 400 になるため、バリアント指定を固定する。
check_agent_contract "codex nested review model" '`-m gpt-5.6-sol`' .ai/runtime-compatibility.md
check_agent_contract "plain gpt-5.6 is rejected" '素の `gpt-5.6` は使えない' .ai/runtime-compatibility.md
check_agent_contract "codex review sandbox default documented" '既定 Sandbox は `workspace-write`' .ai/runtime-compatibility.md
check_agent_contract "claude nested review model" '`--model opus`' .ai/runtime-compatibility.md
check_agent_contract "host to reviewer mapping" '| Claude Code | `codex-reviewer` |' .ai/runtime-compatibility.md
check_agent_contract "codex host uses claude reviewer" '| Codex（App / CLI） | `claude-reviewer` |' .ai/runtime-compatibility.md
check_agent_contract "codex reviewer rejects prompt argument" '`PROMPT`（カスタム指示・`-` による stdin 入力を含む）を渡さない' .ai/agents/codex-reviewer.md
check_agent_contract "codex reviewer avoids output file" '`-o` / 出力ファイルを使わない' .ai/agents/codex-reviewer.md
check_agent_contract "claude reviewer restricts tools" '`--allowedTools` と `--disallowedTools` を必ず両方指定する' .ai/agents/claude-reviewer.md
check_agent_contract "claude reviewer avoids output file" '出力ファイルを使わない' .ai/agents/claude-reviewer.md
check_agent_contract "codex reviewer keeps committed-only scope" 'レビュー対象はコミット済み差分だけに限定する' .ai/agents/codex-reviewer.md
check_agent_contract "claude reviewer keeps committed-only scope" 'レビュー対象はコミット済み差分だけに限定する' .ai/agents/claude-reviewer.md
legacy_prompt_pipe=$(printf '%s%s' '-m <model> -o <出力ファイル> - < ' '<レビュー指示ファイル>')
check_absent_contract "legacy conflicting base+prompt command" "$legacy_prompt_pipe" .ai/agents/codex-reviewer.md
check_absent_contract "sandbox bypass flag is not used" '--dangerously-bypass-approvals-and-sandbox' .ai/skills/issue-dev-orchestrate/SKILL.md
claude_permission_bypass=$(printf '%s%s' '--dangerously-skip-' 'permissions')
check_absent_contract "claude permission bypass not in orchestration" "$claude_permission_bypass" .ai/skills/issue-dev-orchestrate/SKILL.md
printf '%s\n' "Agent contract checks passed!"
