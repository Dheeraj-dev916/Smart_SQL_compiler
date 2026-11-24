import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { CompilationResult, Diagnostic } from '@/types/compiler';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApp } from '@/hooks/useApp';
import { plural } from '@/utils/format';
import { StatusNote, useJump } from './shared';

const ICON = { error: XCircle, warning: AlertTriangle, info: Info } as const;
const TONE = { error: 'text-destructive', warning: 'text-warning', info: 'text-cyan-brand' } as const;
const BADGE = { error: 'destructive', warning: 'warning', info: 'cyan' } as const;

/** Compile diagnostics plus, when the sandbox was used, the execution error (kept in its own category). */
export function useAllDiagnostics(result: CompilationResult | null): Diagnostic[] {
  const { execution } = useApp();
  return React.useMemo(() => {
    if (!result) return [];
    const list = [...result.diagnostics];
    if (execution.status === 'done' && execution.result && !execution.result.ok && !execution.result.unavailable) {
      list.push({ id: 'exec1', severity: 'error', category: 'Execution Error', message: execution.result.error, suggestion: 'The query compiled but the sandbox database rejected or failed to run it.' });
    }
    return list;
  }, [result, execution]);
}

export function DiagnosticsPanel({ result }: { result: CompilationResult }) {
  const list = useAllDiagnostics(result);
  const jump = useJump();
  const errors = list.filter((d) => d.severity === 'error').length;
  const warnings = list.filter((d) => d.severity === 'warning').length;
  const infos = list.filter((d) => d.severity === 'info').length;
  return (
    <div className="space-y-3 p-3">
      {list.length === 0 ? (
        <StatusNote tone="success">
          <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4 text-success" aria-hidden="true" /> No errors or warnings. Every phase that ran succeeded.</p>
        </StatusNote>
      ) : (
        <p className="text-sm" role="status" aria-live="polite">
          <strong>{plural(errors, 'error')}</strong>, {plural(warnings, 'warning')}{infos ? `, ${plural(infos, 'note')}` : ''}.
        </p>
      )}
      <ul aria-label="Errors and warnings" className="space-y-2">
        {list.map((d) => {
          const Icon = ICON[d.severity];
          return (
            <li key={d.id} className="rounded-md border p-3" data-severity={d.severity}>
              <div className="flex flex-wrap items-center gap-2">
                <Icon className={`size-4 ${TONE[d.severity]}`} aria-hidden="true" />
                <span className="sr-only">{d.severity}:</span>
                <Badge variant={BADGE[d.severity]}>{d.category}</Badge>
                {d.location && (
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 font-mono text-xs" onClick={() => jump(d.location)} aria-label={`Go to line ${d.location.line}, column ${d.location.column} in the editor`}>
                    line {d.location.line}, col {d.location.column}
                  </Button>
                )}
              </div>
              <p className="mt-1.5 text-sm">{d.message}</p>
              {d.suggestion && <p className="mt-1 text-sm text-muted-foreground"><span className="font-medium text-foreground">Suggested fix: </span>{d.suggestion}</p>}
              {!d.location && d.category !== 'Optimization Warning' && d.category !== 'Execution Error' && (
                <p className="mt-1 text-xs text-muted-foreground">No exact source position is available for this diagnostic.</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
