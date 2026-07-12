# AGENTS.md

このファイルは **tech-study-lab** で作業する際のガイドです。

## プロジェクト概要

ソフトウェア学習アプリ。個人エンジニアが「セキュリティ / FE・BEフレームワーク / アーキテクチャ設計」を、読み物（教材）＋4択問題演習で学ぶ。解答ログを SRS（間隔反復）で分析し出題を最適化する。**開発自体をAI駆動で進めることが主目的。**

設計の一次ソースは [`docs/design.md`](./docs/design.md)。**実装判断は必ずこれに従う。** 仕様と実装が乖離した場合、先に `docs/design.md` を更新してから実装する（仕様駆動開発）。

## 技術スタック

- **フロント**: Next.js（App Router）→ Cloudflare Workers（OpenNext）
- **API**: Hono → Cloudflare Workers（主要APIを担当）
- **DB**: Cloudflare D1（SQLite）＋ Drizzle ORM
- **型/バリデーション**: TypeScript strict / Zod（Honoの `zValidator` とフロントで共有）
- **Lint/Format**: Biome
- **テスト**: Vitest
- **CI**: GitHub Actions
- **パッケージ管理**: pnpm workspaces（monorepo）

## リポジトリ構成

```
apps/web/        # Next.js — 画面
  src/app/       # App Router（src/ 構成）
apps/api/        # Hono — 主要API（Cloudflare Workers）
  src/index.ts   # エントリ・AppType エクスポート
  src/client.ts  # hc 型安全クライアントファクトリ
packages/shared/ # Drizzleスキーマ・Zodスキーマ・共有型（単一ソース）
content/         # 教材・問題（Markdown + frontmatter）= 一次ソース
docs/design.md   # 設計文書（一次ソース）
```

- フロント ⇔ API は Hono の `hc`（型安全RPC）で接続する。
- 型・スキーマは `packages/shared` に集約し、二重定義しない。

## データの持ち方（重要）

ハイブリッド構成。混同しないこと。

- **教材・問題** = `content/` 配下の Git管理ファイル（一次ソース）。デプロイ/ビルド時に D1 へ seed/upsert。
- **解答ログ・SRS状態** = D1 のみ（動的・ユーザー分離）。

「ファイルが一次ソース、D1は配信・集計用」。教材本文を D1 に直接書き込む実装はしない。

## AI駆動開発の原則

### ガードレール優先

- TypeScript は strict。`any` を避け、型は `packages/shared` から共有する。
- **SRSロジックは純粋関数として切り出し、Vitest で重点的にテストする**（副作用と分離）。
- バリデーションは Zod に集約（API入力は `zValidator`、フロントも同じスキーマを使う）。
- 変更後は影響範囲に応じて `pnpm typecheck`・`pnpm lint`・`pnpm test` を実行する。CI では型チェック・lint・test・build を PR ゲートとする。

### TDD 戦略

すべての層を一律にテストファーストで実装せず、**仕様先行の選択的 TDD**を採用する。

#### バックエンド

service を中心にテストファーストで進める。

1. `docs/design.md` で仕様を確定する。仕様変更が必要なら、実装やテストより先に更新する。
2. `packages/shared` の Zod スキーマで API の入出力契約を定義する。
3. Hono・D1・Drizzle に依存しない service のテストを、インメモリ fake deps を使って先に書く。
4. テストを満たす最小限の service 実装を書く。
5. 薄い route と DAL を実装する。
6. 主要経路を Cloudflare Workers + migration 適用済みのローカル D1 で貫通テストする。

- 純粋関数と service はテストファーストを原則とする。
- route は HTTP 契約、DAL は実 D1 のクエリ・制約・upsert・`db.batch()` を重点的に検証し、service の振る舞いを重複してテストしない。

#### フロントエンド

- UI・スタイル・単純な presentational component は実装とブラウザ確認を先に行い、重要な振る舞いだけを後からテストする。
- mapper・ViewModel 変換、hook・reducer、Quiz/Review の状態遷移、join・sort・filter などの純粋ロジックはテストファーストを原則とする。
- API wrapper や内部 DOM 構造をなぞるテストを増やさず、ユーザーが観測できる振る舞いを少数の統合テストで検証する。
- バグ修正は、安定して自動化できる場合、失敗する回帰テストを先に書く。CSS・ブラウザ固有の表示問題はブラウザまたはスクリーンショットで修正前後を確認する。

共通して、テストを仕様の一次ソースにはしない。優先順位は **`docs/design.md` → 共有 Zod 契約 → テスト → 実装**とする。詳細はフロントエンドが `docs/design.md` §9.8、バックエンドが §10.9 を参照する。Claude Code では `.claude/rules/testing.md` も適用する。

### 作業の進め方

- 大きな変更の前に `docs/design.md` を確認し、必要なら先に更新する。
- 既存のパターン（命名・ディレクトリ・コードスタイル）に合わせる。Biome の設定に従う。
- 新機能は「Walking Skeleton と同じ縦切りパターン」で追加する（教材→出題→解答記録→SRS）。
- 機能実装は issue 駆動で進める（仕様を GitHub issue に登録してから実装に着手する）。

### ブランチ戦略（Git Flow 型）

- `main` は保護。**直接コミットしない**。リリース用ブランチ。
- `develop` が統合ブランチ。作業ブランチは常に `develop` から切る。
- 作業ブランチは Conventional Branch 命名: `<種別>/issue-<番号>-<英語スラッグ>`（種別: `feature` / `fix` / `refactor` / `docs` / `test` / `chore`）。
- feature → develop は PR を作成する（**マージは人間**）。`develop` → `main` の PR・マージは人間が任意タイミングで行う。
- `gh pr merge` は使わない（マージは常に人間の判断）。

## 進捗の確認方法

進捗はこのファイルに書かず、実装コード・`git log`・`docs/design.md` から判断する。

## やらないこと（スコープ外）

- コンテンツ生成型の適応学習（LLMによる問題自動生成・改訂）
- 記述式・コード問題の採点（`question.type` で拡張ポイントのみ確保）
- 認証・課金などの公開機能（データ設計のユーザー分離だけ先行）
