---
name: pr-review-fix
description: PRのレビューコメント・指摘事項を確認し、各指摘の適用可否を判断した上で修正を実装、issue-dev-orchestrate と同じ品質ゲートを通してコミット・プッシュし、レビュースレッドへの返信・解決まで一気通貫で行う。認証済みのgh CLIを使い、Codex Appでは接続済みGitHubコネクタも利用できる。「PRの指摘に対応して」「レビューコメントを直して」「PRコメントを解消して」などで使用する。
---

# PR レビュー指摘対応

PR についたレビュー指摘を、適用可否を判断したうえで修正・返信・解決まで処理する。進め方は任せる。以下の流れ・不変条件・完了条件を守ること。

実行前に `.ai/runtime-compatibility.md` を全文読み、現在のランタイムに合わせてツールを読み替える。

Codexでは開始直後と完了直前に `./.ai/hooks/log-skill-usage.sh --runtime codex --skill pr-review-fix --status started|completed` を実行して共通ログへ記録する（Claudeではhookが自動記録する）。

## GitHub 操作

`gh auth status` で認証を確認してから、PR・コメント・レビュースレッドの取得・返信・解決には、認証済みの `gh pr-review` 拡張（スレッド操作）と `gh pr view` / `gh pr comment` / `gh api`（通常コメント・行コメント）を使う。Codex App で GitHub コネクタが接続済みの場合は、本スキル内のすべての GitHub 操作を同等のコネクタ操作に置き換えてよい。ローカルの修正・コミット・プッシュは Git で行う。

主なコマンド:

```bash
gh pr view <N> --json number,title,author,state,baseRefName
gh pr-review threads list --pr <N> --repo <OWNER/REPO>
gh pr view <N> --comments --json author,comments,reviews
gh api repos/<OWNER>/<REPO>/pulls/<N>/comments --jq '.[] | {id,body,user:.user.login,line,path}'
gh pr-review comments reply --pr <N> --repo <OWNER/REPO> --thread-id <THREAD_ID> --body-file <file>
gh pr comment <N> --body-file <file>
gh pr-review threads resolve --pr <N> --repo <OWNER/REPO> --thread-id <THREAD_ID>
```

## 不変条件

**効率や「今回は問題ない」を理由に破らない。**

- **`gh pr merge` を使わない**。マージは常に人間が判断する。本スキルは `develop` → `main` の判断にも関与しない。
- **品質ゲートは返信の前に通す**。ゲートを通していない修正を「対応済み」と返信しない。
- **適用しない指摘には理由を返信する**。不正確・古い・`docs/design.md` や既存方針と矛盾する指摘は実装せず、技術的な根拠を示して返信する。面倒だからという理由のスキップは禁止。
- **同じ操作が2回失敗したら繰り返さない**。根本原因を分析して別の方法を取る。
- 現在の PR ブランチにそのまま push する。新規ブランチの作成、`main` への操作、force push や履歴の書き換えはしない。
- 作業開始時に未コミット変更があれば、ユーザーに確認してから進める。ユーザー変更を stash・破棄・コミットしない。
- 失敗を `|| true` などで隠さない。テストを弱めて通さない。

## 流れ

1. **指摘の取得**: PR（`baseRefName` を含む）、レビュースレッド、通常コメントを取得する。スレッドが無ければ通常コメントを確認する。
2. **適用可否の判断**: 指摘されたファイルを読み、`docs/design.md`・変更領域の `.ai/rules/*.md`・既存パターンと照らして**現在のコードに対して的確か**を確かめる。重要度は `.ai/review-guidelines.md` の定義（must-fix / should-fix / nit）で分類する。
3. **修正**: 既存パターンと AGENTS.md / `docs/design.md` のガードレールに従う。SRS などの純粋関数に触れる場合はテストを追加・更新する（`.ai/rules/testing.md`）。
4. **品質ゲート**: `issue-dev-orchestrate` スキルの「品質ゲート」節（`.ai/skills/issue-dev-orchestrate/SKILL.md`）をそのまま適用する。条件付きのゲート（snapshot 更新、ハーネス変更時、教材変更時）とベースライン失敗の扱いも同節に従う。
5. **コミット・push**: 対応した指摘の要約をコミットメッセージに含め、現在のブランチへ push する。
6. **返信・スレッド解決**: すべてのオープンスレッドに、対応内容（コミットハッシュ・ゲート結果）または適用しない理由を返信する。インラインのスレッドには `gh pr-review comments reply`、通常コメントには `gh pr comment` で返信する。返信済みのスレッドは解決する。`isOutdated: true` のスレッドは、指摘がすでに解消していれば返信せずに解決してよい。フォローアップを待つのはユーザーが明示した場合だけとし、待ち方はランタイムに合わせて判断する。新しい指摘が来たら 2〜6 を繰り返す。
7. **最終確認**: スレッドを再取得して全スレッドが解決済みであること、`git status` で作業ツリーがクリーンであることを確認する。

## 完了報告

- 対応した指摘と、適用しなかった指摘・その理由
- 品質ゲートの結果（ベースライン失敗を含む）
- コミットハッシュ
- 未解決のスレッドが残る場合はその理由
