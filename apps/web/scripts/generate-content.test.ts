import { describe, expect, it } from 'vitest'

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  checkGeneratedContentModule,
  createGeneratedContentModule,
  renderContentModule,
} from './generate-content'

describe('createGeneratedContentModule', () => {
  it('writes a server-only static TypeScript module without filesystem imports', () => {
    const source = createGeneratedContentModule({
      topics: [],
      lessons: [],
      questions: [],
    })

    expect(source).toContain("import 'server-only'")
    expect(source).toContain("import type { ContentBundle } from '@tsl/shared'")
    expect(source).toContain('export const bundledContent')
    expect(source).not.toContain('node:fs')
  })

  it('renders the real content tree deterministically', () => {
    expect(renderContentModule()).toBe(
      readFileSync(
        fileURLToPath(new URL('../src/lib/generated-content.ts', import.meta.url)),
        'utf8',
      ),
    )
    expect(checkGeneratedContentModule).not.toThrow()
  })
})
