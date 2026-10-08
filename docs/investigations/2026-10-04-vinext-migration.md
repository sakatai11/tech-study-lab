# Vinext 1.0 移行可否の検証記録

> **2026-10-08 追記**：Issue #221 で Vinext を正式な Web 基盤へ移行した。以下は移行判断までの履歴であり、本文中の `dev:vinext` / `build:vinext` / `start:vinext` / `deploy:vinext`、`wrangler.vinext.jsonc`（web）、OpenNext alias shim は現在 `dev` / `build` / `start` / `deploy:edge`、`apps/web/wrangler.jsonc` の `env.edge`、`cloudflare:workers` を直接使う `lib/api-server.ts` に置き換わっている。本番切替の条件（Issue #220 の CPU 上限超過の解消を含む）は [design.md §12.4](../design.md#124-本番デプロイ手順順序が仕様) を参照する。

この文書は2026-10-04のIssue #199で行った初回検証と、2026-10-05のSSG追加検証の記録である。初回の表は prerender 無効の構成の測定値として残し、追加検証の結果と区別する。現在の設計契約は [design.md §8.3](../design.md#83-server--client-コンポーネント境界)、デプロイと実行確認の条件は同書 §12.4・§12.8を参照する。外部Issueの状態はこの記録では保証しない。

## 結論

**現時点では正式移行を見送る。** Vinext 経路は `apps/web` に並行 PoC として残し、OpenNext を本番経路として維持する。

**2026-10-05の追加検証で、Vinext 1.0.1 + Cloudflare 構成の教材・演習 SSG と認証後 SSR の両立をローカル workerd 上で確認した。** `prerender` と `@vinext/cloudflare@1.0.1` の `staticAssetsAdapter()` で成立し、`cloudflare:workers` の import エラーは再現しなかった。したがって「SSG にならない」は移行を見送る理由から除く。初回 PoC は prerender を有効にしておらず、Issue #2911 の報告を固定版の実行結果として扱っていた点を訂正する。

残る見送り理由は、Cloudflare 実環境（Preview Worker）での静的配信・Access 認証・deploy 時間・Observability が未検証であること。ローカルでは通常 SSR・Service Binding・正解データ非漏洩に加え、Quiz / Review のブラウザ操作も確認した。正式移行には実環境での確認と人間の判断が必要であり、OpenNext の本番経路を維持する。

再評価の条件：

1. ローカルで成立した SSG / SSR 構成を Preview Worker でも確認する。ローカルでの生成・配信・ブラウザ操作の結果は下記「SSG 実現方法の追加検証」を参照する。
2. Preview Worker へデプロイし、deploy 時間・Workers Logs・エラー時のログを OpenNext と比較できる。
3. Cloudflare Access 環境でブラウザの Quiz / Review 操作、認証 cookie と preflight を確認できる。

## 検証環境

- Node.js 22.23.3 / pnpm 9.15.0、Linux（ローカル workerd）。
- 既存：`next@16.2.9` + `@opennextjs/cloudflare@1.19.11`。
- PoC：`vinext@1.0.1`、`vite@8.3.2`、`@cloudflare/vite-plugin@1.62.5`、`@vitejs/plugin-rsc@0.5.35`、`@vitejs/plugin-react@6.1.1`、`react-server-dom-webpack@19.2.7`。`@cloudflare/vite-plugin` の peer 要件により `apps/web` の `wrangler` を 4.103.0 → 4.147.0 に更新した（`apps/api` は 4.103.0 のまま）。

## PoC の構成

| 項目 | OpenNext（本番） | Vinext（PoC） |
| --- | --- | --- |
| scripts | `build` / `preview` / `deploy` | `dev:vinext`（:3001）/ `build:vinext` / `start:vinext`（:3002）/ `deploy:vinext` |
| Worker 設定 | `wrangler.jsonc`（変更なし。`v1`/`v2` migration を保持） | `wrangler.vinext.jsonc`（別 Worker 名 `tech-study-lab-web-vinext`、migration なし） |
| Service Binding | `API` → `tech-study-lab-api#InternalApi` | 同じ |
| binding 取得 | `getCloudflareContext({ async: true })` | `vite.config.ts` に登録した `vinext/opennext-alias-plugin.ts` が rsc/ssr 環境でのみ `@opennextjs/cloudflare` を `vinext/opennext-cloudflare.ts`（`import { env } from 'cloudflare:workers'`）へ解決する。`src/lib/api.ts` は無変更 |
| 型 | `CloudflareEnv`（`src/lib/api.ts` の global 宣言）+ `@cloudflare/workers-types` | 同じ。`cloudflare:workers` の `env` は `@cloudflare/workers-types` が型付けし、shim で `CloudflareEnv` に変換する。`wrangler types` による型生成は両経路とも未導入のまま |

PoC で見つけ、構成で回避した非互換：

- **build が終了しない**：Vinext は `next.config.ts` を読み込むため、`initOpenNextCloudflareForDev()` が wrangler `getPlatformProxy()`（Miniflare / workerd）を起動し、破棄されないまま Vite process が残る。`VINEXT=1` のとき初期化しないよう `next.config.ts` で分岐した。
- **OpenNext deploy の乗っ取り**：`@cloudflare/vite-plugin` は Worker bundle の書き出し時に `.wrangler/deploy/config.json` を書き、以後 `--config` なしの wrangler コマンドを `dist/server/wrangler.json` へリダイレクトする。`opennextjs-cloudflare deploy` は既定で `--config` を渡さないため、そのままでは OpenNext の deploy が Vinext Worker を上げる。`build:vinext` は `scripts/build-vinext.mjs` で Vite を実行し、成功・失敗のどちらでも `finally` でこのファイルを削除する。prerender 失敗時もビルドの終了コードを保持し、Vinext 側コマンドは `--config` を明示した。回帰テストは実際の package script を一時ディレクトリで実行し、成功時・失敗時の削除と終了コードを確認する。
- **`vite dev` で `WeakRef is not defined`**：React の development 用 RSC client が `WeakRef` を使うが、compat date `2025-01-09` の workerd では既定で無効である。OpenNext と同じ compat date を保ち、`wrangler.vinext.jsonc` にだけ `enable_weak_ref` を追加した。
- **client 環境での `cloudflare:workers` 解決失敗**：shim を global alias にすると client build が `cloudflare:workers` を解決できず失敗するため、rsc/ssr 環境だけに適用する plugin で解決した。

## `vinext check`

81% compatible（Supported 10、Partial 1、Issues 2）。

| 対象 | 結果 | 影響 |
| --- | --- | --- |
| App Router / RSC / `generateStaticParams` / Metadata | Supported | 動作した（下記） |
| `next/font/google`（Inter・JetBrains Mono） | Supported | self-host された `@font-face` が HTML に出力された |
| `next/script` / `next/link` / `next/navigation` | Supported | SSR・RSC navigation の応答で確認 |
| `server-only` | Supported | `generated-content.ts` を client bundle に含めなかった |
| `turbopack` | Partial | `resolveAlias` / `resolveExtensions` のみ。本リポジトリは `turbopack.root` だけなので影響なし |
| `next/dist/server/next-server.js` / `__dirname` | Issue | 検出箇所は生成済み `.open-next/` 成果物で、ソースの問題ではない |
| Middleware / `next/image` | 未使用 | 影響なし |
| Cache Components / PPR | 未使用（§12.8） | 影響なし |

テストへの影響：既存の Vitest（Next 非依存）はそのまま通る。PoC の設定不変条件は `scripts/vinext-config.test.ts`、shim は `scripts/vinext-opennext-shim.test.ts`、server 環境だけに shim を適用する alias plugin は `scripts/vinext-opennext-alias-plugin.test.ts` で固定した。

## ビルド・成果物

| 指標 | OpenNext | Vinext |
| --- | --- | --- |
| build 時間（`content:generate` 込み、1 回計測） | 20.3 s | 5.6 s |
| Worker upload（`wrangler deploy --dry-run`） | 6297.14 KiB / gzip 1295.48 KiB | 1382.07 KiB / gzip 403.17 KiB |
| 成果物 | `.open-next/server-functions` 23.5 MB、`assets` 1.23 MB | `dist/server` 1.50 MB、`dist/client` 0.99 MB |

Vinext build の警告：`INEFFECTIVE_DYNAMIC_IMPORT`（`src/app/layout.tsx` と vinext 内部 shim）と `output.codeSplitting.groups[0].debugName` 未設定。いずれも vinext の生成 entry に起因し、出力の動作には影響しなかった。route 分類はすべて `ƒ Dynamic` または `? Unknown` と表示され、`generateStaticParams` の route も静的とは分類されない。

## 機能確認（ローカル workerd、production build）

API Worker（`wrangler dev` :8787、ローカル D1 に migrate / content sync / seed 済み）に dev registry 経由で `API` binding を接続した（両経路とも `env.API (tech-study-lab-api#InternalApi) local [connected]`）。ローカルは Access なし＋loopback bypass（§12.2）のため、認証 cookie・preflight の実機確認は対象外。

| 確認項目 | OpenNext | Vinext |
| --- | --- | --- |
| `/`（静的） | 200 | 200 |
| `/home`・`/review`・`/domains`・`/analytics` full GET | 200 | 200（Service Binding 経由で API データを描画） |
| `/home` RSC navigation | `?_rsc=1` で 200 `text/x-component` | `?_rsc=<不一致>` は 307 で正しい cache-busting URL へ誘導、`?_rsc` で 200 `text/x-component` |
| `/learn/security/xss`・`/learn/security/xss/security-xss-01`・`/quiz/security-xss-01` | 200、`Cache-Control: s-maxage=31536000`、`x-nextjs-prerender: 1`（SSG） | 200、`Cache-Control: no-store, must-revalidate`（リクエストごとに描画） |
| 存在しない lesson `/learn/x/y/z` | 404 | 404 |
| dev server（`dev` / `dev:vinext`） | 今回は未確認 | `/home`・`/quiz/security-xss-01`・`/learn/security/xss` が 200。`API_BASE_URL` を到達不能な port にしても `/home` が描画され、Service Binding 経由を確認 |
| API 停止時の `/home` | — | 200 で error boundary「ダッシュボードを読み込めませんでした」、API 再起動後に回復 |
| 正解データ | `answerIndex` の数値は配信 HTML・RSC に 0 件 | `dist/client`・quiz HTML・RSC のいずれも 0 件 |

解説文は `QuizViewModel` の仕様（design.md §7.2：選択肢と解説のみ持ち、正解を含めない）どおり両経路とも quiz の HTML・RSC payload に含まれ、`dist/client` の bundle には含まれなかった。

