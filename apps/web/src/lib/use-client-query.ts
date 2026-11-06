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

type ClientQueryCacheOptions = {
  /** タブ内でデータを保持するキー。同じキーの画面へ戻ったときに前回のデータを表示する。 */
  key: string
  /** この時間を過ぎたデータは、表示したまま裏で取り直す。 */
  maxAgeMs: number
}

type ClientQueryOptions = {
  /** この無効化通知を受けたら取得し直す。保持しているデータも古いものとして扱う（ADR-0019）。 */
  revalidateOn?: readonly string[]
  /** 省略した場合は保持せず、マウントのたびに取得する。 */
  cache?: ClientQueryCacheOptions
}

type CacheEntry = {
  data: unknown
  fetchedAt: number
  stale: boolean
  revalidateOn: readonly string[]
}

// ページの再読み込みで消えるタブ内のメモリだけに置き、永続化しない（ADR-0019）。
const cache = new Map<string, CacheEntry>()
const watchedInvalidations = new Set<string>()

/**
 * 統計系の画面で、前回のデータを取り直さずに使う時間。解答・閲覧の記録で
 * 無効化されるため、古い統計を見せる場面は限られる（ADR-0019）。
 */
export const STATISTICS_MAX_AGE_MS = 60_000

/** テストの間で保持したデータを持ち越さないために使う。 */
export function clearClientQueryCache(): void {
  cache.clear()
}

/**
 * 無効化通知を、画面がマウントされていない間も受けられるようにする。
 * 記録した後に別の画面から戻ったとき、古いデータを新しいものとして使わないためである。
 */
function watchInvalidation(invalidationKey: string) {
  if (watchedInvalidations.has(invalidationKey)) return
  watchedInvalidations.add(invalidationKey)
  subscribeToClientDataInvalidation(invalidationKey, () => {
    for (const entry of cache.values()) {
      if (entry.revalidateOn.includes(invalidationKey)) entry.stale = true
    }
  })
}

function readCache(options: ClientQueryCacheOptions | undefined): CacheEntry | undefined {
  return options ? cache.get(options.key) : undefined
}

function isFresh(entry: CacheEntry, maxAgeMs: number): boolean {
  return !entry.stale && Date.now() - entry.fetchedAt < maxAgeMs
}

/**
 * ユーザー固有データをマウント後にブラウザで取得する共通 hook（ADR-0019）。
 * 静的に生成した HTML では loading 状態を描画し、取得はマウント後にだけ始める。
 * 保持（cache）を指定した場合は、取り直す間も表示中のデータを表示し続ける。指定しない場合は
 * 取り直すたびに loading とエラーの状態へ戻る（復習のバッチ遷移など）。
 * 古いリクエストの結果とアンマウント後の結果は反映しない。
 */
export function useClientQuery<T>(
  load: () => Promise<T>,
  { revalidateOn = [], cache: cacheOptions }: ClientQueryOptions = {},
): ClientQueryResult<T> {
  // 初回の読み込み（hydration）ではキャッシュが空なので、静的な HTML と同じ loading になる。
  const [state, setState] = useState<ClientQueryState<T>>(() => {
    const entry = readCache(cacheOptions)
    return entry ? { status: 'success', data: entry.data as T } : { status: 'loading' }
  })
  const loadRef = useRef(load)
  const cacheRef = useRef(cacheOptions)
  const revalidateOnRef = useRef(revalidateOn)
  const requestIdRef = useRef(0)
  loadRef.current = load
  cacheRef.current = cacheOptions
  revalidateOnRef.current = revalidateOn

  const reload = useCallback(() => {
    const requestId = ++requestIdRef.current
    const keepShown = cacheRef.current !== undefined
    setState((current) =>
      keepShown && current.status === 'success' ? current : { status: 'loading' },
    )
    loadRef.current().then(
      (data) => {
        // 新しい取得や無効化の後に届いた古い応答は、表示にも保持にも使わない。
        if (requestId !== requestIdRef.current) return
        const options = cacheRef.current
        if (options) {
          cache.set(options.key, {
            data,
            fetchedAt: Date.now(),
            stale: false,
            revalidateOn: revalidateOnRef.current,
          })
          for (const key of revalidateOnRef.current) watchInvalidation(key)
        }
        setState({ status: 'success', data })
      },
      (error: unknown) => {
        if (requestId !== requestIdRef.current) return
        // 保持する画面では、表示中のデータを取り直しの失敗で消さない。
        setState((current) =>
          keepShown && current.status === 'success'
            ? current
            : {
                status: 'error',
                error: error instanceof Error ? error : new Error('データの取得に失敗しました。'),
              },
        )
      },
    )
  }, [])

  // 配列の同一性ではなく中身で購読し直すかを決める。
  const revalidateKeys = revalidateOn.join('\n')

  // 保持のキーは hook ごとに固定なので、マウント時の判定だけに使う。
  useEffect(() => {
    const options = cacheRef.current
    const entry = readCache(options)
    if (!entry || !options || !isFresh(entry, options.maxAgeMs)) reload()

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
