// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { QuizCatalog } from './quiz-catalog'

afterEach(cleanup)

describe('QuizCatalog', () => {
  it('shows topic and lesson titles, question counts and the matching start link', () => {
    render(
      <QuizCatalog
        viewModel={{
          domains: [
            {
              domain: 'frontend',
              label: 'フロントエンド',
              topics: [
                {
                  topic: 'react',
                  title: 'Reactの基礎',
                  lessons: [
                    {
                      lessonId: 'frontend-react-01',
                      title: 'コンポーネントと状態管理',
                      questionCount: 7,
                      href: '/quiz/frontend-react-01',
                    },
                  ],
                },
              ],
            },
          ],
        }}
      />,
    )
    const domain = screen.getByRole('region', { name: 'フロントエンド' })
    expect(within(domain).getByRole('heading', { name: 'Reactの基礎' })).toBeTruthy()
    const start = within(domain).getByRole('link', { name: 'コンポーネントと状態管理 7問 演習へ' })
    expect(start.getAttribute('href')).toBe('/quiz/frontend-react-01')
  })

  it('offers the lesson catalog instead of broken exercise links when no lessons exist', () => {
    render(<QuizCatalog viewModel={{ domains: [] }} />)
    expect(screen.getByRole('heading', { name: '演習一覧' })).toBeTruthy()
    expect(screen.getByText('演習は準備中です。教材を読みながらお待ちください。')).toBeTruthy()
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toBe('/learn')
  })
})
