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
node scripts/test-review-state-machine.mjs

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
EVALS=.ai/skills/issue-dev-orchestrate/evals/evals.json

jq -e '
  .contractEvals | type == "array"
  and (map(.id) | index("staged-review-initial-coverage"))
  and (map(.id) | index("external-incremental-requires-actual-boundary"))
  and (map(.id) | index("fallback-does-not-create-external-coverage"))
  and (map(.id) | index("external-normal-results-create-coverage"))
  and (map(.id) | index("external-review-stage-validation"))
  and (map(.id) | index("cumulative-split-union-coverage"))
  and (map(.id) | index("review-state-machine-transition-table"))
  and (map(.id) | index("fallback-route-independent-boundary"))
  and (map(.id) | index("reviewer-fallback-stage-range-validation"))
  and (map(.id) | index("silent-live-cli-wait-policy"))
  and (map(.id) | index("timeout-metadata-redaction"))
  and any(.[]; .id == "external-review-stage-validation" and (.expected | contains("logical/effective base")))
  and any(.[]; .id == "external-review-stage-validation" and (.expected | contains("normalized SHA range")))
  and any(.[]; .id == "cumulative-split-union-coverage" and (.expected | contains("cross-cutting review")))
  and any(.[]; .id == "cumulative-split-union-coverage" and (.expected | contains("do not update the external boundary")))
  and any(.[]; .id == "review-state-machine-transition-table" and (.action | contains("test-review-state-machine.mjs")))
  and any(.[]; .id == "fallback-route-independent-boundary" and (.expected | contains("Never use the external boundary")))
  and any(.[]; .id == "reviewer-fallback-stage-range-validation" and (.expected | contains("brief-mismatched fallback incremental range")))
