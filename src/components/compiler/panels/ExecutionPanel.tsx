import { Database, Loader2, Play, ServerOff } from 'lucide-react';
import type { CompilationResult } from '@/types/compiler';
import { Button } from '@/components/ui/button';
import { useApp } from '@/hooks/useApp';
import { formatDuration, plural } from '@/utils/format';
import { DataTable, StatusNote } from './shared';

function Cell({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="italic text-muted-foreground">NULL</span>;
  return <>{String(v)}</>;
}

/** Runs SELECT statements in the server-side sandbox. Never simulates results. */
export function ExecutionPanel({ result }: { result: CompilationResult }) {
  const { execution, runExecution } = useApp();
  const isSelect = result.parse?.statement?.type === 'select';
  const canRun = result.success && isSelect;
  const optimizedDiffers = result.codegen?.sqlChanged;
  const running = execution.status === 'running';
  const r = execution.result;
  return (
    <div className="space-y-3 p-3">
      <StatusNote tone="info">
        <p className="flex items-center gap-2 font-medium"><Database className="size-4" aria-hidden="true" /> Real execution in a sandbox</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Queries run on the server in a throwaway in-memory SQLite database seeded with sample students, courses and enrollments. Only one read-only SELECT is allowed, with a row limit and timeout. SQLite is not PostgreSQL, so a few functions can differ. Results here are never simulated.
        </p>
      </StatusNote>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!canRun || running} onClick={() => void runExecution(result.codegen?.formattedSql ?? result.source)}>
          {running ? <Loader2 className="animate-spin" /> : <Play />} Run query
        </Button>
        {optimizedDiffers && (
          <Button size="sm" variant="outline" disabled={!canRun || running} onClick={() => void runExecution(result.codegen!.optimizedSql)}>
            <Play /> Run optimized SQL
          </Button>
        )}
        {!canRun && <span className="text-xs text-muted-foreground">{!isSelect ? 'Only SELECT statements can be executed.' : 'Fix the compilation errors first.'}</span>}
      </div>

      {execution.status === 'idle' && <p className="text-sm text-muted-foreground">No query has been run yet.</p>}
      {running && <p className="text-sm text-muted-foreground" role="status">Running in the sandbox…</p>}
      {r && !running && !r.ok && (
        <StatusNote tone={r.unavailable ? 'warning' : 'error'}>
          <p className="flex items-center gap-2 font-medium">
            {r.unavailable && <ServerOff className="size-4" aria-hidden="true" />}
            {r.unavailable ? 'Sandbox unavailable' : 'Execution Error'}
          </p>
          <p className="mt-0.5">{r.error}</p>
        </StatusNote>
      )}
      {r && !running && r.ok && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground" role="status">
            {plural(r.rows.length, 'row')} returned{r.truncated ? ` (truncated to the first ${r.maxRows})` : ''} · {formatDuration(r.durationMs)} measured on the server
          </p>
          {execution.sql && <pre className="scroll-thin overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-xs">{execution.sql}</pre>}
          {r.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">The query ran successfully and returned no rows.</p>
          ) : (
            <DataTable head={r.columns} minWidth={Math.max(360, r.columns.length * 120)} caption="Query result rows">
              {r.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((v, j) => (
                    <td key={j} className="px-3 py-1.5 font-mono text-[13px]"><Cell v={v} /></td>
                  ))}
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      )}
    </div>
  );
}
