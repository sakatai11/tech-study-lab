# Vinext 1.0 移行可否の検証記録

この文書は2026-10-04のIssue #199で行った検証の記録であり、現在の動作保証や実装状況を表さない。現在の設計契約は [design.md §8.3](../design.md#83-server--client-コンポーネント境界)、デプロイと実行確認の条件は同書 §12.4・§12.8を参照する。外部Issueの状態はこの記録では保証しない。

## 結論

**現時点では正式移行を見送る。** Vinext 経路は `apps/web` に並行 PoC として残し、OpenNext を本番経路として維持する。

見送りの主因は、今回の Vinext 1.0.1 + Cloudflare PoC では `/learn/**`・`/quiz/[lesson]` の標準 SSG（§12.8）を維持する方法を確立・検証できていないこと、および Cloudflare 実環境（Preview Worker）での deploy 時間・Observability を未検証であること。Vinext 自体には SSG / prerender 機能があるため、SSG が実現不可能と結論づけたものではない。ビルド時間と Worker upload size は Vinext が大幅に小さく、通常 SSR・Service Binding・正解データ非漏洩は PoC で成立した。

再評価の条件：

1. 下記「SSG 実現方法の追加検証」で、`cloudflare:workers` を使う SSR と教材・演習のビルド時 SSG を両立する構成を確立し、`generateStaticParams` の全 route を Static Assets 等で配信できる。
2. Preview Worker へデプロイし、deploy 時間・Workers Logs・エラー時のログを OpenNext と比較できる。
3. ブラウザで Quiz / Review の状態遷移（採点・`router.refresh()`・state reset）と hydration を確認できる。

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
- **OpenNext deploy の乗っ取り**：`@cloudflare/vite-plugin` は build 後に `.wrangler/deploy/config.json` を書き、以後 `--config` なしの wrangler コマンドを `dist/server/wrangler.json` へリダイレクトする。`opennextjs-cloudflare deploy` は既定で `--config` を渡さないため、そのままでは OpenNext の deploy が Vinext Worker を上げる。`build:vinext` の最後にこのファイルを削除し、Vinext 側コマンドは `--config` を明示した。
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

Vinext は既定では prerender しない。`prerender: { routes: "*" }` を有効にしても、Cloudflare では Static Assets として配信する構成が別途必要で、build 時 prerender は Node 上で workerd 向け bundle を読むため `cloudflare:workers` を import するアプリでは失敗する（vinext#2911）。本 PoC は `src/lib/api.ts` 経由で shim がこの import を持つため、prerender は有効にしていない。

## SSG 実現方法の追加検証（2026-10-05 追加、未実施）

目的は、現在の PoC が SSR であることの確認に加え、構成変更によって design.md §8.2・§8.3・§12.8 のビルド時 SSG を維持できるかを検証すること。以下は検証計画であり、実現済みの結果ではない。

### 検証する構成

1. **現構成での失敗再現**：Vinext 1.0.1 の対象 route に prerender を有効化し、build ログで失敗箇所と `cloudflare:workers` の import 経路を確認する。[vinext#2911](https://github.com/cloudflare/vinext/issues/2911) の報告と、本アプリで再現した事実を分けて記録する。
2. **prerender 用と Worker 用の依存分離**：教材・演習の prerender に Worker 専用モジュールが入り込まないよう、ビルド先・alias・binding 取得の分離を試す。単に binding の参照を遅延するだけでは ESM 読み込みエラーを回避できるとは限らないため、実際の bundle と build で確認する。prerender 用 shim を試す場合は API 呼び出しを明示的に失敗させ、空データやダミーのユーザー情報を焼き込んで成功扱いにしない。SSR では実際の Service Binding を使う。
3. **Cloudflare 対応 prerender と静的配信**：固定版での対応範囲を確認し、必要なら候補版を別途固定して、上流修正または workerd / Miniflare 上の prerender を評価する。HTML と RSC の静的配信には、対応版の Static Assets adapter または同等の構成を検討する。現行 upstream の機能が 1.0.1 でも利用できると仮定しない。

デプロイ後の prewarm / CDN キャッシュを試す場合は別方式として記録する。初回アクセスやデプロイ後に生成する方式は、ビルド時 SSG の成功には数えない。通常 SSR が必要なため、アプリ全体の `output: 'export'` だけで要件を満たしたとは扱わない。

### 成功条件と記録する証拠

- **全 content route の生成**：`generateStaticParams` が列挙する教材一覧・教材本文・演習の全 URL について、ビルド時に HTML / RSC を生成する。params 一覧、生成 manifest、成果物の対応を照合する。HTTP 200 や Cache-Control のみで SSG と判定しない。
- **Cloudflare での配信**：ローカル workerd で full GET と RSC navigation が生成済み成果物を返し、教材・演習の Server render がリクエストごとに実行されないことをログ等で確認する。API Worker 停止時も本文と問題の初期表示が成立する。認証後画面の SSR は別途維持する。
- **境界の維持**：`/home`・`/review`・`/domains`・`/analytics` は request ごとの SSR と実際の API Service Binding を保ち、ユーザー固有データを静的成果物や共有キャッシュへ含めない。quiz の HTML・RSC・client bundle に `answerIndex` の正解値を含めない。
- **表示・操作の維持**：未定義 route は 404、生成済み route の metadata と本文が正しい。ブラウザで hydration、採点・解答記録、教材閲覧記録、再挑戦、`router.refresh()`、SSR / SSG 間の navigation を確認する。
- **実環境と比較**：専用 Preview Worker でも静的配信と Access 認証を確認し、SSG を含む build 時間・Worker upload size・静的成果物サイズを OpenNext と比較する。必要な環境がない項目は未検証として残す。

各候補について、依存バージョン、変更した設定、実行コマンド、build ログ、生成ファイル、配信時の観測、保守上の追加負担を残し、「成功／失敗／未検証」で判定する。SSG と SSR の両立を確認した後、Preview・ブラウザ等の残る検証結果と合わせて移行可否を再評価する。

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

- 上記「SSG 実現方法の追加検証」全項目（prerender の失敗再現、構成変更によるビルド時 SSG と SSR の両立、生成済み HTML / RSC の静的配信）。
- Cloudflare Preview Worker へのデプロイ、deploy 時間、Workers Logs / Observability の比較（Cloudflare の認証情報が無いため）。
- ブラウザでの Quiz / Review の操作（採点・`router.refresh()`・state reset）と hydration の確認。
- Cloudflare Access 環境での認証 cookie・preflight・authReady の確認。

ローカル Vinext Worker の再読み込み後、各リクエストで `workerd/util/sqlite.c++:662: SQLITE_CANTOPEN` のログが出たが応答は 200 のままだった。同じ `.wrangler/state` を別の `wrangler dev` と共有していたことによるローカル環境の事象と考えられるが、原因は未確認である。
