import 'server-only'

import type { Root } from 'hast'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import type { ComponentProps } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'

import { Callout, isCalloutType } from '@/components/ui/callout'
import { TermWin } from '@/components/ui/term-win'

type CodeBlockProps = ComponentProps<'pre'> & {
  'data-language'?: string
  'data-verdict'?: string
}

const verdicts = {
  fail: { label: 'FAIL', description: '悪い例' },
  pass: { label: 'PASS', description: '良い例' },
} as const

function CodeVerdict({ verdict }: { verdict: keyof typeof verdicts }) {
  const { label, description } = verdicts[verdict]
  return (
    <span className="term-verdict" data-verdict={verdict}>
      <span className="sr-only">{description}: </span>
      {label}
    </span>
  )
}

function CodeBlock({
  'data-language': language = 'text',
  'data-verdict': verdict,
  ...props
}: CodeBlockProps) {
  const status = verdict === 'fail' || verdict === 'pass' ? <CodeVerdict verdict={verdict} /> : null
  return (
    <TermWin meta="utf-8" status={status} title={language}>
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

type BlockProps = ComponentProps<'div'> & { 'data-callout'?: string }

function Block({ 'data-callout': callout, children, ...props }: BlockProps) {
  if (isCalloutType(callout)) return <Callout type={callout}>{children}</Callout>
  return <div {...props}>{children}</div>
}

/** ビルド時に変換済みの HAST を React 要素として描画する（HTML 文字列を挿入しない。design.md §5.1）。 */
export function MarkdownTree({ tree }: { tree: Root }) {
  return toJsxRuntime(tree, {
    Fragment,
    jsx,
    jsxs,
    components: { div: Block, pre: CodeBlock, table: ScrollableTable },
  })
}
