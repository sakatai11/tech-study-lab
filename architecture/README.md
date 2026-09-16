# Knowledge Graph 開発基盤

`develop` 系統のIssue開発で、広域コード検索より先に構造化されたコード情報から影響範囲を絞るための常用基盤。設計意図・振る舞いの一次ソースは `docs/design.md`、現在構造の一次ソースはコードと設定である。`graph.json` は再生成できる参照用snapshotであり、手動編集しない。

情報ごとの責務は [設計文書の冒頭](../docs/design.md) を参照する。本書は抽出範囲・解析の制限・操作方法を所有する。Graphは設計契約、テストの検証結果、Issueの完了状況を保持しない。特にWebのUI・mapper・ViewModelや教材など、抽出対象外の情報は元のコード・文書を確認する。

```sh
node scripts/architecture.mjs extract
node scripts/architecture.mjs check
node scripts/architecture.mjs query '/dashboard/due-count'
node scripts/architecture.mjs query 'load-dashboard.ts' 1
node --test scripts/architecture.test.mjs
```

`extract` は snapshot を更新する。`check` は Worker binding と graph schema を検査し、現在の再抽出結果と保存値の不一致を非0で返す。`query` は毎回コードから抽出し、指定文字列を含む endpoint/file とその近傍を出力する。既定は両方向2辺、深さ0〜4を指定可能。query は全ソースhashと宣言本文を省く。新endpointも同じ構文なら抽出器の変更なしで追従する。

## オントロジー

Graphの語彙定義。node kind・relation・`layer` は**構文とパス規約から決定的に導出**し、人手の判断を挟まない。抽出器と `validateGraph` はこの定義を実装する。設計意図・振る舞いの契約は `docs/design.md` が所有し、本節は「Graphがどの種類の物をどの関係で表すか」だけを定める。

### node kind

| kind | 導出規則 |
| --- | --- |
| `module` | 抽出対象のファイル（`.ts` / `.tsx` / `.cjs` と固定の設定ファイル） |
| `http-endpoint` | Hono chain の `.get` / `.post` 等の呼び出し |
| `db-table` | 変数宣言のうち初期化子が `sqliteTable(...)` 呼び出し |
| `contract-schema` | 変数宣言のうち初期化子が `z.` で始まるか、名前が `Schema` で終わるもの |
| `deps-type` | 型alias・interfaceのうち名前が `Deps` で終わるもの |
| `type` | 上記以外の型alias・interface |
| `function` | 関数宣言 |
| `constant` | 上記以外の変数宣言 |
| `worker-binding` | Worker設定が宣言する binding |

判定は上から順に適用し、最初に一致した kind を採る。`db-table` は `contract-schema` より優先し、`deps-type` は `type` より優先する。`createReviewDeps` のような**関数**は名前が `Deps` で終わっても `function` であり、`deps-type` にはしない。

### relation

各 relationは**1つの意味と1つの方向**だけを持つ。同じ語を逆向きや別の意味で使わない。

| relation | domain | range | 意味 |
| --- | --- | --- | --- |
| `imports` | `module` | `module` | import / export 宣言によるモジュール参照 |
| `imports-symbol` | `module` | 任意のsymbol kind | `packages/shared` からの名前付きimport binding |
| `calls-symbol` | `module` | `function` | routeがimportした関数の直接呼び出し |
| `accepts-deps` | `function` | `deps-type` | 関数引数に明示されたDeps型 |
| `returns-deps` | `function` | `deps-type` | 関数戻り値に明示されたDeps型 |
| `mounts` | `module` | `module` | appによるrouteの静的mount |
| `implements` | `http-endpoint` | `module` | endpointを実装するroute module |
| `derives-schema` | `type` | `db-table` / `contract-schema` | `typeof` による実行時宣言からの型由来 |
| `binds-service` | `module` | `module` | Worker設定のservice binding |
| `binds-database` | `module` | `worker-binding` | Worker設定のD1 binding |

ここでいうsymbol kindは `db-table` / `contract-schema` / `deps-type` / `type` / `function` / `constant` を指す。`imports-symbol` は import binding の存在だけを表し、呼び出しや実行を意味しない。実行経路の証明にはコードと型を確認する。

`validateGraph` は relationごとに domain / range を検査し、違反を非0で落とす。未知の kind、未知の relation、domain / range 違反はすべてエラーとする。

### 所属（containment）

「moduleがsymbolを宣言する」関係は relation ではなく**node の所属属性**で表す。module node は自身が宣言するsymbol名を `symbols` に持ち、symbol node は `source.file` が所属moduleを示す。所属は走査のhopではないため、`query` の depth を消費しない。

### layer

各 node は所属moduleのパスから `layer` を決定的に導出する。dependency-cruiserの依存境界ルールと照合する軸でもある。

| layer | パス |
| --- | --- |
| `api-route` | `apps/api/src/routes/` |
| `api-service` | `apps/api/src/services/` |
| `api-dal` | `apps/api/src/dal/` |
| `api-middleware` | `apps/api/src/middleware/` |
| `api-app` | `apps/api/src/` のその他 |
| `shared-schema` | `packages/shared/src/schema/` |
| `shared-db` | `packages/shared/src/db/` |
| `shared-domain` | `packages/shared/src/` のその他 |
| `web-api` | `apps/web/src/features/*/api/`、`apps/web/src/lib/api.ts` |
| `web-loader` | `apps/web/src/features/*/server/load-*` |
| `config` | dependency-cruiser設定、Worker設定 |

