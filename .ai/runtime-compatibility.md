# Claude Code / Codex 実行互換ルール

このリポジトリでは `.ai/skills/` と `.ai/agents/` を共通定義の一次配置とする。Claude Code は `.claude/` から、Codex は `.agents/skills/` からスキルを発見する。Codex 固有のカスタムエージェントは `.codex/agents/*.toml` で登録する。配置・hook・ログの仕様は `docs/ai-coding-agents.md` にある。

全文を読む必要はない。必要な場面で該当する節だけを読む。複数の節で使う `<scratchpad>` は `.claude/logs/briefs/`（gitignore 対象）を指す。

| 場面 | 読む節 |
|---|---|
| ランタイム固有のツールを使う（進捗管理、ユーザー確認、バックグラウンド実行、ブラウザ、sandbox・approval） | ランタイム差分の原則 |
| GitHub を操作する | GitHub 操作と認証 |
| サブエージェントを起動する | サブエージェントの起動 |
| 別モデル CLI でレビューする | GitHub 操作と認証（Sandbox 内外の認証診断を含む）／認証 preflight と承認の分離／Claude CLI の認証情報／別モデル CLI レビュー |

## ランタイム差分の原則

- **同等機能を使う**: スキルやエージェント定義が想定する操作は、各ランタイムに備わる同等の機能で行う。対象は、読み取り・検索・コマンド実行・パッチ編集・進捗管理・ユーザー確認・バックグラウンド実行である。同等の機能がない場合は、短い進捗報告や通常の質問で代替する。
- **sandbox と approval**: コマンドの実行は、そのランタイムの sandbox・approval 規則に従う。Claude の `settings.json` の allow / deny は、Codex の権限を変更しない。権限や sandbox の迂回フラグは使わない。
- **ブラウザが使えない場合**: HTTP レベルの検証までを行い、UI は未確認と報告する。

## GitHub 操作と認証

- **使う手段**: 認証済みの `gh` CLI を使って、PR・Issue・レビュー・コメント・レビュースレッドを取得・作成・更新・解決する。開始時に `gh auth status` を確認し、失敗した場合は認証を復旧するまで GitHub を操作しない。
  - Codex App で GitHub コネクタが接続済みの場合は、同等の操作にコネクタを使ってよい。コネクタは `gh` の必須の代替ではない。
  - ローカルの `git fetch` / `git push` / コミットはコネクタの対象外で、ローカル Git の認証・権限に従う。
- **Sandbox 内で未認証と出たとき**: 認証の確認と外部通信は、別々に診断する。`gh auth status`、`codex login status`、`.ai/scripts/run-claude-review.sh auth status` のいずれかが Sandbox 内で未認証を返しても、すぐにユーザーへ再ログインを求めない。まず同じ状態確認コマンドだけを、正規の承認・権限昇格の経路で再実行する。Sandbox の外で認証済みなら、OS の keyring または認証キャッシュが Sandbox から見えなかったものとして扱う。
- **認証済みなのに通信エラーが出るとき**: API・DNS・接続のエラーなら、対象の読み取りコマンドだけを正規の承認・権限昇格の経路で再実行するか、Codex App の接続済みコネクタを使う。通信の失敗を「未認証」と報告しない。
- **認証は共有されない**: GitHub コネクタの認証と、`gh` や別モデルレビュー用 CLI（Codex CLI・Claude CLI）の認証は別物である。これらの CLI はコネクタで代替できないので、CLI 自身の認証状態を上記の二段階で確認する。

### 認証 preflight と承認の分離

- **確認するタイミング**: 別モデル CLI の認証 preflight は、その CLI を実行する可能性が確定した時点で1回だけ行う。
  - `reviewPolicy: always`: 作業開始時
  - `risk-based`: 実行が必要と判定した時点
  - `never`: 実施しない
- **ログインを依頼する条件**: Sandbox の外で同じ状態確認をしても未認証だった場合だけ、ユーザーに CLI のログインを依頼する。Sandbox の承認、Keychain が見えないこと、通信の失敗、CLI がないことを「ユーザー認証が必要」と表現しない。
- **記録と再利用**: 認証済みなら、CLI 名・バージョン・確認コマンド・時刻・`authReady: true` だけを `<scratchpad>/review-mode-<N>.md` に記録し、同じスキル実行の中で再利用する。トークン、アカウント識別子、認証出力の全文は記録しない。再確認するのは、CLI が auth error を返したとき、CLI の実体が変わったとき、別のスキル実行になったときだけである。
- **承認を混同しない**: ランタイムのコマンド実行承認、CLI のログイン、private な内容の外部送信への同意は、それぞれ別の判断である。どれか1つで他を代用しない。ランタイムがセッション限定・対象コマンド限定で承認を再利用できる場合に限り、同じスキル実行の read-only レビューに使ってよい。永続的な承認規則や、CLI 全体を許可する広い承認規則は作らない。

## Claude CLI の認証情報

