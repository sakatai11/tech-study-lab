# 検証用 Cloudflare リソースの名称変更

実施日：2026-10-11。検証環境の Worker / D1 の名称を `-vinext` から `-test` へ変更した。本番環境は変更していない。環境の定義は [design.md §12.1](../design.md#121-環境定義) を参照する。

## Worker と Access

ダッシュボードで既存 Worker を改名した後、リポジトリの設定からデプロイした。

| リソース | 新名称 | 稼働 version ID |
| --- | --- | --- |
| 検証 Web | `tech-study-lab-web-test` | `ba874824-4796-48ce-bb7d-c765d4d4cdbc` |
| 検証 API | `tech-study-lab-api-test` | `61b37de0-ce0d-4cff-8e41-8fcad12fb414` |

- Web URL：<https://tech-study-lab-web-test.sakai111893.workers.dev>
- API URL：<https://tech-study-lab-api-test.sakai111893.workers.dev>
- Web の Service Binding は `tech-study-lab-api-test#InternalApi`、Client bundle の API URL と API の `WEB_ORIGIN` も新名称に変更した。
- 既存 Access application を `tech-study-lab-test` / `tech-study-lab-test-health-public` へ改名した。application ID・AUD・既存ポリシーは維持した。
- 新 hostname を保護してから Worker を切り替え、旧 Worker がなくなった後に旧 hostname の宛先を整理した。保護対象は API 全体と Web の `home*` / `learn*` / `quiz*` / `review*` / `domains*` / `analytics*`、公開例外は API の `/health` のみ。
- 旧 hostname を Access の先頭の宛先に残すと、認証後のコールバックが旧 API に向かい 404 になるため、宛先の整理後に認証を再確認した。

## D1 の移行

D1 は既存データベースの改名をサポートしないため、新規 DB にスキーマ・データ・migration 履歴を export/import した。[Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

| 用途 | 名前 | ID |
| --- | --- | --- |
| 移行元・復旧用 | `tech-study-lab-vinext` | `db179ef0-7349-407b-8323-71ff91889a82` |
| 検証 API の接続先 | `tech-study-lab-test` | `1a97bb77-f40d-40e1-b59d-162fb80c7324` |

移行元と移行先の export を SQLite に読み込み、スキーマと各テーブルの全行のハッシュが一致することを確認した。移行元 SQL の SHA-256 は `eb251f81306a9620ec2e49e9ad98a559dcb935779bf48c7ca28dcf79451c48f8`。本番 D1 からの複製は行っていない。旧検証 D1 は削除していない。

| テーブル | 移行時の件数（移行元・移行先とも同数） |
| --- | ---: |
| users | 1 |
| questions | 3 |
| answer_logs | 17 |
| srs_states | 3 |
| lesson_views | 7 |
| d1_migrations | 3 |
| sqlite_sequence | 1 |

## 確認結果

- 新 API の `/health` は `200` / `{"status":"ok"}`。
- 未認証の新 API `/dashboard/due-count` と新 Web `/home` は Access のログインへ `302`。
- 新 Web Origin から API `/answers` への preflight は `204`、`Access-Control-Allow-Origin` は新 Web URL。
- 旧 Web URL `/` と旧 API URL `/health` は `404`。
- ブラウザで Access 認証後、新 Web のダッシュボードとアナリティクスに移行データを表示できた（総解答数 17、正答率 76%、習得済み 2 問）。
- Web build / `verify:build`、設定・deploy の 33 テスト、lint、architecture check が成功した。
- 本番 Worker の稼働 deployment / version ID が作業前後で一致した。

| 本番 Worker | deployment ID（変更なし） | version ID（変更なし） |
| --- | --- | --- |
| `tech-study-lab-web` | `33be0b4f-075f-4ec9-b65d-3b1a32f2ff18` | `226aec5b-cae8-4e08-8aa7-3f1e36f76152` |
| `tech-study-lab-api` | `a0642bd1-f6cd-4110-b9cc-c5e311eea06c` | `bee248cf-7a9d-4c1b-bac4-b2f6aa2de9d5` |
