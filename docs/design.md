# tech-study-lab 設計文書

ソフトウェア学習アプリ。個人エンジニアが「セキュリティ / フロントエンド・バックエンドのフレームワーク / アーキテクチャ設計」を、読み物（教材）と4択問題演習で学ぶ。解答ログを分析し、SRS（間隔反復）アルゴリズムで出題を最適化する。開発自体をAI駆動で進めることを主目的とし、その基盤を構築する。

本書は **一次ソース（Single Source of Truth）** であり、仕様駆動開発（Spec-Driven）の起点となる。実装判断に迷ったときは本書に従い、本書と実装が乖離した場合は本書を先に更新する。

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
| フロント | Next.js（App Router） | Cloudflare Workers（OpenNext）へデプロイ |
| API | Hono | Cloudflare Workers。**主要APIを一通り担当** |
| DB | Cloudflare D1（SQLite） | ORM は Drizzle |
| 型・バリデーション | TypeScript strict / Zod | Honoの `zValidator` とフロントで共有 |
| Lint/Format | Biome | 設定一元化・高速 |
| テスト | Vitest | SRSロジックは純粋関数で重点的にテスト |
| CI | GitHub Actions | 型・lint・test・build を PR ゲート化 |
| パッケージ管理 | pnpm workspaces | monorepo |

### 既知のリスク

- Next.js の Cloudflare デプロイ（`@opennextjs/cloudflare`）は Vercel 比でハマりどころが残る。これは「Cloudflareを学ぶ」目的の一部として許容する。

## 3. リポジトリ構成

pnpm workspaces による monorepo。

```
tech-study-lab/
├── apps/
│   ├── web/          # Next.js（App Router）— 画面
│   │   └── src/      # App Router ファイル（src/ 構成）
│   └── api/          # Hono — 主要API（Cloudflare Workers）
├── packages/
│   └── shared/       # Drizzleスキーマ・Zodスキーマ・共有型（単一ソース）
├── content/          # 教材・問題（Markdown + frontmatter）= 一次ソース
├── docs/
│   └── design.md     # 本書
└── CLAUDE.md         # AI駆動開発のコンテキスト・規約
```

`apps/web/src` 配下のより詳細な構成（`features` / `components/ui` / `lib` 等）は第8.1章で確定する。

- フロント ⇔ API は Hono の `hc`（型安全RPC）で接続。
- Drizzle スキーマと Zod スキーマを `packages/shared` に集約し、フロント・API・DBで単一ソース化する。

## 4. データモデル

### 4.1 コンテンツ階層

```
領域（domain）
└── トピック（topic）       例：XSS, 認証認可, 状態管理
    └── レッスン（lesson）   教材1本 = Markdown
        └── 問題（question） 複数。4択
```

### 4.2 持ち方（ハイブリッド）

| データ | 保存先 | 役割 |
| --- | --- | --- |
| 教材・問題 | **Git管理の Markdown + frontmatter**（`content/`） | 一次ソース。AIが執筆・改訂、PRでレビュー |
| 解答ログ・SRS状態 | **D1** | 動的データ。ユーザーごとに分離 |

- デプロイ/ビルド時に `content/` をパースして D1 へ **seed/upsert** する同期スクリプトを設ける（このスクリプト自体も学習材料）。
- 「ファイルが一次ソース、D1は配信・集計用キャッシュ」と責務を明確にする。

### 4.3 問題形式

- 初期は **4択（多肢選択）に統一**。自動採点でき、解答ログが構造化され、SRSが即動く。
- 記述式・コード問題は `question.type` フィールドで**後から追加できる拡張ポイント**として確保する。

### 4.4 スキーマ草案（確定は実装時）

content（frontmatter）側:

- `domain`: 領域キー（例 `security`）
- `topic`: トピックキー（例 `xss`）
- `lesson`: レッスンID・タイトル・本文（Markdown本体）
- `questions[]`: `{ id, type: 'mcq', prompt, choices[], answerIndex, explanation }`

D1 側（動的）:

- `users`: 将来公開用。初期は単一ユーザーでも user_id を持つ
- `answer_logs`: `{ id, user_id, question_id, is_correct, answered_at }`
- `srs_states`: `{ user_id, question_id, ease, interval, due_at, reps, lapses }`（SRSパラメータ。アルゴリズムは実装時に SM-2 ベースを想定）

## 5. AI駆動開発の基盤

### 方針

