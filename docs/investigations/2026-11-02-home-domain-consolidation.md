# ホームの領域別習得状況を削除した結果（Issue #274）

ホームの領域カードと、そのためのAPI取得・整形を削除した。固定fixtureを使ったローカルproduction buildの比較では、ホームの応答サイズがHTMLで8.0%、RSCで2.6%減り、領域API取得は両経路とも0回になった。`/domains` の応答サイズと取得回数は変わらなかった。

Cloudflare上のCPU時間は未計測であり、CPU上限超過の解消は確認していない。#220・#270の実環境検証と、ADR-0016による昇格条件は引き続き必要である。

## 比較条件を固定する

- 日時: 2026-11-02（JST）。macOS、Node.js 24.2.0、pnpm 9.15.0。
- 変更前: `66f6a7e155fd4627924048237be5bf2590836c67`（開始時の最新 `origin/develop`）。変更後: 本記録と同じ作業ブランチのWeb実装。
- 両版とも `pnpm --filter @tsl/web build` を実行した。同じlockfile・contentを使い、Vinext 1.0.1 / Vite 8.3.2のproduction成果物をローカルworkerdで実行した。
- [比較スクリプト](../../scripts/verification/compare-home-domains.mjs) の同一fixtureをService Bindingの境界に与えた。API・D1・認証情報・実ユーザーのデータは使っていない。
- fixtureはdue 3問、正答率75%、習得済み2問、連続3日、今週120秒。ヒートマップは2026-03-04〜09-01の182日分で最終日だけ4問。活動履歴は解答1件、4領域は各2問中1問習得とした。
- HTMLは `/home`・`/domains`、RSCは同じパスに `?_rsc=` と `RSC: 1` を付けた。`Cache-Control: no-cache`、リダイレクトの自動追従なし。応答本文を最後まで読み、200とContent-Typeを確認した。応答サイズは圧縮前のUTF-8バイト数である。
- 通信ごとのAPI取得数はfixture境界で数えた。RSCでは両版とも各loaderのAPIが2回呼ばれた。HTMLは各1回だった。この既存の挙動も含めて比較し、呼び出し回数を補正していない。

Wranglerの設定変換helperはv4形式を返すため、Web側Miniflare v5への直接入力・変換は失敗した。依存は変更せず、既存API側のMiniflare 4.20260617.1を両版に使った。ビルド済みのJSモジュールを明示列挙し、動的importの探索エラーを避けた。

## ホームの応答と取得処理が減った

| 画面・経路 | 変更前 bytes | 変更後 bytes | 差 | 領域API取得（前→後） |
| --- | ---: | ---: | ---: | ---: |
| `/home` HTML | 124,320 | 114,328 | −9,992（−8.0%） | 1→0 |
| `/home` RSC | 59,645 | 58,110 | −1,535（−2.6%） | 2→0 |
| `/domains` HTML | 46,002 | 46,002 | 0 | 1→1 |
| `/domains` RSC | 16,105 | 16,105 | 0 | 2→2 |

ホームのdue・summary・heatmap・recent activityの取得は、変更前後ともHTMLで各1回、RSCで各2回だった。領域の表示データは `DashboardViewModel` から削除した。学習再開用の静的contentの並び替えと、活動履歴の教材タイトル解決は残している。

## ローカルCPUの差だけでは改善を断定できない

各経路を2回warmupした後、100 requestを逐次実行するバッチを5回測った。`ps` の累積CPU時間を、当該Nodeプロセスが起動した1つのworkerd子プロセスについて前後で取得し、差を100で割った。起動時間とNode側のfixture処理は含めていない。HTMLの5バッチの後にRSCの5バッチを実行した。

| 経路 | 変更前の5標本（ms/request） | 変更後の5標本（ms/request） | 中央値（前→後） |
| --- | --- | --- | --- |
| `/home` HTML | 9.8, 7.9, 8.3, 8.2, 8.5 | 8.4, 7.7, 7.5, 7.2, 7.6 | 8.3→7.6 |
| `/home` RSC | 5.8, 4.8, 5.2, 5.1, 4.9 | 5.7, 4.6, 4.6, 5.1, 4.6 | 5.1→4.6 |

中央値は約8%／10%低かったが、標本の範囲は重なる。実行順・JIT・GC・マシンの状態を分離しておらず、この差を安定した改善率とは扱わない。これはローカルworkerdプロセス全体のCPU時間であり、Cloudflareのrequest単位の `cpuTimeMs`、応答時間、CPU profilerのサンプル時間とは異なる。

今回は検証Workerへ変更前後の版を反映していないため、Cloudflareの同一条件・同一版のinvocation logを使った比較はできていない。実環境のCPU改善幅は未取得とする。HTTP 200やローカルCPU値を、#270の全requestとログの照合成功の代用にはしない。

## 残す機能を回帰確認する

loaderの検証ではホームの領域取得と領域VM組み立てがなくなったこと、summary・182日分のheatmap・activityが残ることを確認した。画面の検証では習得済み問題数、ヒートマップの182項目と始点・終点の読み上げ、最近のアクティビティを確認している。既存のdueカード・教材導線・共通ナビゲーションのテストも維持した。

領域画面の追加検証は、実際のAPI adapterとloader・mapper・画面を通し、領域APIの取得、4領域の見出し、読み上げ名を持つ進捗バー、content由来のトピックリンクを確認する。比較スクリプトでもHTML/RSCの領域見出しと、HTMLの `/domains` ナビゲーションを確認した。

ブラウザによる表示確認は、Work設定でローカルブラウザが無効だったため実施できなかった。PC/SPの見た目・余白とスクリーンショットは未確認である。DOM・応答・テストの確認と、視覚的な確認を区別する。

## 同じ比較を再現する

リポジトリルートから、依存を `pnpm install --frozen-lockfile --ignore-scripts` で用意する。変更前のcheckoutにも同じ比較スクリプトを持ち込み、各版のbuild後に実行する。CPU時間の取得にはmacOSの `ps` が必要である。

```sh
pnpm --filter @tsl/web build
WRANGLER_LOG_PATH="$PWD/.claude/logs/wrangler" node scripts/verification/compare-home-domains.mjs before
# 変更後のcheckoutで同じbuildを実行してから:
WRANGLER_LOG_PATH="$PWD/.claude/logs/wrangler" node scripts/verification/compare-home-domains.mjs after
```

本文とJSONは `reports/home-domain-comparison/`（Git対象外）へ出力する。受け入れ条件とfixtureの確認に失敗すると停止する。外部環境への反映・ネットワークAPI取得・D1更新は行わない。

品質ゲートはtypecheck、lint、全体テスト、architecture:check / architecture:test、変更前後のWeb buildを通過した。全体テストは `TMPDIR=/private/tmp VITEST_MAX_FORKS=1 VITEST_MIN_FORKS=1` を指定した。最初の実行では一時パスの別名により設計参照CLIの4テストが失敗した。実パスの指定で解消後、並列実行中の既存content生成テストがBiome子プロセスを待ち続けたため停止し、forkを1つにして全体を再実行した。テストコード・期待値はこの環境対応のために変更していない。最終結果は設計参照30件、デプロイ20件、shared 75件、API 109件、Web 168件、Graph 37件が成功した。
