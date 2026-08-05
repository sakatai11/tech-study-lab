import { describe, expect, it } from 'vitest'

import { dueCountToViewModel } from './mapper'

describe('dueCountToViewModel', () => {
  it('normalizes the shared API DTO into the dashboard due-card contract', () => {
    expect(dueCountToViewModel({ dueCount: 4 })).toEqual({ dueCount: 4 })
  })

  it('preserves zero so the due-card can distinguish an empty queue', () => {
    expect(dueCountToViewModel({ dueCount: 0 })).toEqual({ dueCount: 0 })
  })
})
