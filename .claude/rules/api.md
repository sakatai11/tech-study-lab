---
paths:
  - 'apps/api/**'
---

# apps/api（Hono）ルール

- **全エンドポイントの入力に `zValidator` を適用する**（query / param / json すべて）。スキーマは `packages/shared` から import する。
- `src/index.ts` の `AppType` エクスポートを壊さない（フロントの `hc` 型安全 RPC の要）。ルート定義はメソッドチェーンで書き、型推論を維持する。
- 教材・問題の本文を D1 に直接書き込む実装はしない。`content/` が一次ソース、D1 は seed/upsert された配信・集計用。
- 解答ログ・SRS 状態の書き込みは必ず `user_id` でユーザー分離する。
- エラーレスポンスに内部情報（スタックトレース・SQL）を含めない。
- SRS ロジックは Hono ハンドラ内に直接書かず、純粋関数（`packages/shared` または専用モジュール）を呼び出す形にする。
