---
paths:
  - 'packages/shared/**'
---

# packages/shared ルール

- ここが型・スキーマの**単一ソース**。Drizzle スキーマ・Zod スキーマ・共有型をここ以外に定義しない（`apps/` 側での再定義・コピーは禁止）。
- 型は Zod スキーマから `z.infer` で導出する。手書きの重複 interface を作らない。
- content frontmatter の Zod は `schema/content.ts`（design.md 5.1 / 5.2 の Content data 型推論元）。
- スキーマ変更時は `apps/api`（zValidator）と `apps/web`（フォーム・表示）の両方への影響を確認し、`pnpm typecheck` を必ず通す。
- DB スキーマ変更は Drizzle マイグレーションを伴う（ADR-0011。動的データの意味は design.md 5.8）。
