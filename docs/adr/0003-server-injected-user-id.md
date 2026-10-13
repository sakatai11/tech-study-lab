# 0003: userId はサーバーの middleware だけが決める

- 状態: Accepted
- 日付: 2026-10-13
- 関連: Issue #240（`docs/design.md` の旧 7.2 節の項目と旧 10.4 節から移行）

## 背景

現在は単一ユーザーで運用し、アプリ内にログインやセッションを持たない。本番ではアクセス制御を Cloudflare Access が担う。クライアントが `userId` を送る設計にすると、将来公開したときに他人の学習記録を読み書きできてしまう。さらに、認証を導入するたびに API 契約と画面の両方を変える必要がある。

## 決定

1. `userId` は API の `userContext` middleware だけが request context に注入する。現在は固定ユーザーを注入する。
2. route・service・DAL は、middleware が保証した `userId` を受け取るだけとし、自分でユーザーを解決しない。
3. クライアントが送った `userId` は一切信用しない。ユーザー固有データを書き込むリクエストのスキーマは `userId` を含まず、未知のキーを拒否する（`strict`）。`userId` を含むリクエストは 400 とし、D1 を変更しない。
4. 解答ログ・SRS 状態・閲覧ログの読み書きは、すべてこの `userId` で分離する。

## 境界

- 適用対象は、ユーザー固有データを読み書きするすべての endpoint である。public entrypoint と Service Binding 用の internal entrypoint の両方で同じ user route を `userContext` の後に mount する。
- 教材・問題などの共有データ（content、`questions`）は対象外。
- 将来の認証導入では、`userContext` の中身を「固定値を返す」から「認証情報から `userId` を引く」へ差し替えるだけにする。画面・API 契約・route 以降の層は変えない。
- Cloudflare Access による保護は public entrypoint の別の境界であり、この ADR は扱わない。

## 検証

- [api.test.ts](../../packages/shared/src/schema/api.test.ts): 解答と閲覧記録のリクエストスキーマが、クライアント送信の `userId` を拒否する
- [core-endpoints.integration.test.ts](../../apps/api/src/core-endpoints.integration.test.ts): クライアント指定の `userId` を 400 で拒否して D1 を変更しない。記録は middleware が確定したユーザーで行い、ユーザー間で集計を分離する

テストで直接検証しない決定: 決定 2（route・service・DAL が自分でユーザーを解決しない）は構造上の規約であり、レビューで確認する。
