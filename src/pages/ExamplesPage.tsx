import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, SquarePen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CodeBlock } from '@/components/ui/code-block';
import { useToast } from '@/components/ui/toast';
import { EXAMPLES, type SqlExample } from '@/data/examples';
import { STAGE_ORDER } from '@/compiler';
import { RULES } from '@/compiler/optimizer';
import { useApp } from '@/hooks/useApp';
import { cn } from '@/lib/utils';

const CATEGORIES = ['All', 'Basics', 'Aggregation', 'Joins', 'Optimization', 'Errors'] as const;

function Expected({ ex }: { ex: SqlExample }) {
  const stage = STAGE_ORDER.find((s) => s.id === ex.expect.failedStage)?.label;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ex.expect.outcome === 'success' ? <Badge variant="success">Compiles</Badge> : <Badge variant="destructive">Fails at {stage ?? 'a phase'}</Badge>}
      {(ex.expect.appliedRules ?? []).map((id) => <Badge key={id} variant="violet">{RULES.find((r) => r.id === id)?.name ?? id}</Badge>)}
      {ex.expect.outcome === 'success' && (ex.expect.appliedRules ?? []).length === 0 && <Badge variant="outline">No optimization applies</Badge>}
      {(ex.expect.skippedRules ?? []).map((id) => <Badge key={id} variant="outline">Skips {RULES.find((r) => r.id === id)?.name ?? id}</Badge>)}
    </div>
  );
}

export default function ExamplesPage() {
  const [cat, setCat] = React.useState<(typeof CATEGORIES)[number]>('All');
  const { setSql, compileNow } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const shown = EXAMPLES.filter((e) => cat === 'All' || e.category === cat);

  const load = (ex: SqlExample, compile: boolean) => {
    setSql(ex.sql);
    navigate('/compiler');
    if (compile) void compileNow(ex.sql);
    else toast({ kind: 'success', title: `Loaded “${ex.title}”`, description: 'Edit it freely, then press Compile Query.' });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">SQL examples</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {EXAMPLES.length} queries chosen to show each compiler phase. Every expected outcome below is checked against the real compiler by the automated test suite.
        </p>
      </div>
      <div role="group" aria-label="Filter examples by category" className="flex gap-1.5 overflow-x-auto scroll-thin pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
            className={cn('shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors', cat === c ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {c} <span className="text-xs opacity-70">{c === 'All' ? EXAMPLES.length : EXAMPLES.filter((e) => e.category === c).length}</span>
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0" aria-label="Example queries">
        {shown.map((ex) => (
          <li key={ex.id}>
            <Card className="flex h-full flex-col">
              <CardHeader className="gap-2 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{ex.title}</CardTitle>
                  <Badge variant="outline">{ex.category}</Badge>
                </div>
                <Expected ex={ex} />
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <CodeBlock code={ex.sql} label={`${ex.title} SQL`} />
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">Learning objective: </span><span className="text-muted-foreground">{ex.objective}</span></p>
                  <p><span className="font-medium">Expected: </span><span className="text-muted-foreground">{ex.outcomeNote}</span></p>
                  <p className="flex flex-wrap items-center gap-1.5"><span className="font-medium">Look at: </span>{ex.phases.map((p) => <Badge key={p} variant="cyan">{p}</Badge>)}</p>
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={() => load(ex, true)}><Play /> Load and compile</Button>
                  <Button size="sm" variant="outline" onClick={() => load(ex, false)}><SquarePen /> Load in editor</Button>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
