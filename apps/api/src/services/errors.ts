export class QuestionNotFoundError extends Error {
  constructor(questionId: string) {
    super(`Question not found: ${questionId}`)
    this.name = 'QuestionNotFoundError'
  }
}

export class LessonNotFoundError extends Error {
  constructor(lessonId: string) {
    super(`Lesson not found: ${lessonId}`)
    this.name = 'LessonNotFoundError'
  }
}

export class SrsConflictError extends Error {
  constructor(userId: string, questionId: string) {
    super(`SRS state was updated concurrently: ${userId}/${questionId}`)
    this.name = 'SrsConflictError'
  }
}
