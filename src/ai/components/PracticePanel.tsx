import * as React from 'react';
import { Bug, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { compile } from '@/compiler';
import type { CompilationResult, Diagnostic, StageId } from '@/types/compiler';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code-block';
import { cn } from '@/lib/utils';
import { askAi, type AiStatus } from '../aiClient';
import { STAGE_LABEL } from '../context';
import { BusyButton, Notice, StepCard } from './shared';

type Phase = 'lexical' | 'syntax' | 'semantic';
const PHASES: { id: Phase; label: string; hint: string }[] = [
  { id: 'lexical', label: 'Lexical', hint: 'Bad characters, open strings or comments' },
  { id: 'syntax', label: 'Syntax', hint: 'The grammar is broken' },
  { id: 'semantic', label: 'Semantic', hint: 'Names or types do not match the schema' },
];

interface Challenge {
  sql: string;
  hint: string;
  /** The stage that REALLY fails, decided by the compiler and not by the AI. */
  stage: Phase;
  diagnostic?: Diagnostic;
}

const isPhase = (s: StageId | undefined): s is Phase => s === 'lexical' || s === 'syntax' || s === 'semantic';

/** Feature 8: the AI invents a broken query; the compiler decides what is really wrong and grades the student. */
export function PracticePanel({ ai }: { ai: AiStatus | null }) {
  const [phase, setPhase] = React.useState<Phase>('syntax');
  const [level, setLevel] = React.useState<'easy' | 'medium'>('easy');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [challenge, setChallenge] = React.useState<Challenge | null>(null);
  const [showHint, setShowHint] = React.useState(false);
  const [guess, setGuess] = React.useState<Phase | null>(null);
  const [attempt, setAttempt] = React.useState('');
  const [graded, setGraded] = React.useState<CompilationResult | null>(null);
  const [score, setScore] = React.useState({ right: 0, total: 0 });

  const newChallenge = async () => {
    setBusy(true);
    setError('');
    setChallenge(null);
    setShowHint(false);
    setGuess(null);
    setGraded(null);
    try {
      let avoid = '';
      for (let i = 0; i < 3; i++) {
        const out = await askAi<{ sql: string; hint: string }>('practice', { phase, level, avoid });
        const r = compile(out.sql);
        const failed = r.stages.find((s) => s.status === 'failed');
        // Accept only queries that really fail, in a phase we can grade. Prefer the requested phase.
        if (isPhase(failed?.id) && (failed.id === phase || i === 2)) {
          setChallenge({ sql: out.sql, hint: out.hint, stage: failed.id, diagnostic: r.diagnostics.find((d) => d.severity === 'error') });
          setAttempt(out.sql);
          return;
        }
        avoid = out.sql;
      }
      setError('The AI did not produce a usable broken query. Please try again.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const choose = (p: Phase) => {
    if (!challenge || guess) return;
    setGuess(p);
    setScore((s) => ({ right: s.right + (p === challenge.stage ? 1 : 0), total: s.total + 1 }));
  };

  const fixed = graded?.success === true;

  return (
    <div className="space-y-4">
      <StepCard step={1} title="Get a challenge" description="The AI writes a query with one bug. Pick which compiler phase should catch it.">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-muted-foreground">Phase to practise</legend>
              <div className="flex gap-1.5">
                {PHASES.map((p) => (
                  <button key={p.id} type="button" aria-pressed={phase === p.id} onClick={() => setPhase(p.id)} title={p.hint}
                    className={cn('rounded-full border px-3 py-1 text-sm', phase === p.id ? 'border-primary bg-secondary font-medium text-secondary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>
                    {p.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-muted-foreground">Level</legend>
              <div className="flex gap-1.5">
                {(['easy', 'medium'] as const).map((l) => (
                  <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)}
                    className={cn('rounded-full border px-3 py-1 text-sm capitalize', level === l ? 'border-primary bg-secondary font-medium text-secondary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>
                    {l}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <BusyButton busy={busy} icon={challenge ? <RefreshCw /> : <Bug />} disabled={!ai?.configured} onClick={newChallenge}>{challenge ? 'New challenge' : 'Start challenge'}</BusyButton>
            {score.total > 0 && <span className="text-sm text-muted-foreground">Phase guesses right: <b className="text-foreground">{score.right}</b> of {score.total}</span>}
          </div>
        </div>
      </StepCard>

      {error && <Notice kind="error">{error}</Notice>}

      {challenge && (
        <StepCard step={2} title="Which phase finds the bug?">
          <div className="space-y-3">
            <CodeBlock code={challenge.sql} label="broken SQL" wrap />
            <div className="flex flex-wrap items-center gap-2">
              {PHASES.map((p) => (
                <Button key={p.id} type="button" variant="outline" aria-label={`Guess ${p.label}`} disabled={guess !== null} onClick={() => choose(p.id)}
                  className={cn(guess === p.id && (p.id === challenge.stage ? 'border-success bg-success/10' : 'border-destructive bg-destructive/10'), guess && p.id === challenge.stage && 'border-success bg-success/10')}>
                  {p.label}
                </Button>
              ))}
              {!guess && challenge.hint && (
                <button type="button" onClick={() => setShowHint((v) => !v)} className="text-sm text-primary underline-offset-2 hover:underline">{showHint ? 'Hide hint' : 'Show hint'}</button>
              )}
            </div>
            {showHint && !guess && <Notice kind="info">{challenge.hint}</Notice>}
            {guess && (
              <Notice kind={guess === challenge.stage ? 'success' : 'error'}>
                <p className="font-medium">{guess === challenge.stage ? 'Correct!' : 'Not quite.'} The compiler stops at {STAGE_LABEL[challenge.stage]}.</p>
                {challenge.diagnostic && <p className="mt-0.5">{challenge.diagnostic.message}{challenge.diagnostic.location ? ` (line ${challenge.diagnostic.location.line}, column ${challenge.diagnostic.location.column})` : ''}</p>}
              </Notice>
            )}
          </div>
        </StepCard>
      )}

      {challenge && guess && (
        <StepCard step={3} title="Now fix it" description="Edit the query and check it. The compiler is the judge.">
          <div className="space-y-3">
            <textarea aria-label="Your fixed query" value={attempt} onChange={(e) => { setAttempt(e.target.value); setGraded(null); }} rows={4} maxLength={4000} spellCheck={false}
              className="block w-full resize-y rounded-lg border border-input px-3 py-2 font-mono text-[13px] leading-relaxed" />
            <Button type="button" onClick={() => setGraded(compile(attempt))} disabled={!attempt.trim()}>Check my fix</Button>
            {graded && (fixed ? (
              <Notice kind="success"><span className="inline-flex items-center gap-1 font-medium"><CheckCircle2 className="size-4" /> It compiles! Every stage passed.</span></Notice>
            ) : (
              <Notice kind="error">
                <span className="inline-flex items-center gap-1 font-medium"><XCircle className="size-4" /> Still failing at {STAGE_LABEL[graded.stages.find((s) => s.status === 'failed')?.id ?? 'source']}.</span>
                <p className="mt-0.5">{graded.diagnostics.find((d) => d.severity === 'error')?.message}</p>
              </Notice>
            ))}
          </div>
        </StepCard>
      )}
    </div>
  );
}
