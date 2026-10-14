# tech-study-lab 設計文書

ソフトウェア学習アプリ。個人エンジニアが「セキュリティ / フロントエンド・バックエンドのフレームワーク / アーキテクチャ設計」を、読み物（教材）と4択問題演習で学ぶ。解答ログを分析し、SRS（間隔反復）アルゴリズムで出題を最適化する。開発自体をAI駆動で進めることを主目的とし、その基盤を構築する。

本書は **プロダクト方針・技術スタック・依存方向・データフローの層** を持ち、[ADR 索引](./adr/README.md)への入口になる。設計契約（何を守るか、なぜ、どこまで適用するか）は [ADR](./adr/README.md) が持ち、不変条件はテストで検証する（[ADR-0001](./adr/0001-contracts-as-adr-and-tests.md)）。契約を新設・変更する場合は、実装より先に ADR を作る。実装が契約に違反しているだけの場合は、契約を実装に合わせて緩めず、不具合として修正する。

| 情報 | 一次ソース・役割 |
| --- | --- |
| 何を守るか・なぜその設計を採ったか・どこまで適用するか | [ADR](./adr/README.md) |
| プロダクト方針・技術スタック・依存方向・データフローの層 | 本書 |
| 見た目・表示文言・画面の振る舞いの規約 | [デザインシステムと画面の規約](./design-system.md) |
| 教材・問題の執筆規約 | [コンテンツ規約](./content-guidelines.md) |
| 環境・ローカル開発・デプロイの手順 | [環境・デプロイ運用](./deployment.md) |
| 現在のファイル配置・型・schema・関数シグネチャ・設定 | コードと設定。正確な宣言や現在の構成を本書へ複製しない |
| 現在構造の探索・変更影響の候補 | [Knowledge Graph](../architecture/README.md)。コード・設定から抽出する参照データであり、仕様や実行時挙動の証明ではない |
| 契約を満たすことの検証 | 型チェック・テスト・実行確認。ADR を検証するテストは `describe` / `it` 名に `[ADR-NNNN]` を付ける。テストは根拠であり、契約の変更を単独で承認するものではない |
| 実装状況・残タスク・完了記録 | GitHub Issue / PR。完了済みタスク一覧は本書に残さない |
| 過去の調査・比較・検証結果・経緯 | [`docs/investigations/`](./investigations/) の日付付きの記録 |

Knowledge Graphの抽出対象・制限・更新方法は [architecture/README.md](../architecture/README.md)、Issue開発での使い方は[Knowledge Graph の使い方](../.ai/skills/issue-dev-orchestrate/references/architecture-context.md)を参照する。Graphで候補を絞った後、コード・型・テストと本書の契約で再確認する。Graph対象外の文書・UI・教材も、仕様確認や通常の検索の対象から外さない。

## 1. プロダクト方針

| 項目 | 決定 |
| --- | --- |
| ユーザー | 個人（自分）から開始 → **将来公開**。データ分離は最初から意識する |
| 学習領域 | セキュリティ / FE・BEフレームワーク / アーキテクチャ設計 |
| 学習形態 | 読み物（教材）＋ **4択**問題演習 |
| 適応学習 | **出題制御型**（SRS／弱点優先）。コンテンツ自体の自動生成はしない |
| SRS単位 | **問題ごと**（弱点を問題粒度で追跡） |
| コンテンツ供給 | 既存教材の構造化取込 ＋ 手書き骨子＋AI補助執筆 |

### スコープ外（現時点）

- コンテンツ生成型の適応学習（解答傾向からLLMが問題・解説を自動生成・改訂する仕組み）
- 記述式・コードリーディング問題の採点（データモデル上は拡張ポイントとして確保）
- マルチユーザー公開機能（認証・課金等）。ただしデータ設計はユーザー分離を前提にする

## 2. 技術スタック

フルCloudflare構成。Hono と Cloudflare を学習目的で採用する（このアプリ開発自体をドッグフーディングの場とする）。

| レイヤー | 技術 | 補足 |
| --- | --- | --- |
| フロント | Next.js（App Router）互換 API + Vinext | Vite ベースの Vinext で開発・ビルドし、`@cloudflare/vite-plugin` で Cloudflare Workers へデプロイ（Issue #221） |
| API | Hono | Cloudflare Workers。**主要APIを一通り担当** |
| DB | Cloudflare D1（SQLite） | ORM は Drizzle |
| 型・バリデーション | TypeScript strict / Zod | Honoの `zValidator` とフロントで共有 |
| Lint/Format | Biome | 設定一元化・高速 |
| テスト | Vitest | SRSロジックは純粋関数で重点的にテスト |
| CI | GitHub Actions | 型・lint・test・build を PR ゲート化 |
| パッケージ管理 | pnpm workspaces | monorepo |

### 既知のリスク

- Vinext は Next.js 本体ではなく Vite 上の互換実装であり、未対応 API や挙動差が残り得る。`next/*` の型と互換 API は使い続け、移行可否と検証結果は [Vinext 検証記録](./investigations/2026-10-04-vinext-migration.md) を参照する。これは「Cloudflareを学ぶ」目的の一部として許容する。
- Workers Free の CPU 上限超過（Issue #220）が認証後画面の連続取得で観測されている。本番 Web の Vinext 切替は、その解消と実環境での連続測定の完了を前提とする（[環境・デプロイ運用](./deployment.md)の「本番 Web の Vinext 切替」）。

## 3. AI駆動開発の基盤

### 方針

- **目標**：契約駆動・スキル化・ガードレールの **統合**。
- **整備順**：
  1. **ガードレール（C）** — 型安全・テスト・CI。「動くが間違ったコード」を最初に防ぐ土台
  2. **契約駆動（A）** — 判断の理由と境界を ADR に、不変条件をテストに置き、AIのコンテキストと人間のレビュー基準を揃える（[ADR-0001](./adr/0001-contracts-as-adr-and-tests.md)）
  3. **スキル化（B）** — 反復作業（教材取込・問題追加・マイグレーション等）が見えた段階でスキル/サブエージェント化

