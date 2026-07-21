import { describe, expect, it } from 'vitest'
import { DAY_MS, INITIAL_EASE, MIN_EASE, initialSrs, isDue, reviewSrs } from './sm2'

const NOW = 1_700_000_000_000 // 固定時刻(テストを決定的にする)

describe('initialSrs', () => {
  it('初期状態は ease=2500, interval=0, reps=0', () => {
    expect(initialSrs()).toEqual({
      ease: INITIAL_EASE,
      intervalDays: 0,
      reps: 0,
      lapses: 0,
    })
  })
})

describe('reviewSrs - 正解', () => {
  it('1回目の正解は翌日(interval=1)に出題', () => {
    const r = reviewSrs(initialSrs(), true, NOW)
    expect(r.reps).toBe(1)
    expect(r.intervalDays).toBe(1)
    expect(r.dueAt).toBe(NOW + DAY_MS)
  })

  it('2回目の正解は6日後', () => {
    const after1 = reviewSrs(initialSrs(), true, NOW)
    const after2 = reviewSrs(after1, true, NOW)
    expect(after2.reps).toBe(2)
    expect(after2.intervalDays).toBe(6)
  })

  it('3回目以降は interval * ease で伸びる', () => {
    let s = reviewSrs(initialSrs(), true, NOW)
    s = reviewSrs(s, true, NOW) // interval=6
    const after3 = reviewSrs(s, true, NOW)
    expect(after3.intervalDays).toBe(Math.round(6 * (INITIAL_EASE / 1000))) // 15
  })
})

describe('reviewSrs - 不正解', () => {
  it('不正解で reps リセット・翌日再出題・lapses 増加', () => {
    let s = reviewSrs(initialSrs(), true, NOW)
    s = reviewSrs(s, true, NOW)
    const wrong = reviewSrs(s, false, NOW)
    expect(wrong.reps).toBe(0)
    expect(wrong.intervalDays).toBe(1)
    expect(wrong.lapses).toBe(1)
    expect(wrong.dueAt).toBe(NOW + DAY_MS)
  })

  it('ease は下限(1300)を下回らない', () => {
    let s = initialSrs()
    for (let i = 0; i < 20; i++) {
      s = reviewSrs(s, false, NOW)
    }
    expect(s.ease).toBe(MIN_EASE)
  })
})

describe('isDue', () => {
  it('dueAt が現在以前なら true', () => {
    expect(isDue(NOW - 1, NOW)).toBe(true)
    expect(isDue(NOW, NOW)).toBe(true)
    expect(isDue(NOW + 1, NOW)).toBe(false)
  })
})
