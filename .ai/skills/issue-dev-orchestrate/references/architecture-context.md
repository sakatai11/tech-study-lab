# Knowledge Graph の使い方

`architecture/graph.json` は、リポジトリの構造（ファイル・endpoint・schema・依存関係）を抽出したスナップショットである。構造調査の入口として使うと、読むべき範囲を素早く絞れる。

Graph は仕様の一次ソースではない。設計意図と振る舞いの一次ソースは `docs/design.md`、現在の構造の一次ソースはコードと設定である。Graph で見つけた候補は、必ずコード・型・テスト・設計文書で確認する。抽出対象と制限は `architecture/README.md` を参照する。

## 調査

Issue に出てくる endpoint・ファイル・関数・schema などの具体語を起点に query する。

```sh
pnpm architecture:query '/dashboard/due-count'
pnpm architecture:query 'load-dashboard.ts'
```

- **深さ**: 既定の depth 1 から始める。depth 2 でリポジトリの3割前後まで広がるため、深くするよりも起点を具体的な symbol / file に絞る方がよい。
- **結果が不十分なとき**: 空・曖昧・対象外（教材、UI文言、文書など）の場合は、LSP や `rg` で補う。空結果を「関係なし」の証明として扱わない。
- **import edge**: 実行経路の証明ではない。

## 変更後

コード・設定・依存・抽出器に影響する変更をした場合は、snapshot を再生成して差分を確認する。

```sh
pnpm architecture:extract
git diff -- architecture/graph.json
```

- **コミットしてよい差分**: 変更内容・受け入れ条件・`docs/design.md` から説明できる差分だけをコミットに含める。
- **説明できない差分**: 期待しない node / edge の消失、出典の混線、抽出できない新しい構文が出た場合は、原因を解消するまで品質ゲートを通過扱いにしない。
- **手編集の禁止**: snapshot を手で編集して、失敗を隠さない。
- **最後の確認**: `pnpm architecture:check` と `pnpm architecture:test` を通す。