### ガードレールの中身

- TypeScript strict、型は `packages/shared` に集約
- Biome による lint/format（差分を安定させAIの編集と相性良く）
- Vitest。**SRSロジックは純粋関数として切り出し重点テスト**
- Zod でスキーマ駆動バリデーション（`zValidator` ＋ フロント共有）
- 依存境界（レイヤー間の import 許可）を dependency-cruiser（`.dependency-cruiser.cjs`）で機械検証
- GitHub Actions で型チェック・lint（Biome＋依存境界）・test・build を **PR ゲート**化
- AIハーネスの hook の動作と、Claude Code / Codex の構成整合（発見用リンク、Codex agent TOML、パス別ルールの参照）、ADR と検証テストの対応を `pnpm test:hooks` で機械検証し、同じ **PR ゲート**に含める。契約文書の文言そのものは検査しない

## 4. 依存方向

依存の向きと各層の責務を定める。現在のファイル配置はコードと [Knowledge Graph](../architecture/README.md) を参照する。

### 4.1 リポジトリと Worker の責務

pnpm workspaces による monorepo とする。`apps/web` は画面、`apps/api` はAPI、`packages/shared` は共有schema・型・純粋ドメインロジック、`content` は教材、`docs` は設計文書を所有する。現在の詳細なファイル配置はコードと [Knowledge Graph](../architecture/README.md) を参照する。

- フロント ⇔ API は Hono の `hc`（型安全RPC）で接続。
- Drizzle スキーマと Zod スキーマを `packages/shared` に集約し、フロント・API・DBで単一ソース化する。
- `apps/web` と `apps/api` は別の Worker としてデプロイし、Web の Server loader は Service Binding（`InternalApi`）、ブラウザは API Worker の公開 URL で API を呼ぶ。書き込みは Hono API を通す（[ADR-0012](./adr/0012-separate-web-and-api-workers.md)）。公開 entrypoint の検証の順序は [ADR-0008](./adr/0008-production-access-boundary.md)、`user_id` の決定は [ADR-0003](./adr/0003-server-injected-user-id.md) が持つ。

### 4.2 フロントエンドの層と import 境界

`features + components/ui` 型を採用。`src/app` は薄く保ち、ロジックは `features` に寄せる。

- **Quiz 表示コンポーネント**は `apps/web/src/features/quiz/client/components` に置く。問題・解説・intro 内容・結果導線を表示 props で受け取り、画面フェーズと問題送りを管理する再利用可能な Client Component とする。`/quiz`（レッスン全問）・`/review`（due 問題）・`wrongOnly`（間違えた問題だけ）は供給する ViewModel / 表示 props だけを差し替え、解答 mutation は `client/hooks` の共通 hook を通す。
- feature 内の実行環境固有処理は `client/`・`server/` に分ける。`client/components` は Client Component、`client/hooks` は mutation と通信 state、`server/` は page / Server Component から呼ぶ初回取得・join・ViewModel 化を担当する。両環境から使える `api/`・`mapper.ts`・`view-model.ts` は feature 直下に置き、client/server のどちらかへ重複配置しない。`server/` 配下には `import 'server-only'`、Client Component の入口には `'use client'` を置き、ディレクトリ名だけに境界の強制を任せない。
- `features/*/server` は「page からしか呼ばれないから app 所有」ではなく、「feature の ViewModel を作るための Server 専用 loader」として feature 所有にする。`src/app` は URL・metadata・layout・route params の受け渡し、loader 呼び出し、feature component への ViewModel の props 渡しだけを担う。feature 固有の表示 UI、content/API DTO の取得、join、sort、filter、ViewModel 化は `features` に閉じ込める。例外として、複数 feature を横断して **1 ページ専用**にデータ取得・join を伴う合成をする処理は `app` 直下ではなく、必要になった時点で `features/<page-feature>/server` のようなページ feature として切り出す。一方、複数ルートが共有する shell と feature の表示部品を props 契約でつなぐ**表示合成**はこの例外の対象外であり、`app/_components/` に置く（`app-shell.tsx`）。この層でも shell の組み立てに必要な loader 呼び出しは行ってよく、禁じるのは join・sort・filter である（`app/**/page.tsx` と同じ粒度）。
- **`app/` と `features/` は別の軸で命名する。** `app/` の名前は **URL パス**（ユーザーから見た画面の場所）、`features/` の名前は**ドメイン概念名**（扱う対象）である。両者の名前は**一致しなくてよく、一致は要件でもない**。`/home` ↔ `features/dashboard` は、`GET /dashboard/due-count`・`apps/api` の `routes/dashboard.ts`・`NavigationSection` の `'dashboard'`・`components/dashboard-shell.tsx` と語彙を揃えるため feature 側を `home` に改名しない。`/learn/[domain]/[topic]/[lesson]` ↔ `features/lesson` も、URL は学習セクション、feature は扱うリソースを指す。`/quiz`・`/review`・`/domains` のように結果として一致する場合もある。route と feature は 1:1 でもない（`/home` は `features/dashboard` と `features/domains` を使う）。ナビゲーションの `NavigationSection`（`tree` = `/domains` など）は UI ラベル由来の別語彙であり、この 2 軸には含めない。
- `apps/web` 側では `_DAL` / `dal` という名前を使わない。DB へ直接アクセスしないため、Data Access Layer は `apps/api` 側の Drizzle / D1 アクセス層として定義する。
- 共通 UI は**必要になった時点で** `components/ui` に薄く切り出す（先回りして作らない）。

#### フロントエンドの依存方向

依存方向は `app → features → components/ui・lib → packages/shared / 外部ライブラリ` を基本とする。`client`・`server`・`api`・`mapper` は実行環境と責務が異なるため、feature 内でも次の import 境界を守る。

