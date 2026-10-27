/** Normalize HTTP/body failures for the viewer while preserving request cancellation. */
export async function parseGraphResponse(response) {
  const fallback = 'Graph を読み込めませんでした。'
  let next
  try {
    next = await response.json()
  } catch (cause) {
    if (cause.name === 'AbortError') throw cause
    throw new Error(fallback)
  }
  if (!response.ok || !next)
    throw new Error(typeof next?.error === 'string' && next.error.trim() ? next.error : fallback)
  if (!next.graph?.nodes || !next.graph?.edges || !next.snippets)
    throw new Error('Graph データの形式を確認してください。')
  return next
}
