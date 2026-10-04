---
name: content-new
description: 教材・4択問題（content/）の執筆と品質検証のワークフロー。「XSSの教材を書いて」「frontendに新しいレッスンを追加して」などの執筆依頼、「教材を検証して」「問題の品質を確認して」などの検証依頼、または /content-new で起動する。執筆は content-author エージェント、内容レビューは reviewer エージェントが行い、機械検証まで済ませる。
---

# 教材の執筆と検証

実行前に `.ai/runtime-compatibility.md` を全文読み、エージェントの起動方法を現在のランタイムに合わせる。

Codexでは開始直後と完了直前に `./.ai/hooks/log-skill-usage.sh --runtime codex --skill content-new --status started|completed` を実行して共通ログへ記録する（Claudeではhookが自動記録する）。

規約の一次ソースは次の3つである。フィールドや件数の制約をこのスキルへ複製せず、実行時点の一次ソースを参照する。

- `docs/design.md` §11: 配置・ID・問題数
- `packages/shared/src/schema/content.ts`: frontmatter の構造
- `packages/shared/src/content-parser.ts`: パスの整合と ID の一意性

## モード

- **執筆モード**: レッスンの新規作成や改訂の依頼。引数から `<domain>`（security | frontend | backend | architecture）、`<topic>`（小文字英数とハイフン）、任意のテーマ・補足指示を読み取る。domain / topic がはっきりしなければ、執筆内容と合わせてユーザーに確認する。
- **検証のみモード**: 既存教材の検証の依頼。
  - 対象: 指定されたパス。指定がなければ、作業ツリーと現在の比較範囲に含まれる `content/` の変更を対象とする。全件監査を明示された場合だけ `content/` 全体を対象にする。lesson を対象にするときは、同じ topic の `index.md` も必ず読み、内容レビューの「整合」の確認に使う。
  - 進め方: 下記の「機械検証」と「内容レビュー」を行い、判定を報告する。執筆者のコンテキストがないため、内容レビューは自分で行ってよい。
  - 禁止事項: 教材の修正、D1 同期、commit、push、Issue・PR の操作は行わない。

`issue-dev-orchestrate` の中から使う場合は、Issue の受け入れ条件と対象範囲を `content-author` と `reviewer` へ渡す。この検証結果は、オーケストレーターの品質ゲート結果に含める。

## 執筆モードの手順

### 1. 現状確認

```bash
ls content/<domain>/<topic>/ 2>/dev/null   # 既存レッスンと連番の確認
```

- **新設の場合**: `content/` や該当 topic がまだなければ新設として扱う。topic を新設するときは `index.md` も執筆対象に含める。
- **既存レッスンがある場合**: 内容の重複を避け、難易度のつながりを考慮できるよう、一覧をエージェントに伝える。

### 2. 執筆

`.ai/agents/content-author.md` の定義で `content-author` エージェントを起動し、次を渡す。

- domain / topic / 新規か改訂か、次の lessonId の連番
- テーマ・補足指示（引数から）
- 既存レッスンの一覧（あれば）

### 3. 機械検証

下記の「機械検証」を行う。失敗した場合は `content-author` に修正させる。

### 4. 内容レビュー

`.ai/agents/reviewer.md` の定義で `reviewer` エージェントを起動し、下記の「内容レビューの観点」で教材をレビューさせる。依頼には次を含める。

- `reviewStage: content-draft`
- `targetFeature`、`acceptanceCriteria`、`outOfScopePolicy`
- `draftPaths`: 変更済みまたは新規の教材だけを列挙する
- `inScopeFiles`: `draftPaths` と同じ値（`committedRange` は渡さない）
- 対象 lesson と同じ topic の `index.md`

must-fix / should-fix があれば `content-author` に差し戻して修正させ、機械検証からやり直す（最大2周）。

### 5. 完了報告

作成したファイル、レッスン構成、判定を報告する。

- **単独で起動した場合**: コミットはユーザーの確認後に行う（メッセージ例: `content: security/xss レッスン01を追加`）。
- **`issue-dev-orchestrate` から使った場合**: 追加の個別確認は求めない。コミットの対象・時点・ユーザー承認は、オーケストレーター側の手順に従う。

## 機械検証

```bash
pnpm content:validate
```

`packages/shared` の content Zod と `createContentBundle` を通して、次を検証する。

- frontmatter: topic・lesson・question
- 問題の構造: 選択肢と `answerIndex`、explanation の必須性
- 整合と形式: パス・domain・topic・lessonId の対応、lessonId と questionId の形式・一意性

検証のために `content:check`、`content:sync`、`content:sync:remote` は実行しない。

- **`content:check`**: 生成物の鮮度検査を含むため、生成前の正しい変更でも失敗する。
- **`content:sync` / `content:sync:remote`**: D1 を書き換える。

失敗した場合は、コマンド、終了状態、該当ファイル、エラーの要旨を記録する。

## 内容レビューの観点

lesson ごとに、本文・設問・選択肢・正解・explanation をひとまとまりとして確認する。

- **技術的正確性**: 誤った記述は must-fix とする。
- **正解**: 問題が本文の内容から解けること。正解が技術的に正しく、複数の選択肢が正解にならないこと。
- **誤答**: 不自然な穴埋めではなく、ありがちな誤解を反映して理解の差を確かめられること。
- **explanation**: 正解の理由を説明し、主な誤答がなぜ誤りかにも触れていること。
- **観点のカバー**: 問題群が、定義・原因・具体例・対策・落とし穴などレッスンの主要な観点をカバーしていること。
- **整合**: topic の概要、lesson の本文、問題の対象範囲が互いに矛盾しないこと。

判断に外部資料が必要な項目は、合格扱いにせず確認事項として残す。

## 判定

```text
verdict: pass | fail | incomplete
scope: 確認した content のパス
mechanical_checks: コマンドごとの pass / fail / not-run
content_review: must-fix / should-fix / nit の指摘（対象ファイル・問題・根拠・修正案）
unverified: 未確認の項目と理由
```

- **`pass`**: 機械検証が成功し、内容レビューに must-fix・should-fix がない。
- **`fail`**: 機械検証が失敗した、または must-fix・should-fix がある。
- **`incomplete`**: 必要な機械検証または内容レビューを実行できていない。

対象なし、未実行、実行失敗を合格として扱わない。対象となる変更がない場合も、機械検証は `content/` 全体に対して実行し、内容レビューは対象なしとして報告する。

## 注意

- 既存の lessonId / questionId は変更しない。変えると学習履歴と SRS 状態の紐付けが切れる。
- 本番教材は、1レッスン5〜7問を目安とする（Walking Skeleton の3問は例外）。
