# 0025: API Worker のプレビュー URL を config で無効にし、デプロイ前に検査する

- 状態: Accepted
- 日付: 2026-11-27
- 関連: Issue #329

## 背景

2026-11-27 のセキュリティ確認で、本番 API Worker `tech-study-lab-api` の Preview URLs が有効になっていると指摘された。`apps/api/wrangler.toml` に `preview_urls` の指定がなく、Cloudflare の既定値で有効になっていた。検証用の `tech-study-lab-api-test` は config で無効にしている。

プレビュー URL（`<version>-tech-study-lab-api.<subdomain>.workers.dev`）は本番の公開 hostname と別のため、Access application の対象外になり得る。現行の API は Worker 内で Access JWT を検証するため（ADR-0021）401 を返す。しかし JWT 検証を入れる前（f848aab、2026-08-13 より前）の version が残っていれば、そのプレビュー URL からは認証なしで固定ユーザーのデータを読み書きできる。デプロイ手順はプレビュー URL を使っていない。

選択肢は3つあった。

- ダッシュボードで無効にするだけ: リポジトリに設定が残らず、config に指定がないまま deploy すると既定値に戻り得る。
- `workers_dev` も無効にする: Web のブラウザは workers.dev の公開 URL で API を呼ぶため（ADR-0021、`NEXT_PUBLIC_API_BASE_URL`）、アプリが動かなくなる。
- config で明示し、デプロイ前に検査する: 設定がリポジトリに残り、指定漏れや誤った変更を変更処理の前に止められる。これを採る。

## 決定

1. API Worker の config（本番 `apps/api/wrangler.toml`、検証 `apps/api/wrangler.test.jsonc`）に `preview_urls = false` を明示する。
2. 同じ config に `workers_dev = true` を明示し、Web が呼ぶ workers.dev の公開 URL を維持する。
3. GitHub Actions のリリースは、prepare と apply の設定検査で API config の `preview_urls` が `false`、`workers_dev` が `true` であることを確かめ、違えば D1・Worker の変更前に停止する。未指定も拒否し、Cloudflare の既定値に委ねない。

## 境界

- ダッシュボードで有効になっている設定の無効化と、残っている旧 version の確認は運用者が手動で行う。リポジトリはその後の deploy で設定が既定値に戻らないことだけを保証する。
- 手動の `pnpm --filter @tsl/api run deploy` は決定3の検査を通らないが、同じ config を使うため決定1・2の設定で配備される。
- Web Worker は対象外とする。検証用 Web は既に `preview_urls: false` を明示して検査している。本番 Web のプレビュー URL は別に判断する。
- API を custom domain へ移行して workers.dev を使わなくなった場合は、決定2を見直してこの ADR を置き換える。

## 検証

- [deployment.test.mjs](../../scripts/deployment.test.mjs): 両環境の実際の API config が決定1・2を満たして設定検査を通ること、`preview_urls` が `true` や未指定、`workers_dev` が `false` や未指定なら設定検査が拒否することを検証する。
- [deployment-cli.test.mjs](../../scripts/deployment-cli.test.mjs): apply CLI が `preview_urls: true` の API config を、検証環境・本番環境とも D1・Worker の変更前に拒否することを検証する。
