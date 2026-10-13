# Material Symbols アイコン利用の棚卸し

実施日：2026-10-13。Issue #233。#230 / PR #231 で `/learn` に導入した Material Symbols Rounded を、プロダクト全体のどこへ広げるべきかを調査した。本文書は調査と方針整理の記録であり、アイコンの実装は含まない。判断基準は [design.md §7.1](../design.md#71-ルート構成)・[§7.2](../design.md#72-横断する設計判断)・[§8.7](../design.md#87-スタイリングtailwind--dev-native-neo-flat--terminal-デザインシステム) とする。

## 結論

- **差し替えの最優先は共通シェル**（PCサイドバー、SP下部タブ、テーマ切替）。全画面に出る Unicode 記号（`▦ ▤ ✎ ↻ ▥ ⌘ ☀ ◐`）はフォントによって大きさと字形が揃わず、`/learn` の Rounded アイコンと見た目が混在している。
- **新規追加の最優先は演習・復習の解答後の選択肢**。正解・誤答の選択肢は枠と背景の色だけで区別しており、WCAG 1.4.1（色の使用。AA 適合に含まれる）に照らして不足している。§8.7 には色だけに依存しないことの記述がないため、あわせて追記が必要である。
- 導線の `→` / `←` は文字ラベルの一部で意味は伝わるため、共通ボタンに組み込む形で中優先度で揃える。
- ターミナル表現（`›_` ロゴ、`~/devpath $` パンくず、`>_ grading...`、`> content.read()`、選択肢キーキャップ `A–D`、`PASS / FAIL`）は §8.7 のデザイン言語そのものなので**現状維持**とする。
- 既存7種で対応できる箇所は少なく、**後続実装には新規SVGが16種（P3 を含めると18種）必要**（後述）。

## 調査方法と確認した表示状態

基準コードは `origin/develop`（`49ef998`）。`pnpm --filter @tsl/api dev` と `pnpm --filter @tsl/web dev` をローカルで起動し、ローカル D1 に migration と content を適用した。Playwright（同梱 Chromium）で PC（1440×900）と SP（390×844、DPR 2）の各画面を、ダーク・ライトの両テーマで撮影した（計80枚）。撮影は `prefers-reduced-motion: reduce` で行った。リポジトリには根拠として必要な18枚だけを [`images/2026-10-13-material-symbols-icon-audit/`](./images/2026-10-13-material-symbols-icon-audit/) に保存した（SP は50%に縮小）。

| 画面／部品 | 確認した状態 | 方法 |
| --- | --- | --- |
| 共通シェル（PCサイドバー・SPアプリバー・SP下部タブ・テーマ切替・due バッジ） | 各ナビ項目の選択状態、due 0件（バッジなし）、due 2件（バッジあり）、キーボードフォーカス | 画面 |
| `/` 公開トップ | 通常表示 | 画面 |
| `/home` | データ0件、解答後、due あり | 画面 |
| `/learn`・`/learn/security/xss`・教材本文 | 通常表示、領域の準備中（教材0件） | 画面 |
| `/quiz/security-xss-01` | intro、出題、正解後、不正解後、結果（1/3 正解） | 画面 |
| `/review` | 空キュー（今日は復習済み）、intro（due 2件・4日滞留） | 画面 |
| `/domains`・`/analytics` | データ0件、解答後 | 画面 |
| 各ルートの `error.tsx`（`/home`・`/review`・`/analytics`・`/domains`・`/quiz/[lesson]`・`/learn/[domain]/[topic]`） | 内容のみ | **コードのみ**。ローカル dev では API プロセスを停止しても Web の Service Binding 経由の取得が失敗せず、エラー境界を表示できなかった |
| `DashboardDueCard` の取得失敗時表示 | 内容のみ | **コードのみ**（同上） |
| 採点中 `>_ grading...` | 内容のみ | **コードのみ**（応答が速く撮影できない一時状態） |
| 問題0件の演習（`quiz / empty`）、`次のレッスンへ →`、`次の復習を取得 →` | 内容のみ | **コードのみ**。現行 content はレッスン1本・3問のため到達できない |
| ナビの無効項目（`準備中`）、`/learn` のレッスン0件トピック | 内容のみ | **コードのみ**。現行データ・`quizHref` では到達できない |
| 404（`notFound()`） | — | 独自 UI なし（対象外） |

