# 環境・デプロイ運用

環境の定義、ローカル開発、本番への手動デプロイ、GitHub Actions によるリリースの運用手順。リリースの適用順序と失敗時の停止は [ADR-0010](./adr/0010-deploy-order.md)、マイグレーションを変更しない規則は [ADR-0011](./adr/0011-immutable-migrations.md)、content の二重反映は [ADR-0006](./adr/0006-content-as-source-of-truth.md)、本番の Access 境界は [ADR-0008](./adr/0008-production-access-boundary.md) が持つ。本書はそれらを満たすための具体的な手順を持つ。

## 環境定義

**local / verification / production** を分離する。verification は既存の隔離環境を使い、GitHub Actions から更新する（「GitHub Actions による環境別リリース」）。preview 環境（PR ごとのデプロイ等）は将来検討とする。

本番切替前の実環境確認には、隔離された検証環境（Issue #218 で作成）を使う。Web は `tech-study-lab-web-test`（`apps/web/wrangler.jsonc` の `env.edge`）、API は `tech-study-lab-api-test`（`apps/api/wrangler.test.jsonc`）、D1 は `tech-study-lab-test` とし、本番の Worker・route・Origin・学習記録は変更しない。D1 へは同じ commit の migration と content から生成した問題キャッシュ・固定ユーザーだけを投入し、解答・閲覧記録は検証用 D1 に保存する。本番データの複製はしない。これは PR ごとの自動 preview 環境ではない。

検証用 Worker と D1 の名称はフレームワークに依存しない `-test` に統一する。D1 は既存 DB の改名をサポートしないため、`tech-study-lab-test` を新規作成し、既存の検証用 D1 `tech-study-lab-vinext` のスキーマ・データ・migration 履歴を export/import して移行する。移行先の ID を検証用 API config へ設定し、テーブルごとの件数と migration 履歴の一致を確認してから接続先を切り替える。旧検証用 D1 は復旧用に保持し、本番 D1 からの複製は行わない。Worker 名はダッシュボードで改名し、公開 URL・Service Binding・Access application の対象 hostname・API の `WEB_ORIGIN`・Client bundle の API URL を新名称に揃える。設定変更だけでは既存の Cloudflare リソースは変更されない。

| 環境 | Web Worker 名 | API Service Binding | build / deploy |
| --- | --- | --- | --- |
| local | `tech-study-lab-web`（ローカル実行のみ） | `tech-study-lab-api#InternalApi`（ローカル `wrangler dev`） | `dev` / `build` + `start` |
| 検証（edge） | `tech-study-lab-web-test` | `tech-study-lab-api-test#InternalApi` | `deploy:edge`（`CLOUDFLARE_ENV=edge` で build） |
| production | `tech-study-lab-web` | `tech-study-lab-api#InternalApi` | `deploy`（`CLOUDFLARE_ENV` なしで build） |

## 環境変数・バインディング一覧

設定値の一覧。**設定値をコードにハードコードしない**。

| 名前 | 種別 | 参照箇所 | local | production |
| --- | --- | --- | --- | --- |
| `DB` | D1 バインディング（api） | dal（Drizzle） | `wrangler dev` のローカル D1 | `apps/api/wrangler.toml` の `d1_databases`（要実 ID。「本番への手動デプロイ」） |
| `ANSWERS_RATE_LIMITER` | Rate Limiting バインディング（api） | `POST /answers` の永続書き込みガード（[ADR-0004](./adr/0004-persistent-write-rate-limit.md)） | `apps/api/wrangler.toml` の `[[ratelimits]]`（`namespace_id = "11301"`、60 回 / 60 秒） | local と同じ top-level `[[ratelimits]]` を API Worker へデプロイ |
| `LESSON_VIEWS_RATE_LIMITER` | Rate Limiting バインディング（api） | `POST /lesson-views` の永続書き込みガード（[ADR-0004](./adr/0004-persistent-write-rate-limit.md)） | `apps/api/wrangler.toml` の `[[ratelimits]]`（`namespace_id = "11302"`、30 回 / 60 秒） | local と同じ top-level `[[ratelimits]]` を API Worker へデプロイ |
| `WEB_ORIGIN` | var（api） | CORS 許可オリジン（ADR-0012） | `http://localhost:3000` | API deploy 時に `--var WEB_ORIGIN:<web-public-url>` として明示指定 |
| `ACCESS_ISSUER` | var（api） | Cloudflare Access JWT の issuer 検証（ADR-0008） | 未設定（両 Access 設定なし＋loopback URL のみ bypass） | API deploy 時に `--var ACCESS_ISSUER:<access-issuer>` として明示指定 |
| `ACCESS_AUDIENCE` | var（api） | Cloudflare Access JWT の audience 検証（ADR-0008） | 未設定（両 Access 設定なし＋loopback URL のみ bypass） | API deploy 時に `--var ACCESS_AUDIENCE:<access-audience>` として明示指定 |
| `API` | Service Binding（web） | Server loader（ADR-0012） | `apps/web/wrangler.jsonc` と同じ宣言。ローカル `wrangler dev` の API へ接続 | `services: [{ binding: "API", service: "tech-study-lab-api", entrypoint: "InternalApi" }]` |
| `API_BASE_URL` | env（web / Server 専用） | production 以外で `API` binding が未設定の場合のフォールバック（ADR-0012） | `http://localhost:8787` | 設定しない（Service Binding必須。欠落時はfail-fast） |
| `NEXT_PUBLIC_API_BASE_URL` | ビルド時 env（web / Client） | Client hook（ADR-0012） | `http://localhost:8787` | web の deploy 時に対象 API Worker の公開 URL `https://<API Worker 名>.<account subdomain>.workers.dev` を環境変数として明示指定。deploy は URL を解析し、ホスト名の Worker 名がデプロイ先の API（production は `tech-study-lab-api`、検証は `tech-study-lab-api-test`）と一致しない URL、http、path 付き URL を拒否する。custom domain へ移行する場合は、先に本表と deploy の検査を更新する |