初回 PoC では prerender を有効にしていない。当初は vinext#2911 を根拠に `cloudflare:workers` の import が失敗すると判断していたが、有効化しての再現確認は行っていなかった。下記の追試では同じ Vinext 1.0.1 で prerender が成功し、その判断を訂正した。

## SSG 実現方法の追加検証（2026-10-05、ローカル検証済み）

目的は、構成変更によって design.md §8.2・§8.3・§12.8 のビルド時 SSG を維持できるかを検証すること。Node.js 24.19.0 / pnpm 9.15.0、Linux のローカル workerd、Chromium / Playwright 1.58.2 で実施した。Vinext と既存 PoC のバージョンは据え置き、`@vinext/cloudflare@1.0.1` を追加した。

### 検証した構成と結果

1. **prerender 有効化のみ：生成成功、import エラーは非再現。** `vinext({ prerender: { routes: '*', concurrency: 2 } })` で、教材一覧・教材本文・演習と公開トップ・404をビルド時に生成した。認証後4 route は `dynamic = 'force-dynamic'` により skipped。配布された 1.0.1 の `dist/build/prerender-cloudflare-loader.js` は `cloudflare:workers` の Node 用 loader を登録し、binding 参照時には明示的に throw する。教材・演習は binding を参照しないため生成可能だった。Issue が Open であることだけでは、この固定版での再現を意味しない。
2. **prerender + Static Assets adapter：ローカル配信成功。** `cache: { cdn: staticAssetsAdapter() }` を追加すると、生成済み HTML / RSC が `dist/client/_vinext/static-cache/` に梱包され、Worker が `ASSETS` binding 経由で読む。manifest は4つの正常ページと404を rendered とし、静的 cache artifact は9個（HTML 5個、RSC 4個）と index 1個。`assets.run_worker_first: ['/_vinext/static-cache/*']` で内部成果物の直接取得を防ぐ。
3. **独自の依存分離・shim・候補版への更新：不要。** 標準 loader と上記 adapter で成立したため、この検証では独自の Node binding stub、別ビルド先、workerd prerender の改造は採用しない。`src/lib/api.ts` と Worker 用 shim、API Service Binding はそのまま使用する。

生成は deploy や初回アクセス前の `vite build` 内で完了しており、prewarm / CDN キャッシュへの依存やアプリ全体の `output: 'export'` はない。OpenNext の Worker、binding、migration 履歴は変更していない。

### 配信と操作の証拠

- **全 content params と配信内容：pass。** 教材一覧 `/learn/security/xss`、教材本文 `/learn/security/xss/security-xss-01`、演習 `/quiz/security-xss-01` の全3 route と公開トップについて、HTML / canonical RSC の応答と生成ファイルの SHA-256 が一致した。`X-Vinext-Cache: HIT`、`Cache-Control: s-maxage=31536000, stale-while-revalidate`。RSC は `text/x-component`。確認スクリプトは `apps/web/scripts/verify-vinext-ssg.ts` に残した。
- **リクエスト時の再描画不要：pass。** 追加の一時的な検証 build では、教材・演習の各 page に `VINEXT_PRERENDER !== '1'` のとき throw する guard を挿入した。ビルド時生成は成功し、実行時の HTML / RSC はすべて生成物と一致した。空の ASSETS を使う別 Worker を起動した負の対照では、教材・演習の error boundary が表示された。guard のある build でも、静的成果物があると Server render を実行せず配信できることを確認した。guard と検証用の refresh hook 公開コードは除去し、通常構成で再ビルド・HTTP確認した。
- **API 依存の分離：pass。** API Worker を停止しても全3 content route は200 / HITで初期表示できた。一方 `/home` は error boundary を返し、API再起動後に回復した。`API_BASE_URL` を到達不能な値にした起動でも、API Worker 接続時は4つの SSR route が正常に表示され、Service Binding の接続ログも確認した。
- **認証後 SSR とデータ境界：pass（ローカル）。** `/home`・`/review`・`/domains`・`/analytics` は manifest 上 skipped、配信は `private, no-cache, no-store, max-age=0, must-revalidate` で静的 HIT なし。初期 HTML / RSC と client JS に正解の `answerIndex` 値は0件。存在しない lesson / quiz、内部 cache の index / HTML 直接取得は404。
- **ブラウザ操作：pass（ローカル、Accessなし）。** Review と Quiz の各3問を採点し、6件の `POST /answers` が200、教材閲覧の `POST /lesson-views` が201。採点後の選択肢ロック、結果、再挑戦、reloadによるintroへのリセットを確認した。D1でも解答ログとSRS version更新・閲覧記録を確認。SSGからQuizへのRSC遷移はHIT、SSR画面間の遷移は非HITで、1280pxと390pxで操作した。Review の実際の `router.refresh()` を一時的な検証hookから呼び、RSCが200 / no-store、解答済み問題を除く2問への更新とexercise→introの状態リセットを確認した。pageerror / hydration errorは0件。favicon未配置による404は残る。
- **Cloudflare Preview / Access：未検証。** この環境にCloudflare認証情報がなく、外部へのdeployは実行していない。ローカルの成功を実環境での保証とは扱わない。

### 再実行手順

開発サーバー（`:3001`）でブラウザ操作を確認する場合は、API の CORS 許可 Origin を合わせて起動する。API の既定値（`:3000`）では解答送信・教材閲覧記録の preflight が許可されない。

```bash
pnpm --filter @tsl/api run dev --var WEB_ORIGIN:http://localhost:3001
# 別ターミナル。上記API Workerと並走する。
pnpm --filter @tsl/web run dev:vinext
```

SSG build の配信（`:3002`）を確認する場合は以下を使う。開発サーバーから切り替えるときは API を停止し、`WEB_ORIGIN` を `:3002` にして再起動する。

```bash
pnpm --filter @tsl/api db:migrate:local
pnpm --filter @tsl/api content:sync
pnpm --filter @tsl/api db:seed:dev
pnpm --filter @tsl/api run dev --var WEB_ORIGIN:http://localhost:3002
# 別ターミナル。上記API Workerと並走する。
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787 pnpm --filter @tsl/web run build:vinext
pnpm --filter @tsl/web run start:vinext
# 別ターミナル。react-server条件は検証script内のserver-only importに必要。
NODE_OPTIONS=--conditions=react-server pnpm --filter @tsl/web exec tsx scripts/verify-vinext-ssg.ts
pnpm --filter @tsl/web exec wrangler deploy --dry-run --config dist/server/wrangler.json
```

確認スクリプトは、全paramsとmanifestの一致、生成物と応答の一致、SSRのno-storeとerror boundary不在、正解値非漏洩、404と内部成果物への直接アクセス拒否を検証する。ブラウザ操作と一時guardによる負の対照は別途確認した。

### SSG構成での比較と追加負担

| 指標（2026-10-05の同じローカル環境） | OpenNext | Vinext + SSG |
| --- | --- | --- |
| build実測（content生成を含む、成功した2回の参考値） | 20.31 s / 33.27 s | 6.50 s / 6.99 s |
| Worker upload（dry-run） | 6296.92 KiB / gzip 1295.37 KiB | 1532.73 KiB / gzip 426.99 KiB |
| client assetsのファイル総バイト数 | 1,209,867 bytes | 1,164,579 bytes |
| 静的cache成果物（index含む） | 上記assetsに含む | 215,015 bytes / 10 files |

正式なdeploy時間や本番edgeのTTFBの比較ではない。ローカルのcache状態と同時実行するチェックの負荷を固定しておらず、build時間は参考値である。追加した直接依存は `@vinext/cloudflare@1.0.1`（推移的に `@cloudflare/workers-response-store@1.0.1` を含む）。この構成はStatic Assetsだけを使用し、新しいR2 / Durable Object / KV / Queue bindingは不要。コンテンツ更新では再ビルド・再deployが必要。初回PoCのビルド警告、既存のpeer version警告、ローカルworkerdの接続切断ログは別途残り、SSG不成立の根拠にはしない。

最終構成で `pnpm typecheck` / `pnpm lint` / `pnpm test` と、Vinext SSG build / OpenNext build / 両Workerのdeploy dry-runが成功した。`vinext-config.test.ts` には内部cache artifactをWorker経由にする設定の確認を追加した。検証scriptの型エラーは修正し、最終チェックとOpenNext buildで再確認済み。

## SSR 応答（ローカル workerd、参考値）

各 route を warm-up 3 回の後 20 回取得した中央値（ms、TTFB）。同一マシンのローカル計測で、ネットワークや edge cache を含まない。

| route | OpenNext | Vinext |
| --- | --- | --- |
| `/` | 35.8 | 3.8 |
| `/home` | 31.9 | 33.2 |
| `/review` | 12.7 | 13.8 |
| `/domains` | 12.0 | 11.4 |
| `/analytics` | 19.3 | 18.2 |
| `/learn/security/xss` | 53.3 | 3.2 |
| `/learn/security/xss/security-xss-01` | 61.3 | 3.4 |
| `/quiz/security-xss-01` | 46.4 | 3.2 |
| `/learn/x/y/z`（404） | 60.2 | 12.9 |

API を呼ぶ通常 SSR route は同程度だった。OpenNext のローカル preview は incremental cache を持たない構成のため SSG route でも `x-nextjs-cache: MISS` となり、この差は本番 edge の応答差を示さない。

## 未実施

- Cloudflare Preview Worker へのデプロイ、deploy 時間、Workers Logs / Observability の比較（Cloudflare の認証情報が無いため）。
- Preview Worker での内部 cache artifact への URL 別表記（パーセントエンコードや連続スラッシュ）による直接取得防止。レビュー時の最小構成の Miniflare 試験では、通常表記と7種類の別表記は Worker 経由または保護対象 URL への307リダイレクトとなり、内部成果物の直接配信は非再現だった。通常の公開アセットは200、`run_worker_first: false` の負の対照では内部 index が200となることも確認した。この試験は実際の Vinext Worker や Cloudflare edge の保証ではない。実環境ではリダイレクトを追跡し、index / HTML / RSC の本文が外部へ返らないことを確認する。
- Cloudflare Access 環境での認証 cookie・preflight・authReady の確認。

ローカル Vinext Worker の再読み込み後、各リクエストで `workerd/util/sqlite.c++:662: SQLITE_CANTOPEN` のログが出たが応答は 200 のままだった。同じ `.wrangler/state` を別の `wrangler dev` と共有していたことによるローカル環境の事象と考えられるが、原因は未確認である。

## 2026-10-06: Issue #218 の Cloudflare 環境準備

