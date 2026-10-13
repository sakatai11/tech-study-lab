# 0004: 永続書き込みを userId 単位でレート制限する

- 状態: Accepted
- 日付: 2026-10-13
- 関連: Issue #240（`docs/design.md` §10.3.1 から移行）

## 背景

`POST /answers` と `POST /lesson-views` は、1リクエストごとに D1 へ行を追加する。正規の連続解答や教材の再表示は禁止したくない。一方で、認証済みであっても無制限に書き込めると、D1 の書き込み量と容量を消費し続けられてしまう。

## 決定

1. 永続書き込みの endpoint ごとに、別々の Cloudflare Workers Rate Limiting binding を使う。

   | endpoint | binding | key | 固定窓 | 受理上限 |
   | --- | --- | --- | --- | --- |
   | `POST /answers` | `ANSWERS_RATE_LIMITER` | `userId:POST /answers` | 60 秒 | 60 |
   | `POST /lesson-views` | `LESSON_VIEWS_RATE_LIMITER` | `userId:POST /lesson-views` | 60 秒 | 30 |

2. key は、検証済みの `userContext.userId`（[ADR-0003](./0003-server-injected-user-id.md)）と、安定した endpoint 識別子だけで作る。IP アドレス、`CF-Connecting-IP`、クライアントが指定した header や body の識別子は使わない。
3. route は `zValidator` と `userContext` の後、service・repository・D1 書き込みの前に binding を確認する。
4. 制限を超えた場合は、共通のエラー形式で `429 { error: { code: 'RATE_LIMITED', message: 'Too Many Requests' } }` と `Retry-After: 60` を返す。この場合は service を呼ばず、D1 を変更しない。
5. binding の呼び出しが例外になった場合、または binding を利用できない場合は、可用性より保護を優先して fail closed とする。`503 { error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'Rate limit unavailable' } }` を返し、D1 を変更しない。
6. 429、limiter の失敗、成功した永続書き込みについて、`event`・`endpoint`・`writeUnit` だけを含む構造化ログ（PII を含まない）を出す。

## 境界

- public entrypoint と internal entrypoint は同じ route を再利用するため、どちらの経路にも適用する。
- 読み取り専用の endpoint は対象外。
- Workers Rate Limiting は Cloudflare の拠点（PoP）ごとに数え、カウンタを非同期に更新する。そのため、この制限は乱用を減らすためのもので、グローバルに厳密な quota や課金の台帳としては扱わない。
- 受理上限の数値は、通常の演習・復習の再試行と教材の再表示を妨げない範囲で調整してよい。調整する場合は、新しい ADR で置き換える。
- 書き込みメトリクスが不足する場合に Analytics Engine を追加するかどうかは、別の Issue で判断する。

## 検証

- [persistent-write-rate-limit.test.ts](../../apps/api/src/persistent-write-rate-limit.test.ts): endpoint ごとの窓と上限、`userId` と endpoint だけで作る key、limiter が使えない場合の fail closed
- [persistent-write-rate-limit-guard.test.ts](../../apps/api/src/persistent-write-rate-limit-guard.test.ts): 429 と `Retry-After`、503 の共通エラー形式
- [core-endpoints.integration.test.ts](../../apps/api/src/core-endpoints.integration.test.ts): public と internal の両方の entrypoint で、429・503 のときに D1 を変更しない
- [persistent-write-observability.test.ts](../../apps/api/src/persistent-write-observability.test.ts): PII を含まない構造化ログ
