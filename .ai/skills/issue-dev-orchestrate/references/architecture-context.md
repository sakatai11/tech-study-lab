# 構造化アーキテクチャ実験モード

ユーザーがKnowledge Graph実験を明示し、開始ブランチを指定した場合だけ読む。通常のIssue開発には適用しない。

## 実験基底と終了条件

- 開始時のcleanなcurrent HEADを`experimentBaseCommit`、ブランチ名を`experimentBaseBranch`として固定する。作業ブランチはこのcommitから作り、`develop`へ切り替えたり取り込んだりしない。
- レビュー対象の`effectiveBase`と`committedRange`は`experimentBaseCommit`を基準にする。通常モードの基準は従来どおり`develop`である。
- 実験モードの完了は、ローカルの検証済みコミット列と実験結果をユーザーへ渡すこと。`develop`向けPR、push、マージは実験結果に含めず、ユーザーが別途依頼した場合だけ扱う。
- ブリーフに`architectureMode: experimental`、`experimentBaseBranch`、`experimentBaseCommit`、`effectiveBase`を記録する。別セッションでも会話履歴に依存せず開始条件を復元できるようにする。

## 開始時の基盤確認

`architecture/graph.json`、`scripts/architecture.mjs`、次のpackage scriptが存在することを確認する。

```sh
pnpm architecture:check
pnpm architecture:test
```

Issue変更前に失敗した場合は実験基盤の不整合として停止し、Issue実装の修正へ混ぜない。snapshotを再生成して失敗を隠さない。

## 調査への利用

通常のコード検索で対象候補を特定した後、endpoint、file、関数、schemaなど具体的な語をqueryする。

```sh
pnpm architecture:query '/dashboard/due-count' 1
pnpm architecture:query 'load-dashboard.ts' 1
```

- 最初はdepth 0〜2に絞り、必要な関係が不足した場合だけ最大4まで広げる。大きなquery結果をそのまま全てブリーフへ貼らない。
- 調査レポートにはquery語とdepth、判断に使ったnode/edge、関連ファイル、抽出器の制限を要約する。
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
- `architecture:check`と`architecture:test`は、typecheck、lint、testへ追加する実験用ゲートであり、既存ゲートを置き換えない。
- 修正周回で抽出対象が変わった場合も、コミット前に同じ更新とゲートを繰り返す。最終HEADでも`architecture:check`を再確認する。

## エージェントへ渡す情報

- `issue-investigator`: 実験モード、基底commit、query実行契約を渡し、調査レポートへarchitecture evidenceを含めさせる。
- `developer`: 採用した関連node/edge、対象ファイル、制限を方針書へ含める。graphを手動編集させない。
- `test-fixer`: 変更ファイル一覧へ`architecture/graph.json`を含め、通常ゲートにarchitecture check/testの結果を追加させる。
- `reviewer`: 実験基底を使った`committedRange`、graph差分、調査時queryの要約を渡す。snapshotと実コードの両方を読む。
