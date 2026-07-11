---
name: d1-migration
description: Drizzle スキーマ変更から D1 マイグレーション生成・ローカル適用・検証までの安全手順。「スキーマを変更して」「マイグレーションを作って」「テーブルを追加して」などDBスキーマに触る作業で必ず使用する。本番適用（--remote）はユーザー承認必須。
argument-hint: "[スキーマ変更の内容]"
---

# D1 / Drizzle マイグレーション手順

スキーマの単一ソースは `packages/shared/src/db/schema.ts`。マイグレーションは `apps/api` の scripts で管理する（`migrations_dir = drizzle/migrations`、DB名 `tech-study-lab`）。

## 原則（design.md §12.6 / §12.4）

- **マイグレーションは追加中心の後方互換**にする（カラム削除・リネーム・型変更は避け、追加＋段階移行で対応）。稼働中の旧バージョンを壊さないことがデプロイ順序（スキーマ→データ→API→画面）の前提。
- 生成された SQL は**必ず目視レビュー**してから適用する。`DROP` / `ALTER ... DROP` を含む場合は理由をユーザーに説明して承認を得る。
- 一度適用したマイグレーションファイルは編集しない（新しいマイグレーションを重ねる）。

## 手順

### 1. スキーマ変更

`packages/shared/src/db/schema.ts` を編集する。ユーザー分離（`user_id`）と design.md §4.4 のスキーマ草案との整合を確認する。

### 2. マイグレーション生成

```bash
pnpm --filter @tsl/api db:generate
```

- 初回実行で drizzle.config が無い等のエラーになったら、`apps/api/drizzle.config.ts` を作成する（schema: `../../packages/shared/src/db/schema.ts`、out: `./drizzle/migrations`、dialect: `sqlite`）。
- 生成された `apps/api/drizzle/migrations/*.sql` を読み、意図した変更だけが含まれるか確認する。

### 3. ローカル適用

```bash
pnpm --filter @tsl/api db:migrate:local
```

### 4. 検証

```bash
# テーブル定義の確認
pnpm --filter @tsl/api exec wrangler d1 execute tech-study-lab --local \
  --command "SELECT name, sql FROM sqlite_master WHERE type='table';"

# 型・テストの通過確認
pnpm typecheck && pnpm test
```

Drizzle スキーマから導出される型を使う箇所（dal・API・フロント）に波及がないか `pnpm typecheck` で確認する。

### 5. 本番適用（ユーザー承認必須）

**ユーザーの明示承認なしに実行しない。** 承認後、design.md §12.4 の順序（マイグレーション → content sync → api → web）に従う:

```bash
pnpm --filter @tsl/api exec wrangler d1 migrations apply tech-study-lab --remote
```

## トラブル時

- ローカル D1 を作り直したい場合: `.wrangler/state` の削除は**ローカルの解答ログ・SRS 状態も消える**ことをユーザーに伝えてから行う。
- 適用済みマイグレーションの取り消しは down migration を新規作成で対応（ファイル削除・編集はしない）。
