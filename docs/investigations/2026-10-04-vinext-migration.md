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
- Cloudflare Access 環境での認証 cookie・preflight・authReady の確認。

ローカル Vinext Worker の再読み込み後、各リクエストで `workerd/util/sqlite.c++:662: SQLITE_CANTOPEN` のログが出たが応答は 200 のままだった。同じ `.wrangler/state` を別の `wrangler dev` と共有していたことによるローカル環境の事象と考えられるが、原因は未確認である。
