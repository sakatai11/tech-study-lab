import {
  type RecentActivityItem,
  type RecentActivityResponse,
  compareRecentActivity,
} from '@tsl/shared'

const RECENT_ACTIVITY_LIMIT = 10

export type ActivityDeps = {
  findRecentActivity(userId: string, limit: number): Promise<RecentActivityItem[]>
}

type ActivityInput = {
  userId: string
}

export async function getRecentActivity(
  deps: ActivityDeps,
  input: ActivityInput,
): Promise<RecentActivityResponse> {
  const items = await deps.findRecentActivity(input.userId, RECENT_ACTIVITY_LIMIT)

  return {
    items: [...items].sort(compareRecentActivity).slice(0, RECENT_ACTIVITY_LIMIT),
  }
}
