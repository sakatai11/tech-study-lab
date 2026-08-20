export type PlatformRateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export type PersistentWriteRateLimit = {
  endpoint: 'POST /answers' | 'POST /lesson-views'
  writeUnit: 'answer_log_and_srs_state' | 'lesson_view'
}

export const persistentWriteRateLimits = {
  answers: {
    endpoint: 'POST /answers',
    writeUnit: 'answer_log_and_srs_state',
  },
  lessonViews: {
    endpoint: 'POST /lesson-views',
    writeUnit: 'lesson_view',
  },
} as const satisfies Record<string, PersistentWriteRateLimit>

export type PersistentWriteRateLimitResult = 'allowed' | 'limited' | 'unavailable'

export function createPersistentWriteRateLimitKey(
  userId: string,
  rateLimit: PersistentWriteRateLimit,
): string {
  return `${userId}:${rateLimit.endpoint}`
}

export async function checkPersistentWriteRateLimit(
  limiter: PlatformRateLimiter,
  userId: string,
  rateLimit: PersistentWriteRateLimit,
): Promise<PersistentWriteRateLimitResult> {
  try {
    const { success } = await limiter.limit({
      key: createPersistentWriteRateLimitKey(userId, rateLimit),
    })

    return success ? 'allowed' : 'limited'
  } catch {
    return 'unavailable'
  }
}