- Claude CLI で認証確認やレビューを行う場合は、`claude` を直接起動せず、`.ai/scripts/run-claude-review.sh` を使う。この wrapper は同じプロセス内で `.ai/scripts/load-secrets.sh` を source し、macOS Keychain の `AI_CLAUDE_CODE_OAUTH_TOKEN` / `claude` から取得した値を、`CLAUDE_CODE_OAUTH_TOKEN` として環境変数経由で Claude CLI にだけ渡す。
- トークンを、コマンド引数・標準入力・ログ・ブリーフ・リポジトリ内のファイルへコピーしない。

## サブエージェントの起動

役割の単一ソースは `.ai/agents/<name>.md` である。

- **Claude Code**: Agent 機能で `subagent_type: <name>` を指定する。
- **Codex**: `.codex/agents/<name>.toml` に登録したカスタムエージェント `<name>` を指定する。カスタムエージェントの種別を直接指定できない場合は、通常のサブエージェントを起動し、プロンプトで `.ai/agents/<name>.md` を全文読むよう明記する。Codex には、Claude の `subagent_type` や `model: sonnet` を渡さない。
- **サブエージェント機能がない環境**: 定義を全文読み、同じ制約で作業する。ただし独立レビューは、実装したコンテキストで代替せず、別セッションでのレビューを求める。

長いブリーフは `<scratchpad>` に保存し、サブエージェントにはファイルパスを渡す。短い依頼は直接渡してよい。

### Codex サブエージェントのモデル

`.codex/agents/*.toml` に登録するエージェント自身のモデル設定は、各 TOML の `model` / `model_reasoning_effort` が一次ソースである。現在は `reviewer` が `gpt-6-sol` / `high`、`content-author` が `gpt-6-sol` / `medium` である。次節の別モデル CLI レビューで呼ぶモデルとは別物である。

仕様が曖昧・矛盾している場合、複数領域をまたぐ設計判断が必要な場合、セキュリティレビューの場合は、該当する TOML を `gpt-6-astra` / `high` へ一時的に昇格してよい。昇格は未コミットのローカル上書きで行い、コミットの前に標準設定へ戻す。

## 別モデル CLI レビュー

外部レビューが必要と判定したコミット済み差分は、**ホストランタイムとは別の提供元のモデル**の CLI で独立レビューする。ホストと同じ提供元の CLI は使わない。使うと「独立した第二の目」が成立しないためである。

| ホストランタイム | オーケストレーターが直接実行するコマンド | モデル指定 | 送信先 |
|---|---|---|---|
| Claude Code | `codex exec review --base <effective-base> -c sandbox_mode="read-only"` | `-m gpt-6-sol` | OpenAI |
| Codex（App / CLI） | `git diff <effective-base>...HEAD \| .ai/scripts/run-claude-review.sh -p ...` | `--model opus` | Anthropic |

- **モデル指定**: `-m` / `--model` で必ず明示する。既定のモデルに委ねない。指定したモデルが使えるかは、起動前に契約とクライアントの環境で確認する。
- **観点の分担**: `reviewer` が正確性優先、別モデル CLI が仕様準拠優先である（`.ai/review-guidelines.md`）。CLI の出力はオーケストレーターが直接読み、同規約の分類と重要度で判定する。
- **起動する主体**: 別モデル CLI はサブエージェントからは起動しない。オーケストレーターが継続セッションで直接起動する。
- **ブリーフ**: `<scratchpad>` のファイルとして渡し、長文を起動プロンプトへ直接貼らない。ブリーフには、対象 Issue・対象機能・受け入れ条件・範囲外の扱い・差分範囲を含め、同意済みの送信範囲と一致させる。
- **起動前の確認**:
  - `git merge-base <base> HEAD` で effective base を1つに定め、`git rev-parse --verify <effective-base>^{commit}` で検証する。終了コードが非0、出力が空または複数行、検証失敗のいずれかなら「判定: error」とし、CLI を実行しない。
  - レビュー対象はコミット済みの差分に限る。`git status --short` が空であることと、`committedRange` が実際の差分と一致することを確かめる。
- **read-only の徹底**:
  - `codex exec review` の既定の Sandbox は `workspace-write` なので、`-c sandbox_mode="read-only"` を必ず付ける。`review` サブコマンドでは `-s` / `--sandbox` は使わない。
  - Claude CLI には `--allowedTools "Read Grep Glob"` と `--disallowedTools "Edit Write NotebookEdit Bash"` を付け、Keychain wrapper 以外には資格情報を渡さない。
- **出力の扱い**: raw の stdout / stderr はファイル・ブリーフ・scratchpad に残さない。永続化する場合は、機密を除き、判定に必要なメタ情報だけにする。
- **監視と失敗**:
  - 生存中で出力がないプロセスは `running` とし、5分で止めない。10分で進捗を通知し、20分で一度だけ終了して「判定: timeout」とする。
  - 自動でリトライしない。timeout・認証・通信・同意不足・実行失敗を approve と読み替えず、指摘の解消状況も更新しない。
  - 差分が大きくて timeout した場合は、ユーザーに状況を報告し、分割レビューにするかを判断してもらう。
