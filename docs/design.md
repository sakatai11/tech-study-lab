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

### 3.1 Worker 構成と接続（決定）

`apps/web`（OpenNext）と `apps/api`（Hono）は**別 Worker としてデプロイする**。Next.js の Route Handler 上に Hono を載せる同居構成（`app/api/[[...route]]/route.ts` + `handle()`）は採用しない。

**別 Worker を採る理由**：

- `apps/api` が自身の wrangler 設定を完全所有できる。D1 マイグレーションや将来の Cron Triggers / Queues 等の Workers プラットフォーム機能を、OpenNext が生成する web 側の wrangler 設定・Next.js ビルドに巻き込まずに使える。デプロイも独立する（API の変更に Next.js ビルドが不要）。
- 同居構成ではリクエストが「Next.js ルーター → Route Handler → Hono ルーター」の二段になり、Next middleware と Hono middleware の責務境界が濁る。なお Hono の RPC・`zValidator`・middleware 自体は Route Handler 内でも動くため、失うのは Hono の機能ではなく Workers との直結と独立性である。
- 既存の設計判断と整合する：§8.3 のキャッシュ方針は「mutation（`POST /answers`）が Next.js のサーバーコンテキストを経由しない」ことを前提とし、§7.2 の採点権威・`user_id` 注入点も API 側にある。API 契約（`AppType`）を `apps/api` に一本化する §5 のガードレールとも噛み合う。
- Hono + Cloudflare を学ぶドッグフーディング目的（§2）を素通りしない。

**接続経路**（`hc` クライアント側の取り回しは §8.4）：

| 呼び出し元 | 経路 | 備考 |
| --- | --- | --- |
| Server loader（web Worker 内） | **Service Binding**（`env.API`） | Worker 間の内部呼び出し。公衆インターネットを経由せず、CORS 不要 |
| Client hook（ブラウザ） | API Worker の公開 URL | 当面は Hono の `cors()` で web オリジンのみ許可。将来カスタムドメイン導入時は同一ゾーンのルート割当（`example.com/api/*` → API Worker）で同一オリジン化し、CORS 設定を撤去する |
| ローカル開発 | URL（`http://localhost:8787`） | `next dev` と `wrangler dev` を並走させ、env の URL にフォールバック |

- web 側の wrangler 設定に `services: [{ "binding": "API", "service": "<API Worker 名>" }]` を宣言し、Server 側の `hc` には `getCloudflareContext().env.API.fetch` をカスタム `fetch` として渡す。
- Service Binding 経由でも `hc<AppType>` の型安全 RPC はそのまま維持される（差し替わるのは fetch 実装のみで、パス・メソッド・型は不変。baseURL のホスト名はダミーでよい）。

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

D1 側（動的データ）:

- `users`: 将来公開用。初期は単一ユーザーでも user_id を持つ
- `answer_logs`: `{ id, user_id, question_id, is_correct, answered_at, response_time_ms? }`（`response_time_ms` は §7 アナリティクス画面の「平均反応時間」向け。Quiz クライアントが選択肢表示から解答確定までを計測して送信する任意項目）
- `srs_states`: `{ user_id, question_id, ease, interval, due_at, reps, lapses }`（SRSパラメータ。アルゴリズムは実装時に SM-2 ベースを想定）
- `lesson_views`: `{ id, user_id, lesson_id, viewed_at }`（アナリティクス画面の「学習時間」「最近のアクティビティ」向け。教材本文ページ表示時に fire-and-forget で記録する最小ログ。学習時間は「閲覧したレッスンの frontmatter 所要時間（例：約18分）の合計」＋「`answer_logs.response_time_ms` の合計」で近似する簡易集計とし、精緻な計測は行わない）

D1 側（content 同期キャッシュ。4.2 の seed/upsert 対象）:

- `questions`: `{ question_id, answer_index }`（`content/` の `answerIndex` を同期。本文・選択肢・解説は持たず、正誤判定に必要な最小フィールドのみ保持。7.2「正誤判定はAPIが権威」の照合元）

### 4.5 出題ルール（SRS 運用仕様）

SM-2 の計算式（`packages/shared/src/srs/sm2.ts`）の周辺で、実装時に判断を迫られるルールをここで確定する。

**前提**：新規問題は学習フロー（教材 → `/quiz`）で必ず解答する。したがって `/review` は解答済み問題（`srs_states` を持つ問題）のみを扱い、SRS のサイクルは初回解答から始まる。

- **SRS 更新の入口は 1 つ**：`POST /answers` は呼び出し元（`/quiz`・`/review`・`wrongOnly`）を区別せず、1 解答ごとに `answer_log` 記録と SRS 更新を必ず行う。演習と復習で採点・記録の仕様差を作らない（API はリクエストの文脈を持たない）。演習（`/quiz`）で正解した問題が SM-2 に従い翌日 due になるのは意図した挙動である。
- **due queue の順序と上限**：`dueAt` 昇順（滞留が古いものから）。1 回のレスポンスは**最大 20 件**。完了後に残 due があれば `router.refresh()` で次のバッチを取得する（§9.2 の再取得動線と整合）。
- **同一問題の複数回解答**：制御しない。解答のたびに SRS を更新する（最後の解答が次回出題日を決める）。`answer_logs` には全解答が残るため、事後分析は可能。
- **正解データの修正**：content の `answerIndex` を修正しても、過去の `answer_logs` は再評価しない（記録時点の判定を保持する）。

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

`apps/web`（Next.js App Router）の画面・ルーティング設計。ビジュアルモックアップ（正式版：[`docs/mockups/DevPath Unified.html`](./mockups/DevPath%20Unified.html)。検討経緯は [`docs/mockups/README.md`](./mockups/README.md)）で確定した画面セットを正式スコープとする。Walking Skeleton（§6：セキュリティ > XSS > 教材1本 + 4択3問）は本章のうち `/`・`/learn/...`・`/quiz/...` を貫通させる最小構成であり、本章の画面数と Walking Skeleton の対象範囲は別物である。

### 7.1 ルート構成

| ルート | 役割 | データ経路 | 主導線 |
| --- | --- | --- | --- |
| `/` ダッシュボード | **今日の復習（due）が主役**。学習統計（正答率・学習時間・連続学習日数）・学習コントリビューション（草＝日次解答数ヒートマップ）・領域別習得状況・最近のアクティビティ・次のレッスン導線を併せ持つ | due 件数・統計値・草は API（Server loader → `hc`） | 「復習を始める」→ `/review`、「続きから」→ `/learn/...` |
| `/domains` スキルツリー | カリキュラムを `devpath tree` 風の**ディレクトリツリー**で俯瞰する（§8.7）。レッスンごとに done ✓ / current ▶（進捗バー・START）/ locked 🔒 を表示し、クリアで次ノードが解放。コンテンツ未整備の領域はツリー下部に `content/<domain>/ [locked]` として表示し非活性 | 領域別集計は API（`GET /domains`） | done 行 → `/learn/[domain]/[topic]`、current 行 → 教材本文 |
| `/learn/[domain]/[topic]` レッスン一覧 | トピック内のレッスン一覧（初期は XSS 1本） | ビルド時バンドル済み content（RSC） | 各レッスンへ |
| `/learn/[domain]/[topic]/[lesson]` 教材本文 | Markdown 本文表示 | ビルド時バンドル済み content（RSC）・**API 不要** | 「問題を解く →」`/quiz/[lesson]` |
| `/quiz/[lesson]` 演習 | イントロ（レッスン概要の確認）→ 全問を 1 問ずつ即時採点 → 結果サマリ、を 1 画面内のクライアント状態遷移（`intro → exercise → result`）で完結。演習ナビ・教材本文の両方から入れる | 問題＝content（RSC で初期化）/ 解答記録＝API | 完了 → 「次のレッスンへ」／「再挑戦」 |
| `/review` 復習 | イントロ（本日の due キューを dueAt 昇順・滞留日数付きでプレビュー）→ due 問題をレッスン横断で 1 問ずつ即時採点 → 結果サマリ、を 1 画面内のクライアント状態遷移で完結 | queue＝API（`GET /review/queue`）/ 問題本文＝content / 記録＝API | 完了 → 「ホームへ」／「間違えた問題だけ再挑戦」 |
| `/analytics` アナリティクス | 解答ログ・SRS状態を集計した学習分析ビュー（総解答数・正答率・平均反応時間・習得済み問題数・週次アクティビティ・SRS定着度分布・間違えやすい問題ランキング） | 集計値は API（§7.3） | — |

### 7.2 横断する設計判断

