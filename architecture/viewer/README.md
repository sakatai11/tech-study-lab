# Knowledge Graph viewer

Product Design の選択済み案「レイヤー別のグラフ＋下部の詳細表示」を、実際のコード構造で動かすローカル開発ツール。

起動・検索・抽出範囲は [architecture/README.md](../README.md#ブラウザで探索する) を参照。

## 開発

- ルートの `pnpm install` とは独立した package。初回は `npm ci`、起動は `npm run dev`。
- `src/graph-model.mjs`: 検索、表示フィルター、レイヤー配置。走査は CLI と共通の `../traversal.mjs` を使う。
- `graph-data.mjs`: 既存抽出器から Graph と出典抜粋を生成。開発時の再読み込みと静的ビルドで共用する。
- `src/App.jsx` / `src/styles.css`: グラフ・検索・詳細パネル。React Flow を使用する。
- `tests/graph*.test.mjs`: CLI との探索一致、フィルター、出典、読み取り境界を検証する。
- アイコンは Material Symbols Rounded、フォントは Inter / JetBrains Mono をローカル配信する。日本語は OS のフォントにフォールバックする。
- デザイン検証の記録は `design-qa.md`。

Sites 用のファイルは Product Design テンプレート由来。今回の用途はローカル閲覧であり、公開は行わない。
