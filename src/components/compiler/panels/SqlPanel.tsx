import type { CompilationResult } from '@/types/compiler';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code-block';
import { useToast } from '@/components/ui/toast';
import { useApp } from '@/hooks/useApp';
import { Section, StatusNote, Unavailable } from './shared';

export function SqlPanel({ result }: { result: CompilationResult }) {
  const { setSql } = useApp();
  const { toast } = useToast();
  const cg = result.codegen;
  if (!cg) return <Unavailable result={result} stage="codegen" what="generated SQL" />;
  const optimizerRan = Boolean(result.optimizer);
  const appliedRules = result.optimizer?.results.filter((r) => r.applied) ?? [];
  const load = (text: string, what: string) => {
    setSql(text);
    toast({ kind: 'success', title: `${what} loaded into the editor` });
  };
  return (
    <div className="space-y-5 p-3">
      <Section title="Original SQL" hint="Exactly what you typed.">
        <CodeBlock code={cg.originalSql} label="original SQL" />
      </Section>

      <Section
        title="Formatted SQL"
        hint="Formatting only: printed from the parsed statement. Same meaning, canonical layout."
        actions={<Button size="sm" variant="outline" onClick={() => load(cg.formattedSql, 'Formatted SQL')}>Load into editor</Button>}
      >
        <CodeBlock code={cg.formattedSql} label="formatted SQL" />
      </Section>

      <Section
        title="Optimized SQL"
        hint="SQL rewriting: printed from the optimizer's statement."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={cg.sqlChanged ? 'success' : 'outline'}>{cg.sqlChanged ? 'Rewritten' : optimizerRan ? 'No rewrite applied' : 'Optimizer not run'}</Badge>
            {cg.sqlChanged && <Button size="sm" variant="violet" onClick={() => load(cg.optimizedSql, 'Optimized SQL')}>Load into editor</Button>}
          </div>
        }
      >
        {cg.sqlChanged ? (
          <CodeBlock code={cg.optimizedSql} label="optimized SQL" />
        ) : (
          <StatusNote tone="info">
            {optimizerRan ? 'No optimization rule rewrote the SQL, so the optimized SQL is identical to the formatted SQL.' : 'The optimizer was not run for this statement.'}
          </StatusNote>
        )}
      </Section>

      {result.ir?.algebra && (
        <Section title="Relational algebra">
          <CodeBlock code={result.optimizer ? result.optimizer.optimizedAlgebra : result.ir.algebra.text} label="relational algebra" wrap />
        </Section>
      )}

      <Section title="Applied optimization rules">
        {appliedRules.length ? (
          <ul className="flex flex-wrap gap-2">{appliedRules.map((r) => <li key={r.ruleId}><Badge variant={r.scope === 'SQL rewrite' ? 'violet' : 'indigo'}>{r.rule} · {r.scope}</Badge></li>)}</ul>
        ) : (
          <p className="text-sm text-muted-foreground">None.</p>
        )}
      </Section>

      <Section title="What these terms mean here">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            ['Formatting', 'Changes layout only (case, line breaks). The statement is identical.'],
            ['Logical-plan optimization', 'Rewrites the plan (for example, pushing a filter below a join). The SQL text may stay the same.'],
            ['SQL rewriting', 'Changes the SQL text itself, only when the optimizer can prove the meaning is unchanged.'],
            ['Execution performance', 'Not measured by this tool. Speed depends on the database engine, indexes and data.'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-md border p-2.5"><dt className="font-medium">{t}</dt><dd className="text-muted-foreground">{d}</dd></div>
          ))}
        </dl>
      </Section>

      {cg.notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{cg.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    </div>
  );
}
