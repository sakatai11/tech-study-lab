import type { DomainKey } from '@tsl/shared'

export type CatalogTopicViewModel = {
  topic: string
  title: string
  lessonCount: number
  href?: string
}

export type LessonCatalogViewModel = {
  domains: {
    domain: DomainKey
    label: string
    topics: CatalogTopicViewModel[]
  }[]
}

export type LessonSummaryViewModel = {
  id: string
  title: string
  questionCount: number
}

export type TopicViewModel = {
  domain: DomainKey
  topic: string
  title: string
  overviewMarkdown: string
  lessons: LessonSummaryViewModel[]
}

export type LessonQuestionViewModel = {
  id: string
  prompt: string
  choices: string[]
}

export type LessonViewModel = {
  domain: DomainKey
  topic: string
  id: string
  title: string
  markdownBody: string
  questions: LessonQuestionViewModel[]
}