主な証跡：

| 画面 | PC | SP |
| --- | --- | --- |
| 公開トップ | [dark](./images/2026-10-13-material-symbols-icon-audit/top-empty-pc-dark.jpg) | [light](./images/2026-10-13-material-symbols-icon-audit/top-empty-sp-light.jpg) |
| ダッシュボード | [dark・due あり](./images/2026-10-13-material-symbols-icon-audit/home-due-pc-dark.jpg) | [dark・解答後](./images/2026-10-13-material-symbols-icon-audit/home-data-sp-dark.jpg) |
| 教材一覧 | [light](./images/2026-10-13-material-symbols-icon-audit/learn-empty-pc-light.jpg) | [dark](./images/2026-10-13-material-symbols-icon-audit/learn-empty-sp-dark.jpg) |
| トピック・教材本文 | [トピック dark](./images/2026-10-13-material-symbols-icon-audit/topic-empty-pc-dark.jpg) | [本文 light](./images/2026-10-13-material-symbols-icon-audit/lesson-empty-sp-light.jpg) |
| 演習 | [intro light](./images/2026-10-13-material-symbols-icon-audit/quiz-intro-pc-light.jpg)・[正解後 light](./images/2026-10-13-material-symbols-icon-audit/quiz-answered-0-pc-light.jpg)・[結果 light](./images/2026-10-13-material-symbols-icon-audit/quiz-result-pc-light.jpg) | [不正解後 dark](./images/2026-10-13-material-symbols-icon-audit/quiz-answered-1-sp-dark.jpg) |
| 復習 | [intro dark](./images/2026-10-13-material-symbols-icon-audit/review-intro-pc-dark.jpg) | [空キュー light](./images/2026-10-13-material-symbols-icon-audit/review-empty-sp-light.jpg) |
| スキルツリー・分析 | [domains dark](./images/2026-10-13-material-symbols-icon-audit/domains-data-pc-dark.jpg)・[analytics light](./images/2026-10-13-material-symbols-icon-audit/analytics-data-pc-light.jpg) | [analytics dark](./images/2026-10-13-material-symbols-icon-audit/analytics-data-sp-dark.jpg) |
| フォーカス表示 | [サイドバー dark](./images/2026-10-13-material-symbols-icon-audit/focus-nav-pc-dark.jpg) | — |

> SP の全画面撮影では、固定配置のアプリバーと下部タブがページ途中に重なって写る。これは全画面撮影の合成によるもので、実際の表示崩れではない。

## 候補一覧

判定は「差し替え」「追加」「現状維持」。SVG欄の「既存」は導入済みの7種（`security` / `code` / `dns` / `account_tree` / `menu_book` / `chevron_right` / `schedule`）で足りること、「新規」は公式SVGの同梱が必要なことを示す。候補名はすべて固定リビジョン `49d4db35` の `symbols/web/<name>/materialsymbolsrounded/<name>_24px.svg` に存在することを確認した。優先度は **P1**（全画面に出る、または色だけに依存する）、**P2**（主要導線・頻出の状態）、**P3**（一貫性の補強・任意）。

### 共通シェル

