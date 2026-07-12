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

## AI ハーネスの共通管理

- 共通スキルの一次ソースは `.ai/skills/`、共通サブエージェント定義は `.ai/agents/`。
- `.claude/skills/` と `.agents/skills/` は同じ `.ai/skills/` への発見用シンボリックリンク。本文を複製・直接編集しない。
- `.claude/agents/` は `.ai/agents/` へのシンボリックリンク。Claude Code 固有の settings / rules / hooks は `.claude/` に残す。
- `.codex/agents/*.toml` はCodexネイティブのカスタムエージェント登録。詳細指示を複製せず、`developer_instructions` から対応する `.ai/agents/*.md` を読む。
- 共通hook処理は `.ai/hooks/`、ランタイム別アダプターは `.claude/hooks/` / `.codex/hooks/` に置く。配線生成後は `pnpm sync:agents --check`、fixture検証は `pnpm test:hooks` を実行する。
- Codexサブエージェントは通常 `gpt-5.6-terra` を使う。CodeRabbit結果の正規化だけは `gpt-5.6-luna`。難易度が高い実装・セキュリティレビュー時だけ一時的に `gpt-5.6` へ上げる。
- 共通定義の変更後は、Claude/Codex 両方のリンク切れとスキル検証を行う。

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
- 変更後は型チェック・lint・test を通す。CI（GitHub Actions）が PR ゲート。

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

## コマンド

> pnpm は corepack で有効化（`corepack enable`）。

```bash
# 依存インストール
pnpm install

# 開発
pnpm --filter @tsl/web dev    # Next.js dev server (localhost:3000)
pnpm --filter @tsl/api dev    # Hono / wrangler dev

# 品質チェック
pnpm biome check .
pnpm test
pnpm typecheck
```

## 進捗の確認方法

進捗はこのファイルに書かず、実装コード・`git log`・`docs/design.md` から判断する。

## やらないこと（スコープ外）

- コンテンツ生成型の適応学習（LLMによる問題自動生成・改訂）
- 記述式・コード問題の採点（`question.type` で拡張ポイントのみ確保）
- 認証・課金などの公開機能（データ設計のユーザー分離だけ先行）
