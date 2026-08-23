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

check_section_absent_contract() {
  label=$1
  section=$2
  unexpected=$3

  if printf '%s\n' "$section" | grep -F -- "$unexpected" >/dev/null; then
    printf '%s\n' "unexpected section contract: $label" >&2
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

# 方針: 手順の逐語表現は固定しない。より良い言い回しへの改善を阻害するため。
# ここで守るのは「破られると危険な不変条件」と「単一ソースが二重定義に戻っていないこと」だけ。

SKILL=.ai/skills/issue-dev-orchestrate/SKILL.md
COMMON=.ai/cross-model-reviewer-common.md
GUIDE=.ai/review-guidelines.md
RUNTIME=.ai/runtime-compatibility.md
AGENT_GUIDE=docs/ai-coding-agents.md

# 正規化エージェント名から、外部CLIを実行・監視する主体だと誤認できないことを固定する。
for old_path in \
  .ai/agents/claude-reviewer.md \
  .ai/agents/codex-reviewer.md \
  .claude/agents/claude-reviewer.md \
  .claude/agents/codex-reviewer.md \
  .codex/agents/claude-reviewer.toml \
  .codex/agents/codex-reviewer.toml; do
  if [ -e "$old_path" ] || [ -L "$old_path" ]; then
    printf '%s\n' "legacy reviewer agent name remains: $old_path" >&2
    exit 1
  fi
done

if [ "$(readlink .claude/agents/claude-review-normalizer.md)" != '../../.ai/agents/claude-review-normalizer.md' ] ||
  [ "$(readlink .claude/agents/codex-review-normalizer.md)" != '../../.ai/agents/codex-review-normalizer.md' ]; then
  printf '%s\n' 'review normalizer discovery links are invalid' >&2
  exit 1
fi

check_agent_contract "claude normalizer TOML name" 'name = "claude-review-normalizer"' .codex/agents/claude-review-normalizer.toml
check_agent_contract "codex normalizer TOML name" 'name = "codex-review-normalizer"' .codex/agents/codex-review-normalizer.toml
check_absent_contract "legacy consent field name stays removed" '`reviewerAgent`' "$SKILL"
check_agent_contract "consent identifies the normalizer" '`normalizerAgent`' "$SKILL"

for file in \
  "$SKILL" \
  .ai/skills/issue-new/SKILL.md \
  .github/ISSUE_TEMPLATE/feature-spec.yml \
  .github/ISSUE_TEMPLATE/task.yml; do
  check_absent_contract "unused background agent CLI option stays removed" 'バックグラウンドAIエージェントCLI' "$file"
  check_absent_contract "unused background agent CLI field stays removed" 'background-agent-cli' "$file"
done

# ---- スキルが手順書化していないこと ----
check_agent_contract "skill declares it is not a procedure" '**本書は手順書ではない。**' "$SKILL"
check_agent_contract "skill invites better approaches" 'より良い進め方を思いついたら' "$SKILL"
check_agent_contract "skill has invariants section" '## 不変条件' "$SKILL"
check_agent_contract "invariants are non-negotiable" 'という理由での逸脱も認めない' "$SKILL"

# ---- 不変条件: レビューの成立（最重要） ----
check_agent_contract "failure is never approval" 'レビューが正常完了しなかった状態（失敗・未取得）を approve として扱わない' "$SKILL"
# 「指摘ゼロ」を一律に禁じると、正常完了した zero-finding レビューまでブロックし、
# 共通定義の approve 規則と矛盾する。禁止と正当な approve の区別が明記されていること。
check_agent_contract "zero findings can be a valid approve" 'must-fix / should-fix が0件なら、それは正当な `approve` である' "$SKILL"
check_agent_contract "common defines scoped approve rule" '対象範囲内の must-fix / should-fix が0件' "$COMMON"
check_agent_contract "out-of-scope candidates do not block approve" '判定件数・修正対象に含めない' "$COMMON"
check_agent_contract "confirmation items do not block approve" '「別issue候補（範囲外）」または「確認事項」として報告し、当該 issue の修正ループと approve / request-changes の判定件数には含めないこと' "$SKILL"
legacy_zero_finding_ban=$(printf '%s%s' 'レビューの失敗・未取得・指摘ゼロ' 'を approve として扱わない')
check_absent_contract "no blanket ban on zero findings" "$legacy_zero_finding_ban" "$SKILL"
# フォールバックの2件目 reviewer は既定が accuracy-first のため、明示しないと観点が揃う。
check_agent_contract "cross-model path gets spec profile" '別モデルCLIと正規化エージェントに `spec-compliance-first`' "$SKILL"
check_agent_contract "consent-blocked result does not enter fallback" '第二のinternal reviewerを代替レビューとして起動せず' "$SKILL"
check_agent_contract "consent-blocked result reports missing scope" '不足した対象を具体的に報告し' "$SKILL"
check_agent_contract "consent-blocked result requires fresh confirmation" '同意を取得・記録するまでCLIを再実行しない' "$SKILL"
check_agent_contract "green check is not review" 'ステータスチェックが緑でも、レビュー済みの根拠にしない' "$SKILL"
check_agent_contract "no guessing review range" 'レビュー範囲を推測で決めない' "$SKILL"
check_agent_contract "no cherry-picking findings" 'オーケストレーターの判断で取捨選択しない' "$SKILL"
check_agent_contract "reviewed head only after real review" 'timeout、失敗、未取得はFinding状態とレビュー境界を更新しない' "$SKILL"
check_agent_contract "profiles must differ" 'レビュープロファイルを必ず分ける' "$SKILL"
check_agent_contract "orchestrator brief defines target feature" '`targetFeature`' "$SKILL"
check_agent_contract "orchestrator brief defines in-scope files" '`inScopeFiles`' "$SKILL"
check_agent_contract "orchestrator brief defines acceptance criteria" '`acceptanceCriteria`' "$SKILL"
check_agent_contract "orchestrator brief defines out-of-scope policy" '`outOfScopePolicy`' "$SKILL"
check_agent_contract "orchestrator brief defines committed range" '`committedRange`' "$SKILL"
check_agent_contract "all review actors receive the same scope" 'internal reviewer、別モデルCLI、正規化エージェントへ同じ内容で渡す' "$SKILL"
check_agent_contract "both reviewer types receive one full brief path" '同じレビューブリーフファイルの読み取り可能なパスを渡す' "$SKILL"
check_agent_contract "integrated review brief includes policy decision and head" '`reviewPolicy` / `externalReviewDecision` / 規則ID / 具体的根拠 / `decisionHead`' "$SKILL"
check_agent_contract "review mode record alone is insufficient" '`review-mode-<N>.md` だけを渡して済ませない' "$SKILL"
check_agent_contract "full brief includes consent record" '`reviewMode` / `normalizerAgent` / `egressDestination` / `externalEgressApproved` / `approvedScope` / 同意の原文・時刻' "$SKILL"
check_agent_contract "out-of-scope candidates stay out of fix loop" 'nit、「別issue候補（範囲外）」、確認事項は含めない' "$SKILL"
check_agent_contract "scope expansion requires user decision" 'ユーザー判断を得たうえでブリーフを更新する' "$SKILL"
check_agent_contract "urgent independent severe findings pause for user decision" 'レビュー判定とは別にパイプラインを一時停止してユーザーへエスカレーション' "$SKILL"

# ---- 不変条件: ブランチとコミット ----
check_agent_contract "no work on main" '`main` では作業せず' "$SKILL"
check_agent_contract "no merge" '`gh pr merge` は `AGENTS.md` で禁止' "$SKILL"
check_agent_contract "no closes keyword" '`closes #<N>` は使わない' "$SKILL"
check_agent_contract "refs required" 'refs #<N>' "$SKILL"
check_agent_contract "no hiding failures" '`|| true` などで隠さない' "$SKILL"
check_agent_contract "orchestrator owns commits" '`developer` と `test-fixer` はコミットしない' "$SKILL"
check_agent_contract "no extra commit at completion" 'このフェーズで追加コミットは作らない' "$SKILL"
check_agent_contract "implementation owner is recorded" '`executionOwner: developer | orchestrator`' "$SKILL"
check_agent_contract "orchestrator implementation inherits developer guardrails" '`orchestrator`が実装する場合も`.ai/agents/developer.md`を全文読み' "$SKILL"
check_agent_contract "implementation never self-reviews" 'internal reviewは別の`reviewer`エージェントへ委譲して自己レビューで代替しない' "$SKILL"
check_agent_contract "developer self-check is scoped" '変更ファイルと影響packageに絞った自己検証' .ai/agents/developer.md
check_agent_contract "test fixer owns full gates" '正式な`pnpm typecheck` / `pnpm lint` / `pnpm test`はフェーズ4の`test-fixer`が担う' .ai/agents/developer.md

# ---- 不変条件: スパイク／フェーズ分割時の関連状態照合 ----
# 実施手順ではなく、対象の限定・記録すべき状態・追跡可能性だけを固定する。
goal_section=$(extract_section "$SKILL" '## ゴール' '## オーケストレーター（このスキル）の責務') || {
  printf '%s\n' 'failed to extract goal completion contract' >&2
  exit 1
}
phase7_section=$(extract_section "$SKILL" '## フェーズ7: 完了' '## 中断・失敗時の原則') || {
  printf '%s\n' 'failed to extract Phase 7 reconciliation contract' >&2
  exit 1
}

check_section_contract "completion requires conditional reconciliation" "$goal_section" 'スパイクまたはフェーズ分割を伴う作業では、明示された関連Issue・撤回／置換PRの状態照合が完了'
check_section_contract "reconciliation records ordinary results to current and phase issues" "$phase7_section" '関連状態を照合し、結果を**現在Issueと明示的に関連する各phase Issue**へ記録する'
check_section_contract "reconciliation does not authorize early closure or automation" "$phase7_section" 'Issueの早期close、作業ブランチの自動merge、release自動化を許可しない'
check_section_contract "reconciliation scope is explicit sources only" "$phase7_section" '現在Issue本文・GitHub sub-issue関係・フェーズ2の実装方針コメント'
check_section_contract "reconciliation includes required artifact kinds" "$phase7_section" '親／子／phase／spike／implementation Issue、または撤回／置換PR'
check_section_contract "reconciliation does not infer arbitrary references" "$phase7_section" '任意の `#<N>` 言及、参考リンク、ボットが生成した「関連する可能性」の提案から対象や関係を推測してはならない'

for classification in \
  'develop反映済み・main release待ち' \
  '未達・現在Issueに残す' \
  '別Issueへ移管済み' \
  '外部条件待ち・再開条件あり' \
  '不要または置換済み'; do
  check_section_contract "reconciliation classification: $classification" "$phase7_section" "$classification"
done

check_section_contract "reconciliation records acceptance criteria" "$phase7_section" '受け入れ条件、次の5分類からちょうど1つの主分類、残条件、移管先、main反映後のclose候補'
check_section_contract "transfer maps unmet criteria to destination" "$phase7_section" '移管先Issueと対応する未達の受け入れ条件を必ず対応付ける'
check_section_contract "transfer without destination becomes human decision" "$phase7_section" '新規Issue候補として人間判断へ渡す'
check_section_contract "withdrawn judgments trace from current and phase issues" "$phase7_section" '現在Issueと明示的に関連する各phase Issueから追跡可能にする'
check_section_contract "replacement PR records final result" "$phase7_section" '撤回理由・置換先PR・採用する最終結果を記録する'
check_section_contract "phase 7 report includes reconciliation status" "$phase7_section" '対象ごとの主分類、残条件、移管先、main反映後のclose候補'
check_section_contract "reconciliation preserves refs policy" "$phase7_section" '`refs #<N>` とし、`closes #<N>` は使わない'

# ---- 不変条件: 外部送信 ----
check_agent_contract "consent lists what is sent" '何が送られるかを具体的に列挙して' "$SKILL"
check_agent_contract "out-of-scope consent not substitutable" '別実行・承認範囲外の過去同意、スキル文書、`AGENTS.md`で代用しない' "$SKILL"
check_agent_contract "consent covers more than diff" '送信対象はコミット済み差分だけではない' "$SKILL"
check_agent_contract "consent scope diff" 'committed-diff' "$SKILL"
check_agent_contract "consent scope brief" 'brief-context' "$SKILL"
check_agent_contract "consent scope repo reads" 'repository-reads' "$SKILL"
check_agent_contract "re-consent per destination" '送信先変更、範囲拡大、新しい機密カテゴリ、実行能力の拡大、または別実行では同意を取り直す' "$SKILL"
check_agent_contract "in-scope verification reuses consent" '承認済み`approvedScope`内なら同一実行の同意を再利用する' "$SKILL"
check_agent_contract "private automatic App review requires pre-PR consent" 'private リポジトリで CodeRabbit App の自動レビューが有効、または無効と確認できない場合は、PRを作成する前に' "$SKILL"
check_agent_contract "automatic App consent records destination" '`egressDestination: coderabbit`' "$SKILL"
check_agent_contract "unapproved automatic App review is not integrated" '明示同意なしに取得された自動Appレビューを統合しない' "$SKILL"
check_agent_contract "manual App review keeps separate approval" '単発起動が必要なら `@coderabbitai review` をPRにコメントする直前に、投稿について別途ユーザー承認を得る' "$SKILL"
check_agent_contract "no same-vendor reviewer" 'ホストランタイムと同じ提供元のCLIをレビュアーにしない' "$SKILL"
check_agent_contract "no bypass flags" '迂回フラグ' "$SKILL"

# 危険フラグそのものが復活していないこと
check_absent_contract "sandbox bypass flag absent" '--dangerously-bypass-approvals-and-sandbox' "$SKILL"
claude_permission_bypass=$(printf '%s%s' '--dangerously-skip-' 'permissions')
check_absent_contract "claude permission bypass absent" "$claude_permission_bypass" "$SKILL"

# ---- 単一ソース: レビュー規約 ----
check_agent_contract "guidelines own the design mapping" '## 読む章（design.md 章マッピング）' "$GUIDE"
check_agent_contract "guidelines define accuracy profile" '`accuracy-first`（正確性優先）' "$GUIDE"
check_agent_contract "guidelines define spec profile" '`spec-compliance-first`（仕様準拠優先）' "$GUIDE"
check_agent_contract "guidelines define severities" '## 重要度' "$GUIDE"
check_agent_contract "guidelines own review scope" '## レビュー範囲' "$GUIDE"
check_agent_contract "guidelines define out-of-scope candidates" '**別issue候補（範囲外）**' "$GUIDE"
check_agent_contract "guidelines require committed range" '`committedRange`: 今回レビューするコミット済み差分の範囲' "$GUIDE"
check_agent_contract "feature or acceptance relevance is required" '`targetFeature` または `acceptanceCriteria` に直接関係し' "$GUIDE"
check_agent_contract "in-scope files are an additional constraint" 'かつ指摘箇所が `inScopeFiles` に含まれる' "$GUIDE"
check_agent_contract "file location alone never makes a finding in scope" '`inScopeFiles` に含まれることだけでは対象範囲内にしない' "$GUIDE"
check_absent_contract "legacy any-one scope rule stays removed" 'の少なくとも1つに直接関係し' "$GUIDE"
check_agent_contract "guidelines keep repository reads from expanding scope" 'レビュー対象の外側を読んで問題を発見したこと自体は、当該 issue の修正対象にする根拠にならない' "$GUIDE"
check_agent_contract "guidelines include diff-caused regressions" '**今回差分が起こした範囲外機能の回帰**' "$GUIDE"
check_agent_contract "guidelines escalate urgent independent severe findings" '緊急性がある場合だけユーザー判断へエスカレーションする' "$GUIDE"
check_agent_contract "agents md points at guidelines" '.ai/review-guidelines.md' AGENTS.md
# 章マッピング表が単一ソース以外へ再掲されていないこと
for f in AGENTS.md .ai/agents/reviewer.md "$COMMON" "$SKILL"; do
  check_absent_contract "design mapping not restated ($f)" '| `apps/web/**` |' "$f"
done

# ---- 単一ソース: 別モデルCLIレビュー正規化共通定義 ----
check_agent_contract "common is shared source" '`codex-review-normalizer` と `claude-review-normalizer` が共有する' "$COMMON"
check_agent_contract "codex reads common" "$COMMON" .ai/agents/codex-review-normalizer.md
check_agent_contract "claude reads common" "$COMMON" .ai/agents/claude-review-normalizer.md
check_agent_contract "codex toml reads common" "$COMMON" .codex/agents/codex-review-normalizer.toml
check_agent_contract "claude toml reads common" "$COMMON" .codex/agents/claude-review-normalizer.toml
check_agent_contract "reviewer defers to guidelines" '`.ai/review-guidelines.md` が単一ソース' .ai/agents/reviewer.md
check_agent_contract "reviewer default profile" '`accuracy-first`（正確性優先）' .ai/agents/reviewer.md
check_agent_contract "common uses spec profile" '`spec-compliance-first`' "$COMMON"
check_agent_contract "common validates scope brief" '`targetFeature` / `inScopeFiles` / `acceptanceCriteria` / `outOfScopePolicy` / `reviewStage` / `committedRange`' "$COMMON"
consent_section=$(extract_section "$COMMON" '## オーケストレーターの直接実行・監視契約' '## 範囲と分割coverage') || {
  printf '%s\n' 'failed to extract external egress consent contract' >&2
  exit 1
}
scope_validation_section=$(extract_section "$COMMON" '## 範囲と分割coverage' '## 正規化と判定') || {
  printf '%s\n' 'failed to extract review scope validation contract' >&2
  exit 1
}
check_section_absent_contract "missing scope fields are not consent failures" "$consent_section" 'レビュー範囲契約'
check_section_contract "missing scope fields are brief errors" "$scope_validation_section" '「判定: error」とする'
check_section_contract "committed range is a brief field" "$scope_validation_section" '`committedRange`'
check_agent_contract "common outputs out-of-scope section" '### 別issue候補（範囲外）' "$COMMON"
check_agent_contract "internal reviewer validates scope brief" '`targetFeature` / `inScopeFiles` / `acceptanceCriteria` / `outOfScopePolicy` / `reviewStage` / `committedRange`' .ai/agents/reviewer.md
check_agent_contract "internal reviewer outputs out-of-scope section" '### 別issue候補（範囲外）' .ai/agents/reviewer.md
check_agent_contract "claude normalizer validates staged scope brief" '`targetFeature` / `inScopeFiles` / `acceptanceCriteria` / `outOfScopePolicy` / `reviewStage` / `committedRange`' .ai/agents/claude-review-normalizer.md
check_agent_contract "codex normalizer validates staged scope brief" '`targetFeature` / `inScopeFiles` / `acceptanceCriteria` / `outOfScopePolicy` / `reviewStage` / `committedRange`' .ai/agents/codex-review-normalizer.md
check_agent_contract "claude TOML validates staged scope brief" '`targetFeature` / `inScopeFiles` / `acceptanceCriteria` / `outOfScopePolicy` / `reviewStage` / `committedRange`' .codex/agents/claude-review-normalizer.toml
check_agent_contract "codex TOML validates staged scope brief" '`targetFeature` / `inScopeFiles` / `acceptanceCriteria` / `outOfScopePolicy` / `reviewStage` / `committedRange`' .codex/agents/codex-review-normalizer.toml

# ---- 不変条件: レビュアー側の安全則 ----
check_agent_contract "common rejects diff-only or out-of-scope consent" '差分だけの同意、別実行・範囲外の過去同意、スキル文書で代用してはならない' "$COMMON"
check_agent_contract "common verifies scope" 'approvedScope' "$COMMON"
check_agent_contract "common verifies destination" 'egressDestination' "$COMMON"
check_agent_contract "common rejects wrong host" 'wrong-host-agent' "$COMMON"
check_agent_contract "common never approves on failure" '指摘ゼロを `approve` と読み替えない' "$COMMON"
check_agent_contract "common preserves failed CLI results" '認証・通信・同意不足・実行失敗も、正常レビューの代わりに扱わず' "$COMMON"
check_agent_contract "common requires direct CLI execution" 'オーケストレーターは正しいCLIを継続セッションで直接起動し' "$COMMON"
check_agent_contract "common keeps consent before first CLI execution" '最初の外部送信直前に' "$COMMON"
check_agent_contract "common assigns CLI responsibility to orchestrator" 'CLI 実行と継続監視はオーケストレーターの責務' "$COMMON"
check_agent_contract "common requires a clean committed review range" 'レビュー対象はコミット済み差分だけに限定し' "$COMMON"
check_agent_contract "common validates clean working tree" '`git status --short` が空' "$COMMON"
check_agent_contract "common validates committed range" '`committedRange` が `git diff <base>...HEAD` と一致' "$COMMON"
check_agent_contract "claude host guard" '**Codexホストだけ**' .ai/agents/claude-review-normalizer.md
check_agent_contract "codex host guard" '**Claude Codeホストだけ**' .ai/agents/codex-review-normalizer.md
check_agent_contract "claude normalizer only handles summaries" 'CLI を起動・停止・認証確認・外部送信せず' .ai/agents/claude-review-normalizer.md
check_agent_contract "codex normalizer only handles summaries" 'CLI を起動・停止・認証確認・外部送信せず' .ai/agents/codex-review-normalizer.md
check_agent_contract "claude execution remains orchestrator-owned" 'オーケストレーターが `.ai/scripts/run-claude-review.sh` 経由で直接実行' .ai/agents/claude-review-normalizer.md
check_agent_contract "codex auth is explicitly orchestrator-owned" 'オーケストレーターが直接 `codex login status` を確認した後' .ai/agents/codex-review-normalizer.md
check_absent_contract "claude normalizer has no CLI execution command" 'git diff <effective-base>...HEAD |' .ai/agents/claude-review-normalizer.md
check_absent_contract "codex normalizer has no CLI execution command" 'codex exec review --base' .ai/agents/codex-review-normalizer.md
check_agent_contract "Claude review wrapper loads Keychain secret" '. "$script_dir/load-secrets.sh"' .ai/scripts/run-claude-review.sh
check_agent_contract "Claude review wrapper forwards arguments without interpolation" 'exec claude "$@"' .ai/scripts/run-claude-review.sh
check_agent_contract "runtime requires Claude review wrapper" '`.ai/scripts/run-claude-review.sh` を使う' "$RUNTIME"

# ---- モデル方針（実地検証で確定した事実） ----
check_agent_contract "model policy section exists" '## 別モデルCLIレビューのモデル方針' "$RUNTIME"
check_agent_contract "agent-self policy is separate" '## Codexサブエージェント本体のモデル方針' "$RUNTIME"
check_agent_contract "model must be explicit" 'モデルは必ず `-m` / `--model` で明示指定する' "$RUNTIME"
check_agent_contract "plain gpt-5.6 rejected" '素の `gpt-5.6` は使えない' "$RUNTIME"
check_agent_contract "codex sandbox default documented" '既定 Sandbox は `workspace-write`' "$RUNTIME"
check_agent_contract "codex nested model" '`-m gpt-5.6-sol`' "$RUNTIME"
check_agent_contract "claude nested model" '`--model opus`' "$RUNTIME"
check_agent_contract "host to reviewer mapping" '| Claude Code | `codex-review-normalizer` |' "$RUNTIME"
check_agent_contract "codex host uses claude reviewer" '| Codex（App / CLI） | `claude-review-normalizer` |' "$RUNTIME"
check_agent_contract "effective base is derived before external review" '`git merge-base <base> HEAD`' "$RUNTIME"
check_agent_contract "effective base is validated as a commit" '`git rev-parse --verify <effective-base>^{commit}`' "$RUNTIME"
check_agent_contract "invalid effective base blocks external CLI" '「判定: error」とし、別モデルCLIを実行しない' "$RUNTIME"
check_agent_contract "codex toml effort" 'model_reasoning_effort = "high"' .codex/agents/codex-review-normalizer.toml
check_agent_contract "claude toml effort" 'model_reasoning_effort = "high"' .codex/agents/claude-review-normalizer.toml
check_agent_contract "communication is not authentication" '通信失敗を未認証と報告しない' "$RUNTIME"

# ---- Codexサブエージェントの役割別モデル方針 ----
check_agent_contract "developer uses Luna" 'model = "gpt-5.6-luna"' .codex/agents/developer.toml
check_agent_contract "developer uses xhigh" 'model_reasoning_effort = "xhigh"' .codex/agents/developer.toml
check_agent_contract "test fixer uses Luna" 'model = "gpt-5.6-luna"' .codex/agents/test-fixer.toml
check_agent_contract "test fixer uses high" 'model_reasoning_effort = "high"' .codex/agents/test-fixer.toml
check_agent_contract "investigator stays Terra medium" 'model = "gpt-5.6-terra"' .codex/agents/issue-investigator.toml
check_agent_contract "investigator stays Terra medium" 'model_reasoning_effort = "medium"' .codex/agents/issue-investigator.toml
check_agent_contract "reviewer stays Terra high" 'model = "gpt-5.6-terra"' .codex/agents/reviewer.toml
check_agent_contract "reviewer stays Terra high" 'model_reasoning_effort = "high"' .codex/agents/reviewer.toml
check_agent_contract "content author stays Terra medium" 'model = "gpt-5.6-terra"' .codex/agents/content-author.toml
check_agent_contract "content author stays Terra medium" 'model_reasoning_effort = "medium"' .codex/agents/content-author.toml
check_agent_contract "normalizers stay Luna high" 'model = "gpt-5.6-luna"' .codex/agents/codex-review-normalizer.toml
check_agent_contract "normalizers stay Luna high" 'model_reasoning_effort = "high"' .codex/agents/codex-review-normalizer.toml
check_agent_contract "normalizers stay Luna high" 'model = "gpt-5.6-luna"' .codex/agents/claude-review-normalizer.toml
check_agent_contract "normalizers stay Luna high" 'model_reasoning_effort = "high"' .codex/agents/claude-review-normalizer.toml
check_agent_contract "runtime documents developer policy" '| `developer` | `gpt-5.6-luna` | `xhigh` |' "$RUNTIME"
check_agent_contract "runtime documents test fixer policy" '| `test-fixer` | `gpt-5.6-luna` | `high` |' "$RUNTIME"
check_agent_contract "runtime documents investigator policy" '| `issue-investigator` | `gpt-5.6-terra` | `medium` |' "$RUNTIME"
check_agent_contract "runtime documents reviewer policy" '| `reviewer` | `gpt-5.6-terra` | `high` |' "$RUNTIME"
check_agent_contract "runtime documents content author policy" '| `content-author` | `gpt-5.6-terra` | `medium` |' "$RUNTIME"
check_agent_contract "runtime documents normalizer policy" '| `codex-review-normalizer` / `claude-review-normalizer` | `gpt-5.6-luna` | `high` |' "$RUNTIME"
check_agent_contract "runtime documents Luna scope" 'Lunaは、方針・対象範囲・受け入れ条件が明確な実装と品質ゲート修正に限定する。' "$RUNTIME"
check_agent_contract "runtime documents Sol escalation" '`gpt-5.6-sol` / `high` へ昇格する。' "$RUNTIME"
check_agent_contract "guide documents developer policy" '`developer` は `gpt-5.6-luna` / `xhigh`' "$AGENT_GUIDE"
check_agent_contract "guide documents test fixer policy" '`test-fixer` は `gpt-5.6-luna` / `high`' "$AGENT_GUIDE"
check_agent_contract "guide documents Terra policies" '`issue-investigator` と `content-author` は `gpt-5.6-terra` / `medium`、`reviewer` は `gpt-5.6-terra` / `high`' "$AGENT_GUIDE"
check_agent_contract "guide documents normalizer policy" '`codex-review-normalizer` と `claude-review-normalizer` は `gpt-5.6-luna` / `high`' "$AGENT_GUIDE"
check_agent_contract "guide documents Luna scope" 'Lunaの適用範囲は、決定済みの方針・対象範囲・受け入れ条件に従う実装と、変更起因の品質ゲート失敗の最小修正に限る。' "$AGENT_GUIDE"
check_agent_contract "guide documents Sol escalation" '`gpt-5.6-sol` / `high` へ昇格する。' "$AGENT_GUIDE"

# ---- エージェント起動フェーズの整合 ----
check_agent_contract "reviewer runs in phase 5" 'issue-dev-orchestrate のレビュー段階で使用する' .ai/agents/reviewer.md
check_agent_contract "test fixer runs in phases 4 and 6" 'issue-dev-orchestrate のフェーズ4・6（品質ゲート）で使用する' .ai/agents/test-fixer.md
check_agent_contract "reviewer committed range" '`git diff develop...HEAD`' .ai/agents/reviewer.md

# ---- Issue #124: discovery / verification state-machine contracts ----
check_agent_contract "discovery is explicit" '`reviewStage: discovery`' "$SKILL"
check_agent_contract "discovery reads cumulative diff" '`develop...HEAD` の**全累積差分**' "$SKILL"
check_agent_contract "finding ID format" '`I<issue>-F<3桁連番>`' "$SKILL"
check_agent_contract "finding metadata" '期待解消状態、状態、修正コミット、検証結果' "$SKILL"
check_agent_contract "duplicate findings merge" '同一 `ファイル:行` かつ指摘内容が実質的に同じ場合' "$SKILL"
check_agent_contract "verification brief requirement" 'Finding台帳、修正要約、修正コミット範囲を必須ブリーフ' "$SKILL"
check_agent_contract "zero findings skip only fix work" 'Findingが0件なら修正・品質ゲート・周回コミットだけをskipし、verificationはskipしない' "$SKILL"
check_agent_contract "zero findings still verify the current HEAD" 'verification はFindingの有無にかかわらず、current HEADに対する' "$SKILL"
check_agent_contract "verification internal first" 'current HEAD が approve の場合だけ' "$SKILL"
check_agent_contract "required external path needs both approvals" '外部レビューが`required`なら別モデルCLI verificationを' "$SKILL"
check_agent_contract "non-required path stays distinct from approval" '`not-required-by-policy`ならcurrent HEADに対する有効な判定記録とinternal approve' "$SKILL"
check_agent_contract "verification permitted new finding classes" '修正起因回帰、明確な受け入れ条件未達、重大なsecurity/data destruction' "$SKILL"
check_agent_contract "orchestrator directly monitors CLI" '別モデルCLIはサブエージェントから起動しない' "$SKILL"
check_agent_contract "five minutes remains running" '5分で停止しない' "$SKILL"
check_agent_contract "ten-minute progress notification" '10分で進捗通知' "$SKILL"
check_agent_contract "twenty-minute single timeout" '20分で一度だけ終了して `timeout`' "$SKILL"
check_agent_contract "chunk union coverage" 'coveredCommitShas` と `coveredFiles` のunionが元差分を完全に覆い' "$SKILL"
check_agent_contract "cross-cutting review required" '`crossCuttingReview` が完了' "$SKILL"
check_agent_contract "common avoids raw-output persistence" 'raw stdout / stderr はファイル・ブリーフ・scratchpadへ永続化せず' "$COMMON"
check_agent_contract "common retains all egress scopes" '`committed-diff`、`brief-context`、`repository-reads`' "$COMMON"
check_agent_contract "common remains read-only" 'read-only' "$COMMON"
check_agent_contract "runtime assigns direct monitoring" 'オーケストレーターが直接担う' "$RUNTIME"
check_agent_contract "Claude CLI restricts allowed tools" '`--allowedTools "Read Grep Glob"`' "$RUNTIME"
check_agent_contract "Claude CLI restricts disallowed tools" '`--disallowedTools "Edit Write NotebookEdit Bash"`' "$RUNTIME"
check_agent_contract "Codex nested review requires read-only sandbox" '`-c sandbox_mode="read-only"` を必ず付ける' "$RUNTIME"
check_agent_contract "reviewer reports verification outcomes" '`resolved` / `partial` / `unresolved`' .ai/agents/reviewer.md
check_agent_contract "required findings must resolve before approval" 'required Finding（must-fix / should-fix）が全件`resolved`' "$COMMON"
check_agent_contract "zero findings still require a policy-valid path" 'Findingが0件の場合、required Finding全件resolvedは真だが' "$COMMON"
check_agent_contract "required boundary needs external approval" '`externalReviewDecision: required`: current HEADに対する別モデルCLIも正常に`approve`' "$COMMON"
check_agent_contract "policy skip is not external approval" '`not-required-by-policy`は外部`approve`ではない' "$COMMON"
check_agent_contract "standard budgets do not stop autonomous continuation" '到達だけでは自律的な継続を止めず、継続確認も求めない' "$SKILL"
check_agent_contract "current-loop findings continue within existing issue scope" 'current issueの既存`acceptanceCriteria`と`inScopeFiles`内で、verificationが許すcurrent-loop Finding' "$SKILL"
check_agent_contract "scope expansion is the only stop trigger" '停止してユーザー判断を求めるのは重大なスコープ変更が必要な場合だけ' "$SKILL"
check_absent_contract "legacy standard-budget stop policy stays removed" '到達したら自律的な継続を止め、状況・残課題・継続の選択肢を報告して判断を仰ぐ' "$SKILL"
check_agent_contract "claude wrapper remains required" '.ai/scripts/run-claude-review.sh' .ai/agents/claude-review-normalizer.md

# ---- 実装担当・認証・risk-based external review ----
check_agent_contract "review policy defaults to always" 'ユーザー指定がなければ`always`' "$SKILL"
check_agent_contract "never requires explicit user choice" '`never`はユーザーが明示した場合だけ選べる' "$SKILL"
check_agent_contract "risk-based runs internal discovery first" '`risk-based`ではinternal discoveryを先に実行し' "$SKILL"
check_agent_contract "risk decision is bound to current head" '`decisionHead`がcurrent HEADと一致しなければ無効' "$COMMON"
check_agent_contract "risk uncertainty requires external review" '`ER-9 uncertain-classification`' "$COMMON"
check_agent_contract "low risk is narrowly defined" '`LR-1 non-executable-only`' "$COMMON"
check_agent_contract "external continuity requires verification" '`ER-8 external-continuity`' "$COMMON"
check_agent_contract "failed required review cannot be downgraded" 'オーケストレーター判断で`not-required-by-policy`へ変更してはならない' "$COMMON"
check_agent_contract "risk based defers auth preflight" '`risk-based`は`externalReviewDecision: required`となった時点' "$RUNTIME"
check_agent_contract "login requires confirmed unauthenticated status" 'Sandbox外の同じ状態確認でも未認証と確認できた場合だけ' "$RUNTIME"
check_agent_contract "auth readiness is reused within a run" '`authReady: true`だけを`<scratchpad>/review-mode-<N>.md`へ記録し、同一スキル実行中は再利用' "$RUNTIME"
check_agent_contract "authentication and egress approvals stay separate" 'コマンド実行承認、CLIログイン、private内容の外部送信同意は別の判断' "$RUNTIME"
check_agent_contract "egress consent can be reused in scope" '同一スキル実行のverificationでは' "$COMMON"
check_agent_contract "egress scope expansion requires fresh consent" '承認済み範囲外の内容や新しい機密カテゴリを送る' "$COMMON"

# ---- Issue #131: develop -> main release PR skill contracts ----
RELEASE_MAIN_PR_SKILL=.ai/skills/release-main-pr/SKILL.md

if [ "$(readlink .claude/skills/release-main-pr)" != '../../.ai/skills/release-main-pr' ] ||
  [ "$(readlink .agents/skills/release-main-pr)" != '../../.ai/skills/release-main-pr' ]; then
  printf '%s\n' 'release-main-pr discovery links are invalid' >&2
  exit 1
fi

check_agent_contract "release skill requires GitHub auth" '`gh auth status`' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill verifies default branch through repository metadata" '`gh repo view --json nameWithOwner,defaultBranchRef`' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill requires main as the default branch" 'default branchが`main`であることを確認する' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill stops PR creation for a non-main default branch" '期待値と実際の値を報告してPR作成を停止する' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill stops before keywords for a non-main default branch" 'closing keywordを含むPRは作成しない' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill requires a clean worktree" '`git status --short`が空' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill logs its explicit start command" '`./.ai/hooks/log-skill-usage.sh --runtime codex --skill release-main-pr --status started`' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill logs its explicit completion command" '`./.ai/hooks/log-skill-usage.sh --runtime codex --skill release-main-pr --status completed`' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill fetches remote release refs" '`git fetch origin main develop`' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill stops on fetch failure" '失敗したらエラーを報告して停止し、キャッシュ済みのremote-tracking refを使わない' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill checks duplicate PRs" '`base=main`かつ`head=develop`のopen PR' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill rejects an empty remote diff" '`origin/main..origin/develop`が空でない' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill distinguishes diff exit codes" '終了コード0なら差分なしとして停止、1なら差分ありとして続行、0と1以外なら検証エラーを報告して停止する' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill does not mask diff errors" '終了コードを`|| true`などで握りつぶさない' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill reconstructs remote release range" '`origin/main...origin/develop`' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill only accepts exact refs candidates" '正確な`refs #N`トークン' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill resolves candidate types through the REST Issue endpoint" 'GitHub REST Issue endpointの`gh api "repos/<nameWithOwner>/issues/<番号>"`応答' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill rejects PR resources as close candidates" '`pull_request`フィールドがあれば、その番号はPRリソースでありIssueではない' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill routes PR resources to no-keyword candidates" 'closing keywordなしの要確認候補へ「PRリソースのため」と記載する' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill requires every close proof" '全条件を満たすIssueだけを自動close対象にする' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill separates uncertain candidates" '## 要確認候補（closing keywordなし）' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill states empty close state" '<対象がなければ「なし」>' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill states empty uncertain state" '<候補がなければ「なし」>' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill scans the full generated body for every closing keyword family" '本文生成後は本文全文を対象に、大文字小文字を区別せず、`close`、`closes`、`closed`、`fix`、`fixes`、`fixed`、`resolve`、`resolves`、`resolved`と任意のコロンに続く同一または別リポジトリのIssue参照をすべてトークン単位で抽出する' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill validates every closing token against the approved set" '抽出結果が自動close対象の番号集合と完全一致し、重複がなく、すべて自動close欄の規定書式に由来することを確認する' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill requires fresh approval after closing token mismatch" '本文と候補判定を作り直して全文を再提示し、新しい承認を得る' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill requires pre-create approval" '明示的なユーザー承認を得る。承認前はPRを作成しない。' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill revalidates immediately after approval" '承認後かつ一時ファイル作成前に、`git fetch origin main develop`、remote refのSHA、差分有無、重複PR、含まれるPR、Issue候補、自動close対象、生成本文を同じ規則で再検証する' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill invalidates stale approval" '以前の承認を無効にし、タイトル、本文、候補判定を再生成して全文を再提示し、新しい明示的承認を得る' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill uses a portable final-suffix mktemp template" '`body_file=$(mktemp "${TMPDIR:-/tmp}/release-main-pr.XXXXXX")`' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill writes approved body through a non-shell file operation" '現在のランタイムのパッチ編集またはファイル書き込み機能を使い、承認済み本文全文をリテラルデータとしてそのパスへ書く。' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill forbids shell expansion while writing approved body" 'shellのheredoc、`echo`、`printf`、リダイレクトで本文を書かない。' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill verifies the approved body byte-for-byte" '書き込み後にファイルを読み、承認済み本文と完全一致することを確認する。' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill cleans up after body write failure" '本文の書き込みに失敗した場合は、返された正確な一時パスを削除して停止する。' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill cleans up after body mismatch" '不一致ならPRを作成せず、返された正確な一時パスを削除して停止する。' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill cleans up its PR body file" '`trap '\''rm -f "$body_file"'\'' EXIT`' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill creates PR with explicit non-interactive inputs" '`gh pr create --base main --head develop --title "chore: merge develop into main" --body-file "$body_file"`' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill keeps cleanup and PR creation in one shell invocation" '`trap '\''rm -f "$body_file"'\'' EXIT`の登録と`gh pr create --base main --head develop --title "chore: merge develop into main" --body-file "$body_file"`を一つのshell invocation内でこの順に非対話実行する。' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill checks post-create mergeability" '`gh pr view <PR番号> --json mergeable,mergeStateStatus,statusCheckRollup`でmergeable状態をポーリングする' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill waits for a resolved mergeable state" '`UNKNOWN`の間は完了扱いせず再確認し、`CONFLICTING`なら状態を報告して人間の判断を待つ' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill identifies required checks separately" '`gh pr checks <PR番号> --required`でrequired checkを別に特定する' "$RELEASE_MAIN_PR_SKILL"
check_agent_contract "release skill only completes after required checks succeed" 'required checkが存在し、すべて成功した場合だけ完了扱いにする' "$RELEASE_MAIN_PR_SKILL"

release_summary_section=$(extract_section "$RELEASE_MAIN_PR_SKILL" '## 概要' '## 含まれるPR')
release_pr_section=$(extract_section "$RELEASE_MAIN_PR_SKILL" '## 含まれるPR' '## mainマージ時に自動closeするIssue')
release_auto_close_section=$(extract_section "$RELEASE_MAIN_PR_SKILL" '## mainマージ時に自動closeするIssue' '## 要確認候補（closing keywordなし）')
release_uncertain_section=$(extract_section "$RELEASE_MAIN_PR_SKILL" '## 要確認候補（closing keywordなし）' '## 確認結果')
release_prohibited_section=$(extract_section "$RELEASE_MAIN_PR_SKILL" '## 禁止操作' '## 完了報告')

check_section_contract "release skill places closing keywords in auto-close list" "$release_auto_close_section" 'Closes #<Issue番号>'
extract_closing_issue_refs() {
  awk '
    {
      line = tolower($0)
      if (match(line, /(^|[^[:alnum:]_])(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)[[:space:]]*:?[[:space:]]+/)) {
        remainder = substr(line, RSTART + RLENGTH)
        while (match(remainder, /([[:alnum:]_.-]+\/[[:alnum:]_.-]+)?#([0-9]+|<issue番号>)/)) {
          print substr(remainder, RSTART, RLENGTH)
          remainder = substr(remainder, RSTART + RLENGTH)
        }
      }
    }
  '
}

release_all_closing_refs=$(extract_closing_issue_refs < "$RELEASE_MAIN_PR_SKILL")
release_auto_close_refs=$(printf '%s\n' "$release_auto_close_section" | extract_closing_issue_refs)
if [ "$release_all_closing_refs" != '#<issue番号>' ] ||
  [ "$release_auto_close_refs" != '#<issue番号>' ]; then
  printf '%s\n' 'release skill closing references must appear exactly once and only in the auto-close list' >&2
  exit 1
fi

release_closing_fixture_refs=$(
  printf '%s\n' \
    'CLOSE: #1, #10' \
    'ClOsEs #2' \
    'closed: #3' \
    'FIX #4' \
    'Fixes: #5' \
    'fixed #6' \
    'RESOLVE: #7' \
    'Resolves #8' \
    'resolved: Owner.Name/Repo-Name#9' |
    extract_closing_issue_refs
)
release_closing_fixture_expected=$(printf '%s\n' '#1' '#10' '#2' '#3' '#4' '#5' '#6' '#7' '#8' 'owner.name/repo-name#9')
if [ "$release_closing_fixture_refs" != "$release_closing_fixture_expected" ]; then
  printf '%s\n' 'release skill closing reference extractor missed a keyword variant or same-line reference' >&2
  exit 1
fi
check_section_contract "release skill prohibition forbids PR merging" "$release_prohibited_section" '`gh pr merge`、`gh issue close`、auto-mergeの有効化、リポジトリ設定の変更、関係ない変更の`git commit`・`git push`を実行しない。'
check_section_contract "release skill prohibition leaves duplicate PRs unchanged" "$release_prohibited_section" '重複PRがあるときも、そのPRを変更・マージしない。'

# ---- Issue #128: 通常Issueのマージ後照合 ----
WEEKLY_RETRO_PROMPT=.ai/automations/weekly-retro-refine/prompt.md
WEEKLY_RETRO_RENDERER=.ai/automations/weekly-retro-refine/scripts/render-report.mjs
WEEKLY_RETRO_SAMPLE=.ai/automations/weekly-retro-refine/references/report-data.example.json
WEEKLY_RETRO_TEMPLATE=.ai/automations/weekly-retro-refine/assets/report-template.html
WEEKLY_RETRO_OUTPUT="$log_dir/weekly-retro.html"
WEEKLY_RETRO_NUMBER_FALLBACK_INPUT="$log_dir/weekly-retro-number-fallback.json"
WEEKLY_RETRO_NUMBER_FALLBACK_OUTPUT="$log_dir/weekly-retro-number-fallback.html"

check_agent_contract "ordinary issue reconciliation uses exact refs" '正確な `refs #<N>`' "$WEEKLY_RETRO_PROMPT"
check_agent_contract "ordinary issue reconciliation excludes arbitrary references" '任意のIssue番号言及、参考リンク、推測から対象や親子関係を作らない' "$WEEKLY_RETRO_PROMPT"
check_agent_contract "ordinary issue reconciliation has close candidate classification" '`close候補`' "$WEEKLY_RETRO_PROMPT"
check_agent_contract "ordinary issue reconciliation has remaining conditions classification" '`残条件あり`' "$WEEKLY_RETRO_PROMPT"
check_agent_contract "ordinary issue reconciliation has transferred classification" '`別Issueへ移管済み`' "$WEEKLY_RETRO_PROMPT"
check_agent_contract "ordinary issue reconciliation preserves human close decision" 'Issueは自動closeせず、人間が最終判断する' "$WEEKLY_RETRO_PROMPT"
check_agent_contract "ordinary issue reconciliation excludes phase and spike issues" 'スパイクまたはフェーズ分割の状態照合で扱うIssueは通常Issueから除外する' "$WEEKLY_RETRO_PROMPT"
check_agent_contract "ordinary issue reconciliation records uncertain scope as a limitation" '通常Issueか判定できない場合は `meta.limitations` に記録し、`normalIssueReconciliation` へ入れず推測で分類しない' "$WEEKLY_RETRO_PROMPT"
check_agent_contract "ordinary issue reconciliation uses null for missing transfer" '`transfer` では `null`' "$WEEKLY_RETRO_PROMPT"
check_agent_contract "renderer includes ordinary issue reconciliation" 'NORMAL_ISSUE_RECONCILIATION' "$WEEKLY_RETRO_RENDERER"

node "$WEEKLY_RETRO_RENDERER" --input "$WEEKLY_RETRO_SAMPLE" --output "$WEEKLY_RETRO_OUTPUT" >/dev/null
for placeholder in $(grep -oE '\{\{[A-Z_]+\}\}' "$WEEKLY_RETRO_TEMPLATE" | sort -u); do
  check_absent_contract "weekly retro resolves $placeholder" "$placeholder" "$WEEKLY_RETRO_OUTPUT"
done
check_agent_contract "weekly retro renders close candidate" 'close候補' "$WEEKLY_RETRO_OUTPUT"
check_agent_contract "weekly retro renders remaining conditions" '残条件あり' "$WEEKLY_RETRO_OUTPUT"
check_agent_contract "weekly retro renders transfer" '別Issueへ移管済み' "$WEEKLY_RETRO_OUTPUT"
check_agent_contract "weekly retro renders exact refs evidence" 'refs #114' "$WEEKLY_RETRO_OUTPUT"
check_agent_contract "weekly retro renders merge destination" 'merge先: develop' "$WEEKLY_RETRO_OUTPUT"
check_agent_contract "weekly retro renders close candidate status badge" '<span class="status good">close候補</span>' "$WEEKLY_RETRO_OUTPUT"
check_agent_contract "weekly retro renders remaining conditions status badge" '<span class="status warn">残条件あり</span>' "$WEEKLY_RETRO_OUTPUT"
check_agent_contract "weekly retro renders transferred status badge" '<span class="status info">別Issueへ移管済み</span>' "$WEEKLY_RETRO_OUTPUT"
check_agent_contract "weekly retro renders transfer issue reference" '<dt>移管先</dt><dd>#118 <a href="https://github.com/example/tech-study-lab/issues/118">運用手順の自動化を実装する</a> — 運用手順を自動化する</dd>' "$WEEKLY_RETRO_OUTPUT"
check_agent_contract "weekly retro renders parent tracker issue reference" '<li>#115 <a href="https://github.com/example/tech-study-lab/issues/115">削除操作の品質tracker</a> (GitHub sub-issue) — 子Issue: close候補</li>' "$WEEKLY_RETRO_OUTPUT"
check_agent_contract "weekly retro renders human next action" '人間がcloseを判断' "$WEEKLY_RETRO_OUTPUT"

jq '
  .normalIssueReconciliation[2].transfer |= {
    number: .number,
    unmetCriteria: .unmetCriteria
  }
  | .normalIssueReconciliation[0].parentTrackers[0] |= {
    number: .number,
    relation: .relation,
    childClassification: .childClassification
  }
' "$WEEKLY_RETRO_SAMPLE" > "$WEEKLY_RETRO_NUMBER_FALLBACK_INPUT"
node "$WEEKLY_RETRO_RENDERER" --input "$WEEKLY_RETRO_NUMBER_FALLBACK_INPUT" --output "$WEEKLY_RETRO_NUMBER_FALLBACK_OUTPUT" >/dev/null
check_agent_contract "weekly retro renders transfer number without title or URL" '<dt>移管先</dt><dd>#118 移管先Issue — 運用手順を自動化する</dd>' "$WEEKLY_RETRO_NUMBER_FALLBACK_OUTPUT"
check_agent_contract "weekly retro renders parent tracker number without title or URL" '<li>#115 親tracker (GitHub sub-issue) — 子Issue: close候補</li>' "$WEEKLY_RETRO_NUMBER_FALLBACK_OUTPUT"

node scripts/test-review-state-machine.mjs

printf '%s\n' "Agent contract checks passed!"
