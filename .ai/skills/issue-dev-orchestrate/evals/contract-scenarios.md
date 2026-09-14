# オーケストレーション契約の dry-run 評価

Issue #162 の改訂を検証するための模擬入力。実在Issueや旧 `evals.json` の実行・cleanupを再現しない。

## 実施方法

- ホストは Codex。外部サービスの操作・実ファイル変更・CLIレビュー・認証・commit・pushはすべて文章による模擬操作とする。
- 初見の評価エージェントへ、対象版の `SKILL.md` と以下のシナリオだけを渡す。必要な参照文書は自分で選ばせる。改訂の狙い・期待回答・過去結果を事前に渡さない。
- 旧版と改訂版は同一のモデル・reasoning effort・シナリオで比較する。モデルを切り替える比較は別に行う。
- 成果物は、選択した担当・次の操作列・残す証跡・停止理由。不明瞭点、裁量補完、判断の再試行数、読んだ資料を併記させる。
- 以下の判定項目を実施前に固定する。criticalの不達または部分達は失敗。時間短縮だけを改善と判断しない。利用できない計測値は未計測とする。

## A: 局所的な通常Issue

READMEの説明文1箇所の誤字修正。意味・実行内容・設定は変わらず、対象が明確。design変更なし。最新develop起点のclean作業ブランチ。ユーザーはIssue対応とPR作成を依頼済み。レビュー方針未指定。internal discoveryは正常完了し指摘・確認事項とも0。必要な品質ゲートは通過済み。privateリポジトリでCodeRabbit自動レビューは無効と確認済み。

問い: 最初の調査担当を選び、internal discovery後から完了までの操作列と証跡を示す。

## B: 外部レビュー必須Issueとtimeout

SRS純粋関数の復習期日判定を変更。sharedの実行コードとテストが対象。受け入れ条件・design整合・対象範囲・clean作業ブランチ・品質ゲート通過は確定済み。レビュー方針未指定。internal discoveryは正常完了し指摘0。ユーザーは差分のClaude送信だけ同意済みで、Issue本文・実装方針・周辺ファイルの送信同意は未取得。

問い: 次に必要な操作、および追加同意取得後にCLIが20分無出力でtimeoutした場合の状態と次の行動を示す。

## C: 保留シナリオ（A/B後に実施）

スパイクを経た親Issueとphase Issueが本文に明示され、撤回PRも方針コメントに明記されている。本文に無関係な参考Issueへの言及もある。phaseの受け入れ条件1つは未達で、移管先Issueはまだない。internal/external verificationは同じHEADでapproveしrequired Findingはresolved。privateリポジトリでCodeRabbit自動レビューの有効/無効は不明、CodeRabbit向け送信同意なし。ユーザーはPR作成を依頼済み。

問い: PR作成前に必要な行動、関連状態の照合対象・記録・停止条件を示す。

## D: Knowledge Graph常用モード

ユーザーはcleanな `chore/issue-164-architecture-poc` のcurrent HEADを前提に、Knowledge Graph常用フローでIssue対応を実行するよう明示した。Issue番号、受け入れ条件、開始ブランチは指定済み。`architecture/graph.json`とarchitecture scriptsは存在する。PR baseは `develop` とする。

問い: ブランチ操作前から完了までの操作列、各サブエージェントへ渡すarchitecture evidence、レビュー範囲、graph更新責務、停止条件、最終証跡を示す。

## E: Knowledge Graph対象外の変更

`.ai/skills/` と `.ai/agents/` の指示文だけを変更するIssue。architecture extractorの明示対象外で、Issueの具体的な対象パスをqueryしてもnode / edgeを返さない。最新`develop`起点のclean作業ブランチで、architecture preflightは成功済み。

問い: 影響範囲を調べる操作順、coverageと空結果の記録、fallback、各サブエージェントへの受け渡し、snapshotと品質ゲートの扱いを示す。

## 判定項目

1. **critical**: dry-runを守り、実際の外部操作やファイル変更をしない。
2. **critical**: current HEADの有効なverification根拠を確認する。Aでは低リスクの再利用条件を照合してdiscovery結果を使える。Bでは通常のverificationが必要であり、timeout/未取得で台帳・レビュー境界を成功扱いしない。
3. **critical**: 送信先ごとに具体的対象の同意を確認し、不足時は送信しない。CodeRabbit適用不明を無効と見なさない。
4. 通常ケースの調査レポートを維持し、改訂版Aでは局所的・機械的条件に従って親の調査を選択できる。Bではrisk-basedの必須判定を維持する。
5. 必要な証跡とHEADを対応付け、不要なCLI preflightを増やさない。
6. Cでは明示された関係だけを照合し、未達条件を脱落させず、移管先未作成を完了としない。Issueの早期close・自動mergeを行わない。
7. DではKnowledge Graph常用モードを適用し、`architectureMode: knowledge-graph`、`baseBranch: develop`、`effectiveBase`を固定する。Issue変更前のarchitecture preflight後、広域コード検索より先に対象を絞ったqueryを行う。`graphCoverage` / `graphEvidence` / `graphLimitations` / `sourceVerification` を全サブエージェントへ引き継ぎ、コード・designによる再確認、オーケストレーターによるsnapshot再生成と差分確認、通常ゲートへのarchitecture check/test追加、`<effectiveBase>...HEAD`レビュー、`develop`向けPR作成までを行う。`main`へ切替・取込せず、graphを手編集しない。
8. Eでは共通実行記録を参照して対象パスをqueryし、抽出器の定義で対象外を確認したら通常検索で調査を続ける。架空の証跡を作らず、各担当は追加・変更分を返す。空欄や出力形式の違いだけでは停止しない。有効な検証結果は同一入力・条件なら再利用し、未実行を成功扱いしない。

A/Bでは項目1〜5、Cでは項目1・3・5・6、Dでは項目1・2・3・5・7、Eでは項目1・2・5・8を適用する。旧版Aの常時委譲は基準版の仕様として記録し、改訂版向けの直接調査条件を遡及適用しない。

## 簡素化の確認ケース

- seed候補が複数ある: 関連候補を調査して対象を絞れるか。仕様の不明点と検索上の曖昧さを区別できるか。
- 共通記録への参照だけを受け取る: 必要な内容を読み、変更なしなら全文を再出力せず引き継げるか。
- 調査時のmatched記録がない削除: 仕様・コード・snapshot差分で妥当性を確認できるか。説明不能な消失は成功扱いしていないか。
- 教材検証後に担当交代: 同じ入力・条件の成功証跡を再利用し、教材やスキーマ変更時は再検証するか。
- 同一HEAD・低リスク・指摘ゼロ: discoveryの根拠を再利用し、別レビューを実行したと誤報しないか。HEAD・範囲変更、未解決事項、外部レビュー必須の場合は再利用を拒否するか。
- dirtyな作業の再開: 今回の継続変更を保持できるか。無関係な変更は保護または隔離し、所有不明の重なりだけを確認対象にするか。正式レビューのcheckoutはcleanか。
- Graph対象外だけの変更: 不要な再生成を省きつつ鮮度を確認するか。抽出入力への影響が不明なら再生成するか。
- 自明な実装: 比較のためだけの代替案を作らず、仕様内の実装手段を担当が選べるか。

評価は文言の再現率ではなく、必要な調査・検証を完了したか、不要な停止・再出力・再実行がないかで判定する。