- **目標**：仕様駆動・スキル化・ガードレールの **統合**。
- **整備順**：
  1. **ガードレール（C）** — 型安全・テスト・CI。「動くが間違ったコード」を最初に防ぐ土台
  2. **仕様駆動（A）** — 本書を一次ソースに、機能の意図を文書化。AIのコンテキストと人間のレビュー基準を揃える
  3. **スキル化（B）** — 反復作業（教材取込・問題追加・マイグレーション等）が見えた段階でスキル/サブエージェント化

### ガードレールの中身

- TypeScript strict、型は `packages/shared` に集約
- Biome による lint/format（差分を安定させAIの編集と相性良く）
- Vitest。**SRSロジックは純粋関数として切り出し重点テスト**
- Zod でスキーマ駆動バリデーション（`zValidator` ＋ フロント共有）
- GitHub Actions で型チェック・lint・test・build を **PR ゲート**化

## 6. 最初のマイルストーン（Walking Skeleton）

スタック全体が繋がることを最小構成で実証する「歩ける骨格」。

- **対象スライス**：`セキュリティ領域 > XSS トピック > 教材1本 + 4択3問`
- **貫通する動線**：
  1. 教材を表示（Next.js が `content/` から読む）
  2. 4択に回答
  3. 正誤を D1 に記録（`hc` → Hono → Drizzle → D1）
  4. SRS が次回出題日を算出し、再訪時に出題
- **同時に効かせるもの**：CI（型・lint・test・build）、`hc` 型安全RPC、content→D1 同期

このスライスが1本通れば、以降はトピック・機能を**同じパターンの繰り返し**で増やせる。これがAI駆動の反復に最適な土台となる。

## 7. フロントエンド画面構成

`apps/web`（Next.js App Router）の画面・ルーティング設計。Walking Skeleton（セキュリティ > XSS > 教材1本 + 4択3問）を貫通させる最小構成として 5 ルートを置く。

### 7.1 ルート構成

| ルート | 役割 | データ経路 | 主導線 |
| --- | --- | --- | --- |
| `/` ダッシュボード | **今日の復習（due）が主役**。学習継続・領域ナビは従。due 0 件時は新規レッスンへフォールバック | due 件数のみ API（Server loader → `hc`） | 「復習を始める」→ `/review` |
| `/learn/[domain]/[topic]` レッスン一覧 | トピック内のレッスン一覧（初期は XSS 1本） | ビルド時バンドル済み content（RSC） | 各レッスンへ |
| `/learn/[domain]/[topic]/[lesson]` 教材本文 | Markdown 本文表示 | ビルド時バンドル済み content（RSC）・**API 不要** | 「問題を解く →」`/quiz/[lesson]` |
| `/quiz/[lesson]` 演習 | レッスン全問を 1 問ずつ即時採点 | 問題＝content / 解答記録＝API | 完了 → 「次のレッスンへ」 |
| `/review` 復習 | due 問題をレッスン横断で収集 | queue＝API / 問題本文＝content / 記録＝API | 完了 → 「ホームへ」 |

### 7.2 横断する設計判断

- **データ取得（ハイブリッド）**：教材・問題はビルド時バンドル済み content を RSC / Server loader から読む。解答記録・SRS・due など動的データのみ Hono API を `hc` で呼ぶ。D1 への seed は配信・集計用キャッシュとして維持し、表示の主経路は content。
- **演習フロー**：1 問ずつ表示 → 即時に正誤＋解説 → 確定で選択肢をロック → 末尾に結果サマリ。**1 問解答＝1 `answer_log` POST**（SRS は問題粒度で更新）。
- **Quiz コンポーネント**：`question_id` の配列を受け取り 1 問ずつ回す純粋部品として設計。`/quiz`（レッスン全問）・`/review`（due 問題）・「間違えた問題だけ」（`wrongOnly`）で再利用する。問題セットの供給元だけが異なる。
- **結果サマリの動線（出し分け）**：`/quiz` は学習の前進が目的 → 「次のレッスンへ」。`/review` は due 消化が目的 → 「ホームへ」（残があれば継続）。両者で「間違えた問題だけ復習」を提供。
- **ID 設計**：`lessonId` / `questionId` は**グローバル一意**。学習導線は階層 URL（`/learn/...`）、演習・復習はフラット URL（`/quiz/[lesson]`・`/review`）。
- **レイアウト**：上部ヘッダーのみ（**ロゴ / 復習 / 学習** の 3 リンク）。本文は中央 1 カラム。サイドバーは持たない（トピック増加後に後付け可）。
- **ユーザー**：ログイン UI なし。API（Hono）側が固定 `user_id` を権威的に注入する。将来公開時は「固定値を返す関数」を「認証から `user_id` を引く関数」に差し替えるだけで、画面・API 契約は不変。
- **スタイリング**：Tailwind CSS。共通コンポーネント（ボタン・カード等）は必要になった時点で薄く切り出す。

