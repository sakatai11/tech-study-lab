/** カード内のアイコンチップなどで使うセマンティックカラー（design.md 8.7）。 */
export type Tone = 'green' | 'blue' | 'purple' | 'orange'

/** 淡色の地と同系色の文字を組み合わせたチップのクラス。 */
export const toneChipClasses = {
  green: 'bg-green-bg text-green',
  blue: 'bg-blue-bg text-blue',
  purple: 'bg-purple-bg text-purple',
  orange: 'bg-orange-bg text-orange',
} as const satisfies Record<Tone, string>
