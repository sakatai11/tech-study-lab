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

1. `gh auth status` で認証を確認してから、認証済みの `gh` CLI で issue を取得する。Codex AppでGitHubコネクタが接続済みの場合は、同等の操作にコネクタを使ってよい:
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
5. **レビュー方式を選択する**。実装前に、利用可能なユーザー確認機能で必ず次のどちらかを選んでもらい、選択結果を `<scratchpad>/review-mode-<N>.md` に記録する。
   - **GitHub App（推奨）**: PR作成後にGitHub上のCodeRabbit Appレビューを取得する。Codexから未コミット差分を外部送信しない。
   - **CodeRabbit CLI**: フェーズ5でコミット済み差分をCodeRabbitへ送信してレビューする。
   - CLIを選んだ場合は、選択とは別に「privateのコミット済み差分がCodeRabbitへ送信される」こと、対象issue・ブランチ・base・現在のコミット範囲を明示して、**各レビュー実行直前に**明示同意を取得する。肯定の原文、時刻、対象を同じファイルに `reviewMode: coderabbit-cli` と `externalEgressApproved: true` として記録する。スキル・AGENTS.md・過去の同意だけで代用してはならない。
   - GitHub Appを選んだ場合は、PR作成後にAppレビューが取得できるまでCodeRabbit由来のapproveを主張しない。App未導入またはレビュー未到着の扱いはフェーズ5に従う。

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
3. 決定した方針とフェーズ0で選んだレビュー方式を issue にコメントで記録する。CLI方式では外部送信同意の原文を転載せず、同意を記録済みであることだけを記載する。本文は安全な一時ファイルに書き出して `--body-file` で渡す。認証済みの `gh` CLI を使う。Codex AppでGitHubコネクタが接続済みの場合は、同等の操作にコネクタを使ってよい:
   ```bash
   gh issue comment <N> --body-file <方針本文を保存した一時ファイル>
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

## フェーズ4: 品質ゲートと初期実装コミット

1. `.ai/agents/test-fixer.md` の定義を使って `test-fixer` エージェントを起動し、初期実装に対して3つの品質ゲート（typecheck / biome / test）を通す。
   - `pnpm biome check .` / `pnpm test` はリポジトリ全体を対象にする。変更ファイルにスコープを絞って直し、無関係な既存失敗は直さない。ユーザーの未コミット変更を動かす `git stash` は使わない。
2. 品質ゲートが通過した場合だけ、**オーケストレーター**が初期実装を1コミットにする。`developer` と `test-fixer` の commit / push 禁止は維持する。フェーズ3の実装とフェーズ4の品質ゲート修正を含む**今回作業の変更ファイル**だけを明示して stage し、無関係なユーザー変更は含めない。コミットメッセージには `refs #<N>` を含める。
   ```bash
   git diff --check
   git add -- <今回作業の変更ファイル>
   git commit -m "<type>: <summary> (refs #<N>)"
   ```
3. `git status --short` が空であることを確認する。未コミット変更が残る場合や、品質ゲートが未収束の場合はレビューへ進まず停止して報告する。

## フェーズ5: 初回のコミット済み差分レビュー（利用可能なレビューエージェントは並列）

初回レビュー対象は `develop...HEAD` の committed diff とする。`git diff develop...HEAD` と `git status --short` を確認し、未追跡ファイル・未コミット変更をレビュー対象に混ぜない。レビュー用ブリーフには `reviewRange: develop...HEAD`、base、対象ブランチ、現在のHEADを明記する。

フェーズ0で選んだ方式ごとに、次の手順を使う。

### CodeRabbit CLIを選んだ場合

1. **`reviewer`** と **`coderabbit-reviewer`** を並列起動する。CLI用ブリーフには `reviewMode: coderabbit-cli`、base `develop`、対象ブランチ、`reviewRange: develop...HEAD`、`externalEgressApproved: true`、**今回のレビュー直前に取得した**ユーザー同意の原文・時刻・対象を明示する。
2. **`coderabbit-reviewer`** は `.ai/agents/coderabbit-reviewer.md` に従い、`--agent` の認証確認と正規の権限昇格経路を使い、`coderabbit review --agent --committed --base develop` を実行する。Sandbox 外でも未認証と確認された `auth-required` の場合だけ `coderabbit auth login --agent` 後に再起動する。
3. `external-egress-confirmation-required` を返した場合はCLIを実行せず、境界条件・保守性・テスト十分性を重点確認する2件目の `reviewer` を起動する。rate-limited / error / local-execution-required の場合も理由を報告し、2件目の `reviewer` を起動する。CodeRabbitの指摘ゼロや実行失敗をapproveとして扱わない。

### GitHub Appを選んだ場合

1. `reviewer` を2件、役割分担して並列実行する。CodeRabbit CLIは起動しない。
2. 初期コミット後に、作業ブランチの push と `develop` 向けPR作成についてユーザー承認を得る。push・PR作成後、設定済みのCodeRabbit Appによる**この初期コミットのHEAD**のレビューを最大10分待機し、PR review・review thread・通常コメントを確認する。Appを起動する未確認のメンションやWebhookを推測して実行してはならない。
3. App未導入、レビュー未到着、または取得不能なら、その事実を報告してユーザーに次の指示を求める。CodeRabbit Appの未取得をapproveとして扱わない。

