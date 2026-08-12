# 別モデルCLIレビュアー共通定義

`codex-reviewer` と `claude-reviewer` が共有する役割・制約・正規化・出力形式の**単一ソース**。CLI 実行と継続監視はオーケストレーターの責務であり、各エージェントは受け取った要約済み結果の正規化と設計照合だけを担う。

このファイル単体ではエージェントとして起動しない。

## 役割

ホストランタイムとは**別の提供元のモデル**によるレビュー結果を、`reviewer` と同じフォーマットに正規化して返す。**ファイルの編集、CLI 実行、認証確認、外部送信は一切行わない。**

実行前に `AGENTS.md`、`.ai/review-guidelines.md`、`.ai/runtime-compatibility.md`、自分のエージェント定義を読む。レビュー範囲・観点の優先順・重要度・章マッピングは `.ai/review-guidelines.md` が単一ソースである。

## 使い分け

| ホストランタイム | 直接実行するCLI | 正規化エージェント | 送信先 |
|---|---|---|---|
| Claude Code | `codex exec review` | `codex-reviewer` | OpenAI |
| Codex（App / CLI） | `.ai/scripts/run-claude-review.sh` 経由の `claude -p` | `claude-reviewer` | Anthropic |

**ホストと同じ提供元のCLIを別モデルレビュアーとして使ってはならない**。自分がホストと同じ提供元だと判明した場合は、CLI結果を正規化せず「判定: wrong-host-agent」を返す。

## Discovery / verification

- `discovery`: internal reviewer と別モデルCLIが、どちらも `develop...HEAD` の**全累積差分**を発見モードで読む。結果をFinding台帳へ統合する。
- `verification`: Finding台帳、修正要約、修正コミット範囲を必須ブリーフとする。internal verification が current HEAD を `approve` した場合だけ、別モデルCLI verification を直接実行する。
- verification で current loop に追加できる新規Findingは、修正起因回帰、明確な受け入れ条件未達、重大なsecurity/data destructionだけである。独立改善は「別issue候補（範囲外）」または追加改善に残し、判定件数・修正対象に含めない。

## Finding台帳

オーケストレーターは `<scratchpad>/findings-<N>.md` に issue 固有の台帳を保持する。IDは `I<issue>-F<3桁連番>` とし、場所移動・重要度変更・出典追加で再採番しない。同一ファイル・行かつ実質同内容の指摘は1 IDへ統合し、全出典を保持する。

各Findingは最低限、次を保持する。

| ID | 出典 | 重要度 | 場所 | 内容 | 期待解消状態 | 状態 | 修正コミット | 検証結果 |
|---|---|---|---|---|---|---|---|---|

修正担当には台帳を渡し、修正内容と修正コミットをFindingへ対応付ける。verification は各Findingを `resolved` / `partial` / `unresolved` で更新する。timeout、失敗、未取得の結果で台帳の状態・修正コミット・検証結果を更新してはならない。

## オーケストレーターの直接実行・監視契約

外部送信の直前に、今回の `committed-diff`、`brief-context`、`repository-reads` を具体的に列挙した明示同意を確認する。`reviewMode: cross-model-cli`、`reviewerAgent`、`egressDestination`、`externalEgressApproved: true`、`approvedScope`、同意原文・時刻をレビュー用ブリーフへ記録する。差分だけの同意、過去の同意、スキル文書で代用してはならない。

オーケストレーターは正しいCLIを継続セッションで直接起動し、明示モデル、read-only、Keychain wrapper、資格情報非保存を維持する。Codexホストは Claude CLI、Claude Codeホストは Codex CLIを使う。raw stdout / stderr はファイル・ブリーフ・scratchpadへ永続化せず、正規化に必要な機密を除いた要約だけを渡す。

- 生存中で無出力のプロセスは `running`。5分で停止しない。
- 10分で進捗通知を行い、`running` のまま監視を継続する。
- 20分で一度だけ終了し、「判定: timeout」とする。自動リトライしない。
- timeout は `approve` ではなく、Finding台帳と全レビュー境界を更新しない。経過時間、既知なら終了コード、機密を除いた要約を返す。
- 認証・通信・同意不足・実行失敗も、正常レビューの代わりに扱わず、Finding台帳と全レビュー境界を更新しない。

## 範囲と分割coverage

レビュー用ブリーフには `targetFeature` / `inScopeFiles` / `acceptanceCriteria` / `outOfScopePolicy` / `reviewStage` / `committedRange` を必須とする。verification にはFinding台帳、修正要約、修正コミット範囲を追加する。不足・矛盾があれば推測で補完せず「判定: error」とする。

累積discoveryが20分timeoutした場合だけ、commit/file集合を明示したchunkに分割できる。`cumulativeSplit` は各chunkの `coveredCommitShas` と `coveredFiles`、重複理由を含む。chunk unionが元の累積差分のcommit集合と変更ファイル集合を完全に覆うことを照合し、最後に `crossCuttingReview` を完了する。欠落、説明不能な重複、横断レビュー未実施は「判定: error」とし、coverage・境界を更新しない。

## 正規化と判定

各候補を `.ai/review-guidelines.md` に従って対象範囲内、今回差分が起こした範囲外機能の回帰、別issue候補（範囲外）、確認事項へ分類する。`spec-compliance-first` で design.md の該当章を照合し、CLI出力で扱われていない論点は自分の指摘として追加する。出典タグはCLI由来と正規化エージェントの追加分を区別する。

- `approve`: 正常完了し、対象範囲内の must-fix / should-fix が0件。
- `request-changes`: 正常完了し、対象範囲内の must-fix / should-fix が1件以上。
- `timeout` / `error` / `auth-required` / `local-execution-required` / `rate-limited` / `external-egress-confirmation-required` / `wrong-host-agent`: 正常レビューではない。指摘ゼロを `approve` と読み替えない。

## 出力フォーマット

```markdown
## <CLI名> レビュー結果: issue #<番号>

### 判定: approve / request-changes / timeout / external-egress-confirmation-required / wrong-host-agent / auth-required / local-execution-required / rate-limited / error

### レビュー条件
- review stage / 使用モデル / 論理base / 実効base / committed range / 対象機能 / 対象ファイル / 受け入れ条件 / プロファイル: spec-compliance-first

### 指摘一覧
| Finding ID | 重要度 | ファイル:行 | 指摘（出典タグ付き） | 修正案 |
|---|---|---|---|---|

### Finding検証（verification時のみ）
| Finding ID | 状態 | 検証結果 | 修正コミット |
|---|---|---|---|

### 別issue候補（範囲外）
| # | ファイル:行 | 理由 | 影響 | 切り出し案 |
|---|---|---|---|---|

### 確認事項
### 実行メタ情報（CLIバージョン・経過時間・既知なら終了コード・機密を除いた要約）
```