' "$EVALS" >/dev/null || {
  printf '%s\n' 'staged review eval contract is incomplete' >&2
  exit 1
}

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
check_agent_contract "out-of-scope candidates do not block approve" '「別issue候補（範囲外）」のみ' "$COMMON"
check_agent_contract "confirmation items do not block approve" '「別issue候補（範囲外）」と確認事項は、approve / request-changes の判定件数に含めない' "$COMMON"
legacy_zero_finding_ban=$(printf '%s%s' 'レビューの失敗・未取得・指摘ゼロ' 'を approve として扱わない')
check_absent_contract "no blanket ban on zero findings" "$legacy_zero_finding_ban" "$SKILL"
# フォールバックの2件目 reviewer は既定が accuracy-first のため、明示しないと観点が揃う。
check_agent_contract "fallback reviewer gets spec profile" '`reviewProfile: spec-compliance-first` をブリーフで明示する' "$SKILL"
check_agent_contract "consent-blocked result does not enter fallback" '`external-egress-confirmation-required` を返した場合は**レビュー未取得fallbackへ進めない**' "$SKILL"
check_agent_contract "consent-blocked result reports missing scope" '同意記録に不足している同意項目を具体的に報告し' "$SKILL"
check_agent_contract "consent-blocked result requires fresh confirmation" '必要な外部送信の明示同意を取得・記録するまで、別モデルレビュアーの再実行も2件目の `reviewer` の起動も行わない' "$SKILL"
check_agent_contract "green check is not review" 'ステータスチェックが緑でも、レビュー済みの根拠にしない' "$SKILL"
check_agent_contract "no guessing review range" 'レビュー範囲を推測で決めない' "$SKILL"
check_agent_contract "no cherry-picking findings" 'オーケストレーターの判断で取捨選択しない' "$SKILL"
check_agent_contract "reviewed head only after real review" '別モデルCLIが `approve` / `request-changes` で正常完了した current HEAD のみを更新する' "$SKILL"
check_agent_contract "profiles must differ" 'レビュープロファイルを必ず分ける' "$SKILL"
check_agent_contract "internal review precedes spec review" 'internal lane が current HEAD まで収束する前に、外部または fallback の仕様準拠レビューを開始してはならない' "$SKILL"
check_agent_contract "initial internal coverage is cumulative" 'internal-initial-cumulative' "$SKILL"
check_agent_contract "initial external coverage is cumulative" 'external-initial-cumulative' "$SKILL"
check_agent_contract "general brief declares review stage" '`reviewStage`: `internal-initial-cumulative` など' "$SKILL"
check_agent_contract "missing external boundary cannot become incremental" 'fallback の実績や `last-spec-review-*` から外部境界を推測して増分にしてはならない' "$SKILL"
check_agent_contract "external incremental requires actual external boundary" 'external-incremental' "$SKILL"
check_agent_contract "non-ancestor external boundary stops incremental review" 'incremental review を拒否して停止・報告する' "$SKILL"
check_agent_contract "fallback starts cumulatively without external coverage" 'fallback-cumulative' "$SKILL"
check_agent_contract "fallback increment is route-scoped" 'fallback-incremental' "$SKILL"
check_agent_contract "fallback range is route independent" 'routeに関係なく `fallback-incremental` としてそのspec boundary `...HEAD` をレビューする' "$SKILL"
check_agent_contract "fallback rejects invalid spec boundary" 'spec boundary が解決不能または祖先でなければ、範囲を推測せず `error` として停止・報告する' "$SKILL"
check_agent_contract "fallback ignores external boundary for range" '実外部境界の有無は fallback range の選択に使わず' "$SKILL"
check_agent_contract "external brief records stage and coverage" '`reviewStage` / `logicalBase` / `externalCoverage`' "$SKILL"
check_agent_contract "split cumulative review lists chunk coverage" '各chunkの commit SHA と file集合をブリーフに列挙し' "$SKILL"
check_agent_contract "split cumulative review finishes cross-cutting" '最後に cross-cutting review を行う' "$SKILL"
check_agent_contract "unresolved split coverage is error" '欠落または説明できない重複があれば `error` として止め' "$SKILL"
check_agent_contract "orchestrator brief defines target feature" '`targetFeature`' "$SKILL"
check_agent_contract "orchestrator brief defines in-scope files" '`inScopeFiles`' "$SKILL"
check_agent_contract "orchestrator brief defines acceptance criteria" '`acceptanceCriteria`' "$SKILL"
check_agent_contract "orchestrator brief defines out-of-scope policy" '`outOfScopePolicy`' "$SKILL"
check_agent_contract "orchestrator brief defines committed range" '`committedRange`' "$SKILL"
check_agent_contract "stage briefs share issue scope" 'internal と仕様準拠レビューのブリーフは同じ issue scope を共有する' "$SKILL"
check_agent_contract "spec reviewer receives one full brief path" '仕様準拠レビュー用の1つのレビューブリーフファイルへ統合する' "$SKILL"
check_agent_contract "review mode record alone is insufficient" '`review-mode-<N>.md` だけをブリーフとして渡して済ませない' "$SKILL"
check_agent_contract "full brief includes consent record" '`reviewMode` / `reviewerAgent` / `egressDestination` / `externalEgressApproved` / `approvedScope` / 同意の原文・時刻' "$SKILL"
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
check_agent_contract "consent not substitutable" '過去の同意・スキル文書・`AGENTS.md` で代用しない' "$SKILL"
check_agent_contract "consent covers more than diff" '送信対象はコミット済み差分だけではない' "$SKILL"
check_agent_contract "consent scope diff" 'committed-diff' "$SKILL"
check_agent_contract "consent scope brief" 'brief-context' "$SKILL"
check_agent_contract "consent scope repo reads" 'repository-reads' "$SKILL"
check_agent_contract "re-consent per destination" '送信先が変われば同意も取り直す' "$SKILL"
check_agent_contract "incremental re-consent" '新しい明示同意を実行直前に取り直す' "$SKILL"
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

