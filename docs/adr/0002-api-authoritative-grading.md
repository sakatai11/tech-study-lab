# 0002: 正誤判定の権威は API に置く

- 状態: Accepted
- 日付: 2026-10-13
- 関連: Issue #240（`docs/design.md` の旧 7.2 節の項目から移行）

## 背景

問題の本文・選択肢・正解は `content/` の frontmatter にあり、Web はビルド時にバンドルして表示する。クライアントで正誤を判定すれば API 呼び出しを減らせる。しかしその場合、正解がクライアントバンドルに露出し、クライアントが申告した正誤をそのまま記録することになる。将来アプリを公開すると、学習記録と SRS の改ざんを防げない。

## 決定

1. クライアントに渡す出題用 ViewModel（Quiz / Review）は選択肢と解説だけを持ち、正解（`answerIndex`）を含めない。
2. クライアントは選んだ `selectedIndex` だけを `POST /answers` に送る。正誤（`isCorrect`）をリクエストで受け取らない。
3. API が D1 の `questions`（content sync が作る正解キャッシュ）と照合して `isCorrect` を決め、その判定を記録する。レスポンスとして `{ isCorrect, correctIndex }` を返す。
4. `questions` に存在しない問題への解答は記録せず、404（`QUESTION_NOT_FOUND`）を返す。
5. content の `answerIndex` を後から修正しても、過去の `answer_logs` は再評価しない。記録時点の判定を保持する。

## 境界

- 適用対象は、解答を記録して SRS を更新するすべての経路（`/quiz`・`/review`・間違えた問題の解き直し）である。
- 教材本文・解説の表示は対象外。これらはバンドル済み content から表示してよい。
- 解答後に正解を表示するのは API のレスポンス（`correctIndex`）を受け取った後だけとする。
- 記述式・コード問題を追加する場合も、採点は API の service に置く（採点分岐を追加する）。

## 検証

- [answer-service.test.ts](../../apps/api/src/services/answer-service.test.ts): 保存済みの正解と照合して判定し、正解キャッシュにない問題を拒否する
- [api.test.ts](../../packages/shared/src/schema/api.test.ts): 解答リクエストがクライアント申告の正誤を受け付けない
- [quiz/mapper.test.ts](../../apps/web/src/features/quiz/mapper.test.ts): 演習の ViewModel に正解を含めない
- [review/mapper.test.ts](../../apps/web/src/features/review/mapper.test.ts): 復習の ViewModel に正解を含めない

テストで直接検証しない決定: 決定 5（正解データを修正しても過去の `answer_logs` を再評価しない）は、`answer_logs` を書き換える処理が存在しないことで守られている。content sync やマイグレーションの変更時にレビューで確認する。
