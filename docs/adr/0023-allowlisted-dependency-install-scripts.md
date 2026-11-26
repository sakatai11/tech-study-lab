# 0023: 依存のインストールスクリプトは許可リストの依存だけが実行する

- 状態: Accepted
- 日付: 2026-11-26
- 関連: Issue #323

## 背景

2026-11-26 のセキュリティ監査で、依存のインストールスクリプトに制限がないと指摘された。pnpm 9 は依存の `preinstall`・`install`・`postinstall` を既定で実行する。依存パッケージが乗っ取られると、開発機（1Password 経由のトークンや Claude の OAuth トークンがある）や CI で任意のコードが実行され得る。`architecture/viewer` は pnpm ワークスペース外の npm package で、CI でもスクリプトを制限せずにインストールしていた。

スクリプトを持つ依存は esbuild・workerd・`@biomejs/biome`・sharp だった。esbuild と workerd の `install.js` は platform 別バイナリを検証し、欠けていれば補う。`@biomejs/biome` の postinstall はバイナリの有無を確かめるだけで、sharp の install は prebuilt の `@img/*` が使えないときのソースビルド用である。後の2つは実行しなくても動く。

全依存のスクリプトを止める案（`ignore-scripts`）は採らない。esbuild・workerd のバイナリの検証と補完も止まり、ワークスペース自身の lifecycle スクリプトにも効くためである。

## 決定

1. pnpm ワークスペースの依存のインストールスクリプトは、ルート `package.json` の `pnpm.onlyBuiltDependencies` に載せた依存だけが実行する。
2. 許可リストに載せるのは、スクリプトを実行しないと動かない依存だけとする。依存を追加・更新して pnpm がスクリプトを無視したと表示したら、スクリプトの中身を確かめてから載せるかを決める。
3. `architecture/viewer` の npm 依存は、ローカルでも CI でもインストールスクリプトを実行しない。

## 境界

- 対象は依存パッケージのインストール時のスクリプトである。ワークスペース自身の lifecycle スクリプトと、`pnpm run`・`npm run` で明示的に実行するスクリプトは制限しない。
- 許可リストの中身は依存の構成に合わせて変わりうる。変えるときは決定2の確認を行い、検証テストの期待値を同じ変更で更新する。
- pnpm の設定の置き場所が変わる移行（pnpm 10 以降の `pnpm-workspace.yaml` など）でも、決定1〜3は維持する。
- 依存のバージョン更新や、lockfile の検証方法は扱わない。

## 検証

- [install-scripts.test.mjs](../../scripts/install-scripts.test.mjs): ルート `package.json` の許可リスト、許可リストを無効にする設定がないこと、`architecture/viewer` の `.npmrc` と CI のインストールでスクリプトを実行しないことを検証する。

テストで直接検証しない決定: 決定2（載せる依存の判断）は、`pnpm install` が表示する無視されたスクリプトの一覧とスクリプトの中身をレビューで確認する。