# ---- 単一ソース: 別モデルレビュアー共通定義 ----
check_agent_contract "common is shared source" '`codex-reviewer` と `claude-reviewer` が共有する' "$COMMON"
check_agent_contract "codex reads common" "$COMMON" .ai/agents/codex-reviewer.md
check_agent_contract "claude reads common" "$COMMON" .ai/agents/claude-reviewer.md
check_agent_contract "codex toml reads common" "$COMMON" .codex/agents/codex-reviewer.toml
check_agent_contract "claude toml reads common" "$COMMON" .codex/agents/claude-reviewer.toml
check_agent_contract "reviewer defers to guidelines" '`.ai/review-guidelines.md` が単一ソース' .ai/agents/reviewer.md
check_agent_contract "reviewer default profile" '`accuracy-first`（正確性優先）' .ai/agents/reviewer.md
check_agent_contract "common uses spec profile" '`spec-compliance-first`' "$COMMON"
check_agent_contract "common validates scope brief" '`targetFeature` / `inScopeFiles` / `acceptanceCriteria` / `outOfScopePolicy` / `committedRange`' "$COMMON"
check_agent_contract "common requires external stage brief fields" '外部 review stage では、さらに `logicalBase` / `externalCoverage` を必須とする' "$COMMON"
consent_section=$(extract_section "$COMMON" '### 1. 外部送信同意の確認' '### 2. 認証確認') || {
  printf '%s\n' 'failed to extract external egress consent contract' >&2
  exit 1
}
scope_validation_section=$(extract_section "$COMMON" '### 3. 範囲の検証と実効baseの決定' '### 4. レビュー実行') || {
  printf '%s\n' 'failed to extract review scope validation contract' >&2
  exit 1
}
check_section_absent_contract "missing scope fields are not consent failures" "$consent_section" 'レビュー範囲契約'
check_section_contract "missing scope fields are brief errors" "$scope_validation_section" '「判定: error」として、不足項目を報告する'
check_section_contract "committed range is a brief field" "$scope_validation_section" '`committedRange`'
check_agent_contract "common outputs out-of-scope section" '### 別issue候補（範囲外）' "$COMMON"
check_agent_contract "common excludes out-of-scope candidates from verdict" 'approve / request-changes の判定件数に含めない' "$COMMON"
check_agent_contract "internal reviewer validates staged scope brief" '`targetFeature` / `inScopeFiles` / `acceptanceCriteria` / `outOfScopePolicy` / `reviewStage` / `committedRange`' .ai/agents/reviewer.md
check_agent_contract "internal reviewer outputs out-of-scope section" '### 別issue候補（範囲外）' .ai/agents/reviewer.md
check_agent_contract "claude prompt includes scope classification" '範囲外の妥当な問題を「別issue候補（範囲外）」へ' .ai/agents/claude-reviewer.md
check_agent_contract "claude reads the full reviewer brief" '同じレビューブリーフファイルを `Read` で読み' .ai/agents/claude-reviewer.md
check_agent_contract "claude validates the full consent record" '`reviewMode` / `reviewerAgent` / `egressDestination` / `externalEgressApproved` / `approvedScope` / 同意の原文・時刻' .ai/agents/claude-reviewer.md
check_agent_contract "codex wrapper validates scope brief" '`targetFeature` / `inScopeFiles` / `acceptanceCriteria` / `outOfScopePolicy` / `committedRange`' .ai/agents/codex-reviewer.md
check_agent_contract "codex TOML validates scope brief" '`targetFeature` / `inScopeFiles` / `acceptanceCriteria` / `outOfScopePolicy` / `committedRange`' .codex/agents/codex-reviewer.toml

