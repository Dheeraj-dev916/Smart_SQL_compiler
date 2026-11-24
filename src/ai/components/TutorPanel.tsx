import * as React from 'react';
import { Bot, CheckCircle2, RotateCcw, Send, Sparkles, XCircle } from 'lucide-react';
import { compile } from '@/compiler';
import { Button } from '@/components/ui/button';
import { useApp } from '@/hooks/useApp';
import { readJson, writeJson } from '@/services/storage';
import { cn } from '@/lib/utils';
import { askAi, type AiStatus } from '../aiClient';
import { tutorContext } from '../context';
import { BusyButton, Notice, StepCard } from './shared';

interface Msg { role: 'user' | 'assistant'; content: string }
interface GenQuestion { question: string; options: string[]; answer: number; explanation: string }

const CHIPS = ['What is a token?', 'What does σ mean in my plan?', 'Why do we need semantic analysis?', 'What is predicate pushdown?'];
const TOPICS = ['Lexical analysis', 'Syntax analysis', 'Semantic analysis', 'Intermediate representation', 'Relational algebra', 'Query optimization', 'Code generation'];
const WEAK_KEY = 'ssc.ai.weak';

/** Feature: AI tutor chat and an AI quiz generator that remembers the topics you miss. */
export function TutorPanel({ ai }: { ai: AiStatus | null }) {
  const [view, setView] = React.useState<'chat' | 'quiz'>('chat');
  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Tutor mode"
        className="inline-flex rounded-lg border bg-muted p-0.5 text-sm"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            setView(view === 'chat' ? 'quiz' : 'chat');
          }
        }}
      >
        {([['chat', 'Ask the tutor'], ['quiz', 'Make me a quiz']] as const).map(([id, label]) => (
          <button
            key={id}
            id={`tutor-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={view === id}
            aria-controls={`tutor-panel-${id}`}
            onClick={() => setView(id)}
            className={cn('rounded-md px-3 py-1.5 font-medium transition-colors', view === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`tutor-panel-${view}`} aria-labelledby={`tutor-tab-${view}`}>
        {view === 'chat' ? <Chat ai={ai} /> : <QuizMaker ai={ai} />}
      </div>
    </div>
  );
}

// ───────────────────────── chat ─────────────────────────
function Chat({ ai }: { ai: AiStatus | null }) {
  const { sql } = useApp();
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState('');
  const [useContext, setUseContext] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const endRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [messages, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError('');
    try {
      const context = useContext && sql.trim() ? tutorContext(sql, compile(sql)) : '';
      const out = await askAi<{ reply: string }>('tutor', { messages: next.slice(-8), context });
      setMessages([...next, { role: 'assistant', content: out.reply }]);
    } catch (e) {
      setMessages(messages);
      setInput(q);
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepCard title="AI tutor" description="Ask anything about compilers or SQL. The tutor can see the query in your compiler editor and what the compiler really did with it.">
      <div className="space-y-3">
        <div className="scroll-thin flex max-h-[26rem] min-h-40 flex-col gap-2 overflow-y-auto rounded-lg border bg-muted/30 p-3" aria-live="polite">
          {messages.length === 0 && (
            <div className="m-auto max-w-sm text-center text-sm text-muted-foreground">
              <Bot className="mx-auto mb-2 size-6 text-primary" />
              Hi! Ask me about tokens, parsing, relational algebra or optimization. Try a question below.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed', m.role === 'user' ? 'ml-auto rounded-br-sm bg-primary text-primary-foreground' : 'mr-auto rounded-bl-sm border bg-card')}>
              {m.content}
            </div>
          ))}
          {busy && <div className="mr-auto rounded-2xl rounded-bl-sm border bg-card px-3.5 py-2 text-sm text-muted-foreground">Thinking…</div>}
          <div ref={endRef} />
        </div>

        {error && <Notice kind="error">{error}</Notice>}

        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button key={c} type="button" disabled={!ai?.configured || busy} onClick={() => send(c)} className="rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-50">{c}</button>
          ))}
        </div>

        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
          <input aria-label="Your question for the tutor" value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder="Type your question…"
            className="h-10 min-w-0 flex-1 rounded-lg border border-input px-3 text-sm placeholder:text-muted-foreground/70" />
          <Button type="submit" disabled={!ai?.configured || busy || !input.trim()}><Send /> Send</Button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={useContext} onChange={(e) => setUseContext(e.target.checked)} className="size-3.5 accent-[hsl(var(--primary))]" />
            Let the tutor see my compiler query and results
          </label>
          {messages.length > 0 && (
            <button type="button" disabled={busy} onClick={() => { setMessages([]); setError(''); }} className="hover:text-foreground disabled:opacity-50">
              Clear chat
            </button>
          )}
        </div>
      </div>
    </StepCard>
  );
}

// ───────────────────────── quiz generator ─────────────────────────
function QuizMaker({ ai }: { ai: AiStatus | null }) {
  const [topic, setTopic] = React.useState(TOPICS[0]);
  const [count, setCount] = React.useState(5);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [quiz, setQuiz] = React.useState<{ id: number; topic: string; questions: GenQuestion[] } | null>(null);
  const [weak, setWeak] = React.useState<Record<string, number>>(() => readJson<Record<string, number>>(WEAK_KEY, {}));
  const quizSeqRef = React.useRef(0);
  const weakMounted = React.useRef(false);
  React.useEffect(() => {
    if (weakMounted.current) writeJson(WEAK_KEY, weak);
    else weakMounted.current = true;
  }, [weak]);

  const weakList = Object.entries(weak).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const generate = async (t: string) => {
    setBusy(true);
    setError('');
    setQuiz(null);
    try {
      const out = await askAi<{ questions: GenQuestion[] }>('quiz', { topic: t, count });
      setQuiz({ id: ++quizSeqRef.current, topic: t, questions: out.questions });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };
  const finish = (t: string, missed: number, total: number) => {
    setWeak((w) => ({
      ...w,
      [t]: Math.max(0, (w[t] ?? 0) + missed - (missed === 0 && total > 0 ? 1 : 0)),
    }));
  };

  return (
    <div className="space-y-4">
      <StepCard title="Quiz maker" description="The AI writes new multiple-choice questions on the topic you pick. Topics you miss are remembered on this device.">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="quiz-topic" className="mb-1 block text-xs font-medium text-muted-foreground">Topic</label>
              <select id="quiz-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="h-9 rounded-lg border border-input px-2.5 text-sm">
                {TOPICS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="quiz-count" className="mb-1 block text-xs font-medium text-muted-foreground">Questions</label>
              <select id="quiz-count" value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-9 rounded-lg border border-input px-2.5 text-sm">
                {[3, 5, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <BusyButton busy={busy} icon={<Sparkles />} disabled={!ai?.configured} onClick={() => generate(topic)}>Generate quiz</BusyButton>
          </div>
          {weakList.length > 0 && (
            <div className="rounded-lg border bg-secondary/60 px-3 py-2 text-sm">
              <p className="text-xs font-medium text-secondary-foreground">Topics to review</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {weakList.map(([t, n]) => (
                  <button key={t} type="button" disabled={!ai?.configured || busy} onClick={() => { setTopic(t); void generate(t); }} className="rounded-full border border-primary/30 bg-card px-2.5 py-0.5 text-xs hover:bg-muted disabled:opacity-50">
                    {t} · {n} missed
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </StepCard>

      {error && <Notice kind="error">{error}</Notice>}
      {quiz && <QuizRunner key={quiz.id} topic={quiz.topic} questions={quiz.questions} onFinish={finish} onAgain={() => generate(quiz.topic)} />}
    </div>
  );
}

function QuizRunner({ topic, questions, onFinish, onAgain }: { topic: string; questions: GenQuestion[]; onFinish: (topic: string, missed: number, total: number) => void; onAgain: () => void }) {
  const [i, setI] = React.useState(0);
  const [picked, setPicked] = React.useState<number | null>(null);
  const [score, setScore] = React.useState(0);
  const [done, setDone] = React.useState(false);
  const q = questions[i];

  const choose = (n: number) => {
    if (picked !== null) return;
    setPicked(n);
    if (n === q.answer) setScore((s) => s + 1);
  };
  const next = () => {
    if (i + 1 >= questions.length) {
      setDone(true);
      onFinish(topic, questions.length - score, questions.length);
    } else {
      setI(i + 1);
      setPicked(null);
    }
  };

  if (done) {
    return (
      <StepCard title="Quiz complete">
        <div className="space-y-3 text-center" role="status">
          <p className="font-mono text-4xl font-semibold">{score} / {questions.length}</p>
          <p className="text-sm text-muted-foreground">{score === questions.length ? 'Perfect. This topic looks solid.' : `Topic saved for review: ${topic}.`}</p>
          <Button type="button" variant="outline" onClick={onAgain}><RotateCcw /> New questions on this topic</Button>
        </div>
      </StepCard>
    );
  }
  return (
    <StepCard title={`Question ${i + 1} of ${questions.length}`} description={topic}>
      <div className="space-y-3">
        <p className="text-sm font-medium leading-relaxed">{q.question}</p>
        <div className="space-y-2" role="group" aria-label="Answer options">
          {q.options.map((o, n) => {
            const right = picked !== null && n === q.answer;
            const wrong = picked === n && n !== q.answer;
            return (
              <button key={n} type="button" disabled={picked !== null} onClick={() => choose(n)}
                className={cn('flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors', picked === null && 'hover:border-primary/50 hover:bg-secondary/50', right && 'border-success bg-success/10', wrong && 'border-destructive bg-destructive/10')}>
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold">{'ABCDEF'[n]}</span>
                <span className="flex-1">{o}</span>
                {right && <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Correct answer" />}
                {wrong && <XCircle className="size-4 shrink-0 text-destructive" aria-label="Your answer" />}
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <>
            <Notice kind={picked === q.answer ? 'success' : 'error'}><p className="font-medium">{picked === q.answer ? 'Correct!' : 'Not quite.'}</p><p>{q.explanation}</p></Notice>
            <Button type="button" onClick={next}>{i + 1 >= questions.length ? 'See score' : 'Next question'}</Button>
          </>
        )}
      </div>
    </StepCard>
  );
}
