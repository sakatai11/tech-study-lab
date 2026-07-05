---
name: issue-dev-orchestrate
description: GitHub issue に登録された仕様を起点に「調査→方針決定→実装→レビュー→テスト→fix」を一気通貫で実行する issue 駆動開発パイプライン。「issue #N を実装して」「/issue-dev-orchestrate N」などで起動。実装は Sonnet エージェント（デフォルト）またはバックグラウンドの codex CLI を選択できる。
argument-hint: <issue番号> [sonnet|codex]
---

# Issue 駆動開発パイプライン

引数を解析する: 第1引数 = issue 番号（**必須**。なければユーザーに確認して停止）、第2引数 = 実装モード `sonnet`（デフォルト）| `codex`。

進捗は TodoWrite でフェーズごとに管理し、各フェーズの完了時に要点を1-2行でユーザーに報告する。

## フェーズ0: 準備

1. issue を取得する:
   ```bash
   gh issue view <N> --json number,title,body,labels,comments
   ```
2. issue に `impl:codex` ラベルがあれば、引数指定がない限り codex モードにする。
3. 作業ツリーの確認とブランチ作成:
   ```bash
   git status --porcelain   # クリーンでなければユーザーに確認して停止
   git checkout main && git pull
   git checkout -b feature/issue-<N>-<英語スラッグ>
   ```

## フェーズ1: 調査

`issue-investigator` エージェント（Agent tool, subagent_type: issue-investigator）に issue 番号・タイトル・本文全文を渡して起動する。調査レポート（仕様サマリ／design.md 整合性／影響範囲／実装方針の推奨案・代替案／テスト観点）を受け取る。

## フェーズ2: 方針決定

1. 調査レポートの推奨案をベースに実装方針を決定する。方針が複数あり優劣が拮抗している、または「要確認事項」が実装内容を左右する場合のみ、AskUserQuestion でユーザーに確認する。それ以外は推奨案を採用して先へ進む。
2. **design.md との乖離が報告された場合**: 仕様駆動開発の原則に従い、実装前に `docs/design.md` を更新する。
3. 決定した方針を issue にコメントで記録する:
   ```bash
   gh issue comment <N> --body "<方針サマリ（決定方針・影響範囲・テスト観点）>"
   ```

## フェーズ3: 実装

方針書（調査レポート＋決定事項＋受け入れ条件）を実装者に渡す。

### sonnet モード（デフォルト）

`developer` エージェント（subagent_type: developer）に方針書を渡して起動する。実装報告（変更ファイル・自己検証結果・逸脱事項）を受け取る。

### codex モード

1. 方針書をプロンプトファイルとして scratchpad に書き出す。内容は「issue 番号・受け入れ条件・決定方針・変更対象ファイル・ガードレール（AGENTS.md 準拠、コミット禁止、typecheck/biome/test を自己検証すること）」。
2. codex CLI を**バックグラウンド**で起動する（Bash tool, `run_in_background: true`）:
   ```bash
   codex exec --sandbox workspace-write --cd /Users/sakaitaichi/workspace/develop/tech-study-lab \
     --output-last-message <scratchpad>/codex-result-<N>.md \
     - < <scratchpad>/codex-prompt-<N>.md
   ```
3. 完了通知を受けたら `codex-result-<N>.md` と `git status` / `git diff --stat` で成果を確認する。差分がない・失敗している場合はログを確認し、1回だけプロンプトを改善して再実行する（それでも失敗ならユーザーに報告）。

## フェーズ4: レビュー

`reviewer` エージェント（subagent_type: reviewer）に issue 番号・方針サマリを渡して起動する（差分は `git diff main...HEAD` で取得させる）。must-fix / should-fix / nit の重要度付き指摘を受け取る。

## フェーズ5: テスト

`test-fixer` エージェント（subagent_type: test-fixer）を起動し、3つの品質ゲート（typecheck / biome / test）を全パスさせる。

## フェーズ6: fix ループ

1. レビューの must-fix / should-fix と、test-fixer の残課題を fix 対象リストにまとめる（nit は含めない）。
2. fix 対象が空ならフェーズ7へ。
3. fix 対象を実装者（sonnet モード: `developer` エージェント / codex モード: codex exec 再実行）に渡して修正させる。
4. フェーズ4（レビューは fix 箇所の再確認のみ）→フェーズ5 を再実行する。
5. **最大2周**。収束しない場合は残課題を整理してユーザーに報告し、指示を仰ぐ。

## フェーズ7: 完了

1. 最終確認: `git diff main...HEAD --stat` と品質ゲート結果をまとめる。
2. コミットする（メッセージに `refs #<N>` を含める）。
3. ユーザーに完了報告する: 実装サマリ／レビュー・テスト結果／コミットハッシュ。
4. **PR 作成はユーザーに確認してから**行う（承認されたら pr-creator skill を使用。PR 本文に `closes #<N>` を含める）。

## 中断・失敗時の原則

- 同じ操作が2回失敗したら、繰り返さず原因を分析して代替アプローチを取る。
- どのフェーズで停止しても、現在のブランチ・完了済みフェーズ・残作業をユーザーに報告する。
