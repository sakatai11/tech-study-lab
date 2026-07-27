/**
 * dependency-cruiser のモジュール解決設定（webpack `resolve` 形式）。
 *
 * `.dependency-cruiser.cjs` の `options.webpackConfig.fileName` から読み込まれる。
 * このリポジトリは webpack を使っていないが、dependency-cruiser が
 * 「webpack config の resolve 設定」を受け取れる口をこれしか用意していないため、
 * 解決設定だけを持つ最小の config としてこのファイルを置く。
 *
 * なぜ tsconfig 経由にしないのか:
 *   dependency-cruiser 内部の tsconfig-paths は TypeScript 4.1+ の
 *   「`paths` のみ指定して `baseUrl` を省略できる」記法を解釈できず、
 *   `baseUrl` 未指定時は実行時 cwd へフォールバックして `@/*` を解決できない。
 *   一方 `baseUrl` は TypeScript 6.0 で非推奨・7.0 で削除予定のため、
 *   `apps/web/tsconfig.json` に `baseUrl` を足して回避する形は将来壊れる。
 *   そこで tsconfig に依存せず、resolver へ alias を直接渡す形にしている。
 *
 * alias の一次ソースは `apps/web/tsconfig.json` の `compilerOptions.paths`。
 * あちらを変更したら、このファイルの alias も合わせて更新すること
 * （現在は `"@/*": ["./src/*"]` の 1 エントリのみ）。
 */

const path = require('node:path')

module.exports = {
  resolve: {
    alias: {
      // apps/web/tsconfig.json: "paths": { "@/*": ["./src/*"] }
      '@': path.resolve(__dirname, 'apps/web/src'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'],
  },
}
