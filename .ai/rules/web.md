---
paths:
  - 'apps/web/**'
---

# apps/web（Next.js）ルール

- Server / Client コンポーネント境界は design.md 8.3 に従う。`'use client'` は必要最小限のリーフに置く。
- API 呼び出しは `hc` クライアント（`apps/api/src/client.ts` のファクトリ）経由。`fetch` の直書きはしない（design.md 8.4）。
- データ整形は「Content data / DTO → Mapper → ViewModel → page」の層構造に従う（design.md 9.1）。page に生の DTO を直接渡さない。
- content の読み取りは `getBundledQuestions()` 等のローダー経由。各 feature で frontmatter 配列を直接走査しない（design.md 8.2）。
- 本文描画は `react-markdown` 系レンダラ。MDX は採用しない。
- `dangerouslySetInnerHTML` は使用しない。
