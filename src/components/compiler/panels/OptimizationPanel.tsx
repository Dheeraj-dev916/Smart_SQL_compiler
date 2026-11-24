import * as React from 'react';
import { ArrowRightLeft, CheckCircle2, CircleSlash } from 'lucide-react';
import type { CompilationResult } from '@/types/compiler';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code-block';
import { useToast } from '@/components/ui/toast';
import { useApp } from '@/hooks/useApp';
import { planToTree, toAlgebraPretty } from '@/compiler/intermediate';
import { TreeView } from '../TreeView';
import { Section, StatusNote, Unavailable } from './shared';
import { ApplyOptimized, TryOptimizerDemo } from './ApplyOptimized';

export function OptimizationPanel({ result }: { result: CompilationResult }) {
  const { setSql } = useApp();
  const { toast } = useToast();
  const opt = result.optimizer;
  const trees = React.useMemo(() => (opt ? { before: planToTree(opt.originalPlan), after: planToTree(opt.optimizedPlan), beforeText: toAlgebraPretty(opt.originalPlan), afterText: toAlgebraPretty(opt.optimizedPlan) } : null), [opt]);
  if (!opt || !trees || !result.codegen) return <Unavailable result={result} stage="optimization" what="optimization results" />;
  const applied = opt.results.filter((r) => r.applied);
  const skipped = opt.results.filter((r) => !r.applied);
  return (
    <div className="space-y-5 p-3">
      <ApplyOptimized result={result} />
      {opt.appliedCount > 0 ? (
        <StatusNote tone="success">
          <p className="font-medium">{opt.appliedCount} of {opt.results.length} rules applied.</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {opt.statementChanged ? 'The SQL text was rewritten.' : 'The SQL text did not change.'} {opt.planChanged ? 'The logical plan changed.' : 'The logical plan did not change.'} These are logical rewrites; this tool does not measure execution time, so it makes no speed claims.
          </p>
        </StatusNote>
      ) : (
        <StatusNote tone="info">
          <p className="font-medium">No optimization was applied.</p>
          <p className="mt-0.5 text-xs text-muted-foreground">None of the {opt.results.length} rules found a transformation that is provably safe for this query. The generated SQL is the formatted original.</p>
          <TryOptimizerDemo />
        </StatusNote>
      )}

      <Section title="Original vs optimized" hint="Both sides are rebuilt from the real statement and plan, so equal sides mean nothing changed.">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 [&>*]:min-w-0">
          {([['Original', trees.beforeText, trees.before], ['Optimized', trees.afterText, trees.after]] as const).map(([label, algebra, tree]) => (
            <div key={label} className="min-w-0 space-y-2 rounded-md border p-2.5">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label === 'Optimized' && <ArrowRightLeft className="size-3.5" aria-hidden="true" />} {label} plan
              </h4>
              <CodeBlock code={algebra} label={`${label.toLowerCase()} algebra`} />
              <div className="scroll-thin overflow-x-auto rounded-md border bg-muted/20"><TreeView root={tree} defaultDepth={12} /></div>
            </div>
          ))}
        </div>
        {!opt.planChanged && <p className="text-xs text-muted-foreground">The optimized plan is identical to the original plan.</p>}
      </Section>

      <Section
        title={`Rules (${applied.length} applied, ${skipped.length} skipped)`}
        hint="Every rule is evaluated and reported. A rule is skipped when equivalence cannot be established."
        actions={
          opt.statementChanged ? (
            <Button
              size="sm"
              variant="violet"
              onClick={() => {
                setSql(result.codegen!.optimizedSql);
                toast({ kind: 'success', title: 'Optimized SQL loaded into the editor' });
              }}
            >
              Use optimized SQL in editor
            </Button>
          ) : undefined
        }
      >
        <ul className="space-y-2">
          {opt.results.map((r) => (
            <li key={r.ruleId} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                {r.applied ? <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> : <CircleSlash className="size-4 text-muted-foreground" aria-hidden="true" />}
                <span className="text-sm font-medium">{r.rule}</span>
                <Badge variant={r.applied ? 'success' : 'outline'}>{r.applied ? 'Applied' : 'Skipped'}</Badge>
                <Badge variant={r.scope === 'SQL rewrite' ? 'violet' : 'indigo'}>{r.scope}</Badge>
              </div>
              {r.applied ? (
                <div className="mt-2 space-y-2">
                  <p className="text-sm text-muted-foreground">{r.explanation}</p>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 [&>*]:min-w-0">
                    <div><p className="mb-1 text-xs font-medium text-muted-foreground">Before</p><CodeBlock code={r.original} label="before" wrap /></div>
                    <div><p className="mb-1 text-xs font-medium text-muted-foreground">After</p><CodeBlock code={r.optimized} label="after" wrap /></div>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground"><span className="font-medium text-foreground">Why skipped: </span>{r.skipReason}</p>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
