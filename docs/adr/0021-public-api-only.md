# 0021: Web の API 通信をブラウザからの公開 entrypoint に一本化する

- 状態: Accepted
- 日付: 2026-11-08
- 関連: Issue #293、ADR-0019 の段階2（ADR-0008・ADR-0012 を置き換え、ADR-0015 を廃止する）

## 背景

ADR-0019 で認証後4画面を SSG＋CSR にしたため、Web Server loader から API を呼ぶ利用箇所がなくなった。使わない private entrypoint と binding を残すと、認証境界・ビルド検査・デプロイ・Graph が不要な経路を維持し続ける。URL フォールバックを残す案も、利用箇所のない Server 通信を温存するため採らない。

状態行は部分的な置き換えを表せないため、ADR-0008 の決定1〜4・6と境界、ADR-0012 の決定1・3・4と同一オリジン化・Server Actions の境界を引き継ぐ。ADR-0008 の決定5と ADR-0012 の決定2は下記で置き換える。ADR-0015 は対象経路がなくなるため Deprecated とする。

## 決定

1. Web と API は別の Worker とし、API の契約は `apps/api` の `AppType` に一本化する。Route Handler に Hono を載せない。読み取り・書き込みは Client hook が API Worker の公開 URL を `credentials: 'include'` で呼び、API は `WEB_ORIGIN` だけを CORS で許可する。Server Actions は使わない。
2. API の entrypoint は公開 HTTP のみとし、`CORS → Access boundary → userContext → ユーザー向け route` の順を守る。`/health` は Access・userContext より前で公開し、Worker に届く OPTIONS は CORS が 204 で完了する。JWT は信頼する `ACCESS_ISSUER` の JWKS で署名・issuer 完全一致・audience を検証する。設定不足・欠落・検証失敗は詳細のない固定の 401 とする。省略できるのは Access の両設定が未設定で URL が localhost / loopback の場合だけである。
3. Web の公開トップ `/` だけを公開し、`/home` と学習ルートを Cloudflare Access で保護する。アプリ内のログイン・セッションは持たない。route・service・DAL は JWT を参照せず、`user_id` は ADR-0003 の userContext が決定する。
4. `InternalApi`、Web の Service Binding、Server 用 API client と URL フォールバック、応答検証を省く client 判定を撤去する。Web が受け取る API 応答はすべて共有 Zod で検証する。設定・ビルド成果物・Graph の検査は、Web に Service Binding が残っていれば拒否する。
5. 移行時は Web の binding 解除を先に配備し、解除を確認してから API の entrypoint を削除する。自動リリースは API 更新前に稼働 Web の binding を確認し、残っていれば準備済み Web を先に upload する。解除の確認失敗・Web の省略・upload 失敗では API を更新しない。解除済みなら ADR-0017・ADR-0018 の通常順序と記録を維持する。

## 境界

- Access の構成変更、同一オリジン化は対象外。同一オリジン化や Server Actions が必要になった場合は判断を見直す。
- Cloudflare Access の application・policy・hostname の設定値と、Access の edge で CORS preflight が通ることの実機確認は運用の手順が扱う（Issue #35）。設定値は環境ごとの変数として与え、リポジトリに保存しない。
- 将来アプリ内に認証を導入する場合は、この ADR と ADR-0003 を置き換える。
- ADR-0019 の SSG＋CSR とユーザー固有データのキャッシュ規則は維持する。性能試験は ADR-0020 の静的な枠の配信条件と invocation log 照合を使う。ADR-0019 にある「性能測定の条件は変えない」は ADR-0020 で補正済みである。
- Web を旧 binding 付き version に戻す場合は、先に API の `InternalApi` を復元する。API の削除後に binding 付き Web だけを戻さない。

## 検証

- [index.test.ts](../../apps/api/src/index.test.ts): 公開 entrypoint の認証・CORS・health の境界を維持する。
- [access-boundary.test.ts](../../apps/api/src/middleware/access-boundary.test.ts): 決定2の JWT の署名・issuer 完全一致・audience、固定の 401、loopback での検証省略条件を検証する。
- [core-endpoints.integration.test.ts](../../apps/api/src/core-endpoints.integration.test.ts): 決定2の Access を通らない公開 entrypoint の書き込みを、D1 の変更前に拒否する。
- [rendering-boundaries.test.ts](../../apps/web/src/app/rendering-boundaries.test.ts): 決定1の書き込みを Hono API に一本化し、Web に Server Actions がないことを検証する。
- [api.test.ts](../../apps/web/src/lib/api.test.ts): cookie を付けた通信と共有 Zod による応答検証。
- [cloudflare-config.test.ts](../../apps/web/scripts/cloudflare-config.test.ts): Web の Service Binding がないこと。
- [architecture.test.mjs](../../scripts/architecture.test.mjs): binding・内部 entrypoint の再導入を拒否する。
- [deployment-cli.test.mjs](../../scripts/deployment-cli.test.mjs): 稼働 binding の解除を API 更新より先に実行し、失敗時に後続を停止する。

テストで直接検証しない決定: 決定1の Route Handler 構成はレビュー、決定3の Web 保護は Cloudflare Access の設定と未認証 smoke test で確認する。
