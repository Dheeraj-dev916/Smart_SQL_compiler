import * as React from 'react';
import { Repeat } from 'lucide-react';
import { compile, formatDiagnostic } from '@/compiler';
import { Badge } from '@/components/ui/badge';
import { CodeBlock } from '@/components/ui/code-block';
import type { AiStatus } from '../aiClient';
import { compareInSandbox, type Comparison } from '../equivalence';
import { generateVerified, type VerifiedAnswer } from '../verify';
import { BusyButton, Notice, SqlInput, SqlResult, StepCard, VerifyBadge } from './shared';

const EXAMPLES = [
  { label: 'IN subquery', sql: 'SELECT name FROM students WHERE id IN (SELECT student_id FROM enrollments);' },
  { label: 'WITH (CTE)', sql: 'WITH top AS (SELECT * FROM students WHERE gpa > 3.5) SELECT name FROM top;' },
];

/** Feature 7: rewrite SQL the compiler rejects (subqueries, CTEs) into the supported subset, then compare the rows. */
export function RewritePanel({ ai }: { ai: AiStatus | null }) {
  const [sql, setSql] = React.useState(EXAMPLES[0].sql);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [original, setOriginal] = React.useState<{ sql: string; problem: string } | null>(null);
  const [answer, setAnswer] = React.useState<VerifiedAnswer<{ sql: string; explanation: string }> | null>(null);
  const [cmp, setCmp] = React.useState<Comparison | null>(null);

  const go = async () => {
    setBusy(true);
    setError('');
    setAnswer(null);
    setCmp(null);
    const before = compile(sql);
    const firstError = before.diagnostics.find((d) => d.severity === 'error');
    setOriginal({ sql, problem: before.success ? '' : firstError ? formatDiagnostic(firstError) : 'The compiler rejected this query.' });
    try {
      const out = await generateVerified<{ sql: string; explanation: string }>('rewrite', { sql });
      setAnswer(out);
      if (out.verification?.ok) setCmp(await compareInSandbox(sql, out.data.sql));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <StepCard step={1} title="Paste SQL the compiler does not support" description="Subqueries, WITH clauses and similar are rejected as “Unsupported syntax”. The AI rewrites them using only supported parts.">
        <div className="space-y-3">
          <SqlInput value={sql} onChange={setSql} examples={EXAMPLES} />
          <BusyButton busy={busy} icon={<Repeat />} disabled={!ai?.configured || !sql.trim()} onClick={go}>Rewrite for the compiler</BusyButton>
        </div>
      </StepCard>

      {error && <Notice kind="error">{error}</Notice>}

      {original && answer && (
        <StepCard step={2} title="Original and rewritten query">
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Original</p>
                <CodeBlock code={original.sql} label="original SQL" wrap />
                {original.problem ? <Badge variant="destructive" className="whitespace-normal">{original.problem}</Badge> : <Badge variant="success">Already supported by the compiler</Badge>}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Rewritten</p>
                {answer.data.sql ? <SqlResult sql={answer.data.sql} label="rewritten SQL" canRun={answer.verification?.ok} /> : <Notice kind="warning">The AI could not express this in the supported subset.</Notice>}
              </div>
            </div>
            <VerifyBadge v={answer.verification} attempts={answer.attempts} />
            {cmp?.status === 'match' && <Notice kind="success">Same result as the original on the demo data ({cmp.rows} row{cmp.rows === 1 ? '' : 's'}, order ignored).</Notice>}
            {cmp?.status === 'different' && <Notice kind="error">The two queries give different results on the demo data. {cmp.reason} Do not use this rewrite.</Notice>}
            {cmp?.status === 'unavailable' && <Notice kind="info">Could not compare the results: {cmp.reason}</Notice>}
            {answer.data.explanation && <p className="text-sm leading-relaxed text-muted-foreground">{answer.data.explanation}</p>}
          </div>
        </StepCard>
      )}
    </div>
  );
}
