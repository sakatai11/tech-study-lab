# docs/mockups — ビジュアルモックアップ

DevPath（tech-study-lab）の UI デザイン検討で作成したモックアップ群。
**正式採用は `DevPath Unified.html`**。スタイル方針の一次ソースは [`docs/design.md` §8.7](../design.md)。

## ファイル一覧と位置づけ

| ファイル | 位置づけ | 概要 |
| --- | --- | --- |
| **`DevPath Unified.html`** | ✅ **正式版** | 「Neo Flat の骨格 × ターミナル表現のコンテンツ」の統合版。GitHub dark/light トークン・ダークファースト・チャンキーボタン・草ヒートマップ・テストランナー風結果・`devpath tree` 風スキルツリー。実装の参照先はこれ |
| `DevPath Dev-Native Neo Flat.html` | アーカイブ（統合元） | Duolingo 的ゲーミフィケーション × GitHub 計器盤 × エディタ色彩。スキルツリーが蛇行パスである点以外は Unified とほぼ同一 |
| `DevPath Retro OS.html` | 🎁 演出候補として保管 | Win9x/XP 風デスクトップ OS メタファー（ウィンドウ chrome・タスクバー・BIOS ブート・XP バルーン通知）。日常 UI には不採用だが、**LP・404・ロード画面等のイースターエッグ候補** |
| `DevPath Soft UI Hybrid.html` | アーカイブ | ニューモーフィズムの面＋フラットな操作要素のハイブリッド。WCAG AA・フォーカスリング・ダークモード対応の検証版 |
| `DevPath Neumorphism Interactive.html` | アーカイブ | 初代ニューモーフィズム案のインタラクティブ版（単体で開ける HTML） |
| `DevPath Neumorphism.dc.html` / `DevPath SP Neumorphism.dc.html` | アーカイブ | 初代ニューモーフィズム案（PC/SP）。`.dc.html` 形式のため `support.js` が必要 |
| `support.js` | 補助 | `.dc.html` 形式のランタイム |

`.dc.html` 以外はすべて自己完結型の単一 HTML（外部依存は Google Fonts のみ）。ブラウザで直接開いて操作できる。

## 検討の経緯（要約）

1. **Neumorphism**（初代）→ 低刺激で学習向きだが、コントラスト不足・状態表現の乏しさ・ダークモード困難が学習アプリの要件と衝突
2. **Soft UI Hybrid** → 面はニューモーフィズム・操作はフラットで弱点を補正（WCAG AA / フォーカスリング / ダーク対応）
3. **Dev-Native Neo Flat** → 方向転換。「ゲーミフィケーションをエンジニア文化に翻訳する」（草・SRS パラメータ全公開・テストランナー結果・コンボ）。構成の分かりやすさ・SP 導線で最有力に
4. **Retro OS** → よりテック寄りの実験（Win9x×ターミナル）。視覚インパクトは最大だが、装飾が情報と競合し学習ツールとしては過剰。OS 固有 chrome は本体不採用
5. **Unified**（最終）→ Neo Flat の骨格に、Retro OS から「認知負荷を下げるターミナル表現」（ディレクトリツリー・テストレポート・プロンプト）だけを回収。ターミナルヘッダーは OS 中立の `>_` バッジ形式

## 設計原則（詳細は design.md §8.7）

- 装飾は情報と競合させない（意味を運ばない装飾は置かない）
- エンジニアの既存メンタルモデル（草・tree・テストランナー）を UI 語彙として借りる
- OS 固有 chrome（mac トラフィックライト・Win9x ウィンドウ）は本体に持ち込まない
- モバイルファースト（ボトムタブ・44px タッチターゲット・空白桁揃え禁止）
- XP / 実績 / デイリークエストはモック上の演出であり MVP スコープ外（design.md §8.7 の実装区分を参照）