## ローカル開発

1. `pnpm install`
2. `pnpm --filter @tsl/api db:migrate:local`（初回・スキーマ変更時）
3. `pnpm --filter @tsl/api content:sync`（初回・content 変更時。ローカル D1 への問題キャッシュ同期。「content の同期と開発用 seed」）
4. `pnpm --filter @tsl/api db:seed:dev`（任意。固定ユーザーの解答ログ・SRS 状態を開発用データへ再投入。「content の同期と開発用 seed」）
5. `pnpm --filter @tsl/api dev`（`:8787`）と `pnpm --filter @tsl/web dev`（`:3000`）を並走

web の `dev` は Vinext（Vite）で起動し、`@cloudflare/vite-plugin` が RSC/SSR を workerd 上で実行する。`apps/web/wrangler.jsonc` の `API` Service Binding は dev registry 経由でローカルの API Worker に接続する。production build をローカルで確認するときは `pnpm --filter @tsl/web build` の後に `start`（生成された `dist/server/wrangler.json` を `wrangler dev` で `:3000` に起動）を使う。`preview` は両者を続けて実行する。いずれもブラウザの Origin は `http://localhost:3000` であり、API の既定 `WEB_ORIGIN` と一致する。2 つの `wrangler dev` を同時に起動して inspector port が衝突する場合は、片方に `--inspector-port` を指定する。

Cloudflare の型は `pnpm --filter @tsl/web cf-typegen` で `apps/web/wrangler.jsonc` から生成する。生成物は Git 管理せず、Server 側で使う binding の型は `lib/api-server.ts` で必要な分だけ宣言する。

## content の同期と開発用 seed

同期の規則は [ADR-0006](./adr/0006-content-as-source-of-truth.md) が持つ。

content から D1 への seed/upsert（ADR-0006）を `apps/api/scripts/sync-content.ts` として実装する。ローカル同期は `pnpm --filter @tsl/api content:sync`、本番 D1 同期は `pnpm --filter @tsl/api content:sync:remote` を使う。パース・ペイロード生成・SQL 生成の純粋ロジックは `apps/api/src/content-sync.ts` に切り出し（設計文書 §4.3）、`scripts/sync-content.ts` はそれを呼ぶ Node CLI 部（`fs` 読み取り・`wrangler d1 execute` 実行）に徹する。

- **パース経路は Web のビルド時バンドル（設計文書 §5.1）と共有**：`gray-matter` でパースし `packages/shared` の content Zod（`validatedMcqSchema` 含む）で検証する。フロントのビルド時バンドルと同じ検証を通った内容だけが D1 に入る。
- 同期対象は `questions` テーブルの**最小フィールドのみ**（`question_id`, `answer_index`, `domain`, `topic`, `lesson_id`, `is_active`。ADR-0006）。本文・選択肢・解説は D1 に入れない。
- 検証済みデータから upsert SQL（`INSERT ... ON CONFLICT(question_id) DO UPDATE`）を生成し、`wrangler d1 execute tech-study-lab --local|--remote --file <generated-sql>` の固定引数で流す。`content:sync` は `--local` 固定、`content:sync:remote` は `--remote` 固定とし、CLI はこのいずれかの完全一致モード以外（任意引数・追加引数を含む）を SQL 生成・Wrangler 実行の前に拒否する。**冪等**（何度実行しても同じ結果）にする。
- 固定ユーザー行（`users`）の seed も同スクリプトで行う（共通の `FIXED_USER_ID` と同じ値）。
- content から削除された問題は**物理削除しない**（`answer_logs`・`srs_states` が参照するため）。同期の最後に `is_active = 0` とし、`GET /domains` の集計対象から外す。出題対象からも自然に外れる（フロントのバンドルに含まれず、due queue の join でも解決されない）。
- 通常リリースの同期は「GitHub Actions による環境別リリース」の CI 経路で実行する。既存の `content:sync:remote` は手動運用用として維持し、外部 D1 を変更するため、実行ごとに対象データベース・生成 SQL・実行順を確認した明示的な承認と対話 TTY 確認を必須とする。CI の production 同期は、品質検査・環境別 build と変更前の環境・検証済みソース照合が成功した後に自動実行する。

### ローカル動的開発 seed

