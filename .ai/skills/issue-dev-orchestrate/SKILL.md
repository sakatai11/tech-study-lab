---
name: issue-dev-orchestrate
description: GitHub issue に登録された仕様を起点に「調査→方針決定→実装→レビュー→テスト→fix」を一気通貫で実行する issue 駆動開発パイプライン。「issue #N を実装して」「/issue-dev-orchestrate N」などで起動。実装はランタイムのネイティブエージェントで行う。
---

# Issue 駆動開発パイプライン

実行前に `.ai/runtime-compatibility.md` を全文読む。

Codexでは開始直後と完了直前に `./.ai/hooks/log-skill-usage.sh --runtime codex --skill issue-dev-orchestrate --status started|completed` を実行して共通ログへ記録する（Claudeではhookが自動記録する）。

引数を解析する: 第1引数 = issue 番号（**必須**。なければユーザーに確認して停止）。

進捗は現在のランタイムで利用可能な plan/todo 機能でフェーズごとに管理し、各フェーズの完了時に要点を1-2行でユーザーに報告する。

## フェーズ0: 準備

> **ブランチ戦略（Git Flow 型）**: `main` は保護。**パイプラインは main で作業しない・main に直接コミットしない**。統合ブランチ `develop` をベースに作業ブランチを切る。`develop` → `main` の PR・マージは人間が任意タイミングで行う（パイプラインの対象外）。

1. issue を取得する:
   ```bash
   gh issue view <N> --json number,title,body,labels,comments
   ```
2. 一時ブリーフ用に `.claude/logs/briefs/` を作成する（gitignore 対象）。以後、このディレクトリを `<scratchpad>` と表記する。
3. **ブランチ種別を判定する（Conventional Branch）**。issue のラベル・タイトル・本文から下表で種別を選ぶ（判断に迷えば `feature`）:

   | 種別 | 使う場面 | issue の目安 |
   |---|---|---|
   | `feature` | 新機能・機能拡張 | `spec` / `enhancement` ラベル、新規実装 |
   | `fix` | バグ修正 | `bug` ラベル、既存挙動の不具合 |
   | `refactor` | 挙動を変えない内部改善 | `refactor` ラベル、リファクタ・整理 |
   | `docs` | ドキュメントのみ | `documentation` ラベル、design.md 更新など |
   | `test` | テスト追加・修正のみ | `test` ラベル、テスト整備 |
   | `chore` | ビルド・設定・依存など | 上記に当てはまらない雑務 |

4. 作業ツリーの確認と、`develop` からの作業ブランチ作成。分岐コマンドは個別に実行し、失敗を `|| true` で隠さない:
   ```bash
   git status --porcelain   # クリーンでなければユーザーに確認して停止
   git fetch origin
   # develop がローカルにあれば更新、なければ origin/develop から作成する。
   # どちらも無い初回だけローカルの develop を初期化する。
   if git show-ref --verify --quiet refs/heads/develop; then
     git switch develop
     git pull --ff-only
   elif git show-ref --verify --quiet refs/remotes/origin/develop; then
     git switch -c develop origin/develop
     git pull --ff-only
   else
     git switch -c develop
   fi
   git switch -c <種別>/issue-<N>-<英語スラッグ>   # 例: feature/issue-12-lesson-filter
   ```
   - `develop` がローカル・リモートともに存在しない初回は、上記でローカルに新規作成される。その旨をユーザーに報告する（`develop` の初期化）。

## エージェント起動の共通ルール（ツール呼び出し崩れの防止）

> **重要**: サブエージェントを起動する際、issue 本文全文やレビュー観点などの**長文ブリーフを起動プロンプトに直接インラインで貼らない**。
>
> ブリーフを scratchpad ファイルに書き出し、起動プロンプトは**短いポインタ**に留める:
> 1. `<scratchpad>/agent-brief-<phase>-<N>.md` にブリーフ全文を書く。
> 2. 起動プロンプトは数行に収める。Claude Codeは対応する `subagent_type`、Codexは `.codex/agents/<name>.toml` に登録されたカスタムエージェントを指定する。現在のツール面で種別指定ができない場合のみ `.ai/agents/<name>.md` を全文読むよう明記する。例:
>    ```
>    カスタムエージェント `issue-investigator` として、次のブリーフを全文読んで issue #16 を調査してください:
>    `.claude/logs/briefs/agent-brief-investigate-16.md`
>    調査レポート（仕様サマリ／design.md 整合性／影響範囲／実装方針／テスト観点）を返してください。
>    ```
> 3. これによりインライン引数が小さくなり、同一パイプラインで複数 issue を連続処理してもツール呼び出しが崩れにくくなる。
>
> なお、万一 `malformed` エラーが出た場合は**同じ長い呼び出しをそのまま再送しない**。まずブリーフをファイルに逃がしてから、短いポインタで再起動する。

## フェーズ1: 調査

`.ai/agents/issue-investigator.md` の定義を使って `issue-investigator` エージェントを起動する。issue 番号・タイトル・本文全文・調査観点は `<scratchpad>/agent-brief-investigate-<N>.md` に書き出し、起動プロンプトはそのパスを指すポインタに留める。

## フェーズ2: 方針決定

1. 調査レポートの推奨案をベースに実装方針を決定する。方針が複数あり優劣が拮抗している、または「要確認事項」が実装内容を左右する場合のみ、利用可能なユーザー確認機能で確認する。それ以外は推奨案を採用して先へ進む。
2. **design.md との乖離が報告された場合**: 仕様駆動開発の原則に従い、実装前に `docs/design.md` を更新する。
3. 決定した方針を issue にコメントで記録する:
   ```bash
   gh issue comment <N> --body "<方針サマリ（決定方針・影響範囲・テスト観点）>"
   ```

