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

# ---- レビュー規約は .ai/review-guidelines.md が単一ソース。他文書での再掲を禁止する ----
check_agent_contract "guidelines own the design mapping" '## 読む章（design.md 章マッピング）' .ai/review-guidelines.md
check_agent_contract "guidelines scope design chapters" '1500行を超えるため全文は読まない' .ai/review-guidelines.md
check_agent_contract "guidelines define severities" '## 重要度' .ai/review-guidelines.md
check_agent_contract "guidelines define accuracy profile" '### `accuracy-first`（正確性優先）' .ai/review-guidelines.md
check_agent_contract "guidelines define spec profile" '### `spec-compliance-first`（仕様準拠優先）' .ai/review-guidelines.md
check_agent_contract "agents md points at guidelines" '.ai/review-guidelines.md' AGENTS.md
check_agent_contract "agents md forbids restating" '**本書を含む他の文書で再掲しない。**' AGENTS.md
# 章マッピング表を AGENTS.md へ書き戻すと単一ソースが崩れる。
check_absent_contract "agents md does not restate mapping" '| `apps/web/**` |' AGENTS.md
check_absent_contract "reviewer does not restate mapping" '| `apps/web/**` |' .ai/agents/reviewer.md
check_absent_contract "common does not restate mapping" '| `apps/web/**` |' .ai/agents/cross-model-reviewer-common.md

# ---- 役割別プロファイルの割り当て ----
check_agent_contract "reviewer defaults to accuracy profile" '**既定は `accuracy-first`（正確性優先）**' .ai/agents/reviewer.md
check_agent_contract "reviewer defers guidelines" '`.ai/review-guidelines.md` が単一ソース' .ai/agents/reviewer.md
check_agent_contract "common uses spec profile" '`spec-compliance-first`' .ai/agents/cross-model-reviewer-common.md

# ---- 別モデルレビュアー共通定義 ----
check_agent_contract "common is shared source" '`codex-reviewer` と `claude-reviewer` が共有する' .ai/agents/cross-model-reviewer-common.md
check_agent_contract "codex reads common first" '`.ai/agents/cross-model-reviewer-common.md` を全文読んでください' .ai/agents/codex-reviewer.md
check_agent_contract "claude reads common first" '`.ai/agents/cross-model-reviewer-common.md` を全文読んでください' .ai/agents/claude-reviewer.md
check_agent_contract "codex reviewer host guard" '**Codex ホストで使ってはならない**' .ai/agents/codex-reviewer.md
check_agent_contract "claude reviewer host guard" '**Claude Code ホストで使ってはならない**' .ai/agents/claude-reviewer.md
check_agent_contract "common rejects same vendor host" 'wrong-host-agent' .ai/agents/cross-model-reviewer-common.md
check_agent_contract "codex egress destination" '`egressDestination` は `openai` である' .ai/agents/codex-reviewer.md
check_agent_contract "claude egress destination" '`egressDestination` は `anthropic` である' .ai/agents/claude-reviewer.md

# ---- 外部送信同意は送信先と実際の送信内容に束縛する ----
check_agent_contract "consent binds destination" 'egressDestination' .ai/agents/cross-model-reviewer-common.md
check_agent_contract "consent requires scope" 'approvedScope' .ai/agents/cross-model-reviewer-common.md
check_agent_contract "consent scope diff" 'committed-diff' .ai/agents/cross-model-reviewer-common.md
check_agent_contract "consent scope brief" 'brief-context' .ai/agents/cross-model-reviewer-common.md
check_agent_contract "consent scope repo reads" 'repository-reads' .ai/agents/cross-model-reviewer-common.md
check_agent_contract "consent rejects diff-only" '**差分だけの同意で実行してはならない。**' .ai/agents/cross-model-reviewer-common.md
check_agent_contract "consent blocks command and escalation" 'レビューコマンドも権限昇格も実行せず' .ai/agents/cross-model-reviewer-common.md
check_agent_contract "consent returns explicit status" 'external-egress-confirmation-required' .ai/agents/cross-model-reviewer-common.md