`pnpm --filter @tsl/api db:seed:dev` は、ローカル D1 の開発確認用に固定ユーザー（`FIXED_USER_ID`）だけの動的データを冪等に投入する。content の question ID は、`content-sync` と同じ `gray-matter` + shared content Zod の検証経路から得る。content 同期や本番デプロイの責務を置き換えない。

- 実行 SQL は固定ユーザーの `answer_logs` と `srs_states` だけを削除してから再投入する。他ユーザーの行、`questions`、教材 content は削除・更新しない。
- 検証済みの各問題に `due_at` が seed 時刻以下の `srs_state` を 1 行作る。各問題には、正解かつ `response_time_ms` あり、不正解かつ `response_time_ms` なしの決定的な answer log を作る。問題が 1 件だけでも両方のケースを含める。
- SQL の ID・時刻・解答内容は入力（question ID と seed 時刻）から決定的に生成し、再実行しても固定ユーザーのデータ量が増えない。
- CLI は `wrangler d1 execute tech-study-lab --local --file <generated-sql>` の固定引数だけを使用し、`--remote` や利用者が渡した任意引数を受け付けない。remote D1 には使用しない。

## 本番の Access 境界の準備

- この境界は Issue #35 の Cloudflare Access application / policy / `ACCESS_ISSUER` / `ACCESS_AUDIENCE` の本番設定に依存する。値は非秘密 binding として環境に設定し、リポジトリや `.env` へ保存しない。Issue #35 では API Worker に Access を適用する公開 hostname または custom domain を用意し、ブラウザの `POST` を含む CORS preflight が Access edge で遮断されず Worker の CORS 応答へ到達するか、同等の Access 側応答を返すことをデプロイ前に確認する。Access dashboard の具体的な設定値はここで固定せず、この結果を実機で検証する。
- browser の `credentials: 'include'` は Access application cookie が web と API の両方へ適切に送られる構成を前提とする。cross-site cookie 設定と両立しない組み合わせを避け、可能なら同一 site（例: `web.example.com` と `api.example.com`）または同一 origin の API route を採る。異なる site を使う場合も、実際の Access cookie 属性とブラウザの credentialed CORS 制約を本番 hostname で検証してから公開する。

認証方式の信頼境界、公開トップから `/home` へのログイン導線、ブラウザ API と Service Binding のシークエンス図は、補助資料として [`docs/authentication-architecture.html`](./authentication-architecture.html) に整理する。信頼境界の一次ソースは ADR-0008 であり、補助資料は実装状況と通信順序を参照しやすい形へ再構成したものとする。

## 本番への手動デプロイ

適用順序と失敗時の停止は [ADR-0010](./adr/0010-deploy-order.md) が持つ。

初回のみ：`wrangler d1 create tech-study-lab` を実行し、発行された非秘密の `database_id` を `apps/api/wrangler.toml` に設定して Git 管理する。外部リソースの作成・更新を伴うため、実行前に対象アカウント・D1・Worker・入力値を確認し、明示的な承認を得る。`WEB_ORIGIN`・`ACCESS_ISSUER`・`ACCESS_AUDIENCE` の production 値はリポジトリや `.env` に保存しない。

デプロイ前に、API/public Web hostname と Cloudflare Access application / policy の対象を確認する。ブラウザと同じ `Origin` を指定した `OPTIONS`（`POST` と必要 header を含む）が、Access edge で遮断されず Worker の credentialed CORS 応答に到達するか、同等の正しい Access 応答を返すことを実機で確認する。Access cookie が Web と API の実際の hostname で送信されることも確認できるまで、以下を開始しない。

1. **マイグレーション適用**：`pnpm --filter @tsl/api exec wrangler d1 migrations apply tech-study-lab --remote`
2. **content sync**：`pnpm --filter @tsl/api content:sync:remote`（`content/` → D1 upsert。「content の同期と開発用 seed」）
3. **api デプロイ**：`pnpm --filter @tsl/api run deploy --var WEB_ORIGIN:<web-public-url> --var ACCESS_ISSUER:<access-issuer> --var ACCESS_AUDIENCE:<access-audience>`。3 値は**毎回すべて**この deploy 実行時だけ明示指定し、Git や `.env` には保存しない。値を省いた bare deploy は禁止する。Wrangler がローカルまたは不完全な vars へ置き換えると、Access は fail closed となり、CORS も失敗し得る。`pnpm deploy` は pnpm 自身のコマンドと衝突するため、package script は必ず `run deploy` で起動し、引数前に追加の `--` を置かない。
4. **web デプロイ**：`NEXT_PUBLIC_API_BASE_URL=<api-public-url> pnpm --filter @tsl/web run deploy` を実行する。このコマンドは `CLOUDFLARE_ENV` を外して Vinext の production build を行い、生成された `dist/server/wrangler.json` の Worker 名 `tech-study-lab-web`、`API` Service Binding `tech-study-lab-api#InternalApi`、`DOQueueHandler` の `v1`/`v2` migration 履歴を検査してから、その生成 config を明示して `wrangler deploy` する。`NEXT_PUBLIC_API_BASE_URL` は build 時に Client bundle へ埋め込まれるため、本番 API の公開 URL を毎回指定する。ブラウザが別環境の API へ解答を送らないよう、URL の Worker 名がデプロイ先の API と一致することを build 前に検査する（「環境変数・バインディング一覧」）。通常の手動反映は build と upload を続けて実行する。追加引数は `--dry-run` と、「GitHub Actions による環境別リリース」の成果物分離用の `--prepare-only` / `--upload-only`（同時指定不可）に限定し、CLI による Worker 名・config・env の上書きを防ぐ。

