import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Braces, Database, GitBranch, History, ListTree, Play, ScanText, Sparkles, SquareTerminal } from 'lucide-react';
import { LogoMark } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { HistoryRow } from '@/components/history/HistoryRow';
import { EXAMPLES } from '@/data/examples';
import { STAGE_ORDER } from '@/compiler';
import { useApp } from '@/hooks/useApp';

const STAGE_INFO: Record<string, string> = {
  source: 'The SQL text you type, checked for being non-empty.',
  lexical: 'Characters become tokens with line, column and offsets.',
  syntax: 'A real SQL parser builds a syntax tree or reports the error.',
  semantic: 'Names and types are checked against the schema.',
  ir: 'A logical plan and relational algebra are built.',
  optimization: 'Safe rewrite rules run; each reports applied or skipped.',
  codegen: 'Formatted and optimized SQL are generated.',
};

const FEATURES = [
  { icon: ScanText, title: 'Lexer with source positions', text: 'Hand-written tokenizer: keywords, strings, comments, multi-character operators, unterminated-string errors.' },
  { icon: ListTree, title: 'Real SQL parser', text: 'node-sql-parser builds the AST; unsupported syntax is rejected clearly, never silently accepted.' },
  { icon: GitBranch, title: 'Schema-aware semantics', text: 'Unknown tables and columns, ambiguity, aliases, GROUP BY rules and “did you mean” hints.' },
  { icon: Braces, title: 'Logical plan and algebra', text: 'TableScan, Join, Selection, Aggregation, Projection, Sort and Limit, built from the query itself.' },
  { icon: Sparkles, title: 'Safe optimizer', text: 'Constant folding, simplification, pushdown and more. Unsafe rewrites are skipped with a reason.' },
  { icon: Database, title: 'Sandboxed execution', text: 'Optionally run SELECTs on a server-side in-memory SQLite database with limits and validation.' },
];

const QUICK = ['basic-select', 'where', 'inner-join', 'unknown-column', 'constant-folding'];

export default function Dashboard() {
  const { history, historyMode, historyLoading, removeHistory, setSql, compileNow } = useApp();
  const navigate = useNavigate();
  const stats = {
    analyzed: history.length,
    ok: history.filter((h) => h.status === 'success').length,
    errors: history.reduce((n, h) => n + h.errorCount, 0),
    opt: history.reduce((n, h) => n + h.optimizationCount, 0),
  };
  const quick = QUICK.map((id) => EXAMPLES.find((e) => e.id === id)!).filter(Boolean);

  return (
    <div className="space-y-6">
      <section className="dot-grid relative overflow-hidden rounded-xl border bg-card p-5 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[hsl(var(--violet)/0.14)] blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 flex items-center gap-3"><LogoMark className="size-11" /><span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Compiler Design project</span></div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-4xl">Welcome to the Smart SQL Query Compiler</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Type a SQL query and watch it move through every compiler phase: tokens, syntax tree, semantic checks, relational algebra, a logical plan, safe optimizations and generated SQL. Errors are caught where they belong, with positions and suggested fixes.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button size="lg" asChild><Link to="/compiler"><SquareTerminal /> Open Compiler</Link></Button>
              <Button size="lg" variant="outline" asChild><Link to="/examples">Browse examples</Link></Button>
              <Button size="lg" variant="ghost" asChild><Link to="/learn">Learn the phases <ArrowRight /></Link></Button>
            </div>
          </div>
          <pre aria-hidden="true" className="hidden shrink-0 rounded-lg border bg-background/70 p-4 font-mono text-xs leading-relaxed text-muted-foreground xl:block">
{`SELECT name
FROM students
WHERE age > 20;

π_{name}(σ_{age > 20}(students))`}
          </pre>
        </div>
      </section>

      <section aria-labelledby="stats-h">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="stats-h" className="text-sm font-semibold">Your activity</h2>
          <p className="text-xs text-muted-foreground">Counted from the {historyMode === 'supabase' ? 'Supabase' : 'browser'} history. No sample data.</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Queries analyzed', stats.analyzed],
            ['Successful compilations', stats.ok],
            ['Errors detected', stats.errors],
            ['Optimizations applied', stats.opt],
          ].map(([label, value]) => (
            <Card key={label as string} className="p-4">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">{historyLoading ? '–' : value}</dd>
            </Card>
          ))}
        </dl>
        {!historyLoading && history.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Nothing yet. Compile your first query and these numbers will start counting.</p>}
      </section>

      <section aria-labelledby="pipe-h">
        <h2 id="pipe-h" className="mb-2 text-sm font-semibold">Compiler pipeline</h2>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {STAGE_ORDER.map((s, i) => (
            <li key={s.id} className="rounded-lg border bg-card p-3">
              <p className="font-mono text-[11px] text-cyan-brand">{String(i + 1).padStart(2, '0')}</p>
              <p className="text-sm font-semibold leading-tight">{s.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{STAGE_INFO[s.id]}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <section aria-labelledby="quick-h">
          <h2 id="quick-h" className="mb-2 text-sm font-semibold">Quick start</h2>
          <ul className="space-y-2">
            {quick.map((ex) => (
              <li key={ex.id}>
                <Card className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{ex.title}</p>
                      <pre className="scroll-thin mt-1.5 max-w-full overflow-x-auto whitespace-pre font-mono text-xs text-muted-foreground">{ex.sql}</pre>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => { setSql(ex.sql); navigate('/compiler'); void compileNow(ex.sql); }}>
                      <Play /> Compile
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="recent-h">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="recent-h" className="text-sm font-semibold">Recent queries</h2>
            {history.length > 0 && <Button variant="ghost" size="sm" asChild><Link to="/history">View all <ArrowRight /></Link></Button>}
          </div>
          {historyLoading ? (
            <p className="text-sm text-muted-foreground" role="status">Loading…</p>
          ) : history.length === 0 ? (
            <Card><EmptyState icon={History} title="No queries compiled yet" description="Your compiled queries will appear here so you can reopen or recompile them.">
              <Button asChild size="sm"><Link to="/compiler">Compile a query</Link></Button>
            </EmptyState></Card>
          ) : (
            <ul className="space-y-2">{history.slice(0, 4).map((h) => <HistoryRow key={h.id} entry={h} compact onDelete={(id) => void removeHistory(id)} />)}</ul>
          )}
        </section>
      </div>

      <section aria-labelledby="feat-h">
        <h2 id="feat-h" className="mb-2 text-sm font-semibold">What is inside</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Card className="h-full">
                <CardHeader className="flex-row items-center gap-2.5 space-y-0 pb-1">
                  <span className="flex size-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground"><Icon className="size-4" aria-hidden="true" /></span>
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent><CardDescription className="text-sm">{text}</CardDescription></CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
