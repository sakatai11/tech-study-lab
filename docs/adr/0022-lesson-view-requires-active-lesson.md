# 0022: 教材の閲覧記録は、同期済みの active な教材だけを受け付ける

- 状態: Accepted
- 日付: 2026-11-26
- 関連: Issue #324

## 背景

`POST /lesson-views` は、教材を開いたことを最小のログとして `lesson_views` に記録する。これまで入力の `lessonId` は「1文字以上の文字列」だけを検証し、その教材が実在するかは確かめていなかった（旧 `docs/design.md` §5.8）。そのため、認証を通った利用者が任意の長さの文字列や存在しない `lessonId` を送るだけで `lesson_views` を膨らませられた。レート制限（ADR-0004）は量を抑えるだけで、記録してよい値かどうかは判定しない。`POST /answers` の `questionId` も長さの上限がなかった。

存在を判定する方法として、次の2つを比べた。

- API にバンドルした content の教材 ID 一覧（`apps/api/src/content-estimates.ts` など）と照合する。API の再デプロイまで一覧が更新されず、D1 への同期とずれる。
- D1 の `questions`（content から同期するキャッシュ、ADR-0006）と照合する。教材は1問以上の問題を持つため、active な問題の `lesson_id` の集合が現在の教材の集合になる。`POST /answers` が `questions` で問題の存在を判定する（ADR-0002）のと同じ経路で済む。

後者を採る。

## 決定

1. `lessonId` と `questionId` のリクエスト検証には、content の ID 規則と同じ共有 Zod（`lessonIdSchema`・`questionIdSchema`）を使う。英小文字・数字・ハイフンだけを許し、長さの上限（`lessonId` 64 文字、`questionId` 80 文字）を超えるものは 400 で拒否する。
2. API は `lessonId` を、D1 の `questions` に `lesson_id` が一致する `is_active = 1` の行があるかで照合する。
3. 照合に失敗した閲覧は `lesson_views` に記録せず、404（`LESSON_NOT_FOUND`）を返す。content から外れて inactive になった教材も、存在しない教材として扱う。

## 境界

- 対象は `POST /lesson-views` の記録経路である。過去に記録済みの `lesson_views` を後から消したり書き換えたりはしない。
- 閲覧の重複排除と配送の保証はしない。Web は記録の失敗（404 を含む）を無視し、教材の表示に影響させない（`docs/design.md` §5.6）。
- `POST /answers` の問題の存在判定は ADR-0002 が持つ。本 ADR は `questionId` の形式と長さの検証だけを加える。
- 長さの上限は content の ID 規則（`<domain>-<topic>-<連番2桁>`・`<lessonId>-q<連番>`）に余裕を持たせた値である。上限を変えるときは content と API の両方に効くよう、共有スキーマの値を変える。
- 照合は D1 の同期状態に従う。content を変えたら同期と Web のデプロイを両方行う規則（ADR-0006 の決定 6）が、画面に出る教材と照合先の一致を保つ。

## 検証

- [api.test.ts](../../packages/shared/src/schema/api.test.ts): `lessonId` の長さ上限・形式違反を拒否する
- [lesson-view-service.test.ts](../../apps/api/src/services/lesson-view-service.test.ts): 存在しない教材の閲覧を記録せずドメインエラーにする
- [core-endpoints.integration.test.ts](../../apps/api/src/core-endpoints.integration.test.ts): 同期済みの問題がない・inactive な `lessonId` には 404 を返して記録しない、長すぎる・形式違反の `lessonId` を 400 で拒否して記録しない