順序の根拠：**スキーマ → データ → API → 画面** の順なら、各ステップの完了時点で稼働中の旧バージョンが壊れない（マイグレーションが追加中心の後方互換であることが前提。ADR-0011）。

検証環境への web デプロイは `NEXT_PUBLIC_API_BASE_URL=<verification-api-public-url> pnpm --filter @tsl/web run deploy:edge` で行う。`CLOUDFLARE_ENV=edge` で build し、生成 config が Worker 名 `tech-study-lab-web-test`、`API` Service Binding `tech-study-lab-api-test#InternalApi`、空の `migrations`、`workers_dev: true`、`preview_urls: false` であることを検査する。production と検証環境のどちらの deploy も、相手の環境向けに生成された config を Wrangler 起動前に拒否する。設定選択は build 時に行い、deploy 時の環境変数だけで接続先が切り替わると扱わない。`deploy:edge` は本番デプロイ手順に含めない。

検証用 hostname でも公開 `/` と Access で保護する `/home`・`/learn`・`/quiz`・`/review`・`/domains`・`/analytics` の境界を適用する。検証用 API は専用 Access application で保護し、`OPTIONS` は API の credentialed CORS 応答へ転送する。API の deploy と検証 D1 の操作には `apps/api/wrangler.test.jsonc` を明示指定する。API の `WEB_ORIGIN`・`ACCESS_ISSUER`・`ACCESS_AUDIENCE` はデプロイごとに明示指定し、Git や `.env` に保存しない。外部リソース作成、remote D1 への migration/content SQL 実行、Worker/Access 更新は、対象アカウント・検証用リソース・入力値・SQL を確認した承認を得てから行う。実施結果と再実行手順は [Vinext 検証記録](./investigations/2026-10-04-vinext-migration.md) に記録する。

### 本番 Web の Vinext 切替（Issue #221）

本番 Web Worker `tech-study-lab-web` は OpenNext 成果物で稼働している。リポジトリの標準 build / deploy は Vinext へ一本化したが、本番への最初の Vinext deploy は次の条件をすべて満たしてから、対象・入力値・反映手順を確認した承認に基づいて行う。

1. Issue #220 の CPU 軽減が完了し、Workers Free の検証環境で `/home`・`/review`・`/domains`・`/analytics` × HTML/RSC の連続測定が CPU 上限超過で中断しないこと。
2. 同じ commit を `deploy:edge` で検証環境へ反映し、主要導線（公開トップ、home、教材、Quiz の採点、Review、領域一覧、分析）、Access 境界、CORS preflight、Logs/Observability を確認していること。
3. 切替前に `wrangler deployments list --name tech-study-lab-web` で稼働中の OpenNext の version ID と対象 commit を記録していること。

切替は「本番への手動デプロイ」の手順4だけを実行し、API・D1 の migration や content sync、本番データの複製は伴わない（API・D1 の契約は変わらない）。切替後は実際の Worker version・binding・主要画面・mutation・Logs を確認し、version ID と証跡を Issue に記録する。失敗時は記録した OpenNext の version ID を `wrangler rollback <version-id> --name tech-study-lab-web` で既知版へ戻し、原因を解消するまで再切替しない。OpenNext の並行運用は恒久化しない。

- 通常リリースは「GitHub Actions による環境別リリース」で実行する。上記コマンドは手動運用・障害調査用として維持する。production も品質検査・環境別 build と変更前の照合が成功したら、人間の追加承認を待たず remote D1 mutation / Worker 更新まで自動実行する。初回 Vinext 切替は上記の条件と Web のみの手順を維持する。
- 各ステップの成功を確認するまで後続ステップへ進まない。失敗時はそこで停止し、後続の migration/content sync/API/Web deploy を実行しない。復旧が必要な場合は、稼働中の既知の Worker version を確認してから、対象と影響を明示した承認を得てロールバックする。

## content 更新の運用

二重反映の規則は [ADR-0006](./adr/0006-content-as-source-of-truth.md) が持つ。

content は「web のビルド時バンドル（設計文書 §5.1）」と「D1 の `questions` 同期（「content の同期と開発用 seed」）」の**二重反映**である。

- content を変更したら、「本番への手動デプロイ」の **② content sync と ④ web 再ビルド・デプロイを必ずセットで実行**する。
- 片方だけ実行すると「画面に問題が表示されるのに採点 API が `QUESTION_NOT_FOUND` を返す」不整合が起きる。
- CI 化の際は `content/` の差分を検知して両ジョブを必須にする。

## マイグレーション運用