### 7.3 画面構成から要請される API（参考）

`apps/api`（Hono）に以下を想定。本文はファイル一次ソースのため、API は ID・SRS メタ・集計値のみ返す。

- `POST /answers` — 1 問解答の記録 → SRS 更新
- `GET /review/queue` — due 問題の `question_id` ＋ SRS メタを返す（本文はフロントがバンドル済みデータから解決）
- `GET /dashboard/due-count` — ダッシュボードの due 件数

### 7.4 → 第8章へ

本章は画面・ルーティング（What/Where）を定義した。フロントエンドのアーキテクチャ（How）は **第8章** で確定する。

## 8. フロントエンドアーキテクチャ（How）

第7章の画面・ルーティング（What/Where）を、`apps/web` 上でどう構造化して実装するか（How）を確定する。設計哲学は本書全体と同じ：**ハイブリッド（教材＝ファイル一次ソース／動的データ＝D1）**・**`packages/shared` を単一ソース**・**Workers 制約を前提**。

フロントエンドアーキテクチャのフロー図と各ディレクトリの役割は、補助資料として [`docs/frontend-architecture.html`](./frontend-architecture.html) に整理する。本章と第9章を一次ソースとし、補助資料は実装時に参照しやすい形へ再構成したものとする。

### 8.1 ディレクトリ構成

`features + components/ui` 型を採用。`src/app` は薄く保ち、ロジックは `features` に寄せる。

```
apps/web/src/
├── app/                      # ルートのみ（page.tsx / layout.tsx）。薄く保つ
│   ├── layout.tsx            # ヘッダー（ロゴ/復習/学習）＋中央1カラム
│   ├── page.tsx              # / ダッシュボード
│   ├── learn/[domain]/[topic]/...   # レッスン一覧・教材本文（RSC）
│   ├── quiz/[lesson]/        # 演習
│   └── review/               # 復習
├── features/                 # 機能集約（状態・ロジックを持つ単位）
│   ├── quiz/                 # components / hooks / server / api / mapper / view-model
│   └── review/               # components / hooks / server / api / mapper / view-model
├── components/ui/            # 汎用UI（Button / Card 等）。Tailwind 実装
└── lib/                      # hc クライアントファクトリ / API response helper / content ローダー / env
```

- **Quiz コンポーネント**は `apps/web/src/features/quiz` に置く。`question_id[]` を受け取り 1 問ずつ回す純粋部品とし、`/quiz`（レッスン全問）・`/review`（due 問題）・`wrongOnly`（間違えonly）で供給元だけ差し替えて再利用する（7.2 の方針を実体化）。
- feature 内の通信責務は `api/`・`server/`・`hooks/` に分ける。`api/` は Hono RPC（`hc`）呼び出しの薄い wrapper、`server/` は page / Server Component から呼ぶ初回取得と ViewModel 化、`hooks/` は Client Component から呼ぶ mutation・再取得・UI state を担当する。`apps/web/src/features/*/server` 配下のファイルには `import 'server-only'` を置き、Client Component からの誤 import を防ぐ。
- `apps/web` 側では `_DAL` / `dal` という名前を使わない。DB へ直接アクセスしないため、Data Access Layer は `apps/api` 側の Drizzle / D1 アクセス層として定義する。
- 共通 UI は**必要になった時点で** `components/ui` に薄く切り出す（先回りして作らない）。

### 8.2 content ロード方式（ビルド時バンドル）

**素 Markdown + frontmatter** を **ビルド時にバンドル**する。