この節は外部反映前の準備記録である。Worker/D1/Access の新規作成・更新、remote migration/content sync、認証済みブラウザ操作、edge の SSG/SSR 検証は未実施。Issue #218 の実環境に関する完了条件を達成したとは扱わない。

検証基準は PR #217 を含む `develop` の commit `90965350d336e47dd06eae86deca5955d4f04baa`。環境設定の作業ブランチは `chore/issue-218-cloudflare-vinext`。Cloudflare dashboard で対象アカウント、既存 API の Origin・Access・D1 binding を確認した。Wrangler 4.147.0 のログインは期限切れであり、認証情報ファイルを読み取らず、利用者による `wrangler login` の完了を待つ。

### 反映対象

| 項目 | 検証用の対象 |
| --- | --- |
| Cloudflare account | `4459a4d59a634a07eac0400d39b84f20`（既存の tech-study-lab と同じアカウント） |
| Web Worker | `tech-study-lab-web-vinext` |
| Web hostname | `tech-study-lab-web-vinext.sakai111893.workers.dev` |
| API Worker | `tech-study-lab-api-vinext` |
| API hostname | `tech-study-lab-api-vinext.sakai111893.workers.dev` |
| API Service Binding | `API` → `tech-study-lab-api-vinext#InternalApi` |
| D1 | 新規 `tech-study-lab-vinext`。ID は作成成功後に確定する |
| Access application | 新規 `tech-study-lab-vinext`。既存の `Allow owner` policy を再利用し、その policy 自体は変更しない |
| Access 保護対象 | API の全パス、および Web の `home*`・`learn*`・`quiz*`・`review*`・`domains*`・`analytics*`。Web の `/` と公開アセットは保護対象に含めない |
| API health | 新規 `tech-study-lab-vinext-health-public` application に API の `/health` のみを指定し、既存 `Bypass health` policy を再利用する |
| CORS | API の `WEB_ORIGIN` を検証用 Web URL と完全一致させる。Access は `OPTIONS` を origin に転送する |
| Access Cookie | Web/API を同じ検証用 application に含め、既存構成と同様に eager redirect を使う。Cookie の内容を取得・記録せず、実際のブラウザ操作で送信の成立を確認する |
| Logs | 検証用 Web/API で Observability を有効化、sampling 1。version preview URL は無効化する |
| Rate limit | 検証用 namespace `21801`（answers: 60/60s）と `21802`（lesson-views: 30/60s） |

既存 API の `WEB_ORIGIN` は本番 Web の URL だけを許可している。これを検証用 URL へ置き換えると本番の credentialed CORS が成立しないため、API/D1 を分離する。既存の `tech-study-lab-web`・`tech-study-lab-api`・本番 D1・本番 Access application は反映対象に含めない。

### D1 へ投入する内容と順序

空の検証用 D1 に以下の順で適用する。既存の migration SQL を変更せず、本番 D1 のデータを複製しない。

1. `0000_flowery_quasar.sql`: `answer_logs`・`lesson_views`・`questions`・`srs_states`・`users` を作成。
2. `0001_add_srs_version.sql`: `srs_states.version` を追加。
3. `0002_nasty_guardsmen.sql`: 問題の domain/topic/lesson/is_active を追加。
4. 同じ commit の content から既存の `createContentSyncPayload` / `createContentSyncSql` で生成した SQL: 固定ユーザー `user-local-001` と問題3件を upsert、active membership を更新（合計5文）。解答・閲覧・SRS 記録の投入は含まない。

準備した SQL は `/private/tmp/issue-218-content.sql`、SHA-256 は `215128ca58b9182009d8033fcda4b58cb6d943cad4d6f603059691bb97b44ae1`。ファイルが残っていることと内容・hash を再確認してから、この対象・SQL・順序について得た承認の範囲で実行する。再生成して SQL が変わった場合は入力値を再確認する。既存の `content:sync:remote` は本番 D1 `tech-study-lab` を固定指定するため、隔離環境への同期には使用しない。

### ローカルで確認できたこと

- `pnpm install --frozen-lockfile`: 成功。
- `CLOUDFLARE_ENV=edge NEXT_PUBLIC_API_BASE_URL=https://tech-study-lab-api-vinext.sakai111893.workers.dev pnpm --filter @tsl/web run build:vinext`: 成功。
- 生成された `dist/server/wrangler.json` の Worker 名・`API#InternalApi` 接続先・静的 asset 保護・Observability・preview URL 無効化を確認。
- prerender manifest: `/`・教材3 route と `/404` が rendered、`/home`・`/review`・`/domains`・`/analytics` が skipped/dynamic。
- Web の明示的 config による deploy dry-run: 成功。upload `1532.76 KiB` / gzip `426.12 KiB`。
- 隔離 API の deploy dry-run: 成功。upload `460.91 KiB` / gzip `89.25 KiB`。D1 ID と Access audience は dry-run 専用のダミーであり、実デプロイには使用しない。
- 既存 Vinext config/build wrapper テスト: 7件成功。edge の応答や Cookie 認証の検証結果ではない。
- architecture snapshot: 再生成後の意味的差分なし。`architecture:check` 成功。

### 外部反映後の再実行順序

1. 対象アカウント・新規リソース・Access 設定・上記 SQL を確認した承認と、Wrangler のログインを確認する。
2. 検証用 Access application を作成し、許可 policy、全 hostname/path、OPTIONS 転送、Cookie 設定を確認する。新規 application の AUD は dashboard から参照し、Git や `.env` に保存しない。
3. `wrangler d1 create tech-study-lab-vinext` を対象アカウントで実行する。発行された ID を用いて検証用 API config を作成し、本番 D1 の ID と異なることを確認する。
4. 検証用 API config を明示指定して `wrangler d1 migrations apply tech-study-lab-vinext --remote`、続いて確認済み SQL を `wrangler d1 execute tech-study-lab-vinext --remote --file <確認済みSQL>` で適用する。各ステップの成功を確認するまで次に進まない。
5. 同じ検証用 API config を明示指定して deploy。`WEB_ORIGIN`・`ACCESS_ISSUER`・新規 application の `ACCESS_AUDIENCE` を毎回すべて `--var` で渡す。公開 `/health`、未認証の Access 境界、検証 Web Origin に対する POST の preflight を確認する。
6. 上記 `CLOUDFLARE_ENV=edge` と API URL を明示して Web をビルドし、`wrangler deploy --config dist/server/wrangler.json` で反映する。生成 config が検証用 Worker/API だけを指すことを毎回確認する。
7. Worker version・hostname・deploy 計測値と、未認証/認証済みの境界、SSG/SSR、内部 cache URL の別表記、ブラウザ操作、Logs の実環境結果を追記する。現在この節にはこれらの実環境証跡はない。

## 2026-10-07: Issue #218 の隔離環境への反映と初回確認

対象リソース、Access 設定、migration 3件、上記 SHA-256 の投入 SQL に対する利用者の明示承認と、Wrangler の再ログイン完了を確認して反映した。`issue-dev-orchestrate` は利用者の指定により使用していない。この節は環境反映と実施済み試験の記録であり、後述の未検証項目を含む Issue #218 全体の完了や Vinext の正式採用を意味しない。

### 確定したリソースとデプロイ結果

実行コードは `90965350d336e47dd06eae86deca5955d4f04baa`（PR #217 を含む）。追加した隔離環境設定は本作業ブランチの差分であり、検証用の設定を選択してビルド・反映した。アカウントと hostname は前節の反映対象どおり。

| 項目 | 結果 |
| --- | --- |
| Web version | `4576e2ac-4b00-4426-b22e-da0b050383f4` |
| API version | `477da598-6185-4bdd-a3e2-9db8b9e4c4f9` |
| D1 ID | `db179ef0-7349-407b-8323-71ff91889a82`（本番 D1 と異なる） |
| Access application ID | `90f65b99-7e6b-4039-ba4c-c74bddd6e90b`（`Allow owner` を関連付け） |
| health application ID | `18e2c017-d4ae-4a25-9793-59d67838f087`（`Bypass health`、検証 API の `/health` のみ） |
| API config | `apps/api/wrangler.vinext.jsonc`。認証・Origin の値を保存せず、deploy 時に指定 |
| Web config | `apps/web/wrangler.vinext.jsonc` の `edge` → 生成された `dist/server/wrangler.json` |
| Web upload / gzip / startup | `1532.76 KiB` / `426.13 KiB` / `12 ms` |
| API upload / gzip / startup | `452.92 KiB` / `88.98 KiB` / `13 ms` |
| Web upload / triggers | Wrangler 表示値 `12.00 sec` / `1.64 sec`（assets 52件の upload `5.28 sec` は前者に含む） |
| API upload / triggers | Wrangler 表示値 `3.43 sec` / `1.40 sec` |
| 使用 CLI | Web: Wrangler `4.147.0`、API: Wrangler `4.103.0`（各 workspace の既存依存） |

上記時間は初回反映時の Wrangler のフェーズ表示であり、build を含む全体時間や SSR 応答時間ではない。OpenNext との同条件比較はまだ行っていない。

新規 Access application の保存済み設定は、API 全パスと Web の6パス、OPTIONS の origin 転送、HttpOnly、SameSite Lax、先行リダイレクト Cookie 有効、Cookie のパス固定無効を確認した。既存の本番 application / policy、Worker、route、Origin、D1 を更新する操作は実施していない。Web/API とも Observability を有効化し、version preview URL を無効化している。

### edge とブラウザで確認したこと

