import { type ParsedContentSourceFile, createContentBundle } from '@tsl/shared'
import { describe, expect, it, vi } from 'vitest'

async function rebuild(sources: ParsedContentSourceFile[]) {
  vi.resetModules()
  const bundledContent = createContentBundle(sources)
  vi.doMock('@/lib/generated-content', () => ({ bundledContent }))
  const [catalog, topic, lesson] = await Promise.all([
    import('./load-catalog'),
    import('./load-topic'),
    import('./load-lesson'),
  ])
  return { ...catalog, ...topic, ...lesson }
}

function topicSource(topic: string, order: number): ParsedContentSourceFile {
  return {
    relativePath: `frontend/${topic}/index.md`,
    frontmatter: { topic, title: `${topic}の基礎`, order },
    body: '概要',
  }
}

function lessonSource(topic: string, number: string): ParsedContentSourceFile {
  const lessonId = `frontend-${topic}-${number}`
  return {
    relativePath: `frontend/${topic}/${lessonId}.md`,
    frontmatter: {
      domain: 'frontend',
      topic,
      lessonId,
      title: `${topic}レッスン${number}`,
      estimatedMinutes: 10,
      questions: [
        {
          id: `${lessonId}-q1`,
          type: 'mcq',
          prompt: 'どれ？',
          choices: ['A', 'B', 'C', 'D'],
          answerIndex: 0,
          explanation: '理由',
        },
      ],
    },
    body: '# 本文',
  }
}

describe('lesson catalog content integration', () => {
  it('reflects new frontend topics and lessons through the same bundle used by route loaders', async () => {
    const sources = [topicSource('react', 1), lessonSource('react', '01')]
    const first = await rebuild(sources)

    expect(first.loadLessonCatalog().domains[1]?.topics).toEqual([
      { topic: 'react', title: 'reactの基礎', lessonCount: 1, href: '/learn/frontend/react' },
    ])

    // 再ビルドと同じパーサーで、新規トピック・既存トピックへのレッスン追加を反映する。
    sources.push(topicSource('css', 0), lessonSource('css', '01'), lessonSource('react', '02'))
    const {
      loadLessonCatalog,
      listTopicRouteParams,
      loadTopic,
      listLessonRouteParams,
      loadLesson,
    } = await rebuild(sources)

    expect(loadLessonCatalog().domains[1]?.topics).toEqual([
      { topic: 'css', title: 'cssの基礎', lessonCount: 1, href: '/learn/frontend/css' },
      { topic: 'react', title: 'reactの基礎', lessonCount: 2, href: '/learn/frontend/react' },
    ])
    expect(listTopicRouteParams()).toContainEqual({ domain: 'frontend', topic: 'css' })
    expect(loadTopic('frontend', 'react')?.lessons.map(({ id }) => id)).toEqual([
      'frontend-react-01',
      'frontend-react-02',
    ])
    expect(listLessonRouteParams()).toContainEqual({
      domain: 'frontend',
      topic: 'react',
      lesson: 'frontend-react-02',
    })
    expect(loadLesson('frontend', 'react', 'frontend-react-02')?.title).toBe('reactレッスン02')
  })

  it('shows all empty domains and disables a topic that only has an index', async () => {
    const empty = await rebuild([])
    expect(empty.loadLessonCatalog().domains.every(({ topics }) => topics.length === 0)).toBe(true)

    const { loadLessonCatalog } = await rebuild([topicSource('react', 0)])
    expect(loadLessonCatalog().domains[1]?.topics).toEqual([
      { topic: 'react', title: 'reactの基礎', lessonCount: 0 },
    ])
  })
})