変更しない規則と段階的な破壊的変更は [ADR-0011](./adr/0011-immutable-migrations.md) が持つ。

- 生成：`pnpm --filter @tsl/api db:generate`（drizzle-kit）→ ローカル適用（`db:migrate:local`）→ テスト → PR。
- 本番適用はデプロイ手順の先頭（「本番への手動デプロイ」の①）。
- **破壊的変更（列削除・型変更・NOT NULL 追加）は原則避け、追加中心**とする。やむを得ない場合は「新列追加 → データ移行 → 旧列削除」の多段リリースで行う。
- Git に取り込まれた Drizzle migration のファイル名・SQL 本文、および既存の `meta/*_snapshot.json` は変更・削除・改名しない。migration の履歴は適用済みファイル名と SQL に依存するため、修正が必要なら新しい migration を追加する。CI は PR base に存在する `.sql` と snapshot の blob を checkout 済み PR HEAD と比較し、削除・改名・内容変更を拒否する。新規 migration と snapshot の追加は許可する。`meta/_journal.json` は Drizzle の生成結果として既存 entry を保ったまま新しい entry を末尾へ追加する。CI は既存 entry が同じ順序のまま保持されていることも確認し、journal の削除や既存 entry の変更・削除・並べ替えを拒否する。
- 過去に `0002_add_question_metadata.sql` として適用済みの**ローカル D1**を、同じ SQL の現行名 `0002_nasty_guardsmen.sql` に合わせる必要がある場合に限り、先に D1 のバックアップ、`d1_migrations` の旧名行の有無、実スキーマが migration 後の状態であることを確認する。旧名行がちょうど 1 件あり、新名行が存在しないときだけ、次の条件付き更新を `wrangler d1 execute tech-study-lab --local` で実行し、更新後の履歴を確認してから `db:migrate:local` を実行する。条件に合わない場合は更新せず、履歴とスキーマを調査する。

  ```sh
  pnpm --filter @tsl/api exec wrangler d1 execute tech-study-lab --local --command "UPDATE d1_migrations SET name = '0002_nasty_guardsmen.sql' WHERE name = '0002_add_question_metadata.sql' AND (SELECT COUNT(*) FROM d1_migrations WHERE name = '0002_add_question_metadata.sql') = 1 AND NOT EXISTS (SELECT 1 FROM d1_migrations WHERE name = '0002_nasty_guardsmen.sql');"
  ```

  この履歴修復はローカル D1 に限る。適用済み migration の変更や production 履歴の書き換えには使わない。

## バックアップ・観測

- **バックアップ**：教材・問題は Git にあるため、守る対象は D1 の動的データ（`answer_logs` / `srs_states` / `lesson_views`）のみ。当面は必要時に `wrangler d1 export` を手動実行し、マルチユーザー公開時に定期化（Cron 等）を検討する。
- **観測**：rate limit / 永続書き込み（[ADR-0004](./adr/0004-persistent-write-rate-limit.md)）では、429・limiter failure・成功した永続書き込みごとに `event`・`endpoint`・`writeUnit` だけを含む PII-free の構造化 Worker log を出す。運用時は Workers Logs の event 別件数と D1 dashboard の `answer_logs` / `lesson_views` / `srs_states` の書き込み・容量メトリクスを同じ時間帯で突合する。`console.error` は未処理エラーの出力（設計文書 §5.7）に限る。Analytics Engine を含む外部監視は、既存のログと D1 メトリクスでは不足すると判断された場合に別 issue で検討する。

## 通常 SSR・標準 SSG の実行確認

通常 SSR の認証後 route は、ユーザー固有の API データをリクエストごとに取得し、route error boundary が取得失敗を扱うことを確認する。教材・演習 route は `generateStaticParams` が全 content params を返し、Vinext の production build が標準 SSG を生成することを確認する。Client hook の API client は最初の送信まで遅延生成し、render / SSG 時のブラウザ専用設定への依存を避ける。

- **成果物検証（CI）**：`pnpm build` の後に `pnpm --filter @tsl/web verify:build` を実行する。`dist/server/vinext-prerender.json` の rendered route が `/`・`/learn`・全 content params・`/404` と一致し、`/home`・`/review`・`/domains`・`/analytics` が prerender されていないこと、生成 HTML / RSC と公開 Client JS に `answerIndex` が含まれないこと、SSR の Worker entry と `API`（`InternalApi`）binding が生成 config に存在すること、内部 cache artifact が `run_worker_first` で Worker 経由になることを確認する。
- **実行時検証（ローカル・検証環境）**：API を起動し、web を `build` + `start` で起動した状態で `pnpm --filter @tsl/web verify:ssg` を実行する（接続先は `WEB_VERIFY_BASE_URL`、既定 `http://localhost:3000`）。content route の HTML / RSC が `x-vinext-cache: HIT` で生成物と一致すること、SSR route が `no-store` で error boundary を返さないこと、別表記 URL と内部 cache artifact の直接取得が 404 になることを確認する。認証後 route は full GET に加えて `?_rsc` navigation も `text/x-component`・`no-store` の通常 SSR として完了することを確認する。

