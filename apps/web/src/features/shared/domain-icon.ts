import type { DomainKey } from '@tsl/shared'

import type { MaterialSymbolName } from '@/components/ui/material-symbol'
import type { Tone } from '@/components/ui/tone'

/** 学習領域とアイコンの対応。画面をまたいで同じ領域を同じ形で示す（docs/design-system.md）。 */
export const domainIcons = {
  security: 'security',
  frontend: 'code',
  backend: 'dns',
  architecture: 'account_tree',
} as const satisfies Record<DomainKey, MaterialSymbolName>

/** 学習領域と色の対応。`/learn` と学習領域カードで同じ色を使う。 */
export const domainTones = {
  security: 'green',
  frontend: 'blue',
  backend: 'purple',
  architecture: 'orange',
} as const satisfies Record<DomainKey, Tone>
