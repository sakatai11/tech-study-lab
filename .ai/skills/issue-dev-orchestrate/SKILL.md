---
name: issue-dev-orchestrate
description: GitHub issue に登録された仕様を起点に、調査・実装・品質ゲート・独立レビュー・修正を経て develop 向けPRへ渡す issue 駆動開発パイプライン。「issue #N を実装して」「/issue-dev-orchestrate N」などで起動する。
---

# Issue 駆動開発パイプライン

GitHub issue の仕様を、品質ゲート通過済み・独立レビュー済みのコミット列として作業ブランチに積み、`develop` 向けPRで人間のマージ判断に渡す。

調査・実装・品質修正は、このスキルを実行している自分が1つのコンテキストで一貫して行う。進め方は任せる。以下のゴール・不変条件・完了条件を守ること。

Codexでは開始直後と完了直前に `./.ai/hooks/log-skill-usage.sh --runtime codex --skill issue-dev-orchestrate --status started|completed` を実行して共通ログへ記録する（Claudeではhookが自動記録する）。

第1引数はIssue番号である。番号がなければ確認して停止する。

## 不変条件

**効率や「今回は問題ない」を理由に破らない。**

### ブランチとコミット

- `main` では作業しない。Issue作業ブランチは最新の `origin/develop` から `<種別>/issue-<番号>-<英語スラッグ>` で切る。既存のIssue作業ブランチを継続する場合は、最新の `develop` を通常のmergeで取り込む。force push や履歴の書き換えはしない。
- 作業開始時に未コミット変更があれば、今回の作業か無関係なユーザー変更かを見分ける。ユーザー変更を stash・破棄・コミットしない。
- マージは人間が判断する。`gh pr merge` は使わない。
- コミットとPR本文のIssue参照は `refs #<N>` とし、`closes #<N>` は使わない。
- 失敗を `|| true` などで隠さない。

### 仕様

- 仕様の一次ソースは `docs/design.md` である。Issueと設計が乖離していれば、実装より先に `docs/design.md` を更新する。
- 変更する領域に対応する `.ai/rules/*.md`（AGENTS.md の「パス別ルール」）を読んでから実装する。
- 受け入れ条件・対象範囲・権限を広げる必要が出たら、止めてユーザーに判断を求める。

### レビュー

- 実装したコンテキストでの自己レビューで代替しない。`reviewer` サブエージェント（`.ai/agents/reviewer.md`）で独立レビューを行う。サブエージェントを使えない環境では、その旨を報告して別セッションでのレビューを求める。
- レビューが正常に完了しなかった場合（失敗・timeout・未取得・認証エラー）を approve として扱わない。正常に完了し、対象範囲内の must-fix / should-fix が0件なら、それは正当な approve である。
- 範囲、重要度、`docs/design.md` の章マッピングは `.ai/review-guidelines.md` に従う。範囲外の問題は修正対象に含めず、別Issue候補として報告する。

### 外部送信

- 別モデルCLIレビューには、ホストと**別の提供元**のCLIを使う（Claude Codeホストでは Codex CLI、CodexホストではClaude CLI）。コマンド、モデル指定、read-only 実行、認証、Keychain wrapper は `.ai/runtime-compatibility.md` に従う。
- private な内容を外部CLIへ送る前に、送信先と、送る内容（差分の範囲、ブリーフ、CLIに読ませるファイル）を具体的に示して、ユーザーの明示同意を得る。同じ実行の中で、送信先と範囲が同じ再レビューに限り、同意を再利用できる。
- 権限や Sandbox の迂回フラグを使わない。

## 進め方の目安

