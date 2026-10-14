---
paths:
  - 'apps/api/**/*.ts'
  - 'apps/web/**/*.ts'
  - 'apps/web/**/*.tsx'
  - 'packages/shared/src/**/*.ts'
  - '**/*.test.ts'
  - '**/*.test.tsx'
  - '**/*.spec.ts'
  - '**/vitest.config.*'
---

# テストルール（Vitest）

## TDD 戦略

このリポジトリでは、すべての層を一律にテストファーストで実装するのではなく、**契約先行の選択的 TDD**を採用する。バックエンドは service を中心にテストファースト、フロントエンドは UI を実装先行、ロジックと状態遷移をテストファーストとする。

### バックエンド

開発順序は次のとおりとする。

1. 関連する ADR（`docs/adr/`）で契約を確認する。契約を新設・変更する場合は、実装やテストより先に ADR を作る。層と依存方向・データフローは `docs/design.md` で確認する。
2. `packages/shared` の Zod スキーマで API の入出力契約を定義する。
3. Hono・D1・Drizzle に依存しない service の振る舞いを、インメモリ fake deps を使ったテストで先に記述する。
4. テストを満たす最小限の service 実装を書く。
5. 薄い route と DAL を実装する。
6. Cloudflare Workers + ローカル D1 の貫通テストを、重要な経路に絞って追加する。

### 層ごとの方針

- **純粋関数・SRS**：厳格な TDD を行う。状態遷移、境界値、日付境界を重点的に検証する。
- **service**：原則としてテストを先に書く。正常系だけでなく、問題未存在、既存状態の有無、正解・不正解などの分岐を検証する。依存はモックライブラリではなく、service が宣言するフラットな deps 型を満たす fake へ差し替える。
- **Zod スキーマ**：境界値と拒否すべき入力をテストする。型だけでは保証できない実行時契約を固定する。
- **route**：`zValidator`、middleware、ステータスコード、エラーマッピングなど HTTP 契約を検証する。service の振る舞いを route テストで重複検証しない。
- **DAL**：Drizzle クエリを Node 上で細かくモックしない。`@cloudflare/vitest-pool-workers` と migration 適用済みのローカル D1 を使い、実クエリ・制約・upsert・`db.batch()` を検証する。
- **貫通テスト**：主要ユースケースごとに少数置く。Walking Skeleton では `POST /answers` の「入力検証 → 採点 → answer log 記録 → SRS upsert → レスポンス」を最低 1 本通す。
- **永続書き込みの rate limit**：platform limiter interface を固定時計の fake に差し替えた単体テストで、N-1 / N / N+1、次の固定窓での reset、key の endpoint 分離、binding の失敗を検証する。binding 名・受理上限・窓は `wrangler.toml` を一次ソースとし、テストで照合する（ADR-0004）。
  - rate limiter も Workers binding を小さい interface に隔離し、route integration では deny / throw fake を渡して 429 / 503 時の D1 無変更を確認する。実 platform の PoP-local な eventual consistency 自体をローカル test の正確な quota と取り違えない。
  - 現在の `@cloudflare/vitest-pool-workers@0.8.0` は内部で Wrangler `4.0.0` を使い、`ratelimits` を未知の top-level field として扱うため、workerd integration test で実 Rate Limit binding の happy path を供給できない。この制限下では integration test の fake で route の 429 / 503 契約を検証する。production 用 Wrangler `4.103.0` による `pnpm --filter @tsl/api build` の dry-run を必須とし、その出力で `ANSWERS_RATE_LIMITER`（60 / 60 秒）と `LESSON_VIEWS_RATE_LIMITER`（30 / 60 秒）の両 binding が解決されることを確認する。

### フロントエンド

- **UI・スタイル**：モックアップと、関連 ADR・`docs/design.md` の該当章を確認してから実装し、ブラウザで表示・レスポンシブ・操作を確認した後、重要な振る舞いだけをテストする。Tailwind のクラス名や内部 DOM 構造を固定するだけのテストは書かない。
- **presentational component**：原則として実装先行とする。条件分岐やユーザー操作がなく、上位の統合テストで十分に検証される場合は、テスト追加自体を必須にしない。
- **純粋変換・mapper・ViewModel**：入出力と境界条件が明確なため、原則としてテストを先に書く。content/API DTO の join・sort・filter と、正解データをクライアント向け ViewModel に混入させないことを重点的に検証する。
- **hook・reducer・状態遷移**：原則としてテストを先に書く。`intro → exercise → result`、問題送り、最終問題、選択肢ロック、スコア集計、`wrongOnly`、二重送信防止、エラー・再試行を検証する。
- **Server loader**：単純な委譲は詳細にテストしない。複数データの join・sort・filter・ViewModel 化など、表示仕様を担う処理を検証する。
- **API wrapper**：薄く保ち、Hono RPC ライブラリの動作をなぞる単体テストは書かない。呼び出し条件やエラー変換に独自ロジックがある場合だけ検証する。
- **ページ統合・E2E**：細かなコンポーネント単体テストを増やす代わりに、ユーザーが観測できる振る舞いを少数の統合テストで検証する。Walking Skeleton は「教材表示 → 解答 → 即時採点 → 結果表示」までをブラウザで貫通確認する。
- **バグ修正**：自動テストで安定して再現できる場合は、失敗する回帰テストを先に書く。CSS・ブラウザ固有の表示崩れなど安定した自動化が難しい場合は、修正前後をブラウザまたはスクリーンショットで確認する。

テストは不変条件を機械的に検証する手段であり、契約の理由と境界は ADR が持つ。優先順位は **ADR → 共有 Zod 契約 → テスト → 実装** とする。テストと ADR が矛盾した場合は、実装に合わせて期待値を変更しない。ADR の決定を確認し、不具合なら実装を直す。判断自体を変えるなら新しい ADR で置き換える。

- **ADR を検証するテストには、`describe` 名または `it` 名に `[ADR-NNNN]` を付ける**。ADR の「検証」節からリンクし、`pnpm test:hooks` が対応の切れを検出する。
- **SRS ロジックは最重点テスト対象**。純粋関数として、境界値（初回解答・連続正解/不正解・間隔の上限下限・日付境界）を網羅する。
- テストは実質を検証する。実装をなぞるだけのスナップショット的テスト・常にパスする形だけのテストを書かない。
- **実装のバグを隠すためにテストの期待値を弱めることは絶対にしない**。期待値を変える場合は ADR 上の根拠を明記する。
- 日付・乱数に依存するテストは `vi.useFakeTimers()` / seed 固定で決定的にする。
- Zod スキーマのテストは有効系だけでなく無効系（バリデーション拒否）も検証する。