# ---- 不変条件: レビュアー側の安全則 ----
check_agent_contract "common rejects diff-only consent" '差分だけの同意で実行してはならない' "$COMMON"
check_agent_contract "common verifies scope" 'approvedScope' "$COMMON"
check_agent_contract "common verifies destination" 'egressDestination' "$COMMON"
check_agent_contract "common rejects wrong host" 'wrong-host-agent' "$COMMON"
check_agent_contract "common never approves on failure" '「指摘ゼロ＝approve」と誤って報告してはならない' "$COMMON"
check_agent_contract "common delegates recognized CLI auth failures" '各 CLI のエージェント定義で認識された認証失敗' "$COMMON"
check_agent_contract "common requires actual execution before CLI auth classification" '**実際のレビューコマンドが実行された後**' "$COMMON"
check_agent_contract "common keeps consent before CLI auth classification" 'この分類のためにレビューコマンドを実行してはならない' "$COMMON"
check_agent_contract "common defers auth classification to CLI contract" '各 CLI のエージェント定義に従う' "$COMMON"
check_agent_contract "common auth not literal match" '未認証の判定を特定の文言の一致に依存しない' "$COMMON"
check_agent_contract "common committed only" 'レビュー対象はコミット済み差分だけに限定する' "$COMMON"
check_agent_contract "common no temp files" '一時ファイルも作らない' "$COMMON"
check_agent_contract "common three-dot base" 'git merge-base <logicalBase> HEAD' "$COMMON"
check_agent_contract "common records both bases" '論理baseと実効base（SHA）' "$COMMON"
check_agent_contract "initial external stage uses develop logical base" '`external-initial-cumulative` は `externalCoverage: none`、`logicalBase: develop`' "$COMMON"
check_agent_contract "incremental external stage requires verified boundary" '`git merge-base --is-ancestor <previousExternalReviewedHead> HEAD`' "$COMMON"
check_agent_contract "incremental effective base equals external boundary" '求めた実効base が `previousExternalReviewedHead` と一致し、' "$COMMON"
check_agent_contract "external brief range uses normalized SHAs" '`committedRange` は正規化済みSHA範囲 `<effective-base>...<current-head>` と完全一致' "$COMMON"
check_agent_contract "initial normalized range verifies develop equivalence" '`git diff develop...HEAD` と等価であることを確認する' "$COMMON"
check_agent_contract "incremental normalized range starts at external boundary" '`committedRange` が `<previousExternalReviewedHead>...<current-head>`' "$COMMON"
check_agent_contract "common validates split union coverage" '`cumulativeSplit`' "$COMMON"
check_agent_contract "common requires split cross-cutting review" '`crossCuttingReview` を完了するまで' "$COMMON"
check_agent_contract "common rejects unresolved split overlap" '理由を確定できない重複、欠落、不整合があれば「判定: error」' "$COMMON"
check_agent_contract "silent live process remains running" 'セッションが生存中で標準出力が無い状態は `running`' "$COMMON"
check_agent_contract "review wait limit is ten minutes" '既定の待機上限はレビュー1回につき10分' "$COMMON"
check_agent_contract "timeout is unavailable" '「判定: timeout」としてレビュー unavailable を報告する' "$COMMON"
check_agent_contract "timeout metadata identifies interruption" '`interruptionSource: timeout`' "$COMMON"
check_agent_contract "raw output is not persisted" 'raw stdout / stderr をファイル・ブリーフ・scratchpad に永続化しない' "$COMMON"
check_agent_contract "codex passes effective base" '<effective-base>' .ai/agents/codex-reviewer.md
check_agent_contract "codex brief read pins UTF-8" 'read_text(encoding="utf-8")' .ai/agents/codex-reviewer.md
check_agent_contract "codex stops on brief decode failure" 'UTF-8 デコードに失敗した場合はレビューを実行せず' .ai/agents/codex-reviewer.md
check_agent_contract "claude passes effective base" '<effective-base>' .ai/agents/claude-reviewer.md
check_agent_contract "codex read-only sandbox" 'sandbox_mode="read-only"' .ai/agents/codex-reviewer.md
check_agent_contract "codex rejects prompt arg" '位置引数の `PROMPT`（`-` による stdin 入力を含む）は渡さない' .ai/agents/codex-reviewer.md
check_agent_contract "claude restricts tools" '`--allowedTools` と `--disallowedTools` を必ず両方指定する' .ai/agents/claude-reviewer.md
check_agent_contract "codex host guard" '**Codex ホストで使ってはならない**' .ai/agents/codex-reviewer.md
check_agent_contract "claude host guard" '**Claude Code ホストで使ってはならない**' .ai/agents/claude-reviewer.md
check_agent_contract "claude reviewer is execution and normalization wrapper" 'Claude CLI の実行と結果の正規化を担うラッパー' .ai/agents/claude-reviewer.md
check_agent_contract "claude reviewer uses independent opus command" '`claude -p --model opus`' .ai/agents/claude-reviewer.md
check_agent_contract "claude uses host-stored credentials automatically" '認証情報を自動的に利用する' .ai/agents/claude-reviewer.md
check_agent_contract "claude uses host-stored credentials without exposing them" '資格情報・トークン・認証キャッシュを読み取り、コピーし、またはブリーフ・コマンド・ログに埋め込んではならない' .ai/agents/claude-reviewer.md
check_agent_contract "claude auth status is preflight only" '`claude auth status` は preflight に限る' .ai/agents/claude-reviewer.md
check_agent_contract "claude preflight does not decide auth required" 'preflight だけで `auth-required` と確定せず' .ai/agents/claude-reviewer.md
check_agent_contract "claude execution proves authentication and communication" '実際の `claude -p` の正常完了だけを認証と通信が成功した最終的な証拠として扱う' .ai/agents/claude-reviewer.md
check_agent_contract "claude recognized expired or revoked OAuth maps to auth required" 'HTTP `401` と、OAuth 認証情報が expired または revoked である意味が明確に含まれる場合だけ、「判定: auth-required」' .ai/agents/claude-reviewer.md
check_agent_contract "claude auth remediation is explicit" '`claude auth login` を案内する' .ai/agents/claude-reviewer.md
check_agent_contract "claude ambiguous 401 remains error" '文脈が曖昧な一般的な `401` は `auth-required` にせず' .ai/agents/claude-reviewer.md
check_agent_contract "claude local execution requires unavailable outside sandbox confirmation" 'その必要な確認を実行できない、または承認されなかった場合だけ「判定: local-execution-required」' .ai/agents/claude-reviewer.md
check_agent_contract "claude does not send private diff before consent" '不足時はレビューコマンドを実行しない' .ai/agents/claude-reviewer.md
check_agent_contract "claude auth uses Keychain wrapper" '.ai/scripts/run-claude-review.sh auth status' .ai/agents/claude-reviewer.md
check_agent_contract "claude review uses Keychain wrapper" 'git diff <effective-base>...HEAD | .ai/scripts/run-claude-review.sh -p' .ai/agents/claude-reviewer.md
check_agent_contract "claude keeps text output" '--output-format text' .ai/agents/claude-reviewer.md
check_agent_contract "Claude review wrapper loads Keychain secret" '. "$script_dir/load-secrets.sh"' .ai/scripts/run-claude-review.sh
check_agent_contract "Claude review wrapper forwards arguments without interpolation" 'exec claude "$@"' .ai/scripts/run-claude-review.sh
check_agent_contract "runtime requires Claude review wrapper" '`.ai/scripts/run-claude-review.sh` を使う' "$RUNTIME"
check_absent_contract "common does not duplicate Claude OAuth classification" 'OAuth 認証情報が expired または revoked' "$COMMON"
check_absent_contract "common does not classify preflight as auth required" 'Sandbox 外でも未認証なら、レビューを実行せず「判定: auth-required」を返す' "$COMMON"

