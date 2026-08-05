'use client'

import { useEffect } from 'react'

import { createBrowserApiClient } from '@/lib/api'

import { recordLessonView } from '../../api/lesson-api'

type LessonViewRecorderProps = {
  lessonId: string
}

export function LessonViewRecorder({ lessonId }: LessonViewRecorderProps) {
  useEffect(() => {
    void (async () => {
      try {
        const client = createBrowserApiClient()
        await recordLessonView(client, { lessonId })
      } catch {
        // 閲覧記録の失敗は教材本文の表示へ影響させない。
      }
    })()
  }, [lessonId])

  return null
}
