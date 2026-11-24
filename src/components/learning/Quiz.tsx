import * as React from 'react';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { QUIZ } from '@/data/quiz';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Multiple-choice quiz: the correct answer and an explanation appear immediately after a selection. */
export function Quiz() {
  const [index, setIndex] = React.useState(0);
  const [picked, setPicked] = React.useState<number | null>(null);
  const [score, setScore] = React.useState(0);
  const [done, setDone] = React.useState(false);
  const q = QUIZ[index];
  const answered = picked !== null;

  const choose = (i: number) => {
    if (answered) return;
    setPicked(i);
    if (i === q.answer) setScore((s) => s + 1);
  };
  const next = () => {
    if (index + 1 >= QUIZ.length) setDone(true);
    else {
      setIndex((n) => n + 1);
      setPicked(null);
    }
  };
  const restart = () => {
    setIndex(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  };

  if (done) {
    const pct = Math.round((score / QUIZ.length) * 100);
    return (
      <div className="rounded-lg border bg-card p-5 text-center" role="status">
        <p className="text-sm text-muted-foreground">Quiz complete</p>
        <p className="mt-1 font-mono text-4xl font-semibold">{score} / {QUIZ.length}</p>
        <p className="mt-1 text-sm text-muted-foreground">{pct}% correct. {pct === 100 ? 'Perfect. You could explain the pipeline in a viva.' : pct >= 70 ? 'Solid. Re-read the lessons for the ones you missed.' : 'Review the lessons above and try again.'}</p>
        <Button className="mt-4" onClick={restart}><RotateCcw /> Try again</Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Question {index + 1} of {QUIZ.length}</span>
        <span>Score: {score}</span>
      </div>
      <div className="mb-3 h-1 overflow-hidden rounded bg-muted" aria-hidden="true">
        <div className="h-full bg-primary transition-all" style={{ width: `${((index + (answered ? 1 : 0)) / QUIZ.length) * 100}%` }} />
      </div>
      <fieldset>
        <legend className="text-sm font-medium leading-relaxed sm:text-base">{q.question}</legend>
        <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Answer options">
          {q.options.map((opt, i) => {
            const isAnswer = i === q.answer;
            const isPicked = picked === i;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={isPicked}
                disabled={answered}
                onClick={() => choose(i)}
                className={cn(
                  'flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-left text-sm transition-colors',
                  !answered && 'hover:border-foreground/40 hover:bg-muted/50',
                  answered && isAnswer && 'border-success bg-success/10',
                  answered && isPicked && !isAnswer && 'border-destructive bg-destructive/10',
                  answered && !isPicked && !isAnswer && 'opacity-60',
                )}
              >
                <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]">{String.fromCharCode(65 + i)}</span>
                <span className="flex-1">{opt}</span>
                {answered && isAnswer && <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Correct answer" />}
                {answered && isPicked && !isAnswer && <XCircle className="size-4 shrink-0 text-destructive" aria-label="Your answer, incorrect" />}
              </button>
            );
          })}
        </div>
      </fieldset>
      {answered && (
        <div className="mt-3 rounded-md border bg-muted/40 p-3 text-sm" role="status" aria-live="polite">
          <p className="font-semibold">{picked === q.answer ? 'Correct.' : `Not quite. The correct answer is ${String.fromCharCode(65 + q.answer)}: ${q.options[q.answer]}.`}</p>
          <p className="mt-1 text-muted-foreground">{q.explanation}</p>
          <Button className="mt-3" size="sm" onClick={next}>{index + 1 >= QUIZ.length ? 'See score' : 'Next question'}</Button>
        </div>
      )}
    </div>
  );
}
