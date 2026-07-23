import { Badge } from '@/components/ui/badge'

import type { ReviewPreviewViewModel } from '../view-model'

type ReviewIntroProps = {
  dueCount: number
  previews: ReviewPreviewViewModel[]
}

export function ReviewIntro({ dueCount, previews }: ReviewIntroProps) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 font-mono text-xs font-bold uppercase tracking-[0.18em] text-blue">
            review / intro
          </p>
          <h1 className="mb-0 mt-3 text-2xl font-black text-ink sm:text-3xl">今日の復習</h1>
        </div>
        <Badge className="border-purple bg-purple-bg text-purple">{dueCount}問</Badge>
      </div>
      <p className="mb-0 mt-5 leading-7 text-ink-2">
        dueAt の古い問題から順に復習します。APIで採点された結果と解説を確認できます。
      </p>
      <div className="mt-5 rounded-xl border-2 border-border bg-well px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-black text-ink">due プレビュー</h2>
          <Badge className="border-purple bg-purple-bg text-purple">max 20</Badge>
        </div>
        <ul className="mt-3 grid gap-2 p-0">
          {previews.map((preview) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
              key={preview.questionId}
            >
              <span className="font-mono text-xs text-ink-2">{preview.questionId}</span>
              <span className="font-mono text-xs text-red">
                {preview.overdueDays > 0 ? `${preview.overdueDays}日滞留` : '今日 due'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