- **データ取得（ハイブリッド）**：教材・問題はビルド時バンドル済み content を RSC / Server loader から読む。解答記録・SRS・due など動的データのみ Hono API を `hc` で呼ぶ。D1 への seed は配信・集計用キャッシュとして維持し、表示の主経路は content。
- **演習フロー**：1 問ずつ表示 → 即時に正誤＋解説 → 確定で選択肢をロック → 末尾に結果サマリ。**1 問解答＝1 `answer_log` POST**（SRS は問題粒度で更新）。
- **正誤判定の権威はAPI（サーバー）**：Quiz/Review の `QuizViewModel` は選択肢と解説のみを持ち、正解（`answerIndex`）を含めない。クライアントは選んだ `selectedIndex` を `POST /answers` に送り、API が D1 の `questions`（4.4）と照合して `is_correct` を判定・記録し、結果（`isCorrect` / `correctIndex`）を返す。将来公開後もクライアントバンドルに正解を露出しない。
- **Quiz コンポーネント**：`question_id` の配列を受け取り 1 問ずつ回す純粋部品として設計。`/quiz`（レッスン全問）・`/review`（due 問題）・「間違えた問題だけ」（`wrongOnly`）で再利用する。問題セットの供給元だけが異なる。
- **結果サマリの動線（出し分け）**：`/quiz` は学習の前進が目的 → 「次のレッスンへ」。`/review` は due 消化が目的 → 「ホームへ」（残があれば継続）。両者で「間違えた問題だけ復習」を提供。
- **イントロ・演習・結果の状態遷移（URL は変えない）**：演習・復習とも 1 ルート内で `intro → exercise → result` のクライアント状態遷移を持つ（別 URL に切らない。モックの実装モデルに一致）。`intro` は開始前の確認（対象レッスンの概要／due 件数・滞留日数のプレビュー）に専念し、`exercise` は 1 問ずつ即時採点、`result` はスコア・問題ごとの正誤一覧・出し分けアクションを表示する。初回データ（問題・解説、`/review` は due queue）は Server loader で ViewModel 化して props で渡し、状態遷移そのものは Client Component が持つ（§8.5・§9.4 の `QuizInteractive` と同じ設計）。結果表示は `/quiz` と `/review` で共通コンポーネントとして再利用する。
- **ID 設計**：`lessonId` / `questionId` は**グローバル一意**。学習導線は階層 URL（`/learn/...`）、演習・復習はフラット URL（`/quiz/[lesson]`・`/review`）。
- **レイアウト（サイドバー / ボトムタブ）**：PC は左サイドバー（ロゴ＋テーマトグル＋ダッシュボード／教材／演習／復習（due件数バッジ）／アナリティクス／スキルツリー）、本文は右側 1 カラム。SP は上部アプリバー（ロゴ＋ストリーク表示＋テーマトグル）＋下部固定タブバー（**ホーム／教材／演習／復習（dueバッジ）／ツリーの5項目**）。「演習」「復習」ナビ項目は直前に扱っていたレッスン（未着手なら先頭レッスン）を対象とする簡易ヒューリスティックで遷移先を決定する（MVP は XSS 1本のため実質固定）。SP のタブバーはスペース都合で 5 項目に絞り、「アナリティクス（`/analytics`）」へはダッシュボードの「すべて表示」リンクから遷移する。「設定」は将来の公開機能（認証等、§1 スコープ外）向けで、MVP ではナビに置かない。
- **ユーザー**：ログイン UI なし。API（Hono）側が固定 `user_id` を権威的に注入する。将来公開時は「固定値を返す関数」を「認証から `user_id` を引く関数」に差し替えるだけで、画面・API 契約は不変。
- **スタイリング**：Tailwind CSS ＋ Dev-Native Neo Flat × Terminal デザインシステム（ダークファースト）。詳細トークン・コンポーネント文法・ゲーミフィケーション表現の実装区分は §8.7。

### 7.3 画面構成から要請される API（参考）

`apps/api`（Hono）に以下を想定。本文はファイル一次ソースのため、API は ID・SRS メタ・集計値のみ返す。

HTTP 入出力、Zod スキーマの実装状況、後続エンドポイントの planned 状態は [API 契約カタログ](./api-spec.html) を参照する。本節は画面から要請される API の高水準な一次仕様として維持する。

