import type { BundledLesson, BundledTopic, DomainKey } from '@tsl/shared'

import type { LessonViewModel, TopicViewModel } from './view-model'

export function topicContentToViewModel(
  topic: BundledTopic,
  lessons: BundledLesson[],
  domain: DomainKey,
): TopicViewModel {
  return {
    domain,
    topic: topic.topic,
    title: topic.title,
    overviewMarkdown: topic.body,
    lessons: lessons.map((lesson) => ({
      id: lesson.lessonId,
      title: lesson.title,
      questionCount: lesson.questions.length,
    })),
  }
}

export function lessonContentToViewModel(content: BundledLesson): LessonViewModel {
  return {
    domain: content.domain,
    topic: content.topic,
    id: content.lessonId,
    title: content.title,
    markdownBody: content.body,
    questions: content.questions.map(({ id, prompt, choices }) => ({
      id,
      prompt,
      choices: [...choices],
    })),
  }
}
