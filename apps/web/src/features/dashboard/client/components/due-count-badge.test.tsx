// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DueCountBadge, DueCountProvider } from './due-count-badge'

const { useDueCountMock } = vi.hoisted(() => ({
  useDueCountMock: vi.fn(),
}))

vi.mock('../hooks/use-due-count', () => ({
  useDueCount: useDueCountMock,
}))

describe('DueCountProvider', () => {
  beforeEach(() => {
    useDueCountMock.mockReset()
    useDueCountMock.mockReturnValue({ dueCount: 4 })
  })

  afterEach(() => {
    cleanup()
  })

  it('loads the due count once and shares it with both navigation badges', () => {
    render(
      <DueCountProvider>
        <DueCountBadge className="desktop" />
        <DueCountBadge className="mobile" />
      </DueCountProvider>,
    )

    expect(useDueCountMock).toHaveBeenCalledTimes(1)
    expect(
      screen.getAllByText((_content, element) => element?.textContent === '期限の復習が4件'),
    ).toHaveLength(2)
  })
})
