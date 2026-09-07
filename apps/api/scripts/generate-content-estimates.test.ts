import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { ContentBundle } from '@tsl/shared'
import { describe, expect, it } from 'vitest'

import {
  checkGeneratedContentEstimatesModule,
  createGeneratedContentEstimatesModule,
  renderContentEstimatesModule,
} from './generate-content-estimates'

const fixture: ContentBundle = {
  topics: [],
  questions: [],
  lessons: [
    {
      domain: 'security',
      topic: 'xss',
      lessonId: 'security-xss-02',
      title: 'Second lesson',
      estimatedMinutes: 12,
      questions: [],
      relativePath: 'security/xss/security-xss-02.md',
      body: '',
    },
    {
      domain: 'security',
      topic: 'xss',
      lessonId: 'security-xss-01',
      title: 'First lesson',
      estimatedMinutes: 18,
      questions: [],
      relativePath: 'security/xss/security-xss-01.md',
      body: '',
    },
  ],
}

describe('generate-content-estimates', () => {
  it('renders a deterministic catalogue from validated lessons', () => {
    expect(createGeneratedContentEstimatesModule(fixture)).toContain('"security-xss-01": 18')
    expect(createGeneratedContentEstimatesModule(fixture)).toContain('"security-xss-02": 12')
    expect(createGeneratedContentEstimatesModule(fixture).indexOf('security-xss-01')).toBeLessThan(
      createGeneratedContentEstimatesModule(fixture).indexOf('security-xss-02'),
    )
  })

  it('matches the checked-in catalogue and passes the stale check', () => {
    expect(renderContentEstimatesModule()).toBe(
      readFileSync(fileURLToPath(new URL('../src/content-estimates.ts', import.meta.url)), 'utf8'),
    )
    expect(checkGeneratedContentEstimatesModule).not.toThrow()
  })
})
