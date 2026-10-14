# AGENTS.md

## プロジェクト概要

ソフトウェア学習アプリ。個人エンジニアが「セキュリティ / FE・BEフレームワーク / アーキテクチャ設計」を、読み物（教材）＋4択問題演習で学ぶ。解答ログを SRS（間隔反復）で分析し出題を最適化する。**開発自体をAI駆動で進めることが主目的。**

設計契約は [ADR](./docs/adr/README.md)（理由と境界）とテスト（不変条件の検証）が持つ。**実装判断は関連する ADR に従う。** 契約を新設・変更する Issue でだけ、実装より先に ADR を作る（運用は [ADR-0001](./docs/adr/0001-contracts-as-adr-and-tests.md)）。UI の文言や表示の細部、リファクタリングはコードとテストだけで変更する。プロダクト方針・依存方向・データフローの層は [`docs/design.md`](./docs/design.md)、画面・教材・運用の規約は `docs/design-system.md`・`docs/content-guidelines.md`・`docs/deployment.md` が持つ。現在の構造はコード・共有 Zod・Knowledge Graph を一次ソースとする。

## AI駆動開発の原則

### TDD 戦略

すべての層を一律にテストファーストで実装せず、**契約先行の選択的 TDD**を採用する。

### パス別ルール

変更・レビューするファイルの領域に対応する `.ai/rules/*.md` を、作業前に読む。Claude Code は `.claude/rules/` のリンク経由で `paths` frontmatter に従い自動読み込みするが、他のランタイムは自動では読まないため、次の対応で参照する。

- `.ai/rules/api.md`: `apps/api/` 配下
- `.ai/rules/web.md`: `apps/web/` 配下
- `.ai/rules/shared.md`: `packages/shared/` 配下
- `.ai/rules/content.md`: `content/` 配下
- `.ai/rules/testing.md`: `apps/api` / `apps/web` / `packages/shared/src` の TypeScript、テストファイル、`vitest.config.*`

対象パスの一次ソースは各ルールの `paths` frontmatter である。

### レビュー規約

コードレビューの規約は [`.ai/review-guidelines.md`](./.ai/review-guidelines.md) を単一ソースとする。読む ADR と `docs/design.md` の章の対応（変更ファイルの領域 → 読む文書）、レビュー観点、役割別のレビュープロファイル（`accuracy-first` / `spec-compliance-first`）、重要度（must-fix / should-fix / nit）の定義はすべてそこにある。**本書を含む他の文書で再掲しない。**

レビューを行うときは、担当するプロファイルを1つ選び、そのプロファイルの優先順に従う。複数のレビュアーを並列に走らせる場合は、異なるプロファイルを割り当てて補完させる。

### ブランチ戦略（Git Flow 型）

- `main` は保護。**直接コミットしない**。リリース用ブランチ。
- `develop` がKnowledge Graph-firstで構造調査する開発系統の統合ブランチ。新しいIssue作業ブランチは `develop` から切る。Issueの具体語でGraph queryを先に行い、コード・設定・関連 ADR・`docs/design.md` で再確認する。Graph対象外・空結果・曖昧な結果の場合だけ通常検索へフォールバックする。
- 作業ブランチは Conventional Branch 命名: `<種別>/issue-<番号>-<英語スラッグ>`（種別: `feature` / `fix` / `refactor` / `docs` / `test` / `chore`）。
- 作業ブランチ → `develop` は PR を作成する（**マージは人間**）。`develop` から `main` へ反映する時期・方法は人間が判断する。
- `gh pr merge` は使わない（マージは常に人間の判断）。