| 層 | 責務 | import してよいもの | 禁止する依存・処理 |
| --- | --- | --- | --- |
| `app/**/page.tsx`・`layout.tsx` | URL、metadata、layout、route params、`notFound()`、loader 呼び出し、feature component への props 渡し | `features/*/server`、`features/*/client/components`、全画面共通 component、`components/ui` | `lib/content`、feature の `api`・`mapper`・`client/hooks` の直接利用、DTO の join・sort・filter、feature 固有 UI の実装 |
| `app/_components/**` | `/` を除くすべての認証後ルート（`/home` とユーザー向け学習ルート。ADR-0008）が共有する shell と、feature の表示部品を props 契約で合成する composition layer。shell の組み立てと、そのために必要な loader 呼び出しに徹する。private folder であり route を持たない | `features/*/server`、`features/*/client/components`、全画面共通 component、`components/ui` | `lib/content`、feature の `api`・`mapper`・`client/hooks` の直接利用、DTO の join・sort・filter、feature 固有 UI の実装、1 ページ専用のデータ合成（→ `features/<page-feature>/server`）。公開トップ `/` はこの層を使わない |
| `features/*/client/components` | Client Component。ViewModel の表示、画面フェーズ・現在問題・`wrongOnly`・キーボード操作などの表示操作 state | 同 feature の `client/hooks`・`view-model`、`components/ui`、props 契約が公開された再利用 component | `server`、`lib/api-server`、content loader、API client の直接利用、DTO 変換 |
| `features/*/client/hooks` | Browser API client の生成、mutation と、それに伴う `submitting`・`error`・API 由来の結果 state | 同 feature の `api`、`lib/api`、共有 DTO 型 | Server data の再取得、`server`、`lib/api-server`、content loader、mapper、ViewModel の複製保持、画面レイアウト |
| `features/*/server` | Server loaderと必要なServer Component。初回データ取得、複数データの join、mapper 呼び出し、ViewModel の返却 | 同 feature の `api`・`mapper`・`view-model`、`lib/api`・`lib/api-server`・`lib/content`、Server専用ライブラリ、**子として描画するための** `client/components`（props 契約経由の合成。ロジックの取り込みではない） | `client/hooks`（mutation・通信 state ロジックの取り込み）、ブラウザ専用 API、Client state の複製 |
| `features/*/mapper` | Content data / DTO から ViewModel への純粋変換 | 共有入力型、同 feature の `view-model`、`features/shared` の小さい純粋変換 | fetch、content loader、API client、React state、副作用 |
| `features/*/api` | endpoint 固有の `hc` path・method・引数、共有 Zod による入出力検証、機能固有のエラーメッセージ | `ApiClient` 型・`requestJson`（`lib/api`）、共有 DTO / Zod | API client の生成、ViewModel 化、UI state、Server / Browser 固有 API |
| `components`（root） | 全画面共通のレイアウト shell・テーマ切替 | `components/ui`・`lib/cn`・React | feature 内部層（`server`/`client`/`api`/`mapper`）・content・API への直接アクセス |
| `features/shared` | feature 横断の小さい純粋変換と、表示の一貫性を保つ小さい対応表（例：領域→アイコン名の `domainIcons`）のみ | 共有 DTO・Content data 型、`components/ui` の型（type-only import） | 共通 ViewModel・loader・hook の保持、fetch・副作用、React への依存 |
| `components/ui` | feature 非依存の汎用表示部品 | `lib/cn`、React、スタイル関連ライブラリ | `app`・`features`・content・API への依存 |
| `lib` | API client 生成、HTTP response 処理、content index など横断インフラ | `packages/shared`、`@tsl/api`、外部ライブラリ | `app`・`features` への依存、画面都合の変換 |

- feature 間の再利用は、`features/shared` の小さい純粋変換、または公開された表示 component の props 契約を境界にする。他 feature の `client`・`server`・`api`・`mapper` を直接 import しない。
- `packages/shared` の利用は Content data / API DTO / Zod / 純粋ドメイン型に限り、web 固有の ViewModel や表示状態を置かない。

### 4.3 バックエンドの層と import 境界

**route・service・dal の 3 層**に分ける。リクエストの**処理フロー**は `route → service → deps（dal 実装）→ D1` とする。一方、service が deps 型を定義し、dal がその型を実装する関数引数 DI を採用するため、**ソースコードの import 方向は処理フローと同じではない**。

| 層 | 責務 | 依存してよいもの |
| --- | --- | --- |
| **route**（`routes/`） | HTTP 契約。パス・メソッド・`zValidator` による入力検証・ステータスコード・レスポンス整形。リクエストスコープの Drizzle / deps を生成して service へ渡す composition root。ビジネスロジックを書かない | Hono / service / dal の deps factory / shared の API schema・DTO |
| **service**（`services/`） | ユースケース。「採点 → 記録 → SRS 更新」のような業務手順の一連。必要な永続化操作を deps 型として自身で定義する。**Hono・D1・Drizzle の型に依存しない純 TS** | shared の純粋ドメインロジック・型（`sm2` 等）/ 自身が定義する deps 型 |
| **dal**（`dal/`） | service が定義した deps 型の実装。Drizzle クエリの置き場。SQL 的関心事（where・upsert・batch）をここに閉じ込める | Drizzle / shared の db schema / service の deps 型（`import type` のみ）/ 自身が throw するドメインエラー（`services/errors` からの値 import） |

dal は自身が throw するドメインエラー（例: `SrsConflictError`）に限り `services/errors` から値 import してよい。`import type` に限定されるのは service の deps 型（`AnswerDeps` 等）である。

ソースコードの import 許可は次の通り：

