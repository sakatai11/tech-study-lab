import { describe, expect, it } from 'vitest'

import { findUserData } from './user-data-check'

const lessonExample = '保存例: {"dueAt": "2026-01-01", "dueCount": 1} のように記録する'

/** 成果物の RSC と、それを埋め込んだ HTML の形で文を表す。 */
function inRsc(value: unknown): string {
  return JSON.stringify(value)
}
function inHtml(value: unknown): string {
  return `<script>self.__next_f.push([1,${JSON.stringify(inRsc(value))}])</script>`
}

describe('findUserData [ADR-0019]', () => {
  it('detects user data serialized as JSON keys in RSC and HTML', () => {
    expect(findUserData(inRsc({ dueCount: 9 }), [])).toBeDefined()
    expect(findUserData(inHtml({ summary: { totalAnswerCount: 3 } }), [])).toBeDefined()
    expect(findUserData('<div data-x="{&quot;dueAt&quot;:1}"></div>', [])).toBeDefined()
  })

  it('ignores the same words in plain text', () => {
    expect(
      findUserData('<p>dueAt と dueCount を使って次の復習日を決めます</p>', []),
    ).toBeUndefined()
  })

  it('ignores a JSON example inside lesson text in both RSC and HTML', () => {
    const index = [{ id: 'q1', prompt: lessonExample }]

    expect(findUserData(inRsc(index), [lessonExample])).toBeUndefined()
    expect(findUserData(inHtml(index), [lessonExample])).toBeUndefined()
  })

  it('still detects real user data when a lesson example uses the same key', () => {
    const page = {
      index: [{ id: 'q1', prompt: lessonExample }],
      due: { dueCount: 9 },
    }

    expect(findUserData(inRsc(page), [lessonExample])).toContain('dueCount')
    expect(findUserData(inHtml(page), [lessonExample])).toContain('dueCount')
  })

  it('keeps real user data whose serialization matches a lesson text exactly', () => {
    const text = '{"dueCount":9}'
    const page = { index: [{ prompt: text }], due: { dueCount: 9 } }

    expect(findUserData(inRsc(page), [text])).toContain('dueCount')
    expect(findUserData(inHtml(page), [text])).toContain('dueCount')
  })

  it('fails safe when a lesson example appears in a form it cannot remove', () => {
    const changed = inRsc([{ prompt: lessonExample.replace('保存例', '別の例') }])

    expect(findUserData(changed, [lessonExample])).toBeDefined()
  })
})
