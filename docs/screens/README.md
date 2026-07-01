# 画面設計（Screens）

各画面の**表示イメージ**と**データフロー**を画面ごとに切り出したもの。設計の全体像・判断根拠は [`../design.md`](../design.md)（第7〜9章）が一次ソース。本ディレクトリはそれを画面単位に具体化した従属文書であり、乖離した場合は `design.md` を優先し先に更新する。

## 画面一覧（5ルート）

| # | ルート | 画面 | 種別 | 初回データ | ファイル |
| --- | --- | --- | --- | --- | --- |
| 1 | `/` | ダッシュボード | RSC | `GET /dashboard/due-count` | [dashboard.md](./dashboard.md) |
| 2 | `/learn/[domain]/[topic]` | レッスン一覧 | RSC | ファイル直読み（ビルド時） | [lesson-list.md](./lesson-list.md) |
| 3 | `/learn/[domain]/[topic]/[lesson]` | 教材本文 | RSC | ファイル直読み（ビルド時） | [lesson-detail.md](./lesson-detail.md) |
| 4 | `/quiz/[lesson]` | 演習 | Client | ビルド時バンドル（GET なし） | [quiz.md](./quiz.md) |
| 5 | `/review` | 復習 | Client | `GET /review/queue`（Server loader） | [review.md](./review.md) |

## 共通レイアウト

```
┌────────────────────────────────────────────────┐
│  tech-study-lab            [学習]  [復習]        │  ← ヘッダー（3リンク）
├────────────────────────────────────────────────┤
│                                                  │
│              （中央 1 カラム・本文）             │
│                                                  │
└────────────────────────────────────────────────┘
```

- ヘッダーのみ（**ロゴ / 学習 / 復習**）。サイドバーなし（トピック増加後に後付け）。
- 本文は中央 1 カラム。スタイリングは Tailwind（§8.7）。
- ユーザー：ログイン UI なし。API（Hono）が固定 `user_id` を権威的に注入（§7.2）。

## データフローの読み方（#9 準拠）

各画面ファイルは以下の凡例でフローを示す。

- **初回＝Server で取得**：RSC ページは `await loader()`、Client ページは page(Server) で loader → 初期 VM を props 渡し。**初回ローディングは hook を経由しない**。
- **DTO（`packages/shared`）→ mapper（純関数）→ ViewModel（web 固有）→ page/component（表示のみ）**。
- **Client hook は 2 回目以降の再取得・mutation のみ**担当。
