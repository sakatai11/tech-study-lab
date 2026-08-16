---
name: release-main-pr
description: developからmainへのリリースPRを安全に作成し、完了を証明できるIssueだけをmainマージ時の自動close対象にする。リリースPRの作成、develop→mainの差分確認、リリースに含めるPR・Issueの整理、close候補の判定を依頼されたときに使用する。
---

# Main リリースPR

`develop` を `main` へ反映するPRだけを扱う。PRのマージ、Issueの直接close、auto-merge、リポジトリ設定の変更、関係ない変更のcommit/pushは行わない。Issueが閉じるのは、承認済みの`main`ベースPRを人間がマージしたときだけにする。

実行前に`.ai/runtime-compatibility.md`を全文読む。Codexでは開始直後と完了直前に`./.ai/hooks/log-skill-usage.sh --runtime codex --skill release-main-pr --status started|completed`を実行する。Claudeではhookが記録する。

## 事前確認

1. `gh auth status`でGitHub認証を確認する。認証できなければ停止する。
2. `gh repo view --json nameWithOwner,defaultBranchRef`で対象リポジトリと`defaultBranchRef.name`を取得し、default branchが`main`であることを確認する。`main`以外または取得不能なら、期待値と実際の値を報告してPR作成を停止する。closing keywordを含むPRは作成しない。
3. `git status --short`が空であることを確認する。空でなければユーザーに整理を依頼して停止する。
4. `git fetch origin main develop`を実行し、`origin/main`と`origin/develop`を基準にする。ローカルブランチや古いremote-tracking refから範囲を推測しない。
5. `base=main`かつ`head=develop`のopen PRを検索する。存在すればURL、状態、CIを報告し、新規作成しない。
6. `origin/main..origin/develop`が空でないことを、commit一覧と`git diff --quiet origin/main...origin/develop`の両方で確認する。空なら停止する。

## リリース範囲とIssue照合

1. `origin/main...origin/develop`のコミット・ファイル差分からリリース概要を作る。
2. GitHub上の`base=develop`でmergedのPRから、merge commitが`origin/develop`に到達可能かつ`origin/main`に未到達のものだけを、今回に含まれるPRとして確定する。マージ方法でcommit対応を確定できないPRは「要確認」に分け、含まれるPRやclose根拠に推測で入れない。
3. 確定したPRの本文と、同じリリース範囲内のそのPR由来commit messageだけから、正確な`refs #N`トークンを抽出する。単なる`#N`、参考リンク、任意のIssue言及、推測から候補を作らない。候補ごとに参照元PRまたはcommitを記録する。
4. 各候補番号について、先にGitHub REST Issue endpointの`gh api "repos/<nameWithOwner>/issues/<番号>"`応答を確認する。応答に`pull_request`フィールドがあれば、その番号はPRリソースでありIssueではない。自動close対象にせず、closing keywordなしの要確認候補へ「PRリソースのため」と記載する。
5. PRリソースではない候補Issueについて、次をすべてGitHubとリリース範囲の証拠で確認する。

   - IssueがOpenである。
   - 関連PRが`develop`へmerged済みで、今回のリリース範囲に入っている。
   - Issue固有の受け入れ条件すべてに、実装・テスト・レビュー・PRなどの証拠がある。
   - 未達項目がない。未達項目があれば、各項目に対応する移管先Issueが明示されている。
   - activeなspike、親tracker、未完了phase、または完了が曖昧なIssueではない。

6. 全条件を満たすIssueだけを自動close対象にする。ひとつでも証拠不足または判定不能なら、closing keywordを使わない要確認候補に分け、理由と不足証拠を記す。

## PR本文と作成

タイトルは`chore: merge develop into main`とする。本文には次の全項目を含める。

```markdown
## 概要

<origin/main...origin/developから作るリリース概要>

## 含まれるPR

- #<PR番号> <タイトル>
<または「なし」>

## mainマージ時に自動closeするIssue

- Closes #<Issue番号> — <Open状態、範囲内の関連PR、受け入れ条件、残条件なし/移管済み、非spike・非tracker・非phaseの根拠>
<対象がなければ「なし」>

## 要確認候補（closing keywordなし）

- #<Issue番号> — <候補にしたrefs #Nの参照元と、不確実な理由>
<候補がなければ「なし」>

## 確認結果

- リリース範囲: `origin/main...origin/develop`
- マージ可否: <状態>
- CI: <状態>
```

closing keywordは自動close対象の箇条書きだけに書く。要確認候補、概要、PR一覧には書かない。

`gh pr create`の直前に、タイトル、本文全文、正確な自動close対象の番号一覧を提示し、明示的なユーザー承認を得る。承認前はPRを作成しない。承認後は次の順で実行する。

1. `body_file=$(mktemp "${TMPDIR:-/tmp}/release-main-pr.XXXXXX")`で一意なファイルを作り、返された正確なパスを保持する。
2. 現在のランタイムのパッチ編集またはファイル書き込み機能を使い、承認済み本文全文をリテラルデータとしてそのパスへ書く。shellのheredoc、`echo`、`printf`、リダイレクトで本文を書かない。書き込み後にファイルを読み、承認済み本文と完全一致することを確認する。不一致ならPRを作成せず一時ファイルを削除する。
3. 検証済みの一時パスだけを引用符付きで`body_file`へ設定し、`trap 'rm -f "$body_file"' EXIT`の登録と`gh pr create --base main --head develop --title "chore: merge develop into main" --body-file "$body_file"`を一つのshell invocation内でこの順に非対話実行する。

作成後にPR URLを報告し、GitHub上のmergeable状態とCI状態を確認する。マージ不能またはCI未完了・失敗なら、その状態を報告して人間の判断を待つ。

## 禁止操作

`gh pr merge`、`gh issue close`、auto-mergeの有効化、リポジトリ設定の変更、関係ない変更の`git commit`・`git push`を実行しない。重複PRがあるときも、そのPRを変更・マージしない。

## 完了報告

作成したPRのURL、mergeable状態、CI状態、自動close対象と要確認候補を報告する。作成しなかった場合は、停止理由と次に必要な人間の判断を報告する。