```text
routes     ──→ services                 # ユースケース呼び出し
   └────────→ dal                       # deps factory の生成だけ
dal        ──→ services                 # deps 型の import type だけ
dal        ──→ services/errors          # 値 import。自身が throw するドメインエラーに限る
app.ts     ──→ routes                   # .route() での合成
app.ts     ──→ middleware               # 全リクエストへの適用
app.ts     ──→ services/errors          # onError でのドメインエラー → HTTP 写像
middleware ──→ env 型・fixed-user（FIXED_USER_ID の値 import）。routes・services・dal は import しない
content-sync（apps/api/src/content-sync.ts） ──→ gray-matter・packages/shared のみ。routes・services・dal・middleware は import しない

routes   ──→ @tsl/shared          # schema/api の Zod・DTO 型
services ──→ @tsl/shared          # 純粋ドメインロジック・型
dal      ──→ @tsl/shared          # db 名前空間の Drizzle schema（import { db as schema }）
```

- HTTP へのエラー写像は `app.ts` の `onError` が §5.7 の方針に従って担う（写像ロジックの所在は `app.ts` に一本化し、route・service には持たせない）。`SrsConflictError` は本書作成時点では `onError` で個別写像されておらず 500 に落ちるが、本節・§5.7 はこの振る舞いを変更する仕様ではない（新しい HTTP ステータスへの写像は別途検討する）。

- service から `routes`・`dal`・Hono・D1・Drizzle を import しない。service は渡された deps だけを呼ぶ。
- dal から `routes`・Hono を import しない。service への依存は deps 型の `import type` に限定し、値 import は自身が throw するドメインエラー（`services/errors`）に限る。
- route から dal への依存はリクエストスコープの deps 構築に限定し、repository 関数を直接呼んでユースケースを実装しない。
- `packages/shared` は一律に何でも参照してよい層とはせず、route は API schema・DTO、service は純粋ドメインロジック・型、dal は db schema を参照する。

**採用しないもの（過剰設計の回避）**：

- DI コンテナ・デコレータ注入 → **関数引数による明示的な依存渡し**で足りる
- クリーンアーキテクチャ流の ports/adapters ディレクトリ分離 → 「service が deps 型（interface）を定義し、dal が `import type` して実装する」という最小の依存逆転だけで同じ効果を得る
- OpenAPI スキーマ生成 → `hc`（`AppType`）が型契約を担うため不要（§5.3）

数エンドポイントの規模では抽象を増やさず、層の責務とimport境界を優先する。

- **dal はテーブル単位ではなくユースケース単位**で置く。「service が要求する deps 型」を 1 ファイルで実装する形にすると、service ⇔ dal の対応が 1:1 で追いやすく、テーブル単位 repository の細切れ合成（と、それを束ねる工数）を避けられる。テーブル単位の共有が必要になった時点で分割する。
- **`src/content-sync.ts` は `gray-matter` と `packages/shared` のみに依存する純粋ロジック**（frontmatter パース・同期ペイロード生成・upsert SQL 生成）。`scripts/sync-content.ts` は Node の `fs` 読み取りと `wrangler d1 execute` 実行を担う CLI 部で、`content-sync.ts` の純粋関数を呼び出すだけに留める（routes・services・dal・middleware は import しない）。
- **`src/dev-seed.ts` は content sync で検証済みの question ID を入力として、固定ユーザーの動的開発データを生成する純粋ロジック**にする。`scripts/seed-dev.ts` は content 読み取り・時刻取得・一時 SQL ファイル作成・Wrangler 実行だけを担い、任意の CLI 引数を転送しない。
- serviceが要求するdepsはフラットな関数の束とし、テストではfakeに差し替える。時刻はservice内で取得せず、呼び出し側から注入する。正確な型と処理は [answer-service.ts](../apps/api/src/services/answer-service.ts) を参照する。

#### Hono アプリの合成

- **`hc` の型推論を保つため、ルート定義はメソッドチェーンで書く**。各サブルーターは `new Hono<AppEnv>().post(...)` のチェーンで定義・export し、`app.ts` では `.route()` のチェーンで合成する。チェーンを分断（`app.post(...)` を文として並べる等）すると `AppType` からエンドポイント型が消える。
- パス設計は [API 仕様カタログ](./api-spec.html) の endpoint（`POST /answers`・`GET /review/queue`・`GET /dashboard/due-count`・`GET /domains`・`GET /analytics/*`・`GET /activity/recent`）をそのまま `.route()` のプレフィックス＋サブルーター内パスで構成する。
- Access boundary は public entrypoint だけに置く。route・service・DAL は Access JWT を参照せず、`userContext` が実行済みであるという既存契約を保つ。internal entrypoint は同じ user route sub-app を `userContext` の後に mount することで、DTO・固定ユーザー挙動・Hono RPC 契約を public entrypoint と共有する。

### 4.4 依存境界の機械検証

依存方向の規範は §4.2（フロントエンド）と §4.3（バックエンド）に定義する。dependency-cruiser は [.dependency-cruiser.cjs](../.dependency-cruiser.cjs) により import 境界を検証し、Biome は lint/format を担う。設定のルールには対応する設計節を示す。

機械検証の具体的な対象は設定を参照する。import を伴わない ambient 型への依存や、許可された import の呼び出し方は、型・コード・レビューで契約と照合する。Graphの鮮度・抽出器の検証は [architecture/README.md](../architecture/README.md) を参照する。

## 5. データフロー

content / API から feature component へ至るまでのデータの流れを定める。原則は **page は App Router と feature を接続する薄いルートアダプター、feature component は表示層**とする。データの形成と変換は層を分けて、content 構造や API 変更の影響を mapper に閉じ込める。

### 5.1 教材と動的データの経路

- **データ取得（ハイブリッド）**：教材・問題はビルド時バンドル済み content を RSC / Server loader から読む。解答記録・SRS・due など動的データのみ Hono API を `hc` で呼ぶ。D1 への seed は配信・集計用キャッシュとして維持し、表示の主経路は content。

**素 Markdown + frontmatter** を **ビルド時にバンドル**する。

