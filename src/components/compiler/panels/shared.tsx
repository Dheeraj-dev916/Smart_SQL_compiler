import * as React from 'react';
import { AlertTriangle, CircleSlash, Hourglass, TerminalSquare } from 'lucide-react';
import type { CompilationResult, SourceLocation, StageId } from '@/types/compiler';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useApp } from '@/hooks/useApp';
import { cn } from '@/lib/utils';

/** Returns a function that selects a source range in the editor, refusing if the editor text changed since the compile. */
export function useJump() {
  const { result, sql, highlightRange } = useApp();
  const { toast } = useToast();
  return React.useCallback(
    (loc: Pick<SourceLocation, 'start' | 'end'> | undefined) => {
      if (!loc) return;
      if (!result || result.source !== sql) {
        toast({ kind: 'info', title: 'The editor changed since the last compile', description: 'Compile again to jump to source locations.' });
        return;
      }
      highlightRange(loc.start, Math.max(loc.end, loc.start + 1));
    },
    [result, sql, highlightRange, toast],
  );
}

export function PanelToolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-2 border-b px-3 py-2', className)}>{children}</div>;
}

export function Section({ title, hint, children, actions }: { title: string; hint?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function NoResult({ what }: { what: string }) {
  const { compileNow } = useApp();
  return (
    <EmptyState icon={TerminalSquare} title="Nothing compiled yet" description={`Compile a query to see its ${what}. Results always come from the real compiler, never from fixed sample data.`}>
      <Button size="sm" onClick={() => void compileNow()}>Compile current query</Button>
    </EmptyState>
  );
}

/** Explains why a phase has no output: it failed, was skipped, or has not run. */
export function Unavailable({ result, stage, what }: { result: CompilationResult; stage: StageId; what: string }) {
  const { setTab } = useApp();
  const st = result.stages.find((s) => s.id === stage);
  const failedEarlier = result.stages.find((s) => s.status === 'failed');
  const Icon = st?.status === 'failed' ? AlertTriangle : st?.status === 'skipped' ? CircleSlash : Hourglass;
  const title =
    st?.status === 'failed' ? `${st.label} failed` : st?.status === 'skipped' ? `${st?.label ?? 'This phase'} was skipped` : `No ${what} available`;
  const reason =
    st?.status === 'skipped' && failedEarlier ? `${failedEarlier.label} failed, so this phase did not run. Fix the errors first.` : (st?.summary ?? `The ${what} could not be produced.`);
  return (
    <EmptyState icon={Icon} title={title} description={reason} className={st?.status === 'failed' ? '[&>div:first-child]:bg-destructive/15 [&>div:first-child]:text-destructive' : undefined}>
      {result.diagnostics.length > 0 && (
        <Button size="sm" variant="outline" onClick={() => setTab('diagnostics')}>View errors and warnings</Button>
      )}
    </EmptyState>
  );
}

export function StatusNote({ tone, children }: { tone: 'info' | 'warning' | 'error' | 'success'; children: React.ReactNode }) {
  const tones = {
    info: 'border-cyan-brand/30 bg-cyan-brand/10',
    warning: 'border-warning/40 bg-warning/10',
    error: 'border-destructive/40 bg-destructive/10',
    success: 'border-success/40 bg-success/10',
  } as const;
  return <div className={cn('rounded-md border px-3 py-2 text-sm', tones[tone])}>{children}</div>;
}

export function DataTable({ head, children, minWidth = 480, caption }: { head: string[]; children: React.ReactNode; minWidth?: number; caption?: string }) {
  return (
    <div className="scroll-thin overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}
