import { ArrowRight, Check, Undo2, Wand2 } from 'lucide-react';
import { EXAMPLES } from '@/data/examples';
import type { CompilationResult } from '@/types/compiler';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code-block';
import { useToast } from '@/components/ui/toast';
import { useApp } from '@/hooks/useApp';

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * One-click update for the Optimization tab: shows the optimized query and puts it into the editor
 * (or puts the original back). It only uses what the optimizer already produced.
 */
export function ApplyOptimized({ result }: { result: CompilationResult }) {
  const { sql, setSql } = useApp();
  const { toast } = useToast();
  const code = result.codegen;
  const opt = result.optimizer;
  if (!code || !opt) return null;

  // The SQL text is already as simple as it gets, but rules such as pushdown still improved the logical plan.
  if (!opt.statementChanged) {
    const done = opt.results.filter((r) => r.applied);
    if (done.length === 0) return null;
    return (
      <div className="space-y-2 rounded-md border border-violet-brand/30 bg-violet-brand/5 p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Wand2 className="size-4" aria-hidden="true" /> Optimized: the query plan improved</h3>
        <p className="text-xs text-muted-foreground">Your SQL text is already in its simplest form, so the editor text stays the same. The optimizer improved how the query would run (see the plans below):</p>
        <ul className="space-y-1 text-sm">
          {done.map((r) => (
            <li key={r.ruleId}><span className="font-medium">{r.rule}</span> <span className="text-muted-foreground">– {r.explanation}</span></li>
          ))}
        </ul>
        <TryOptimizerDemo label="Want to see the SQL text itself get shorter? Load a demo:" />
      </div>
    );
  }

  const before = oneLine(code.formattedSql);
  const after = oneLine(code.optimizedSql);
  const applied = oneLine(sql) === after;
  const saved = before.length - after.length;
  const done = opt.results.filter((r) => r.applied);
  const countConds = (expr?: { kind: string; op?: string; left?: unknown; right?: unknown }): number => {
    if (!expr) return 0;
    if (expr.kind === 'binary' && expr.op === 'AND') {
      return countConds(expr.left as typeof expr) + countConds(expr.right as typeof expr);
    }
    return 1;
  };
  const beforeWhere = result.parse?.statement?.type === 'select' ? countConds(result.parse.statement.where) : 0;
  const afterWhere = countConds(opt.optimizedStatement.where);
  const stats: { label: string; value: string }[] = [
    { label: 'Rules applied', value: `${done.length} / ${opt.results.length}` },
    { label: 'Characters', value: `${before.length} → ${after.length}` },
    { label: 'Filter conditions', value: `${beforeWhere} → ${afterWhere}` },
    { label: 'Result rows', value: 'Same' },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-cyan-brand/30 bg-card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-brand/20 bg-cyan-brand/10 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-cyan-brand/20 text-cyan-brand"><Wand2 className="size-4" aria-hidden="true" /></span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">Optimized query is ready</h3>
            <p className="text-xs text-muted-foreground">
              {saved > 0 ? `${saved} character${saved === 1 ? '' : 's'} shorter.` : 'Rewritten into a simpler equivalent form.'} Logical rewrite only, the results stay the same.
            </p>
          </div>
        </div>
        {applied ? (
          <Button size="sm" variant="outline" onClick={() => { setSql(result.source); toast({ kind: 'info', title: 'Original query restored' }); }}>
            <Undo2 /> Undo (restore original)
          </Button>
        ) : (
          <Button size="sm" variant="violet" onClick={() => { setSql(code.optimizedSql); toast({ kind: 'success', title: 'Editor updated with the optimized query', description: 'Press Ctrl+Enter to compile it.' }); }}>
            <Check /> Apply to editor
          </Button>
        )}
      </div>

      {/* Numbers */}
      <dl className="grid grid-cols-2 divide-x divide-y divide-border border-b sm:grid-cols-4 sm:divide-y-0">
        {stats.map((st) => (
          <div key={st.label} className="px-4 py-2.5">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{st.label}</dt>
            <dd className="text-base font-semibold tabular-nums">{st.value}</dd>
          </div>
        ))}
      </dl>

      {/* Before / After */}
      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-start [&>*]:min-w-0">
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive"><span className="size-2 rounded-full bg-destructive" aria-hidden="true" /> Before (your query)</p>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5"><CodeBlock code={code.formattedSql} label="your query" wrap /></div>
        </div>
        <div className="hidden items-center justify-center self-center text-muted-foreground md:flex" aria-hidden="true"><ArrowRight className="size-5" /></div>
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-success"><span className="size-2 rounded-full bg-success" aria-hidden="true" /> After (optimized)</p>
          <div className="rounded-lg border border-success/30 bg-success/5"><CodeBlock code={code.optimizedSql} label="optimized query" wrap /></div>
        </div>
      </div>

      {/* What changed */}
      <div className="border-t px-4 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">What changed</p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {done.map((r) => (
            <li key={r.ruleId} className="flex items-start gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm">
              <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
              <span className="min-w-0"><span className="block font-medium">{r.rule}</span><span className="line-clamp-2 text-xs text-muted-foreground" title={r.explanation}>{r.explanation.split(/(?<=\.)\s/)[0]}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Shown when the optimizer found nothing to do: one click loads a query that visibly optimizes. */
export function TryOptimizerDemo({ label = 'Want to see the optimizer work? Load a demo:' }: { label?: string }) {
  const { setSql } = useApp();
  const { toast } = useToast();
  const demos = EXAMPLES.filter((e) => e.id.startsWith('optimizer-'));
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {demos.map((d) => (
        <Button key={d.id} size="sm" variant="outline" onClick={() => { setSql(d.sql); toast({ kind: 'success', title: `Loaded “${d.title}”`, description: 'Now click Optimize Query.' }); }}>
          {d.title.replace('Optimizer showcase: ', '')}
        </Button>
      ))}
    </div>
  );
}
