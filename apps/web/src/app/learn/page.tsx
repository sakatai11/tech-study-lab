import { LessonCatalog } from '@/features/lesson/server/components/lesson-catalog'
import { loadLessonCatalog } from '@/features/lesson/server/load-catalog'

import { AppShell } from '../_components/app-shell'

export default function LearnPage() {
  const viewModel = loadLessonCatalog()

  return (
    <AppShell currentNavigation="learn">
      <LessonCatalog viewModel={viewModel} />
    </AppShell>
  )
}
