# Weekly retrospective and Issue refinement

## Scheduled task prompt

推奨設定:

- 専用worktreeで実行する
- workspace-write。ネットワークまたはGitHub情報が利用できない場合は権限を広げず、レポートに制約として記録する

## 実行手順

### 1. 対象期間を決める

- 前回実行日時を確認できる場合は、その直後から今回実行時刻までを対象にする。
- 初回または前回日時が不明な場合は、今回実行時刻から直近7日間を対象にする。
- 日時は `Asia/Tokyo` でレポートに記載する。

### 2. 事実を収集する

取得できる範囲で次を読む。利用できない情報源は推測で補わず、制約として記録する。

1. 対象期間のGitコミット、変更領域、未コミット状態。
2. GitHubの既存Issueを先に取得する。open Issue、対象期間に更新またはcloseされたIssue、ラベル、本文、コメント、関連PR、依存関係を確認する。
3. 対象期間のPR、レビュー指摘、CI結果。レビュー後の修正は手戻りの兆候として扱うが、コミット名だけで原因を断定しない。
4. `.ai/logs/skill-usage.jsonl` の件数と開始・完了状況。ログは参考値であり、未記録を未使用、`started`だけを失敗と断定しない。
5. `AGENTS.md`、`docs/design.md`、対象期間に変更された `.ai/` のハーネス。

`.env`、認証情報、秘密鍵、証明書、接続文字列を読まない。週次分析だけのためにテストやbuildを実行しない。ユーザーの未コミット変更には触れない。

### 3. レトロスペクティブを行う

- Keepを最大3件に絞る。
- Problem候補ごとに、証拠、根本原因、既存ハーネスへの記載有無を整理する。
- 各Problemを次で分類する。
  - `採用`: 再発時の実害があり、構造的に再発しやすい。
  - `見送り`: 偶発的、または既存ルールの運用で防げる。
  - `過剰`: ルール化による硬直化が利益を上回る。
- Tryは次週に検証できる小さな行動として最大3件にする。
- 摩擦がなければ「恒久対策なし」と結論し、改善を捏造しない。

採用候補は変更せず、適用先だけを提案する。

### 4. 既存Issueをリファインする

リファイメントの主対象は既存Issueとする。各Issueについて次を確認する。

- 目的とユーザー価値が明確か。
- `docs/design.md` の該当節と整合しているか。
- 固有の受け入れ条件または完了条件が検証可能か。
- 依存Issue、関連PR、未決事項、ブロッカーが明記されているか。
- 1つの縦切り機能または独立タスクとして大きすぎないか。
- `issue-dev-orchestrate` に渡せる状態か。

各Issueを `Ready`、`Needs refinement`、`Blocked`、`Defer` に分類し、次のアクションを提案する。Issue本文、コメント、ラベル、状態は変更しない。

既存Issueでカバーされない改善だけを「新規Issue候補」として別枠にする。重複が疑われる場合は新規候補にせず、既存Issueとの統合案を出す。新規Issueは作成しない。

### 4.1 通常Issueのマージ後照合

`issueRefinement` とは別に、通常Issueのマージ後照合を行う。merge済みPRの本文またはコミットメッセージに、正確な `refs #<N>` がある通常Issueだけを対象にする。`refs #99` がないPRから #99 を対象化してはならない。

スパイクまたはフェーズ分割の状態照合で扱うIssueは通常Issueから除外する。現在Issue本文、GitHub sub-issue関係、実装方針コメントで親／子／phase／spike／implementation Issueとして明示された関係だけをその状態照合の対象とし、通常Issueの3分類と重複させない。通常Issueか判定できない場合は `meta.limitations` に記録し、`normalIssueReconciliation` へ入れず推測で分類しない。

対象ごとに、PR・merge先・Issue固有の完了条件の明示的証拠を照合し、次のいずれか1つに分類する。

- `close候補`: 全完了条件を根拠付きで充足し、未達・未検証・未移管条件がない。
- `残条件あり`: 未達または未検証の完了条件がある。
- `別Issueへ移管済み`: 未達条件と移管先Issueを対応付けられる。

親trackerはGitHub sub-issue関係など明示された関係だけを表示し、子Issueの現在分類を記録する。任意のIssue番号言及、参考リンク、推測から対象や親子関係を作らない。収集不能な情報は `meta.limitations` へ記録し、推測で分類しない。

Issueは自動closeせず、人間が最終判断する。各対象には関連PR、merge先、完了条件の根拠、残条件または移管先、人間の次アクションを必ず記録する。

### 5. 次週フォーカスを決める

- 主目標を1件選ぶ。
- 品質・保守目標を1件選ぶ。
- 明示的に今週やらないことを最大3件示す。
- `focus.priorityCandidates` に優先候補を最大3件まで入れ、各項目を `title` と `reason` で表す。`reason` には価値、緊急性、リスク低減、依存関係、規模感を選定根拠として記載する。

### 6. 固定HTMLレポートを生成する

1. `references/report-data.example.json` と同じ構造でJSONを一時領域に作る。通常Issueのマージ後照合は `normalIssueReconciliation` 配列に入れ、各要素に `issue`、`classification`、`pullRequests`、`completionCriteria`、`remainingConditions`、`transfer`、`parentTrackers`、`humanNextAction` を記録する。欠けた情報は、配列項目では空配列、文字列項目では空文字、`transfer` では `null` にし、推測で埋めない。
2. 次を実行する。

```bash
node .ai/automations/weekly-retro-refine/scripts/render-report.mjs \
  --input <report-data.json> \
  --output reports/weekly-retro/<YYYY-MM-DD>.html
```

`assets/report-template.html` の構造やスタイルを実行ごとに変更しない。レンダラー以外でHTMLを手編集しない。

### 7. 報告する

- 生成したHTMLのパス
- 対象期間と利用できた情報源
- 5行以内のエグゼクティブサマリー
- 承認が必要な提案を番号付きで列挙する

Issue・PR・コメント、アプリコード、ハーネスを変更しない。commit、push、mergeを行わない。
