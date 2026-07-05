import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Code2, FileText, Home, Layers, Lock, RotateCcw, ShieldCheck, UserRound, X } from "lucide-react";

type Route = "/" | "/learn/security/xss" | "/learn/security/xss/xss-basics" | "/quiz/xss-basics" | "/review" | "/result";
type Mode = "quiz" | "review";

type Question = { id: string; text: string; options: string[]; correct: number; note: string };

const lesson = {
  domain: "security",
  topic: "xss",
  slug: "xss-basics",
  title: "XSSの基礎とエスケープ設計",
  minutes: 18,
  tag: "Security / XSS",
};

const questions: Question[] = [
  { id: "XSS-001", text: "ユーザー入力をHTML本文へ表示する際、最初に検討すべき対策はどれですか？", options: ["出力時に文脈に応じてエスケープする", "入力値をすべて削除する", "CookieをHttpOnlyにするだけでよい", "CSPだけを設定する"], correct: 0, note: "XSS対策の基本は、HTML本文・属性・URL・JavaScriptなど出力文脈に応じたエスケープです。" },
  { id: "XSS-002", text: "Reactで通常のテキスト埋め込みが比較的安全な理由はどれですか？", options: ["JSXの文字列展開は標準でHTMLエスケープされる", "ブラウザがscriptタグを必ず無視する", "Reactは通信を暗号化する", "DOM APIがすべて無効化される"], correct: 0, note: "Reactはテキストとして埋め込む値をエスケープします。ただし dangerouslySetInnerHTML などは別途注意が必要です。" },
  { id: "XSS-003", text: "保存型XSSの説明として最も適切なものはどれですか？", options: ["悪意ある入力がDBなどに保存され、後から閲覧者へ配信される", "URLのクエリだけで一時的に発火する", "HTTPSを使わない通信だけで発生する", "サーバーのCPU使用率が上がる攻撃である"], correct: 0, note: "保存型XSSは投稿・プロフィール等に保存されたスクリプトが、他ユーザー閲覧時に実行されるタイプです。" },
];

const areas = [
  { name: "Security", icon: ShieldCheck, meta: "XSS・認証・脆弱性", route: "/learn/security/xss" as Route, done: "42%" },
  { name: "FE", icon: Code2, meta: "React・UI設計", route: "/learn/security/xss" as Route, done: "68%" },
  { name: "BE", icon: Layers, meta: "API・DB", route: "/learn/security/xss" as Route, done: "31%" },
  { name: "Arch", icon: BookOpen, meta: "設計・運用", route: "/learn/security/xss" as Route, done: "18%" },
];

