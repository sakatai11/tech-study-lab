import { type ParsedContentSourceFile, createContentBundle } from '@tsl/shared'
import { describe, expect, it, vi } from 'vitest'

async function rebuild(sources: ParsedContentSourceFile[]) {
  vi.resetModules()
  const bundledContent = createContentBundle(sources)
  vi.doMock('@/lib/generated-content', () => ({ bundledContent }))
  const [catalog, quiz] = await Promise.all([import('./load-catalog'), import('./load-quiz')])
  return { ...catalog, ...quiz }
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

describe('quiz catalog content integration', () => {
  it('includes new topics and lessons after a content rebuild and preserves same-topic next lessons', async () => {
    const sources = [topicSource('react', 1), lessonSource('react', '01')]
    const first = await rebuild(sources)
    expect(first.loadQuizCatalog().domains[0]?.topics[0]?.lessons).toEqual([
      {
        lessonId: 'frontend-react-01',
        title: 'reactレッスン01',
        questionCount: 1,
        href: '/quiz/frontend-react-01',
      },
    ])

    sources.push(topicSource('css', 0), lessonSource('css', '01'), lessonSource('react', '02'))
    const { loadQuizCatalog, loadQuiz, listQuizRouteParams } = await rebuild(sources)
    const topics = loadQuizCatalog().domains[0]?.topics
    expect(topics?.map(({ topic }) => topic)).toEqual(['css', 'react'])
    expect(topics?.[1]?.lessons.map(({ lessonId }) => lessonId)).toEqual([
      'frontend-react-01',
      'frontend-react-02',
    ])
    for (const topic of topics ?? []) {
      for (const lesson of topic.lessons) {
        expect(listQuizRouteParams()).toContainEqual({ lesson: lesson.lessonId })
        expect(loadQuiz(lesson.lessonId)?.title).toBe(lesson.title)
      }
    }
    expect(loadQuiz('frontend-react-01')?.nextLessonId).toBe('frontend-react-02')
    expect(loadQuiz('frontend-react-02')?.nextLessonId).toBeUndefined()
  })

  it('returns no exercise links for an empty bundle or topics with no lessons', async () => {
    const empty = await rebuild([])
    expect(empty.loadQuizCatalog()).toEqual({ domains: [] })
    const indexOnly = await rebuild([topicSource('react', 0)])
    expect(indexOnly.loadQuizCatalog()).toEqual({ domains: [] })
  })
})