- **Workers 制約**：Cloudflare Workers では `node:fs` のランタイム読みが使えない。教材・問題は**ランタイム fs 読みではなくビルド時インライン化**する。
- frontmatter に問題（`questions[]`。スキーマは4.4節と同一の `{ id, type:'mcq', prompt, choices[], answerIndex, explanation }`）、本文は Markdown 本体。
- ビルド時に `gray-matter` でパースし、`packages/shared` の Zod（`schema/content`）で検証してから**型付きデータとしてインライン化**する。
- 本文描画は `react-markdown` 等のレンダラを用いる（RSC で完結）。MDX は採用しない（ビルド設定と frontmatter 抽出が複雑化するため）。
- content 参照は `apps/web/src/lib/content.ts` に集約する。`getLessonContent(lessonId)`・`getLessonsByTopic(domain, topic)`・`getBundledQuestions()`・`getQuestionById(questionId)` を最初から共通関数として用意し、page / Server loader / mapper から同じ経路で参照する。
- `getBundledQuestions()` は `/review` の `question_id` 解決用に `questionId` index を返せる形にする。各 feature で frontmatter 配列を直接走査しない。
- **同じパース経路を `content/` → D1 seed/upsert スクリプトでも再利用**し、フロント表示と D1 配信を単一ソースから導く（4.2 の責務分離を維持）。

### 8.3 Server / Client コンポーネント境界

- **教材系（`/`・`/learn/...`）= RSC**。ビルド時バンドル済みデータを読む。ダッシュボードの due 件数のような初回表示に必要な軽い集計値は page / Server loader から `hc` で読む。教材本文ページは **API 不要**。
- **演習系（Quiz / Review）= Client Component**。状態（現在の問題・採点結果・ロック）を持つため。
- **レイアウト / ヘッダー = Server**。
- 実行場所はディレクトリ名ではなく import 境界で決まる。`apps/web/src/features/*/server` は `apps/web/src/app/**/page.tsx` など Server Component から import する限りサーバー側で実行される。誤用防止のため `import 'server-only'` を必須にする。
- Server Actions は使わず、動的データは Hono API に一本化する。初回取得は page / Server loader から `hc` で実行し、mutation・再取得は Client hook から `hc` を叩く（API 契約を `apps/api` に一本化し、RPC 型を素直に効かせる）。
  - **不採用の根拠**：変更系を Hono に一本化することで ①契約（`AppType`）と `user_id` 注入点（§7.2）を単一ソースに保てる、②Hono+Cloudflare の学習目的（§2）を素通りしない。Server Actions の利点（フォームのプログレッシブエンハンスメント等）は、即時採点の Client 主導 Quiz・変更系が `POST /answers` ほぼ一択の本アプリでは恩恵が小さい。重いフォームが必要になった時点で再検討する。

### 8.4 `hc` クライアントの取り回し

- `apps/api` が `AppType` をエクスポート → `apps/web` は `hc<AppType>` で型安全クライアントを生成（既存 `apps/api/src/client.ts` のファクトリを利用）。
- `apps/web/src/lib/api.ts` に**クライアント生成を集約**。baseURL は env（Workers バインディング / 環境変数）から解決し、ハードコードしない。
- feature の `api/` は `hc` の path・method 呼び出しを薄く包む。server / client 両方から使うため、`server-only`・cookies・headers・秘密情報など環境専用処理を入れない。
- `res.ok` チェックと `res.json()` 変換は `apps/web/src/lib/api-response.ts` の `requestJson` に共通化する。feature の `api/` は path・method・引数・エラーメッセージだけを持つ。
- `hc` の path 呼び出し自体は文字列パスの汎用 fetch に置き換えない。`client.review.queue.$get()` のような endpoint ごとの wrapper を残すことで、Hono RPC の型推論を維持する。
- 初回表示に必要な `GET /dashboard/due-count`・`GET /review/queue` は page / Server loader から呼び、ViewModel に整形して Client Component へ props で渡す。
- ユーザー操作後の `POST /answers`・`GET /review/queue` 再取得は Client hook から呼ぶ。初回表示で不要なスピナーを出さない。

### 8.5 演習（Quiz）の状態管理

- **クライアント state のみ**（`useState` で Quiz コンポーネント内に閉じる）。MVP として最小化。
  - MVP フローは「1 問表示 → 選択 → 即時採点 → ロック → 解説表示 → 次問」で線形・シンプルなため、`useState` で充分。複雑な状態遷移が出現（例：問題セット内での再検索・フィルタ等）したら、その時点で `useReducer` へ段階的にリファクタリング。
- **リロードで進捗はリセット（許容）**。ただし「1 問解答＝1 `answer_log` POST」（7.2 で定義済みの原則）なので、解答そのものは即サーバーに残る。途中復帰（sessionStorage）やサーバー復元は将来拡張ポイントとして留保。
- フロー：1 問表示 → 即時採点（正誤＋解説）→ 選択肢ロック → 末尾に結果サマリ → 出し分け動線（`/quiz`=次のレッスンへ／`/review`=ホームへ、両者「間違えonly」提供）。

