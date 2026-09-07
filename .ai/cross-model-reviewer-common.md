# 別モデルCLIレビュー正規化共通定義

`codex-review-normalizer` と `claude-review-normalizer` が共有する役割・制約・正規化・出力形式の**単一ソース**。CLI 実行と継続監視はオーケストレーターの責務であり、各エージェントは受け取った要約済み結果の正規化と設計照合だけを担う。

このファイル単体ではエージェントとして起動しない。

## 役割

ホストランタイムとは**別の提供元のモデル**によるレビュー結果を、`reviewer` と同じフォーマットに正規化して返す。**ファイルの編集、CLI 実行、認証確認、外部送信は一切行わない。**

実行前に `AGENTS.md`、`.ai/review-guidelines.md`、`.ai/runtime-compatibility.md`、自分のエージェント定義を読む。レビュー範囲・観点の優先順・重要度・章マッピングは `.ai/review-guidelines.md` が単一ソースである。

## 使い分け

ホストランタイムごとの別モデルCLI、正規化エージェント、直接実行コマンド、モデル指定、送信先は、`.ai/runtime-compatibility.md` の「別モデルCLIレビューのモデル方針」を唯一の対応表とする。この共通定義では対応表を重複定義せず、同表の選択結果を前提に正規化する。

**ホストと同じ提供元のCLIを別モデルレビューに使ってはならない**。正規化エージェントがホストに不適合だと判明した場合は、CLI結果を正規化せず「判定: wrong-host-agent」を返す。

## Discovery / verification

- `discovery`: internal reviewer と別モデルCLIが、どちらも `develop...HEAD` の**全累積差分**を発見モードで読む。結果をFinding台帳へ統合する。
- `verification`: Finding台帳、修正要約、修正コミット範囲を必須ブリーフとする。internal verification が current HEAD を `approve` した場合だけ、別モデルCLI verification を直接実行する。
- verification で current loop に追加できる新規Findingは、修正起因回帰、明確な受け入れ条件未達、重大なsecurity/data destructionだけである。独立改善は「別issue候補（範囲外）」または追加改善に残し、判定件数・修正対象に含めない。

## レビュー用ブリーフ契約

discovery と verification の全レビュー主体には、同じレビュー用ブリーフの内容を渡す。internal reviewer、別モデルCLI、正規化エージェントがそれぞれの範囲と判定条件を自力で確認できる状態にする。

ブリーフには次の共通フィールドを含める。

- `targetFeature`: issueで変更する対象機能・振る舞い
- `inScopeFiles`: 修正対象として合意したファイルまたはパス
- `acceptanceCriteria`: issueの受け入れ条件
- `outOfScopePolicy`: 範囲外の問題を「別issue候補（範囲外）」または「確認事項」として保持し、修正ループと判定件数へ含めない規則
- `reviewStage`: `discovery` または `verification`
- `committedRange`: 今回レビューするコミット済み累積差分の範囲
- `reviewPolicy` / `externalReviewDecision` / 規則ID / 具体的根拠 / `decisionHead`

verification には上記に加えて、issue固有のFinding台帳、修正要約、修正コミット範囲を含める。`committedRange` は discovery と verification のどちらでもレビュー対象となる累積差分であり、Findingが0件または今回の修正コミットがないことを理由に空へしない。修正コミット範囲は別フィールドとして「修正なし」と明示できる。フィールド不足・矛盾、または実際のコミット済み差分との不一致は推測で補わず「判定: error」とする。

同意を取得した外部レビューでは、対象issue・実装方針・base・ブランチ・現在の差分範囲・上記スコープ契約・判定記録・同意記録を1つのレビューブリーフへ統合する。別モデルCLIと正規化エージェントへは、その同じブリーフファイルの読み取り可能なパスを渡す。`review-mode-<N>.md` だけを渡して済ませず、internal reviewerへ渡した契約と一致させる。

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

最低限、ID、出典、重要度、場所、内容、期待解消状態、状態、修正コミット、検証結果を保持する。

| ID | 出典 | 重要度 | 場所 | 内容 | 期待解消状態 | 状態 | 修正コミット | 検証結果 |
|---|---|---|---|---|---|---|---|---|

