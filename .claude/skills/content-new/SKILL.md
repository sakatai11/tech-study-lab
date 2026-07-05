---
name: content-new
description: 教材・4択問題の新規レッスンを執筆するワークフロー。「XSSの教材を書いて」「frontendに新しいレッスンを追加して」などの依頼、または /content-new で起動。content-author エージェントで執筆し、レビューと検証まで行う。
argument-hint: <domain> <topic> [テーマ・補足]
---

# 教材執筆ワークフロー

引数を解析する: `<domain>`（security | frontend | backend | architecture）、`<topic>`（トピックキー、小文字英数ハイフン）、以降は任意のテーマ・補足指示。domain / topic が不明確なら執筆内容と合わせてユーザーに確認する。

## 手順

### 1. 現状確認

```bash
ls content/<domain>/<topic>/ 2>/dev/null   # 既存レッスンと連番の確認
```

- `content/` や該当 topic が未作成の場合は新設として扱う（topic 新設時は index.md も執筆対象）。
- 既存レッスンがあれば、内容の重複と難易度の繋がりを考慮するため一覧をエージェントに伝える。

### 2. 執筆

`content-author` エージェント（Agent tool, subagent_type: content-author）に以下を渡して起動する:

- domain / topic / 新規 or 改訂の別、次の lessonId 連番
- テーマ・補足指示（引数から）
- 既存レッスンの一覧（あれば）

### 3. 内容レビュー

`reviewer` エージェントに教材観点でのレビューを依頼する。観点を明示して渡す:

- 技術的正確性（誤った記述は must-fix）
- 問題が本文で解けるか / explanation が誤答の理由にも触れているか
- frontmatter のスキーマ準拠・ID 規約（design.md §11）

must-fix / should-fix があれば content-author に差し戻して修正させる（最大2周）。

### 4. 検証

- `pnpm content:sync` のローカル実行、またはビルド時パースが存在すればそれで frontmatter 検証を行う。
- 未実装の場合: frontmatter を `packages/shared/src/schema/content.ts` の `lessonFrontmatterSchema` で検証する使い捨てスクリプトを scratchpad に書いて `pnpm exec tsx` で実行する。

### 5. 完了報告

作成ファイル・レッスン構成・検証結果を報告する。コミットはユーザー確認後（メッセージ例: `content: security/xss レッスン01を追加`）。

## 注意

- 既存 lessonId / questionId の変更は禁止（学習履歴・SRS 状態が切れる）。
- 本番教材は 1 レッスン 5〜7 問が目安（Walking Skeleton の3問は例外）。
