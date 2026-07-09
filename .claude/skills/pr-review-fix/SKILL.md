---
name: pr-review-fix
description: PRのレビューコメント・指摘事項を gh CLI（gh pr-review 拡張）で取得し、各指摘の適用可否を判断した上で修正を実装、品質ゲート（typecheck/lint/test）を通してコミット・プッシュし、レビュースレッドへの返信・解決まで一気通貫で行う。「PRの指摘に対応して」「レビューコメントを直して」「PRコメントを解消して」などで使用する。
argument-hint: [PR番号（省略時は現在ブランチのPR）]
---

# PR レビュー指摘対応

`gh pr-review` 拡張（[agynio/gh-pr-review](https://github.com/agynio/gh-pr-review)、インストール済み）を使い、PRへのレビュー指摘の取得 → 適用可否判断 → 修正実装 → 品質ゲート → コミット・プッシュ → スレッド返信・解決までを行う。

進捗は TodoWrite でフェーズごとに管理する。

## フェーズ0: PRコンテキスト取得

```bash
gh pr view <PR番号（省略可）> --json number,title,author,state,baseRefName
git remote get-url origin
git status --porcelain
```

- `baseRefName` を確認する（本プロジェクトの feature ブランチは `develop` がベース）。
- 作業ツリーがクリーンでない場合はユーザーに確認してから進める。

## フェーズ1: レビュースレッド一覧取得

```bash
gh pr-review threads list --pr <N> --repo <OWNER/REPO>
```

スレッドが無ければ通常コメントを検索する:

```bash
gh pr view <N> --comments --json author,comments,reviews
```

## フェーズ2: 指摘内容の分析・適用可否判断

```bash
gh api repos/<OWNER>/<REPO>/pulls/<N>/comments --jq '.[] | {id,body,author,created_at,line,path}'
```

- 指摘されたファイルを Read で読み、`docs/design.md`・既存パターンと照らして**現在のコードに対して的確か**を確認する。
- 重要度分類: High（セキュリティ・バグ・破壊的変更）/ Medium（品質・保守性・テスト不足）/ Low（スタイル・ドキュメント）。
- 指摘が不正確・古い・このコードベースで意味をなさない場合は、**実装せず理由を添えて返信する**（面倒だからスキップは禁止。必ず対応するか、明確な理由を説明する）。

## フェーズ3: 修正実装

- Edit/Write で修正する。既存パターン・Biome設定・AGENTS.md / `docs/design.md` のガードレールに従う。
- 型は `packages/shared` から共有し、二重定義しない。SRSロジックなど純粋関数部分に触れる場合は Vitest のテストも追加・更新する。
- API入力バリデーションは Zod（`zValidator`）に集約する。

## フェーズ4: 品質ゲート検証（返信前に必須）

```bash
pnpm typecheck
pnpm lint    # biome check .
pnpm test
```

全て通ることを確認する。落ちた場合は原因を分析して修正し再実行する（同じ失敗を繰り返さない）。

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

指摘を適用しなかった場合は、上記の代わりに理由を明記して返信する。通常コメント（レビュースレッドでない場合）は以下で返信する:

```bash
gh pr comment <N> --body "..."
```

## フェーズ7: フォローアップ待機・スレッド解決

最大5分（1分×5回）フォローアップを待つ:

```bash
sleep 60
gh pr-review threads list --pr <N> --repo <OWNER/REPO>
```

新たな返信があればフェーズ2〜6を繰り返す。なければ:

- outdated スレッド（`isOutdated: true`）: 返信不要で解決
- active スレッド: 返信確認後に解決

```bash
gh pr-review threads resolve --pr <N> --repo <OWNER/REPO> --thread-id <THREAD_ID>
```

## フェーズ8: 最終確認

```bash
gh pr-review threads list --pr <N> --repo <OWNER/REPO>
git status
```

全スレッド `isResolved: true`、作業ツリークリーンを確認し、ユーザーに完了報告する（対応した指摘 / スキップした指摘と理由 / 品質ゲート結果 / コミットハッシュ）。

## 注意事項

- **`gh pr merge` は使わない**（マージは常に人間の判断。settings.json で禁止されている）。
- 本スキルは PR の指摘対応・返信・スレッド解決のみを行い、`develop` → `main` のマージ判断には関与しない。
- 同じコマンド・操作が2回失敗した場合は繰り返さず、根本原因を分析して別のアプローチを取る。
