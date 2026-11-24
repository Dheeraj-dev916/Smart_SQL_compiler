import * as React from 'react';
import { Lightbulb, SearchCheck, Wrench } from 'lucide-react';
import { compile } from '@/compiler';
import type { CompilationResult } from '@/types/compiler';
import { Badge } from '@/components/ui/badge';
import { CodeBlock } from '@/components/ui/code-block';
import { askAi, type AiStatus } from '../aiClient';
import { diagnosticLines, STAGE_LABEL } from '../context';
import { generateVerified, type VerifiedAnswer } from '../verify';
import { BusyButton, Notice, SqlInput, SqlResult, StepCard, VerifyBadge } from './shared';

interface ErrorExplanation {
  summary: string;
  items: { problem: string; phase: string; why: string; fix: string }[];
}

const EXAMPLES = [
  { label: 'Misspelled names', sql: 'SELECT nme FROM studnts;' },
  { label: 'Broken GROUP BY', sql: 'SELECT name FROM students WHERE gpa > 3.5 GROUP BY;' },
  { label: 'Open string', sql: "SELECT name FROM students WHERE department = 'CS;" },
];

/** Features 2 and 3: see the compiler's real errors, get them explained, and get a fix that is re-checked. */
export function FixErrorsPanel({ ai }: { ai: AiStatus | null }) {
  const [sql, setSql] = React.useState('SELECT nme FROM studnts;');
  const [checked, setChecked] = React.useState<CompilationResult | null>(null);
  const [explaining, setExplaining] = React.useState(false);
  const [fixing, setFixing] = React.useState(false);
  const [error, setError] = React.useState('');
  const [explanation, setExplanation] = React.useState<ErrorExplanation | null>(null);
  const [fix, setFix] = React.useState<VerifiedAnswer<{ sql: string; explanation: string }> | null>(null);
  const reqIdRef = React.useRef(0);

  const reset = () => { setError(''); setExplanation(null); setFix(null); };
  const check = () => {
    reqIdRef.current++;
    setExplaining(false);
    setFixing(false);
    reset();
    setChecked(compile(sql));
  };
  const errors = checked?.diagnostics.filter((d) => d.severity === 'error') ?? [];
  const failedStage = checked?.stages.find((s) => s.status === 'failed');

  const explain = async () => {
    if (!checked) return;
    const id = ++reqIdRef.current;
    setExplaining(true);
    setError('');
    try {
      const out = await askAi<ErrorExplanation>('explain-error', { sql: checked.source, diagnostics: diagnosticLines(checked) });
      if (reqIdRef.current === id) setExplanation(out);
    } catch (e) {
      if (reqIdRef.current === id) setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      if (reqIdRef.current === id) setExplaining(false);
    }
  };
  const doFix = async () => {
    if (!checked) return;
    const id = ++reqIdRef.current;
    setFixing(true);
    setError('');
    try {
      const out = await generateVerified<{ sql: string; explanation: string }>(
        'fix',
        { sql: checked.source, diagnostics: diagnosticLines(checked) },
        { selectOnly: false },
      );
      if (reqIdRef.current === id) setFix(out);
    } catch (e) {
      if (reqIdRef.current === id) setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      if (reqIdRef.current === id) setFixing(false);
    }
  };

  return (
    <div className="space-y-4">
      <StepCard step={1} title="Paste a query and check it" description="The compiler runs first and reports the real errors. No AI is needed for this step.">
        <div className="space-y-3">
          <SqlInput value={sql} onChange={(v) => { setSql(v); }} examples={EXAMPLES} />
          <BusyButton icon={<SearchCheck />} disabled={!sql.trim()} onClick={check}>Check with compiler</BusyButton>
        </div>
      </StepCard>

      {checked && errors.length === 0 && (
        <Notice kind="success">No errors found. This query passes every compiler stage.</Notice>
      )}

      {checked && errors.length > 0 && (
        <StepCard step={2} title={`The compiler found ${errors.length} error${errors.length === 1 ? '' : 's'}`} description={failedStage ? `The pipeline stopped at: ${STAGE_LABEL[failedStage.id]}.` : undefined}>
          <ul className="space-y-2">
            {errors.map((d) => (
              <li key={d.id} className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive">{d.category}</Badge>
                  {d.location && <span className="text-xs text-muted-foreground">line {d.location.line}, column {d.location.column}</span>}
                </div>
                <p className="mt-1">{d.message}</p>
                {d.suggestion && <p className="mt-0.5 text-[13px] text-muted-foreground">Suggestion: {d.suggestion}</p>}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <BusyButton variant="secondary" busy={explaining} icon={<Lightbulb />} disabled={!ai?.configured || fixing} onClick={explain}>Explain the errors</BusyButton>
            <BusyButton busy={fixing} icon={<Wrench />} disabled={!ai?.configured || explaining} onClick={doFix}>Fix with AI</BusyButton>
          </div>
        </StepCard>
      )}

      {error && <Notice kind="error">{error}</Notice>}

      {explanation && (
        <StepCard title="What went wrong, in simple words">
          {explanation.summary && <p className="mb-3 text-sm leading-relaxed">{explanation.summary}</p>}
          <ul className="space-y-2">
            {explanation.items.map((i, k) => (
              <li key={k} className="rounded-lg border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{i.problem}</span>
                  {i.phase && <Badge variant="indigo">{i.phase}</Badge>}
                </div>
                <p className="mt-1 text-muted-foreground">{i.why}</p>
                {i.fix && <p className="mt-1"><span className="font-medium">Fix:</span> {i.fix}</p>}
              </li>
            ))}
          </ul>
        </StepCard>
      )}

      {fix && (
        <StepCard title="Suggested fix" description="Before and after. The fixed query was compiled again to make sure it works.">
          <div className="space-y-3">
            <VerifyBadge v={fix.verification} attempts={fix.attempts} />
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Before</p>
                <CodeBlock code={checked?.source ?? ''} label="original SQL" wrap />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">After</p>
                {fix.data.sql ? <SqlResult sql={fix.data.sql} label="fixed SQL" canRun={fix.verification?.ok} /> : <Notice kind="warning">The AI could not fix this query.</Notice>}
              </div>
            </div>
            {fix.data.explanation && <p className="text-sm leading-relaxed text-muted-foreground">{fix.data.explanation}</p>}
          </div>
        </StepCard>
      )}
    </div>
  );
}
