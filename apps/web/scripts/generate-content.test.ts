import { describe, expect, it } from 'vitest'

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { ContentBundle } from '@tsl/shared'

import {
  checkGeneratedContentModule,
  createGeneratedContentModule,
  createGeneratedMarkdownModule,
  renderContentModules,
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

  it('compiles Markdown into a server-only module of serialized trees', async () => {
    const source = await createGeneratedMarkdownModule({
      topics: [],
      lessons: [
        {
          lessonId: 'lesson-1',
          body: '# 見出し',
        } as ContentBundle['lessons'][number],
      ],
      questions: [],
    })

    expect(source).toContain("import 'server-only'")
    expect(source).toContain('lessonMarkdownTrees')
    expect(source).toContain('lesson-1')
    expect(source).not.toContain('position')
  })

  it('renders the real content tree deterministically', async () => {
    const generated = (name: string) =>
      readFileSync(fileURLToPath(new URL(`../src/lib/${name}`, import.meta.url)), 'utf8')

    await expect(renderContentModules()).resolves.toEqual({
      content: generated('generated-content.ts'),
      markdown: generated('generated-markdown.ts'),
    })
    await expect(checkGeneratedContentModule()).resolves.toBeUndefined()
  })
})