### 8.6 `packages/shared` の Zod 利用パターン

- スキーマは `packages/shared` に集約し二重定義しない（既存 `schema/content`・`db/schema`・`srs/sm2` を土台に拡張）。
- 同一スキーマを **3 経路で共有**：①content のビルド時パース検証、②API 入力の `zValidator`、③フロントの型（`z.infer`）。
- フロントは API レスポンス・content データとも `z.infer` で型を引き、独自の型定義を持たない。

### 8.7 スタイリング（Tailwind 移行）

- **Tailwind CSS を導入**し、スタイルを Tailwind に寄せる。
- 現状の scaffold 残骸（`*.module.css`、`*.disabled` ファイル群）は**撤去対象**として整理する。
- 共通スタイルは `components/ui` のコンポーネントに集約し、ページ側はユーティリティクラスで組む。

### 8.8 → 第9章へ

本章で How を確定した。content/API データの整形フロー（Content data / API DTO → ViewModel → page）は **第9章** で詳細化する。

## 9. データフェッチング・整形フロー

第8章は app ファイル・コンポーネント構成を決めた。本章は **content / API から page へ至るまでのデータの流れ**—Content data / DTO / ViewModel / Mapper / loader・hook—を設計する。原則は **page は表示のみ**。データの形成と変換は層を分けて、content 構造や API 変更の影響を mapper に閉じ込める。

### 9.1 層構造（Content data / DTO → Mapper → ViewModel → page）

```
content（ビルド時バンドル） または API（Hono）
    ↓ Content data または serializable DTO（shared @tsl/shared）
  Mapper（純粋関数、web 固有）
    ↓ ViewModel（web 固有型）
  Server loader / Client hook
    ↓
  page / component（表示）
```

この図は責務の分離順を表しており、実行時の呼び出し順とは異なる。実装上は Server loader / Client hook が fetch（content 取得または DTO 取得）と Mapper 呼び出しの両方を内包する呼び出し元であり、9.2 のコード例の通り「loader/hook が fetch→mapper を呼び、ViewModel を得て page/component へ渡す」という順序で実行される。

- **Content data**：`content/` の Markdown + frontmatter をビルド時にパース・検証した型付きデータ。教材本文・問題本文・解説の主経路。
- **DTO**：API レスポンス型。`packages/shared` の Zod スキーマ（§8.6）から型推論、AppType に含まれる。due queue・answer 結果・集計値など動的データの契約。
- **Mapper**：`content/API data -> ViewModel` 形の純粋関数。content 構造や API 仕様変更の影響は**ここで吸収**。複数ページで同じデータを使う場合、mapper も共有。
- **ViewModel**：web 固有の表示形態。「page で即座に使える形」に正規化済み（selector・filter・sort 済み）の**純データ**。`loading`・`error` は VM に含めず、Client hook の返り値として別に扱う。

### 9.2 二系統：Server loader と Client hook

#### Server 系（教材系）

`/learn/[domain]/[topic]/[lesson]` など RSC ページ：

```typescript
// features/lesson/server/load-lesson.ts
import 'server-only';

export function loadLesson(lessonId: string): LessonViewModel {
  const content = getLessonContent(lessonId); // ビルド時バンドル済み content
  return lessonContentToViewModel(content);
}

// app/learn/[domain]/[topic]/[lesson]/page.tsx
export default function LessonPage({ params }: Props) {
  const vm = loadLesson(params.lesson);
  return <LessonDisplay viewModel={vm} />;
}
```

- loader はビルド時バンドル済み content を取得し、mapper を噛ませて ViewModel を page へ渡す。教材本文ページは API を呼ばない。
- エラーは throw → `error.tsx`・`Suspense` で処理。

#### Client 系（演習・復習系）

`/quiz/[lesson]`・`/review` などインタラクションを持つページ。**初回データは page 側で ViewModel 化して props で渡し、Client hook はその初期 VM を受け取り、以降の再取得・mutation のみ担当**する（＝初回レンダリング時にスピナーを出さない）。

- `/quiz`：content から問題・解説を解決し、API GET はしない。Client hook は `POST /answers` のみ担当。
- `/review`：Server loader で `GET /review/queue` を呼び、返却された `question_id` を content の問題本文・解説へ join して VM 化する。