修正担当には台帳を渡し、修正内容と修正コミットをFindingへ対応付ける。verification は各Findingを `resolved` / `partial` / `unresolved` で更新する。required Findingに `partial` / `unresolved` が残る場合は `request-changes` として修正ループへ戻す。timeout、失敗、未取得の結果で台帳の状態・修正コミット・検証結果を更新してはならない。

## オーケストレーターの直接実行・監視契約

最初の外部送信直前に、今回の `committed-diff`、`brief-context`、`repository-reads` を具体的に列挙した明示同意を確認する。`reviewMode: cross-model-cli`、`normalizerAgent`、`egressDestination`、`externalEgressApproved: true`、`approvedScope`、`approvalValidity: current-skill-run`、同意原文・時刻をレビュー用ブリーフへ記録する。

同一スキル実行のverificationでは、送信先、issue、branch、effective base、変更ファイルとrepository readsが承認済みパスの部分集合、データ種別、read-only能力がすべて同じ承認範囲内なら同意を再利用できる。送信先変更、範囲拡大、新しい機密カテゴリ、実行能力の拡大、または別実行では同意を取り直す。承認済み範囲外の内容や新しい機密カテゴリを送る場合も同様である。差分だけの同意、別実行・範囲外の過去同意、スキル文書で代用してはならない。

CLIの選択、effective base、認証preflight、read-only実行、Keychain wrapper、継続監視、資格情報非保存、raw出力の扱いは `.ai/runtime-compatibility.md` に従う。生存中の無出力、timeoutは正常レビューの代わりに扱わず、認証・通信・同意不足・実行失敗も、正常レビューの代わりに扱わず、Finding台帳と全レビュー境界を更新しない。

timeout、失敗、未取得はFinding状態とレビュー境界を更新しない。

同意不足、wrong-host、timeout、認証・通信・実行エラーのときに、第二のinternal reviewerを代替レビューとして起動せず、不足した対象を具体的に報告し、未取得理由も示す。同意を取得・記録するまでCLIを再実行しない。CodeRabbit のステータスチェックが緑でも、レビュー済みの根拠にしない。

## CodeRabbit App（補助・任意）

private リポジトリで CodeRabbit App の自動レビューが有効、または無効と確認できない場合は、PR作成前に送信先が CodeRabbit であることと `committed-diff` / `brief-context` / `repository-reads` を列挙して明示同意を取得する。同意の原文・時刻・対象と `reviewMode: coderabbit-app` / `egressDestination: coderabbit` / `externalEgressApproved: true` / `approvedScope` を記録する。別モデルCLIの送信先への同意で代用しない。

上記条件で同意・記録できない場合は、自動レビューが無効と確認できるまでPRを作成しない。明示同意なしに取得された自動Appレビューは統合しない。PR作成後に同意済みのAppレビューを取得した場合は追加の指摘として統合できるが、補助であり、`externalReviewDecision: required` の別モデルCLIレビューを代替しない。単発起動の `@coderabbitai review` をPRへコメントする場合は、その投稿について別途ユーザー承認を得る。

## 範囲と分割coverage

レビュー用ブリーフは上記「レビュー用ブリーフ契約」のフィールドを必須とする。別モデルCLIと正規化エージェントは`externalReviewDecision: required`の場合だけ起動し、`not-required-by-policy`で起動された場合は「判定: error」とする。verification にはFinding台帳、修正要約、修正コミット範囲を追加する。不足・矛盾があれば推測で補完せず「判定: error」とする。レビュー対象はコミット済み差分だけに限定し、開始前に `git status --short` が空であること、`committedRange` が `git diff <base>...HEAD` と一致することを確認する。不一致・未コミット変更があればレビューを実行しない。

累積discoveryが20分timeoutした場合だけ、commit/file集合を明示したchunkに分割できる。これはtimeout後の明示的な例外であり、通常のtimeoutに対する自動retryではない。`cumulativeSplit` は各chunkの `coveredCommitShas` と `coveredFiles`、重複理由を含む。chunk unionが元の累積差分のcommit集合と変更ファイル集合を完全に覆うことを照合し、最後に `crossCuttingReview` を完了する。欠落、説明不能な重複、横断レビュー未実施は「判定: error」とし、coverage・境界を更新しない。

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
