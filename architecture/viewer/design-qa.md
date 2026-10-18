# Design QA

final result: passed

2026-10-18。ユーザーが選択した第2案を参照して実装・比較した。

## 比較条件と証跡

- 参照: `reports/knowledge-graph-viewer/reference.png`（1487 × 1058）
- 実装: `reports/knowledge-graph-viewer/desktop.png`（1487 × 1058、同じ寸法で比較）
- モバイル: `reports/knowledge-graph-viewer/mobile.png`（viewport 390 × 844、ページ全体を撮影）
- 状態: `due-count`、深さ2、呼び出し・依存、`getDueCount` を選択。
- 証跡はリポジトリルートからのパス。reports はローカル検証用の gitignore 対象。

## 視覚比較

参照画像と実装画像を同時に表示して確認した。暗い背景、紫・緑・橙・青の4レーン、検索と深さ切り替え、選択ノードの青い枠、下部の3列インスペクターを維持した。余白、罫線、文字の階層、カード配置とコントラストを確認した。本文は Inter、コードは JetBrains Mono、アイコンはローカル配信の Material Symbols Rounded。日本語は OS フォントを使う。

参照の仮データは実際のコードに合わせた。`review-service.ts` の名前・行番号・抜粋、ReviewDeps の所属、関係の向きとノード数は抽出結果を正とする。説明文の創作は行わない。出典操作はパスのコピーとし、ノードを起点に再探索できるようにした。

実データは参照より多いため、読めるカードサイズを優先し、グラフ内でパン・ズームする。全体表示と読みやすいサイズの切り替えを提供する。コードの長い行は出典領域内でスクロールする。モバイルではインスペクターを縦積みにし、グラフは横移動できる。DOM 実測で viewport width と document scrollWidth はともに390px。

## 発見と修正

- 自動全体表示で文字が小さすぎた問題を、初期表示サイズとズーム操作で修正。
- 出典が横一列になる問題を、行単位のブロック表示で修正。
- フィルター切り替え時の React 更新ループを、安定したノード変更ハンドラーで修正。修正後の操作・最終表示で新しい console error はなし。ログには修正前の08:50 UTCの2件が残る。
- 関係セレクターと関連ノード操作に明示的なアクセシブル名を追加。

## 機能と品質の検証

- ブラウザ: 検索、大文字入力、該当なし、深さ0、関係切り替え、全体214ノード・296関係、マウスとキーボードのノード選択、関連ノードへの移動を確認。
- コピー成功表示とクリップボードの `apps/api/src/services/review-service.ts:28` を確認。
- `pnpm architecture:test`: 30件成功。CLI探索との一致、正確な出典、読み取り境界を含む。
- `pnpm architecture:check`: 抽出スナップショットと Worker bindings の整合性を確認。
- `pnpm lint`: Biome と依存方向検査が成功。
- `npm --prefix architecture/viewer run build`: 成功。
- `npm --prefix architecture/viewer run test:sites`: テンプレートの4件成功。

残存する重大な視覚・操作上の問題はなし。ライブ通信エラー画面の障害注入は未実施。抽出対象外の UI・教材関係は表示しない旨を画面に明記している。

## Issue #259 レビュー後の補足（2026-10-19）

Graph取得ミドルウェアに明示的なHost許可リストを追加。Vite本体のHost検証より先に動くため、Originなし・細工されたHostと一致するOriginの両方を拒否する回帰テストを追加した。設定ポートの127.0.0.1とlocalhostだけを許可する。関連するarchitectureテストは31件となる。画面のレイアウト変更はない。

Product Design由来のSites用ファイルはローカルのビルド互換性のために保持し、公開処理は行わない。テンプレートの一時的な作業指示は整理し、ルートの規約と文書化した起動手順を優先するようにした。
