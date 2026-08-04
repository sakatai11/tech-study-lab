export type DashboardStaticViewModel = {
  continueHref: string
  learnHref?: string
  quizHref?: string
}

/** ダッシュボードの due card / navigation badge が受け取る表示契約。 */
export type DashboardDueViewModel = {
  dueCount: number
}
