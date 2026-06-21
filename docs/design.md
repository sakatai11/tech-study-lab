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
├── content/          # 教材・問題（MDX/Markdown + frontmatter）= 一次ソース
├── docs/
│   └── design.md     # 本書
└── CLAUDE.md         # AI駆動開発のコンテキスト・規約
```

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
| 教材・問題 | **Git管理の MDX/Markdown + frontmatter**（`content/`） | 一次ソース。AIが執筆・改訂、PRでレビュー |
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
