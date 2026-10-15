# 0009: 解答ログと SRS 状態を原子的に書き込み、競合は version で検出する

- 状態: Accepted
- 日付: 2026-10-14
- 関連: Issue #242（`docs/design.md` の旧 10.7 節から移行）

## 背景

1回の解答では、解答ログの追加と SRS 状態の更新を両方行う。片方だけ書けると、ログと SRS が食い違う。D1 は複数往復にまたがる対話型トランザクションをサポートしない。また「SRS 状態を読む → 次の状態を計算する → 書く」の間に別の解答が割り込むと、後から書いた方が先の更新を消してしまう。

## 決定

1. 解答ログの追加と SRS 状態の upsert は、1つの `db.batch()` で原子的に書き込む。
2. `srs_states` は `(user_id, question_id)` の複合主キーと `version` を持つ。upsert は読み取り時の `version` と一致する場合だけ適用する（楽観的ロック）。
3. 解答ログは、同じ batch の SRS の upsert が実際に適用された場合だけ記録する。競合した書き込みは、解答ログも SRS 状態も変更しない。
4. 競合したら SRS 状態を読み直して再計算する。3回試しても競合する場合は明示的に失敗させ、解答ログを残さない。
5. Drizzle のインスタンスはリクエストごとに作り、グローバルに保持しない。

## 境界

- 適用対象は、解答を記録するすべての経路（`POST /answers`）である。
- 競合の失敗（`SrsConflictError`）は、現在は個別の HTTP ステータスに写像せず 500 になる。写像を変える場合は別途判断する。
- 同じ問題への複数回の解答を制御しないこと（どの解答も記録される）は ADR-0005 が扱う。

## 検証

- [answer-repository.test.ts](../../apps/api/src/dal/answer-repository.test.ts): 解答ログと SRS の書き込みを1つの batch で送り、失敗をそのまま伝える
- [core-endpoints.integration.test.ts](../../apps/api/src/core-endpoints.integration.test.ts): 古い version での書き込みが解答ログも SRS 状態も変えない、既存の SRS 行を更新する通常の解答では1件ずつ記録する
- [answer-service.test.ts](../../apps/api/src/services/answer-service.test.ts): 競合したら最新の状態から再試行し、3回競合したら失敗する

テストで直接検証しない決定: 決定 5（Drizzle をリクエストごとに作る）は route の実装の規約であり、レビューで確認する。
