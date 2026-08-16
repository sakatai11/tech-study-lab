---
name: release-main-pr
description: developからmainへのリリースPRを安全に作成し、完了を証明できるIssueだけをmainマージ時の自動close対象にする。リリースPRの作成、develop→mainの差分確認、リリースに含めるPR・Issueの整理、close候補の判定を依頼されたときに使用する。
---

# Main リリースPR

`develop` を `main` へ反映するPRだけを扱う。PRのマージ、Issueの直接close、auto-merge、リポジトリ設定の変更、関係ない変更のcommit/pushは行わない。Issueが閉じるのは、承認済みの`main`ベースPRを人間がマージしたときだけにする。

実行前に`.ai/runtime-compatibility.md`を全文読む。Codexでは開始直後に`./.ai/hooks/log-skill-usage.sh --runtime codex --skill release-main-pr --status started`を実行し、完了直前に`./.ai/hooks/log-skill-usage.sh --runtime codex --skill release-main-pr --status completed`を実行する。Claudeではhookが記録する。

## 事前確認

1. `gh auth status`でGitHub認証を確認する。認証できなければ停止する。
2. `gh repo view --json nameWithOwner,defaultBranchRef`で対象リポジトリと`defaultBranchRef.name`を取得し、default branchが`main`であることを確認する。`main`以外または取得不能なら、期待値と実際の値を報告してPR作成を停止する。closing keywordを含むPRは作成しない。
3. `git status --short`が空であることを確認する。空でなければユーザーに整理を依頼して停止する。
4. `git fetch origin main develop`を実行し、終了コード0の場合だけ`origin/main`と`origin/develop`を基準にする。失敗したらエラーを報告して停止し、キャッシュ済みのremote-tracking refを使わない。ローカルブランチや古いremote-tracking refから範囲を推測しない。
5. `base=main`かつ`head=develop`のopen PRを検索する。存在すればURL、状態、CIを報告し、新規作成しない。
6. `origin/main..origin/develop`が空でないことをcommit一覧で確認する。続けて`git diff --quiet origin/main...origin/develop`を実行し、終了コード0なら差分なしとして停止、1なら差分ありとして続行、0と1以外なら検証エラーを報告して停止する。終了コードを`|| true`などで握りつぶさない。

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

closing keywordは自動close対象の箇条書きだけに書く。要確認候補、概要、PR一覧には書かない。本文生成後は本文全文を対象に、大文字小文字を区別せず、`close`、`closes`、`closed`、`fix`、`fixes`、`fixed`、`resolve`、`resolves`、`resolved`と任意のコロンに続く同一または別リポジトリのIssue参照をすべてトークン単位で抽出する。1行に複数のIssue参照があればすべて抽出する。抽出結果が自動close対象の番号集合と完全一致し、重複がなく、すべて自動close欄の規定書式に由来することを確認する。予期しない、欠落、重複、または自動close欄外のclosing tokenが1つでもあれば作成を停止し、本文と候補判定を作り直して全文を再提示し、新しい承認を得る。

`gh pr create`の直前に、タイトル、本文全文、正確な自動close対象の番号一覧を提示し、明示的なユーザー承認を得る。承認前はPRを作成しない。承認後かつ一時ファイル作成前に、`git fetch origin main develop`、remote refのSHA、差分有無、重複PR、含まれるPR、Issue候補、自動close対象、生成本文を同じ規則で再検証する。fetch失敗または検証エラーなら停止する。remote refのSHA、含まれるPR番号、自動close対象番号、本文からなる承認時のrelease fingerprintと再検証結果が変わった場合、以前の承認を無効にし、タイトル、本文、候補判定を再生成して全文を再提示し、新しい明示的承認を得る。再検証結果が一致した場合だけ次の順で実行する。

1. `body_file=$(mktemp "${TMPDIR:-/tmp}/release-main-pr.XXXXXX")`で一意なファイルを作り、返された正確なパスを保持する。
2. 現在のランタイムのパッチ編集またはファイル書き込み機能を使い、承認済み本文全文をリテラルデータとしてそのパスへ書く。shellのheredoc、`echo`、`printf`、リダイレクトで本文を書かない。本文の書き込みに失敗した場合は、返された正確な一時パスを削除して停止する。書き込み後にファイルを読み、承認済み本文と完全一致することを確認する。不一致ならPRを作成せず、返された正確な一時パスを削除して停止する。
3. 検証済みの一時パスだけを引用符付きで`body_file`へ設定し、`trap 'rm -f "$body_file"' EXIT`の登録と`gh pr create --base main --head develop --title "chore: merge develop into main" --body-file "$body_file"`を一つのshell invocation内でこの順に非対話実行する。

作成後はPR URLを報告し、`gh pr view <PR番号> --json mergeable,mergeStateStatus,statusCheckRollup`でmergeable状態をポーリングする。`UNKNOWN`の間は完了扱いせず再確認し、`CONFLICTING`なら状態を報告して人間の判断を待つ。`MERGEABLE`になってもCI成功とは扱わず、`gh pr checks <PR番号> --required`でrequired checkを別に特定する。required checkが存在し、すべて成功した場合だけ完了扱いにする。required checkの欠落、pending、cancelled、failureその他の非成功状態は完了扱いにせず、pendingなら待機・再確認し、欠落・cancelled・failureなら状態を報告して再実行または人間の判断を待つ。

## 禁止操作

`gh pr merge`、`gh issue close`、auto-mergeの有効化、リポジトリ設定の変更、関係ない変更の`git commit`・`git push`を実行しない。重複PRがあるときも、そのPRを変更・マージしない。

## 完了報告

作成したPRのURL、確定したmergeable状態、required checkの状態、自動close対象と要確認候補を報告する。作成しなかった場合は、停止理由と次に必要な人間の判断を報告する。