```typescript
// lib/api-response.ts
type JsonResponse<T> = Response & {
  json(): Promise<T>;
};

export async function requestJson<T>(
  request: () => Promise<JsonResponse<T>>,
  errorMessage: string,
): Promise<T> {
  const res = await request();
  if (!res.ok) throw new Error(errorMessage);
  return res.json();
}

// features/review/api/review-api.ts
export async function fetchReviewQueue(client: ApiClient): Promise<ReviewQueueDTO> {
  return requestJson(
    () => client.review.queue.$get(),
    'Failed to fetch review queue',
  );
}

// features/review/server/load-review-queue.ts
import 'server-only';

export async function loadReviewQueue(): Promise<ReviewViewModel> {
  const dto = await fetchReviewQueue(createServerApiClient());
  return reviewQueueDTOToViewModel(dto, getBundledQuestions());
}

// app/review/page.tsx（Server）— 初回データは page で整形して取得
export default async function ReviewPage() {
  const initialVm = await loadReviewQueue();  // API queue + content join 済み VM
  return <ReviewRunner initialViewModel={initialVm} />;
}

// features/review/hooks/use-review-queue.ts（Client）
'use client';
export function useReviewQueue(initialVm: ReviewViewModel) {
  const [vm, setVm] = useState<ReviewViewModel>(initialVm);  // ← 初回は props、スピナー不要
  const [error, setError] = useState<Error | null>(null);

  // 再取得（例：完了後に次の due を引き直す）だけを Client が担当
  const refetch = useCallback(async () => {
    try {
      const dto = await fetchReviewQueue(createBrowserApiClient());
      setVm(reviewQueueDTOToViewModel(dto, getBundledQuestions()));
    } catch (e) {
      setError(e as Error);
    }
  }, []);

  return { vm, error, refetch };
}

// features/review/components/review-runner.tsx（Client）
'use client';
export function ReviewRunner({ initialViewModel }: Props) {
  const { vm, error, refetch } = useReviewQueue(initialViewModel);
  if (error) return <ErrorDisplay error={error} retry={refetch} />;
  return <QuizRenderer viewModel={vm} />;  // 初回から即描画（スピナーなし）
}
```

- **初回＝page 側で VM 化**。`/quiz` は content のみ、`/review` は API queue + content join。loader も hook も同じ mapper を通すため、整形ロジックは一本のまま（§9.1 の原則）。
- **Client hook は初期 VM を props で受け取り**、`useState` の初期値に据える。以降の再取得・楽観更新のみ hook が受け持つ。
- **RPC 呼び出しは `apps/web/src/features/*/api` の薄い wrapper 経由**。Server loader と Client hook は同じ wrapper を使い、実行環境ごとの client 生成だけを差し替える。HTTP レスポンス処理は `requestJson` に寄せ、feature 側では重複させない。
- **初回スピナー不要**（本節冒頭で述べた原則の実装上の帰結）：ウォーターフォールを回避し初回表示が速い。ローディング表示が要るのは再取得中のみ。
- **将来：**TanStack Query 等へ置き換える際、mapper・ViewModel 型・page は変わらず、hook 内部だけ差し替わる（契約保証）。TanStack Query の `initialData` に props の VM を渡す形へ自然に移行できる。

### 9.3 DTO / ViewModel の分離と配置

#### 型の配置

```
packages/shared/src/
├── schema/api.ts      # API レスポンス Zod（DTO型推論元）。API チーム＝contract
├── schema/content.ts  # content frontmatter Zod（Content data 型推論元）
└── ...

apps/web/src/
├── features/
│   └── quiz/
│       ├── view-model.ts           # type QuizViewModel = { ... }
│       ├── mapper.ts               # quizContentToViewModel(content) {...}
│       ├── api/
│       │   └── quiz-api.ts         # hc 呼び出しの薄い wrapper（POST /answers 等）
│       ├── hooks/
│       │   └── use-quiz-data.ts    # mutation・再取得・UI state
│       ├── server/
│       │   └── load-quiz.ts        # 初回取得・ViewModel 化
│       └── components/
│           └── quiz-interactive.tsx
├── features/shared/
│   └── quiz-question.ts            # content question -> quiz表示用データの小さい純粋変換
└── lib/
    ├── api.ts                      # createServerApiClient / createBrowserApiClient
    ├── api-response.ts             # requestJson
    └── content.ts                  # content loader / question index
```