| 画面／部品 | 現状 | 判定 | 理由 | 候補アイコン名 | ラベル／読み上げ | SVG | 優先度 | 証跡 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ナビ：ダッシュボード／ホーム | `▦`（`dashboard-shell.tsx:26`） | 差し替え | 記号の字形がフォント依存で小さく、`/learn` のアイコンと不揃い | `home` | 文字ラベル併記。アイコンは `aria-hidden` | 新規 | P1 | home-due-pc-dark |
| ナビ：教材 | `▤`（`:28`） | 差し替え | `/learn` の見出しと同じ意味を同じアイコンで示す | `menu_book` | 同上 | 既存 | P1 | learn-empty-pc-light |
| ナビ：演習 | `✎`（`:29`） | 差し替え | 編集の意味に読める。4択演習を示す専用シンボルがある | `quiz` | 同上 | 新規 | P1 | quiz-result-pc-light |
| ナビ：復習 | `↻`（`:35`） | 差し替え | 「再読み込み」と区別できない。SRSの定期的な反復を示す | `event_repeat` | 同上。due バッジは現状維持（数値＋`sr-only` 文言あり） | 新規 | P1 | review-intro-pc-dark |
| ナビ：アナリティクス | `▥`（`:37`） | 差し替え | 教材の `▤` と字形が似て区別しにくい | `bar_chart` | 同上 | 新規 | P1 | analytics-data-pc-light |
| ナビ：スキルツリー／ツリー | `⌘`（`:38`） | 差し替え | macOS の Command キーと誤読される。`account_tree` はアーキテクチャ領域で使用済みのため避ける | `category` | 同上 | 新規 | P1 | domains-data-pc-dark |
| テーマ切替 | `☀`（ライト時）／`◐`（ダーク時）（`theme-toggle.tsx:51`） | 差し替え | `◐` は半分だけ表示され意味が伝わらない（top-empty-pc-dark で確認）。`aria-label` は「切り替え先」、記号は「現在」を表しており、`aria-pressed` も併用していて意味が混在している | 切り替え先を表示：ダーク時 `light_mode`、ライト時 `dark_mode` | 既存の `aria-label`（動作の説明）を維持し、`aria-pressed` は外すことを推奨（仕様化が必要） | 新規×2 | P1 | top-empty-pc-dark・learn-empty-sp-light |
| SPアプリバー：ストリーク | `🔥 12日`（`dashboard-shell.tsx:166`） | 差し替え | 絵文字は OS で色・形が変わり、トークン色と合わない | `local_fire_department` | 「12日」は文字で残す。アイコンは `aria-hidden` | 新規 | P2 | learn-empty-sp-light |
| ブランドロゴ | `›_`（`:47`） | 現状維持 | §8.7 のターミナル表現（`>_` プロンプト）そのもの | — | — | — | — | home-due-pc-dark |
| サイドバー「学習データ sample」 | 文字＋進捗バー | 現状維持 | アイコンで補う情報がない | — | — | — | — | home-due-pc-dark |
| ナビ無効項目「準備中」 | 文字のみ（`:75`） | 現状維持 | 文字で十分。`/learn` の `schedule` は内容の準備中で、ナビの無効状態とは役割が違う | — | — | — | — | コードのみ |

> 確認時の発見：SPアプリバーのストリークは値が `12日` で固定されており、API の連続学習日数を表示していない（ダッシュボードは実データで「1 日」）。サイドバーの「学習データ sample / foundation: 35%」も固定値である。いずれもアイコンの範囲外のため、別Issue候補とする。

### 公開トップ `/`

| 画面／部品 | 現状 | 判定 | 理由 | 候補アイコン名 | ラベル／読み上げ | SVG | 優先度 | 証跡 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 主CTA「ログインして学習を始める →」 | 文字の `→`（`page.tsx:63`） | 差し替え | 全画面の前進導線と揃える | `arrow_forward`（ラベルの後ろ） | 文字ラベルが主。アイコンは `aria-hidden` | 新規 | P2 | top-empty-pc-dark |
| ヘッダー「ログイン」 | 文字のみ（`:40`） | 現状維持 | SP幅で横幅を増やしたくない。文字で十分 | （任意：`login`） | — | — | P3 | top-empty-sp-light |
| 学習ループ 01–03 | 番号＋`> content.read()` 等 | 現状維持 | ターミナル表現。番号で順序が伝わる | — | — | — | — | top-empty-pc-dark |
| LAB DOMAINS カード | 文字のみ（Security / Frontend / Backend / Architecture） | 追加 | `/learn` の領域アイコンと結び付け、公開トップから学習画面への一貫性を作る | `security`、`code`＋`dns`、`account_tree` | 領域名は文字で残す。アイコンは `aria-hidden` | 既存 | P3 | top-empty-pc-dark |

