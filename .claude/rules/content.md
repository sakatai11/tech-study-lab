---
paths:
  - 'content/**'
---

# content/ ルール（教材・問題）

- `content/` 配下の Markdown + frontmatter が教材・問題の**一次ソース**。D1 への直接書き込みで内容を変更しない。
- frontmatter は `packages/shared/schema/content.ts` の Zod スキーマに準拠する。問題は frontmatter の `questions[]`（`{ id, type:'mcq', prompt, choices[], answerIndex, explanation }`）に置く。
- `id` は既存教材・問題と重複させない。既存 ID の変更は解答ログ・SRS 状態との紐付けを壊すため原則禁止。
- 本文は素の Markdown（MDX 記法・JSX は使わない。レンダラは react-markdown 系）。
- 4択問題は `choices` が4件、`answerIndex` が 0-3 の範囲であること。`explanation` は必須（学習アプリの中核価値）。
