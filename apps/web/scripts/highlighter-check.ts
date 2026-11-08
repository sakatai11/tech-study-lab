// ビルド成果物に構文ハイライタ（Shiki とその WASM）が入っていないかを調べる（#284）。
// Markdown は content:generate で変換済みなので、Worker にもブラウザにも載せない。
// verify:build から使い、単体テストで振る舞いを固定する。

const highlighterPattern = /createHighlighter|vscode-textmate|oniguruma|shiki/i

/** 載せてはいけない成果物なら理由を返す。WASM は中身の語に関係なく拒否する。 */
export function findHighlighterArtifact(entry: string, read: () => string): string | undefined {
  if (entry.endsWith('.wasm')) return `${entry} is a WASM artifact`
  if (!/\.m?js$/.test(entry)) return undefined
  return highlighterPattern.test(read()) ? `${entry} contains a syntax highlighter` : undefined
}