- **Workers 制約**：Cloudflare Workers では `node:fs` のランタイム読みが使えない。教材・問題は**ランタイム fs 読みではなくビルド時インライン化**する。
- frontmatter に `estimatedMinutes`（0より大きい整数）と問題（`questions[]`。スキーマは[コンテンツ規約](./content-guidelines.md)と同一の `{ id, type:'mcq', prompt, choices[], answerIndex, explanation }`）を置き、本文は Markdown 本体とする。
- ビルド時に `gray-matter` でパースし、`packages/shared` の Zod（`schema/content`）で検証してから**型付きデータとしてインライン化**する。
- 本文描画は `react-markdown` 等のレンダラを用いる（RSC で完結）。MDX は採用しない（ビルド設定と frontmatter 抽出が複雑化するため）。
- content 参照は `apps/web/src/lib/content.ts` に集約する。`getLessonContent(lessonId)`・`getLessonsByTopic(domain, topic)`・`getBundledQuestions()`・`getQuestionById(questionId)` を共通関数として用意し、初回表示の実行経路では `features/*/server` の Server loader だけが呼び出す。page は loader、mapper は引数で渡された Content data だけを参照し、`lib/content` を直接 import しない。ビルド・同期スクリプトと `lib/content` 自身のテストはこの制約の対象外とする。
- `getBundledQuestions()` は `/review` の `question_id` 解決用に `questionId` index を返せる形にする。各 feature で frontmatter 配列を直接走査しない。
- **同じパース経路を `content/` → D1 seed/upsert スクリプトでも再利用**し、フロント表示と D1 配信を単一ソースから導く（[ADR-0006](./adr/0006-content-as-source-of-truth.md) の責務分離を維持）。
- `/learn/...` と `/quiz/...` は content 由来の標準 SSG を維持する。`generateStaticParams` で全 params を返し、route params は `lib/content` の `getLessonRouteParams()` / `getTopicRouteParams()` / `getQuizRouteParams()` を feature loader 経由で読み、page から `lib/content` を直接 import しない。
- `/learn` は固定URLの静的 RSC としてプリレンダリングする。`features/lesson/server` の一覧 loader が共通 content loader から全トピックとレッスン数を取得し、mapper で領域別に整形する。領域・トピックの一覧やリンクを画面コードへ固定しない。

- スキーマは `packages/shared` に集約し二重定義しない（既存 `schema/content`・`db/schema`・`srs/sm2` を土台に拡張）。
- 同一スキーマを **3 経路で共有**：①content のビルド時パース検証、②API 入力の `zValidator`、③フロントの型（`z.infer`）。
- フロントは API レスポンス・content データとも `z.infer` で型を引き、DTO / Content data の独自再定義を持たない。ViewModel は表示都合の web 固有型として `apps/web/src/features` に定義する（§5.4）。

### 5.2 層構造（Content data / DTO → Mapper → ViewModel → page → feature component）

```text
初回表示（Server）

page
  → Server loader
      → content loader または feature API adapter
          → Content data または serializable DTO（@tsl/shared）
      → Mapper（純粋関数、web 固有）
          → ViewModel（web 固有型）
  → feature component へ ViewModel を props 渡し

ユーザー操作後（Client）

feature component
  → Client hook
      → feature API adapter
          → API（Hono）
      → submitting / error / API 由来の結果 state
  → state を受けて再描画
```

Server loader は初回データの fetch と Mapper 呼び出しを統括する。Client hook はユーザー操作後の通信を統括するが、初期 ViewModel の形成や複製保持は行わない。page は App Router 固有の関心事と loader 呼び出しに限定し、feature component が表示を担当する。

- **Content data**：`content/` の Markdown + frontmatter をビルド時にパース・検証した型付きデータ。教材本文・問題本文・解説の主経路。
- **DTO**：API レスポンス型。`packages/shared` の Zod スキーマ（§5.1）から型推論、AppType に含まれる。due queue・answer 結果・集計値など動的データの契約。
- **Mapper**：`content/API data -> ViewModel` 形の純粋関数。content 構造や API 仕様変更の影響は**ここで吸収**。複数ページで同じデータを使う場合、mapper も共有。
- **ViewModel**：web 固有の表示形態。「page で即座に使える形」に正規化済み（selector・filter・sort 済み）の**純データ**。`loading`・`error` は VM に含めず、Client hook の返り値として別に扱う。

### 5.3 Server loader と Client hook

初回データは Server loader が形成し、page から表示 component へ ViewModel を渡す。責務・依存境界は §4.2、表示状態と通信状態の所有者は §5.5、SSR / SSG の実行方式は §5.3に従う。

| 画面 | 初回データ | ユーザー操作後 |
| --- | --- | --- |
| 教材 | ビルド時contentをmapperに渡して表示。API GET不要 | 閲覧記録のみ最小Client recorderから送信 |
| 演習 | ビルド時contentから問題・解説をVM化。API GET不要 | Client hookが解答を送信 |
| 復習 | API queueのIDをサーバーでbundled contentへjoinしてVM化 | 次バッチ取得はClient Componentから `router.refresh()` でServer loaderを再実行 |

#### 復習の表示契約

- 正解情報の境界は [ADR-0002](./adr/0002-api-authoritative-grading.md) に従う。content loaderや全教材データをClient bundleへimportしない。
- 静的な表示構造はユーザー固有データを共有キャッシュへ載せず、dueバッジと本文を同じ SSR リクエストで取得する。両者は唯一のloader入口 `loadReviewOnce` を通し、Reactの `cache()` によって同一リクエスト内のqueue取得を1回に畳む。未ラップのloaderはexportしない。共有キャッシュとの違いは §5.3。
- APIの生のdue件数の意味は [ADR-0005](./adr/0005-srs-review-rules.md)。`ReviewViewModel.dueCount` は、現在のバッチをbundled contentとjoinした後に表示できる問題数であり、contentから削除されたIDはmapperで除外する。join後の表示可能な問題が0件で `hasMore=true` ならcontent整合性エラー、0件でfalseなら通常の空キュー、1件以上なら現在バッチを表示する。空キューをQuizの空問題表示へ委ねない。
- 表示再利用の境界は §5.6。次バッチがある場合の完了操作で再取得し、mapperが導出した `batchKey` をinteractive subtreeのkeyにして、新しいバッチでは解答結果・画面フェーズをintroへリセットする。
- 取得・整合性エラーと再試行導線は §5.7。

