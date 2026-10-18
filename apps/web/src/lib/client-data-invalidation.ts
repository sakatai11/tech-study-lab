/** 同じブラウザ内の Client 間で、指定したデータの再取得を通知する。 */
export function invalidateClientData(key: string): void {
  window.dispatchEvent(new Event(`tsl:invalidate:${key}`))
}

/** 無効化通知を購読する。返された関数はアンマウント時に呼ぶ。 */
export function subscribeToClientDataInvalidation(
  key: string,
  onInvalidate: () => void,
): () => void {
  const eventName = `tsl:invalidate:${key}`
  window.addEventListener(eventName, onInvalidate)
  return () => window.removeEventListener(eventName, onInvalidate)
}
