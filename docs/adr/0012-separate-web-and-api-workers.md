# 0012: Web と API を別の Worker にし、書き込みは Hono API を通す

- 状態: Accepted
- 日付: 2026-10-14
- 関連: Issue #242（`docs/design.md` の §3.1・§8.3・§8.4 から移行）

## 背景

Web（Next.js 互換）と API（Hono）は、Next.js の Route Handler に Hono を載せて1つの Worker にまとめることもできる。しかしその場合、API が自分の Worker 設定（D1、将来の Cron Triggers・Queues）を持てず、デプロイも Web のビルドに巻き込まれる。リクエストが「Next.js のルーター → Route Handler → Hono」の二段になり、middleware の責務も曖昧になる。さらに、書き込みを Server Actions で行うと、API の契約と `user_id` の注入点（ADR-0003）が2か所に分かれる。

## 決定

1. Web と API は別の Worker としてデプロイする。Route Handler に Hono を載せる構成は採らない。API の契約（`AppType`）は `apps/api` に一本化する。
2. Web の Server loader は、名前付き Service Binding（`API` → `InternalApi`）で API を呼ぶ。本番では binding を必須とし、欠けていれば即座に失敗させる。本番以外で binding がない場合だけ、設定した URL に切り替える。
3. ブラウザの Client hook は API Worker の公開 URL を呼ぶ。Access の cookie を送るため `credentials: 'include'` を指定し、API は `WEB_ORIGIN` だけを CORS で許可する。
4. 書き込み（mutation）は Client hook から Hono API を呼ぶ。Server Actions は採用しない。

## 境界

- Service Binding を通っても `hc<AppType>` の型安全な RPC は変わらない（差し替わるのは fetch の実装だけ）。
- 同じゾーンのカスタムドメインへ移り、同一オリジンで API を配信するようになった場合は、CORS の扱いを見直す。
- 重いフォームなど Server Actions が必要な要件が出た場合は、この ADR を置き換える。

## 検証

- [cloudflare-config.test.ts](../../apps/web/scripts/cloudflare-config.test.ts): Web Worker が API Worker の `InternalApi` を Service Binding で参照する
- [api-server.test.ts](../../apps/web/src/lib/api-server.test.ts): Server loader の API client は binding を使い、本番で binding がなければ失敗し、本番以外でだけ URL に切り替える
- [api.test.ts](../../apps/web/src/lib/api.test.ts): ブラウザ用の API client が `credentials: 'include'` を付ける
- [index.test.ts](../../apps/api/src/index.test.ts): CORS は `WEB_ORIGIN` だけに credentialed な許可を返す
- [rendering-boundaries.test.ts](../../apps/web/src/app/rendering-boundaries.test.ts): Web のソースに Server Actions がない

テストで直接検証しない決定: 決定 1 のうち「Route Handler に Hono を載せない」は構成上の規約であり、レビューで確認する。
