# 別モデルCLIレビュー正規化共通定義

`codex-review-normalizer` と `claude-review-normalizer` が共有する役割・制約・正規化・出力形式の**単一ソース**。CLI 実行と継続監視はオーケストレーターの責務であり、各エージェントは受け取った要約済み結果の正規化と設計照合だけを担う。

このファイル単体ではエージェントとして起動しない。

## 役割

ホストランタイムとは**別の提供元のモデル**によるレビュー結果を、`reviewer` と同じフォーマットに正規化して返す。**ファイルの編集、CLI 実行、認証確認、外部送信は一切行わない。**

実行前に `AGENTS.md`、`.ai/review-guidelines.md`、`.ai/runtime-compatibility.md`、自分のエージェント定義を読む。レビュー範囲・観点の優先順・重要度・章マッピングは `.ai/review-guidelines.md` が単一ソースである。

## 使い分け

| ホストランタイム | 直接実行するCLI | 正規化エージェント | 送信先 |
|---|---|---|---|
| Claude Code | `codex exec review` | `codex-review-normalizer` | OpenAI |
| Codex（App / CLI） | `.ai/scripts/run-claude-review.sh` 経由の `claude -p` | `claude-review-normalizer` | Anthropic |

**ホストと同じ提供元のCLIを別モデルレビューに使ってはならない**。正規化エージェントがホストに不適合だと判明した場合は、CLI結果を正規化せず「判定: wrong-host-agent」を返す。

## Discovery / verification

- `discovery`: internal reviewer と別モデルCLIが、どちらも `develop...HEAD` の**全累積差分**を発見モードで読む。結果をFinding台帳へ統合する。
- `verification`: Finding台帳、修正要約、修正コミット範囲を必須ブリーフとする。internal verification が current HEAD を `approve` した場合だけ、別モデルCLI verification を直接実行する。
- verification で current loop に追加できる新規Findingは、修正起因回帰、明確な受け入れ条件未達、重大なsecurity/data destructionだけである。独立改善は「別issue候補（範囲外）」または追加改善に残し、判定件数・修正対象に含めない。

## 外部レビュー方針と判定規則

`reviewPolicy`は次の3つとし、未指定時は`risk-based`とする。

- `always`: `externalReviewDecision: required`
- `risk-based`: current HEADの累積差分とinternal discovery結果を以下の規則で判定する
- `never`: ユーザーの明示指定がある場合だけ`externalReviewDecision: not-required-by-policy`

`risk-based`では、次の必須規則が1つでも該当すれば`required`とする。

- `ER-1 executable-behavior`: 本番実行コード、ユーザー観測可能な振る舞い、またはデータ更新処理を変更する
- `ER-2 contract-or-schema`: API、Zod、共有型、DBスキーマ、migration、永続化形式、外部契約を変更する
- `ER-3 security-or-sensitive-data`: 認証、認可、権限、入力検証、秘密情報、個人情報、セキュリティ境界に触れる
- `ER-4 critical-domain-logic`: SRS、採点、学習状態、重要な業務ルールまたはデータ破壊リスクに触れる
- `ER-5 supply-chain-or-delivery`: dependency、lockfile、build、deploy、CI、runtime設定、生成・配布経路を変更する
- `ER-6 cross-cutting`: 複数package、複数レイヤー、または設計境界を横断する
- `ER-7 internal-review-signal`: internal discoveryにmust-fix / should-fix、正確性やスコープを左右する確認事項、または未検証の不確実性がある
- `ER-8 external-continuity`: 同一実行で別モデルCLI discoveryを実施済み、または別モデル由来のrequired Findingをverificationする
- `ER-9 uncertain-classification`: 変更の意味・影響・分類を確信をもって説明できない

すべての変更hunkが非実行の文書、コメント、誤字、表示だけのメタデータ、または意味を変えないformatに限定され、`ER-1`から`ER-9`のどれにも該当しない場合だけ、`LR-1 non-executable-only`として`not-required-by-policy`にできる。テスト、snapshot、教材・問題本文、設定、生成物だけの変更を、拡張子だけで`LR-1`と推測しない。

判定には`reviewPolicy`、`externalReviewDecision`、該当規則ID、具体的根拠、`decisionHead`を記録する。`decisionHead`がcurrent HEADと一致しなければ無効である。`required`判定またはCLI開始後のtimeout・認証・通信・同意不足・実行失敗を、オーケストレーター判断で`not-required-by-policy`へ変更してはならない。

### 有効なverification経路

レビュー済み境界を更新できる有効なverification経路は、current HEADに対するinternalが正常に`approve`し、required Finding（must-fix / should-fix）が全件`resolved`となり、さらに次のどちらかを満たす経路だけである。

- `externalReviewDecision: required`: current HEADに対する別モデルCLIも正常に`approve`
- `externalReviewDecision: not-required-by-policy`: current HEADと一致する`decisionHead`、有効な`reviewPolicy`、規則ID、根拠が記録済み

Findingが0件の場合、required Finding全件resolvedは真だが、internal verificationと上記の外部レビュー経路は省略しない。`not-required-by-policy`は外部`approve`ではない。`partial` / `unresolved` のrequired Finding、internalの`request-changes`、必須CLIのtimeout・失敗・未取得、古い`decisionHead`では境界を更新しない。

## Finding台帳