### ダッシュボード `/home`

| 画面／部品 | 現状 | 判定 | 理由 | 候補アイコン名 | ラベル／読み上げ | SVG | 優先度 | 証跡 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 学習サマリー4カード | すべて同じ `#`（`dashboard-data-content.tsx:200`） | 差し替え | 同じ記号が4つ並び、指標を区別する役に立っていない（§8.7「意味を運ばない装飾は置かない」） | 正答率 `check_circle`、学習時間 `timer`、ストリーク `local_fire_department`、習得済み `verified` | 指標名は文字で残す。アイコンは `aria-hidden` | 新規 | P2 | home-due-pc-dark |
| 「復習を始める」（ヘッダー・due カード） | 文字のみ（`dashboard-page-content.tsx:46`、`dashboard-due-card.tsx:31`・`:47`） | 追加 | 主導線。ナビの「復習」と同じアイコンで行き先を示す | `event_repeat`（ラベルの前） | 文字ラベルが主 | 新規（ナビと共用） | P3 | home-due-pc-dark |
| NEXT LESSON カード | `▤`（`dashboard-page-content.tsx:63`） | 差し替え | 教材を示すアイコンを `menu_book` に揃える | `menu_book` | `aria-hidden` のまま | 既存 | P2 | home-due-pc-dark |
| 「続きから」 | 文字のみ（`:80`） | 現状維持 | カード全体のアイコンで意味が足りている | — | — | — | — | home-due-pc-dark |
| 最近のアクティビティ | 解答 `>`、閲覧 `▤`（`dashboard-data-content.tsx:64`） | 差し替え | `>` はターミナル風だが「解答」と読めない。閲覧は教材アイコンに揃える | 解答 `edit_note`、閲覧 `menu_book` | 説明文が主。正解／不正解は文字で表示済み | 新規＋既存 | P2 | home-data-sp-dark |
| 学習コントリビューション（草）・凡例 | 色の5段階 | 現状維持 | §8.7 の GitHub 草。`sr-only` の日別リストで値を提供済み | — | — | — | — | home-due-pc-dark |
| 「すべて表示」（SPのみ） | 文字リンク | 追加 | 一覧への遷移なので `/learn` の行内導線と揃える | `chevron_right` | 文字ラベルが主 | 既存 | P3 | home-data-sp-dark |
| 領域別の習得状況 | 下記 `/domains` と共通部品 | — | `/domains` の行を参照 | — | — | — | — | — |

### 教材 `/learn/**`

