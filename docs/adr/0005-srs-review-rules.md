# 0005: SRS の更新入口と復習キューの規則

- 状態: Accepted
- 日付: 2026-10-13
- 関連: Issue #240（`docs/design.md` の旧 4.5 節から移行）

## 背景

演習（`/quiz`）、復習（`/review`）、間違えた問題の解き直しは、いずれも同じ4択問題に解答する。経路ごとに採点や記録の仕様を変えると、SRS の状態が「どの画面で解いたか」に左右される。さらに、API がリクエストの文脈を判断する必要が生じる。復習キューの表示件数と due 件数の意味も揃えておかないと、画面と API の間で件数が食い違って見える。

SM-2 の計算式は [sm2.ts](../../packages/shared/src/srs/sm2.ts) を一次ソースとし、この ADR は計算式の周辺にある出題・記録の規則を扱う。

## 決定

1. **SRS 更新の入口は1つ**とする。`POST /answers` は呼び出し元（`/quiz`・`/review`・間違えた問題の解き直し）を区別しない。1解答ごとに `answer_log` の記録と SRS の更新を必ず行い、両者を原子的に書き込む。演習で正解した問題が SM-2 に従って翌日に due になるのは意図した挙動である。
2. **同一問題の複数回解答は制御しない**。解答のたびに SRS を更新し、最後の解答が次回出題日を決める。`answer_logs` には全解答を残す。
3. **due の判定は `dueAt <= now`** とする。SQL の where 句と `isDue`（sm2）で意味を一致させる。
4. **復習キュー**（`GET /review/queue`）は `dueAt` の昇順で、1回のレスポンスに最大20件を返す。残りのバッチがあるかどうかを `hasMore` で返す。フロントは順序を並べ替えない。
5. **due 件数**（`GET /dashboard/due-count`）は、`due_at <= now` の生の件数とする。content との join や20件の上限では減らさない。
6. `/review` は解答済みの問題（`srs_states` を持つ問題）だけを扱う。新しい問題は学習フロー（教材 → `/quiz`）で初めて解答する。

## 境界

- 適用対象は、SRS 状態を変更・参照するすべての経路である。
- 画面に表示する件数（content と join した後の件数）と、空キュー・整合性エラーの分岐は Web の表示契約であり、`docs/design.md` §9.2 が扱う。
- SM-2 のパラメータ（ease の初期値と下限、間隔）を変える場合は、`sm2.ts` とそのテストを変更する。この ADR の改定は不要である。
- 演習と復習で採点・記録の仕様を変える必要が出た場合は、この ADR を置き換える。

## 検証

- [sm2.test.ts](../../packages/shared/src/srs/sm2.test.ts): SM-2 の遷移と `isDue` の境界
- [answer-service.test.ts](../../apps/api/src/services/answer-service.test.ts): 1解答ごとに記録と SRS 更新を行い、既存の状態から遷移する。同時更新時は最新の状態から再試行する
- [review-service.test.ts](../../apps/api/src/services/review-service.test.ts): キューと due 件数に同じ due 境界を使う
- [core-endpoints.integration.test.ts](../../apps/api/src/core-endpoints.integration.test.ts): `dueAt` の昇順、最大20件と `hasMore`、上限で減らない due 件数、境界時刻を含めること、ユーザー間の分離