# ---- 三点差分の固定（実効base = merge-base） ----
check_agent_contract "common computes effective base" 'git merge-base <base> HEAD' .ai/agents/cross-model-reviewer-common.md
check_agent_contract "common explains two-dot risk" '二点差分になる' .ai/agents/cross-model-reviewer-common.md
check_agent_contract "common records both bases" '論理base（ブランチ名）と実効base（SHA）の**両方**' .ai/agents/cross-model-reviewer-common.md
check_agent_contract "codex passes effective base" 'codex exec review --base <effective-base> -m <model> -c sandbox_mode="read-only"' .ai/agents/codex-reviewer.md
check_agent_contract "claude passes effective base" 'git diff <effective-base>...HEAD | claude -p' .ai/agents/claude-reviewer.md
legacy_logical_base=$(printf '%s%s' 'codex exec review --base <base> ' '-m <model>')
check_absent_contract "codex no longer passes logical base" "$legacy_logical_base" .ai/agents/codex-reviewer.md

# ---- CLI 固有フラグ ----
check_agent_contract "codex review enforces read-only sandbox" '`-c sandbox_mode="read-only"` を必ず付ける' .ai/agents/codex-reviewer.md
check_agent_contract "codex reviewer rejects prompt argument" '`PROMPT`（カスタム指示・`-` による stdin 入力を含む）を渡さない' .ai/agents/codex-reviewer.md
check_agent_contract "codex reviewer avoids output file" '`-o` / 出力ファイルを使わない' .ai/agents/codex-reviewer.md
check_agent_contract "claude reviewer restricts tools" '`--allowedTools` と `--disallowedTools` を必ず両方指定する' .ai/agents/claude-reviewer.md
check_agent_contract "common avoids temp files" '**一時ファイルも作らない**' .ai/agents/cross-model-reviewer-common.md
check_agent_contract "common keeps committed-only scope" 'レビュー対象はコミット済み差分だけに限定する' .ai/agents/cross-model-reviewer-common.md

# ---- 認証判定は文言一致に依存しない ----
check_agent_contract "auth not literal match" '**未認証の判定を特定の文言の一致に依存しない。**' .ai/agents/cross-model-reviewer-common.md
check_agent_contract "auth exit code counts" '終了コードが非ゼロ、または出力が認証済みを示さない場合は、すべて未認証として扱う' .ai/agents/cross-model-reviewer-common.md
legacy_signed_out=$(printf '%s%s' 'Sandbox 内で `signed ' 'out` の場合')
check_absent_contract "legacy coderabbit signed-out wording" "$legacy_signed_out" .ai/agents/cross-model-reviewer-common.md
check_agent_contract "communication is not authentication" '通信失敗を未認証と報告しない' .ai/runtime-compatibility.md

# ---- モデル方針（本体 / nested を別節に分ける） ----
model_policy_section='別モデルCLIレビューのモデル方針'
check_agent_contract "model policy section exists" "## $model_policy_section" .ai/runtime-compatibility.md
check_agent_contract "agent-self policy is separate" '## Codexサブエージェント本体のモデル方針' .ai/runtime-compatibility.md
check_agent_contract "codex toml points at live section" "$model_policy_section" .codex/agents/codex-reviewer.toml
check_agent_contract "claude toml points at live section" "$model_policy_section" .codex/agents/claude-reviewer.toml
check_agent_contract "cross-model review model is explicit" 'モデルは必ず `-m` / `--model` で明示指定する' .ai/runtime-compatibility.md
check_agent_contract "codex nested review model" '`-m gpt-5.6-sol`' .ai/runtime-compatibility.md
check_agent_contract "plain gpt-5.6 is rejected" '素の `gpt-5.6` は使えない' .ai/runtime-compatibility.md
check_agent_contract "codex review sandbox default documented" '既定 Sandbox は `workspace-write`' .ai/runtime-compatibility.md
check_agent_contract "claude nested review model" '`--model opus`' .ai/runtime-compatibility.md
check_agent_contract "host to reviewer mapping" '| Claude Code | `codex-reviewer` |' .ai/runtime-compatibility.md
check_agent_contract "codex host uses claude reviewer" '| Codex（App / CLI） | `claude-reviewer` |' .ai/runtime-compatibility.md
check_agent_contract "codex toml pins model variant" '`-m gpt-5.6-sol`' .codex/agents/codex-reviewer.toml
check_agent_contract "codex toml pins read-only sandbox" 'sandbox_mode="read-only"' .codex/agents/codex-reviewer.toml
check_agent_contract "codex toml effort" 'model_reasoning_effort = "high"' .codex/agents/codex-reviewer.toml
check_agent_contract "claude toml effort" 'model_reasoning_effort = "high"' .codex/agents/claude-reviewer.toml
check_agent_contract "escalated auth/network retry" '正規の権限昇格経路で再確認してください' .codex/agents/codex-reviewer.toml
check_agent_contract "claude reviewer escalated retry" '正規の権限昇格経路で再確認してください' .codex/agents/claude-reviewer.toml
check_agent_contract "codex toml reads common" '.ai/agents/cross-model-reviewer-common.md' .codex/agents/codex-reviewer.toml
check_agent_contract "claude toml reads common" '.ai/agents/cross-model-reviewer-common.md' .codex/agents/claude-reviewer.toml

