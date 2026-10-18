'use client'

import { useSyncExternalStore } from 'react'

import { Badge } from '@/components/ui/badge'
import { MaterialSymbol } from '@/components/ui/material-symbol'

import { useStreakDays } from '../hooks/use-streak-days'

// DashboardShell の lg:hidden（Tailwind の既定 lg）と同じ境界。
const desktopMediaQuery = '(min-width: 1024px)'

function subscribeToViewport(onChange: () => void) {
  const mediaQuery = window.matchMedia(desktopMediaQuery)
  mediaQuery.addEventListener('change', onChange)
  return () => mediaQuery.removeEventListener('change', onChange)
}

function isMobileViewport() {
  return !window.matchMedia(desktopMediaQuery).matches
}

function serverSnapshot() {
  return false
}

export function StreakBadge() {
  const isMobile = useSyncExternalStore(subscribeToViewport, isMobileViewport, serverSnapshot)

  return isMobile ? <MobileStreakBadge /> : null
}

function MobileStreakBadge() {
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
