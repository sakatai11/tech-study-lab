# 0013: ユーザー固有のデータを Web の共有キャッシュに載せない

- 状態: Accepted
- 日付: 2026-10-14
- 関連: Issue #242（`docs/design.md` の旧 8.3 節から移行）

## 背景

`user_id` は API の middleware が決め（ADR-0003）、Web はそれを知らない。そのため、Web の共有キャッシュ（ISR、`'use cache'`、Incremental Cache など）のキーに `user_id` を含められない。ユーザー固有のデータを共有キャッシュに載せると、別のユーザーの due 件数や学習記録が表示されるおそれがある。

## 決定

1. ユーザー固有のデータ（due 件数、学習統計、復習キュー、領域別の集計、学習分析）は共有キャッシュに載せない。
2. 認証後の画面（`/home`・`/review`・`/domains`・`/analytics`）は `dynamic = 'force-dynamic'` の通常のリクエスト時 SSR とし、Server loader をリクエストごとに実行する。
3. `cacheComponents`、`'use cache'`、ISR 用の Incremental Cache・再検証 Queue（Durable Object・R2・KV）は使わない。
4. 同じリクエストの中で取得を共有する React の `cache()` は許可する。これはユーザーをまたがない。
5. 鮮度は、解答後や画面への復帰時に `router.refresh()` で Server loader を再実行して回復する。

## 境界

- ユーザー固有のデータを読まない画面（公開トップ `/`、教材一覧 `/learn`、教材・演習の content route）は、ビルド時の静的生成（SSG）にしてよい。共通シェルの due バッジは、表示後に Client leaf が取得し、静的な成果物に含めない。
- 将来、キャッシュキーにユーザーを含められる仕組みを導入する場合は、この ADR を置き換える。

## 検証

- [rendering-boundaries.test.ts](../../apps/web/src/app/rendering-boundaries.test.ts): 認証後の画面が `force-dynamic` を宣言し、Web のソースが共有データキャッシュを使わない
- [app-shell.test.tsx](../../apps/web/src/app/_components/app-shell.test.tsx): 共通シェルのストリークを Server 描画に含めず、マウント後に取得する
- [cloudflare-config.test.ts](../../apps/web/scripts/cloudflare-config.test.ts): Cache Components と ISR 用のキャッシュ基盤を有効にしていない
- [verify-build.ts](../../apps/web/scripts/verify-build.ts): ビルド成果物で、認証後の画面が prerender されていない（CI の `verify:build`）

テストで直接検証しない決定: 決定 4（React の `cache()` をリクエスト内に限って使う）と決定 5（`router.refresh()` で鮮度を回復する）は実装の規約であり、レビューで確認する。