現在のloaderは [load-review.ts](../apps/web/src/features/review/server/load-review.ts)、表示側は [review-runner.tsx](../apps/web/src/features/review/client/components/review-runner.tsx) を参照する。Graphはloader周辺の構造探索に使い、対象外のClient Componentは実コードを確認する。

#### 実行環境とデータ取得

- 公開トップ・教材・集計画面はRSCで描画し、演習・復習の操作部分はClient Componentとする。レイアウト／ヘッダーはServerとする。画面ごとの初回データは本節の表、演習の状態管理は §5.5。
- Server専用のfeatureには `import 'server-only'`、Client入口には `'use client'` を置き、ディレクトリ名だけに境界の強制を任せない。依存規則は §4.2。
- Server Actionsは採用しない（[ADR-0012](./adr/0012-separate-web-and-api-workers.md)）。初回取得はServer loader、mutationはClient hookからHono APIを呼ぶ。API契約とuser_id注入点を単一に保ち、HonoとCloudflareを学ぶ目的に沿わせる。重いフォームなど別の要求が生じた場合に再検討する。
- Server dataの再取得はClient Componentの `router.refresh()` によるRSC再実行に統一する。API adapterへキャッシュ方針を持ち込まない。

#### 通常 SSR・標準 SSG

ユーザー固有のデータを共有キャッシュに載せない規則は [ADR-0013](./adr/0013-no-shared-cache-for-user-data.md) が持つ。

- `/` はユーザー固有データを読まない静的 RSC、`/home`・`/review`・`/domains`・`/analytics` は `dynamic = 'force-dynamic'` を指定した通常のリクエスト時 SSR とする。各 Server loader はリクエストごとに実行し、ユーザー固有データを共有キャッシュしない。
- 教材・演習の content route は `generateStaticParams` で全 params を列挙する標準 SSG とする（content 取得の契約は §5.1）。`cacheComponents`、`'use cache'` は採用しない。
- `/learn` はAPIを呼ばず、ビルド時の content だけで一覧本文を生成する静的 RSC とする。共通シェルのユーザー固有 due バッジは既存の Client leaf が表示後に取得し、静的成果物へ含めない。
- `/home` は due 件数カードと本体を同一 SSR の中で取得し、due 件数と summary・heatmap・domains・recent activity はそれぞれの loader 契約を保つ。loader 内の API 呼び出しは可能な範囲で並列化する。`/domains` は4領域の集計、`/analytics` は summary・weekly・mistakesを読む。忘却曲線・復習タイミングは対象外。
- due件数・統計・review queue・domains／analytics集計には共有キャッシュを使わない。APIが注入するuser_idをwebの共有キャッシュキーに含められず、ユーザー間の混入が起こり得るためである。
- Reactの `cache()` によるリクエスト内の取得共有は許可する。ユーザー横断の共有キャッシュとは区別する。復習のdueバッジと本文の取得共有・表示分岐・次バッチへの遷移は §5.3で定義する。
- 解答後や画面復帰時は `router.refresh()` で Server loader を再実行して鮮度を回復する。復習のバッチ完了時の条件は §5.3。
- web Worker は API Service Binding と静的 asset 配信に必要な最小構成だけを使う。content route のビルド時 HTML / RSC は Vinext の `prerender` と `@vinext/cloudflare` の `staticAssetsAdapter` で `ASSETS` binding から配信し、内部 cache artifact（`/_vinext/static-cache/*`）は `assets.run_worker_first` で Worker へ通して外部からの直接取得を防ぐ。ISR 用の Incremental Cache、R2、KV、Durable Object Queue の有効 binding、Worker 自己参照 binding は持たない。OpenNext 時代に登録した Durable Object の履歴を設定に残す理由は [記録](./investigations/2026-10-14-opennext-durable-object-history.md) にある。

#### API client

Service Binding と公開 URL の使い分け、`credentials` と CORS の規則は [ADR-0012](./adr/0012-separate-web-and-api-workers.md) が持つ。

- `apps/api` が `AppType` をエクスポート → `apps/web` は `hc<AppType>` で型安全クライアントを生成（既存 `apps/api/src/client.ts` のファクトリを利用。Service Binding の fetch を渡せるよう、ファクトリは `hc` の第2引数（`fetch` オプション等）を受け取れる形に拡張する）。
- `apps/web/src/lib/api.ts` に**API 共通基盤を集約**する。クライアント生成と共通レスポンス処理は同じ小さな責務群であり、原則ファイルを分けない。例外として、Workers runtime の `cloudflare:workers` を参照する Server 用生成は Client bundle へ入れられないため、`import 'server-only'` を置いた `apps/web/src/lib/api-server.ts` に分ける。baseURL は env（Workers バインディング / 環境変数）から解決し、ハードコードしない。
  - `createServerApiClient`（`lib/api-server.ts`）：Server loader 用。本番は Service Binding（`cloudflare:workers` の `env.API.fetch` を `hc` のカスタム `fetch` に渡す）を必須とし、binding 欠落は fail-fast する。production 以外で binding がない場合だけ env の URL にフォールバックする。
  - `createBrowserApiClient`：Client hook 用。env から解決した API Worker の公開 baseURL を使い、Cloudflare Access application cookie を API ドメインへ送るため `credentials: 'include'` を常に指定する。
