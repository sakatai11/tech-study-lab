---
domain: frontend
topic: react
lessonId: frontend-react-01
title: state と再レンダリングの基本
estimatedMinutes: 18
questions:
  - id: frontend-react-01-q1
    type: mcq
    prompt: React の「宣言的 UI」の考え方として最も適切なのはどれですか？
    choices:
      - ボタンが押されるたびに、変更が必要な DOM 要素を自分で探して書き換える処理を並べる
      - state ごとに「画面がどう見えるか」を記述し、state が変わったら React が画面を更新する
      - コンポーネントの外に変数を置き、その変数を書き換えれば画面が自動で更新される
      - 画面の更新は常に全 DOM を作り直す前提で、開発者が再描画のタイミングを指定する
    answerIndex: 1
    explanation: 宣言的 UI では、「この state のときはこう見える」という描画結果を記述し、state が変わったときの DOM 更新の手順は React に任せます。「変更が必要な DOM 要素を自分で探して書き換える」という選択肢は、DOM を直接操作する命令的なスタイルの説明です。コンポーネント外の通常の変数を書き換えても React は変更を検知せず、再レンダリングも起きないため、外部の変数を書き換えれば自動で更新されるという選択肢は誤りです。「常に全 DOM を作り直す」という選択肢も誤りで、React は前回の描画結果との差分から必要な DOM 操作だけを行い、再描画のタイミングも state の更新によって React が決めます。
  - id: frontend-react-01-q2
    type: mcq
    prompt: count の初期値が 0 のコンポーネントで、クリックハンドラ内で setCount(count + 1) を3回続けて呼び、その直後に console.log(count) を実行しました。1回クリックしたとき、次のレンダーの表示と console.log の出力はどうなりますか？
    choices:
      - 表示は 3 になり、console.log は 0 を出力する
      - 表示は 1 になり、console.log は 1 を出力する
      - 表示は 3 になり、console.log は 3 を出力する
      - 表示は 1 になり、console.log は 0 を出力する
    answerIndex: 3
    explanation: setCount は state を「次のレンダーで」更新するよう React に依頼するだけで、実行中のハンドラ内の count は、そのレンダー時点の値(0)のまま変わりません。そのため console.log は 0 を出力し、3回とも setCount(0 + 1) を依頼することになるので、次のレンダーの表示は 1 です。3 になると考えるのは、setCount が即座に変数を書き換えると誤解している場合の答えです。console.log が新しい値を出すという考えも同じ誤解に基づきます。
  - id: frontend-react-01-q3
    type: mcq
    prompt: 1回のクリックで count を確実に 3 増やしたいとき、ハンドラの書き方として適切なのはどれですか？
    choices:
      - setTimeout で 3 回に分け、各回で setCount(count + 1) を呼ぶ
      - setCount(count + 1) を 3 回呼ぶ。React が自動で積算してくれる
      - setCount(c => c + 1) を 3 回呼ぶ。更新関数が直前の保留中の state を受け取る
      - count++ を 3 回実行してから setCount(count) を呼ぶ
    answerIndex: 2
    explanation: 更新関数 setCount(c => c + 1) は、キューに積まれた直前の更新を反映した値を引数として受け取るため、3回呼べば 3 増えます。直前の state に基づいて更新するときは更新関数を使うのが基本です。setCount(count + 1) を3回呼んでも、どれも同じレンダー時点の count を基準にするので 1 しか増えません。setTimeout で分けても、各回のコールバックは同じレンダーの count を捕まえているので、やはり 1 しか増えません。count++ は state を直接書き換える行為で、React の管理外の変更になり、正しく再レンダリングされません。
  - id: frontend-react-01-q4
    type: mcq
    prompt: state の配列 todos に対し、ハンドラ内で todos.push(text) を実行してから setTodos(todos) を呼ぶと、画面が更新されないことがあります。原因と対処として最も適切なのはどれですか？
    choices:
      - 同じ参照の配列を setTodos に渡すと変更なしと判断され得るため、新しい配列を作って渡す
      - 配列は state に使えないため、オブジェクトに包んで保存する必要がある
      - push は非同期で動くため、await してから setTodos を呼ぶ必要がある
      - 配列の変更を検知するには、useEffect の依存配列に todos を指定する必要がある
    answerIndex: 0
    explanation: React は state の新旧を Object.is で比較し、同じ値なら再レンダリングを行わないことがあります。todos.push(x) で既存の配列を直接変更し、同じ参照を setTodos に渡すと、変更なしとみなされ得ます。setTodos([...todos, x]) のように新しい配列を作って渡すのが正しい方法です。push は同期処理なので await は無関係です。配列も state に持てるため、包む必要はありません。useEffect は描画後の副作用のためのもので、再レンダリングを起こす仕組みではないので、依存配列に指定しても解決しません。
  - id: frontend-react-01-q5
    type: mcq
    prompt: 並べ替えや先頭への追加が行われるリストで、map のインデックスを key にすると起こりやすい問題はどれですか？
    choices:
      - key が数値であるため、React が警告を出して描画できなくなる
      - 要素の位置と key が対応づくため、並べ替え後に入力欄の内容などの state が別の項目に残ることがある
      - 同じリスト内で key が重複するため、常に最後の項目だけが描画される
      - key が props として子に渡るため、子コンポーネントが index を直接参照できてしまう
    answerIndex: 1
    explanation: React は key を使って、前回と今回のレンダーで「どの要素が同じものか」を判断します。インデックスを key にすると、並べ替えや挿入で項目の位置が変わったとき、同じ key の要素として state(入力途中の文字など)が位置に紐づいたまま残り、別の項目に表示されることがあります。データに固有の安定した ID を key にするのが原則です。数値の key は警告になりません。インデックスは一意なので重複は起きず、すべての項目が描画されます。key は特別な属性で、props としては子に渡されません。
  - id: frontend-react-01-q6
    type: mcq
    prompt: props の firstName と lastName から表示用の fullName が必要です。React の考え方に沿った実装はどれですか？
    choices:
      - fullName を state にし、useEffect で firstName と lastName の変更時に setFullName を呼ぶ
      - fullName を state にし、fullName・firstName・lastName をそれぞれ別の state にして、手作業で揃える
      - レンダー中に const fullName = firstName + ' ' + lastName のように計算する
      - 依存配列を空にした useEffect で fullName を一度だけ計算して state に保存する
    answerIndex: 2
    explanation: props や既存の state から計算できる値(派生値)は、state にせずレンダー中に計算するのが原則です。effect で state に写すと、余計な再レンダリングが走り、一度古い値で描画される可能性があるうえ、同期が崩れる余地も生まれます。effect で写す書き方はよくありますが冗長です。state を3つ別々に持つ方法は同期の手間とバグの温床になります。空の依存配列の effect は、firstName や lastName が変わっても再計算されず、古い値のままになるため不適切です。計算が重い場合は useMemo を検討しますが、まず計算で足りるかを考えます。
  - id: frontend-react-01-q7
    type: mcq
    prompt: useEffect の依存配列についての説明として正しいものはどれですか？
    choices:
      - effect 内で使うリアクティブな値(props・state など)は依存配列に含める。配列から外すと、effect が古い値を参照し続ける原因になる
      - 依存配列を空にしておけば、effect 内で最新の state を常に参照できる
      - 無限ループを避けたいときは、lint の警告を無視して依存配列から値を外すのが推奨される
      - 依存配列に指定した値が変わると、レンダーより前に effect が実行される
    answerIndex: 0
    explanation: effect 内で参照する props・state などのリアクティブな値は、依存配列に含めるのが基本です。含めないと、effect が作られたときの古い値を参照し続けるバグになります。空配列は「マウント後に一度だけ」を意味し、最新の値は参照できません。無限ループは依存を外すのではなく、effect を見直して原因を解消します(派生値の計算や、イベントハンドラへの移動など)。effect は描画が反映された後に実行されるため、レンダーより前ではありません。