| 画面／部品 | 現状 | 判定 | 理由 | 候補アイコン名 | ラベル／読み上げ | SVG | 優先度 | 証跡 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/learn` 一覧 | 導入済み7種 | 現状維持 | #230 の仕様どおり。本調査の基準とする | — | — | — | — | learn-empty-pc-light |
| `/learn` レッスン0件トピック | `準備中` バッジのみ（`lesson-catalog.tsx:89`） | 現状維持 | 行頭の `menu_book` が減光済みで、バッジの文字で状態が分かる | — | — | — | — | コードのみ |
| トピック：レッスンカード | 番号・ID・タイトル | 現状維持 | 番号で順序が伝わる。各行に `menu_book` を足すと装飾過多 | — | — | — | — | topic-empty-pc-dark |
| トピック：「教材を読む →」 | 文字の `→`（`topic-display.tsx:57`） | 差し替え | 前進導線の統一 | `arrow_forward` | 文字ラベルが主 | 新規 | P2 | topic-empty-pc-dark |
| 教材本文：「← レッスン一覧」 | 文字の `←`（`lesson-display.tsx:47`） | 差し替え | 戻る導線の統一 | `arrow_back`（ラベルの前） | 文字ラベルが主 | 新規 | P2 | lesson-empty-sp-light |
| 教材本文：「問題を解く →」 | 文字の `→`（`:53`） | 差し替え | 前進導線の統一 | `arrow_forward` | 文字ラベルが主 | 新規 | P2 | lesson-empty-sp-light |
| 教材本文の Markdown | 本文中の記号・コード | 現状維持 | 教材の内容であり UI ではない（Issue 制約） | — | — | — | — | lesson-empty-sp-light |

### 演習 `/quiz/[lesson]`・復習 `/review`（共通の `QuizInteractive` / `QuestionCard`）

| 画面／部品 | 現状 | 判定 | 理由 | 候補アイコン名 | ラベル／読み上げ | SVG | 優先度 | 証跡 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 解答後の選択肢（正解・自分の誤答） | 枠と背景の色だけ（`question-card.tsx:44-52`） | 追加 | **色だけで状態を区別している**。色覚特性やライトテーマの淡色背景では判別しにくい | 正解 `check_circle`、誤答 `cancel`（選択肢の右端） | 選択肢ボタンの `aria-label` に「正解」「あなたの解答」を足すか、`sr-only` の文言を併記する（現状は結果欄の文章でしか伝わらない） | 新規 | **P1** | quiz-answered-0-pc-light・quiz-answered-1-sp-dark |
| 結果欄「正解です／不正解です」 | 文字＋色（`:77`） | 追加 | 文字で伝わるが、選択肢と同じアイコンで結果を結び付けると読み取りが速い | `check_circle` / `cancel` | 文字が主。`aria-live` はそのまま | 新規（上と共用） | P2 | 同上 |
| 問題カード右上 `PASS / FAIL / WAITING FOR ANSWER` | 文字（`:33`） | 現状維持 | テストランナー表現（§8.7）。文字で伝わる | — | — | — | — | quiz-answered-0-pc-light |
| 選択肢キーキャップ `A–D`・`1–4 keys` | 文字 | 現状維持 | §8.7 の `keycap`。キーボード操作の手掛かり | — | — | — | — | quiz-answered-1-sp-dark |
| 採点中 `>_ grading...` | 文字（`:72`） | 現状維持 | ターミナル表現 | — | — | — | — | コードのみ |
| 「次へ →」 | 文字の `→`（`:91`） | 差し替え | 前進導線の統一 | `arrow_forward` | 文字ラベルが主。テスト（`review-runner.test.tsx`）のラベル文字列も更新する | 新規 | P2 | quiz-answered-1-sp-dark |
| 「演習を開始 →」「復習を開始 →」 | 文字の `→`（`quiz-interactive.tsx:35`、`review-runner.tsx:19`） | 差し替え | 前進導線の統一 | `arrow_forward` | 文字ラベルが主。テストはラベル文字列で取得しているため、`→` を外す場合はテストも更新する | 新規 | P2 | quiz-intro-pc-light・review-intro-pc-dark |
| 「次のレッスンへ →」「次の復習を取得 →」 | 文字の `→`（`:240`・`:232`） | 差し替え | 前進導線の統一 | `arrow_forward` | 同上 | 新規 | P2 | コードのみ |
| 結果の正誤一覧 `PASS / FAIL` バッジ | 文字＋色（`:206`） | 現状維持 | テストレポート表現で、文字があるため色に依存しない | — | — | — | — | quiz-result-pc-light |
| 「再挑戦」 | 文字のみ | 追加 | 最初からやり直す意味を明確にする | `restart_alt` | 文字ラベルが主 | 新規 | P3 | quiz-result-pc-light |
| 「間違えた問題だけ復習」「レッスン一覧へ」「ホームへ」 | 文字のみ | 現状維持 | 文字で十分。ボタンが横に3–4個並ぶため、全部にアイコンを付けると SP で折り返しが増える | — | — | — | — | quiz-result-pc-light |
| 復習 intro：due プレビュー「4日滞留／今日 due」 | 赤文字 | 現状維持 | 文字で状態が伝わる | — | — | — | — | review-intro-pc-dark |
| 復習：空キュー「今日は復習済みです」 | `queue: empty` ＋見出し | 追加 | 完了の肯定的な状態を視覚化する。空状態は1画面1アイコンまで | `task_alt` | 見出しが主。アイコンは `aria-hidden` | 新規 | P3 | review-empty-sp-light |
| 演習：問題0件 | `quiz / empty` ＋文 | 現状維持 | 発生頻度が低いエラー寄りの状態。文字で十分 | — | — | — | — | コードのみ |

### スキルツリー `/domains`・分析 `/analytics`

| 画面／部品 | 現状 | 判定 | 理由 | 候補アイコン名 | ラベル／読み上げ | SVG | 優先度 | 証跡 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 領域カード（`ProgressSummaryCard`。`/home` と共通） | eyebrow の英字＋領域名、アイコンなし | 追加 | `/learn` で領域とアイコンの対応を学んだ利用者が、同じ領域を同じ形で識別できる | `security` / `code` / `dns` / `account_tree`（`/learn` と同じ色トークン） | 領域名は文字で残す | 既存 | P2 | domains-data-pc-dark |
| 領域カード「最初のトピック →」 | 文字の `→`（`domain-progress-card.tsx:31`） | 差し替え | 一覧へのドリルダウンなので `/learn` の行内導線に揃える | `chevron_right` | 文字ラベルが主。テスト（`domain-progress-card.test.tsx`）のラベル文字列も更新する | 既存 | P2 | domains-data-pc-dark |
| 領域カード「準備中」 | 文字のみ（`:32`） | 追加 | `/learn` の準備中表現と揃える | `schedule` | 文字が主。`aria-disabled` は維持 | 既存 | P3 | home-due-pc-dark |
| 分析サマリー5カード | すべて同じ `#`（`analytics-dashboard.tsx:212`） | 差し替え | ダッシュボードと同じ理由。また「習得済み」と「連続学習」が同じ orange で、ダッシュボード（習得済み＝purple）と色の対応も違う | 総解答数 `edit_note`、正答率 `check_circle`、平均反応時間 `speed`、習得済み `verified`、連続学習 `local_fire_department` | 指標名は文字で残す | 新規 | P2 | analytics-data-pc-light |
| 週間アクティビティ・SRS定着度分布・間違えやすい問題 | グラフ・数値・順位 | 現状維持 | 数値と文字ラベルがあり、色だけに依存していない | — | — | — | — | analytics-data-pc-light |
| 空状態「まだ十分な解答データがありません。」 | 文字のみ | 現状維持 | カード内の補足であり、アイコンは不要 | — | — | — | — | コードのみ |

