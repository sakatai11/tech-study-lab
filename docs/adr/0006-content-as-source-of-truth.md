# 0006: 教材・問題は content を一次ソースとし、D1 は配信・集計用のキャッシュにする

- 状態: Accepted
- 日付: 2026-10-14
- 関連: Issue #242（`docs/design.md` の §4.2・§4.4・§10.8・§11.2・§12.5 から移行）

## 背景

教材と問題は AI が執筆・改訂し、PR でレビューする。Git 管理の Markdown なら差分でレビューでき、履歴も残る。一方で、採点（ADR-0002）と領域別の集計には、API が D1 から正解と問題のメタデータを引ける必要がある。2か所に同じデータを持つと、どちらが正しいかが曖昧になる。さらに、問題を削除・改訂したときに、過去の解答ログや SRS 状態との対応が壊れるおそれがある。

## 決定

1. 教材・問題の本文、選択肢、正解、解説の一次ソースは `content/` の Markdown + frontmatter とする。API は教材・問題の本文を D1 に書き込まない。
2. D1 の `questions` は content から同期するキャッシュとし、正誤判定と集計に必要な最小フィールド（`question_id`・`answer_index`・`domain`・`topic`・`lesson_id`・`is_active`）だけを持つ。本文・選択肢・解説は持たない。
3. Web のビルド時バンドルと D1 への同期は、同じパース経路と共有 content Zod を通す。検証を通った内容だけが D1 に入る。
4. 同期は冪等とする。現在の問題のメタデータと `answer_index` を先に upsert し、最後に1回の UPDATE で `is_active` の集合を確定する。upsert の途中で失敗した場合は、直前の active 集合を保つ。現在の問題集合が空なら、すべて inactive にする。
5. content から消えた問題の行は物理削除しない（`answer_logs`・`srs_states` が参照するため）。`is_active = 0` にして集計から外す。
6. content を変えたら、D1 への同期と Web の再ビルド・デプロイを必ず両方行う。片方だけだと「画面に出る問題を API が `QUESTION_NOT_FOUND` で拒否する」不整合が起きる。CI のリリースは、content の差分の有無にかかわらず毎回同期する。
7. 一度 `answer_logs` / `srs_states` に記録された `lessonId` / `questionId` は変更しない。意味が変わる改訂は新しい `questionId` で追加し、旧問題は content から削除する。

## 境界

- 対象は教材・問題とそのメタデータである。解答ログ・SRS 状態・閲覧ログなどの動的データは D1 が一次ソースであり、この ADR の対象外。
- `GET /domains` などの集計は `is_active = 1` の問題だけを数える。
- ローカル開発用の seed（`dev-seed.ts`）は固定ユーザーの動的データだけを作り直し、`questions` と content には触れない。
- ID の形式や問題数の目安などの執筆規約は、コンテンツ規約が扱う。

## 検証

- [content-sync.test.ts](../../apps/api/src/content-sync.test.ts): 同期ペイロードが最小フィールドだけを持つ、upsert の後に1回の UPDATE で active 集合を確定する、DELETE を含まない、空集合ではすべて inactive にする
- [core-endpoints.integration.test.ts](../../apps/api/src/core-endpoints.integration.test.ts): 領域別の集計が active な問題だけを数える
- [deployment-cli.test.mjs](../../scripts/deployment-cli.test.mjs): 前回の成功と content が同じでも、リリースのたびに同期を実行する

テストで直接検証しない決定:
- 決定 3（Web と同期が同じパース経路を通る）は、両者が共有のパーサーと content Zod を import する構造で守られている。レビューで確認する。
- 決定 7（記録済みの ID を変えない）は執筆とレビューの規約であり、`content-new` のレビューで確認する。
