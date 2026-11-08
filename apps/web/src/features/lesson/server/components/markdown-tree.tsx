import 'server-only'

import type { Root } from 'hast'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import type { ComponentProps } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'

import { TermWin } from '@/components/ui/term-win'

type CodeBlockProps = ComponentProps<'pre'> & { 'data-language'?: string }

function CodeBlock({ 'data-language': language = 'text', ...props }: CodeBlockProps) {
  return (
    <TermWin meta="utf-8" title={language}>
      <pre {...props} data-language={language} />
    </TermWin>
  )
}

function ScrollableTable(props: ComponentProps<'table'>) {
  return (
    <div className="table-scroll">
      <table {...props} />
    </div>
  )
}

/** ビルド時に変換済みの HAST を React 要素として描画する（HTML 文字列を挿入しない。design.md §5.1）。 */
export function MarkdownTree({ tree }: { tree: Root }) {
  return toJsxRuntime(tree, {
    Fragment,
    jsx,
    jsxs,
    components: { pre: CodeBlock, table: ScrollableTable },
  })
}