構成確認では、`API` Service Binding が残り、`cacheComponents`、ISR 用の Incremental Cache、R2、KV、Durable Object Queue の有効 binding、Worker 自己参照 binding が存在しないこと、登録済み `DOQueueHandler` の `v1` 作成履歴と後続の `v2` 削除 migration を top-level で維持し検証用 env が継承しないこと、標準 script が OpenNext に依存しないことをテストで固定する。

## GitHub Actions による環境別リリース

適用順序と失敗時の停止は [ADR-0010](./adr/0010-deploy-order.md)、content の同期を毎回実行する規則は [ADR-0006](./adr/0006-content-as-source-of-truth.md) が持つ。

- PR CI は既存の検査・build のみ。`develop` push は `verification`、`main` push は `production` を対象とし、手動実行もこの対応を固定する。GitHub Environments の許可ブランチはそれぞれ `develop` / `main` に限定する。
- `prepare` job は Cloudflare token を持たず、対象 commit を固定して検査・環境別 build・SQL 生成・manifest 作成を完了する。manifest は環境、SHA、source tree、問題数、全ファイルの SHA-256、migration 一覧を含む。API は dry-run で生成した bundle、Web は生成 config と `dist` を反映用成果物として保存する。後続の `apply` job では再ビルドせず、同じ run の成果物を照合して利用する。
- production も `prepare` 成功後に `apply` が自動開始し、人間の追加承認を待たず environment Secrets から Cloudflare token を取得する。両 environment の required reviewers・wait timer・custom deployment protection rules は設定せず、正確な許可ブランチを preflight で検査する。検証 / 本番の enable flag は明示設定されるまで無効とし、本番初回切替条件を満たす前に有効化しない。PR のマージは従来どおり人間が行う。
- apply は **設定・manifest・鮮度・検証済み source の検査 → migration → content sync → API → API 確認 → Web → smoke test → 成功記録** の順。どの段階でも失敗したら後続を停止する。同じ環境の通常リリースと復旧は共通 concurrency group で直列化し、`cancel-in-progress: false` とする。
- content sync の CI 経路は SQL 生成と remote 実行を分離し、manifest の SQL を固定した D1 / config に非対話で適用する。問題が空の CI リリースは書き込み動作確認ができないため拒否する。既存の手動 remote は対話 TTY 確認を維持する。冪等な同期は失敗した run が D1 だけを変更した場合の取りこぼしを避けるため、成功記録の content 差分に関わらず毎回実行する（差分は計画の情報として記録する）。Web は毎回同じ source から反映し、二重反映の片方だけを省略しない。
- Worker / DB の名前・ID・config、Web origin、公開 API URL、Service Binding、migration 履歴を対象環境と照合し、任意 CLI 引数による上書きを認めない。API の `WEB_ORIGIN` / `ACCESS_ISSUER` / `ACCESS_AUDIENCE` は environment Variables から毎回指定する。認証情報は environment Secrets にのみ保存し、Git・ログ・artifact に含めない。
- 成功記録は GitHub Deployment に環境・SHA・tree・Worker version・run ID を保存する。本番候補は直近の正常 verification と source tree が一致することを必須とし、merge による SHA の違いを許容する。変更開始前に最新 branch SHA を再検査し、古い run が新しい反映を巻き戻すことを防ぐ。
- smoke test は公開 `/` と `/health`、未認証の Access redirect、credentialed CORS preflight、CI 専用の Access Service Token を使う認証済み主要画面を検査する。Service Token の Client ID / Secret は environment Secrets に保存し、Web / API の Access Application でこの token に限定する Service Auth policy を運用者が設定する。token 失効時は検査を失敗させる。専用 verification では採点・閲覧記録の書き込みを確認し、production では GET と OPTIONS だけを実行する。Access policy / API 認証境界を自動で弱めない。
- deploy 前後の実際の Worker version を記録する。通信エラー後の再実行は実状態・適用済み migration・冪等 upsert を確認して行い、失敗した操作をその場で無条件に再試行しない。本番 Worker rollback は対象 version ID と確認した現在の version ID を指定する手動 workflow とし、その実行操作を復旧の承認とする。environment での追加承認は設けず、復旧後は成功ソースの証明を無効にする。D1 の状態は戻らず、DB 復旧は別手順とする。
- 実行手順、環境設定、artifact のアクセス・保持期間、失敗時の再実行・復旧方法は、本書の以下の節に定める。初回の環境設定・token 登録・Service Token の登録・更新は運用者が行う。

PR は検査のみ、`develop` は検証環境、`main` は本番環境へ、品質検査・環境別ビルドの成功後に自動反映する。デプロイの追加承認は不要。GitHub Actions の workflow は、対象ブランチへ人間がマージしてから利用する。

## 初回設定

GitHub の Settings → Environments に次を設定する。

| Environment | Deployment branches | Required reviewers |
| --- | --- | --- |
| `verification` | branch `develop` だけ（tag は許可しない） | 不要 |
| `production` | branch `main` だけ（tag は許可しない） | 不要 |

