# Knowledge Graph 開発コンテキスト

`develop-v2` 系統の Issue 開発で常時使用する、構造化アーキテクチャ参照の契約。設計意図・振る舞い・依存方向の一次ソースは `docs/design.md`、現在構造の一次ソースはコードと設定であり、Knowledge Graph は探索・照合を補助する。Graph の存在だけで仕様や実行経路を推測してはならない。

## 基底と完了条件

- Issue作業ブランチの統合ブランチは `develop-v2` とし、開始時に `baseBranch: develop-v2` を記録する。既存の `develop` 系統は変更せず、release-main-pr の `develop` → `main` 運用にも触れない。
- 開始時の clean な `develop-v2` 起点を確認し、`git merge-base develop-v2 HEAD` で算出・検証したコミットを `effectiveBase` として固定する。レビューの `committedRange` は常に `<effectiveBase>...HEAD` とする。
- 実行記録とレビュー用ブリーフには `architectureMode: knowledge-graph`、`baseBranch: develop-v2`、`effectiveBase`、対象を絞った graph evidence、graph limitations を含める。
- 完了条件は、snapshotを再生成・差分照合し、通常の typecheck / lint / test / build に加えて `architecture:check` と `architecture:test` を通過した検証済みコミット列を `develop-v2` 向けPRへ渡すこと。PRのマージは人間が判断する。

## 開始時の基盤確認

`architecture/graph.json`、`scripts/architecture.mjs`、次のpackage scriptが存在することを、Issue変更前に確認する。

```sh
pnpm architecture:check
pnpm architecture:test
```

いずれかが失敗した場合は Knowledge Graph 基盤の不整合として停止し、Issue実装の修正へ混ぜない。snapshotを手編集または再生成して失敗を隠さない。

## 調査への利用

通常のコード検索で対象候補を特定した後、endpoint、file、関数、schemaなど具体的な語をqueryする。

```sh
pnpm architecture:query '/dashboard/due-count' 1
pnpm architecture:query 'load-dashboard.ts' 1
```

- 最初は depth 0〜2 に絞り、必要な関係が不足した場合だけ最大4まで広げる。大きなquery結果をそのまま全てブリーフへ貼らない。
- 調査レポートには query語とdepth、判断に使った node / edge、関連ファイル、抽出器の制限を要約する。これを graph evidence / graph limitations としてブリーフにも引き継ぐ。
- graphは探索補助である。`docs/design.md`、Issue、型、コード、テストを省略せず、import edgeを実行証明として扱わない。
- queryが対象を返さない場合は「関係なし」と断定せず、未対応構文または抽出範囲外の可能性をコード検索で確認する。

## 実装後の更新とゲート

実装またはfixで抽出対象が変わった場合、オーケストレーターが次を行う。

```sh
pnpm architecture:extract
git diff -- architecture/graph.json
pnpm architecture:check
pnpm architecture:test
```

- graph差分を受け入れ条件、`docs/design.md`、コード差分と照合してからコミット対象へ含める。再生成できたことを設計変更の承認にしない。
- 期待しないnode/edgeの消失、出典の混線、抽出不能な新構文があれば品質ゲートをpassにしない。
- `architecture:check` と `architecture:test` は、typecheck、lint、testへ追加する常設ゲートであり、既存ゲートを置き換えない。
- 修正周回で抽出対象が変わった場合も、コミット前に同じ更新とゲートを繰り返す。最終HEADでも `architecture:check` / `architecture:test` を再確認する。

## エージェントへ渡す情報

- `issue-investigator`: `architectureMode: knowledge-graph`、`baseBranch: develop-v2`、`effectiveBase`、query実行契約を渡し、調査レポートへ graph evidence / graph limitations を含めさせる。
- `developer`: 採用した関連 node / edge、対象ファイル、graph limitations を方針書へ含める。`architecture/graph.json` を手動編集させない。
- `test-fixer`: 変更ファイル一覧へ `architecture/graph.json` を含め、通常ゲートに architecture check / test の結果を追加させる。snapshotは自分で編集・再生成しない。
- `reviewer`: `effectiveBase` を使った `committedRange`、graph差分、調査時 query の要約を渡す。snapshotと実コードの両方を読む。
