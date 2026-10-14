# 0008: 本番の公開 API は Worker 内で Cloudflare Access の JWT を検証する

- 状態: Accepted
- 日付: 2026-10-14
- 関連: Issue #242（`docs/design.md` の §3.1「本番アクセス境界」・§7.2「公開・認証境界」から移行）。元の判断は Issue #112

## 背景

アプリはログインやセッションを持たず、本番の利用者の制限を Cloudflare Access に任せている。Access のアプリケーションプロキシだけに頼ると、Worker の公開 URL へ直接届く経路や、アプリ内での認可の前提を1か所で保証できない。失敗時の応答もテストで固定できない。

## 決定

1. 公開 API の entrypoint は `CORS → Access boundary → userContext → ユーザー向け route` の順に処理する。`/health` は Access と `userContext` の前で公開する。Worker まで届いた CORS preflight（`OPTIONS`）は CORS middleware が 204 で終え、Access boundary・`userContext`・route・D1 に届かない。
2. Access boundary は `Cf-Access-Jwt-Assertion` を JWKS で検証し、署名・issuer の完全一致・audience を確かめる。JWKS の URL は信頼する `ACCESS_ISSUER` から導き、JWT が名乗る issuer や任意の URL は使わない。
3. 設定不足、トークンの欠落、検証の失敗はすべて詳細を出さず、`401 { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }` を返す（fail closed）。
4. Access の検証を省くのは、`ACCESS_ISSUER` と `ACCESS_AUDIENCE` がどちらも未設定で、かつ URL が localhost または loopback の場合だけとする。Access の設定が一部でもあれば、loopback でも検証する。
5. Service Binding 用の `InternalApi` entrypoint は `userContext → ユーザー向け route` だけを実行する private な経路とし、Web の Server loader だけが使う。公開 HTTP から Access を回避する経路にしない。
6. Web は、公開トップ `/` だけを公開し、`/home` とユーザー向けの学習ルートを Cloudflare Access で保護する。アプリ内にログインやセッションは持たない。

## 境界

- route・service・DAL は Access の JWT を参照しない。ユーザーの決定は ADR-0003 の `userContext` が担う。
- Cloudflare Access の application・policy・hostname の設定値と、Access の edge で CORS preflight が通ることの実機確認は運用の手順が扱う（Issue #35）。設定値は環境ごとの変数として与え、リポジトリに保存しない。
- 将来アプリ内に認証を導入する場合は、この ADR と ADR-0003 を置き換える。

## 検証

- [access-boundary.test.ts](../../apps/api/src/middleware/access-boundary.test.ts): 検証器が受け入れた場合だけ通す、トークン欠落・検証失敗・設定不足を固定の 401 にする、loopback での省略は Access 設定がない場合に限る
- [index.test.ts](../../apps/api/src/index.test.ts): `/health` と CORS preflight を Access と `userContext` の前で完了し、公開のユーザー向け route は有効な Access なしでは拒否する
- [core-endpoints.integration.test.ts](../../apps/api/src/core-endpoints.integration.test.ts): 公開 entrypoint で、Access を通らない書き込みを D1 の変更前に拒否する

テストで直接検証しない決定: 決定 6（Web のルートの保護）は Cloudflare Access の設定で実現しており、リリース時の smoke test（未認証のリダイレクトの確認）と運用の手順で確認する。