両環境とも Required reviewers・Wait timer・Custom deployment protection rules は設定しない。既に設定されている場合は解除する。許可ブランチは上記の1ブランチに限定し、設定できない場合は enable flag を有効にしない。`main` へのリリース PR のマージ判断は人間が行う。

Repository Variables:

| 名前 | 設定 |
| --- | --- |
| `DEPLOY_ACCOUNT_SUBDOMAIN` | 対象アカウントの workers.dev サブドメイン（現在は `sakai111893`） |
| `VERIFICATION_DEPLOY_ENABLED` | 初期値 `false`。下記の検証用設定がすべて完了してから `true` |
| `PRODUCTION_DEPLOY_ENABLED` | 初期値 `false`。検証成功・初回 Vinext 切替完了後に `true` |

Environment Variables（環境ごとに設定）:

| 名前 | 設定 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | 対象アカウントの ID。コードの固定対象と異なる場合は、先に設計・対象一覧を更新する |
| `WEB_ORIGIN` | 当該環境 Web の `https://<Worker名>.<subdomain>.workers.dev`。末尾 slash なし |
| `ACCESS_ISSUER` | 当該 API Access application の issuer（例 `https://<team>.cloudflareaccess.com`）。完全一致の値、末尾 slash なし |
| `ACCESS_AUDIENCE` | 当該 API application の AUD（64 桁 hex） |
| `PRODUCTION_VINEXT_READY` | production だけ。初期値 `false`。「本番 Web の Vinext 切替」の条件を満たし初回の Web のみの切替が完了した後に `true` |

Environment Secrets（値をチャットやファイルへコピーせず、GitHub の入力画面で登録）:

| 名前 | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 対象アカウントに限定した CI 用 token。Workers Scripts Edit、D1 Edit と、デプロイ時に必要な account 読取権限。production の照合処理は検証 Worker の deployment も読む |
| `CF_ACCESS_CLIENT_ID` | 当該環境の smoke test 専用 Access Service Token の Client ID |
| `CF_ACCESS_CLIENT_SECRET` | 同 token の Client Secret |

[Cloudflare の CI 認証](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)に従って API token を作成する。コード・通常ログ・artifact に token を保存しない。同一アカウント内の token 分離だけを、Worker / DB 単位の完全な権限分離とは扱わない。

認証付き smoke test は、[Access Service Token](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/) を各リクエストの `CF-Access-Client-Id` / `CF-Access-Client-Secret` header に付ける。運用者は Web と API の Access Application に、この token だけを許可する **Service Auth** policy を追加する。人間のログイン policy、公開 `/`・`/health`、CORS OPTIONS の既存設定は維持する。workflow は Access policy を変更しない。Web と API の JWT issuer / audience 検証も維持する。token の期限・ローテーションを管理し、認証失敗を検査の成功として扱わない。

検証用 API は現行 MVP の固定ユーザーを使う。検証 smoke test はこのユーザーの解答ログ・SRS・閲覧記録を更新する。本番データを複製せず、production の smoke test は GET / OPTIONS に限定する。Service Auth の確認だけで人間のブラウザログインや Cookie の挙動を保証できないため、初回切替時のブラウザ確認は別途実施する。

### 未作成の token を登録する手順

まず verification 用を登録し、production 用は本番の有効化前に別途登録する。

1. Cloudflare の Account API tokens → Create Token で CI 用 token を作成する。Edit Cloudflare Workers を基に、対象アカウントだけを許可し、上記の Workers / D1 操作に必要な権限を設定する。有効期限と管理者を決める。
2. GitHub の Settings → Environments → `verification` → Environment secrets → Add environment secret から、生成した token を `CLOUDFLARE_API_TOKEN` として登録する。Repository Secrets へ共通登録せず、環境ごとに管理する。
3. Cloudflare Zero Trust → Access controls → Service credentials → Service Tokens → Create Service Token で、検証 CI 用の Service Token を作成する。期限を設定し、表示された Client ID / Client Secret を同じ GitHub Environment の `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` に登録する。Client Secret は作成時の表示を失う前に登録する。
4. 検証 Web / API の Access Applications に、Action が **Service Auth**、Include が **Service Token = 作成した token** の policy を追加する。既存の人間向け Allow policy と公開パスの設定は維持する。
5. API の Access Application で issuer / AUD を確認し、同じ GitHub Environment の Variables に `ACCESS_ISSUER` / `ACCESS_AUDIENCE` を登録する。上記表の account / origin と Repository Variables も設定する。
6. 下記の検証有効化手順へ進む。token 失効時は workflow が失敗するため、期限前に更新し、GitHub Secrets も差し替える。

token の値はチャット・Issue・PR・端末履歴へ貼らず、Cloudflare と GitHub の設定画面間で登録する。

## 検証環境を有効化する

1. 上記の Environments・branch policy・Variables・Secrets・Access Service Auth を設定する。
2. workflow とスクリプトを `develop` へマージする。
3. `VERIFICATION_DEPLOY_ENABLED=true` にする。
4. Actions → Deploy → Run workflow で branch `develop` を指定する。
5. plan、適用ステップ、smoke test、GitHub Deployment の成功記録を確認する。以降の `develop` push は自動実行される。