### エラー・読み込み表示

| 画面／部品 | 現状 | 判定 | 理由 | 候補アイコン名 | ラベル／読み上げ | SVG | 優先度 | 証跡 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 各 `error.tsx` | `error: xxx_unavailable`（赤 mono）＋見出し＋赤枠 | 現状維持 | ターミナル表現で、文字と赤枠で状態が伝わる | （任意：見出し前に `error`） | — | — | P3 | コードのみ |
| 各 `error.tsx`「再読み込み」 | 文字のみ | 現状維持 | 文字で十分。追加するなら `refresh`（`event_repeat` とは区別する） | （任意：`refresh`） | — | — | P3 | コードのみ |
| `DashboardDueCard` 取得失敗時 | 文章のみ | 現状維持 | 復習導線を残す設計であり、強い警告表示は不要 | — | — | — | — | コードのみ |
| 読み込み表示 | `loading.tsx` なし（通常 SSR で完成後に表示） | 対象外 | 現在実装されていない | — | — | — | — | コードのみ |

## アクセシビリティとレイアウトの評価

- **読み上げ**：追加するアイコンはすべて文字ラベルと併記し、`MaterialSymbol` の既定どおり `aria-hidden` とする。アイコンだけで意味を伝える場所は作らない。例外は SP 下部タブも含めて設けない（現行も文字ラベルあり）。
- **色だけに依存しない状態表現**：P1 の選択肢以外では、正誤・due・準備中はいずれも文字を伴っている。選択肢にはアイコンに加えて読み上げ用の文言が必要である。
- **コントラスト**：アイコンは CSS mask で `currentColor` を継承するため、既存の文字色トークン（WCAG AA 前提の `--ink`〜`--mute`、セマンティックカラー）をそのまま使える。`--faint` は本文用ではないため、意味を持つアイコンには使わない。
- **フォーカス表示**：`globals.css:100` の全体 `:focus-visible`（2px `--blue`、offset 3px）がナビ・ボタン・リンクに出ることを確認した（focus-nav-pc-dark）。アイコンは操作要素の内側に置くため、新たな対応は不要。
- **44px以上のタッチターゲット**：ナビ・CTA は `min-h-11`（44px）、テーマ切替は `size-11`。SP下部タブは1項目あたり約75px幅で、24px アイコン＋2px間隔＋11px ラベル（約16px）＝約42px が `min-h-11` に収まる。選択肢右端に20pxのアイコンを足しても `min-h-12` と行の高さは変わらない。
- **SP幅への影響**：導線ボタンへの `arrow_forward` / `arrow_back`（20px）は、教材本文フッター・結果アクションが `flex-wrap` のため崩れない。ただし結果画面のボタン群は SP で既に2段になるため、P3 の任意アイコンは増やしすぎない。アプリバーは「ロゴ＋ストリーク＋テーマ切替」で余白が少なく、ストリークのアイコンは絵文字と同じ幅（16px）に留める。