- `POST /answers` — 1 問解答の記録 → SRS 更新。リクエスト `{ questionId, selectedIndex, responseTimeMs? }`、レスポンス `{ isCorrect, correctIndex }`。正誤判定は API が D1 の `questions`（4.4）を照合して行う権威側（7.2）
- `GET /review/queue` — due 問題の `question_id` ＋ SRS メタを返す（本文はフロントがバンドル済みデータから解決）。`dueAt` 昇順・最大 20 件（§4.5）
- `GET /dashboard/due-count` — ダッシュボードの due 件数
- `GET /domains` — 4 領域それぞれの習得率（習得済み問題数 / 全問題数）・トピック数・レッスン数を返す（`/domains`・ダッシュボードの領域別カードで共用）
- `GET /analytics/summary` — 総解答数・正答率・平均反応時間・習得済み問題数（SRS interval ≥ 21日）・連続学習日数・今週の学習時間（§4.4 の `lesson_views`・`answer_logs.response_time_ms` から集計）
- `GET /analytics/weekly` — 直近7日の解答数推移（曜日ごとの件数）
- `GET /analytics/heatmap` — 学習コントリビューション（草）用の日次解答数（直近26週。`answer_logs` の日次集計）
- `GET /analytics/mistakes` — 誤答率が高い問題の上位ランキング（`question_id` ＋ 誤答率）
- `GET /activity/recent` — ダッシュボードの「最近のアクティビティ」向け直近イベント一覧（レッスン閲覧・演習完了・復習キュー更新を統合。集計ロジックの詳細は10章相当で実装時に確定する簡易版でよい）

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
│   ├── layout.tsx            # サイドバー（PC）/ ボトムタブ（SP）＋本文1カラム（§7.2）
│   ├── page.tsx              # / ダッシュボード
│   ├── domains/              # スキルツリー（学習領域の俯瞰）
│   ├── learn/[domain]/[topic]/...   # レッスン一覧・教材本文（RSC）
│   ├── quiz/[lesson]/        # 演習（page が Server loader で初期化 → Client が intro/exercise/result 状態を持つ）
│   ├── review/               # 復習（同上。初回 due queue は Server loader）
│   └── analytics/            # アナリティクス
├── features/                 # 機能集約（状態・ロジックを持つ単位）
│   ├── dashboard/            # 統計・領域別進捗・最近のアクティビティの集約（components / server / mapper / view-model）
│   ├── domains/              # 領域一覧の取得・ViewModel化
│   ├── lesson/                # components / server / mapper / view-model
│   ├── quiz/                  # components / hooks / server / api / mapper / view-model
│   ├── review/                # components / hooks / server / api / mapper / view-model
│   └── analytics/             # 集計値の取得・ViewModel化（components / server / api / mapper / view-model）
├── components/ui/            # 汎用UI（Button / Card / Badge / ProgressBar / TermWin / Keycap 等）。デザイントークンを土台に Tailwind で実装（§8.7）
└── lib/                      # hc クライアントファクトリ / API response helper / content ローダー / env
```

- **Quiz コンポーネント**は `apps/web/src/features/quiz` に置く。`question_id[]` を受け取り 1 問ずつ回す純粋部品とし、`/quiz`（レッスン全問）・`/review`（due 問題）・`wrongOnly`（間違えonly）で供給元だけ差し替えて再利用する（7.2 の方針を実体化）。
- feature 内の通信責務は `api/`・`server/`・`hooks/` に分ける。`api/` は Hono RPC（`hc`）呼び出しの薄い wrapper、`server/` は page / Server Component から呼ぶ初回取得と ViewModel 化、`hooks/` は Client Component から呼ぶ mutation・再取得・UI state を担当する。`apps/web/src/features/*/server` 配下のファイルには `import 'server-only'` を置き、Client Component からの誤 import を防ぐ。
- `features/*/server` は「page からしか呼ばれないから app 所有」ではなく、「feature の ViewModel を作るための Server 専用 loader」として feature 所有にする。`src/app` は URL・metadata・layout・route params の受け渡しだけを担い、content/API DTO の取得、join、sort、filter、ViewModel 化は `features` に閉じ込める。例外として、複数 feature を横断して 1 ページ専用に合成するだけの処理は `app` 直下ではなく、必要になった時点で `features/<page-feature>/server` のようなページ feature として切り出す。
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

- **教材・集計系（`/`・`/learn/...`・`/domains`・`/analytics`）= RSC**。ビルド時バンドル済みデータを読む。ダッシュボードの due 件数・統計値、`/domains` の習得率、`/analytics` の各集計のような初回表示に必要な集計値は page / Server loader から `hc` で読む。教材本文ページは **API 不要**。
- **演習系（Quiz / Review）= Client Component**。イントロ・演習・結果の状態（現在の問題・採点結果・ロック）を持つため。初回データは Server loader（`/quiz` は content、`/review` は due queue）で ViewModel 化し props で渡す（§9.2）。
- **レイアウト / ヘッダー = Server**。
- 実行場所はディレクトリ名ではなく import 境界で決まる。`apps/web/src/features/*/server` は `apps/web/src/app/**/page.tsx` など Server Component から import する限りサーバー側で実行される。誤用防止のため `import 'server-only'` を必須にする。
- Server Actions は使わず、動的データは Hono API に一本化する。初回取得は page / Server loader から `hc` で実行し、mutation・再取得は Client hook から `hc` を叩く（API 契約を `apps/api` に一本化し、RPC 型を素直に効かせる）。
  - **不採用の根拠**：変更系を Hono に一本化することで ①契約（`AppType`）と `user_id` 注入点（§7.2）を単一ソースに保てる、②Hono+Cloudflare の学習目的（§2）を素通りしない。Server Actions の利点（フォームのプログレッシブエンハンスメント等）は、即時採点の Client 主導 Quiz・変更系が `POST /answers` ほぼ一択の本アプリでは恩恵が小さい。重いフォームが必要になった時点で再検討する。
- **キャッシュ方針**：`/`（due-count・統計）・`/domains`（習得率）・`/analytics`（各集計）・`/review`（queue）は動的データ。Next.js 15+ は `fetch` をデフォルトで無キャッシュにするため、`hc` 経由の `fetch` にキャッシュオプションを付けない限り、route segment config のデフォルト（`dynamic = 'auto'`）のまま自動的に動的レンダリングになる。**`export const dynamic = 'force-dynamic'` は明記しない**（`'auto'` の挙動に暗黙で依存する）。この前提が壊れるのは「`hc` の fetch 呼び出しに `cache: 'force-cache'` や `next: { revalidate }` を付けてしまった時」のみなので、feature の `api/` wrapper（§8.4）にキャッシュオプションを持ち込まないことを徹底する。`'use cache'` / `cacheTag` / `revalidateTag` も現時点では採用しない — mutation（`POST /answers`）が Hono Worker 直行で Next.js のサーバーコンテキストを経由しないため `revalidateTag` の発火点がなく、due-count はユーザー単位のためタグ設計もマルチユーザー化まで先送りする。解答後・画面復帰時の鮮度回復は Client 側の `router.refresh()` で RSC を再実行して担う（§9.2）。

### 8.4 `hc` クライアントの取り回し

- `apps/api` が `AppType` をエクスポート → `apps/web` は `hc<AppType>` で型安全クライアントを生成（既存 `apps/api/src/client.ts` のファクトリを利用。Service Binding の fetch を渡せるよう、ファクトリは `hc` の第2引数（`fetch` オプション等）を受け取れる形に拡張する）。
- `apps/web/src/lib/api.ts` に**クライアント生成を集約**し、§3.1 の接続経路に対応する 2 系統を分ける。baseURL は env（Workers バインディング / 環境変数）から解決し、ハードコードしない。
  - `createServerApiClient`：Server loader 用。本番は Service Binding（`getCloudflareContext().env.API.fetch` を `hc` のカスタム `fetch` に渡す）、ローカル開発は env の URL にフォールバック。
  - `createBrowserApiClient`：Client hook 用。env から解決した API Worker の公開 baseURL を使う。
- feature の `api/` は `hc` の path・method 呼び出しを薄く包む。server / client 両方から使うため、`server-only`・cookies・headers・秘密情報など環境専用処理を入れない。
- `res.ok` チェックと `res.json()` 変換は `apps/web/src/lib/api-response.ts` の `requestJson` に共通化する。feature の `api/` は path・method・引数・エラーメッセージだけを持つ。
- `hc` の path 呼び出し自体は文字列パスの汎用 fetch に置き換えない。`client.review.queue.$get()` のような endpoint ごとの wrapper を残すことで、Hono RPC の型推論を維持する。
- 初回表示に必要な `GET /dashboard/due-count`・`GET /review/queue` は page / Server loader から呼び、ViewModel に整形して Client Component へ props で渡す。
- ユーザー操作後の `POST /answers`・`GET /review/queue` 再取得は Client hook から呼ぶ。初回表示で不要なスピナーを出さない。

### 8.5 演習（Quiz）の状態管理

- **クライアント state のみ**（`useState` で Quiz コンポーネント内に閉じる）。MVP として最小化。画面フェーズ（`intro → exercise → result`）・現在の問題インデックス・解答結果を Client Component が保持する（§7.2）。
  - MVP フローは「イントロ確認 → 1 問表示 → 選択 → 即時採点 → ロック → 解説表示 → 次問 → 結果」で線形・シンプルなため、`useState` で充分。複雑な状態遷移が出現（例：問題セット内での再検索・フィルタ等）したら、その時点で `useReducer` へ段階的にリファクタリング。
- **リロードで進捗はリセット（許容）**。リロードすると `intro` フェーズに戻る。ただし「1 問解答＝1 `answer_log` POST」（7.2 で定義済みの原則）なので、解答そのものは即サーバーに残る。途中復帰（sessionStorage）やサーバー復元は将来拡張ポイントとして留保。
- フロー：イントロ（概要／due プレビュー）→ 1 問表示 → 即時採点（正誤＋解説）→ 選択肢ロック → 末尾に結果サマリ → 出し分け動線（`/quiz`=次のレッスンへ／`/review`=ホームへ、両者「間違えonly」提供）。

### 8.6 `packages/shared` の Zod 利用パターン

- スキーマは `packages/shared` に集約し二重定義しない（既存 `schema/content`・`db/schema`・`srs/sm2` を土台に拡張）。
- 同一スキーマを **3 経路で共有**：①content のビルド時パース検証、②API 入力の `zValidator`、③フロントの型（`z.infer`）。
- フロントは API レスポンス・content データとも `z.infer` で型を引き、DTO / Content data の独自再定義を持たない。ViewModel は表示都合の web 固有型として `apps/web/src/features` に定義する（§9.3）。

### 8.7 スタイリング（Tailwind + Dev-Native Neo Flat × Terminal デザインシステム）

ビジュアルモックアップ 5 案（Neumorphism PC/SP → Soft UI Hybrid → Dev-Native Neo Flat → Retro OS）の比較検討を経て、**「Neo Flat の骨格 × ターミナル表現のコンテンツ」** を正式なスタイル方針とする。一次モックは [`docs/mockups/DevPath Unified.html`](./mockups/DevPath%20Unified.html)（検討経緯と各案の位置づけは [`docs/mockups/README.md`](./mockups/README.md)）。旧 Neumorphism 方針（本節の旧版）は撤回済み。

**設計原則（選定理由）**：

- **装飾は情報と競合させない**。学習アプリでは認知リソースを教材理解に温存する。装飾は原則フィードバック（正誤・進捗・履歴・記憶状態）に接着させ、意味を運ばない装飾は置かない。
- **エンジニアの既存メンタルモデルを借りる**。GitHub の草・テストランナー出力・ディレクトリツリー・ターミナルプロンプトなど、対象ユーザーが即読できるフォーマットを UI 語彙として採用する（認知負荷を下げる装飾のみ許可）。
- **OS 固有の chrome は本体に持ち込まない**。mac のトラフィックライト、Win9x 風ウィンドウ等は使用しない（Retro OS 案は LP・エラーページ等の演出候補として保管）。
- **モバイルファースト**。ナビは SP＝ボトムタブ / PC＝サイドバー。タッチターゲット 44px 以上。ターミナル表現の中でも空白文字による桁揃えは禁止し、flex レイアウトで組む（SP での折り返し崩れ防止）。

**テーマ**：ダークファースト。ライトテーマへのトグルを備え、`localStorage` に永続化（初期値はダーク）。ターミナルパネル（`term-win`）の本体は両テーマとも常に黒。

**カラートークン**（CSS変数で定義し、Tailwind の `theme.extend.colors` に接続）：

  | トークン | dark | light | 用途 |
  | --- | --- | --- | --- |
  | `--bg` / `--surface` / `--well` | `#0d1117` / `#161b22` / `#1c2330` | `#f6f8fa` / `#ffffff` / `#eef1f4` | 背景 / カード / くぼみ地 |
  | `--border` | `#30363d` | `#d0d7de` | カード境界（2px。影ではなく境界線で区切る） |
  | 文字階調 `--ink` / `--ink-2` / `--mute` / `--faint` | `#e6edf3` / `#c9d1d9` / `#9198a1` / `#6e7681` | `#1f2328` / `#3d444d` / `#59636e` / `#818b98` | 見出し / 本文 / 補助 / 最弱 |
  | `--green` | `#3fb950` | `#2da44e` | 正解・done・成長・主 CTA |
  | `--red` | `#f85149` | `#cf222e` | 誤答・due・失敗 |
  | `--blue` | `#58a6ff` | `#0969da` | アクセント・進行中・ナビ選択・リンク |
  | `--purple` | `#bc8cff` | `#8250df` | XP・メタ情報 |
  | `--yellow` / `--orange` | `#e3b341` / `#f0883e` | `#9a6700` / `#bc4c00` | 実績 / ストリーク・警告 |
  | heatmap 5段階 | `#1c2330`→`#39d353` | `#ebedf0`→`#216e39` | 学習コントリビューション（草） |

  セマンティックカラーはシンタックスハイライトのパレットに揃える（VS Code / GitHub トークンカラー系）。各色に `-bg` の淡色（例 `--green-bg`）を持ち、正誤状態の塗りに使う。コントラストは WCAG AA を基準とする。

