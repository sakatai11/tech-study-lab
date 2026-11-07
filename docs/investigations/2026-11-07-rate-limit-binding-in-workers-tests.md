# Workers のテストで Rate Limiting binding を供給できない制約

確認日：2026-11-07。[テスト方針](../testing.md) の Workers binding の検証を、現在の依存でどう行っているかの記録。決定は [ADR-0004](../adr/0004-persistent-write-rate-limit.md) が持つ。

## 制約

`apps/api` のテスト基盤 `@cloudflare/vitest-pool-workers@0.8.0` は、内部で Wrangler `4.0.0` を使う。このバージョンは `ratelimits` を未知の top-level field として扱うため、workerd 上の結合テストに実際の Rate Limiting binding を渡せない。本番用の Wrangler は `apps/api/package.json` の `4.103.0` である。

## 代わりの確認

- route の 429 / 503 の契約と D1 が変わらないことは、結合テストで拒否・例外を返す fake を渡して検証する。
- binding の名前・窓・上限は、`wrangler.toml` を読む単体テストで ADR-0004 の表と照合する。
- `pnpm --filter @tsl/api build`（Wrangler `4.103.0` の `deploy --dry-run`）を CI で実行し、出力で `ANSWERS_RATE_LIMITER`（60 / 60 秒）と `LESSON_VIEWS_RATE_LIMITER`（30 / 60 秒）が解決されることを確認する。

## 見直す条件

`@cloudflare/vitest-pool-workers` を更新し、内部の Wrangler が `ratelimits` を扱えるようになったら、結合テストで実 binding の正常系を通せるか再確認する。
