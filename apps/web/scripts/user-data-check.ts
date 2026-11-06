// ビルド成果物（認証後4画面の静的な枠）にユーザー固有データが入っていないかを調べる（ADR-0019）。
// verify:build から使い、単体テストで振る舞いを固定する。

/** ユーザー固有の API 応答のキー。教材の本文に語として出てもキーの形にはならない。 */
export const userDataKeys = [
  'dueCount',
  'dueAt',
  'hasMore',
  'masteryRate',
  'masteredQuestionCount',
  'totalQuestionCount',
  'totalAnswerCount',
  'correctAnswerRate',
  'averageResponseTimeMs',
  'thisWeekStudyTimeMs',
  'currentStreakDays',
  'retentionDistribution',
  'answerCount',
  'occurredAt',
] as const

// キー名の直後に引用符と `:` が続く形（JSON、エスケープ済みの JSON、HTML の &quot;）。
const userDataPattern = new RegExp(`\\b(?:${userDataKeys.join('|')})(?:&quot;|\\\\*")\\s*:`)
const keyFormInText = new RegExp(`\\b(?:${userDataKeys.join('|')})"?\\s*:`)

const scriptEscapes: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
}

/** 教材の文が成果物に入るときの形。RSC は JSON 文字列、HTML は RSC をさらに JSON 文字列にしたもの。 */
function encodings(text: string): string[] {
  const inRsc = JSON.stringify(text).slice(1, -1)
  const inHtml = JSON.stringify(inRsc).slice(1, -1)
  const escaped = (value: string) => value.replace(/[<>&]/g, (char) => scriptEscapes[char] ?? char)
  return [...new Set([inRsc, inHtml, escaped(inRsc), escaped(inHtml)])]
}

/**
 * 教材の文が JSON の例としてキーを含む場合は、その文の部分だけを取り除いてから調べる。
 * キーそのものを検査から外さないので、教材以外の場所に入った本物のユーザーデータは見逃さない。
 * 取り除けなかった教材の例は残るため、その場合は誤検出として失敗する（見逃す側には倒れない）。
 *
 * @returns 見つかったキーの文脈。なければ undefined。
 */
export function findUserData(
  generated: string,
  contentTexts: readonly string[],
): string | undefined {
  let rest = generated
  for (const text of contentTexts) {
    if (!keyFormInText.test(text)) continue
    for (const encoded of encodings(text)) rest = rest.split(encoded).join('')
  }
  const match = userDataPattern.exec(rest)
  return match ? rest.slice(Math.max(0, match.index - 20), match.index + 40) : undefined
}