# ---- エージェント起動フェーズ ----
check_agent_contract "codex reviewer runs in phase 5" 'ホストランタイムが Claude Code の時だけ' .ai/agents/codex-reviewer.md
check_agent_contract "claude reviewer runs in phase 5" 'ホストランタイムが Codex の時だけ' .ai/agents/claude-reviewer.md
check_agent_contract "reviewer runs in phase 5" 'issue-dev-orchestrate のフェーズ5（レビュー）で使用する' .ai/agents/reviewer.md
check_agent_contract "test fixer runs in phases 4 and 6" 'issue-dev-orchestrate のフェーズ4・6（品質ゲート）で使用する' .ai/agents/test-fixer.md
check_agent_contract "auth-required after outside check" '`auth-required`（Sandbox 外でも未認証と確認された状態）' .ai/skills/issue-dev-orchestrate/SKILL.md

# ---- SKILL.md: レビュー方式は選択制ではない ----
reviewer_decision_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '4. **別モデルレビュアーを決定する**' '## エージェント起動の共通ルール')
initial_commit_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '## フェーズ4: 品質ゲートと初期実装コミット' '## フェーズ5: 初回のコミット済み差分レビュー')
egress_consent_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '### 外部送信の明示同意（レビュー実行の直前）' '### レビューの実行')
cli_review_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '### レビューの実行' '### CodeRabbit App（補助・任意）')
coderabbit_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '### CodeRabbit App（補助・任意）' '### 結果の統合')
reviewed_head_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '### レビュー境界の記録' '## フェーズ6: 修正・品質ゲート・周回コミット・増分再レビュー')
review_loop_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '## フェーズ6: 修正・品質ゲート・周回コミット・増分再レビュー' '## フェーズ7: 完了')
completion_section=$(extract_section .ai/skills/issue-dev-orchestrate/SKILL.md '## フェーズ7: 完了' '## 中断・失敗時の原則')

check_section_contract "reviewer choice is not optional" "$reviewer_decision_section" 'レビュー方式は選択制ではない'
check_section_contract "host decides reviewer" "$reviewer_decision_section" '現在のホストランタイム（＝メインエージェントのモデル）を確認し'
check_section_contract "maps claude host" "$reviewer_decision_section" '| Claude Code | `codex-reviewer` |'
check_section_contract "maps codex host" "$reviewer_decision_section" '| Codex（App / CLI） | `claude-reviewer` |'
check_section_contract "rejects same vendor reviewer" "$reviewer_decision_section" 'ホストと同じ提供元のCLIをレビュアーにしてはならない'
check_section_contract "consent deferred to phase 5" "$reviewer_decision_section" 'フェーズ5の各レビュー実行の直前に'
# 方式選択の選択肢が復活していないことを固定する。
legacy_mode_choice=$(printf '%s%s' '別モデルCLI（推' '奨）')
check_absent_contract "no review mode selection" "$legacy_mode_choice" .ai/skills/issue-dev-orchestrate/SKILL.md

check_section_contract "consent covers more than the diff" "$egress_consent_section" '送信対象はコミット済み差分だけではない'
check_section_contract "consent covers repository reads" "$egress_consent_section" '差分に現れないファイルも送信されうる'
check_section_contract "consent lists scope keys" "$egress_consent_section" 'approvedScope'
check_section_contract "consent records destination" "$egress_consent_section" 'egressDestination'
check_section_contract "consent re-taken per destination" "$egress_consent_section" '送信先が変われば同意も取り直す'

check_section_contract "cli review mode" "$cli_review_section" 'reviewMode: cross-model-cli'
check_section_contract "cli assigns distinct profiles" "$cli_review_section" '**レビュープロファイルを割り当てる。**'
check_section_contract "reviewer gets accuracy profile" "$cli_review_section" '`accuracy-first`（正確性優先）'
check_section_contract "cross-model gets spec profile" "$cli_review_section" '`spec-compliance-first`（仕様準拠優先）'
check_section_contract "initial review range" "$cli_review_section" 'reviewRange: develop...HEAD'
check_section_contract "cli review delegates to common" "$cli_review_section" '`.ai/agents/cross-model-reviewer-common.md`'
check_section_contract "cli failure is not approval" "$cli_review_section" '別モデルレビュアーの指摘ゼロや実行失敗をapproveとして扱わない'
check_section_contract "cli consent fallback" "$cli_review_section" 'external-egress-confirmation-required'