### 結果の統合とレビュー済みHEADの記録

取得できたすべてのレビュー結果を統合する。**同一 `ファイル:行` かつ指摘内容が実質的に同じ場合**に1件へ束ね（重要度は高い方を採用）、CodeRabbit 由来の出典タグ `[coderabbit]` は保持する。同じ行でも指摘内容が異なる場合は別指摘として両方残す。迷う場合は統合せず両方残す。**各レビューエージェントの指摘をオーケストレーターの判断で取捨選択しない**。

選択したレビュー方式のレビューが正常完了した場合だけ、現在のHEADを `<scratchpad>/last-reviewed-head-<N>.txt` に保存する。CLI方式では CodeRabbit の `approve` / `request-changes` が通常の保存条件である。ただし CodeRabbit が `external-egress-confirmation-required` / `auth-required` / `local-execution-required` / `rate-limited` / `error` を返し、代替として起動した2件目の `reviewer` が `approve` / `request-changes` で正常完了した場合は、その fallback reviewer を修正周回用のレビュー境界として保存してよい。CodeRabbitの失敗自体をapproveとして扱ってはならず、その理由は報告する。GitHub App方式では初期コミットHEADに対するAppレビュー取得が正常完了の条件である。App未取得では更新しない。

## フェーズ6: 修正・品質ゲート・周回コミット・増分再レビュー

1. レビューの must-fix / should-fix と、test-fixer の残課題を fix 対象リストにまとめる（nit は含めない）。fix 対象が空ならフェーズ7へ。
2. fix 対象を `developer` エージェントに渡して修正させる。
3. `test-fixer` を再起動して3つの品質ゲートを通す。通過後、**オーケストレーター**がこの周回の修正だけを1コミットにする。コミットメッセージには `refs #<N>` を含める。未コミット変更が残る場合は再レビューへ進まない。
4. `<scratchpad>/last-reviewed-head-<N>.txt` から `<previous-reviewed-head>` を読み、現在のHEADの祖先であることを確認する。前回レビュー済みHEADがない・不正・祖先でない場合は、レビュー範囲を推測せず停止して報告する。
   ```bash
   git merge-base --is-ancestor <previous-reviewed-head> HEAD
   git diff <previous-reviewed-head>...HEAD
   git status --short
   ```
5. フェーズ5を**この増分だけ**に絞って再実行する。reviewer の範囲は `<previous-reviewed-head>...HEAD`、CodeRabbit CLI は `coderabbit review --agent --committed --base-commit <previous-reviewed-head>` とする。CLI方式では、この現在のコミット範囲を再掲した**新しい**明示同意を実行直前に取得・記録してから起動する。初回または過去の同意記録を再利用してはならない。GitHub App方式では既存PRへ修正コミットをpushし、PRの最新HEADを取得して、その最新HEADに対するAppレビューを最大10分待機したうえで、PR review・review thread・通常コメントを確認する。App未導入、レビュー未到着、または取得不能なら、`last-reviewed-head-<N>.txt` を更新せずその事実をユーザーへ報告する。古いHEADのレビューだけで再レビュー済みと扱ってはならない。
6. 再レビューが正常完了した場合だけ、`<scratchpad>/last-reviewed-head-<N>.txt` を現在のHEADへ更新する。最大2周で収束しなければ、残課題を整理してユーザーに報告し、指示を仰ぐ。

## フェーズ7: 完了

1. 最終確認として `git status --short` が空であること、`git log --oneline develop..HEAD` に初期実装コミットと各レビュー周回コミットが記録されていること、最新の品質ゲートが通過していることを確認する。**このフェーズで追加コミットは作らない。**
2. CodeRabbit CLI方式でまだpushしていない場合は、作業ブランチの push と `develop` 向けPR作成についてユーザー承認を得てから実行する。GitHub App方式ではフェーズ5で作成済みのPRを再作成しない。
   ```bash
   git push -u origin <種別>/issue-<N>-<英語スラッグ>
   ```
3. PR作成には利用可能なら `pr-creator` skill を使用し、なければ `.github/pull_request_template.md` を読む。認証済みの `gh pr create` を使う。Codex AppでGitHubコネクタが接続済みの場合は、同等の操作にコネクタを使ってよい:
   - **ベースブランチは `develop`**（`main` ではない）。例: `gh pr create --base develop ...`
   - PR 本文には `refs #<N>` を書く（参照のみ）。**`closes #<N>` は使わない**。
   - **マージはしない**。作業ブランチ → develop のマージ、および develop → main の PR・マージはすべて人間が任意タイミングで行う（`gh pr merge` は `AGENTS.md` で禁止）。
4. ユーザーに完了報告する: 実装サマリ／初期実装・レビュー周回のコミット履歴／選択されたレビュー方式／CodeRabbit結果または未取得理由／テスト結果／作業ブランチ名／PR URL（作成した場合）。

## 中断・失敗時の原則

- 同じ操作が2回失敗したら、繰り返さず原因を分析して代替アプローチを取る。
- どのフェーズで停止しても、現在のブランチ・完了済みフェーズ・残作業をユーザーに報告する。
