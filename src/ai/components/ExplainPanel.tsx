import * as React from 'react';
import { BookOpenText, Lightbulb } from 'lucide-react';
import { compile } from '@/compiler';
import type { CompilationResult } from '@/types/compiler';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { askAi, type AiStatus } from '../aiClient';
import { diagnosticLines, planText, ruleReport } from '../context';
import { BusyButton, Notice, SqlInput, StepCard } from './shared';

interface QueryExplanation { summary: string; steps: string[]; algebraNote: string }
interface WhyNot { summary: string; items: { rule: string; applied: boolean; text: string }[] }

const EXAMPLES = [
  { label: 'GROUP BY', sql: 'SELECT department, AVG(gpa) FROM students GROUP BY department;' },
  { label: 'LEFT JOIN + WHERE', sql: "SELECT s.name FROM students s LEFT JOIN enrollments e ON s.id = e.student_id WHERE e.grade = 'A';" },
  { label: 'Easy to simplify', sql: 'SELECT name FROM students WHERE 1 = 1 AND age > 18 + 2;' },
];

/** Feature 4 (explain my query) and feature 6 (why wasn't it optimized?). Both use the compiler's real output as facts. */
export function ExplainPanel({ ai }: { ai: AiStatus | null }) {
  const [mode, setMode] = React.useState<'query' | 'optimizer'>('query');
  const [sql, setSql] = React.useState(EXAMPLES[1].sql);
  const [result, setResult] = React.useState<CompilationResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [explanation, setExplanation] = React.useState<QueryExplanation | null>(null);
  const [whyNot, setWhyNot] = React.useState<WhyNot | null>(null);
  const reqIdRef = React.useRef(0);

  const compiled = result && result.success && result.ir?.plan ? result : null;
  const switchMode = (m: typeof mode) => {
    reqIdRef.current++;
    setBusy(false);
    setMode(m);
    setError('');
  };

  const analyse = () => {
    reqIdRef.current++;
    setBusy(false);
    setError('');
    setExplanation(null);
    setWhyNot(null);
    setResult(compile(sql));
  };

  const explainQuery = async () => {
    if (!compiled) return;
    const id = ++reqIdRef.current;
    setBusy(true);
    setError('');
    try {
      const out = await askAi<QueryExplanation>('explain-query', { sql: compiled.source, algebra: compiled.ir?.algebra?.text ?? '', plan: planText(compiled) });
      if (reqIdRef.current === id) setExplanation(out);
    } catch (e) {
      if (reqIdRef.current === id) setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      if (reqIdRef.current === id) setBusy(false);
    }
  };
  const explainRules = async () => {
    if (!compiled) return;
    const id = ++reqIdRef.current;
    setBusy(true);
    setError('');
    try {
      const out = await askAi<WhyNot>('why-not', { sql: compiled.source, rules: ruleReport(compiled) });
      if (reqIdRef.current === id) setWhyNot(out);
    } catch (e) {
      if (reqIdRef.current === id) setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      if (reqIdRef.current === id) setBusy(false);
    }
  };

  const aiText = (rule: string) => whyNot?.items.find((i) => i.rule.toLowerCase() === rule.toLowerCase())?.text;

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Explain mode"
        className="inline-flex rounded-lg border bg-muted p-0.5 text-sm"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            switchMode(mode === 'query' ? 'optimizer' : 'query');
          }
        }}
      >
        {([['query', 'Explain my query'], ['optimizer', "Why wasn't it optimized?"]] as const).map(([id, label]) => (
          <button
            key={id}
            id={`explain-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={mode === id}
            aria-controls={`explain-panel-${id}`}
            onClick={() => switchMode(id)}
            className={cn('rounded-md px-3 py-1.5 font-medium transition-colors', mode === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {label}
          </button>
        ))}
      </div>

      <StepCard step={1} title="Choose a query" description={mode === 'query' ? 'It must compile successfully so the AI can use the real plan.' : 'The optimizer report below comes from the compiler, not from the AI.'}>
        <div className="space-y-3">
          <SqlInput value={sql} onChange={setSql} examples={EXAMPLES} />
          <BusyButton icon={<BookOpenText />} disabled={!sql.trim()} onClick={analyse}>Analyse with compiler</BusyButton>
        </div>
      </StepCard>

      {result && !compiled && (
        <Notice kind="error">
          <p className="font-medium">This query does not compile, so there is no plan to explain yet.</p>
          <ul className="mt-1 list-disc pl-4">{diagnosticLines(result).slice(0, 3).map((l, idx) => <li key={`${l}-${idx}`}>{l}</li>)}</ul>
          <p className="mt-1">Use the “Fix errors” tab first.</p>
        </Notice>
      )}

      {error && <Notice kind="error">{error}</Notice>}

      {compiled && mode === 'query' && (
        <div role="tabpanel" id="explain-panel-query" aria-labelledby="explain-tab-query">
        <StepCard step={2} title="What this query does" description="The compiler's relational algebra is shown first. The AI turns it into plain steps.">
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">Relational algebra (from the compiler)</p>
              <p className="mt-1 break-words font-mono text-[13px]">{compiled.ir?.algebra?.text}</p>
            </div>
            <BusyButton busy={busy} icon={<Lightbulb />} disabled={!ai?.configured} onClick={explainQuery}>Explain in plain English</BusyButton>
            {explanation && (
              <div className="space-y-2">
                {explanation.summary && <p className="text-sm font-medium">{explanation.summary}</p>}
                <ol className="space-y-1.5">
                  {explanation.steps.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
                {explanation.algebraNote && <p className="text-[13px] text-muted-foreground">{explanation.algebraNote}</p>}
              </div>
            )}
          </div>
        </StepCard>
        </div>
      )}

      {compiled && mode === 'optimizer' && (
        <div role="tabpanel" id="explain-panel-optimizer" aria-labelledby="explain-tab-optimizer">
        <StepCard step={2} title="Optimizer report" description={`${compiled.optimizer?.appliedCount ?? 0} of ${compiled.optimizer?.results.length ?? 0} rules were applied.`}>
          <div className="space-y-3">
            <ul className="space-y-2">
              {(compiled.optimizer?.results ?? []).map((r) => (
                <li key={r.ruleId} className="rounded-lg border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.rule}</span>
                    <Badge variant={r.applied ? 'success' : 'outline'}>{r.applied ? 'Applied' : 'Skipped'}</Badge>
                  </div>
                  <p className="mt-1 text-[13px] text-muted-foreground">{r.applied ? r.explanation : r.skipReason ?? r.explanation}</p>
                  {aiText(r.rule) && <p className="mt-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-[13px] leading-relaxed text-secondary-foreground">{aiText(r.rule)}</p>}
                </li>
              ))}
            </ul>
            <BusyButton busy={busy} icon={<Lightbulb />} disabled={!ai?.configured} onClick={explainRules}>Explain each rule in simple words</BusyButton>
            {whyNot?.summary && <p className="text-sm font-medium">{whyNot.summary}</p>}
          </div>
        </StepCard>
        </div>
      )}
    </div>
  );
}
