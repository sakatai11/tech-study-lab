export class QuestionNotFoundError extends Error {
  constructor(questionId: string) {
    super(`Question not found: ${questionId}`)
    this.name = 'QuestionNotFoundError'
  }
}
