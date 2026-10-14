# 0014: 最近のアクティビティは保存済みのログから導出する

- 状態: Accepted
- 日付: 2026-10-14
- 関連: Issue #242（`docs/design.md` の §7.3 の `GET /activity/recent` から移行）

## 背景

ホームの「最近のアクティビティ」は、教材の閲覧と解答を新しい順に並べて表示する。専用のイベントテーブルを作れば表示は簡単になるが、書き込みが増え、解答ログ・閲覧ログと内容が重複する。一方で、既存のログから組み立てる場合は、テーブルをまたいだ ID の衝突や、問題のメタデータが欠けたときの扱いを決めておく必要がある。

## 決定

1. 新しいイベントテーブルは作らない。保存済みの `lesson_views`（`lesson_viewed`）と `answer_logs`（`answer_recorded`）から導出する。
2. 1回のレスポンスは最大10件とし、`occurredAt` の降順に並べる。時刻が同じ場合は ID の昇順にする。
3. 統合後の ID は `answer:` / `lesson-view:` の種別プレフィックスで名前空間を分け、テーブル間の ID の衝突を防ぐ。ID は重複させない。
4. `answer_logs` と `questions` は left join とし、問題のメタデータが欠けていても解答の履歴を落とさない。
5. 現在のデータからは演習・復習のどちらで解いたかや「全問完了」を復元できない。そのため画面は「演習完了」などと断定せず、解答して復習の予定を更新したことだけを伝える。

## 境界

- 対象は `GET /activity/recent` とその表示である。学習分析の集計値は ADR-0007 が扱う。
- 演習・復習の区別や完了を表示する必要が出た場合は、記録するデータを増やす判断と合わせて、この ADR を置き換える。

## 検証

- [activity-service.test.ts](../../apps/api/src/services/activity-service.test.ts): 2種類のイベントを統合し、安定した順序で並べて上限で切る。メタデータが欠けた解答のイベントを落とさない
- [api.test.ts](../../packages/shared/src/schema/api.test.ts): 件数の上限、安定した並び、ID の重複の拒否
- [analytics.integration.test.ts](../../apps/api/src/analytics.integration.test.ts): 実際の D1 で、`questions` にない問題への解答を left join で残し（`lessonId: null`）、種別プレフィックス付きの ID で返す

テストで直接検証しない決定: 決定 5（画面で断定しない文言）は表示文言の規約であり、レビューで確認する。