検証用は `tech-study-lab-web-test` / `tech-study-lab-api-test` / `tech-study-lab-test`。本番向け config・URL・D1 ID を混入すると、変更前に失敗する。

## 本番を有効化する

1. #220 の CPU 軽減・無料プランでの再検証など、「本番 Web の Vinext 切替」の条件を満たす。
2. 初回は既存手順どおり **Web のみ**を承認して切り替え、version・動作確認の証跡を残す。この操作を通常の DB → API → Web リリースで代用しない。
3. 同じソースを検証環境へ反映し、自動 smoke test まで成功させる。
4. production の branch policy が `main` だけを許可し、Required reviewers・Wait timer・Custom deployment protection rules が未設定であることを確認する。本番用 Variables・Secrets・Access Service Auth を設定し、`PRODUCTION_VINEXT_READY=true` と `PRODUCTION_DEPLOY_ENABLED=true` にする。
5. 人間がリリース PR を `main` へマージする。Deploy の prepare が plan と immutable artifact を生成する。
6. prepare 成功後に apply が自動開始する。plan・manifest・環境・検証済みソースの照合が通ったら remote D1 / Worker を更新し、smoke test と成功記録まで実行する。失敗した場合は後続を停止する。

本番候補は直近の成功した検証リリースと source tree が一致する必要がある。merge による SHA の差は許容するが、ソースが変わった場合は検証からやり直す。検証 Worker が手動反映や失敗途中の更新で記録と異なる場合も、本番は停止する。

## 実行順序と記録

prepare は Cloudflare の変更権限を持たず、locked dependencies、品質検査、SQL 生成、環境別 Web build / 成果物検査、API dry-run bundle を実行する。SHA・tree・全ファイルの SHA-256 を manifest に含める。API config / bundle / migration、Web `dist`、生成 SQL は同じ run / attempt の artifact に保存する。

apply は対象環境の Secrets を使用し、manifest・設定・最新 branch SHA・検証ソース、実アカウントの workers.dev subdomain、現在の API に対する Service Token 認証を変更前に検査する。次に **migration → content sync → API deploy → API health → Web upload → smoke test → 成功記録**を行う。Web upload は再ビルドせず prepare の receipt・全ファイル hash を照合する。content sync は冪等なため毎回実行する（失敗 run が D1 だけを更新した後に content が戻っても取りこぼさない）。content 差分は計画に情報として表示する。問題が空のリリースは拒否する。

同一環境の deploy / rollback は `deploy-verification` / `deploy-production` concurrency group を共有する。変更開始済みの run は新しい push でキャンセルしない。変更開始前に branch が進んでいた場合は古い run を拒否する。

結果の確認先:

- Actions の Job Summary：plan、処理段階、反映前後の Worker version、成功 / 失敗。
- `deployment-result-<run>-<attempt>` artifact：認証情報を除いた `result.json`。保持 30 日。
- GitHub Deployment：全ステップ成功時だけ作成する `tsl-release` 記録（環境・SHA・tree・content tree・version・run ID）。
- `release-<run>-<attempt>` artifact：ビルド成果物・SQL・manifest。保持 3 日。認証情報は含めないが、サーバー成果物・解答データを含む。ダウンロードには GitHub 認証と artifact のアクセス権が必要であり、公開 Web assets へ転用しない。永続的な秘密の保存先にはしない。

## 失敗・再実行

どの段階でも失敗したら後続を停止する。API 更新後に Web が失敗するなど、部分反映は起こり得る。まず Job Summary / result.json と Cloudflare の実際の version・D1 migration 履歴を確認する。レスポンス切断を理由に、その場で同じ変更を無条件に再試行しない。

原因解消後は **Re-run all jobs** または対象ブランチから Deploy を手動起動し、prepare からやり直す。失敗 job のみの再実行は artifact の run attempt が一致せず拒否される。古い SHA・期限切れ artifact は再利用しない。migration の適用済み履歴と content upsert の冪等性を使い、content sync は毎回再実行される。

認証情報不足・保護設定不足・本番切替条件未達は、成功やスキップ済みリリースとして記録しない。

## Worker の復旧

1. Cloudflare / result.json で現在の version と既知の正常 version を確認する。接続先資源や Durable Object migration の変更で rollback が制限される場合も確認する。
2. Actions → Roll back Worker → Run workflow を選ぶ。production は branch `main`、verification は `develop` を使う。
3. environment、`web` または `api`、復旧先 version UUID、確認した現在の version UUID を入力する。
4. 対象と影響を確認して Run workflow を実行する。この実行操作を復旧の承認とし、environment での追加承認は不要。実行時の実 version が入力と異なれば更新を拒否する。
5. 指定 Worker の version を戻したことを確認する。画面・API・Access / CORS を運用者が確認し、必要なら他方の Worker も対象を確認して別途手動実行する。

成功した rollback は `tsl-rollback` として記録し、従来の成功 source の証明を無効にする。次回は検証・通常 deploy から再確認する。**D1 スキーマ・content cache・学習記録は rollback されない。** DB の復旧が必要なら別途バックアップと影響を確認して承認する。[Cloudflare の rollback 制限](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
