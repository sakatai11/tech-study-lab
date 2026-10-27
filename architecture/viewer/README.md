# Knowledge Graph viewer

役割の説明付きの層別概要から、実際のコード構造を探索するローカル開発ツール。ネットワーク表示へ切り替えると、小さな色付きノードと右側の詳細パネル（狭い画面では下部）で関係と出典を確認できる。

起動・検索・抽出範囲は [architecture/README.md](../README.md#ブラウザで探索する) を参照。

## 開発

- ビューアは独立した npm package だが、Graph の抽出器はルートの `typescript` などに依存する。初回はリポジトリのルートで `pnpm install --frozen-lockfile` と `npm --prefix architecture/viewer ci` の両方を実行し、`pnpm architecture:view` で起動する。ビューアのディレクトリ内で `npm run dev` を使う場合も、ルート側の依存関係は必要。
- `src/graph-model.mjs`: 検索、表示フィルター、ネットワーク配置。走査は CLI と共通の `../traversal.mjs` を使う。
- `src/overview-model.mjs` / `src/LayerOverview.jsx`: 層別概要の集計と一覧・検索・ネットワークへの移動。
- `graph-data.mjs`: 既存抽出器から Graph と出典抜粋を生成。開発時の再読み込みと静的ビルドで共用する。
- `src/App.jsx` / `src/styles.css`: グラフ・検索・詳細パネル。React Flow を使用する。
- `tests/graph*.test.mjs`: CLI との探索一致、フィルター、出典、読み取り境界を検証する。
- アイコンは Material Symbols Rounded、フォントは Inter / JetBrains Mono をローカル配信する。日本語は OS のフォントにフォールバックする。
- デザイン検証の記録は `design-qa.md`。

Sites 用のファイルは、ユーザーが指定した Product Design テンプレートのビルド互換性を保つために保持する。ローカルの成果物を準備する処理だけで、外部へのアップロードは行わない。今回の用途はローカル閲覧であり、公開は行わない。