- feature の `api/` は呼び出し側から `ApiClient` を受け取り、`hc` の path・method・引数、共有 Zod による入出力検証、機能固有のエラーメッセージを薄く閉じ込める。Server loader と Client hook の両方から使うため、client 生成、`server-only`、cookies、headers、秘密情報など環境専用処理を入れない。
- `res.ok` チェックと `res.json()` 変換は `apps/web/src/lib/api.ts` の `requestJson` に共通化する。
- `hc` の path 呼び出し自体は文字列パスの汎用 fetch に置き換えない。`client.review.queue.$get()` のような endpoint ごとの wrapper を残すことで、Hono RPC の型推論を維持する。
- 初回表示に必要な `GET /dashboard/due-count`・`GET /review/queue` は Server loader から呼び、ViewModel に整形して page 経由で feature component へ props として渡す。
- ユーザー操作後の `POST /answers` は Client hook から呼ぶ。`GET /review/queue` の再取得は Client Component の `router.refresh()` で Server loader に委譲する。初回表示で不要なスピナーを出さない。
- 通常 SSR の Server loader はリクエストごとに `createServerApiClient` を解決し、`API` Service Binding の fetch を `hc` に渡す。共有 Incremental Cache や再検証 Queue を API client 層へ持ち込まない。

### 5.4 型とファイルの配置

#### 型の配置

現在のファイル配置はコードと [Knowledge Graph](../architecture/README.md) を参照する。ここでは配置の責務と命名規則を定義する。

- **Content data / DTO は shared**（複数パッケージで共有、単一ソース）。
- **ViewModel は `apps/web/src/features` 配下**（表示都合なので web 固有）。
- **mapper は feature 単位で配置**。同じ DTO / content data を複数 feature で使う場合も、ViewModel 全体の mapper は各 feature に置く。重複した小さい純粋変換だけを `apps/web/src/features/shared` に逃がす。
- **`apps/web/src/features/*/api` は endpoint アダプター**。呼び出し側から `ApiClient` を受け取り、`hc` の path・method・引数、共有 Zod による入出力検証、機能固有のエラーメッセージを薄く閉じ込める。`res.ok` チェック・`res.json()` は `apps/web/src/lib/api.ts` の共通関数に寄せる。client 生成・ViewModel 化・UI state はここに入れない。ファイル名は `<feature>-api.ts` に統一する。
- **`apps/web/src/features/*/server` は Server 専用**。page / Server Component から呼ばれる loader が content data や API DTO を mapper に通して ViewModel を返す。feature 固有の Server Component が必要なら `server/components` に置く。配下のファイルには `import 'server-only'` を置く。loader のファイル名は `load-<対象>.ts` とする。
- **`apps/web/src/features/*/client/hooks` は Client 専用**。Browser API client を生成し、ユーザー操作後の mutation と、それに伴う `submitting`・`error`・API 由来の結果 state を扱う。Server data の再取得は行わない。初期 ViewModel は component が immutable な props として参照し、hook へ複製しない。
- **`apps/web/src/features/*/client/components` は Client Component**。画面フェーズ・現在問題・`wrongOnly`・キーボード操作を保持し、hook が返す通信状態と結果を表示へ反映する。content loader・API client・DTO には直接触れない。
- **`apps/web/src/features/shared` は小さい純粋変換と表示の対応表だけ**。`contentQuestionToQuizQuestion` のように `/quiz` と `/review` の両方で同じ表示用 question 形へ変換する helper や、`/learn` と領域カードで同じ領域を同じアイコンで示す `domainIcons` のような定数の対応表はここへ置く。ViewModel 全体・loader・hook は共有しない。
- **`apps/web/src/lib` は横断インフラだけ**。API client 生成、HTTP response 処理、content index など feature 非依存の関数を置く。画面都合の整形は feature mapper に残す。

#### API 側の DAL 配置

`apps/api` は D1 / Drizzle に直接触るため、`dal/` を置く。Hono route は HTTP 契約、service はユースケース、dal は永続化アクセスに責務を分ける。各層の責務と import 境界は §4.3 に定める。

### 5.5 演習の状態

- **クライアント state のみ**（`useState` と専用 hook で feature 内に閉じる）。MVP として最小化する。Client Component は画面フェーズ（`intro → exercise → result`）・現在の問題インデックス・`wrongOnly`・キーボード操作を保持し、`useAnswerSubmit` hook は mutation・`submitting`・送信エラー・API から返った解答結果を保持する（1 問解答＝1 `answer_log` POST）。初期 ViewModel は immutable な props として参照し、Client state に複製しない。
  - MVP フローは「イントロ確認 → 1 問表示 → 選択 → 即時採点 → ロック → 解説表示 → 次問 → 結果」で線形・シンプルなため、`useState` で充分。複雑な状態遷移が出現（例：問題セット内での再検索・フィルタ等）したら、その時点で `useReducer` へ段階的にリファクタリング。
- 同一tickを含む二重送信を防止する。試行のリセット後に到着した古い非同期応答は、解答結果・エラー・送信状態へ反映しない。API clientは初回送信時に遅延生成する。hookはAPIの採点結果と選択したindexを保持し、選択肢ロックと結果サマリに使う。
- **リロードで進捗はリセット（許容）**。リロードすると `intro` フェーズに戻る。ただし「1 問解答＝1 `answer_log` POST」（[デザインシステムと画面の規約](./design-system.md)の演習フロー）なので、解答そのものは即サーバーに残る。途中復帰（sessionStorage）やサーバー復元は将来拡張ポイントとして留保。
- フロー：イントロ（概要／due プレビュー）→ 1 問表示 → 即時採点（正誤＋解説）→ 選択肢ロック → 末尾に結果サマリ → 出し分け動線（`/quiz`=次のレッスンへ／`/review`=ホームへ、両者「すべて解き直す」「間違えた問題を解き直す」を提供）。
- 復習の空キュー・content整合性分岐は §5.3に従い、Client stateへ重複させない。
- 解答の反応時間（`responseTimeMs`）は Client Component が選択肢の表示開始時刻からの経過時間として計測し、`submitAnswer` の引数として Client hook へ渡す。Client hook は時刻を計測せず、受け取った値をそのまま API へ転送する。

### 5.6 表示の再利用

同じ content data / DTO を複数ページが使う場合（例：復習（`/review`）と演習（`/quiz`）が同じ bundled questions を使用）：

