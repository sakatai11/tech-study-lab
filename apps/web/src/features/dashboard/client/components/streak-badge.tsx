'use client'

import { Badge } from '@/components/ui/badge'
import { MaterialSymbol } from '@/components/ui/material-symbol'

import { useStreakDays } from '../hooks/use-streak-days'

export function StreakBadge() {
  const streakDays = useStreakDays()

  if (streakDays === null) return null

  return (
    <Badge className="shrink-0 gap-1 border-orange bg-orange-bg font-sans text-xs text-orange">
      <MaterialSymbol className="size-4" name="local_fire_department" />
      <span className="sr-only">連続学習</span>
      <span className="tabular-nums">{streakDays}日</span>
    </Badge>
  )
}