- **Content data / DTO は shared**（複数パッケージで共有、単一ソース）。
- **ViewModel は `apps/web/src/features` 配下**（表示都合なので web 固有）。
- **mapper は feature 単位で配置**。同じ DTO / content data を複数 feature で使う場合も、ViewModel 全体の mapper は各 feature に置く。重複した小さい純粋変換だけを `apps/web/src/features/shared` に逃がす。
- **`apps/web/src/features/*/api` は RPC wrapper**。`hc` の path・method 呼び出しと endpoint 固有の引数だけを薄く閉じ込める。`res.ok` チェック・`res.json()` は `apps/web/src/lib/api-response.ts` の共通関数に寄せる。ViewModel 化・UI state はここに入れない。
- **`apps/web/src/features/*/server` は初回取得**。page / Server Component から呼ばれ、content data や API DTO を mapper に通して ViewModel を返す。ファイル先頭に `import 'server-only'` を置く。
- **`apps/web/src/features/*/hooks` は Client 専用**。初期 ViewModel を props で受け取り、ユーザー操作後の mutation・再取得・loading/error state を扱う。
- **`apps/web/src/features/shared` は小さい純粋変換だけ**。`contentQuestionToQuizQuestion` のように `/quiz` と `/review` の両方で同じ表示用 question 形へ変換する helper はここへ置く。ViewModel 全体・loader・hook は共有しない。
- **`apps/web/src/lib` は横断インフラだけ**。API client 生成、HTTP response 処理、content index など feature 非依存の関数を置く。画面都合の整形は feature mapper に残す。

#### API 側の DAL 配置

`apps/api` は D1 / Drizzle に直接触るため、必要に応じて `dal/` を置く。Hono route は HTTP 契約、service はユースケース、dal は永続化アクセスに責務を分ける。

```
apps/api/src/
├── routes/
│   ├── answers.ts
│   └── review.ts
├── services/
│   ├── answer-service.ts
│   └── srs-service.ts
└── dal/
    ├── answer-log-repository.ts
    └── srs-state-repository.ts
```

### 9.4 共通パターンと例

#### 教材（Server）

```typescript
// features/lesson/view-model.ts
export type LessonViewModel = {
  id: string;
  title: string;
  markdownBody: string;
  questions: Array<{
    id: string;
    prompt: string;
    choices: string[];
  }>;  // 教材本文ページでは解説を表示しない。Quiz/Review VM は content 由来の解説を持つ。
};

// features/lesson/mapper.ts
export function lessonContentToViewModel(content: LessonContent): LessonViewModel {
  return {
    id: content.id,
    title: content.title,
    markdownBody: content.markdownBody,
    questions: content.questions.map(q => ({
      id: q.id,
      prompt: q.prompt,
      choices: q.choices,
    })),
  };
}

// features/lesson/server/load-lesson.ts
import 'server-only';

export function loadLesson(lessonId: string): LessonViewModel {
  const content = getLessonContent(lessonId);  // ビルド時バンドル
  return lessonContentToViewModel(content);
}

// app/learn/[domain]/[topic]/[lesson]/page.tsx
export default function LessonPage({ params }: Props) {
  const vm = loadLesson(params.lesson);
  return (
    <article className="prose">
      <h1>{vm.title}</h1>
      <ReactMarkdown>{vm.markdownBody}</ReactMarkdown>
    </article>
  );
}
```

#### 演習（Client）

`/quiz` は問題自体がビルド時バンドル（§8.2）なので初回 GET は不要。page（Server）で VM を組み立てて props で渡し、Client は解答（`POST /answers`）だけを担当する。

```typescript
// features/quiz/view-model.ts
export type QuizViewModel = {
  questions: Array<{
    id: string;
    prompt: string;
    choices: string[];
  }>;
  explanations: Record<string, string>;  // questionId → 解説
};

// features/shared/quiz-question.ts
export function contentQuestionToQuizQuestion(question: LessonContentQuestion) {
  return {
    id: question.id,
    prompt: question.prompt,
    choices: question.choices,
  };
}

// features/quiz/mapper.ts — 入力はビルド時バンドルの content データ
export function quizContentToViewModel(content: LessonContent): QuizViewModel {
  return {
    questions: content.questions.map(contentQuestionToQuizQuestion),
    explanations: Object.fromEntries(
      content.questions.map(q => [q.id, q.explanation])
    ),
  };
}

// app/quiz/[lesson]/page.tsx（Server）— 初回 VM を page で組み立てて渡す
export default function QuizPage({ params }: Props) {
  const content = getLessonContent(params.lesson);   // ビルド時バンドル
  const vm = quizContentToViewModel(content);
  return <QuizInteractive initialViewModel={vm} />;
}

// features/quiz/components/quiz-interactive.tsx（Client）
'use client';
export function QuizInteractive({ initialViewModel }: Props) {
  const [vm] = useState(initialViewModel);              // 初回から即描画（スピナーなし）
  const { submitAnswer, results } = useAnswerSubmit();  // POST /answers を担当

  return (
    <div className="space-y-6">
      {vm.questions.map(q => (
        <QuestionCard
          key={q.id}
          question={q}
          explanation={vm.explanations[q.id]}
          onAnswer={submitAnswer}
          result={results[q.id]}
        />
      ))}
    </div>
  );
}
```

