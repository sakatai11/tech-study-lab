import type { DueCountResponse } from '@tsl/shared'

import type { DashboardDueViewModel } from './view-model'

/** API の due 件数 DTO をダッシュボード表示用データへ正規化する。 */
export function dueCountToViewModel({ dueCount }: DueCountResponse): DashboardDueViewModel {
  return { dueCount }
}