function Header({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  return <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/86 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6"><button onClick={() => navigate("/")} className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Code2 size={17} /></span><span className="font-['JetBrains_Mono'] text-sm font-bold tracking-[0.16em]">DEVPATH</span></button><nav className="flex items-center gap-0.5 rounded-full border border-border bg-card/70 p-0.5 sm:gap-1 sm:p-1">{[["/", "学習"], ["/learn/security/xss", "教材"], ["/review", "復習"]].map(([id, label]) => <button key={id} onClick={() => navigate(id as Route)} className={`rounded-full px-2.5 py-2 text-xs transition sm:px-4 sm:text-sm ${route === id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}</nav><div className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1"><div className="grid size-8 place-items-center rounded-full bg-secondary"><UserRound size={16} /></div><span className="hidden pr-2 text-sm text-muted-foreground sm:block">田中</span></div></div></header>;
}

function PrimaryButton({ children, onClick, subtle = false }: { children: React.ReactNode; onClick?: () => void; subtle?: boolean }) {
  return <button onClick={onClick} className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold transition active:scale-[.98] ${subtle ? "border border-border bg-secondary text-secondary-foreground hover:bg-muted" : "bg-primary text-primary-foreground shadow-[0_14px_40px_rgba(20,184,166,.24)] hover:bg-teal-300"}`}>{children}</button>;
}

function Dashboard({ navigate, dueCount = 3 }: { navigate: (r: Route) => void; dueCount?: number }) {
  const due = questions;
  const weekly = [42, 58, 36, 72, 64, 88, 76];
  const domains = [
    ["Security", 42, "bg-teal-300"],
    ["FE", 68, "bg-sky-300"],
    ["BE", 31, "bg-violet-300"],
    ["Arch", 18, "bg-amber-200"],
  ] as const;
  return <main className="mx-auto max-w-6xl px-4 pb-12 pt-24 sm:px-6">
    <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="font-['JetBrains_Mono'] text-xs tracking-[0.22em] text-teal-300">/ DASHBOARD · LEARNING ANALYTICS</p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight sm:text-5xl">田中さん、今日の学習状況</h1>
        <p className="mt-3 text-muted-foreground">復習キュー、学習時間、正答率を1画面で把握できます。</p>
      </div>
      <PrimaryButton onClick={() => dueCount > 0 ? navigate("/review") : navigate("/learn/security/xss")}>{dueCount > 0 ? "復習を始める" : "XSSレッスンへ"} <ArrowRight size={18} /></PrimaryButton>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[["Due", `${dueCount}問`, "今日解くべき復習"], ["Study time", "2h 15m", "今週の合計"], ["Accuracy", "78%", "直近7日"], ["Streak", "12日", "継続中"]].map(([label, value, meta]) => <div key={label} className="rounded-2xl border border-border bg-card p-5"><p className="font-['JetBrains_Mono'] text-xs text-muted-foreground">{label}</p><p className="mt-3 text-3xl font-extrabold">{value}</p><p className="mt-1 text-sm text-muted-foreground">{meta}</p></div>)}
    </section>

    <section className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_.8fr]">
      <div className="rounded-[1.5rem] border border-border bg-card p-5">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold">学習アクティビティ</h2><p className="mt-1 text-sm text-muted-foreground">Google Analytics風に週次の学習量を可視化</p></div><span className="rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground">Last 7 days</span></div>
        <div className="flex h-64 items-end gap-3 rounded-2xl border border-border bg-background p-4">
          {weekly.map((v, i) => <div key={i} className="flex flex-1 flex-col items-center gap-2"><div className="flex w-full items-end rounded-t-xl bg-secondary" style={{ height: `${v}%` }}><div className="w-full rounded-t-xl bg-primary shadow-[0_0_30px_rgba(20,184,166,.22)]" style={{ height: "100%" }} /></div><span className="font-['JetBrains_Mono'] text-[10px] text-muted-foreground">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}</span></div>)}
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-5">
        <h2 className="text-xl font-bold">領域別進捗</h2>
        <div className="mt-5 space-y-5">{domains.map(([name, value, color]) => <button key={name} onClick={() => navigate("/learn/security/xss")} className="w-full text-left"><div className="mb-2 flex justify-between text-sm"><span>{name}</span><span className="font-['JetBrains_Mono'] text-muted-foreground">{value}%</span></div><div className="h-2 rounded-full bg-muted"><div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} /></div></button>)}</div>
      </div>
    </section>

    <section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <section className="rounded-[1.5rem] border border-border bg-card p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold">今日の復習（Due）</h2><p className="mt-1 text-sm text-muted-foreground">Server loader → hc で due 件数を取得する想定</p></div><span className="font-['JetBrains_Mono'] text-xs text-teal-300">{dueCount}問</span></div>{dueCount > 0 ? <><div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{due.map((q) => <button key={q.id} onClick={() => navigate("/review")} className="min-w-[245px] rounded-2xl border border-border bg-secondary p-4 text-left shadow-xl transition hover:-translate-y-1 hover:border-teal-300/50 sm:min-w-[280px]"><span className="font-['JetBrains_Mono'] text-[11px] text-teal-300">{q.id}</span><p className="mt-3 font-semibold">{q.text}</p><p className="mt-2 text-sm text-muted-foreground">レッスン横断 queue / 即時採点</p></button>)}</div><PrimaryButton onClick={() => navigate("/review")}>復習を始める <ArrowRight size={18} /></PrimaryButton></> : <div className="rounded-2xl border border-border bg-secondary p-5"><p className="font-semibold">今日の復習はありません</p><p className="mt-2 text-sm text-muted-foreground">新規レッスンへ進みましょう。</p><div className="mt-4"><PrimaryButton onClick={() => navigate("/learn/security/xss")}>XSSレッスンへ <ArrowRight size={18} /></PrimaryButton></div></div>}</section>
      <section className="rounded-[1.5rem] border border-border bg-card p-5"><h2 className="text-xl font-bold">次に進む教材</h2><button onClick={() => navigate("/learn/security/xss/xss-basics")} className="mt-5 w-full rounded-2xl border border-border bg-background p-5 text-left transition hover:border-teal-300/50"><FileText className="text-teal-300" size={22} /><span className="mt-4 inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">Security / XSS</span><h3 className="mt-4 text-2xl font-bold">{lesson.title}</h3><p className="mt-2 text-sm text-muted-foreground">教材本文 → 4択3問</p></button></section>
    </section>
  </main>;
}

function LessonList({ navigate }: { navigate: (r: Route) => void }) {
  return <main className="mx-auto max-w-3xl px-4 pb-12 pt-24 sm:px-6"><p className="font-['JetBrains_Mono'] text-xs tracking-[0.22em] text-teal-300">/learn/security/xss · RSC CONTENT</p><h1 className="mt-4 text-3xl font-extrabold sm:text-5xl">Security / XSS</h1><p className="mt-4 text-muted-foreground">トピック内のレッスン一覧。初期Walking Skeletonでは教材1本をバンドル済みcontentとして表示します。</p><button onClick={() => navigate("/learn/security/xss/xss-basics")} className="mt-8 flex w-full items-center justify-between rounded-[1.5rem] border border-border bg-card p-5 text-left transition hover:-translate-y-1 hover:border-teal-300/50"><div><span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">Lesson 01</span><h2 className="mt-4 text-2xl font-bold">{lesson.title}</h2><p className="mt-2 text-sm text-muted-foreground">Markdown本文・コード例・4択3問</p></div><ArrowRight className="text-teal-300" /></button></main>;
}

function LessonArticle({ navigate }: { navigate: (r: Route) => void }) {
  return <main className="mx-auto max-w-3xl px-4 pb-28 pt-24 sm:px-6"><article className="rounded-[1.75rem] border border-border bg-card p-6 sm:p-10"><div className="mb-8 flex flex-wrap gap-2"><span className="rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground">{lesson.tag}</span><span className="rounded-full bg-secondary px-3 py-1 text-sm text-muted-foreground">約{lesson.minutes}分</span><span className="rounded-full bg-secondary px-3 py-1 text-sm text-muted-foreground">/learn/security/xss/xss-basics</span></div><h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">{lesson.title}</h1><p className="mt-6 text-lg leading-8 text-muted-foreground">XSSは「入力値が危険」なのではなく、値がHTMLやJavaScriptとして解釈される文脈に混入することで成立します。実装では保存前の一律除去より、出力時の文脈別エスケープを軸に考えます。</p><h2 className="mt-10 text-2xl font-bold">危険な描画例</h2><p className="mt-4 leading-8 text-muted-foreground">HTMLとして差し込むAPIは、信頼できるサニタイズ済みHTMLだけに限定します。</p><pre className="mt-6 overflow-x-auto rounded-2xl border border-border bg-[#0a0d12] p-5 font-['JetBrains_Mono'] text-sm leading-7 text-slate-200"><code>{`// Avoid: userInput contains HTML
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// Prefer: render as text
<p>{userInput}</p>`}</code></pre><h2 className="mt-10 text-2xl font-bold">設計チェック</h2><ul className="mt-4 space-y-3 text-muted-foreground"><li>・HTML本文、属性、URL、JS文字列でエスケープ方式を分ける</li><li>・CSPは防御層として追加し、主対策の代替にしない</li><li>・レビュー対象にHTML直挿入の逃げ道を明記する</li></ul></article><footer className="fixed inset-x-0 bottom-0 border-t border-border bg-background/90 backdrop-blur-xl"><div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6"><button onClick={() => navigate("/learn/security/xss")} className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeft size={18} /> 目次へ戻る</button><PrimaryButton onClick={() => navigate("/quiz/xss-basics")}>問題を解く <ArrowRight size={18} /></PrimaryButton></div></footer></main>;
}

function Exercise({ mode, navigate, setLastMode }: { mode: Mode; navigate: (r: Route) => void; setLastMode: (m: Mode) => void }) {
  const [index, setIndex] = useState(0); const [answers, setAnswers] = useState<(number | null)[]>(Array(questions.length).fill(null));
  const q = questions[index]; const selected = answers[index]; const done = answers.every((a) => a !== null);
  function select(i: number) { if (selected === null) setAnswers((a) => a.map((v, idx) => idx === index ? i : v)); }
  function next() { if (index < questions.length - 1) setIndex(index + 1); else { setLastMode(mode); navigate("/result"); } }
  return <main className="mx-auto max-w-3xl px-4 pb-28 pt-24 sm:px-6"><div className="mb-6"><div className="flex justify-between font-['JetBrains_Mono'] text-xs text-muted-foreground"><span>{mode === "review" ? "/review" : "/quiz/xss-basics"} · QUESTION {index + 1} / {questions.length}</span><span>{Math.round(((index + 1) / questions.length) * 100)}%</span></div><div className="mt-3 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div></div><section className="rounded-[1.75rem] border border-border bg-card p-6 sm:p-8"><p className="font-['JetBrains_Mono'] text-xs tracking-[0.18em] text-teal-300">{q.id}</p><h1 className="mt-4 text-2xl font-bold leading-relaxed">{q.text}</h1><div className="mt-7 space-y-3">{q.options.map((o, i) => { const locked = selected !== null; const good = locked && i === q.correct; const bad = locked && selected === i && i !== q.correct; return <button key={o} disabled={locked} onClick={() => select(i)} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${good ? "border-emerald-500/40 bg-emerald-500/15" : bad ? "border-red-500/40 bg-red-500/15" : "border-border bg-secondary hover:border-teal-300/40"}`}><span className="grid size-6 shrink-0 place-items-center rounded-full border border-current">{locked ? good ? <Check size={14} /> : bad ? <X size={14} /> : <Lock size={12} /> : i + 1}</span><span>{o}</span></button>; })}</div>{selected !== null && <div className={`mt-6 rounded-2xl p-4 ${selected === q.correct ? "bg-emerald-500/15 text-emerald-100" : "bg-red-500/15 text-red-100"}`}>{selected === q.correct ? "正解です。" : "不正解です。"} {q.note}</div>}</section><footer className="fixed inset-x-0 bottom-0 border-t border-border bg-background/90 backdrop-blur-xl"><div className="mx-auto flex max-w-3xl justify-end px-4 py-4 sm:px-6"><PrimaryButton onClick={next}>{done && index === questions.length - 1 ? "結果を見る" : "次の問題へ"} <ArrowRight size={18} /></PrimaryButton></div></footer></main>;
}