# ---- モデル方針（実地検証で確定した事実） ----
check_agent_contract "model policy section exists" '## 別モデルCLIレビューのモデル方針' "$RUNTIME"
check_agent_contract "agent-self policy is separate" '## Codexサブエージェント本体のモデル方針' "$RUNTIME"
check_agent_contract "model must be explicit" 'モデルは必ず `-m` / `--model` で明示指定する' "$RUNTIME"
check_agent_contract "plain gpt-5.6 rejected" '素の `gpt-5.6` は使えない' "$RUNTIME"
check_agent_contract "codex sandbox default documented" '既定 Sandbox は `workspace-write`' "$RUNTIME"
check_agent_contract "codex nested model" '`-m gpt-5.6-sol`' "$RUNTIME"
check_agent_contract "claude nested model" '`--model opus`' "$RUNTIME"
check_agent_contract "host to reviewer mapping" '| Claude Code | `codex-reviewer` |' "$RUNTIME"
check_agent_contract "codex host uses claude reviewer" '| Codex（App / CLI） | `claude-reviewer` |' "$RUNTIME"
check_agent_contract "codex toml pins variant" '`-m gpt-5.6-sol`' .codex/agents/codex-reviewer.toml
check_agent_contract "codex toml pins sandbox" 'sandbox_mode="read-only"' .codex/agents/codex-reviewer.toml
check_agent_contract "codex toml effort" 'model_reasoning_effort = "high"' .codex/agents/codex-reviewer.toml
check_agent_contract "claude toml effort" 'model_reasoning_effort = "high"' .codex/agents/claude-reviewer.toml
check_agent_contract "communication is not authentication" '通信失敗を未認証と報告しない' "$RUNTIME"

