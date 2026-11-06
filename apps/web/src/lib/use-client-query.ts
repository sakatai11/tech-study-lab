'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { subscribeToClientDataInvalidation } from './client-data-invalidation'

export type ClientQueryState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }

export type ClientQueryResult<T> = ClientQueryState<T> & {
  /** 取得をやり直す。再試行とバッチ完了時の再取得に使う。 */
  reload: () => void
}

type ClientQueryOptions = {
  /** この無効化通知を受けたら取得し直す（ADR-0019）。 */
  revalidateOn?: readonly string[]
}

/**
 * ユーザー固有データをマウント後にブラウザで取得する共通 hook（ADR-0019）。
 * 静的に生成した HTML では loading 状態を描画し、取得はマウント後にだけ始める。
 * 古いリクエストの結果とアンマウント後の結果は反映しない。
 */
export function useClientQuery<T>(
  load: () => Promise<T>,
  { revalidateOn = [] }: ClientQueryOptions = {},
): ClientQueryResult<T> {
  const [state, setState] = useState<ClientQueryState<T>>({
    status: 'loading',
  })
  const loadRef = useRef(load)
  const requestIdRef = useRef(0)
  loadRef.current = load

  const reload = useCallback(() => {
    const requestId = ++requestIdRef.current
    setState({ status: 'loading' })
    loadRef.current().then(
      (data) => {
        if (requestId === requestIdRef.current) setState({ status: 'success', data })
      },
      (error: unknown) => {
        if (requestId === requestIdRef.current) {
          setState({
            status: 'error',
            error: error instanceof Error ? error : new Error('データの取得に失敗しました。'),
          })
        }
      },
    )
  }, [])

  // 配列の同一性ではなく中身で購読し直すかを決める。
  const revalidateKeys = revalidateOn.join('\n')

  useEffect(() => {
    reload()
    const unsubscribes = revalidateKeys
      .split('\n')
      .filter(Boolean)
      .map((key) => subscribeToClientDataInvalidation(key, reload))

    return () => {
      requestIdRef.current += 1
      for (const unsubscribe of unsubscribes) unsubscribe()
    }
  }, [reload, revalidateKeys])

  return { ...state, reload }
}
