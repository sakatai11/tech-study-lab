// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer'

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { compileMarkdown } from '../../../../../scripts/compile-markdown'
import type { LessonViewModel } from '../../view-model'
import { LessonDisplay } from './lesson-display'

vi.mock('../../client/components/lesson-view-recorder', () => ({
  LessonViewRecorder: () => null,
}))

async function renderLesson(markdown: string) {
  const viewModel: LessonViewModel = {
    domain: 'backend',
    topic: 'auth',
    id: 'backend-auth-01',
    title: '認証',
    estimatedMinutes: 10,
    body: await compileMarkdown(markdown),
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
    const wrapper = screen.getByRole('region', { name: '表' })
    expect(wrapper.classList.contains('table-scroll')).toBe(true)
    expect(wrapper.tabIndex).toBe(0)
    expect(table.parentElement).toBe(wrapper)
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
})
