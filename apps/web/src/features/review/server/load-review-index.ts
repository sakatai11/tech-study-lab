import 'server-only'

import { getBundledQuestions } from '@/lib/content'

import type { ReviewQuestionIndexEntry } from '../view-model'

/**
 * 静的な /review の page から Client へ渡す問題索引。ビルド時に一度だけ作り、
 * 正解（answerIndex）を含めない（ADR-0002、ADR-0019）。
 */
export function loadReviewQuestionIndex(): ReviewQuestionIndexEntry[] {
  return [...getBundledQuestions().values()].map(({ id, prompt, choices, explanation }) => ({
    id,
    prompt,
    choices: [...choices],
    explanation,
  }))
}