**コンポーネント文法**（`globals.css` の `@layer components` ＋ `components/ui` に集約）：

- `card`：`surface` ＋ 2px `border` ＋ 16px radius のフラットカード。
- チャンキーボタン（`btn-green` / `btn-blue` / `btn-ghost`）：ベタ塗り＋下エッジ（`box-shadow: 0 4px 0 <shade>`）、`:active` で 4px 沈む。green＝主アクション、ghost＝副アクション。
- `term-win`：ターミナルウィンドウ。ヘッダーは **`>_` プロンプトバッジ＋mono タイトル＋右端メタ情報**（例 `80×24`・`exit 0`・`utf-8 · tsx`）。教材のコードブロック、演習結果のテストレポート、スキルツリーで使用。
- `keycap`：問題 ID・選択肢番号のキーキャップ表現。
- ツリー行：スキルツリーは `devpath tree` コマンド出力風のディレクトリツリー（罫線文字 `├─ └─`）。各行は button（min-height 44px）、done＝緑✓ / current＝青▶＋ブロックバー＋START / locked＝減光🔒。
- ターミナルパンくず：各画面の先頭に `~/devpath $ <コマンド>`（緑プロンプト＋点滅カーソル）。
- Win9x 風の離散ブロックバー・ベベルは**使用しない**（Retro OS 案の残骸を持ち込まない）。

**タイポグラフィ**：UI・本文は **Inter**（400–900）、データ・ID・ツリー・ターミナル・パンくずは **JetBrains Mono**。数値は `font-variant-numeric: tabular-nums`。

**モーション**：stagger エントランス（reveal）、数値カウントアップ、バー伸長、正解バウンス／誤答シェイク、コンボポップ、全問正解時の confetti。すべて `prefers-reduced-motion` で無効化する。

**アクセシビリティ**：全操作要素に `:focus-visible` リング、演習はキーボード操作（1–4 で選択 / Enter で次へ）対応、タッチターゲット 44px 以上。

**ゲーミフィケーション表現の実装区分**：

- **MVP 実装対象**：学習コントリビューション（草。`answer_logs` の日次集計から導出）、テストランナー風の結果表示、ターミナルパンくず、ディレクトリツリー型スキルツリー、コンボ演出（**クライアント状態のみ・永続化しない**）。
- **スコープ外（§1 準拠・将来）**：XP / レベル / 実績バッジ / デイリークエスト。モックでは演出として表示しているが、データモデル追加（§4）が必要なため公開機能の検討時に併せて設計する。UI 上は該当要素を出さない（またはプレースホルダ非活性）。

- **Tailwind CSS を導入**し、スタイルを Tailwind に寄せる。現状の scaffold 残骸（`*.module.css`、`*.disabled` ファイル群）は**撤去対象**として整理する。共通スタイルは `components/ui`（Card・Button・Badge・ProgressBar・TermWin・Keycap・Tree 等）に集約し、ページ側はユーティリティクラスで組む。

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
- page は loader を呼ぶだけに留める。`params` の取り出し、`metadata`、`notFound()` など App Router 固有の関心事は page 側に残し、feature のデータ形成や ViewModel 化は `features/*/server` に置く。
- エラーは throw → `error.tsx`・`Suspense` で処理。

#### Client 系（演習・復習系）

`/quiz/[lesson]`・`/review` などインタラクションを持つページ。**初回データは Server loader で ViewModel 化し、page はその VM を props で渡すだけに留める。Client Component は props の VM をそのまま描画に使い、ローカル state は「画面フェーズ（intro/exercise/result）」「解答結果」「送信エラー」だけに限定する**（＝初回レンダリング時にスピナーを出さない。VM 自体を state に複製しない）。

- `/quiz`：content から問題・解説を解決し、API GET はしない。Client hook は `POST /answers` のみ担当。VM は content のみで再取得不要なため、`useState(initialViewModel)` に据えてよい。
- `/review`：Server loader で `GET /review/queue` を呼び、返却された `question_id` を content の問題本文・解説へ join して VM 化する。**join は Server loader 内でのみ行い、content データ（教材本文・解説）をクライアントバンドルに含めない**。解答完了後に次の due を引き直す場面では、Client から API を再度叩いて join し直すのではなく `router.refresh()` で Server Component を再実行し、Server loader が新しい VM を props として渡し直す（§8.3 のキャッシュ方針）。

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
  return reviewQueueDTOToViewModel(dto, getBundledQuestions());  // join はサーバー側のみ
}

// app/review/page.tsx（Server）— 無キャッシュ fetch により auto のまま動的レンダリング。再取得は router.refresh() に委譲
export default async function ReviewPage() {
  const viewModel = await loadReviewQueue();  // API queue + content join 済み VM
  return <ReviewRunner viewModel={viewModel} />;
}

// features/review/hooks/use-answer-submit.ts（Client）— VM は保持しない。mutation のみ担当
'use client';
export function useAnswerSubmit() {
  const [results, setResults] = useState<Record<string, AnswerResult>>({});
  const [error, setError] = useState<Error | null>(null);

  const submitAnswer = useCallback(async (questionId: string, selectedIndex: number) => {
    try {
      const result = await postAnswer(createBrowserApiClient(), { questionId, selectedIndex });
      setResults(prev => ({ ...prev, [questionId]: result }));
    } catch (e) {
      setError(e as Error);
    }
  }, []);

  return { results, error, submitAnswer };
}