- API `/health`: 未認証 GET が `200 {"status":"ok"}`。公開 API の `/review` は Access ログインへ 302。
- API `/answers`: 検証 Web Origin、POST、`content-type` を指定した OPTIONS が204。`Access-Control-Allow-Origin` は検証 Web と完全一致、credentials は `true`、methods は `GET,POST,OPTIONS`、headers は `Content-Type`。
- 公開 `/`: full GET と RSC がともに200 / `x-vinext-cache: HIT`。同じ build の生成物と SHA-256 が一致（HTML: `90a8a1859944d7f44e504dc558ddb55fbbcbc7a234683231028160f600274dc8`、RSC: `eb6d8e12e6cb9f91bdd643ac0401f8fed6c8d4600282fc300cbdec794c4ba72e`）。
- 未認証 Web: `/home`・`/review`・`/domains`・`/analytics` と content 3 route がすべて Access ログインへ302。存在しない `/does-not-exist` は404。
- 内部 cache: index と全9 artifact に対し、通常表記、`%5Fvinext`、`%73tatic-cache`、区切りの `%2F`、先頭の連続スラッシュ、namespace 内の連続スラッシュ、ファイル前の連続スラッシュ、`/x/../` の8表記を、raw request path を指定した HTTPS GET で試験。80件中、初回は307が50件・404が30件。同一 hostname のリダイレクトを追跡した最終応答は80件とも404で、ビルド成果物の本文との一致は0件。
- 認証済みブラウザ: index と HTML の同じ8表記、計16件が404画面。RSC artifact へのブラウザ navigation は `ERR_BLOCKED_BY_CLIENT` となり、認証済み RSC artifact の本文・HTTP応答を検証できたとは扱わない。
- 生成 manifest: 公開トップ・content 3 route・404 が rendered、`/home`・`/review`・`/domains`・`/analytics` は dynamic/skipped。client JS と生成 HTML/RSC 計45ファイルの数値 `answerIndex` 検査で一致0件。認証済みの全 content 応答との hash 照合は未実施。
- 既存 Cloudflare ID プロバイダーで認証し、`/home` の本番データと分離された初期表示、教材、Quiz、復習の空キュー、学習分析、学習領域を確認。SSR と SSG の間のリンク遷移が成立した。
- デスクトップ Quiz: 3問を採点し、選択肢ロック、FAIL/PASS/PASS、結果の2/3正解、不正解だけの再挑戦が1問になること、reload 後の intro への reset を確認。
- モバイル幅390×844: 学習分析と navigation、Quiz の開始・正解の採点・選択肢ロックを確認。演習の `clientWidth` / `scrollWidth` はともに390。ブラウザの viewport override は検証後に解除した。
- D1 の読み取り確認: デスクトップ3回答後に users=1、questions=3、answer_logs=3、srs_states=3、lesson_views=1。モバイルでは追加で1回答した。Cookie/JWT を抽出して別の HTTP クライアントへ渡す操作は行っていない。
- ローカル品質検証: `pnpm typecheck`、`pnpm lint`、`pnpm test`（259件）、`pnpm architecture:check`、`pnpm architecture:test`（22件）が成功。snapshot 再生成は意味的差分なし。検証 API/D1 と本番の分離、および edge の Service Binding / preview URL を確認する設定テストを追加した。

ブラウザ自動操作では「次へ」の Playwright click / press が dispatch timeout となった。DOM 上は有効なボタンであることを確認し、同じブラウザの accessibility API の click に切り替えると次問・結果へ遷移した。アプリのエラーや採点失敗としては扱っていない。API integration test 内の古い Wrangler は既存 `ratelimits` 設定への警告を出すが、テスト失敗は0件。

### 再反映の手順と残っている検証

再反映も §12.4 の対象・入力値確認と承認に従う。既存の検証 D1 への migration/content 再適用が必要かを先に判断し、生成 config が検証専用の接続先であることを確認する。

```sh
# D1 は毎回専用 config と検証 DB 名を明示する。
pnpm --filter @tsl/api exec wrangler d1 migrations apply tech-study-lab-vinext --remote --config wrangler.vinext.jsonc
# content SQL は前節の内容・hashを再確認してから、同じDB/configへ適用する。

# 3つの設定値は各回すべて指定する。以下は実値を保存しないための手順表記。
pnpm --filter @tsl/api exec wrangler deploy --config wrangler.vinext.jsonc --var WEB_ORIGIN:<検証WebURL> --var ACCESS_ISSUER:<Access issuer> --var ACCESS_AUDIENCE:<専用application AUD>

CLOUDFLARE_ENV=edge NEXT_PUBLIC_API_BASE_URL=https://tech-study-lab-api-vinext.sakai111893.workers.dev pnpm --filter @tsl/web run build:vinext
pnpm --filter @tsl/web run deploy:vinext
```

今回の作業で検証環境の作成・反映と初回の認証・接続・採点が完了した。Issue #218 のうち、認証済みの全 content HTML/RSC の成果物との一致、SSR の full GET/RSC の no-store 応答、認証済み内部 RSC artifact、認証切れと回復、Review の実際の採点と `router.refresh()`、隔離した API 障害・復旧試験、OpenNext との同条件性能比較、実際の Workers Logs と `SQLITE_CANTOPEN` の有無、PR #217 の review thread / #199 への結果反映は残っている。これらを完了済みとしてチェックしたり、Issue を close したりしない。

### PR #219 のレビュー修正（2026-10-07）

既定設定と `edge` 設定で Worker 名が一致しており、`CLOUDFLARE_ENV=edge` を省略したビルドをデプロイすると、検証 Web の API binding が本番へ戻る問題を修正した。既定名を `tech-study-lab-web-vinext-local` に分離し、既定設定の `workers.dev` / preview URL を無効化した。`edge` は既存の検証用 Worker 名と専用 API binding、`workers_dev: true` を明示する。ローカルの API binding 名と起動手順は維持する。

`deploy:vinext` は生成 config の検証用 Worker 名、専用 API binding、公開・preview 設定を確認してから Wrangler を起動する。環境指定を省いたローカル用ビルド、同名で本番 API に接続する旧成果物、追加の service binding、`--name` / `--config` / `--env` 等の CLI 上書きを拒否する。`--dry-run` は同じ検査を通して許可する。回帰テストは実際の package script と Wrangler stub を使い、拒否時に CLI が起動しないことと、正常時の引数・失敗終了コードを確認する。

修正後は `pnpm typecheck` / `pnpm lint` / `pnpm test`（272件）、`pnpm architecture:check` / `pnpm architecture:test`（22件）が成功した。snapshot 再生成は意味的差分なし。実際の既定ビルドはローカル用 Worker 名と公開 URL 無効設定を生成し、`deploy:vinext --dry-run` は Wrangler 起動前に拒否された。`edge` の再ビルドと同コマンドの dry-run は成功し、専用 API binding を確認した。このレビュー修正では外部リソースの反映は行っていない。

## PR #219 マージ後の残検証（2026-10-07）

検証基準は `develop` の merge commit `22493fb9694d136f82ac2a30b901323efd87f740`。専用 Web を同じ公開 API URL と `edge` 設定で再ビルド・反映し、version `71eb9a2f-d835-41f7-ab4b-74b8763d7554` を記録した。Wrangler の表示値は upload `9.89 sec`、triggers `0.69 sec`、startup `12 ms`。API binding は `tech-study-lab-api-vinext#InternalApi`。

OpenNext の同 commit の build は sandbox 内で `EMFILE: too many open files, watch` により失敗した。ファイル記述子上限は `1048575` であり、単純な低い shell 上限とは判断しない。同じ build を正規の sandbox 外実行で再試行すると成功した。比較時にはこの実行環境の差を記録する。

マージ後の実反映に対する公開側の試験は成功した。公開トップの HTML / RSC 2応答が同 build の生成物と一致し、`x-vinext-cache: HIT`。未認証の保護対象7 route × HTML / RSC の14応答は Access ログインへ302。内部 cache 全10ファイル × 8表記の80件は、同一 hostname の redirect を追跡後すべて404。存在しない公開 route は404。API `/health` は200、POST preflight は204 / credentialed CORS、許可外の Origin は `Access-Control-Allow-Origin` なし、未認証の `/review/queue` は302だった。認証後の応答との一致・SSRキャッシュはまだ未確認である。

生成 client JS 27ファイルで数値 `answerIndex` の混入は0件。公開トップから参照する JS asset 1件の200応答と同 build のファイルの SHA-256 一致も確認した。検証用ブラウザの公開トップで localStorage / sessionStorage のキーはともに0件だった。Cookie / JWT の値は取得していない。PR #217 の2スレッドは取得時点で解決済みだったが、内部 cache の指摘に対する返信はローカル試験の説明のままであり、認証済みの実環境結果を加える作業は残る。

dry-run の upload / gzip は Vinext `1532.76 KiB` / `426.07 KiB`、OpenNext `6297.69 KiB` / `1293.90 KiB`。両者とも同じ専用 `InternalApi` binding を確認した。OpenNext の実際の upload / startup / SSR はまだ測定していない。

### 追加の外部操作の対象と入力（承認待ち）

以下は前回の初回反映承認に含まれない試験操作である。アカウントは `4459a4d59a634a07eac0400d39b84f20`、D1 は `tech-study-lab-vinext`（`db179ef0-7349-407b-8323-71ff91889a82`）、Web/API は既存の検証用2 Workerを使う。新しい外部リソースは作らない。準備した一時 config・fixture・SQL は `apps/web/.wrangler/verification/`（Git 管理対象外）に置き、認証値を保存していない。

1. **Review 用の期日調整**: `review-due.sql` で固定ユーザー `user-local-001` の `security-xss-01-q1`〜`q3` の `due_at` だけを実行時の UTC 現在時刻の1分前にする。現在の version / due_at が3件すべて読取結果と一致するときだけ更新する。解答ログ、ease、interval、reps、lapses、version は直接変更しない。Review の実採点後の状態は通常の API 更新結果として検証 D1 に残す。

   ```sql
   UPDATE srs_states SET due_at = unixepoch() * 1000 - 60000
   WHERE user_id = 'user-local-001'
     AND question_id IN ('security-xss-01-q1', 'security-xss-01-q2', 'security-xss-01-q3')
     AND (SELECT COUNT(*) FROM srs_states WHERE user_id = 'user-local-001' AND (
       (question_id = 'security-xss-01-q1' AND version = 3 AND due_at = 1791899942666) OR
       (question_id = 'security-xss-01-q2' AND version = 2 AND due_at = 1791899970557) OR
       (question_id = 'security-xss-01-q3' AND version = 2 AND due_at = 1791900044889)
     )) = 3;
   ```

2. **API 障害・復旧**: `api-outage.json` / `api-outage.mjs` は `tech-study-lab-api-vinext` の public / `InternalApi` を一時的に一律503（`VERIFICATION_API_OUTAGE`、`no-store`）にする。D1 と既存の専用 rate limit namespace を保持し、fixture はそれらを使用しない。Access application / policy は更新しない。故障時の SSG と SSR / error boundary を確認し、API の既知の正常版 `477da598-6185-4bdd-a3e2-9db8b9e4c4f9` へ rollback して復旧を検証する。事前の deployment 読取で正常版が異なっていた場合は試験を開始せず、復旧先を確認する。rollback は Worker code / binding / vars を戻す操作であり、D1 の検証回答を巻き戻さない。

3. **OpenNext 比較**: `opennext.json` で同 commit の `.open-next/worker.js` / assets を `tech-study-lab-web-vinext` へ一時反映し、同じ専用 API / D1 / Access / hostname で SSR を測定する。設定は `workers_dev: true`、`preview_urls: false`、Observability 有効。本番の `v1` / `v2` migration 履歴はコピーせず、DO / R2 の binding を持たせない。比較後は Web の正常な Vinext version `71eb9a2f-d835-41f7-ab4b-74b8763d7554` へ rollback する。両者の upload / startup / size と同じ browser・cache 条件の SSR 応答を記録する。

