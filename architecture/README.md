# 構造化アーキテクチャ実験基盤

Issue #164 で検証する、別セッションのIssue開発へ構造化されたコード情報を渡すための実験基盤。設計意図・振る舞いの一次ソースは `docs/design.md`、現在構造の一次ソースはコードと設定である。`graph.json` は再生成できる参照用snapshotであり、手動編集しない。

```sh
node scripts/architecture.mjs extract
node scripts/architecture.mjs check
node scripts/architecture.mjs query '/dashboard/due-count'
node scripts/architecture.mjs query 'load-dashboard.ts' 1
node --test scripts/architecture.test.mjs
```

`extract` は snapshot を更新する。`check` は Worker binding と graph schema を検査し、現在の再抽出結果と保存値の不一致を非0で返す。`query` は毎回コードから抽出し、指定文字列を含む endpoint/file とその近傍を出力する。既定は両方向2辺、深さ0〜4を指定可能。query は全ソースhashと宣言本文を省く。新endpointも同じ構文なら抽出器の変更なしで追従する。

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

Knowledge Graph実験を明示したセッションでは、`.ai/skills/issue-dev-orchestrate/references/architecture-context.md` の契約に従う。開始時にsnapshotの鮮度と抽出テストを確認し、調査では対象を絞った`query`を使う。実装後は`extract`でsnapshotを再生成し、graph差分を確認してから`check`・`architecture:test`を品質ゲートへ含める。