1. **準備**: Issueを読み、作業ブランチを用意する。`git merge-base --is-ancestor origin/develop HEAD` が成り立つことを確かめる。`pnpm architecture:check` が失敗する場合は、Knowledge Graph基盤の不整合として報告し、Issueの修正と混ぜない。
2. **調査と方針**: 受け入れ条件を分解し、`docs/design.md` の該当章を確認する。構造の調査は `references/architecture-context.md` のとおり `pnpm architecture:query` から始めると速い。方針が拮抗する場合、または要確認事項が実装を左右する場合だけユーザーに確認する。方針はIssueにコメントで残す。
3. **実装**: 新しいロジック、特にSRSと純粋関数にはテストを書く（`.ai/rules/testing.md`）。`content/` を変更する場合は `content-new` スキルに従う。
4. **品質ゲート**: 後述のゲートを通してからコミットする。
5. **独立レビュー**: `reviewer` に、`<effectiveBase>...HEAD` の全累積差分（`effectiveBase` = `git merge-base origin/develop HEAD`）と、Issue番号・対象機能・対象ファイル・受け入れ条件・範囲外の扱いを渡す。
6. **別モデルCLIレビュー**: 後述の方針で必要な場合だけ、同意を取得してからオーケストレーター自身が直接実行する。出力は自分で読み、`.ai/review-guidelines.md` の分類と重要度で判定する。
7. **修正と再レビュー**: 対象範囲内の must-fix / should-fix を修正し、ゲートを再度通してコミットする。修正した差分と指摘の解消状況を再レビューさせる。修正後に新しく追加してよい指摘は、修正が起こした回帰、受け入れ条件の未達、重大なセキュリティ・データ破壊だけに限る。
8. **PR**: push とPR作成はユーザーの承認を得てから行う。ベースは `develop`、本文は `.github/pull_request_template.md` に従う。既存PRがあれば作り直さない。

## 品質ゲート

```bash
pnpm typecheck
pnpm lint                 # Biome と dependency-cruiser
pnpm test
pnpm architecture:check
pnpm architecture:test
```

- **snapshot の更新**: コード・設定・依存を変えた場合は、`pnpm architecture:extract` で `architecture/graph.json` を再生成する。差分が変更内容から説明できる場合だけコミットに含める。説明できない差分は、原因を解消するまでゲート通過扱いにしない。
- **ハーネス変更時**: `.ai/`、`.claude/`、`.codex/`、`.agents/`、`AGENTS.md`、`docs/ai-coding-agents.md` を変えた場合は `pnpm test:hooks` も通す。
- **教材変更時**: `content/` を変えた場合は `pnpm content:validate` を通す。D1を書き換える `content:sync` は検証に使わない。
- **既存失敗の扱い**: 今回の変更と無関係な既存の失敗（ベースライン）は直さない。ただし pass とも報告せず、`fail（ベースライン）` として根拠と一緒に報告する。
- **テストを弱めない**: 実装のバグを隠すためにテストを弱めない。

## 別モデルCLIレビューの方針

`reviewPolicy` はユーザーの指定に従う。指定がなければ `risk-based` とする。

- `always`: 常に実行する。
- `never`: ユーザーが明示した場合だけ選べる。
- `risk-based`: 変更が次のいずれかに当たれば実行する。当たらない場合、つまりコメント・誤字・文書だけのような実行されない変更に限る場合は、理由を記録して省略できる。
  - 本番の実行コード、または利用者から観測できる振る舞い
  - API・スキーマ・migration などの契約
  - 認証・認可・入力検証・秘密情報
  - SRS・採点・学習状態
  - 依存関係・build・CI・deploy
  - 複数パッケージや複数レイヤーにまたがる変更
  - 内部レビューで must-fix / should-fix または未解消の不確実性が出た

「実行が必要」と判定したレビューを、失敗や timeout を理由に「不要」へ切り替えない。実行できなかった場合は、その状態のまま報告する。

## 完了条件

- 作業checkoutに未コミットの変更がない。
- 最終HEADまでのすべての変更が、`reviewer` の approve を受けている。必要な場合は別モデルCLIの approve も受けている。
- ローカルの品質ゲートと、PR CI が通過している。
- `develop` 向けPRを作成し、URLを報告している。
- スパイクやフェーズ分割を伴う作業では、[references/phase-reconciliation.md](references/phase-reconciliation.md) の照合を済ませている。

最終報告には次を含める。

- 実装内容
- 品質ゲートの結果（ベースライン失敗を含む）
- `reviewPolicy` と、別モデルCLIの実行・省略の判断根拠
- 指摘と対応
- 別Issue候補
- PRのURL

## 中断・失敗時

同じ操作が2回失敗したら、繰り返さずに原因を分析し、別の方法を試す。停止するときは、ブランチ、完了した作業、残作業を報告する。
