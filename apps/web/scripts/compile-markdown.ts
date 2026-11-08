import type { Element, Root, RootContent } from 'hast'
import { defaultUrlTransform } from 'react-markdown'
import rehypePrettyCode from 'rehype-pretty-code'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

const URL_PROPERTIES = ['href', 'src'] as const

function sanitizeUrls(nodes: RootContent[]): void {
  for (const node of nodes) {
    if (node.type !== 'element') continue
    sanitizeElementUrls(node)
    sanitizeUrls(node.children)
  }
}

function sanitizeElementUrls(element: Element): void {
  for (const property of URL_PROPERTIES) {
    const value = element.properties[property]
    if (typeof value === 'string') element.properties[property] = defaultUrlTransform(value)
  }
}

// react-markdown が描画時に行っていた URL の無害化をビルド時に引き継ぐ。
function rehypeSafeUrls() {
  return (tree: Root) => sanitizeUrls(tree.children)
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSafeUrls)
  .use(rehypePrettyCode, {
    theme: 'github-dark-default',
    keepBackground: false,
    defaultLang: { block: 'text' },
  })

/** Markdown をハイライト済み HAST へ変換する。Shiki を Worker に載せないよう、ビルド時にだけ呼ぶ。 */
export async function compileMarkdown(markdown: string): Promise<Root> {
  return (await processor.run(processor.parse(markdown))) as Root
}

/** 成果物を小さく決定的に保つため、位置情報を除いて直列化する。 */
export function serializeMarkdownTree(tree: Root): string {
  return JSON.stringify(tree, (key, value) => (key === 'position' ? undefined : value))
}