オーケストレーターは `<scratchpad>/findings-<N>.md` に issue 固有の台帳を保持する。IDは `I<issue>-F<3桁連番>` とし、場所移動・重要度変更・出典追加で再採番しない。同一ファイル・行かつ実質同内容の指摘は1 IDへ統合し、全出典を保持する。

各Findingは最低限、次を保持する。

| ID | 出典 | 重要度 | 場所 | 内容 | 期待解消状態 | 状態 | 修正コミット | 検証結果 |
|---|---|---|---|---|---|---|---|---|

修正担当には台帳を渡し、修正内容と修正コミットをFindingへ対応付ける。verification は各Findingを `resolved` / `partial` / `unresolved` で更新する。required Findingに `partial` / `unresolved` が残る場合は `request-changes` として修正ループへ戻す。timeout、失敗、未取得の結果で台帳の状態・修正コミット・検証結果を更新してはならない。

## オーケストレーターの直接実行・監視契約

最初の外部送信直前に、今回の `committed-diff`、`brief-context`、`repository-reads` を具体的に列挙した明示同意を確認する。`reviewMode: cross-model-cli`、`normalizerAgent`、`egressDestination`、`externalEgressApproved: true`、`approvedScope`、`approvalValidity: current-skill-run`、同意原文・時刻をレビュー用ブリーフへ記録する。

同一スキル実行のverificationでは、送信先、issue、branch、effective base、変更ファイルとrepository readsが承認済みパスの部分集合、データ種別、read-only能力がすべて同じ承認範囲内なら同意を再利用できる。いずれかが変わる、承認済み範囲外の内容や新しい機密カテゴリを送る、実行能力が増える、または別スキル実行なら再同意を取る。差分だけの同意、別実行・範囲外の過去同意、スキル文書で代用してはならない。

オーケストレーターは正しいCLIを継続セッションで直接起動し、明示モデル、read-only、Keychain wrapper、資格情報非保存を維持する。Codexホストは `.ai/scripts/run-claude-review.sh auth status`、Claude Codeホストは `codex login status`による認証preflightを`.ai/runtime-compatibility.md`の条件で1回行う。`authReady: true`の記録が同一スキル実行で有効なら再確認せず、CLIがauth errorを返した場合だけ再診断する。raw stdout / stderr はファイル・ブリーフ・scratchpadへ永続化せず、正規化に必要な機密を除いた要約だけを渡す。

- 生存中で無出力のプロセスは `running`。5分で停止しない。
- 10分で進捗通知を行い、`running` のまま監視を継続する。
- 20分で一度だけ終了し、「判定: timeout」とする。自動リトライしない。
- timeout は `approve` ではなく、Finding台帳と全レビュー境界を更新しない。経過時間、既知なら終了コード、機密を除いた要約を返す。
- 認証・通信・同意不足・実行失敗も、正常レビューの代わりに扱わず、Finding台帳と全レビュー境界を更新しない。

## 範囲と分割coverage

レビュー用ブリーフには `targetFeature` / `inScopeFiles` / `acceptanceCriteria` / `outOfScopePolicy` / `reviewStage` / `committedRange` / `reviewPolicy` / `externalReviewDecision` / `decisionHead` を必須とする。別モデルCLIと正規化エージェントは`externalReviewDecision: required`の場合だけ起動し、`not-required-by-policy`で起動された場合は「判定: error」とする。verification にはFinding台帳、修正要約、修正コミット範囲を追加する。不足・矛盾があれば推測で補完せず「判定: error」とする。レビュー対象はコミット済み差分だけに限定し、開始前に `git status --short` が空であること、`committedRange` が `git diff <base>...HEAD` と一致することを確認する。不一致・未コミット変更があればレビューを実行しない。

累積discoveryが20分timeoutした場合だけ、commit/file集合を明示したchunkに分割できる。`cumulativeSplit` は各chunkの `coveredCommitShas` と `coveredFiles`、重複理由を含む。chunk unionが元の累積差分のcommit集合と変更ファイル集合を完全に覆うことを照合し、最後に `crossCuttingReview` を完了する。欠落、説明不能な重複、横断レビュー未実施は「判定: error」とし、coverage・境界を更新しない。

## 正規化と判定

各候補を `.ai/review-guidelines.md` に従って対象範囲内、今回差分が起こした範囲外機能の回帰、別issue候補（範囲外）、確認事項へ分類する。`spec-compliance-first` で design.md の該当章を照合し、CLI出力で扱われていない論点は自分の指摘として追加する。出典タグはCLI由来と正規化エージェントの追加分を区別する。

- `approve`: 正常完了し、対象範囲内の must-fix / should-fix が0件。verificationではrequired Findingが全件 `resolved` であることも必要。
- `request-changes`: 正常完了し、対象範囲内の must-fix / should-fix が1件以上。
- `timeout` / `error` / `auth-required` / `local-execution-required` / `rate-limited` / `external-egress-confirmation-required` / `wrong-host-agent`: 正常レビューではない。指摘ゼロを `approve` と読み替えない。

## 出力フォーマット

```markdown
## <CLI名> レビュー結果: issue #<番号>

### 判定: approve / request-changes / timeout / external-egress-confirmation-required / wrong-host-agent / auth-required / local-execution-required / rate-limited / error

### レビュー条件
- review stage / review policy / external review decision / decision head / 使用モデル / 論理base / 実効base / committed range / 対象機能 / 対象ファイル / 受け入れ条件 / プロファイル: spec-compliance-first

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
