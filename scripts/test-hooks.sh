#!/bin/sh
# AIハーネスの動作と構成の整合を検査するゲート。
#
# 1. hook fixture / 共通スキルログ / `sync:agents --check` による hook と生成物の動作検証。
# 2. Claude Code と Codex の両ランタイムから同じ `.ai/` の一次ソースへ届くことの構成検査
#    （発見用リンク、Codex agent TOML、パス別ルールの参照、権限迂回フラグの不在）。
# 3. weekly-retro レンダラーの出力検証。
# 4. `docs/design.md` の章参照（`§N` / `design.md N.N` / `design.md#<見出しスラッグ>`）が実在する見出しへ
#    解決されることの検査（scripts/test-design-chapter-refs.mjs）。
#
# 契約文書の文言は検査しない。文言の存在はモデルが従うことを保証せず、改善のたびに期待値の更新を
# 強いるため。ここでは機械的に判定できる構成と、コードの振る舞いだけを固定する。
#
# PR CI（.github/workflows/ci.yml）から実行される。`jq` を必要とする。
set -eu

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

expect_blocked() {
  if "$@"; then
    fail "expected hook to block: $*"
  fi
}

expect_contains() {
  label=$1
  expected=$2
  file=$3
  grep -F -- "$expected" "$file" >/dev/null || fail "expected content missing: $label ($file)"
}

expect_absent() {
  label=$1
  unexpected=$2
  file=$3
  if grep -F -- "$unexpected" "$file" >/dev/null; then
    fail "unexpected content: $label ($file)"
  fi
}

# ---- 1. hook と生成物 ----
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

# ---- 2. 両ランタイムの構成整合 ----
printf '%s\n' "Checking Claude/Codex harness consistency..."

# 発見用リンクが存在し、`.ai/` の一次ソースを相対パスで指していること。
expect_link() {
  link=$1
  target=$2
  [ -L "$link" ] || fail "discovery link missing or not a symlink: $link"
  [ "$(readlink "$link")" = "$target" ] || fail "discovery link points elsewhere: $link -> $(readlink "$link") (expected $target)"
  [ -e "$link" ] || fail "discovery link is broken: $link"
}