- `/quiz` の初回は **API GET なし**（問題はビルド時バンドル、page で VM 化）。Client hook は `POST /answers`（mutation）だけを持つ。
- `/review` の初回は **Server loader で GET**（due queue）→ props 渡し（§9.2 参照）。

### 9.5 content / API 変更時の対応フロー

content frontmatter が変わった場合（例：lesson に新フィールド `difficulty: 'easy'|'medium'|'hard'` が追加）：

1. `packages/shared/schema/content.ts` の LessonContent Zod スキーマを更新。
2. `apps/web/src/features/lesson/view-model.ts` で ViewModel にフィールド追加（必要に応じて）。
3. `apps/web/src/features/lesson/mapper.ts` で mapper の変換ロジックを更新。
4. page コンポーネントはそのまま（ViewModel が contract を満たしていれば）。

API DTO が変わった場合（例：review queue に `dueAt` が追加）：

1. `packages/shared/schema/api.ts` の該当 DTO Zod スキーマを更新。
2. `apps/web/src/features/review/view-model.ts` で ViewModel にフィールド追加（必要に応じて）。
3. `apps/web/src/features/review/mapper.ts` で API DTO + content data の join / 変換ロジックを更新。
4. page / Client component はそのまま（ViewModel が contract を満たしていれば）。

**変更の影響が mapper に局所化**され、page は変わらない。複数 feature が同じ DTO を使う場合、各々の mapper を独立更新。

### 9.6 エラー・ローディング処理

#### Server（教材系）

```typescript
// app/learn/[domain]/[topic]/[lesson]/error.tsx
'use client';
export default function Error({ error }: { error: Error }) {
  return <ErrorPage message={error.message} />;
}

// features/lesson/server/load-lesson.ts の content 未検出・検証失敗 throw が自動で error.tsx へ
```

#### Client（演習・復習系）

初回データは page 側で VM 化済みのため（9.2 参照）、**初回にローディング表示は出ない**。Client 側で扱うのは以下の 2 つ：

- **初回データ形成の失敗**：content 未検出・検証失敗、または `/review` の初回 queue 取得失敗 → ルートの `error.tsx` で捕捉（Server 系と同じ経路）。
- **再取得・mutation の失敗/待機**：hook が返す `error`・（再取得中の）状態を component で出し分ける。

```typescript
// features/review/components/review-runner.tsx
'use client';
export function ReviewRunner({ initialViewModel }: Props) {
  const { vm, error, refetch } = useReviewQueue(initialViewModel);

  // 初回は props で描画済み。ここで扱うのは再取得エラーのみ
  if (error) return <ErrorDisplay error={error} retry={refetch} />;

  return <QuizRenderer viewModel={vm} />;  // 初回からスピナーなしで描画
}
```

### 9.7 mapper・ViewModel の共有戦略

同じ content data / DTO を複数ページが使う場合（例：復習（`/review`）と演習（`/quiz`）が同じ bundled questions を使用）：

```
apps/web/src/features/
├── quiz/
│   ├── view-model.ts           # QuizViewModel（演習特有）
│   └── mapper.ts
├── review/
│   ├── view-model.ts           # ReviewViewModel（復習特有、異なるページ 組成）
│   └── mapper.ts
└── shared/
    └── quiz-question.ts        # 小さい純粋変換のみ
```

ViewModel・mapper は feature ごとに独立させ、同じ DTO の使い方が feature ごとに異なることを認める。`apps/web/src/features/shared` は共通 ViewModel を持つ場所ではなく、`contentQuestionToQuizQuestion` のような小さい純粋変換だけを置く場所とする。

### 9.8 次回の実装テーマ

本章でデータフロー（Content data / API DTO → Mapper → ViewModel → page）を確定した。次回は実装フェーズ：Walking Skeleton（`セキュリティ > XSS > 教材1本 + 4択3問`、第6章）を、第8章の構成（8.1〜8.7）・本章のデータフロー（9.1〜9.7）に沿って縦に 1 本貫通させる。