## 表現の統一方針（後続実装と §8.7 更新の素案）

- **スタイル**：Material Symbols Rounded、非塗りつぶし、optical size 24px の公式SVGを `apps/web/public/icons/material-symbols/` に同梱する（#230 の方式を継承。外部フォント通信なし、出典・ライセンスは同ディレクトリの README・LICENSE に記載）。
- **サイズ**：画面見出しの装飾 28px（`size-7`、既存）、領域チップ・SP下部タブ 24px（`size-6`、既定）、PCサイドバー・ボタン内・行内導線 20px（`size-5`）。サイドバーは現在の記号用の枠（`size-5`）をそのまま使う。
- **色**：文字色を継承する。ナビは現在の選択・非選択の文字色（`text-blue` / `text-mute`）に従い、正誤は `text-green` / `text-red`。領域は `/learn` の色対応（security＝green、frontend＝blue、backend＝purple、architecture＝orange）に揃える。
- **配置と余白**：前進の導線はラベルの**後ろ**に `arrow_forward`、戻る導線はラベルの**前**に `arrow_back`、一覧・詳細へのドリルダウンは後ろに `chevron_right`。テキストとの間隔は `gap-1`（行内リンク）または `gap-2`（ボタン。`Button` は既に `gap-2`）。リンクで組んでいる CTA には `gap` がないため追加する。
- **同じ意味には同じアイコン**：

  | 意味 | アイコン |
  | --- | --- |
  | 教材・レッスン | `menu_book` |
  | 演習 | `quiz` |
  | 復習（SRS） | `event_repeat` |
  | 分析 | `bar_chart` |
  | スキルツリー／学習領域の一覧 | `category` |
  | 前進 / 戻る / ドリルダウン | `arrow_forward` / `arrow_back` / `chevron_right` |
  | 正解 / 誤答 | `check_circle` / `cancel` |
  | 準備中 | `schedule` |
  | ストリーク | `local_fire_department` |
  | テーマ（切り替え先） | `light_mode` / `dark_mode` |

  `account_tree` はアーキテクチャ領域専用とし、ナビの「スキルツリー」には使わない。将来のディレクトリツリー型スキルツリー（§7.1・§8.7 の done ✓ / current ▶ / locked 🔒）で同じ方針を適用する場合は、`check_circle` / `play_arrow` / `lock` を候補とする（今回は未実装のため対象外）。