for skill_dir in .ai/skills/*/; do
  name=$(basename "$skill_dir")
  [ -f "$skill_dir/SKILL.md" ] || fail "skill without SKILL.md: $skill_dir"
  expect_link ".claude/skills/$name" "../../.ai/skills/$name"
  expect_link ".agents/skills/$name" "../../.ai/skills/$name"
done

for agent in .ai/agents/*.md; do
  name=$(basename "$agent" .md)
  expect_link ".claude/agents/$name.md" "../../.ai/agents/$name.md"
  toml=".codex/agents/$name.toml"
  [ -f "$toml" ] || fail "Codex agent TOML missing for $agent: $toml"
  grep -qx "name = \"$name\"" "$toml" || fail "Codex agent TOML name does not match $name: $toml"
done

for toml in .codex/agents/*.toml; do
  name=$(basename "$toml" .toml)
  [ -f ".ai/agents/$name.md" ] || fail "Codex agent TOML without .ai/agents/$name.md: $toml"
done

if [ -d .ai/rules ]; then
  for rule in .ai/rules/*.md; do
    [ -e "$rule" ] || continue
    name=$(basename "$rule")
    expect_link ".claude/rules/$name" "../../.ai/rules/$name"
    expect_contains "path rule is reachable from AGENTS.md" ".ai/rules/$name" AGENTS.md
  done
fi

# 発見用ディレクトリに、一次ソースを持たない取り残しのリンクがないこと。
for link in .claude/skills/* .agents/skills/* .claude/agents/* .claude/rules/*; do
  [ -e "$link" ] || [ -L "$link" ] || continue
  [ -e "$link" ] || fail "stale discovery link: $link"
done

# 権限・Sandbox の迂回フラグをハーネスへ持ち込まないこと（文字列はここで分割して自己一致を避ける）。
bypass_flag=$(printf '%s%s' '--dangerously' '-')
if grep -rF -- "$bypass_flag" .ai .codex .claude/settings.json AGENTS.md 2>/dev/null | grep -v '^\.ai/logs/' >/dev/null; then
  fail "permission or sandbox bypass flag found in harness files"
fi

# ---- 3. weekly-retro レンダラー ----
WEEKLY_RETRO_RENDERER=.ai/automations/weekly-retro-refine/scripts/render-report.mjs
WEEKLY_RETRO_SAMPLE=.ai/automations/weekly-retro-refine/references/report-data.example.json
WEEKLY_RETRO_TEMPLATE=.ai/automations/weekly-retro-refine/assets/report-template.html
WEEKLY_RETRO_OUTPUT="$log_dir/weekly-retro.html"
WEEKLY_RETRO_NUMBER_FALLBACK_INPUT="$log_dir/weekly-retro-number-fallback.json"
WEEKLY_RETRO_NUMBER_FALLBACK_OUTPUT="$log_dir/weekly-retro-number-fallback.html"

node "$WEEKLY_RETRO_RENDERER" --input "$WEEKLY_RETRO_SAMPLE" --output "$WEEKLY_RETRO_OUTPUT" >/dev/null
for placeholder in $(grep -oE '\{\{[A-Z_]+\}\}' "$WEEKLY_RETRO_TEMPLATE" | sort -u); do
  expect_absent "weekly retro resolves $placeholder" "$placeholder" "$WEEKLY_RETRO_OUTPUT"
done
expect_contains "weekly retro renders close candidate" 'close候補' "$WEEKLY_RETRO_OUTPUT"
expect_contains "weekly retro renders remaining conditions" '残条件あり' "$WEEKLY_RETRO_OUTPUT"
expect_contains "weekly retro renders transfer" '別Issueへ移管済み' "$WEEKLY_RETRO_OUTPUT"
expect_contains "weekly retro renders exact refs evidence" 'refs #114' "$WEEKLY_RETRO_OUTPUT"
expect_contains "weekly retro renders merge destination" 'merge先: develop' "$WEEKLY_RETRO_OUTPUT"
expect_contains "weekly retro renders close candidate status badge" '<span class="status good">close候補</span>' "$WEEKLY_RETRO_OUTPUT"
expect_contains "weekly retro renders remaining conditions status badge" '<span class="status warn">残条件あり</span>' "$WEEKLY_RETRO_OUTPUT"
expect_contains "weekly retro renders transferred status badge" '<span class="status info">別Issueへ移管済み</span>' "$WEEKLY_RETRO_OUTPUT"
expect_contains "weekly retro renders transfer issue reference" '<dt>移管先</dt><dd>#118 <a href="https://github.com/example/tech-study-lab/issues/118">運用手順の自動化を実装する</a> — 運用手順を自動化する</dd>' "$WEEKLY_RETRO_OUTPUT"
expect_contains "weekly retro renders parent tracker issue reference" '<li>#115 <a href="https://github.com/example/tech-study-lab/issues/115">削除操作の品質tracker</a> (GitHub sub-issue) — 子Issue: close候補</li>' "$WEEKLY_RETRO_OUTPUT"
expect_contains "weekly retro renders human next action" '人間がcloseを判断' "$WEEKLY_RETRO_OUTPUT"

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
expect_contains "weekly retro renders transfer number without title or URL" '<dt>移管先</dt><dd>#118 移管先Issue — 運用手順を自動化する</dd>' "$WEEKLY_RETRO_NUMBER_FALLBACK_OUTPUT"
expect_contains "weekly retro renders parent tracker number without title or URL" '<li>#115 親tracker (GitHub sub-issue) — 子Issue: close候補</li>' "$WEEKLY_RETRO_NUMBER_FALLBACK_OUTPUT"

# ---- 4. design.md 章参照 ----
# 章番号の変更・削除で、リポジトリ中の `§N` / `design.md N.N` / `design.md#<見出しスラッグ>` が
# 黙って腐ることを防ぐ。参照切れ検出の回帰テストはスクリプト側が持つ。
node scripts/test-design-chapter-refs.mjs

printf '%s\n' "Harness checks passed!"