### 既知の乖離

本節の定義に対し、現在の抽出器と snapshot は次の点で未追従である。解消は issue #179（抽出器・検証の追従）と #180（query投影の最適化）で行う。

- `implements` が `module → symbol`（宣言）と `http-endpoint → module`（実装）の二重定義になっている。前者は所属属性へ降格する。
- symbol を単一の `symbol` kind に圧縮しており、`db-table` / `contract-schema` / `type` / `function` / `constant` / `deps-type` を区別していない。
- `imports-symbol` が `uses-symbol` という名前で、使用を意味するかのように読める。
- `layer` 属性が存在しない。
- `validateGraph` が relation 名の存在しか検査しておらず、domain / range を検査していない。

## 抽出対象

- `apps/api/src`、`packages/shared/src` の非テスト `.ts/.tsx`。
- Web の `features/*/api/`、`features/*/server/load-*`、`lib/api.ts`。
- Web JSONC、API TOML、dependency-cruiser 設定。
- ローカルimport/export、名前付きshared importと宣言、`typeof`によるschema由来、appのmount、Hono endpoint、WebのHono client呼び出しをASTから取得。各node/edgeにファイルと1始まり行番号を付ける。
- 既存dependency-cruiserルール名と出典を記録する。依存制約の実検査は既存 `pnpm lint` が担当する。

ソースmanifestのSHA-256も比較するため、対象内のコメント・整形のみの変更でもstaleになる。これによりschema/loaderの実装変更や出典行番号のずれを見逃さない一方、意味的なアーキテクチャ差分だけを判定する仕組みではない。

## 制限

- 型チェッカー・制御フロー解析は使わない。import edgeは呼び出しの実行証明ではない。sharedはtop-levelの変数・関数・型alias・interfaceをfile + nameで識別し、関数内ローカルを除外する。直接importは参照先fileを優先し、barrel経由は対象内で一意のexport宣言名へ限定的に解決する。同名候補が複数あるbarrel参照と同一file内の重複宣言（関数overloadを含む）はエラーにする。汎用的なbarrelの再export/alias解決器ではない。`typeof table.$inferSelect`は最左のtable宣言への由来を表し、property自体の存在や型は検証しない。
- API service/DAL の top-level 関数・型は file + name で識別する。名前付きimportの直接呼出し（aliasを含む）と、関数引数・戻り値に明示された単純な `*Deps` 型を辿れる。shadowing、複合型、型推論は解析しない。`query 'getDueCount' 1`は関数・所属file・直接参照するroute・`ReviewDeps`を返す。DAL factoryも辿る場合はdepth 2を使う。
- API routeは `new Hono().get(...).post(...)` の連鎖、app側は名前付きimportしたroute（factory呼び出しを含む）の静的文字列mountを対象とする。ローカルroot `/` のwrapperは透過として扱う。変数に代入したHonoへの後付け登録、動的path、入れ子mount、aliasされたHono、`on`/`all`、条件別登録は対象外。root appに直接登録された `/health` 等の静的handlerは含むが、public/internal entrypointのendpoint差は区別しない。動的pathや非rootローカルmountは検出できた範囲でエラーにする。
- Web endpoint呼び出しはプロパティ/文字列indexの連鎖と `$get` 等を対象とする。動的indexや実行時URLは解析しない。未一致の呼び出しはedgeを作らないため、完全性は既存型チェック・レビューで確認する。
- Web設定はTypeScriptのJSONC parserで解析する。API TOMLは専用ライブラリを追加せず、rootの1行文字列 `name`/`main` と `[[d1_databases]]` の1行文字列を投影する限定parser。その他のsectionは無視する。環境別override、inline table、複数行文字列は未対応で、root設定に対する検証のみ。
- API bindingのservice名、`InternalApi` export先、WorkerEntrypoint継承、DB bindingを検査する。production制御フローや認証の正しさ、実際のCloudflare接続は保証しない。local URL fallback・browser公開URLは許容されるため、HTTPの一律禁止検査は行わない。
- ファイル走査は明示ソースrootだけで、ディレクトリ走査時にsymlinkを追わず、`.env`・`.dev.vars`・認証ファイルは読み込まない。

コード変更後は検証とレビューを済ませ、`extract` → `check` でsnapshotを更新する。snapshot再生成だけで不正な設計変更を承認したことにはならない。

## issue-dev-orchestrate との連携

`develop` をbaseBranchとするIssue開発では、`.ai/skills/issue-dev-orchestrate/references/architecture-context.md` の契約に従う。開始時にsnapshotの鮮度と抽出テストを確認し、調査はIssue内の具体語を使った`query`から始める。`covered`ではGraphが示す関係からコード確認を開始し、`partial` / `outside` / `unmatched` / 空結果 / 曖昧な結果の場合だけLSP・`rg`へフォールバックする。実装後は`extract`でsnapshotを再生成し、graph差分を確認してから`check`・`architecture:test`を品質ゲートへ含める。
