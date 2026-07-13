# API 契約カタログ

この文書は、[設計文書 §7.3](./design.md#73-画面構成から要請される-api参考) が定義する API の詳細な契約カタログである。画面構成・ユースケースの一次ソースは引き続き設計文書とし、この文書は HTTP 入出力・実装状況を参照しやすく整理する。

## 共通規約

- **ベースパス・バージョン**: 現時点では API バージョンのプレフィックスはなく、以下のパスを API Worker のルートから解決する。将来のバージョニングは必要になった時点で設計文書を先に更新して決める。
- **形式**: リクエスト・レスポンスは JSON（`Content-Type: application/json`）とする。本文のない `GET` リクエストは JSON body を送らない。
- **ユーザーコンテキスト**: API 側の middleware が固定の権威的な `user_id` を注入する。クライアントは `user_id` / `userId` を送信してはならず、いずれのレスポンスにも返さない。認証導入後も API 契約は変えず、注入元だけを置き換える。
- **エラー形式**: route が返すエラーは原則として `{ "error": { "code": string, "message": string } }` とする。入力検証失敗（400）は `zValidator` の既定挙動を使うため、現時点ではこの統一形式を保証しない。未知の内部エラーは詳細を返さず、`500` / `INTERNAL` とする。
- **実装状況**: 本書の `planned` は API route が未実装であることを示す。`scheduled` は実装時に守る HTTP 契約であり、実装済みを意味しない。

## `POST /answers`

1問の解答をサーバーで採点・記録し、SRS 状態を更新する。呼び出し元（演習・復習・誤答のみ再挑戦）による契約差はない。route 実装は [#20](https://github.com/sakatai11/tech-study-lab/issues/20) で予定している。

| 項目 | 契約 |
| --- | --- |
| リクエスト | JSON。`answerRequestSchema`: `{ questionId: string（1文字以上）, selectedIndex: 0〜5 の整数, responseTimeMs?: 0以上の整数 }` |
| 成功 | `200 OK`。`answerResponseSchema`: `{ isCorrect: boolean, correctIndex: 0以上の整数 }` |
| エラー | `400` — リクエスト JSON が `answerRequestSchema` を満たさない。`404` — `QUESTION_NOT_FOUND`（質問 ID が content 同期済み `questions` にない）。`500` — `INTERNAL` |
| Zod スキーマ | **実装済み**: `answerRequestSchema` / `answerResponseSchema`（`packages/shared/src/schema/api.ts`） |

正誤判定は API が `questions` の正解と照合して行う。クライアントに正解を渡したり、クライアントの正誤判定を信用したりしない。

## `GET /review/queue`

復習対象の問題 ID と SRS メタデータを返す。問題本文・選択肢・解説は content からフロントエンドが解決する。route 実装は #20 で予定している。

| 項目 | 契約 |
| --- | --- |
| リクエスト | body・query parameter なし |
| 成功 | `200 OK`。`reviewQueueResponseSchema`: `{ items: Array<{ questionId: string, dueAt: integer }> }`。`items` は `dueAt` 昇順で最大20件 |
| エラー | `500` — `INTERNAL`。エンドポイント固有のエラーコードは現時点で不要 |
| Zod スキーマ | **実装済み**: `reviewQueueResponseSchema`（`packages/shared/src/schema/api.ts`） |

## `GET /dashboard/due-count`

ダッシュボードの復習件数を返す。route 実装は #20 で予定している。

| 項目 | 契約 |
| --- | --- |
| リクエスト | body・query parameter なし |
| 成功 | `200 OK`。`dueCountResponseSchema`: `{ dueCount: 0以上の整数 }` |
| エラー | `500` — `INTERNAL`。エンドポイント固有のエラーコードは現時点で不要 |
| Zod スキーマ | **実装済み**: `dueCountResponseSchema`（`packages/shared/src/schema/api.ts`） |

## `GET /domains`

4領域の習得率、トピック数、レッスン数を返し、スキルツリーとダッシュボードの領域別カードで共用する。Walking Skeleton 後に route → service → dal のパターンで追加する予定である。

| 項目 | 契約 |
| --- | --- |
| リクエスト | body・query parameter なし |
| 成功 | `200 OK`。レスポンス body は **planned**（DTO フィールドは未確定） |
| エラー | 未実装のため live response はない。実装時は共通の `400`（入力検証時）・`500`（`INTERNAL`）を適用し、固有エラーは必要になった場合だけ追加する |
| Zod スキーマ | **planned**: `domainsResponseSchema` |

## `GET /analytics/summary`

総解答数、正答率、平均反応時間、習得済み問題数、連続学習日数、今週の学習時間を返す。Walking Skeleton 後に追加予定である。

| 項目 | 契約 |
| --- | --- |
| リクエスト | body・query parameter なし |
| 成功 | `200 OK`。レスポンス body は **planned**（DTO フィールドは未確定） |
| エラー | 未実装のため live response はない。実装時は共通の `400`（入力検証時）・`500`（`INTERNAL`）を適用し、固有エラーは必要になった場合だけ追加する |
| Zod スキーマ | **planned**: `analyticsSummaryResponseSchema` |

## `GET /analytics/weekly`

直近7日の曜日ごとの解答数推移を返す。Walking Skeleton 後に追加予定である。

| 項目 | 契約 |
| --- | --- |
| リクエスト | body・query parameter なし |
| 成功 | `200 OK`。レスポンス body は **planned**（DTO フィールドは未確定） |
| エラー | 未実装のため live response はない。実装時は共通の `400`（入力検証時）・`500`（`INTERNAL`）を適用し、固有エラーは必要になった場合だけ追加する |
| Zod スキーマ | **planned**: `analyticsWeeklyResponseSchema` |

## `GET /analytics/heatmap`

直近26週の学習コントリビューション表示用に、日次解答数を返す。Walking Skeleton 後に追加予定である。

| 項目 | 契約 |
| --- | --- |
| リクエスト | body・query parameter なし |
| 成功 | `200 OK`。レスポンス body は **planned**（DTO フィールドは未確定） |
| エラー | 未実装のため live response はない。実装時は共通の `400`（入力検証時）・`500`（`INTERNAL`）を適用し、固有エラーは必要になった場合だけ追加する |
| Zod スキーマ | **planned**: `analyticsHeatmapResponseSchema` |

`analyticsHeatmapResponseSchema` は本カタログで命名する予定スキーマであり、現行の設計文書には未記載である。

## `GET /analytics/mistakes`

誤答率が高い問題の上位ランキングを返す。Walking Skeleton 後に追加予定である。

| 項目 | 契約 |
| --- | --- |
| リクエスト | body・query parameter なし |
| 成功 | `200 OK`。レスポンス body は **planned**（DTO フィールドは未確定） |
| エラー | 未実装のため live response はない。実装時は共通の `400`（入力検証時）・`500`（`INTERNAL`）を適用し、固有エラーは必要になった場合だけ追加する |
| Zod スキーマ | **planned**: `mistakesResponseSchema` |

## `GET /activity/recent`

ダッシュボードの最近のアクティビティ向けに、レッスン閲覧・演習完了・復習キュー更新を統合した直近イベントを返す。集計ロジックと DTO は実装時に確定する簡易版として、Walking Skeleton 後に追加予定である。

| 項目 | 契約 |
| --- | --- |
| リクエスト | body・query parameter なし |
| 成功 | `200 OK`。レスポンス body は **planned**（DTO フィールドは未確定） |
| エラー | 未実装のため live response はない。実装時は共通の `400`（入力検証時）・`500`（`INTERNAL`）を適用し、固有エラーは必要になった場合だけ追加する |
| Zod スキーマ | **planned**: `recentActivityResponseSchema` |
