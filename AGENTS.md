# AGENTS.md

## プロジェクト概要

ソフトウェア学習アプリ。個人エンジニアが「セキュリティ / FE・BEフレームワーク / アーキテクチャ設計」を、読み物（教材）＋4択問題演習で学ぶ。解答ログを SRS（間隔反復）で分析し出題を最適化する。**開発自体をAI駆動で進めることが主目的。**

設計契約は [ADR](./docs/adr/README.md)（理由と境界）とテスト（不変条件の検証）が持つ。**実装判断は関連する ADR に従う。** 契約を新設・変更する Issue でだけ、実装より先に ADR を作る（運用は [ADR-0001](./docs/adr/0001-contracts-as-adr-and-tests.md)）。UI の文言や表示の細部、リファクタリングはコードとテストだけで変更する。プロダクト方針・依存方向・データフローの層は [`docs/design.md`](./docs/design.md)、画面・教材・運用の規約は `docs/design-system.md`・`docs/content-guidelines.md`・`docs/deployment.md` が持つ。現在の構造はコード・共有 Zod・Knowledge Graph を一次ソースとする。

## AI駆動開発の原則

### TDD 戦略

すべての層を一律にテストファーストで実装せず、**契約先行の選択的 TDD**を採用する。層ごとの検証範囲と書き方は [`docs/testing.md`](./docs/testing.md) に従う。

### 作業前に読む文書

変更する領域に関係する ADR を [ADR 索引](./docs/adr/README.md) から選び、層と依存方向・データフローは `docs/design.md` で確かめてから着手する。領域ごとの入口は次のとおり。どの ADR と章を読むかの対応表は [`.ai/review-guidelines.md`](./.ai/review-guidelines.md) の「読む文書」が持つ。

- `apps/api/`・`apps/web/`・`packages/shared/`: `docs/design.md` の依存方向（第4章）とデータフロー（第5章）
- テスト: [`docs/testing.md`](./docs/testing.md)
- `content/`: [`docs/content-guidelines.md`](./docs/content-guidelines.md) と `content-new` スキル
- ビルド・デプロイ・migration: [`docs/deployment.md`](./docs/deployment.md) と `d1-migration` スキル

### レビュー規約

レビュー範囲・観点・重要度・読む文書・レビュープロファイル・独立レビューと別モデルCLIレビューの実施条件・Jevの実行条件は [`.ai/review-guidelines.md`](./.ai/review-guidelines.md) を単一ソースとし、本書には再掲しない。

### ブランチ戦略（Git Flow 型）

- `main` は保護。**直接コミットしない**。リリース用ブランチ。
- `develop` がKnowledge Graph-firstで構造調査する開発系統の統合ブランチ。新しいIssue作業ブランチは、`git fetch origin develop` で取得した最新の `origin/develop` から切る。Issueの具体語でGraph queryを先に行い、コード・設定・関連 ADR・`docs/design.md` で再確認する。Graph対象外・空結果・曖昧な結果の場合だけ通常検索へフォールバックする。
- 作業ブランチは Conventional Branch 命名: `<種別>/issue-<番号>-<英語スラッグ>`（種別: `feature` / `fix` / `refactor` / `docs` / `test` / `chore`）。
- 作業ブランチ → `develop` は PR を作成する（**マージは人間**）。`develop` から `main` へ反映する時期・方法は人間が判断する。
- `gh pr merge` は使わない（マージは常に人間の判断）。
- エージェントは `main` / `develop` へ直接 push しない。push するのは作業ブランチだけとする。
- 品質ゲートと独立レビューを通過したら、ユーザーへの個別確認なしで作業ブランチを push し、`develop` 向けPRを作る。本文は `.github/pull_request_template.md` に従い、既存PRがあれば作り直さない。
- 既存の作業ブランチを続ける場合は、最新の `develop` を通常の merge で取り込む。force push や履歴の書き換えはしない。
- コミットと作業PRの本文では、Issue を `refs #<N>` で参照し、`closes #<N>` は使わない。Issue を閉じる判断は `develop` → `main` のリリースPRで行う（`release-main-pr` スキル）。
- 作業開始時の未コミット変更が今回の作業でないなら、stash・破棄・コミットしない。

### 品質ゲート

コミットの前に次を通す。PR CI も同じゲートを実行する。

```bash
pnpm typecheck
pnpm lint                 # Biome と dependency-cruiser
pnpm test
pnpm architecture:check
pnpm architecture:test
```

- **snapshot の更新**: コード・設定・依存を変えた場合は、`pnpm architecture:extract` で `architecture/graph.json` を再生成する。コミットしてよい差分の条件は [`architecture/README.md`](./architecture/README.md#issue-開発での使い方) に従う。
- **ハーネスを変えたとき**: `.ai/`、`.claude/`、`.codex/`、`.agents/`、`AGENTS.md`、`docs/ai-coding-agents.md` を変えた場合は `pnpm test:hooks` も通す。変更内容ごとの確認は [`docs/ai-coding-agents.md`](./docs/ai-coding-agents.md#9-変更時の完了条件) に従う。
- **教材を変えたとき**: `content/` を変えた場合は `pnpm content:validate` を通す。D1 を書き換える `content:sync` は検証に使わない。
- **既存の失敗**: 今回の変更と無関係な既存の失敗は直さない。pass とも報告せず、`fail（ベースライン）` として根拠と一緒に報告する。着手前から `pnpm architecture:check` が失敗する場合は、Knowledge Graph 基盤の不整合として報告し、Issue の修正と混ぜない。
- **失敗を隠さない**: 実装のバグを隠すためにテストを弱めない。失敗を `|| true` などで握り潰さない。

### 止めて確認する場面

次の場合は実装を進めず、ユーザーに判断を求める。

- 受け入れ条件・対象範囲・権限を広げる必要が出た。
- Issue の要求が既存の ADR と矛盾する。
- 方針が拮抗している、または未確定の事項が実装を左右する。
