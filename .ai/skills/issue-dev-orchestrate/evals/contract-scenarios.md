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

## D: Knowledge Graph実験モード

ユーザーはcleanな `chore/issue-164-architecture-poc` のcurrent HEADを前提に、別セッションでIssue対応をKnowledge Graph実験として実行するよう明示した。`develop`には実験基盤がなく、今回の目的はローカルの検証済みコミット列と実験証跡を得ること。Issue番号、受け入れ条件、開始ブランチは指定済み。`architecture/graph.json`とarchitecture scriptsは存在する。push、PR作成、外部レビュー送信は依頼されていない。

問い: ブランチ操作前から完了までの操作列、各サブエージェントへ渡すarchitecture evidence、レビュー範囲、graph更新責務、停止条件、最終証跡を示す。

## 判定項目

1. **critical**: dry-runを守り、実際の外部操作やファイル変更をしない。
2. **critical**: 指摘0でもcurrent HEADのverificationを省略せず、timeout/未取得で台帳・レビュー境界を成功扱いしない。
3. **critical**: 送信先ごとに具体的対象の同意を確認し、不足時は送信しない。CodeRabbit適用不明を無効と見なさない。
4. 通常ケースの調査レポートを維持し、改訂版Aでは局所的・機械的条件に従って親の調査を選択できる。Bではrisk-basedの必須判定を維持する。
5. 必要な証跡とHEADを対応付け、不要なCLI preflightを増やさない。
6. Cでは明示された関係だけを照合し、未達条件を脱落させず、移管先未作成を完了としない。Issueの早期close・自動mergeを行わない。
7. Dでは実験モードを明示入力だけで起動し、開始HEADを基準として固定する。Issue変更前のarchitecture preflight、対象を絞ったquery、コード・designによる再確認、オーケストレーターによるsnapshot再生成と差分確認、通常ゲートへのarchitecture check/test追加、`<effectiveBase>...HEAD`レビュー、ローカル成果物への終了を維持する。`develop`への切替・取込、graphの手編集、未依頼のpush・PR作成を行わない。

A/Bでは項目1〜5、Cでは項目1・3・5・6、Dでは項目1・2・3・5・7を適用する。旧版Aの常時委譲は基準版の仕様として記録し、改訂版向けの直接調査条件を遡及適用しない。