各一時 config の deploy dry-run は成功済み。API の現在版の再読取と tail は、Wrangler の期限切れにより未実施であり、sandbox 外の `whoami` でも更新できないことを確認した。認証後のブラウザ検証と上記操作はまだ完了していない。

### 認証再開後の確認（2026-10-08）

Wrangler `4.147.0` の `whoami` で OAuth の再認証と対象アカウントを確認した。同じ CLI から専用 API config を指定して deployment と D1 を読み取れた。API の現在版は既知の正常版 `477da598-6185-4bdd-a3e2-9db8b9e4c4f9`、Web は `71eb9a2f-d835-41f7-ab4b-74b8763d7554`。D1 の3件の version / due_at は前節の SQL の条件と一致し、解答ログは7件だった。この確認では D1 を変更していない。

公開側の試験を再実行し、トップ HTML / RSC の hash 一致2件、保護 route の未認証 redirect 14件、内部 cache の最終404応答80件を確認した。専用 API `/health` は200だった。

ブラウザのタブ一覧は当初空で、その後に開いたタブも閉じられていたため、最新の一覧から新しいタブを取得した。表示されていたのは公開トップで、保護対象 `/home` に移動すると Access ログインへ redirect された。Cloudflare provider に進めた時点では `dash.cloudflare.com/login` のセキュリティ確認画面であり、認証後の学習画面は未確認である。Wrangler の認証とアプリの Access 認証を同一の完了条件として扱わない。

Cookie / request header を保存しないサニタイズ済み tail で、最初の Web/API 観測はイベント0件だったため、例外がないことの根拠にはしない。API の tail を再接続して `/health` を送信すると、`GET /health` / status 200 / outcome `ok` のイベント1件が到着し、例外0件・`SQLITE_CANTOPEN` なしを確認できた。受信が遅れていたため sandbox 外でも接続を試みたが、sandbox 内の接続でイベントを確認できた時点で追加の接続も停止した。認証後 SSR・採点のログ検証は未完了である。

前節の期日調整・API 故障試験・OpenNext 一時反映は引き続き承認待ちであり、実施していない。

### 通常の Chrome で検証を再開（2026-10-08）

Codex 側のブラウザでは Cloudflare Dashboard のセキュリティ確認を完了できないという利用者の報告を受け、接続済みの通常 Chrome に新しい検証用タブを開いた。同じ検証 Web の `/home` が既存の認証で表示され、追加のログイン操作は不要だった。Cloudflare は [自動操作ブラウザによる production challenge の解決をサポートしない](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/)としている。今回の差はブラウザ環境が原因である可能性があるが、詳細な検知条件までは特定していない。Access 設定や policy を変更する操作、Cookie / JWT の抽出・移植は行っていない。

通常 Chrome で `/home`・`/analytics`・`/domains`・`/review` の再読み込みとナビゲーションリンクの遷移を確認した。分析の総解答数7件、正答率86%、領域の問題3件、復習の空キューが D1 の読取状態と整合する。認証済みブラウザの表示を確認できたことと、応答 header / HTML・RSC hash を検証したことは分けて扱い、この操作を `no-store` や全 content hash 一致の検証完了には数えない。

この操作中の tail は UTC `2026-10-07T15:25:44Z`〜`15:27:26Z`（日本時間10月8日00:25〜00:27）で、Web 26件・API 38件を取得した。全件 status 200 / outcome `ok`、例外0件、`SQLITE_CANTOPEN` 0件だった。API の `/dashboard/due-count`・`/review/queue`・`/analytics/*`・`/domains`・`/activity/recent`、Web の認証後4 route と content route のリクエストを含む。これは当該操作・観測範囲での結果であり、採点・障害試験や全運用期間についての保証ではない。tail 接続はすべて停止した。

### API 障害・性能比較を除く追加検証（2026-10-08）

利用者の「API障害・復旧試験、OpenNextとの性能比較のテスト以外は実行して」という指示を受け、前節で対象・SQLを提示した Review の期日調整と採点試験を実施した。API 障害 fixture の反映、OpenNext の一時反映・性能比較は実施していない。この段階で Web/API の再デプロイ、Access 設定の変更は行っていない。

期日調整の直前に専用 D1 の3件の version / due_at と解答ログ7件を再確認し、前節のガード条件が一致した状態で `review-due.sql` を1回適用した。3件の `due_at` は `1791387063000` となり、version・解答ログ数は変わらなかった。

通常 Chrome の `/review` で以下を確認した。

- 期日調整した3問が表示され、FAIL / PASS / PASS の採点結果と2/3正解を表示した。採点後の選択肢はロックされた。
- 不正解だけの再挑戦では q1 の1問だけが出題され、正解後の結果は1/1。不正解がなくなり、同じ再挑戦ボタンは無効になった。
- 再読み込み後のキューは空で、due count の表示も0件となった。解答中に navigation の件数を即時更新する検証は成功扱いにしない。現在の hook は mount 時に取得するため、今回の画面では再読み込みまで3件の表示が残った。
- 解答ログは7件から11件へ増え、正解は9件。q1 の SRS は version 5 / reps 1 / lapses 2 / interval 1、q2・q3 は version 3 / reps 3 / lapses 0 / interval 15。期日調整後の4回答が通常の API 経由で保存された。

検証 D1 の問題は3件であり、実環境の次バッチ取得は試験できなかった。代わりに `review-runner.test.tsx` で、実際の ReviewRunner・QuizInteractive・採点 hook を組み合わせ、API 境界と router だけを差し替えた統合テストを2件追加した。20問完了後の「次の復習を取得」が `router.refresh()` を1回呼ぶこと、更新後の21問目が前の結果を残さず intro から始まること、最終バッチでは次バッチ取得を表示しないことを確認した。21問はローカルテストの fixture であり、検証 D1 に追加していない。

Web の全自動テスト103件（33ファイル）、全 workspace の `pnpm typecheck`、`pnpm lint`、`pnpm architecture:check`、`git diff --check` は成功した。テスト内の選択肢ロック確認は、disabled fieldset による有効な無効化を `:disabled` で判定する。

今回の tail 観測範囲は Web が UTC `2026-10-07T15:31:43.654Z`〜`15:42:10.239Z`、API が `15:31:43.659Z`〜`15:42:10.178Z`。Web 20件は200、API 39件は200 / 204、例外0件、`SQLITE_CANTOPEN` 0件だった。API には実ブラウザの `OPTIONS /answers` 4件（204）、`POST /answers` 4件（200）、`answer_log_and_srs_state` の保存成功ログ4件を含む。tail は停止し、Cookie / JWT / request header / body を含めない要約だけを検証用の Git 管理対象外ディレクトリに保存した。

認証済み HTML / RSC の hash と SSR の `no-store` header は引き続き未確認。通常 Chrome の操作 API は認証済みの応答本文・header を提供せず、DOM 表示で代替できない。`view-source:` の表示もブラウザツールの許可プロトコルに反して拒否されたため、その方法は中止した。認証済み `/home` の DevTools Console で利用者が実行する GET 専用 `browser-response-check.js` を用意し、結果待ちとしている。対象は SSG 8応答、SSR 16応答、内部 cache 80表記。Cookie / JWT の値を読み取らず、応答本文そのものも出力しない。内部 cache の試験はブラウザによる URL 正規化が入り、先に実施した raw request path の公開側試験とは条件が異なる。

今回の Review のモバイル幅確認では viewport override の成功応答後も実測の `clientWidth` が1604のままだったため、390幅での成功とは扱わない。初回反映時の Quiz の390幅確認とは区別する。認証切れと復帰の試験も未実施で、応答照合の結果を待っている間は認証済みのタブを維持する。Access の標準 logout は他の Access application のセッションにも影響するため使用せず、検証ホストだけのブラウザ site data を消去する方法を検討している。

今回除外された2試験と、上記の未確認項目を含め、Issue #218 全体を完了したとは扱わない。

利用者が応答照合スクリプトを実行したものの、`fetch-patch.js:77` の GET エラーが表示され、JSON が出なかったと報告した。この行番号だけでは、期待する404の表示と通信失敗を区別できず、実環境の原因は未特定。旧スクリプトは fetch / 応答読み取りの例外で処理を中止し、JSON を出さずエラーメッセージだけを表示するため、途中結果を失う問題があった。検証用スクリプトを修正し、個別の通信失敗・timeout・認証 probe の失敗を固定のエラー分類とパスでJSONへ記録し、全検査完了の `completed` と成功の `allPassed` を分けた。全体の時間制限と段階ごとの進捗表示も追加した。任意のエラーメッセージ・外部 redirect URL・Cookie・JWT・応答本文は出力しない。

修正版について、実通信を行わない4ケース（誤った origin、probe の通信失敗、probe の timeout、内部80パスの通信失敗）で、JSON が得られること、途中中断を成功扱いにしないこと、通信失敗を404と判定しないことを確認した。認証済み実環境の照合は、修正版の再実行結果を受け取るまで未確認のままとする。

その後、利用者から内部 index の404表示と Promise の pending が続き、JSON が表示されないと報告された。内部 index の404自体は期待する保護動作であり、提示された fetch wrapper の行だけでは停止原因を特定できない。確認すると前の時間制限は `AbortSignal` による通信中断と await からの復帰に依存しており、全体の経過時間チェックも各リクエストの間にしか実行していなかった。スクリプトに各リクエスト全体（fetch・本文取得・hash計算）と独立した10秒の timeout race、および3分の全体 timer を追加した。Console の表示フィルターに依存しない読み取り専用JSONパネルもアプリ画面に表示する。これは当該タブ内の一時的な結果表示であり、ブラウザ storage や外部サービスへ保存・送信しない。

実通信を行わない5ケースで修正版を確認した。誤った origin、probe の通信例外、AbortSignal を無視して応答しない fetch、応答しない本文取得、内部80パスの通信例外を含み、タイマーを短縮した試験でJSONパネルの表示と失敗判定を確認した。実環境の停止原因と照合結果は引き続き未確認である。

### 認証済み応答の照合結果（2026-10-08）

利用者が通常 Chrome で修正版を実行し、UTC `2026-10-08T03:55:16.478Z`（日本時間12:55）のJSON結果を提供した。対象は基準 commit `22493fb9694d136f82ac2a30b901323efd87f740` / Web version `71eb9a2f-d835-41f7-ab4b-74b8763d7554` として用意した期待値。実行時間は `93218 ms`、`completed: true`、`allPassed: true`、失敗0件だった。この経過時間は104件の逐次検査全体であり、SSRの単体性能やOpenNextとの比較値ではない。

