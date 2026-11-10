import type { Element, Root, RootContent } from 'hast'
import { describe, expect, it } from 'vitest'

import { CALLOUT_TYPES, compileMarkdown } from './compile-markdown'

type Node = Root | RootContent

function elements(nodes: Node[]): Element[] {
  return nodes.flatMap((node) =>
    node.type === 'element'
      ? [node, ...elements(node.children)]
      : node.type === 'root'
        ? elements(node.children)
        : [],
  )
}

function text(node: Node): string {
  if (node.type === 'text') return node.value
  if (node.type === 'element' || node.type === 'root') {
    return (node.children as Node[]).map(text).join('')
  }
  return ''
}

describe('compileMarkdown', () => {
  it.each(CALLOUT_TYPES)(
    'turns a [!%s] blockquote into a callout without the marker',
    async (type) => {
      const tree = await compileMarkdown(`> [!${type.toUpperCase()}]\n> 本文 **強調**\n> 続き\n`)

      const callout = elements([tree]).find((element) => element.properties.dataCallout === type)
      expect(callout?.tagName).toBe('div')
      expect(text(callout as Element)).not.toContain('[!')
      expect(text(callout as Element)).toContain('本文 強調\n続き')
      expect(elements([tree]).some((element) => element.tagName === 'blockquote')).toBe(false)
    },
  )

  it('accepts a marker followed by a blank quoted line and keeps later blocks', async () => {
    const tree = await compileMarkdown('> [!tip]\n>\n> 1 段落目\n>\n> - 項目\n')

    const callout = elements([tree]).find((element) => element.properties.dataCallout === 'tip')
    const children = callout?.children.filter((child) => child.type === 'element') ?? []
    expect(children.map((child) => (child as Element).tagName)).toEqual(['p', 'ul'])
    expect(text(callout as Element)).toContain('1 段落目')
  })

  it('leaves an ordinary blockquote as is', async () => {
    const tree = await compileMarkdown('> 引用です\n')

    const blockquote = elements([tree]).find((element) => element.tagName === 'blockquote')
    expect(blockquote).toBeTruthy()
    expect(blockquote?.properties.dataCallout).toBeUndefined()
  })

  it.each([
    ['an unknown callout type', '> [!WARN]\n> 本文\n', /unknown callout type \[!WARN\]/],
    ['text on the marker line', '> [!NOTE] 本文\n', /must be on its own line/],
    ['an empty callout', '> [!CAUTION]\n', /has no content/],
  ])('fails the build on %s', async (_, markdown, message) => {
    await expect(compileMarkdown(markdown)).rejects.toThrow(message)
  })

  it.each([
    ['bad', 'fail'],
    ['good', 'pass'],
  ])('marks a ```ts %s fence with data-verdict=%s', async (meta, verdict) => {
    const tree = await compileMarkdown(`\`\`\`ts ${meta}\nconst a = 1\n\`\`\`\n`)

    const pre = elements([tree]).find((element) => element.tagName === 'pre')
    expect(pre?.properties.dataVerdict).toBe(verdict)
    expect(pre?.properties['data-language']).toBe('ts')
  })

  it('does not mark a fence without bad or good', async () => {
    const tree = await compileMarkdown('```ts badge\nconst a = 1\n```\n\n```\nplain\n```\n')

    const pres = elements([tree]).filter((element) => element.tagName === 'pre')
    expect(pres).toHaveLength(2)
    expect(pres.every((pre) => pre.properties.dataVerdict === undefined)).toBe(true)
  })

  it('fails the build on a fence marked both bad and good', async () => {
    await expect(compileMarkdown('```ts bad good\nx\n```\n')).rejects.toThrow(/both bad and good/)
  })

  it('numbers top-level h2 headings as section anchors', async () => {
    const tree = await compileMarkdown(
      '# 題\n\n## 一つ目\n\n### 小見出し\n\n## 二つ目\n\n> ## 引用内\n',
    )

    const ids = elements([tree])
      .filter((element) => element.tagName === 'h2')
      .map((element) => element.properties.id)
    expect(ids).toEqual(['section-1', 'section-2', undefined])
  })
})
