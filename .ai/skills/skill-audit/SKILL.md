---
name: skill-audit
description: リポジトリ管理の共通スキル（.ai/skills/）・エージェント・hooks を監査する。機械検査（pnpm test:hooks）では拾えない参照切れ・絶対パス・記述と実態の乖離・権限の衝突を確認し、利用ログからスキルの棚卸しを行う。「スキルを監査して」「スキルの問題を調べて」「使われていないスキルを棚卸しして」で使用する。
---

# スキル監査

実行前に `.ai/runtime-compatibility.md` を全文読む。

Codexでは開始直後と完了直前に `./.ai/hooks/log-skill-usage.sh --runtime codex --skill skill-audit --status started|completed` を実行して共通ログへ記録する（Claudeではhookが自動記録する）。

対象は引数で指定されたスキルとする。指定がなければ、共通定義（`.ai/skills/`・`.ai/agents/`・`.ai/hooks/`）、発見用リンクのディレクトリ（`.claude/skills/`・`.agents/skills/`・`.claude/agents/`・`.claude/rules/`）、ランタイム固有のファイル（`.codex/agents/*.toml`・`.claude/hooks/`・`.codex/hooks/`・`.claude/settings.json`）の全体を対象にする。このスキル自身も監査の対象に含める。

## 1. 機械検査

```bash
pnpm test:hooks
```

次の項目は、このコマンドが検査する。手作業で確認し直さない。

- `.ai/skills/*`・`.ai/agents/*.md`・`.ai/rules/*.md` ごとに、期待する発見用リンクが存在し、対応する `.ai/` を指していること。リンク切れがないこと
- `.ai/agents/<name>.md` と `.codex/agents/<name>.toml` が1対1で対応し、toml に `name = "<name>"` の行があり、toml が参照する `.ai/agents/*.md` が自分の定義だけであること
- パス別ルールが `AGENTS.md` から参照されていること
- 権限・Sandbox の迂回フラグがないこと

次の項目は文字列の一致しか見ていない、または検査していないため、2章で確認する。

- toml の構文が正しいか、参照が `developer_instructions` の中にあるか
- 期待外の発見用リンクが、名前と異なる既存スキルを指していないか

hook 生成物の同期（`sync:agents --check`）も、このコマンドに含まれる。失敗した場合は、その内容を must-fix として報告する。

## 2. 判断が必要な監査

対象の `SKILL.md`・エージェント定義・hook スクリプトを読み、次の観点で確認する。

| 観点 | 確認すること | 重要度の目安 |
|---|---|---|
| 参照の実在 | 参照しているファイル・pnpm script・スキル名・エージェント名・見出しアンカーが実在するか | 存在しない参照は must-fix |
| 絶対パス | `/Users/...` などマシン固有のパスを含んでいないか | must-fix |
| 権限の衝突 | スキルが指示するコマンドが、`.claude/settings.json` の deny や Codex の sandbox・approval と衝突しないか（例: deny 済みの `gh pr close` を手順に含める） | 衝突は must-fix |
| 発見用リンクの対応 | `.claude/skills/`・`.agents/skills/`・`.claude/agents/`・`.claude/rules/` の各リンクについて、名前とリンク先（`readlink`）が同じ `.ai/` の一次ソースを指しているか。期待外のリンクがないか | 誤リンクは must-fix |
| Codex agent の設定 | `.codex/agents/<name>.toml` を TOML パーサーで読めるか（例: `python3 -c 'import tomllib,sys; tomllib.load(open(sys.argv[1],"rb"))' <file>`）。`developer_instructions` の中で `.ai/agents/<name>.md` を読むよう指示しているか。 `sandbox_mode` が `.ai/agents/<name>.md` の役割と合っているか（読み取り専用の役割は `read-only`）。`description` が空でないか。`model` / `model_reasoning_effort` が `.ai/runtime-compatibility.md` の方針と合っているか | 権限の過剰は must-fix、それ以外は should-fix |
| 記述と実態の乖離 | 手順・品質ゲート・前提が、現在のスクリプト・設定・他スキルと食い違っていないか | should-fix |
| 役割の重複 | description や役割が他のスキルと重なり、どちらが起動されるか曖昧になっていないか | should-fix |
| 環境依存 | `gh` / `codex` / ブラウザなど、環境によって存在しないツールに依存する箇所に、前提やフォールバックが書かれているか | should-fix |
| hook の移植性 | hook スクリプト（`.ai/hooks/`、`.claude/hooks/`、`.codex/hooks/`）が POSIX sh（dash）で動くか（`set -o pipefail` や bash 固有の構文を使っていないか）、依存コマンド（`jq` など）がない場合に明示的に失敗するか。`.claude/settings.json` と `.codex/hooks.json` の hook 配線は `sync:agents` の生成物であり、手で編集されていないことは機械検査で確認される | should-fix |

## 3. 利用ログの棚卸し

`.ai/logs/skill-usage.jsonl` は、Claude と Codex で共通のローカル利用ログである。ファイルがなければ「ログなし」と報告して、この手順を飛ばす。

- スキル・runtime・status（`requested` / `started` / `completed`）ごとに、件数と最終日時を集計する。
- 長期間起動されていないスキルは、棚卸しの候補として info で報告する。

このログは利用状況の参考値である。`completed` を確認できたものを実行確認済み、`requested` だけのものを未確認として区別する。次の取りこぼしがあり得るため、「ログに無い = 未使用」とは断定しない。

- 自動選択されたスキルの `requested`（Codex hooks にはスキル起動イベントがない）
- スキルの読み込み前に失敗した実行
- 他の環境での実行（ログは環境ローカルで Git 管理しない）
- Codex でライフサイクル記録が実行されなかったケース

## 4. 報告と修正

1. 重要度付きで報告する。各指摘は「対象ファイル:行 / 問題 / 修正案」の形にする。問題がゼロでも、確認した観点と対象を報告する。
2. **修正はユーザーの承認後に行う。** スキルは開発フローを規定するファイルなので、無断で書き換えない。must-fix から順に、承認された指摘だけを修正する。
3. 修正後は `pnpm test:hooks` を再実行する。コミットはユーザーの確認後に行う。