// features/review/components/review-runner.tsx（Client）
'use client';
export function ReviewRunner({ viewModel }: Props) {
  const router = useRouter();
  const { results, error, submitAnswer } = useAnswerSubmit();

  const handleAllAnswered = () => {
    router.refresh();  // Server loader を再実行し、次の due queue を VM ごと props で受け直す
  };

  if (error) return <ErrorDisplay error={error} retry={() => router.refresh()} />;
  return (
    <QuizRenderer
      viewModel={viewModel}       // props をそのまま描画に使う。state に複製しない
      results={results}
      onAnswer={submitAnswer}
      onComplete={handleAllAnswered}
    />
  );
}
```

- **初回＝Server loader で VM 化し、page は props 渡しのみ**。`/quiz` は content のみ、`/review` は API queue + content join。loader は毎回同じ mapper を通すため、整形ロジックは一本のまま（§9.1 の原則）。
- **VM はクライアント state に複製しない**。`ReviewRunner` は props の `viewModel` をそのまま描画に使い、Client 側で保持するのは「解答結果（`results`）」「送信エラー」のみ。due queue の再取得は `router.refresh()` による Server Component 再実行に一本化し、content との join を常にサーバー側に閉じ込める（クライアントバンドルへの content 混入を防ぐ）。
- **RPC 呼び出しは `apps/web/src/features/*/api` の薄い wrapper 経由**。Server loader と Client hook は同じ wrapper を使い、実行環境ごとの client 生成だけを差し替える。HTTP レスポンス処理は `requestJson` に寄せ、feature 側では重複させない。
- **初回スピナー不要**（本節冒頭で述べた原則の実装上の帰結）：ウォーターフォールを回避し初回表示が速い。`router.refresh()` 中の待機表示が必要なら `loading.tsx` かローカルな `isRefreshing` フラグで扱う。
- **将来：**TanStack Query 等へ置き換える際、mapper・ViewModel 型・page は変わらず、hook（`useAnswerSubmit` 相当）内部だけ差し替わる（契約保証）。

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

`apps/api` は D1 / Drizzle に直接触るため、`dal/` を置く。Hono route は HTTP 契約、service はユースケース、dal は永続化アクセスに責務を分ける。具体的なディレクトリ構成・各層の責務・コード例は **第10章（バックエンドアーキテクチャ）** で確定する。

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

`/quiz` は問題自体がビルド時バンドル（§8.2）なので初回 GET は不要。Server loader で VM を組み立て、page は props で渡し、Client は解答（`POST /answers`）だけを担当する。

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

// features/quiz/server/load-quiz.ts
import 'server-only';

export function loadQuiz(lessonId: string): QuizViewModel {
  const content = getLessonContent(lessonId);   // ビルド時バンドル
  return quizContentToViewModel(content);
}

// app/quiz/[lesson]/page.tsx（Server）— page は loader を呼んで props 渡し
export default function QuizPage({ params }: Props) {
  const initialVm = loadQuiz(params.lesson);
  return <QuizInteractive initialViewModel={initialVm} />;
}

// features/quiz/components/quiz-interactive.tsx（Client）
'use client';
export function QuizInteractive({ initialViewModel }: Props) {
  const [vm] = useState(initialViewModel);              // 初回から即描画（スピナーなし）
  const [currentIndex, setCurrentIndex] = useState(0);  // §8.5：1問ずつ表示する線形フロー
  const { submitAnswer, results } = useAnswerSubmit();  // POST /answers を担当

  const question = vm.questions[currentIndex];
  if (!question) return <QuizSummary results={results} />;  // 全問終了 → 結果サマリ（§7.2）

  const isLast = currentIndex === vm.questions.length - 1;

  return (
    <QuestionCard
      question={question}
      explanation={vm.explanations[question.id]}
      onAnswer={selectedIndex => submitAnswer(question.id, selectedIndex)}
      result={results[question.id]}                 // 判定結果を受けて選択肢ロック・解説表示（§8.5）
      onNext={isLast ? undefined : () => setCurrentIndex(i => i + 1)}
    />
  );
}
```

- `/quiz` の初回は **API GET なし**（問題はビルド時バンドル、Server loader で VM 化）。Client hook は `POST /answers`（mutation）だけを持つ。
- `QuizInteractive` は全問を一括レンダリングせず、`currentIndex` で 1 問ずつ描画する（§8.5 のフローと整合）。`/review` の `ReviewRunner`（§9.2）も同じ `QuestionCard` を 1 問ずつ回す構成にする。
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

初回データは Server loader で VM 化済みのため（9.2 参照）、**初回にローディング表示は出ない**。Client 側で扱うのは以下の 2 つ：

- **初回データ形成の失敗**：content 未検出・検証失敗、または `/review` の初回 queue 取得失敗 → ルートの `error.tsx` で捕捉（Server 系と同じ経路）。
- **再取得・mutation の失敗/待機**：hook が返す `error`・（再取得中の）状態を component で出し分ける。

```typescript
// features/review/components/review-runner.tsx
'use client';
export function ReviewRunner({ viewModel }: Props) {
  const router = useRouter();
  const { results, error, submitAnswer } = useAnswerSubmit();

  // 初回は props で描画済み。ここで扱うのは解答送信エラーのみ
  if (error) return <ErrorDisplay error={error} retry={() => router.refresh()} />;

  return <QuizRenderer viewModel={viewModel} results={results} onAnswer={submitAnswer} />;  // 初回からスピナーなしで描画
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

### 9.8 フロントエンドのテスト戦略

フロントエンドは、見た目を探索する UI 実装と、入出力が明確なロジックでテストファーストの効果が異なるため、**実装先行と TDD を使い分ける**。

| 対象 | 開発・検証方法 |
| --- | --- |
| UI・スタイル・単純な presentational component | モックアップと本章の仕様に沿って実装し、ブラウザで表示・レスポンシブ・操作を確認してから、重要な振る舞いだけをテストする |
| mapper・ViewModel・小さい純粋変換 | テストファースト。content/API DTO の join・sort・filter、欠損値・境界値、クライアントへ渡してよいデータ境界を検証する |
| hook・reducer・状態遷移 | テストファースト。Quiz/Review の `intro → exercise → result`、問題送り、最終問題、選択肢ロック、スコア集計、`wrongOnly`、二重送信防止、エラー・再試行を検証する |
| Server loader | 単純な委譲は詳細にテストせず、複数データの join・sort・filter・ViewModel 化を担う場合に検証する |
| API wrapper | 薄い RPC 呼び出しを重複してテストせず、独自の呼び出し条件・エラー変換がある場合だけ検証する |
| ページ統合・Walking Skeleton | ユーザーが観測できる主要フローを少数の統合テストまたはブラウザ確認で貫通させる |

- Tailwind のクラス名や内部 DOM 構造を固定するだけの壊れやすいテストは避け、role・label・表示文言・操作結果など、ユーザーが観測できる振る舞いを検証する。
- バグ修正は、自動テストで安定して再現できる場合、失敗する回帰テストを先に追加してから修正する。CSS・ブラウザ固有の表示崩れは、ブラウザまたはスクリーンショットで修正前後を確認する。
- Walking Skeleton では「教材表示 → 問題へ遷移 → 解答 → 即時採点 → 結果表示」を貫通確認する。細かなコンポーネント単体テストを増やすより、この主要フローと mapper・状態遷移のテストを優先する。

### 9.9 → 第10章へ

本章でフロントエンドのデータフロー（Content data / API DTO → Mapper → ViewModel → page）を確定した。API 側（`apps/api`）の内部構造（How）は **第10章** で確定する。その後の実装フェーズでは、Walking Skeleton（`セキュリティ > XSS > 教材1本 + 4択3問`、第6章）を第8〜10章の設計に沿って縦に 1 本貫通させる。

## 10. バックエンドアーキテクチャ（How）

第7.3章で API の契約（What）を定義した。本章は `apps/api`（Hono / Cloudflare Workers）の内部をどう構造化して実装するか（How）を確定する。設計哲学は本書全体と同じ：**`packages/shared` を単一ソース**・**純粋ロジックと副作用の分離**・**Workers 制約を前提**。

バックエンドアーキテクチャのフロー図と各層の責務は、補助資料として [`docs/backend-architecture.html`](./backend-architecture.html) に整理する。本章を一次ソースとし、補助資料は実装時に参照しやすい形へ再構成したものとする。

### 10.1 全体方針：軽量レイヤードアーキテクチャ

**route → service → dal の 3 層**に分ける（§9.3 で予告した構成の確定）。依存方向は一方向のみ：`routes → services → dal →（D1）`。逆方向の import は禁止。`packages/shared` はどの層からも参照してよい。

| 層 | 責務 | 依存してよいもの |
| --- | --- | --- |
| **route**（`routes/`） | HTTP 契約。パス・メソッド・`zValidator` による入力検証・ステータスコード・レスポンス整形。ビジネスロジックを書かない | Hono / service / dal（deps 生成のみ） |
| **service**（`services/`） | ユースケース。「採点 → 記録 → SRS 更新」のような業務手順の一連。**Hono・D1・Drizzle の型に依存しない純 TS** | shared（`sm2` 等）/ 自身が定義する deps 型 |
| **dal**（`dal/`） | 永続化アクセス。Drizzle クエリの置き場。SQL 的関心事（upsert・batch）をここに閉じ込める | Drizzle / shared の db schema |

**採用しないもの（過剰設計の回避）**：

- DI コンテナ・デコレータ注入 → **関数引数による明示的な依存渡し**で足りる
- クリーンアーキテクチャ流の ports/adapters ディレクトリ分離 → 「service が deps 型（interface）を定義し、dal がそれを実装する」という import 方向ルールだけで同じ効果を得る
- OpenAPI スキーマ生成 → `hc`（`AppType`）が型契約を担うため不要（§8.4）

**スコープの段階性**：本章のコード例・ディレクトリ構成は Walking Skeleton 中核の 3 エンドポイント（§7.3 の `POST /answers`・`GET /review/queue`・`GET /dashboard/due-count`）を基準に確定する。§7.3 が挙げる残りのエンドポイント（`GET /domains`・`GET /analytics/*`・`GET /activity/recent`）は Walking Skeleton 貫通後に**同じ route → service → dal パターンで追加**する（§6 の「同じパターンの繰り返しで増やす」方針）。数エンドポイントの規模で抽象を増やすと、AI 駆動開発のレビュー可能性がむしろ下がる。層の責務と依存方向が守られていれば十分とする。

### 10.2 ディレクトリ構成

```
apps/api/
├── src/
│   ├── index.ts                 # エントリ。middleware 適用・ルート合成・AppType エクスポート
│   ├── client.ts                # hc クライアントファクトリ（既存）
│   ├── env.ts                   # Bindings（D1 / vars）・Variables（userId）の型定義
│   ├── middleware/
│   │   └── user-context.ts      # 固定 user_id の権威的注入（§7.2。将来は認証実装に差し替え）
│   ├── routes/
│   │   ├── answers.ts           # POST /answers
│   │   ├── review.ts            # GET /review/queue
│   │   └── dashboard.ts         # GET /dashboard/due-count
│   ├── services/
│   │   ├── answer-service.ts    # 採点 → 記録 → SRS 更新のユースケース
│   │   ├── review-service.ts    # due 問題の収集・件数集計
│   │   └── errors.ts            # ドメインエラー（QuestionNotFoundError 等）
│   └── dal/
│       ├── answer-repository.ts # AnswerDeps 実装（questions 照合・srs 取得・batch 書き込み）
│       └── review-repository.ts # ReviewDeps 実装（due queue・due count）
└── scripts/
    └── sync-content.ts          # content/ → D1 seed/upsert（§10.8）
```

- 上記は Walking Skeleton 中核 3 エンドポイントの構成（§10.1）。§7.3 の後続エンドポイントは同じ 3 層パターンで追加する：`routes/domains.ts`・`routes/analytics.ts`・`routes/activity.ts`、対応する `services/*-service.ts` と `dal/*-repository.ts`、`index.ts` への `.route()` 追記。アナリティクスは集計クエリ主体（読み取りのみ）のため service 層は薄くなる見込み。
- **dal はテーブル単位ではなくユースケース単位**で置く。「service が要求する deps 型」を 1 ファイルで実装する形にすると、service ⇔ dal の対応が 1:1 で追いやすく、テーブル単位 repository の細切れ合成（と、それを束ねる工数）を避けられる。テーブル単位の共有が必要になった時点で分割する。

### 10.3 リクエストの流れ（`POST /answers` を例に）

Walking Skeleton の中核となる 1 リクエストの処理フロー：

```
zValidator（shared の answerRequestSchema で入力検証）
  → userId を context から取得（§10.4 の middleware が注入済み）
  → services/answer-service の submitAnswer(deps, input)
      1. questions（content 同期キャッシュ §4.4）から answerIndex を取得
         → 無ければ QuestionNotFoundError
      2. isCorrect = answerIndex === selectedIndex（採点権威は API §7.2）
      3. 現在の srs_state を取得（無ければ initialSrs()）
      4. reviewSrs(state, isCorrect, now) で次状態を算出（純粋関数 @tsl/shared）
      5. answer_log 挿入 ＋ srs_state upsert を db.batch で原子的に書き込み
  → { isCorrect, correctIndex } を JSON で返す
```

```typescript
// services/answer-service.ts — Hono・D1・Drizzle に依存しない純 TS
import { initialSrs, reviewSrs, type SrsInput, type SrsResult } from '@tsl/shared'
import { QuestionNotFoundError } from './errors'

// service が要求する依存（deps）。フラットな関数の束にし、テストでは素朴な fake で差し替える
export type AnswerDeps = {
  findAnswerIndex(questionId: string): Promise<number | null>
  findSrsState(userId: string, questionId: string): Promise<SrsInput | null>
  recordAnswer(params: {
    userId: string
    questionId: string
    isCorrect: boolean
    answeredAt: number
    nextSrs: SrsResult
  }): Promise<void>
}

export type SubmitAnswerInput = {
  userId: string
  questionId: string
  selectedIndex: number
  now: number  // 時刻は service 内で取得せず引数注入（sm2 と同じ設計。テストで固定できる）
}

export async function submitAnswer(deps: AnswerDeps, input: SubmitAnswerInput) {
  const answerIndex = await deps.findAnswerIndex(input.questionId)
  if (answerIndex === null) throw new QuestionNotFoundError(input.questionId)

  const isCorrect = answerIndex === input.selectedIndex
  const current =
    (await deps.findSrsState(input.userId, input.questionId)) ?? initialSrs()
  const nextSrs = reviewSrs(current, isCorrect, input.now)

  await deps.recordAnswer({
    userId: input.userId,
    questionId: input.questionId,
    isCorrect,
    answeredAt: input.now,
    nextSrs,
  })

  return { isCorrect, correctIndex: answerIndex }
}
```

```typescript
// routes/answers.ts — HTTP 契約のみ。ロジックは service へ委譲
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { drizzle } from 'drizzle-orm/d1'
import { answerRequestSchema, type AnswerResponse } from '@tsl/shared'
import type { AppEnv } from '../env'
import { createAnswerDeps } from '../dal/answer-repository'
import { submitAnswer } from '../services/answer-service'

export const answersRoute = new Hono<AppEnv>().post(
  '/',
  zValidator('json', answerRequestSchema),
  async (c) => {
    const { questionId, selectedIndex } = c.req.valid('json')
    const result = await submitAnswer(createAnswerDeps(drizzle(c.env.DB)), {
      userId: c.get('userId'),
      questionId,
      selectedIndex,
      now: Date.now(),
    })
    return c.json(result satisfies AnswerResponse)
  },
)
```

```typescript
// dal/answer-repository.ts — Drizzle・db.batch をここに閉じ込める
import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { db as schema } from '@tsl/shared'
import type { AnswerDeps } from '../services/answer-service'

export function createAnswerDeps(db: DrizzleD1Database): AnswerDeps {
  return {
    async findAnswerIndex(questionId) { /* questions を select */ },
    async findSrsState(userId, questionId) { /* srs_states を select */ },
    async recordAnswer(p) {
      await db.batch([
        db.insert(schema.answerLogs).values({ id: crypto.randomUUID(), /* ... */ }),
        db.insert(schema.srsStates).values({ /* ... */ }).onConflictDoUpdate({
          target: [schema.srsStates.userId, schema.srsStates.questionId],
          set: { /* nextSrs の各値 */ },
        }),
      ])
    },
  }
}
```

`GET /review/queue`・`GET /dashboard/due-count` も同型（route → `review-service` → `review-repository`）。due 判定は `dueAt <= now` を SQL の where 句で行い、`isDue`（sm2）と意味を一致させる。

### 10.4 user_id の権威的注入（middleware）

§7.2 の「API が固定 `user_id` を権威的に注入する」を Hono middleware として実体化する。

```typescript
// middleware/user-context.ts
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../env'

