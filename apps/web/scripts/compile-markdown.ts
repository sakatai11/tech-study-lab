import type { Element, ElementContent, Root, RootContent, Text } from 'hast'
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

function visitElements(nodes: RootContent[], visit: (element: Element) => void): void {
  for (const node of nodes) {
    if (node.type !== 'element') continue
    visit(node)
    visitElements(node.children, visit)
  }
}

/** 教材で使える callout の種別（docs/content-guidelines.md の「本文の記法」）。 */
export const CALLOUT_TYPES = ['note', 'tip', 'warning', 'caution'] as const

const CALLOUT_MARKER = /^\[!([A-Za-z]+)\]([^\n]*)(?:\n|$)/

function isBlank(node: ElementContent): boolean {
  return node.type === 'text' && node.value.trim() === ''
}

// パース後のテキストでは `\[!NOTE]` や `&#91;!NOTE]` も `[!NOTE]` になるため、原文に記法どおり書かれているかで見分ける。
function isWrittenLiterally(node: Text, marker: string, source: string): boolean {
  const offset = node.position?.start.offset
  return offset !== undefined && source.startsWith(marker, offset)
}

function convertCallout(blockquote: Element, source: string): void {
  const paragraph = blockquote.children.find((child) => child.type === 'element')
  if (paragraph?.type !== 'element' || paragraph.tagName !== 'p') return
  const first = paragraph.children[0]
  if (first?.type !== 'text') return
  const match = CALLOUT_MARKER.exec(first.value)
  if (!match) return

  const [marker, name = '', rest = ''] = match
  // エスケープしたマーカーは callout にせず、文字のまま通常の引用に残す。
  if (!isWrittenLiterally(first, `[!${name}]`, source)) return
  const type = name.toLowerCase()
  if (!(CALLOUT_TYPES as readonly string[]).includes(type)) {
    throw new Error(`unknown callout type [!${name}]; use one of ${CALLOUT_TYPES.join(', ')}`)
  }
  if (rest.trim() !== '') {
    throw new Error(`callout marker [!${name}] must be on its own line`)
  }

  first.value = first.value.slice(marker.length)
  if (first.value === '') paragraph.children.shift()
  if (paragraph.children.every(isBlank)) {
    blockquote.children.splice(blockquote.children.indexOf(paragraph), 1)
  }
  if (blockquote.children.every(isBlank)) {
    throw new Error(`callout [!${name}] has no content`)
  }

  blockquote.tagName = 'div'
  blockquote.properties = { dataCallout: type }
}

// GitHub の alert 記法（> [!NOTE] など）を callout の要素に変換する。誤記はビルドで失敗させる。
function rehypeCallouts() {
  return (tree: Root, file: { value: unknown }) => {
    const source = typeof file.value === 'string' ? file.value : ''
    visitElements(tree.children, (element) => {
      if (element.tagName === 'blockquote') convertCallout(element, source)
    })
  }
}

function codeMetaWords(element: Element): string[] {
  const code = element.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'code',
  )
  const meta = (code?.data as { meta?: unknown } | undefined)?.meta
  return typeof meta === 'string' ? meta.split(/\s+/) : []
}

// フェンスのメタ文字列の bad / good を、term-win のヘッダーに出す判定として pre に写す。
function rehypeCodeVerdicts() {
  return (tree: Root) =>
    visitElements(tree.children, (element) => {
      if (element.tagName !== 'pre') return
      const words = codeMetaWords(element)
      const bad = words.includes('bad')
      const good = words.includes('good')
      if (bad && good) throw new Error('a code fence cannot be both bad and good')
      if (bad || good) element.properties.dataVerdict = bad ? 'fail' : 'pass'
    })
}

// 目次の移動先として、本文直下の h2 に出現順の id（section-1, section-2, …）を振る。
function rehypeSectionIds() {
  return (tree: Root) => {
    let count = 0
    for (const node of tree.children) {
      if (node.type === 'element' && node.tagName === 'h2') {
        count += 1
        node.properties.id = `section-${count}`
      }
    }
  }
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSafeUrls)
  .use(rehypeCallouts)
  .use(rehypeSectionIds)
  .use(rehypePrettyCode, {
    theme: 'github-dark-default',
    keepBackground: false,
    defaultLang: { block: 'text' },
  })
  .use(rehypeCodeVerdicts)

/** Markdown をハイライト済み HAST へ変換する。Shiki を Worker に載せないよう、ビルド時にだけ呼ぶ。 */
export async function compileMarkdown(markdown: string): Promise<Root> {
  // callout の判定で原文を参照するため、原文をファイルとして渡す。
  return (await processor.run(processor.parse(markdown), markdown)) as Root
}

/** 成果物を小さく決定的に保つため、位置情報を除いて直列化する。 */
export function serializeMarkdownTree(tree: Root): string {
  return JSON.stringify(tree, (key, value) => (key === 'position' ? undefined : value))
}