現在のファイル配置はコードと [Knowledge Graph](../architecture/README.md) を参照する。ここでは配置の責務と命名規則を定義する。

`LessonViewRecorder` は `'use client'` の最小 leaf とし、mount 後に Browser API client を遅延生成して `POST /lesson-views` を送信する。本文データを取得・保持せず、通信失敗は無視するため教材の表示やエラー境界に影響しない。

ViewModel・mapper は feature ごとに独立させ、同じ DTO の使い方が feature ごとに異なることを認める。`apps/web/src/features/shared` は共通 ViewModel を持つ場所ではなく、`contentQuestionToQuizQuestion` のような小さい純粋変換と、`domainIcons` のような表示の対応表だけを置く場所とする。

Quiz と Review の表示再利用は、feature VM同士を継承・交差させず、`QuizInteractive` の表示props（問題・解説・intro内容・結果導線）へ各featureのVMを変換して渡す境界で行う。

### 5.7 エラー処理

- 初回データの取得・検証失敗はServer側でthrowし、routeの `error.tsx` で扱う。復習のcontent整合性分岐は §5.3に従う。
- mutationの待機・失敗はhookの `submitting`・`error` を表示componentへ渡して扱う。再取得中の表示が必要なら `isRefreshing` またはrouteの `loading.tsx` を用いる。
- `/review/error.tsx` は本番で秘匿され得るServer Componentの `error.message` から失敗種別を判定しない。API/通信の一時的失敗とcontent不整合の両方を含む案内を表示する。`reset` による再試行と、恒久的な不整合で再試行ループに閉じ込めないためのホームへのLinkを提供する。
- 教材閲覧のfire-and-forget記録は、失敗しても本文表示やroute error boundaryへ波及させない（§5.6）。

#### API のエラー

**入出力スキーマは `packages/shared/src/schema/api.ts` に集約**する。同一スキーマを「API 入力の `zValidator`」「route 返り値の契約固定（`satisfies`）」「フロントの型（`z.infer`）」の 3 経路で共有する（§5.1 と同じパターン）。

- `POST /answers` の入力は任意の反応時間を含める：`answerRequestSchema` に `responseTimeMs: z.number().int().nonnegative().optional()` を追加する（§5.8。アナリティクスの平均反応時間用。未送信でも採点は成立する）。
- 正確な入出力型・検証定義は [API schema](../packages/shared/src/schema/api.ts) を参照する。endpointごとの意味は [API 仕様カタログ](./api-spec.html)、集計条件は [ADR-0007](./adr/0007-analytics-aggregation-boundaries.md) に従う。

**エラー処理の方針**：

- service は **HTTP を知らないドメインエラー**（`services/errors.ts` の `QuestionNotFoundError` 等）を throw する。
- `QuestionNotFoundError` は404と `QUESTION_NOT_FOUND` に写像する。既知のドメインエラーのmessageを返し、未知の例外はWorkers Logsへ記録する。
- route 層の `app.onError` がドメインエラーを HTTP ステータスへ写像し、レスポンス形を `{ error: { code, message } }` に統一する。未知のエラーは 500（`INTERNAL`）とし、詳細メッセージを外に漏らさない。
- Hono や middleware が意図して throw した `HTTPException` は、例外が持つステータスとレスポンスを保持する。未知の例外として 500 に上書きしない。
- レート制限の 429 と limiter failure の 503 も shared の error response schema を使い、route から type-safe に返す。前者には `Retry-After: 60` を必ず付ける（[ADR-0004](./adr/0004-persistent-write-rate-limit.md)）。

- `zValidator` の検証失敗（400）はデフォルト挙動のまま使う（MVP）。フロントは `requestJson`（§5.3）が `res.ok` で弾くため、エラーボディの形に依存しない。

### 5.8 動的データの意味

D1 の動的データの意味を定める。正確なスキーマは [db schema](../packages/shared/src/db/schema.ts) を一次ソースとする。学習分析の集計境界は [ADR-0007](./adr/0007-analytics-aggregation-boundaries.md)、`questions`（content の同期キャッシュ）は [ADR-0006](./adr/0006-content-as-source-of-truth.md) が持つ。

- `users`: 将来公開用。初期は単一ユーザーでも user_id を持つ
- `answer_logs`: `{ id, user_id, question_id, is_correct, answered_at, response_time_ms? }`（`response_time_ms` は学習分析の「平均反応時間」向け。Quiz クライアントが選択肢表示から解答確定までを計測して送信する任意項目）
- `srs_states`: `{ user_id, question_id, ease, interval_days, due_at, reps, lapses, version }`（SRSパラメータ。`version` は同時解答による更新消失を防ぐ楽観的ロック用。アルゴリズムは SM-2 ベースとする）
- `lesson_views`: `{ id, user_id, lesson_id, viewed_at }`（アナリティクス画面の「学習時間」「最近のアクティビティ」向け。教材本文ページ表示時に fire-and-forget で記録する最小ログ。学習時間は「閲覧したレッスンの frontmatter 所要時間（例：約18分）の合計」＋「`answer_logs.response_time_ms` の合計」で近似する簡易集計とし、精緻な計測は行わない）
- 教材の閲覧記録（`POST /lesson-views`）は最小のログであり、重複の排除、配送の保証、lesson の存在確認は行わない。

## 6. 関連文書

- [ADR 索引](./adr/README.md)
- [デザインシステムと画面の規約](./design-system.md)
- [コンテンツ規約](./content-guidelines.md)
- [環境・デプロイ運用](./deployment.md)
- [AIコーディングエージェント連携仕様](./ai-coding-agents.md)
- 補助資料（実装時に参照しやすい形へ再構成したもの。本書・ADR・コードと食い違う場合はそちらを正とする）: [API 仕様カタログ](./api-spec.html)・[フロントエンドアーキテクチャ](./frontend-architecture.html)・[バックエンドアーキテクチャ](./backend-architecture.html)・[認証アーキテクチャ](./authentication-architecture.html)