const FIXED_USER_ID = 'user-local-001'

// 将来公開時は、この middleware を「認証情報から userId を解決する実装」に
// 差し替えるだけ。route・service・API 契約は不変（§7.2）
export const userContext = createMiddleware<AppEnv>(async (c, next) => {
  c.set('userId', FIXED_USER_ID)
  await next()
})
```

- route・service は `userId` を「middleware が保証済みの値」として受け取るだけにし、固定値の知識を `user-context.ts` の 1 箇所に閉じ込める。
- クライアントから送られた `user_id` は**一切信用しない**（リクエストボディにも含めない。§7.3 の契約に `userId` が無いのはこのため）。

### 10.5 Hono アプリの合成と `AppType`

```typescript
// env.ts
export type Bindings = {
  DB: D1Database
  WEB_ORIGIN: string  // CORS 許可オリジン（wrangler.toml の vars で環境ごとに設定）
}
export type Variables = {
  userId: string
}
export type AppEnv = { Bindings: Bindings; Variables: Variables }
```

```typescript
// index.ts — middleware 適用・ルート合成・AppType エクスポート
const app = new Hono<AppEnv>()

// CORS はブラウザ経路（§3.1）用。Service Binding 経由の呼び出しには関与しない。
// 許可オリジンは env から解決するため、ハンドラ内で cors() を生成して適用する
app.use('*', async (c, next) => cors({ origin: c.env.WEB_ORIGIN })(c, next))
app.use('*', userContext)
app.onError(errorHandler)  // §10.6

const routes = app
  .get('/health', (c) => c.json({ status: 'ok' as const }))
  .route('/answers', answersRoute)
  .route('/review', reviewRoute)
  .route('/dashboard', dashboardRoute)

