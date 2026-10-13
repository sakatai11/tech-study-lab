import type { DomainKey } from '@tsl/shared'

import type { MaterialSymbolName } from '@/components/ui/material-symbol'

/** 学習領域とアイコンの対応。画面をまたいで同じ領域を同じ形で示す（design.md 8.7）。 */
export const domainIcons = {
  security: 'security',
  frontend: 'code',
  backend: 'dns',
  architecture: 'account_tree',
} as const satisfies Record<DomainKey, MaterialSymbolName>
