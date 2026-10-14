# ADR（Architecture Decision Record）

設計上の判断のうち、**コードとテストだけでは復元できない「理由」と「境界」**を記録する。不変条件そのものはテストで機械的に検証し、ADR はテストが何を守っているのか、なぜ守るのか、どこまで適用するのかを説明する。運用方針の決定自体は [ADR-0001](./0001-contracts-as-adr-and-tests.md) にある。

## 情報の置き場所

| 情報 | 置き場所 |
| --- | --- |
| 判断の理由・適用範囲（境界）・却下した代替案 | ADR（本ディレクトリ） |
| 不変条件の検証 | テスト（`describe` / `it` 名に `[ADR-NNNN]` を付ける） |
| 入出力の型契約 | `packages/shared` の Zod スキーマ |
| 現在のファイル配置・依存関係 | コードと設定、[Knowledge Graph](../../architecture/README.md) |
| プロダクト方針・依存方向・未移行の設計契約 | [`docs/design.md`](../design.md) |
| 実装状況・残タスク | GitHub Issue / PR |

契約の優先順は **ADR → 共有 Zod 契約 → テスト → 実装** とする。テストと ADR が矛盾した場合は、実装に合わせてテストの期待値を弱めない。ADR の決定を確認し、不具合なら実装を直す。判断自体を変えるなら新しい ADR を作る。

## ADR を作る条件

契約を**新設・変更**する Issue でだけ ADR を作る。目安は、ADR がなければ AI や人がコードを読んで逆の判断をしうるかどうかである。

- 作る: 権威の所在（どちらが判定するか）、信用境界、データの整合性、セキュリティ上の制約、運用上の順序制約、複数の妥当な選択肢から1つを選んだ判断
- 作らない: UI の文言・アイコン・表示の細部、ファイル配置、リファクタリング、実装の詳細。これらはコードとテストだけで変更する

## 運用ルール

- **1件1判断**: 1つの ADR は1つの判断だけを扱う。
- **書き換えない**: `Accepted` になった ADR の「決定」と「境界」は書き換えない。誤字や、ファイル移動に伴うリンクの修正は可。
- **置き換える**: 判断を変えるときは新しい ADR を作り、旧 ADR の状態を `Superseded by [ADR-NNNN](...)` に変える。新 ADR の背景には、旧 ADR の何を変えるのかを書く。
- **状態**: `Proposed`（Issue で検討中）→ `Accepted`（採用）→ `Superseded by ADR-NNNN`（後の ADR に置き換え）／`Deprecated`（対象機能の廃止で不要になった）
- **番号**: 4桁の連番。欠番を作らず、置き換え後も番号を再利用しない。
- **ファイル名**: `NNNN-<英語スラッグ>.md`（スラッグは小文字・数字・ハイフン）。索引の表に `[ADR-NNNN](./NNNN-<slug>.md)` の行を追加し、状態を ADR と揃える。[テンプレート](./template.md) から作る。
- **検証**: 「検証」節には、決定を検証するテストへの相対リンクを1つ以上書く。リンク先のテストの `describe` 名または `it` 名に `[ADR-NNNN]` を付ける。テストで表せない決定（構造上の規約・運用手順など）は、「テストで直接検証しない決定」として決定の番号と確認方法を文章で書く。
- **参照**: リポジトリ中で ADR を参照するときは `ADR-NNNN` と書く。`pnpm test:hooks` が次を検査する（`scripts/test-adr-refs.mjs`）。ファイル名の形式、参照先の実在、「検証」節のリンク先がファイルとして実在して ADR 番号を含むこと（テストファイルは `describe` / `it` の名前に `[ADR-NNNN]` タグ、それ以外は `ADR-NNNN`）、`Superseded by` の番号とリンク先の一致、索引の表に各 ADR の行があり状態が一致すること。

## 索引

| 番号 | タイトル | 状態 |
| --- | --- | --- |
| [ADR-0001](./0001-contracts-as-adr-and-tests.md) | 設計契約を ADR とテストで管理する | Accepted |
| [ADR-0002](./0002-api-authoritative-grading.md) | 正誤判定の権威は API に置く | Accepted |
| [ADR-0003](./0003-server-injected-user-id.md) | userId はサーバーの middleware だけが決める | Accepted |
| [ADR-0004](./0004-persistent-write-rate-limit.md) | 永続書き込みを userId 単位でレート制限する | Accepted |
| [ADR-0005](./0005-srs-review-rules.md) | SRS の更新入口と復習キューの規則 | Accepted |
| [ADR-0006](./0006-content-as-source-of-truth.md) | 教材・問題は content を一次ソースとし、D1 は配信・集計用のキャッシュにする | Accepted |
| [ADR-0007](./0007-analytics-aggregation-boundaries.md) | 学習分析の集計境界を UTC で固定する | Accepted |
| [ADR-0008](./0008-production-access-boundary.md) | 本番の公開 API は Worker 内で Cloudflare Access の JWT を検証する | Accepted |
| [ADR-0009](./0009-srs-write-integrity.md) | 解答ログと SRS 状態を原子的に書き込み、競合は version で検出する | Accepted |
| [ADR-0010](./0010-deploy-order.md) | リリースはスキーマ → データ → API → 画面の順に適用する | Accepted |
| [ADR-0011](./0011-immutable-migrations.md) | 取り込み済みのマイグレーションは変更せず、追加で直す | Accepted |
| [ADR-0012](./0012-separate-web-and-api-workers.md) | Web と API を別の Worker にし、書き込みは Hono API を通す | Accepted |
| [ADR-0013](./0013-no-shared-cache-for-user-data.md) | ユーザー固有のデータを Web の共有キャッシュに載せない | Accepted |
| [ADR-0014](./0014-recent-activity-derived-from-logs.md) | 最近のアクティビティは保存済みのログから導出する | Accepted |