# CodeRabbit App は補助であり、緑のチェックをレビュー済みの根拠にしない。
check_section_contract "coderabbit is auxiliary" "$coderabbit_section" '有効なレビュー経路ではなく補助である'
check_section_contract "coderabbit skipped on develop" "$coderabbit_section" '自動レビューは走らない'
check_section_contract "coderabbit green is not reviewed" "$coderabbit_section" 'チェックの緑をレビュー済みの根拠にしてはならない'

check_section_contract "initial quality gate" "$initial_commit_section" 'test-fixer'
check_absent_contract "phase 4 avoids redundant test-fixer definition wording" '`.ai/agents/test-fixer.md` の定義を使って' .ai/skills/issue-dev-orchestrate/SKILL.md
check_section_contract "initial implementation commit" "$initial_commit_section" '初期実装を1コミットにする'
check_section_contract "initial commit includes quality-gate fixes" "$initial_commit_section" 'フェーズ4の品質ゲート修正を含む'
check_section_contract "initial commit excludes unrelated user changes" "$initial_commit_section" '無関係なユーザー変更は含めない'
check_section_contract "initial commit stages all current-work changes" "$initial_commit_section" 'git add -- <今回作業の変更ファイル>'
check_section_contract "initial commit requires clean tree" "$initial_commit_section" 'git status --short'

check_section_contract "fallback reviewer stores reviewed head" "$reviewed_head_section" '代替として起動した2件目の `reviewer`'
check_section_contract "fallback reviewer normal result" "$reviewed_head_section" '`approve` / `request-changes` で正常完了した場合'
check_section_contract "cross-model failure is not approval" "$reviewed_head_section" '別モデルレビュアーの失敗自体を approve として扱ってはならず'
check_section_contract "reviewed head updates only after real review" "$reviewed_head_section" '有効なレビュー経路の実レビューが `approve` / `request-changes` で正常完了したときだけ'
check_section_contract "coderabbit alone is not a route" "$reviewed_head_section" '単独では有効なレビュー経路にならない'

check_section_contract "incremental review range" "$review_loop_section" '<previous-reviewed-head>...HEAD'
check_section_contract "incremental cli base" "$review_loop_section" '別モデルレビュアーには論理base として `<previous-reviewed-head>` を渡し'
check_section_contract "incremental cli keeps same agent" "$review_loop_section" '初回と同じエージェント（`reviewerAgent`）を使う'
check_section_contract "incremental re-consents full scope" "$review_loop_section" '`approvedScope` の3種すべてを再掲する'
check_section_contract "reviewed head scratchpad" "$review_loop_section" 'last-reviewed-head-<N>.txt'
check_section_contract "review loop passes changed files to test fixer" "$review_loop_section" '当該周回の変更ファイル一覧'
check_section_contract "review loop scopes test fixer brief" "$review_loop_section" '`test-fixer` 用ブリーフに明記する'
check_section_contract "review loop commits only round files" "$review_loop_section" 'この一覧のファイルだけを明示して stage'
check_section_contract "review loop reuses reviewed head rule" "$review_loop_section" 'レビュー境界の更新条件はフェーズ5「レビュー境界の記録」と同じ'
check_section_contract "app review must match latest head" "$review_loop_section" '古いHEADのレビューを再レビュー済みとして扱ってはならない'
check_section_contract "cli review never skipped" "$review_loop_section" '別モデルCLIによる再レビューは省略しない'
check_section_contract "completion avoids duplicate commit" "$completion_section" 'このフェーズで追加コミットは作らない'

check_agent_contract "reviewer initial committed range" '初回は `git diff develop...HEAD`' .ai/agents/reviewer.md
check_agent_contract "reviewer incremental committed range" '`git diff <previous-reviewed-head>...HEAD`' .ai/agents/reviewer.md

# ---- 危険フラグ ----
check_absent_contract "sandbox bypass flag is not used" '--dangerously-bypass-approvals-and-sandbox' .ai/skills/issue-dev-orchestrate/SKILL.md
claude_permission_bypass=$(printf '%s%s' '--dangerously-skip-' 'permissions')
check_absent_contract "claude permission bypass not in orchestration" "$claude_permission_bypass" .ai/skills/issue-dev-orchestrate/SKILL.md

printf '%s\n' "Agent contract checks passed!"