function Result({ mode, navigate }: { mode: Mode; navigate: (r: Route) => void }) {
  const rows = useMemo(() => questions.map((q, i) => [q.id, i !== 1] as const), []); const score = rows.filter(([, ok]) => ok).length;
  return <main className="mx-auto max-w-3xl px-4 pb-12 pt-24 sm:px-6"><section className="rounded-[2rem] border border-border bg-card p-6 text-center sm:p-10"><p className="font-['JetBrains_Mono'] text-xs tracking-[0.22em] text-teal-300">{mode === "review" ? "/review COMPLETE" : "/quiz/xss-basics COMPLETE"}</p><h1 className="mt-5 text-6xl font-extrabold sm:text-8xl">{score} / {questions.length}</h1><p className="mt-4 text-muted-foreground">詳細は問題IDごとの正誤で確認できます。解答記録はAPIへ送信する想定です。</p><div className="mt-8 divide-y divide-border rounded-2xl border border-border text-left">{rows.map(([id, ok]) => <div key={id} className="flex items-center justify-between p-4"><span className="font-['JetBrains_Mono'] text-sm">{id}</span><span className={ok ? "text-emerald-300" : "text-red-300"}>{ok ? "正解" : "不正解"}</span></div>)}</div><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">{mode === "review" ? <><PrimaryButton onClick={() => navigate("/")} subtle><Home size={18} />ホームへ戻る</PrimaryButton><PrimaryButton onClick={() => navigate("/review")}><RotateCcw size={18} />間違えた問題だけ再挑戦</PrimaryButton></> : <><PrimaryButton onClick={() => navigate("/learn/security/xss")}>次のレッスンへ <ArrowRight size={18} /></PrimaryButton><PrimaryButton onClick={() => navigate("/quiz/xss-basics")} subtle>再挑戦</PrimaryButton></>}</div></section></main>;
}

export default function App() {
  const [route, setRoute] = useState<Route>("/"); const [lastMode, setLastMode] = useState<Mode>("review");
  return <div className="min-h-screen bg-background font-['Inter'] text-foreground"><Header route={route} navigate={setRoute} />{route === "/" && <Dashboard navigate={setRoute} />}{route === "/learn/security/xss" && <LessonList navigate={setRoute} />}{route === "/learn/security/xss/xss-basics" && <LessonArticle navigate={setRoute} />}{route === "/quiz/xss-basics" && <Exercise mode="quiz" navigate={setRoute} setLastMode={setLastMode} />}{route === "/review" && <Exercise mode="review" navigate={setRoute} setLastMode={setLastMode} />}{route === "/result" && <Result mode={lastMode} navigate={setRoute} />}</div>;
}
