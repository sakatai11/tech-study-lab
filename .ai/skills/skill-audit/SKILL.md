---
name: skill-audit
description: リポジトリ管理の共通スキル（.ai/skills/）・エージェント・Claude/Codexの発見リンク・hooks に実行時の問題がないかを監査する。参照切れ、絶対パス、権限整合、シンボリックリンク、実行ログを確認する。「スキルを監査して」「スキルの問題を調べて」で使用する。
---

# スキル監査

実行前に `.ai/runtime-compatibility.md` を全文読む。

Codexでは開始直後と完了直前に `./.ai/hooks/log-skill-usage.sh --runtime codex --skill skill-audit --status started|completed` を実行して共通ログへ記録する（Claudeではhookが自動記録する）。

対象は引数で指定されたスキル、なければ `.ai/skills/` 配下の全スキル。Claude Code 側（`.claude/` のリンク・settings・hooks）と Codex 側（`.agents/skills/` のリンク・`.codex/agents/*.toml`・`AGENTS.md`・sandbox/approval）を分けて評価する。

## 手順

### 1. 静的チェック（全対象スキルの SKILL.md を読んで確認）

| 観点 | チェック内容 | 重要度の目安 |
|---|---|---|
| 参照の実在 | スキルが参照するファイル・pnpm スクリプト・エージェント名（`.ai/agents/`）・他スキル名（`.ai/skills/`）が実在するか | 存在しない参照は must-fix |
| 絶対パス | `/Users/...` 等のマシン固有パスが含まれていないか（リポジトリ相対か `$(pwd)` にする） | must-fix |
| 権限整合 | Claude Code は `settings.json`、Codex は現在の sandbox/approval 規則に照らす。一方の allow を他方にも有効とみなさない | 抵触は must-fix、allow 漏れは info |
| 環境依存 | `gh` / `codex` / ブラウザツール等、環境によって存在しないツールへの依存にフォールバックや前提の明記があるか | should-fix |
| ランタイム互換 | Claude Code 固有ツール名・`subagent_type`・モデル指定に Codex の読み替えがあるか | 欠落は must-fix |
| リンク整合 | `.claude/skills/<name>` と `.agents/skills/<name>` が同じ `.ai/skills/<name>` を指すか。`.claude/agents/*` が `.ai/agents/*` を指すか | リンク切れ・誤リンクは must-fix |
| Codex agent整合 | `.codex/agents/<name>.toml` に必須3項目があり、`name` と `.ai/agents/<name>.md` が対応し、read-only役割のsandboxとモデル方針が適切か | 欠落・不一致は must-fix |
| 実態との乖離 | 「未実装ならスキップ」等の記述が現状と合っているか（実装済みになっていないか） | should-fix |
| eval 安全性 | host runtime が明確か、外部書込や破壊的 cleanup が fixture/dry-run 化されているか、期待値が現行スキルと一致するか | 状態変更型 eval は must-fix |

hooks（`settings.json`）も同様に確認する: コマンドが POSIX sh（dash）で動くか（`set -o pipefail` や bash 固有構文は不可）、依存コマンド（jq 等）の有無。

ランタイム固有語（`TodoWrite`, `AskUserQuestion`, `Agent tool`, `subagent_type`, `run_in_background`, `Read/Edit/Write`, `! command`）を検索し、`.ai/runtime-compatibility.md` または近接箇所に読み替えがあるか確認する。

リンク切れと参照先を確認する:

```bash
find -L .claude/skills .agents/skills .claude/agents -type l -print
find .claude/skills .agents/skills .claude/agents -maxdepth 1 -type l -exec readlink {} \;
```

1つ目の出力は空であること。2つ目は各リンクが対応する `.ai/skills/` または `.ai/agents/` を指すこと。

`.codex/agents/*.toml` はTOMLパーサーで読み、各ファイルの `name`・`description`・`developer_instructions`、対応する `.ai/agents/<name>.md`、役割に適した `sandbox_mode` を確認する。

### 2. 実行ログの解析

`.ai/logs/skill-usage.jsonl`（Claude/Codex共通のローカル利用ログ）を解析する:

```bash
test -f .ai/logs/skill-usage.jsonl           # 無ければ「ログなし」として報告しスキップ
```

- スキル・runtime・status（`requested` / `started` / `completed`）ごとの件数・最終日時を集計する。
- 長期間起動されていないスキルは棚卸し候補として info で報告する。

このログは**利用状況の参考値**である。`completed` を確認できたものを実行確認済み、`requested` だけのものを未確認として区別する。以下は取りこぼす可能性があるため、レポートに制約を明記する:

- 明示指定されない自動スキル選択の `requested`（Codex hooks にはスキル起動イベントがない）。
- スキルのロード前に失敗した実行。
- 他の環境での実行分（ログはgitignore対象の環境ローカル）。
- Codexでライフサイクル記録コマンドが実行されなかったケース。

したがって「ログに無い = 未使用」とは断定せず、棚卸し候補はあくまで確認の起点として提示する。`pnpm test:hooks` と `pnpm sync:agents --check` も実行し、フック自体の健全性を確認する。

### 3. レポートと修正

1. 重要度付きレポートを提示する: 指摘ごとに「対象ファイル:行 / 問題 / 修正案」。
2. **修正はユーザー承認後**に行う。must-fix から順に、承認された指摘のみ修正する（スキルは開発フローを規定するファイルのため、無断で書き換えない）。
3. 修正後は該当スキルの手順が通しで成立するか机上で再確認し、コミットはユーザー確認後に行う。

## 注意

- このスキル自身と hooks も監査対象に含める。
- 問題ゼロでも「確認した観点と対象」を報告する（監査した事実を残す）。