- **SSG 8応答**: 公開トップと全 content 3 route の HTML / RSC は200。同じ build の各 SHA-256・byte数と一致し、`x-vinext-cache: HIT`。`Content-Type` も HTML / RSC の期待値と一致した。受領JSONの8件を保存済み期待値と再照合した。
- **SSR 16応答**: `/home`・`/review`・`/domains`・`/analytics` × HTML / RSC × 2回はすべて200、同一 origin・元の path に到達した。全16件の `Cache-Control` は `private, no-cache, no-store, max-age=0, must-revalidate`、`x-vinext-cache` はなし。受領JSONの全16件で条件を再確認した。
- **内部 cache 80表記**: スクリプトの認証済み検査ではすべて同一 origin の404判定に成功した。成功した内部応答の個別レコードは出力を抑える仕様のため、受領JSONには80件の検査数と成功判定・失敗0件が残る。ブラウザのURL正規化が入る条件であり、未認証の raw path 80件の試験とは区別する。利用者が見た index の赤い404表示も、想定した取得拒否に対応する。

提供されたJSONを `apps/web/.wrangler/verification/authenticated-browser-response-report.json`（Git管理対象外、SHA-256 `9ea089ffb2b7a155e1951aff54b060de63790c5d7c08e44217054ce7710f5640`）に保存した。Cookie / JWT・応答本文は含まない。以前の pending の原因まではこの成功結果から断定せず、結果取得と上記104検査の完了を記録する。

これにより、前節で未確認だった認証済み全contentの成果物一致、SSRのHTML / RSCの `no-store`、認証済み内部cacheの保護は確認済みとなった。認証切れと回復、Reviewの実際のモバイル幅での操作、実環境での次バッチ取得は引き続き未確認。次バッチ取得と状態リセットのローカル統合テスト2件の成功とは区別する。API障害・復旧とOpenNext性能比較は利用者の指示により除外し、Issue #218全体は完了扱いにしない。

### 応答照合後のブラウザ追加検証（2026-10-08）

通常Chromeへの再接続に成功し、認証済みの存在しない演習 `/quiz/does-not-exist` と教材 `/learn/security/xss/does-not-exist` が404画面を表示することを確認した。新しい操作経路では390×844の viewport が適用され、Reviewの空キュー、Quizの演習中・結果画面で `clientWidth` / `scrollWidth` がともに390だった。

390幅のQuizで3問のFAIL / PASS / PASS、2/3正解、不正解だけの再挑戦でq1のみ出題・1/1正解、再挑戦ボタンの無効化、reload後のintroへのリセットを確認した。採点中の選択肢4件はすべて `:disabled`。結果画面の証跡は `apps/web/.wrangler/verification/mobile-quiz-result.png`（Git管理対象外）に保存した。Wrangler再認証後の専用D1の読取では解答ログ15件、q1のversion 7 / lapses 3 / reps 1 / interval_days 1、q2・q3のversion 4 / reps 4 / interval_days 38で、追加の4回答と整合した。

Wranglerの期限切れを `whoami` で確認し、利用者がCLIの再認証を実施した。再認証後の最初の読取SQLは `interval` という存在しない列名で失敗したため、migration定義の `interval_days` に修正し、読取に成功した。認証失敗・このSQLエラーの間にD1を更新する操作は実施していない。

利用者が依頼した残検証として、承認済みの期日調整と同じ検証DB・固定ユーザー・問題の範囲で、モバイルReview用にq1だけを再度期限到来にする。直前の読取値に合わせ、`mobile-review-due.sql` を次の条件付き更新として用意した。既存の解答ログ・version・reps・lapses・間隔は直接変更しない。

```sql
UPDATE srs_states SET due_at = unixepoch() * 1000 - 60000
WHERE user_id = 'user-local-001'
  AND question_id = 'security-xss-01-q1'
  AND version = 7
  AND due_at = 1791518486021;
```

上記の条件付き期日調整を専用D1へ1回適用し、q1の `due_at` が `1791432110000`、version 7、解答ログ15件のままであることを確認した。q2・q3は変更されていない。390×844のReviewでq1のみのintroから開始し、不正解・0/1結果、不正解だけの再挑戦、正解・1/1結果、再挑戦ボタンの無効化、reload後の空キュー・due count 0を確認した。採点中の4選択肢はロックされ、演習中・結果の `clientWidth` / `scrollWidth` はともに390。証跡を `mobile-review-result.png` に保存し、viewport overrideを解除した。

通常API経由の2回答後、D1の解答ログは17件、q1はversion 9 / lapses 4 / reps 1 / interval_days 1 / due_at `1791518613264`。q2・q3の状態は期日調整前の読取と一致した。API tailの観測範囲はUTC `2026-10-08T04:02:13.839Z`〜`04:03:38.603Z`、36イベント、status 200 / 204、例外0件、`SQLITE_CANTOPEN` 0件。`POST /answers` 2件の200と保存成功ログ2件、OPTIONS 2件の204を含む。tailを停止し、サニタイズ済み記録を `mobile-review-api-tail-report.json` に保存した。

これによりReviewのモバイル実採点も確認済みとなった。認証切れと回復は未実施。次バッチの実環境確認はbundled問題が3件しかないため20件上限を超えるキューを構成できず、ローカル統合テストの結果を実環境での成功とは扱わない。認証切れ試験には、既存の認証済みChromeの検証WebホストだけのCookieを利用者が消去する手順が必要であり、Cookieの値を取得せず、他のAccess applicationまで失効させる標準logoutは使用しない。

追加したReview統合テストを含む全workspaceの `pnpm test` は274件成功（shared 73、API 95、content-estimates 3、Web 103）、終了コード0だった。ローカルAPIの古いWranglerは既存の `ratelimits` 警告に加え、プロジェクト外へのdebug log書込を試みた際のEPERMを出したが、テストは失敗していない。このローカル実行の警告・ログは、専用APIのedge tailで確認した例外0件・`SQLITE_CANTOPEN` 0件の結果とは区別する。