---

# state と再レンダリングの基本

React では、画面は「現在の state から計算される結果」です。この教材では、state がどのように画面へ反映されるか、そしてよくある落とし穴(更新のタイミング、直接変更、key、useEffect の使いすぎ)を整理します。

## 宣言的 UI と state

従来の DOM 操作では、「ボタンが押されたら、この要素を探して、テキストを書き換えて……」と手順を書きました(命令的)。React では、**state ごとに画面がどう見えるか**を記述します(宣言的)。

```tsx
import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)

  return (
    <button onClick={() => setCount(count + 1)}>
      クリック数: {count}
    </button>
  )
}
```

`useState` は、レンダーをまたいで保持される値(state)と、それを更新する関数の組を返します。`setCount` を呼ぶと React は **コンポーネント関数をもう一度呼び出し(再レンダリング)**、新しい state に対応する JSX を得て、前回との差分だけを DOM に反映します。

ここで重要なのは、通常の変数は再レンダリングのたびに作り直されるので、値を覚えておけないという点です。また、コンポーネントの外やローカルの変数をいくら書き換えても、React はそれを検知しません。**画面に影響する値は state にし、state の更新関数を通して変える**のが基本です。

## state 更新は「次のレンダー」で反映される

初学者がよくつまずくのが、`setCount` を呼んだ直後も変数 `count` は変わらない、という点です。

```tsx
function handleClick() {
  setCount(count + 1)
  setCount(count + 1)
  setCount(count + 1)
  console.log(count) // クリック前が 0 なら 0
}
```

各レンダーでは、`count` はそのレンダー時点のスナップショットとして固定されています。`setCount(count + 1)` は「次のレンダーで state を `count + 1` にしてほしい」と React に依頼するだけで、実行中のハンドラ内の `count` は書き換わりません。上の例は3回とも `setCount(0 + 1)` を依頼するので、結果は 1 です。イベントハンドラ内の複数の更新はまとめて処理され(バッチ処理)、再レンダリングは1回になります。React 18 以降は、Promise や setTimeout の中で呼んだ更新も同様にまとめられます。