export type AppType = typeof routes
export default app
```

- **`hc` の型推論を保つため、ルート定義はメソッドチェーンで書く**。各サブルーターは `new Hono<AppEnv>().post(...)` のチェーンで定義・export し、`index.ts` では `.route()` のチェーンで合成する。チェーンを分断（`app.post(...)` を文として並べる等）すると `AppType` からエンドポイント型が消える。
- パス設計は §7.3 の契約（`POST /answers`・`GET /review/queue`・`GET /dashboard/due-count`）をそのまま `.route()` のプレフィックス＋サブルーター内パスで構成する。後続の `GET /domains`・`GET /analytics/*`・`GET /activity/recent`（§10.1）も同じ要領で `.route('/domains', ...)` 等をチェーンに追記する。

### 10.6 バリデーション・DTO・エラー処理

**入出力スキーマは `packages/shared/src/schema/api.ts` に新設**する（§9.3 で予告済み）。同一スキーマを「API 入力の `zValidator`」「route 返り値の契約固定（`satisfies`）」「フロントの型（`z.infer`）」の 3 経路で共有する（§8.6 と同じパターン）。

```typescript
// packages/shared/src/schema/api.ts（抜粋）
export const answerRequestSchema = z.object({
  questionId: z.string().min(1),
  selectedIndex: z.number().int().min(0).max(5),  // choices は最大6（schema/content と整合）
})
export type AnswerRequest = z.infer<typeof answerRequestSchema>

export const answerResponseSchema = z.object({
  isCorrect: z.boolean(),
  correctIndex: z.number().int().min(0).max(5),  // choices は最大6（schema/content と整合）
})
export type AnswerResponse = z.infer<typeof answerResponseSchema>

export const reviewQueueResponseSchema = z.object({
  items: z.array(z.object({ questionId: z.string().min(1), dueAt: z.number().int() })).max(20),  // dueAt は Unixエポックミリ秒
})
export const dueCountResponseSchema = z.object({
  dueCount: z.number().int().nonnegative(),
})
```

- `POST /answers` の入力は任意の反応時間を含める：`answerRequestSchema` に `responseTimeMs: z.number().int().nonnegative().optional()` を追加する（§7.3・§4.4。アナリティクスの平均反応時間用。未送信でも採点は成立する）。
- 後続エンドポイント（§10.1）のレスポンススキーマ（`domainsResponseSchema`・`analyticsSummaryResponseSchema`・`analyticsWeeklyResponseSchema`・`mistakesResponseSchema`・`recentActivityResponseSchema`）も同じ `api.ts` に同じパターンで追加する。

**エラー処理の方針**：

- service は **HTTP を知らないドメインエラー**（`services/errors.ts` の `QuestionNotFoundError` 等）を throw する。
- route 層の `app.onError` がドメインエラーを HTTP ステータスへ写像し、レスポンス形を `{ error: { code, message } }` に統一する。未知のエラーは 500（`INTERNAL`）とし、詳細メッセージを外に漏らさない。

```typescript
// index.ts（抜粋）
app.onError((err, c) => {
  if (err instanceof QuestionNotFoundError) {
    return c.json({ error: { code: 'QUESTION_NOT_FOUND', message: err.message } }, 404)
  }
  console.error(err)  // Workers Logs で観測
  return c.json({ error: { code: 'INTERNAL', message: 'Internal Server Error' } }, 500)
})
```

- `zValidator` の検証失敗（400）はデフォルト挙動のまま使う（MVP）。フロントは `requestJson`（§8.4）が `res.ok` で弾くため、エラーボディの形に依存しない。

### 10.7 D1 の整合性と書き込み

- **D1 は対話型トランザクション（`BEGIN`〜`COMMIT` を複数往復で跨ぐ形）をサポートしない**。複数文の原子的書き込みは `db.batch([...])` を使う。`POST /answers` の「`answer_log` 挿入＋`srs_state` upsert」は必ず 1 batch にまとめる（片方だけ書けた状態を作らない）。
- 「読み（現 SRS 状態）→ 計算 → 書き」の間に別リクエストが割り込む競合は、単一ユーザー MVP では許容する（同一問題への同時解答は実運用上起きない）。将来マルチユーザー化しても user 単位で直列なら問題にならない。
- `srs_states` は `(user_id, question_id)` の**複合主キー**とし、upsert は `onConflictDoUpdate` で書く。
- Drizzle インスタンスは route ハンドラ内で `drizzle(c.env.DB)` を生成して dal へ渡す（リクエストスコープ。グローバルに保持しない）。

### 10.8 content → D1 同期スクリプト

§4.2 の seed/upsert を `apps/api/scripts/sync-content.ts`（`pnpm --filter @tsl/api content:sync`）として実装する。

- **パース経路は §8.2 と共有**：`gray-matter` でパースし `packages/shared` の content Zod（`validatedMcqSchema` 含む）で検証する。フロントのビルド時バンドルと同じ検証を通った内容だけが D1 に入る。
- 同期対象は `questions` テーブルの**最小フィールドのみ**（`question_id`, `answer_index`。§4.4）。本文・選択肢・解説は D1 に入れない。
- 検証済みデータから upsert SQL（`INSERT ... ON CONFLICT(question_id) DO UPDATE`）を生成し、`wrangler d1 execute`（ローカルは `--local`、本番は `--remote`）で流す。**冪等**（何度実行しても同じ結果）にする。
- 固定ユーザー行（`users`）の seed も同スクリプトで行う（`user-context.ts` の `FIXED_USER_ID` と同じ値）。
- content から削除された問題は**物理削除しない**（`answer_logs`・`srs_states` が参照するため）。出題対象からは自然に外れる（フロントのバンドルに含まれず、due queue の join でも解決されない）。整理が必要になったら論理削除フラグを検討する。
- 実行タイミング：ローカル開発では手動、本番はデプロイフロー（CI）に組み込む。

### 10.9 テスト戦略

§5 のガードレール方針を API の各層に割り当てる。

| 対象 | 方法 | ランタイム |
| --- | --- | --- |
| SRS（`sm2`） | 純粋関数の単体テスト（**実装済み**） | Node |
| service | deps をインメモリ fake に差し替えた単体テスト。採点の正誤・SRS 遷移の呼び出し・エラー系（問題未存在）を重点 | Node |
| route + dal | `@cloudflare/vitest-pool-workers`（ローカル D1 に対する実クエリ）で happy path を最低 1 本（`POST /answers` の貫通） | workerd |

- service の deps を「フラットな関数の束」（§10.3）にしているのはこのため。fake は素朴なオブジェクトリテラルで書け、モックライブラリを要しない。

```typescript
// services/answer-service.test.ts（fake deps の例）
const recorded: unknown[] = []
const deps: AnswerDeps = {
  findAnswerIndex: async () => 2,
  findSrsState: async () => null,
  recordAnswer: async (p) => { recorded.push(p) },
}
const result = await submitAnswer(deps, {
  userId: 'u1', questionId: 'q1', selectedIndex: 2, now: 0,
})
// → result.isCorrect === true、recorded[0].nextSrs.reps === 1 などを検証
```

### 10.10 既存コードとの差分（本章から発生する実装タスク）

- `packages/shared/src/db/schema.ts`：`questions` テーブル（§4.4 の content 同期キャッシュ）を追加。`srs_states` に複合主キー `(user_id, question_id)` を追加。`answer_logs` に `response_time_ms`（任意列）を追加。`lesson_views` テーブル（§4.4。アナリティクス用）を追加
- `packages/shared/src/schema/api.ts`：新設（§10.6）。Walking Skeleton 分（answer / reviewQueue / dueCount）を先行し、`responseTimeMs` 任意入力と後続エンドポイントのレスポンススキーマは各画面の実装時に追加
- `apps/api/wrangler.toml`：`name` を `tech-study-lab-api` へ変更（web Worker と区別する。§3.1 の Service Binding が参照する `service` 名になる）。`vars` に `WEB_ORIGIN` を追加
- `apps/api/src/`：`env.ts` / `middleware/` / `routes/` / `services/` / `dal/` を §10.2 の構成で新設し、`index.ts` をルート合成形へ書き換え。`/domains`・`/analytics/*`・`/activity/recent` 用の route/service/dal は Walking Skeleton 貫通後に同パターンで追加（§10.1）
- `apps/api/scripts/sync-content.ts`：新設（§10.8。package.json の `content:sync` は定義済み）

### 10.11 将来拡張ポイント

- **認証**：`user-context.ts` の差し替えのみ（§10.4）。API 契約・層構造は不変
- **バッチ処理**（due 通知・統計集計等）：`apps/api` の wrangler 設定に Cron Triggers を追加する。web と Worker を分離した §3.1 の利点がここで効く
- **記述式・コード問題**（§4.3）：shared の `questionSchema`（discriminated union）に type を追加 → `answer-service` の採点分岐を追加。route の契約は `question.type` に応じたリクエストスキーマ拡張で対応

## 11. コンテンツ規約

`content/` 配下の物理的な決め事。第4章のデータモデル（論理）を、ファイルシステム上の規約（物理）に落とす。**教材を 1 本書く前に確定しておくべき事項**をここに集約する。

### 11.1 ファイル配置

```
content/
├── security/                   # domain（domainKeySchema のキーと一致）
│   └── xss/                    # topic（トピックキー）
│       ├── index.md            # トピックのメタ情報＋概要文
│       └── security-xss-01.md  # レッスン（ファイル名 = lessonId）
```

- ディレクトリ階層は §4.1 のコンテンツ階層（domain > topic > lesson）をそのまま写す。
- **ファイル名 = lessonId**。frontmatter の `domain` / `topic` はディレクトリパスと一致していなければならない。
- パス⇔frontmatter⇔ID の整合は、ビルド時パース（§8.2）と `content:sync`（§10.8）の**両方で検証し、不一致はビルド失敗**にする。AI が教材を追加・改訂する際のガードレール（§5）として機能させる。

### 11.2 ID 命名規則

| ID | 形式 | 例 |
| --- | --- | --- |
| lessonId | `<domain>-<topic>-<連番2桁>` | `security-xss-01` |
| questionId | `<lessonId>-q<連番>` | `security-xss-01-q1` |

- 使用文字は小文字英数とハイフンのみ（`^[a-z0-9-]+$`）。
- **一度 `answer_logs` / `srs_states` に記録された ID は変更しない（不変）**。ID を変えると学習履歴・SRS 状態が切れる。
- 誤字修正・解説の改善など**意味が変わらない改訂は同一 ID のまま**行う。問題の意味が変わる改訂は**新しい questionId で追加**し、旧問題は content から削除する（D1 側は物理削除しない。§10.8）。
- トピック内のレッスン並び順は lessonId の連番で決める（別途 `order` フィールドは持たない。並び替えが必要になった時点で追加を検討）。

### 11.3 表示名（ラベル）の持ち場所

キー（`security` / `xss`）は識別子であり、画面表示用の日本語ラベルとは分離する。

| 対象 | 持ち場所 | 理由 |
| --- | --- | --- |
| domain のラベル・並び順 | `packages/shared` の定数マップ（`DOMAIN_LABELS: Record<DomainKey, { label, order }>`） | 4 領域で固定（Zod enum と同じ場所で単一ソース化） |
| topic のラベル・並び順・概要文 | `content/<domain>/<topic>/index.md`（frontmatter: `{ topic, title, order }`、本文: 概要文） | コンテンツと一緒に増えるため content 側で管理。概要文はレッスン一覧ページの説明に使う |
| lesson のタイトル | レッスン frontmatter の `title`（既存どおり） | — |

`DOMAIN_LABELS` の確定値（`order` は表示順で 1 始まり。`domainKeySchema` の enum 宣言順・§1 の学習領域の並びと一致させる）:

| domain | label | order |
| --- | --- | --- |
| `security` | セキュリティ | 1 |
| `frontend` | フロントエンド | 2 |
| `backend` | バックエンド | 3 |
| `architecture` | アーキテクチャ | 4 |

topic frontmatter の `order` も同様に表示順（0 以上の整数、小さいほど先）とする。

### 11.4 実装タスク

- `packages/shared/src/schema/content.ts`：topic index 用の Zod（`topicFrontmatterSchema`）と、lessonId / questionId の形式検証（regex・`questionId` が `lessonId` を接頭辞に持つこと）を追加
- `packages/shared`：`DOMAIN_LABELS` を追加
- ビルド時パース（§8.2）と `content:sync`（§10.8）：パス⇔frontmatter⇔ID の整合検証を実装

### 11.5 レッスンあたりの問題数

- 本番の教材は **1 レッスンあたり 5〜7 問を目安**とする。定義・原因・具体例・対策・落とし穴など、トピックの主要な観点を一通りカバーしつつ、AI が 1 レッスンを書く際の執筆・レビュー負荷が過大にならない範囲として設定する。
- **第6章 Walking Skeleton の「4択3問」は例外**：スタック全体（教材表示 → 採点 → SRS）の疎通確認が目的の最小構成であり、本番教材の目安ではない。Walking Skeleton 貫通後に追加する実際のレッスンは本節の 5〜7 問を基準にする。
- 5〜7 問は初期の目安であり固定値ではない。トピックの複雑さに応じて増減してよい。

## 12. 環境・デプロイ

### 12.1 環境定義

**local / production の 2 環境のみ**。preview 環境（PR ごとのデプロイ等）は将来検討とする。

### 12.2 環境変数・バインディング一覧

§3.1 / §8.4 / §10.5 に散在していた設定値の単一の一覧。**設定値をコードにハードコードしない**（§8.4）。

| 名前 | 種別 | 参照箇所 | local | production |
| --- | --- | --- | --- | --- |
| `DB` | D1 バインディング（api） | dal（Drizzle） | `wrangler dev` のローカル D1 | `apps/api/wrangler.toml` の `d1_databases`（要実 ID。§12.4） |
| `WEB_ORIGIN` | var（api） | CORS 許可オリジン（§10.5） | `http://localhost:3000` | web Worker の公開 URL |
| `API` | Service Binding（web） | Server loader（§3.1・§8.4） | なし（URL フォールバック） | `services: [{ binding: "API", service: "tech-study-lab-api" }]` |
| `API_BASE_URL` | env（web / Server 専用） | Server loader のフォールバック（§8.4） | `http://localhost:8787` | 設定しない（Service Binding を優先） |
| `NEXT_PUBLIC_API_BASE_URL` | ビルド時 env（web / Client） | Client hook（§8.4） | `http://localhost:8787` | api Worker の公開 URL |

### 12.3 ローカル開発手順

1. `pnpm install`
2. `pnpm --filter @tsl/api db:migrate:local`（初回・スキーマ変更時）
3. content sync のローカル実行（初回・content 変更時。§10.8）
4. `pnpm --filter @tsl/api dev`（`:8787`）と `pnpm --filter @tsl/web dev`（`:3000`）を並走

### 12.4 本番デプロイ手順（順序が仕様）

初回のみ：`wrangler d1 create tech-study-lab` を実行し、発行された `database_id` を `apps/api/wrangler.toml` に設定する。

1. **マイグレーション適用**：`wrangler d1 migrations apply tech-study-lab --remote`
2. **content sync**：`content/` → D1 upsert（`--remote`。§10.8）
3. **api デプロイ**：`pnpm --filter @tsl/api deploy`
4. **web デプロイ**：OpenNext ビルド＋デプロイ

順序の根拠：**スキーマ → データ → API → 画面** の順なら、各ステップの完了時点で稼働中の旧バージョンが壊れない（マイグレーションが追加中心の後方互換であることが前提。§12.6）。

- MVP は**手動実行**とする。Walking Skeleton 貫通後に GitHub Actions による main ブランチ自動デプロイへ移行する（PR ゲート CI ＝型・lint・test・build は §5 のとおり先行整備）。

### 12.5 content 更新の運用ルール

content は「web のビルド時バンドル（§8.2）」と「D1 の `questions` 同期（§10.8）」の**二重反映**である。

- content を変更したら、§12.4 の **② content sync と ④ web 再ビルド・デプロイを必ずセットで実行**する。
- 片方だけ実行すると「画面に問題が表示されるのに採点 API が `QUESTION_NOT_FOUND` を返す」不整合が起きる。
- CI 化の際は `content/` の差分を検知して両ジョブを必須にする。

### 12.6 マイグレーション運用

- 生成：`pnpm --filter @tsl/api db:generate`（drizzle-kit）→ ローカル適用（`db:migrate:local`）→ テスト → PR。
- 本番適用はデプロイ手順の先頭（§12.4 の①）。
- **破壊的変更（列削除・型変更・NOT NULL 追加）は原則避け、追加中心**とする。やむを得ない場合は「新列追加 → データ移行 → 旧列削除」の多段リリースで行う。

### 12.7 バックアップ・観測（当面の割り切り）

- **バックアップ**：教材・問題は Git にあるため、守る対象は D1 の動的データ（`answer_logs` / `srs_states` / `lesson_views`）のみ。当面は必要時に `wrangler d1 export` を手動実行し、マルチユーザー公開時に定期化（Cron 等）を検討する。
- **観測**：Workers Logs（`console.error`。§10.6 の `onError` から出力）で足りるとする。構造化ログ・外部監視は公開時に再検討。
