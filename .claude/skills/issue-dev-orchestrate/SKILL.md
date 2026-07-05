---
name: issue-dev-orchestrate
description: GitHub issue に登録された仕様を起点に「調査→方針決定→実装→レビュー→テスト→fix」を一気通貫で実行する issue 駆動開発パイプライン。「issue #N を実装して」「/issue-dev-orchestrate N」などで起動。実装は Sonnet エージェント（デフォルト）またはバックグラウンドの codex CLI を選択できる。
argument-hint: <issue番号> [sonnet|codex]
---

# Issue 駆動開発パイプライン

引数を解析する: 第1引数 = issue 番号（**必須**。なければユーザーに確認して停止）、第2引数 = 実装モード `sonnet`（デフォルト）| `codex`。

進捗は TodoWrite でフェーズごとに管理し、各フェーズの完了時に要点を1-2行でユーザーに報告する。

## フェーズ0: 準備

> **ブランチ戦略（Git Flow 型）**: `main` は保護。**パイプラインは main で作業しない・main に直接コミットしない**。統合ブランチ `develop` をベースに作業ブランチを切る。`develop` → `main` の PR・マージは人間が任意タイミングで行う（パイプラインの対象外）。

1. issue を取得する:
   ```bash
   gh issue view <N> --json number,title,body,labels,comments
   ```
2. issue に `impl:codex` ラベルがあれば、引数指定がない限り codex モードにする。
3. **ブランチ種別を判定する（Conventional Branch）**。issue のラベル・タイトル・本文から下表で種別を選ぶ（判断に迷えば `feature`）:

   | 種別 | 使う場面 | issue の目安 |
   |---|---|---|
   | `feature` | 新機能・機能拡張 | `spec` / `enhancement` ラベル、新規実装 |
   | `fix` | バグ修正 | `bug` ラベル、既存挙動の不具合 |
   | `refactor` | 挙動を変えない内部改善 | リファクタ・整理 |
   | `docs` | ドキュメントのみ | `docs`、design.md 更新など |
   | `test` | テスト追加・修正のみ | テスト整備 |
   | `chore` | ビルド・設定・依存など | 上記に当てはまらない雑務 |

4. 作業ツリーの確認と、`develop` からの作業ブランチ作成:
   ```bash
   git status --porcelain   # クリーンでなければユーザーに確認して停止
   git fetch origin
   git switch develop 2>/dev/null || git switch -c develop origin/develop 2>/dev/null || git switch -c develop
   git pull --ff-only 2>/dev/null || true   # develop がリモートに無い初回はスキップ
   git switch -c <種別>/issue-<N>-<英語スラッグ>   # 例: feature/issue-12-lesson-filter
   ```
   - `develop` がローカル・リモートともに存在しない初回は、上記でローカルに新規作成される。その旨をユーザーに報告する（`develop` の初期化）。

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

`reviewer` エージェント（subagent_type: reviewer）に issue 番号・方針サマリを渡して起動する（差分は `git diff develop...HEAD` で取得させる）。must-fix / should-fix / nit の重要度付き指摘を受け取る。

## フェーズ5: テスト

`test-fixer` エージェント（subagent_type: test-fixer）を起動し、3つの品質ゲート（typecheck / biome / test）を全パスさせる。

## フェーズ6: fix ループ

1. レビューの must-fix / should-fix と、test-fixer の残課題を fix 対象リストにまとめる（nit は含めない）。
2. fix 対象が空ならフェーズ7へ。
3. fix 対象を実装者（sonnet モード: `developer` エージェント / codex モード: codex exec 再実行）に渡して修正させる。
4. フェーズ4（レビューは fix 箇所の再確認のみ）→フェーズ5 を再実行する。
5. **最大2周**。収束しない場合は残課題を整理してユーザーに報告し、指示を仰ぐ。

## フェーズ7: 完了

1. 最終確認: `git diff develop...HEAD --stat` と品質ゲート結果をまとめる。
2. コミットする（メッセージに `refs #<N>` を含める）。
3. 作業ブランチをプッシュする:
   ```bash
   git push -u origin <種別>/issue-<N>-<英語スラッグ>
   ```
4. **feature → develop の PR をユーザー確認後に作成する**（承認されたら pr-creator skill を使用）:
   - **ベースブランチは `develop`**（`main` ではない）。`gh pr create --base develop ...`
   - PR 本文には `refs #<N>` を書く（参照のみ）。**`closes #<N>` は使わない**: GitHub の自動クローズはデフォルトブランチ（`main`）へのマージでのみ発火するため、develop マージでは効かず誤解を招く。issue のクローズは `develop` → `main` のリリース時に人間が判断する。
   - **マージはしない**。feature → develop のマージ、および develop → main の PR・マージはすべて人間が任意タイミングで行う（`gh pr merge` は settings.json で禁止）。
5. ユーザーに完了報告する: 実装サマリ／レビュー・テスト結果／作業ブランチ名／PR URL（作成した場合）。

## 中断・失敗時の原則

- 同じ操作が2回失敗したら、繰り返さず原因を分析して代替アプローチを取る。
- どのフェーズで停止しても、現在のブランチ・完了済みフェーズ・残作業をユーザーに報告する。
