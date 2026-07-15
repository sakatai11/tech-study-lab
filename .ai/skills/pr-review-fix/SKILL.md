---
name: pr-review-fix
description: PRのレビューコメント・指摘事項を確認し、各指摘の適用可否を判断した上で修正を実装、品質ゲート（typecheck/lint/test）を通してコミット・プッシュし、レビュースレッドへの返信・解決まで一気通貫で行う。認証済みのgh CLIを使い、Codex Appでは接続済みGitHubコネクタも利用できる。「PRの指摘に対応して」「レビューコメントを直して」「PRコメントを解消して」などで使用する。
---

# PR レビュー指摘対応

実行前に `.ai/runtime-compatibility.md` を全文読み、現在のランタイムに合わせてツールを読み替える。

Codexでは開始直後と完了直前に `./.ai/hooks/log-skill-usage.sh --runtime codex --skill pr-review-fix --status started|completed` を実行して共通ログへ記録する（Claudeではhookが自動記録する）。

`gh auth status` で認証を確認してから、認証済みの `gh pr-review` 拡張または `gh api` を使い、PR・コメント・レビュー スレッドを取得・返信・解決する。Codex AppでGitHubコネクタが接続済みの場合は、同等の操作にコネクタを使ってよい。ローカルの修正・コミット・プッシュは Git を使う。

進捗は現在のランタイムで利用可能な plan/todo 機能でフェーズごとに管理する。利用できなければフェーズ完了時の短い報告で代替する。

## フェーズ0: PRコンテキスト取得

```bash
gh auth status
gh extension list
gh pr view <PR番号（省略可）> --json number,title,author,state,baseRefName
git remote get-url origin
git status --porcelain
```

- `baseRefName` を確認する（本プロジェクトの feature ブランチは `develop` がベース）。
- 作業ツリーがクリーンでない場合はユーザーに確認してから進める。
- `gh` の認証状態を確認する。Codex AppでGitHubコネクタが接続済みの場合は、PRメタデータ・コメント・レビュー スレッドの取得にコネクタを使ってよい。

## フェーズ1: レビュースレッド一覧取得

レビュースレッド一覧を取得する。Codex AppでGitHubコネクタが接続済みの場合は、同等の取得にコネクタを使ってよい:

```bash
gh pr-review threads list --pr <N> --repo <OWNER/REPO>
```

スレッドが無ければ、通常コメントを検索する。Codex AppでGitHubコネクタが接続済みの場合は、同等の取得にコネクタを使ってよい:

```bash
gh pr view <N> --comments --json author,comments,reviews
```

## フェーズ2: 指摘内容の分析・適用可否判断

対象コメント・行・投稿者を確認する。Codex AppでGitHubコネクタが接続済みの場合は、同等の取得にコネクタを使ってよい:

```bash
gh api repos/<OWNER>/<REPO>/pulls/<N>/comments --jq '.[] | {id,body,author,created_at,line,path}'
```

- 指摘されたファイルを読み、`docs/design.md`・既存パターンと照らして**現在のコードに対して的確か**を確認する。
- 重要度分類: High（セキュリティ・バグ・破壊的変更）/ Medium（品質・保守性・テスト不足）/ Low（スタイル・ドキュメント）。
- 指摘が不正確・古い・このコードベースで意味をなさない場合は、**実装せず理由を添えて返信する**（面倒だからスキップは禁止。必ず対応するか、明確な理由を説明する）。

## フェーズ3: 修正実装

- パッチ編集機能で修正する。既存パターン・Biome設定・AGENTS.md / `docs/design.md` のガードレールに従う。
- 型は `packages/shared` から共有し、二重定義しない。SRSロジックなど純粋関数部分に触れる場合は Vitest のテストも追加・更新する。
- API入力バリデーションは Zod（`zValidator`）に集約する。

## フェーズ4: 品質ゲート検証（返信前に必須）

```bash
pnpm typecheck
pnpm lint    # biome check .
pnpm test
```

変更起因のゲートが全て通ることを確認する。落ちた場合は原因を分析して修正し再実行する（同じ失敗を繰り返さない）。

> **スコープの注意**: `pnpm lint` / `pnpm test` はリポジトリ全体が対象のため、今回の変更と無関係な既存失敗が出ることがある。その場合は変更ファイルにスコープを絞って判断し、既存失敗はベースラインとして報告する。

## フェーズ5: コミット・プッシュ

```bash
git status
git add <files>
git commit -m "$(cat <<'EOF'
fix: PRレビュー指摘対応

- 対応した指摘の要約
EOF
)"
git push
```

- 現在の feature ブランチにそのままプッシュする（新規ブランチ作成や `main` への操作は行わない）。

## フェーズ6: レビュースレッドへ返信

全てのオープンスレッドに、対応内容 or スキップ理由を返信する。

対象のインラインコメントへ返信する。Codex AppでGitHubコネクタが接続済みの場合は、同等の操作にコネクタを使ってよい:

```bash
gh pr-review comments reply \
  --pr <N> --repo <OWNER/REPO> --thread-id <THREAD_ID> \
  --body "$(cat <<'EOF'
@reviewer フィードバックありがとうございます。以下の対応を行いました:

1. ...
2. ...

変更はコミット <hash> に含まれています。typecheck / lint / test すべてパス済みです。
EOF
)"
```

指摘を適用しなかった場合は、上記の代わりに理由を明記して返信する。通常コメントへも返信する。Codex AppでGitHubコネクタが接続済みの場合は、同等の操作にコネクタを使ってよい:

```bash
gh pr comment <N> --body-file <返信本文を保存した一時ファイル>
```

## フェーズ7: フォローアップ待機・スレッド解決

ユーザーが待機を明示した場合のみ最大5分フォローアップを待つ。ランタイムの wait/monitor 機能を優先し、CLI しかない場合は短い poll を別々に実行して進捗を共有する:

レビュースレッドを再取得する。Codex AppでGitHubコネクタが接続済みの場合は、同等の取得にコネクタを使ってよい:

```bash
gh pr-review threads list --pr <N> --repo <OWNER/REPO>
```

- この5分は目安であり固定値ではない。人間レビュアーの即時応答は稀なので、状況（レビュアーがボット/自動化ツールか、緊急度が高いか等）に応じて待機回数を減らしたり省略してよい。

新たな返信があればフェーズ2〜6を繰り返す。なければ:

- outdated スレッド（`isOutdated: true`）: 返信不要で解決
- active スレッド: 返信確認後に解決

アクティブなスレッドを解決する。Codex AppでGitHubコネクタが接続済みの場合は、同等の操作にコネクタを使ってよい:

```bash
gh pr-review threads resolve --pr <N> --repo <OWNER/REPO> --thread-id <THREAD_ID>
```

## フェーズ8: 最終確認

スレッド状態を確認し、`git status` で作業ツリーを確認する。Codex AppでGitHubコネクタが接続済みの場合は、スレッド状態の確認にコネクタを使ってよい:

```bash
gh pr-review threads list --pr <N> --repo <OWNER/REPO>
git status
```

全スレッド `isResolved: true`、作業ツリークリーンを確認し、ユーザーに完了報告する（対応した指摘 / スキップした指摘と理由 / 品質ゲート結果 / コミットハッシュ）。

## 注意事項

- **`gh pr merge` は使わない**（マージは常に人間の判断。`AGENTS.md` で禁止されている）。
- 本スキルは PR の指摘対応・返信・スレッド解決のみを行い、`develop` → `main` のマージ判断には関与しない。
- 同じコマンド・操作が2回失敗した場合は繰り返さず、根本原因を分析して別のアプローチを取る。