## フェーズ3: 実装

方針書（調査レポート＋決定事項＋受け入れ条件）を、現在実行中のAIコーディング環境に渡して実装する。実装対象がバックエンドかフロントエンドかで実装者を切り替えない。

ネイティブなサブエージェント機能が利用可能で、委譲が有効な場合は `.ai/agents/developer.md` の定義を使って `developer` エージェントを起動する。利用できない場合はオーケストレーター自身が同じ方針・制約で実装する。

### バックグラウンドAIエージェントCLI（例外）

Issueで「使用する」が選ばれている、または以下のいずれかを満たす場合だけ、外部AIエージェントCLIをバックグラウンドで起動してよい。

- 現在の環境にないツール・モデル・認証済み連携が必要
- 他の作業と競合しない、長時間の独立作業を並行させる価値がある
- ユーザーが特定のCLIまたはエージェントを明示している

起動前に理由、担当範囲、モデル、sandbox、成果物の確認方法を短いブリーフに記録する。バックエンド作業であることだけを理由に起動しない。CLIの実行に追加の承認や外部認証が必要な場合は、現在のランタイムの正規の承認経路に従う。

## フェーズ4: レビュー（並列）

2つのレビューエージェントをランタイムで利用可能な並列起動機能で同時に起動する。**この時点で実装は未コミット**なので、`git diff develop` と `git status --short` を併用し、未追跡ファイルもレビュー対象に含める。

1. **`reviewer` エージェント**: `.ai/agents/reviewer.md` の定義と issue 番号・方針サマリを渡す。
2. **`coderabbit-reviewer` エージェント**: `.ai/agents/coderabbit-reviewer.md` の定義と issue 番号を渡す。

### coderabbit-reviewer が「auth-required」を返した場合

**黙ってスキップしない。** ユーザーに以下を案内して認証を促す:

> CodeRabbit CLI が未認証です。ご自身のターミナルで `coderabbit auth login` を実行して認証してください。

認証完了を確認したら coderabbit-reviewer を再起動する。ユーザーが「認証しない・後回しにする」と明示した場合のみ、reviewer 単独の結果で続行する。rate-limited / error の場合はその旨をユーザーに報告し、reviewer 単独で続行してよい。

### 結果の統合

両者の指摘リストをマージする。**同一 `ファイル:行` かつ指摘内容が実質的に同じ場合のみ**1件に束ね（重要度は高い方を採用）、出典タグ `[coderabbit]` は保持する。同じ行でも指摘内容が異なる場合（例: 入力検証漏れと認可漏れが同じ行にある）は別指摘として両方残す。迷う場合は統合せず両方残す。**CodeRabbit の指摘をオーケストレーターの判断で取捨選択しない**（独立レビューの価値を保つため）。マージ後の must-fix / should-fix / nit リストをフェーズ6に渡す。

## フェーズ5: テスト

`.ai/agents/test-fixer.md` の定義を使って `test-fixer` エージェントを起動し、3つの品質ゲート（typecheck / biome / test）を通す。

> **スコープの明示（重要）**: `pnpm biome check .` / `pnpm test` はリポジトリ全体を対象にする。変更ファイルにスコープを絞って直し、無関係な既存失敗は直さず報告する。ユーザーの未コミット変更を動かす `git stash` は使わない。

## フェーズ6: fix ループ

1. レビューの must-fix / should-fix と、test-fixer の残課題を fix 対象リストにまとめる（nit は含めない）。
2. fix 対象が空ならフェーズ7へ。
3. fix 対象を `developer` エージェントに渡して修正させる。
4. フェーズ4（レビューは fix 箇所の再確認のみ、**`reviewer` 単独で実施**。CodeRabbit はレート制限があるため初回のみ）→フェーズ5 を再実行する。
5. **最大2周**。収束しない場合は残課題を整理してユーザーに報告し、指示を仰ぐ。

## フェーズ7: 完了

1. 最終確認: **コミット前**なので `git diff develop --stat`（作業ツリーを含む）で変更を確認し、品質ゲート結果とあわせてまとめる。
2. コミットする（メッセージに `refs #<N>` を含める）。
3. 作業ブランチをプッシュする:
   ```bash
   git push -u origin <種別>/issue-<N>-<英語スラッグ>
   ```
4. **feature → develop の PR をユーザー確認後に作成する**。利用可能なら `pr-creator` skill を使用し、なければ `.github/pull_request_template.md` を読んで `gh pr create` を使う:
   - **ベースブランチは `develop`**（`main` ではない）。`gh pr create --base develop ...`
   - PR 本文には `refs #<N>` を書く（参照のみ）。**`closes #<N>` は使わない**: GitHub の自動クローズはデフォルトブランチ（`main`）へのマージでのみ発火するため、develop マージでは効かず誤解を招く。issue のクローズは `develop` → `main` のリリース時に人間が判断する。
   - **マージはしない**。feature → develop のマージ、および develop → main の PR・マージはすべて人間が任意タイミングで行う（`gh pr merge` は settings.json で禁止）。
5. ユーザーに完了報告する: 実装サマリ／レビュー・テスト結果／作業ブランチ名／PR URL（作成した場合）。

## 中断・失敗時の原則

- 同じ操作が2回失敗したら、繰り返さず原因を分析して代替アプローチを取る。
- どのフェーズで停止しても、現在のブランチ・完了済みフェーズ・残作業をユーザーに報告する。