直前の state をもとに更新したいときは、**更新関数**を渡します。

```tsx
function handleClick() {
  setCount((c) => c + 1)
  setCount((c) => c + 1)
  setCount((c) => c + 1)
}
```

更新関数は、キューに積まれた直前の更新を反映した値を引数として受け取ります。3回呼べば、結果は +3 です。「前の値に基づいて次の値を決める」更新では、更新関数を使うと意図どおりに動きます。

## state はイミュータブルに更新する

React は、新旧の state を `Object.is` で比較して、変化があったかを判断します。オブジェクトや配列は **参照**で比較されるため、中身を直接書き換えても参照は同じままです。

```tsx
const [todos, setTodos] = useState<string[]>([])

function addBad(text: string) {
  todos.push(text)   // 既存の配列を直接変更
  setTodos(todos)    // 同じ参照なので、変更なしと判断され得る
}

function addGood(text: string) {
  setTodos([...todos, text]) // 新しい配列を作って渡す
}
```

`addBad` は React にとって「同じ値が渡された」ので、再レンダリングされないことがあります。直接変更は、メモ化(`memo` など)による最適化や、前の state との比較も壊します。オブジェクトも同様に、新しいオブジェクトを作って渡します。

```tsx
setUser({ ...user, name: '新しい名前' })
```

配列では `push` / `splice` / `sort` のような元の配列を変える操作ではなく、スプレッド構文、`filter`、`map`、`toSorted` など新しい配列を返す操作を使います。ネストが深い場合は、変更する経路すべてで新しいオブジェクトを作る必要があります。

## リストの key

配列を `map` で描画するときは、各要素に `key` が必要です。key は、**前回と今回のレンダーで、どの要素が同じものか**を React が判断するための識別子です。

```tsx
// 推奨: データ固有の安定した ID
{todos.map((todo) => (
  <TodoItem key={todo.id} todo={todo} />
))}

// 避ける: 位置を key にする
{todos.map((todo, index) => (
  <TodoItem key={index} todo={todo} />
))}
```

インデックスを key にすると、key は「データ」ではなく「位置」と結びつきます。先頭に項目を追加したり並べ替えたりすると、同じ key の要素が別のデータに割り当たります。このとき、`TodoItem` 内部に state(入力途中のテキスト、チェック状態など)があると、**state が位置に残ったまま、表示されるデータだけが入れ替わる**といったバグになります。

key は兄弟要素の間で一意であればよく、データの ID を使うのが基本です。key は特別な属性で、props としては子に渡されません。また、`Math.random()` のように毎回変わる値を key にすると、毎回要素が作り直され、state も失われるため避けます。逆に、key を変えると state をリセットできる、という使い方もあります。

## useEffect は「外部との同期」のためのもの

`useEffect` は、描画が画面に反映された後に実行される処理で、サーバー通信、タイマー、DOM の外の仕組みとの同期など **React の外側の世界と同期する**ために使います。

```tsx
useEffect(() => {
  const id = setInterval(() => setSeconds((s) => s + 1), 1000)
  return () => clearInterval(id) // クリーンアップ
}, [])
```

### 依存配列

第2引数の依存配列は、「この effect が参照するリアクティブな値」の一覧です。

- 配列内の値が前回から変わったときだけ、effect が再実行されます。
- 空配列 `[]` は、依存する値がないという宣言で、マウント後に1回だけ実行します(開発時の Strict Mode ではマウント・アンマウント・マウントが確認のために行われます)。
- effect 内で使う props・state・それらから計算された値は、依存配列に含めます。含めないと、古い値を参照し続けるバグになります。lint の警告を黙らせるために依存を外すのではなく、effect の設計を見直します。

### 派生値は effect で作らない

props や state から計算できる値を、effect で別の state に写すのは典型的な誤りです。

```tsx
// 避ける: 冗長な state と effect
const [fullName, setFullName] = useState('')
useEffect(() => {
  setFullName(firstName + ' ' + lastName)
}, [firstName, lastName])

// 推奨: レンダー中に計算する
const fullName = firstName + ' ' + lastName
```

前者は、一度古い `fullName` で描画されたあと、effect で state を更新して再度レンダリングされるので、余計な描画と不整合の可能性を生みます。計算できるものは、レンダー中に計算します。計算が重い場合のみ `useMemo` を検討します。

また、ボタンクリックに対する処理のように、特定のユーザー操作が原因の処理は、effect ではなくイベントハンドラに書くのが適切です。

## まとめ

- 画面は state から計算される。画面に影響する値は state にして、更新関数経由で変える。
- 更新は次のレンダーで反映される。直前の値に基づく更新は更新関数を使う。
- state は直接変更せず、新しいオブジェクト・配列を作って渡す。
- リストの key は、データ固有の安定した ID にする。インデックスは避ける。
- useEffect は外部との同期用。依存配列は正直に書き、派生値はレンダー中に計算する。