- **共通部品**：`MaterialSymbolName` を拡張し、`Button` と、リンクで個別に書かれている CTA クラスを共通化する際に `icon` / `iconPosition` を受け取れるようにすると、矢印の統一が1か所で済む。現在 `→` を含むラベル文字列をテストが参照している箇所（`quiz-interactive.test.tsx`、`review-runner.test.tsx`、`domain-progress-card.test.tsx`）は、アクセシブルネームから `→` が外れるため同時に更新する。

## 新規に必要なSVG

既存7種で対応できるのは、ナビ「教材」、NEXT LESSON、アクティビティの閲覧、領域カード・公開トップの領域アイコン、`chevron_right` の導線、`schedule` の準備中である。それ以外は以下の新規SVGが必要である（優先度は最も高い利用箇所）。

| 優先度 | アイコン |
| --- | --- |
| P1 | `home`、`quiz`、`event_repeat`、`bar_chart`、`category`、`light_mode`、`dark_mode`、`check_circle`、`cancel` |
| P2 | `arrow_forward`、`arrow_back`、`local_fire_department`、`timer`、`verified`、`edit_note`、`speed` |
| P3 | `restart_alt`、`task_alt`（任意：`login`、`refresh`、`error`） |

P1・P2 の必須分は16種、P3 を含めると18種（任意を除く）。

## 推奨する実装単位と順序

1. **共通シェルのアイコン化**（P1）：ナビ6項目とテーマ切替を Material Symbols に置き換える。テーマ切替の `aria-pressed` の扱いをあわせて決める。§7.2・§8.7 の更新を伴う。
2. **解答状態のアイコンと読み上げ**（P1）：選択肢の正解・誤答に `check_circle` / `cancel` と読み上げ文言を加え、結果欄にも同じアイコンを使う。`QuestionCard` の単体テストを追加する。
3. **導線矢印の統一**（P2）：`arrow_forward` / `arrow_back` / `chevron_right` を共通 CTA 部品に組み込み、全画面の `→` / `←` を置き換える。関連テストのラベルを更新する。
4. **統計カード・アクティビティ・領域カード**（P2）：`#` と `▤` / `>` を指標別のアイコンに置き換え、領域カードに `/learn` と同じ領域アイコンを付ける。分析の「習得済み」の色をダッシュボードに揃えるかもここで判断する。
5. **任意の補強**（P3）：公開トップの領域カード、再挑戦、空キュー、すべて表示、準備中。

各単位で、追加するSVGを README の対象一覧に含め、ダーク／ライト・PC／SP で表示を確認する。

## 仕様更新が必要な点

- **§8.7 コンポーネント文法**：現在「`/learn` のアイコン」として `/learn` に限定されている記述を、アプリ全体の方針（上記のサイズ・色・配置・意味の対応表・`aria-hidden` と文字ラベル併記の原則）へ広げる。ナビの記号表現をやめることも明記する。
- **§8.7 アクセシビリティ**：解答後の正誤を色だけで示さない（アイコンと読み上げ文言を併記する）ことを追記する。
- **§7.2 レイアウト**：PCサイドバー・SP下部タブの各項目のアイコンと、テーマトグルの表示（切り替え先のアイコン、`aria-label` の方針）を追記する。
- **§7.1・§8.7 スキルツリー**：将来のツリー表現の ✓ / ▶ / 🔒 を Material Symbols に置き換えるかは、ツリー実装時に決める（今回は記録のみ）。

## 別Issue候補（アイコンの範囲外）

- SPアプリバーのストリーク表示が `12日` で固定されている（`dashboard-shell.tsx:166`）。§7.2 は「ストリーク表示」を求めており、`GET /analytics/summary` の `currentStreakDays` を表示するべきか判断が必要。
- PCサイドバー下部の「学習データ sample / foundation: 35%」が固定値のまま表示されている（`dashboard-shell.tsx:146-154`）。
- ローカル dev で API プロセスを停止しても、Web が Service Binding 経由でデータを取得し続け、エラー境界を再現できなかった。エラー表示の手動確認手順（API を失敗させる方法）が `app-verify` スキルにない。