利用者には、Chrome DevToolsのApplication → Storage → Cookiesから検証Web originを選び、そのホストの `CF_Authorization` 1件だけをDelete selectedで消去し、`/home` の再読み込み後の表示を回答する手順を提示した。手順は [Chrome DevToolsの公式Cookie管理文書](https://developer.chrome.com/docs/devtools/application/cookies#delete-cookies)に従う。操作APIにCookie管理機能がないため利用者操作待ちであり、値・Cookie画面のスクリーンショットは送らないよう案内した。他のホストのCookieは対象にしない。ログイン画面が現れるか、SSOで自動的にアプリへ復帰するかの実際の結果は、回答を得てから記録する。

### 検証WebのCookie消去後の復帰（2026-10-08）

利用者から、上記の手順を実施したところ `/home` の画面が表示されたと回答を得た。接続済みChromeでも同じ検証Webの `/home` に到達していること、学習ワークベンチの見出しとdue count 0・正答率76%などの学習データが表示されることを確認した。Cookie消去は利用者が実施した手動試験として記録し、Cookieの値やブラウザの認証ストアは取得していない。

これは「検証WebホストのCookieを消去して再読み込みした後にアプリへ戻れる」ケースの成功である。[Cloudflareの公式session management](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)では、global sessionが有効ならapplication tokenの期限切れ時にも新しいtokenが自動発行されると説明されている。今回もSSOによる自動復帰と整合するが、redirect履歴やCookie再発行を直接観測していないため、再認証経路の特定とは扱わない。ログイン画面の表示、global session失効、期限切れJWTを実APIへ送信して拒否を確認する試験の成功は、この結果から推定しない。

今回依頼された範囲で、認証済み応答の104検査、デスクトップ・390幅のQuiz / Review操作、D1への記録、CORS / API認証・実環境ログ、Cookie消去後のアプリ復帰を確認した。実環境の20問超の次バッチ取得は、検証環境のbundled問題が3件のため未実施であり、ローカル統合テスト2件で確認した結果と区別する。API障害・復旧とOpenNext性能比較は依頼どおり除外したまま、未確認項目を含めIssue #218全体はcloseしない。

### OpenNext性能比較の再開準備（2026-10-08）

利用者からOpenNext性能比較の実施依頼を受け、性能比較を対象に戻した。API障害・復旧試験は対象に戻していない。Wrangler `4.147.0` で既存検証Webの現在の100% deploymentが `71eb9a2f-d835-41f7-ab4b-74b8763d7554` であることを再確認した。

比較対象は上記merge commitの既存build。OpenNextのclient assetとserver bundleに専用APIの公開URLが入っていることを確認し、専用config `apps/web/.wrangler/verification/opennext.json` を指定したdeploy dry-runを再実行した。成功し、upload `6297.69 KiB` / gzip `1293.90 KiB`、bindingは `tech-study-lab-api-vinext#InternalApi` と `ASSETS` の2件だった。実デプロイと性能測定はまだ実施していない。

#### 反映対象と復旧手順（今回の承認対象）

- アカウント: `4459a4d59a634a07eac0400d39b84f20`。
- 更新対象: 検証Web `tech-study-lab-web-vinext` のcode・assets・Worker設定。hostnameは現在の検証Webを使用する。
- 一時反映: `.open-next/worker.js`、`.open-next/assets`、compatibility date `2025-01-09`、flags `nodejs_compat` / `global_fetch_strictly_public`、専用APIの `InternalApi` Service Binding、`workers_dev: true`、`preview_urls: false`、Observability sampling rate 1。専用configにDO / R2 / KV bindingやmigrationは含めない。
- 復旧先: 比較完了または中断時に既知のVinext version `71eb9a2f-d835-41f7-ab4b-74b8763d7554` へ100% rollbackし、deployment・公開成果物・認証済みhome画面を再確認する。rollbackが利用できない場合の復旧は、同commitの既存Vinext成果物を、検証用設定を検査する `deploy:vinext` で同じ検証Webへ再反映する。
- 新規リソース作成、API・D1・Access更新、SQL、採点POSTは不要。本番Workerへの反映は行わない。

```bash
# apps/webをcwdとする。反映直前に現在versionを再確認する。
WRANGLER_WRITE_LOGS=false pnpm exec wrangler deployments list --config wrangler.vinext.jsonc --env edge
WRANGLER_WRITE_LOGS=false pnpm exec wrangler deploy --config .wrangler/verification/opennext.json
# 測定終了・中断時の復旧
WRANGLER_WRITE_LOGS=false pnpm exec wrangler rollback 71eb9a2f-d835-41f7-ab4b-74b8763d7554 --config wrangler.vinext.jsonc --env edge --yes --message 'Restore Vinext after OpenNext performance comparison'
```

[Cloudflareのrollback文書](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)に従い、接続先リソースの状態はrollbackされないことを前提とする。[OpenNextのcache文書](https://opennext.js.org/cloudflare/caching)では通常SSRは追加のcache設定なしで動作するとされており、今回はSSG/ISRの追加cache構成を評価しない。

#### 測定方法

認証済みの通常Chromeでhome画面の表示を確認した。自動操作の読み取り専用ページ評価では `performance` が公開されていないため、Consoleで手動実行する `apps/web/.wrangler/verification/browser-performance-check.js` を準備した。構文検査は成功。Cookie / JWTを取得せず、応答本文・認証headerを記録しない。

Vinext事前 → OpenNext → Vinext復旧後の3フェーズで、同じChrome・hostname・認証・API・D1・ネットワーク設定を使用する。`/home`・`/review`・`/domains`・`/analytics` のHTML / RSC計8組について、各2回のウォームアップ後に20回ずつ逐次GETし、ラウンドごとに順序をずらす。各フェーズ176件、`cache: no-store`、最大4分、各request最大10秒。200・同じorigin/path・Content-Type・`no-store`・cache HITなしを検査し、失敗時はそのフェーズを止める。

主要指標はResource Timingの `responseStart - requestStart` と `responseEnd - requestStart` の中央値・nearest-rank p95。取得できた標本数を必ず併記する。補助指標はfetch開始からheader promise解決まで／body読取完了までの時間であり、前者を正確なTTFBとは呼ばない。colo・byte数・cache header・失敗数を保存する。復旧後の再測定で時間帯の変動を確認するが、別フェーズ間のネットワーク・API/D1 cacheの差を完全に除去した測定とは扱わない。

Worker upload / gzipとWranglerのupload・trigger・startup表示値も記録する。既存Vinextの反映時間とOpenNextの今回の反映時間は、asset uploadの有無・実行日時が異なる参考値として区別する。最初のrequestを意図的なWorker cold startとは扱わず、CPU時間・LCP・負荷試験の測定とは区別する。今回の一時反映・復旧については、design §12.4の対象・入力値を確認した承認を得てから実行する。

### Vinext事前性能測定の受領（2026-10-08）

利用者が上記のConsoleスクリプトを実行し、`phase: vinext-before` のJSONを提供した。測定終了はUTC `2026-10-08T04:27:21.168Z`（日本時間13:27）、全体 `29422 ms`、viewport `495×784` / DPR 2。176件はすべて200・同じorigin/path・期待Content-Type・`no-store`で、失敗0件。全件のcoloは `NRT`、`Cache-Control` は `private, no-cache, no-store, max-age=0, must-revalidate`、Vinext / Cloudflareのcache HITなしだった。

176件の順序・warmup区分・round番号を照合し、各組の実測20標本から中央値・nearest-rank p95・最小・最大を再計算して提供された集計と一致した。Resource Timingの有効標本は各20件。下表はwarmup2回を除外した値で、単位はms。

| Route | 応答 | TTFB中央値 | TTFB p95 | 本文完了中央値 | 本文完了 p95 |
| --- | --- | ---: | ---: | ---: | ---: |
| `/home` | HTML | 185.15 | 234.50 | 192.80 | 244.40 |
| `/home` | RSC | 156.00 | 179.30 | 272.65 | 312.10 |
| `/review` | HTML | 100.25 | 118.10 | 107.20 | 143.30 |
| `/review` | RSC | 94.35 | 110.60 | 132.20 | 147.60 |
| `/domains` | HTML | 97.55 | 111.40 | 105.20 | 114.30 |
| `/domains` | RSC | 93.00 | 110.80 | 120.15 | 139.70 |
| `/analytics` | HTML | 150.55 | 173.00 | 156.50 | 176.00 |
| `/analytics` | RSC | 143.80 | 177.90 | 225.20 | 250.10 |

記録は `apps/web/.wrangler/verification/performance-vinext-before-report.json`（Git管理対象外、SHA-256 `ebba536f727afa669f75208147c67f26deb92a312f8ae14119dec611252f37de`）に保存した。これは利用者のブラウザで実施した測定結果を受領・検算したものであり、今回の時点でOpenNextの一時反映・比較測定は未実施。RSCはTTFBと本文完了の差があるため、TTFBだけで全応答が速いとは判定しない。後続フェーズでも同じConsole測定、viewport・ブラウザ・ネットワーク条件を維持する。

### 承認後のOpenNext一時反映（2026-10-08）

利用者から一時反映とVinextへの復旧について「承認します」と回答を得た。反映直前のdeploymentを再確認し、Vinext既知版 `71eb9a2f-d835-41f7-ab4b-74b8763d7554` が100%だったため、上記専用configでOpenNextを反映した。

OpenNext versionは `7f8d75db-1994-45b7-9f1a-b674c9cd5bdf`、deployment `baf2ab41-cd7f-4f81-aa6e-66e7bd14fffb`（UTC `2026-10-08T04:30:40.886966Z`）。WranglerのJSON読取で同versionの100%反映を確認した。upload `6297.69 KiB` / gzip `1293.90 KiB`、startup `22 ms`、Worker upload `21.45 sec`、trigger反映 `1.01 sec`。static assetsは29件をupload、13件は既存、asset upload表示値は `4.24 sec` だった。前述のVinext反映時間とは時刻とasset upload条件が異なる。

通常Chromeの同じhomeタブを再読み込みし、学習ワークベンチと学習サマリーなどの見出しが表示された。Web/APIのサニタイズ済みtailを接続し、Cookie / JWTを記録しない。OpenNext用Consoleスクリプト `browser-performance-opennext.js` と復旧後用 `browser-performance-vinext-restored.js` は、元の測定スクリプトのphase名だけを変更して作成し、構文検査に成功した。

手動測定待ちの一時反映を長時間残さないため、起動から10分後に同じOpenNext versionが100%である場合のみ既知のVinext版へrollbackする復旧処理を開始した。途中でversionが変更されていた場合は操作しない。手動復旧を確認した時点で専用cancelファイルを作成してこの処理を停止する。処理はCLI認証の有効性に依存し、実際の復旧成功はdeploymentの再読取で確認する。この段階ではOpenNextの176件測定とVinext復旧はまだ完了していない。

復旧処理の期限はUTC `2026-10-08T04:42:32.986Z`（日本時間13:42:32）。補助的な公開側確認ではPython urllibからWeb/APIとも403となったが、curlでAPI healthの200を確認し、API tailでも対応する200イベントを取得した。クライアント経路・挙動の差は未特定であり、urllibの403をWorker障害の根拠とはしない。認証済みhome表示時のWeb/API tailはstatus 200・outcome ok、例外・`SQLITE_CANTOPEN`はなかった。

### OpenNext測定の受領とVinextへの復旧（2026-10-08）

利用者から `phase: opennext` の176件のJSONを受領した。終了はUTC `2026-10-08T04:34:49.573Z`（日本時間13:34）、全体 `25032 ms`。事前測定とcommit・測定順序・定義・viewport `495×784` / DPR 2が一致し、各組のwarmup2件・実測20件の順序とround、200・元のorigin/path・Content-Type・no-store・cache HITなしを全176件で検算した。全件NRT・同じ `private, no-cache, no-store, max-age=0, must-revalidate` で、失敗0件。各指標の20標本から集計を再計算し、提供値と一致した。

OpenNextのResource Timing結果（warmup除外、各20標本、単位ms）は次のとおり。事前Vinextとの差は暫定値であり、復旧後の測定を待って評価する。

| Route | 応答 | TTFB中央値 | TTFB p95 | 本文完了中央値 | 本文完了 p95 | 事前Vinext比のTTFB中央値 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `/home` | HTML | 183.70 | 202.30 | 197.70 | 272.10 | -0.8% |
| `/home` | RSC | 70.30 | 99.50 | 169.05 | 221.30 | -54.9% |
| `/review` | HTML | 103.80 | 122.60 | 107.50 | 134.60 | +3.5% |
| `/review` | RSC | 63.65 | 88.50 | 98.25 | 124.80 | -32.5% |
| `/domains` | HTML | 100.60 | 126.10 | 107.10 | 127.60 | +3.1% |
| `/domains` | RSC | 62.65 | 83.30 | 96.80 | 115.00 | -32.6% |
| `/analytics` | HTML | 147.10 | 166.50 | 153.45 | 176.30 | -2.3% |
| `/analytics` | RSC | 70.15 | 91.90 | 148.85 | 171.60 | -51.2% |

JSONは `performance-opennext-report.json`（Git管理対象外、SHA-256 `0009199170bb9db0154459f118736651de4f5e99365eb2378191e415bcb13d0c`）に保存した。この段階の暫定結果ではHTMLのTTFB中央値はほぼ同程度、RSCではOpenNextが短かった。これは測定したブラウザと検証環境における応答の比較であり、Worker CPU性能や全画面表示速度の測定とは扱わない。

OpenNext期間のtailを停止し、`performance-opennext-web-tail-report.json` / `performance-opennext-api-tail-report.json` に保存した。観測範囲はWeb UTC `04:31:10.607`〜`04:34:49.067`、64イベント（200と `/favicon.ico` 1件の404）、API UTC `04:31:11.673`〜`04:34:49.075`、49イベント（すべて200）。全イベントoutcome ok、例外0・`SQLITE_CANTOPEN` 0。tailはすべての176測定requestを網羅していないため、測定全件の成否はブラウザの個別レコードに基づく。

受領後、稼働中が承認済みのOpenNext versionであることを再読取してからVinextへrollbackした。復旧deployment `2f6092fc-9a04-4ea7-879f-9615b62e5d6f`、UTC `2026-10-08T04:35:20.087983Z`。JSONの再読取でVinext version `71eb9a2f-d835-41f7-ab4b-74b8763d7554` が100%であることを確認した。復旧後の公開HTMLはSHA-256 `4290a553dc49287e1eb8b534dc62d531a992a8dc8d8fcc030f92e3b8642a4e73` / `24252 bytes`で元の成果物と一致し、同じChromeで認証済みhomeの見出しと学習サマリーを確認した。

手動復旧確認後に専用cancelファイルを作成し、期限付き復旧処理がUTC `04:36:25.428Z`に `cancelled-after-manual-recovery` で終了した。自動rollbackは実行されていない。Web/API tailも終了コード0で停止済み。復旧後のVinext用Console測定を案内する段階であり、3フェーズの比較完了はまだ記録しない。

### 復旧後のVinext測定で503を検出（2026-10-08）

利用者から復旧後のJSONを受領した。終了はUTC `2026-10-08T04:39:42.159Z`、経過 `29289 ms`、`completed: false` / `allPassed: false` / `stoppedReason: response-validation-failed`。137件目、測定round 16の最初の `/home` RSCが503 / `text/html; charset=UTF-8` / `4764 bytes`となり、スクリプトは停止した。元のorigin/pathには到達し、coloはNRT、`no-store`は付いていた。先行136件は200で、warmup16件・有効な実測120件（各組15件）だった。176件完了・成功とは扱わない。

順序・round・区分・失敗レコードと各指標の集計を検算した。`performance-vinext-restored-incomplete-report.json`（Git管理対象外、SHA-256 `fa7de9fdd1b9936e15a4ae2b80114265f9fc82a917eaff19c9e743be429ebfd4`）へ保存し、後の再測定で上書きしない。

| Route | 応答 | 有効標本数 | TTFB中央値 ms | 事前Vinext比 |
| --- | --- | ---: | ---: | ---: |
| `/home` | HTML | 15 | 230.20 | +24.3% |
| `/home` | RSC | 15 | 193.00 | +23.7% |
| `/review` | HTML | 15 | 117.90 | +17.6% |
| `/review` | RSC | 15 | 122.40 | +29.7% |
| `/domains` | HTML | 15 | 126.90 | +30.1% |
| `/domains` | RSC | 15 | 115.60 | +24.3% |
| `/analytics` | HTML | 15 | 186.40 | +23.8% |
| `/analytics` | RSC | 15 | 177.20 | +23.2% |

再読取でもVinext既知版 `71eb9a2f-d835-41f7-ab4b-74b8763d7554` / deployment `2f6092fc-9a04-4ea7-879f-9615b62e5d6f` の100%反映を確認した。Chromeの測定停止表示と元のhome画面を確認し、通常のhome再読み込み後も学習データと見出しが表示された。APIのアプリ実装でRate Limiterが付くのは `/answers`・`/lesson-views` のPOSTであり、今回の測定GETにその制限は適用されない。Graphの `rateLimit` queryはshared error contractだけを返したため、アプリ・route定義で再確認した。

503時点のtailは接続しておらず、応答本文・`cf-mitigated`も当初の測定JSONには含まれないため、発生元や原因を特定していない。Cloudflare challenge・Worker resource limit・一時的なedge障害のいずれかと断定しない。[Cloudflareの503診断文書](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-503/)はエラーページとWorkerログの確認を案内している。また[Challenge Pageの検出文書](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/)は `cf-mitigated: challenge` を判定に使うと説明している。

Web/APIのサニタイズ済みtailを再接続し、再測定用 `browser-performance-vinext-restored-retry.js` を準備した。測定順序・GET条件・時間計算・warmup2回・実測20回は変更せず、phase名を `vinext-restored-retry` として区別した。エラー応答だけ、challenge header判定、Cloudflare・Worker limit / exception・maintenanceの本文マーカーの有無、数値Retry-Afterを記録する。本文自体やCookie / JWTは保存・出力しない。構文検査は成功済み。

比較の確定は再測定待ちである。すでに受領した不完全な復旧後測定から時間帯の変動が確認できるため、事前VinextとOpenNextの差をフレームワークのみの効果と断定しない。API障害fixtureは反映しておらず、意図的な障害・復旧試験とは区別する。

### 復旧後再測定の503再発と原因確認（2026-10-08）

診断を追加した再測定もUTC `2026-10-08T04:45:22.578Z`、経過 `24207 ms`、115件目で停止した。失敗は `/home` HTML / 実測round 13 / status 503 / `4764 bytes` / NRT / 同じorigin/path。`Cache-Control` は前回503と同じ `private, max-age=0, no-store, no-cache, must-revalidate, post-check=0, pre-check=0` だった。先行114件は200、有効実測は98件で、analyticsのHTML/RSCが各13件、ほかの6組は各12件。`completed` / `allPassed` はともにfalseである。

順序・区分・失敗レコード・集計を再検算し、`performance-vinext-restored-retry-incomplete-report.json`（Git管理対象外、SHA-256 `590721f24a4d058774334233eab4b29b0c1d9180e72be82dd59fd96d433e4d05`）に保存した。先行する不完全な測定も保持し、成功した測定へ置き換えない。

| Route | 応答 | 有効標本数 | TTFB中央値 ms | TTFB p95 ms |
| --- | --- | ---: | ---: | ---: |
| `/home` | HTML | 12 | 235.45 | 293.50 |
| `/home` | RSC | 12 | 188.70 | 260.10 |
| `/review` | HTML | 12 | 129.20 | 161.60 |
| `/review` | RSC | 12 | 121.35 | 139.40 |
| `/domains` | HTML | 12 | 139.30 | 176.30 |
| `/domains` | RSC | 12 | 118.55 | 134.20 |
| `/analytics` | HTML | 13 | 189.90 | 217.40 |
| `/analytics` | RSC | 13 | 153.90 | 210.80 |

診断フラグは `challenged: false`、`cloudflareMarker: true`、Worker resource limit / exception・maintenanceのマーカーはfalse、数値Retry-Afterなし。これはCloudflareを含むHTMLが返ったこととchallenge header判定が陰性だったことを示す。マーカー判定はraw HTMLの簡易regexであり、タグを挟むエラー番号を検出できない場合があるため、Worker CPU / memory limit等を除外できたとは扱わない。

接続中だったWeb/API tailを停止し、終了コード0を確認した。再測定を含む観測はWeb33件・API54件、全件200 / outcome ok、例外0・`SQLITE_CANTOPEN` 0。`performance-vinext-restored-retry-web-tail-report.json` / `performance-vinext-restored-retry-api-tail-report.json` に保存した。503に一致するイベントは得られていないが、tailが全requestを網羅しないため、Workerに到達していないとも断定しない。現在のdeploymentは引き続き既知Vinext版の100%である。

同種の503が2回発生したため同じ測定を再実行しない。次の診断は新たな高頻度requestではなく、利用者がDevTools Networkに残る503応答の見出し・エラー番号だけを確認する方法とした。Cookie / request headers / 応答本文全体の共有は求めない。エラー番号を得てから、リソース制限やedge障害等に応じた対策と、必要なら間隔を設けた共通条件の再比較を判断する。

現時点で確実に言えるのは、Worker gzipサイズはVinext `426.07 KiB` / OpenNext `1293.90 KiB`でVinextが67.1%小さいこと、startup表示値は12 / 22 msだったこと、および成功した各20標本の比較でHTML中央値がほぼ同程度・RSCはOpenNextが短かったこと。日時・asset upload条件・ネットワークやAPI/D1の変動を完全に一致させた検証ではなく、復旧後20標本の完了と503原因の特定は未完了のため、性能の一般的優劣や安定性を確定しない。

### Cloudflare履歴ログでCPU上限超過を確認（2026-10-08）

利用者から現在のhome応答が200と報告された。これは通常アクセスの成功を示すが、過去の測定中の503が解消されたことを証明するものではない。認証済みChromeから検証用WebのCloudflare Dashboardを開き、Observabilityの履歴ログを `exists($metadata.error)` で絞ったところ、両測定の失敗時刻・routeに対応するエラーを確認した。

| 日本時間の履歴ログ | request | 同時刻付近のWorkerエラー |
| --- | --- | --- |
| `2026-10-08 13:39:42.225` | `GET /home?_rsc=` | `Worker exceeded CPU time limit.`（同時刻に3ログ） |
| `2026-10-08 13:45:22.506` | `GET /home` | `Worker exceeded CPU time limit.`（`13:45:22.497`） |

ブラウザ測定の終了時刻はそれぞれ日本時間 `13:39:42.159` / `13:45:22.578` であり、Dashboardの時刻と同じ秒・同じrouteで一致する。Dashboardの過去24時間の版別エラー表示でもVinext `71eb9a2f` に2件、OpenNext `7f8d75db` に0件だった。履歴の6 errorイベントはrequestログ2件とCPUエラーログ4件で、6 requestが失敗したという意味ではない。request IDを保存した突合ではなく、時刻・routeと版別件数に基づく対応付けである。

この証拠から、測定中の503はVinext WorkerのCPU上限超過に対応すると判断した。直前の「原因未特定」はこの履歴確認により解消した。tailで該当イベントを取得できなかったことや、簡易HTMLマーカーが陰性だったことはCPU上限超過を否定する根拠にはならない。利用者による503ページの追加確認は不要となった。

Dashboardには無料プランの表示がある。[Workers limitsの公式文書](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)ではWorkers FreeのCPU上限は1 requestあたり10 msで、ネットワークやD1等への待ち時間を含む応答時間とは別の指標である。Wranglerのstartup 12 / 22 msもrequestごとのCPU時間とは別なので、これらを直接10 msと比較しない。request間隔を空けるだけで1 requestのCPU上限超過が解決するとは判断できない。

DOMに表示されたエラー時刻・route・メッセージと無料プラン表示のみを `apps/web/.wrangler/verification/performance-vinext-cpu-limit-evidence.json`（Git管理対象外）へ保存した。Cookie / JWT / request headers / エラー本文全体は取得していない。Cloudflareの設定や課金プランは変更していない。

成功した事前Vinext・OpenNextの各20標本は比較結果として保持する。復旧後の2測定はCPU上限超過で中断したままであり、3フェーズの完了・無料プランでの安定性確認・Issue #218全体の完了とは扱わない。次に安定性を確認するには、CPU処理の軽減を検証するか、承認を得た有料プランの環境で両方式を同条件で測定する必要がある。現在のhomeの200は復旧確認として記録し、同じ連続測定は追加実行しない。

### 検証後の方針と後続Issue（2026-10-08）

利用者は無料プランの継続を決定し、CPU処理の軽減を [Issue #220](https://github.com/sakatai11/tech-study-lab/issues/220) として切り出した。有料プランへの変更はこの対応の対象に含めない。

検証結果を踏まえたVinextへの全面移行方針は [Issue #221](https://github.com/sakatai11/tech-study-lab/issues/221) に登録した。設計・標準コマンド・CI・本番デプロイをVinextへ一本化し、本番切替前に #220 のCPU軽減と無料プランでの再検証を完了する。採用方針の決定を、未完了の検証の成功や本番への即時反映承認とは扱わない。性能比較の記録は #218 に残し、意図的なAPI障害・復旧試験は引き続き未実施である。
