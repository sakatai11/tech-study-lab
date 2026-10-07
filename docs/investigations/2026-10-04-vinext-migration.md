# Vinext 1.0 移行可否の検証記録

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
