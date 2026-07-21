/**
 * SM-2 ベースの間隔反復(SRS)アルゴリズム。純粋関数として実装し、
 * 副作用(DB アクセス・時刻取得)は呼び出し側に委ねてテストしやすくする。
 *
 * ease は浮動小数の丸め誤差を避けるため 1000 倍した整数で保持する(2.5 → 2500)。
 */

export const DAY_MS = 24 * 60 * 60 * 1000
export const MIN_EASE = 1300 // SM-2 の下限 1.3
export const INITIAL_EASE = 2500 // 2.5

export type SrsInput = {
  ease: number
  intervalDays: number
  reps: number
  lapses: number
}

export type SrsResult = {
  ease: number
  intervalDays: number
  reps: number
  lapses: number
  dueAt: number
}

export function initialSrs(): SrsInput {
  return { ease: INITIAL_EASE, intervalDays: 0, reps: 0, lapses: 0 }
}

/**
 * 1 回の解答結果から次の SRS 状態を計算する。
 * 4択の正誤(correct)を SM-2 の grade に写像する: 正解=4, 不正解=1。
 *
 * @param state 現在の SRS 状態
 * @param correct 今回正解したか
 * @param now 現在時刻(ms)。dueAt 算出に使う
 */
export function reviewSrs(state: SrsInput, correct: boolean, now: number): SrsResult {
  if (!correct) {
    // 不正解: reps をリセットし、翌日に再出題。ease は下限まで下げる。
    const ease = Math.max(MIN_EASE, state.ease - 200)
    return {
      ease,
      intervalDays: 1,
      reps: 0,
      lapses: state.lapses + 1,
      dueAt: now + 1 * DAY_MS,
    }
  }

  const reps = state.reps + 1
  let intervalDays: number
  if (reps === 1) {
    intervalDays = 1
  } else if (reps === 2) {
    intervalDays = 6
  } else {
    intervalDays = Math.round(state.intervalDays * (state.ease / 1000))
  }

  // 正解時は ease を微増(SM-2 の grade=4 相当)。
  const ease = Math.max(MIN_EASE, state.ease + 0)

  return {
    ease,
    intervalDays,
    reps,
    lapses: state.lapses,
    dueAt: now + intervalDays * DAY_MS,
  }
}

/** dueAt が現在時刻以前なら復習対象。 */
export function isDue(dueAt: number, now: number): boolean {
  return dueAt <= now
}