# ---- エージェント起動フェーズの整合 ----
check_agent_contract "codex reviewer host scope" 'Claude Code ホストでは internal reviewer が current HEAD を approve した後に段階的に使用する' .ai/agents/codex-reviewer.md
check_agent_contract "claude reviewer host scope" 'Codex ホストでは internal reviewer が current HEAD を approve した後に段階的に使用する' .ai/agents/claude-reviewer.md
check_agent_contract "reviewer runs in phase 5" 'issue-dev-orchestrate のフェーズ5（レビュー）で使用する' .ai/agents/reviewer.md
check_agent_contract "test fixer runs in phases 4 and 6" 'issue-dev-orchestrate のフェーズ4・6（品質ゲート）で使用する' .ai/agents/test-fixer.md
check_agent_contract "reviewer internal incremental range" '`internal-incremental`: 解決可能でcurrent HEADの祖先である `last-internal-reviewed-head...HEAD`' .ai/agents/reviewer.md
check_agent_contract "reviewer records staged range" '`reviewStage`' .ai/agents/reviewer.md
check_agent_contract "reviewer gates spec review on internal approval" 'current HEAD に対する internal reviewer の `approve` が確認できるまで' .ai/agents/reviewer.md
check_agent_contract "reviewer serializes profiles after internal approval" 'internal `accuracy-first` が current HEAD を approve した後に、別モデルまたは fallback が `spec-compliance-first` を直列に実行する' .ai/agents/reviewer.md
check_agent_contract "reviewer documents all review stages" '`internal-initial-cumulative`' .ai/agents/reviewer.md
check_agent_contract "reviewer documents fallback cumulative range" '`fallback-cumulative`: `git diff develop...HEAD`' .ai/agents/reviewer.md
check_agent_contract "reviewer documents fallback incremental spec range" '`fallback-incremental`: 解決可能でcurrent HEADの祖先である `last-spec-review-head...HEAD`' .ai/agents/reviewer.md
check_agent_contract "reviewer rejects invalid fallback range" 'spec boundaryが不正・祖先でない・空、またはブリーフrangeと不一致なら' .ai/agents/reviewer.md
check_agent_contract "reviewer fallback ignores other boundaries" 'fallback のrange選択に internal / external boundary を使わない' .ai/agents/reviewer.md

# ---- 段階的レビュー境界 ----
check_agent_contract "internal boundary is distinct" 'last-internal-reviewed-head-<N>.txt' "$SKILL"
check_agent_contract "spec boundary keeps its route" 'last-spec-review-route-<N>.txt' "$SKILL"
check_agent_contract "external boundary is distinct" 'last-external-reviewed-head-<N>.txt' "$SKILL"
check_agent_contract "fallback never updates external boundary" 'fallback、timeout、認証・同意・通信エラーは絶対に更新しない' "$SKILL"
check_agent_contract "external approve establishes coverage" '別モデルCLIの `approve` と `request-changes` はどちらも actual external coverage を確立する' "$SKILL"

printf '%s\n' "Agent contract checks passed!"
