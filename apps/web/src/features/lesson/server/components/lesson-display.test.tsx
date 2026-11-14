// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer'

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { compileMarkdown } from '../../../../../scripts/compile-markdown'
import { lessonTocFromBody } from '../../mapper'
import type { LessonViewModel } from '../../view-model'
import { LessonDisplay } from './lesson-display'

vi.mock('../../client/components/lesson-view-recorder', () => ({
  LessonViewRecorder: () => null,
}))

async function renderLesson(markdown: string) {
  const body = await compileMarkdown(markdown)
  const viewModel: LessonViewModel = {
    domain: 'backend',
    topic: 'auth',
    id: 'backend-auth-01',
    title: '認証',
    estimatedMinutes: 10,
    body,
    toc: lessonTocFromBody(body),
    questions: [],
  }
  return render(<LessonDisplay viewModel={viewModel} />)
}

// jsdom の Blob には stream() がなく、Shiki の WASM を読み込めない。
vi.stubGlobal('Blob', NodeBlob)

afterEach(cleanup)

describe('LessonDisplay', () => {
  it('renders a GFM table as a table inside a scroll wrapper', async () => {
    await renderLesson('| code | 意味 |\n| --- | --- |\n| 401 | 未認証 |\n')

    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: '意味' })).toBeTruthy()
    expect(within(table).getByRole('cell', { name: '401' })).toBeTruthy()
    expect(table.parentElement?.classList.contains('table-scroll')).toBe(true)
  })

  it('renders a fenced block in term-win with its language and highlighted tokens', async () => {
    const { container } = await renderLesson('```ts\nconst answer = 42\n```\n')

    const window = container.querySelector('.term-win')
    expect(window?.querySelector('.term-badge')?.textContent).toBe('>_')
    expect(window?.querySelector('.term-title')?.textContent).toBe('ts')
    expect(window?.querySelector('.term-meta')?.textContent).toBe('utf-8')
    expect(window?.querySelector('pre')?.textContent).toContain('const answer = 42')
    expect(window?.querySelector('pre span[style*="color"]')).toBeTruthy()
  })

  it('renders a fence without a language as a text term-win', async () => {
    const { container } = await renderLesson('```\nplain\n```\n')

    expect(container.querySelector('.term-win .term-title')?.textContent).toBe('text')
    expect(container.querySelector('.term-win pre')?.textContent).toContain('plain')
  })

  it('keeps inline code out of term-win and drops unsafe links and raw HTML', async () => {
    const { container } = await renderLesson(
      '`inline` [x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>\n',
    )

    expect(container.querySelector('.term-win')).toBeNull()
    expect(container.querySelector('code')?.textContent).toBe('inline')
    expect(container.querySelector('a[href^="javascript"]')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it.each([
    ['NOTE', '補足'],
    ['TIP', 'ヒント'],
    ['WARNING', '注意'],
    ['CAUTION', '危険'],
  ])('renders a [!%s] callout as a note with an icon and the label %s', async (type, label) => {
    const { container } = await renderLesson(`> [!${type}]\n> 要点の **本文**\n`)

    const note = screen.getByRole('note')
    expect(note.querySelector('.callout-title')?.textContent).toBe(label)
    expect(note.querySelector('.callout-title .material-symbol[aria-hidden="true"]')).toBeTruthy()
    expect(within(note).getByText('本文').tagName).toBe('STRONG')
    expect(note.textContent).not.toContain('[!')
    expect(container.querySelector('blockquote')).toBeNull()
  })

  it.each([
    ['bad', 'FAIL', '悪い例'],
    ['good', 'PASS', '良い例'],
  ])('shows %s fences as %s in the term-win header', async (meta, label, description) => {
    const { container } = await renderLesson(`\`\`\`ts ${meta}\nconst a = 1\n\`\`\`\n`)

    const head = container.querySelector('.term-win .term-head')
    expect(head?.querySelector('.term-title')?.textContent).toBe('ts')
    expect(head?.querySelector('.term-verdict')?.textContent).toBe(`${description}: ${label}`)
    expect(head?.querySelector('.term-verdict .sr-only')?.textContent).toBe(`${description}: `)
    expect(head?.querySelector('.term-meta')?.textContent).toBe('utf-8')
  })

  it('shows no verdict on an ordinary fence', async () => {
    const { container } = await renderLesson('```ts\nconst a = 1\n```\n')

    expect(container.querySelector('.term-verdict')).toBeNull()
  })

  it('links each h2 from the table of contents', async () => {
    const { container } = await renderLesson('## 認証と認可\n\n本文\n\n## `JWT` の注意点\n\n本文\n')

    const toc = screen.getByRole('navigation', { name: '目次' })
    const links = within(toc).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['認証と認可', '#section-1'],
      ['JWT の注意点', '#section-2'],
    ])
    for (const link of links) {
      const target = container.querySelector(link.getAttribute('href') ?? '')
      expect(target?.tagName).toBe('H2')
    }
  })

  it('omits the table of contents for a lesson with a single section', async () => {
    await renderLesson('## 一つだけ\n\n本文\n')

    expect(screen.queryByRole('navigation', { name: '目次' })).toBeNull()
  })
})
