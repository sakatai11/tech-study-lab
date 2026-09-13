---
name: content-new
description: 教材・4択問題の新規レッスンを執筆するワークフロー。「XSSの教材を書いて」「frontendに新しいレッスンを追加して」などの依頼、または /content-new で起動。content-author エージェントで執筆し、レビューと検証まで行う。
---

# 教材執筆ワークフロー

実行前に `.ai/runtime-compatibility.md` を全文読み、エージェント起動方法を現在のランタイムに合わせる。

Codexでは開始直後と完了直前に `./.ai/hooks/log-skill-usage.sh --runtime codex --skill content-new --status started|completed` を実行して共通ログへ記録する（Claudeではhookが自動記録する）。

引数を解析する: `<domain>`（security | frontend | backend | architecture）、`<topic>`（トピックキー、小文字英数ハイフン）、以降は任意のテーマ・補足指示。domain / topic が不明確なら執筆内容と合わせてユーザーに確認する。

`issue-dev-orchestrate`から起動された場合は、先に`.ai/skills/issue-dev-orchestrate/references/architecture-context.md`を読み、受領したcanonical architecture context（7つのトップレベルキーと全サブキー、`graphCoverage`は解消済み）を`content-author`と`reviewer`へそのまま渡す。不足または`pending`なら執筆・レビューを開始せず、同契約のcanonical error成果物を返す。各担当から増えた`sourceVerification.content`をオーケストレーターへ返す。

## 手順

### 1. 現状確認

```bash
ls content/<domain>/<topic>/ 2>/dev/null   # 既存レッスンと連番の確認
```

- `content/` や該当 topic が未作成の場合は新設として扱う（topic 新設時は index.md も執筆対象）。
- 既存レッスンがあれば、内容の重複と難易度の繋がりを考慮するため一覧をエージェントに伝える。

### 2. 執筆

`.ai/agents/content-author.md` の定義を使って `content-author` エージェントを起動し、以下を渡す:

- domain / topic / 新規 or 改訂の別、次の lessonId 連番
- テーマ・補足指示（引数から）
- 既存レッスンの一覧（あれば）

### 3. 内容レビュー

`.ai/agents/reviewer.md` の定義を使って `reviewer` エージェントを起動し、教材観点でのレビューを依頼する。観点を明示して渡す:

- `reviewStage: content-draft`、変更済みまたは新規の教材だけを列挙した`draftPaths`、同じ値の`inScopeFiles`（このpreflightでは`committedRange`を渡さない）
- `issue-dev-orchestrate`経由では、`content-author`の返却証跡をオーケストレーターが統合した最新のcanonical architecture context

- 技術的正確性（誤った記述は must-fix）
- 問題が本文で解けるか / explanation が誤答の理由にも触れているか
- frontmatter のスキーマ準拠・ID 規約（design.md §11）

must-fix / should-fix があれば content-author に差し戻して修正させる（最大2周）。

### 4. 検証

- `pnpm content:sync` のローカル実行、またはビルド時パースが存在すればそれで frontmatter 検証を行う。
- 未実装の場合: frontmatter を `packages/shared/src/schema/content.ts` の `lessonFrontmatterSchema` で検証する使い捨てスクリプトを scratchpad に書いて `pnpm exec tsx` で実行する。
- `issue-dev-orchestrate`経由では、`content-author`の自己検証と本フェーズをpreflightとして扱い、正式判定は後続の`test-fixer`が同じ検証を再実行して行う。単独起動では本フェーズの結果を最終検証とする。

### 5. 完了報告

作成ファイル・レッスン構成・検証結果を報告する。単独起動ではコミットはユーザー確認後（メッセージ例: `content: security/xss レッスン01を追加`）。`issue-dev-orchestrate`経由では追加の個別確認を求めず、コミット対象・時点・ユーザー承認は外側のオーケストレーター契約へ委ねる。

## 注意

- 既存 lessonId / questionId の変更は禁止（学習履歴・SRS 状態が切れる）。
- 本番教材は 1 レッスン 5〜7 問が目安（Walking Skeleton の3問は例外）。
