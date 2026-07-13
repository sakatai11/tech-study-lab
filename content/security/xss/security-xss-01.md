---
domain: security
topic: xss
lessonId: security-xss-01
title: XSSを防ぐ安全な画面表示
questions:
  - id: security-xss-01-q1
    type: mcq
    prompt: ユーザーが入力した文字列によって XSS が成立しやすいのは、どのような場合ですか？
    choices:
      - 入力値がブラウザでスクリプト実行につながる文脈として解釈される場合
      - 入力値をデータベースに暗号化して保存する場合
      - 入力値をサーバーのログに記録する場合
      - 入力値をURLエンコードしてネットワーク送信する場合
    answerIndex: 0
    explanation: XSS は、信頼できない入力値がスクリプトやイベントハンドラなど、実行可能な文脈としてブラウザに解釈されることで起こります。単に <b> のような無害なHTMLとして解析されるだけでは、スクリプト実行を伴うXSSにはなりません。暗号化保存やログ記録、URLエンコード送信はそれ自体では実行の条件を作らないため、XSS の成立条件ではありません。ただし、ログや保存した値も後で危険な HTML 挿入をすれば XSS の原因になり得ます。
  - id: security-xss-01-q2
    type: mcq
    prompt: ユーザー名をページ上に文字として表示したいとき、XSS を避けるために優先する DOM API はどれですか？
    choices:
      - innerHTML にユーザー名を連結して代入する
      - document.write にユーザー名を渡す
      - textContent にユーザー名を代入する
      - eval でユーザー名を評価してから表示する
    answerIndex: 2
    explanation: textContent は値をテキストとして扱うため、含まれる <script> や HTML タグを実行・要素化しません。innerHTML と document.write は文字列を HTML として解析し得るので、信頼できない値を直接渡すと危険です。eval は文字列を JavaScript として実行する API であり、表示用途では使うべきではありません。
  - id: security-xss-01-q3
    type: mcq
    prompt: Content Security Policy（CSP）の位置付けとして最も適切なのはどれですか？
    choices:
      - 安全な出力処理が不要になるため、CSPだけを設定すればよい
      - XSS の原因になる入力値を自動的に安全なHTMLへ書き換える仕組みである
      - XSS の被害を抑える助けになるが、安全な出力処理と併用する多層防御である
      - HTTPS を有効にするための通信暗号化の設定である
    answerIndex: 2
    explanation: CSP は読み込み・実行できるスクリプトなどを制限し、XSS が混入した場合の被害を小さくする助けになります。しかし危険な HTML 挿入そのものを安全にするものではないため、textContent などの安全な出力処理が第一です。CSPだけで十分という考え方、入力を自動変換するという説明、HTTPS の設定という説明はいずれも誤りです。
---

# XSSを防ぐ安全な画面表示

XSS（Cross-Site Scripting）は、Webページに表示したデータをブラウザが HTML や JavaScript として解釈し、意図しない処理を実行してしまう脆弱性です。攻撃者が投稿欄やプロフィール名などにスクリプトを含む文字列を登録し、それを他の利用者のブラウザで実行させることがあります。

重要なのは、**信頼できないデータを画面へ出すこと自体**が問題なのではない、という点です。そのデータを「文字」として表示するのか、「HTML」として解釈させるのかで安全性が変わります。

## 文字列を HTML として入れる危険

次の例では、表示したい名前を `innerHTML` に渡しています。

```js
const name = '<img src=x onerror="alert(1)">'
profile.innerHTML = `ようこそ、${name}さん`
```

`innerHTML` は渡された文字列を HTML として解析します。そのため、`name` に含まれた `img` 要素やイベントハンドラまで要素として扱われ、予期しないスクリプトが動く可能性があります。データベースに保存された値であっても、ユーザー由来なら信頼してはいけません。

## 文字として表示する

HTMLを組み立てる必要がなく、文字列をそのまま見せたいだけなら `textContent` を使います。

```js
const name = '<img src=x onerror="alert(1)">'
profile.textContent = `ようこそ、${name}さん`
```

この場合、ブラウザは `<img ...>` をタグとして解釈せず、そのまま画面上の文字として表示します。`textContent` は「この値はテキストである」という意図を DOM API に伝えるため、安全な既定の選択になります。

どうしてもユーザー由来の HTML を許可する機能では、用途に合わせて厳格な許可リストでサニタイズする設計が必要です。自作の文字列置換ではなく、DOMPurify のように継続的に保守されているサニタイザを使います。ただし、まずは HTML を受け付けない設計と `textContent` のような安全な API を選ぶことが基本です。

## CSPは最後の防波堤の一つ

Content Security Policy（CSP）は、ブラウザに「どのスクリプトを読み込み・実行してよいか」を指示する HTTP レスポンスヘッダーです。適切な CSP は、万一 XSS が混入したときに実行できるスクリプトを制限し、被害を抑える助けになります。`unsafe-inline` や `*` のような広すぎる許可は避け、レスポンスごとに生成する nonce や、内容が固定のスクリプトには hash を使って許可するのが安全です。

たとえば、インラインスクリプトを必要最小限にするなら、次のように nonce を使えます。

```http
Content-Security-Policy: script-src 'self' 'nonce-<response-specific-value>'; object-src 'none'; base-uri 'self'
```

ただし CSP は、危険な `innerHTML` の利用を安全に変えるものではありません。安全な出力処理を第一にし、そのうえで CSP を追加するのが多層防御です。ひとつの対策だけに頼らず、入力の扱い、出力先に合った API、CSP を組み合わせて XSS のリスクを下げましょう。
