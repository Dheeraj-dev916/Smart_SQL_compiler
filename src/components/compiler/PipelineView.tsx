import { ChevronRight, CheckCircle2, Circle, CircleSlash, Loader2, XCircle } from 'lucide-react';
import type { StageId, StageState, StageStatus } from '@/types/compiler';
import { STAGE_ORDER } from '@/compiler';
import { cn } from '@/lib/utils';
import { useApp, type ResultTab } from '@/hooks/useApp';
import { formatDuration } from '@/utils/format';
import { Badge } from '@/components/ui/badge';
import { formatDiagnostic } from '@/compiler/diagnostics';

const STAGE_TAB: Partial<Record<StageId, ResultTab>> = {
  lexical: 'tokens',
  syntax: 'ast',
  semantic: 'semantic',
  ir: 'ir',
  optimization: 'optimization',
  codegen: 'sql',
};

const STATUS_LABEL: Record<StageStatus, string> = { pending: 'Pending', running: 'Running', success: 'Success', failed: 'Failed', skipped: 'Skipped' };

function StatusIcon({ status }: { status: StageStatus }) {
  const common = 'size-4 shrink-0';
  switch (status) {
    case 'success': return <CheckCircle2 className={cn(common, 'text-success')} aria-hidden="true" />;
    case 'failed': return <XCircle className={cn(common, 'text-destructive')} aria-hidden="true" />;
    case 'running': return <Loader2 className={cn(common, 'animate-spin text-cyan-brand')} aria-hidden="true" />;
    case 'skipped': return <CircleSlash className={cn(common, 'text-muted-foreground')} aria-hidden="true" />;
    default: return <Circle className={cn(common, 'text-muted-foreground/60')} aria-hidden="true" />;
  }
}

const CARD: Record<StageStatus, string> = {
  pending: 'border-dashed text-muted-foreground',
  running: 'border-cyan-brand/60 bg-cyan-brand/5',
  success: 'border-success/40 bg-success/5',
  failed: 'border-destructive/70 bg-destructive/10 ring-1 ring-destructive/40',
  skipped: 'border-dashed bg-muted/30 text-muted-foreground',
};

/** Seven-stage pipeline whose statuses come from the compiler's real stage results. */
export function PipelineView() {
  const { result, liveStages, compiling, selectedStage, setSelectedStage, setTab } = useApp();
  const stages: StageState[] = liveStages ?? result?.stages ?? STAGE_ORDER.map((s) => ({ ...s, status: 'pending' as const }));
  const selected = stages.find((s) => s.id === selectedStage);
  const stageDiags =
    selected && result
      ? result.diagnostics.filter((d) => {
          if (selected.id === 'lexical') return d.category === 'Lexical Error';
          if (selected.id === 'syntax' || selected.id === 'source') return d.category === 'Syntax Error';
          if (selected.id === 'semantic' || selected.id === 'ir') return d.category === 'Semantic Error';
          if (selected.id === 'optimization') return d.category === 'Optimization Warning';
          return false;
        })
      : [];

  return (
    <section aria-label="Compiler pipeline" className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="relative mb-3 h-0.5 overflow-hidden rounded bg-muted" aria-hidden="true">
        {compiling && <div className="absolute inset-y-0 w-2/5 rounded bg-gradient-to-r from-[hsl(var(--cyan))] to-[hsl(var(--violet))] animate-progress" />}
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 lg:gap-0">
        {stages.map((s, i) => {
          const interactive = s.status !== 'pending' && s.status !== 'running';
          const isSel = selectedStage === s.id;
          return (
            <li key={s.id} className="relative flex items-stretch lg:pr-0">
              <button
                type="button"
                disabled={!interactive}
                aria-pressed={isSel}
                aria-label={`${i + 1}. ${s.label}: ${STATUS_LABEL[s.status]}${s.durationMs !== undefined ? `, ${formatDuration(s.durationMs)}` : ''}`}
                onClick={() => {
                  setSelectedStage(isSel ? null : s.id);
                  const t = STAGE_TAB[s.id];
                  if (t) setTab(t);
                }}
                className={cn(
                  'flex w-full min-w-0 flex-col gap-1 rounded-md border px-2.5 py-2 text-left transition-colors lg:mx-0.5',
                  CARD[s.status],
                  interactive && 'hover:border-foreground/40',
                  isSel && 'outline outline-2 outline-offset-1 outline-ring',
                  'disabled:cursor-default',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <StatusIcon status={s.status} />
                  <span className="font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                </span>
                <span className="text-xs font-semibold leading-tight">{s.label}</span>
                <span className="min-h-[1rem] text-[11px] leading-tight text-muted-foreground">
                  {STATUS_LABEL[s.status]}
                  {s.durationMs !== undefined && (s.status === 'success' || s.status === 'failed') ? ` · ${formatDuration(s.durationMs)}` : ''}
                </span>
              </button>
              {i < stages.length - 1 && <ChevronRight className="absolute -right-1.5 top-1/2 z-10 hidden size-3 -translate-y-1/2 text-muted-foreground lg:block" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      <div aria-live="polite" className="mt-3 min-h-[1.5rem] text-sm">
        {compiling && <p className="text-muted-foreground">Compiling…</p>}
        {!compiling && !result && <p className="text-muted-foreground">Compile a query to run it through all seven stages. Select a stage afterwards to see its output.</p>}
        {!compiling && result && !selected && (
          <p className={result.success ? 'text-success' : 'font-medium text-destructive'}>
            {result.success ? `Compilation succeeded in ${formatDuration(result.totalDurationMs)}.` : 'Compilation failed. See the failing stage above and the Errors and Warnings tab.'}
          </p>
        )}
        {!compiling && selected && (
          <div className="rounded-md border bg-muted/30 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{selected.label}</span>
              <Badge variant={selected.status === 'success' ? 'success' : selected.status === 'failed' ? 'destructive' : 'outline'}>{STATUS_LABEL[selected.status]}</Badge>
              {selected.durationMs !== undefined && <span className="text-xs text-muted-foreground">measured {formatDuration(selected.durationMs)}</span>}
            </div>
            {selected.summary && <p className="mt-1 text-muted-foreground">{selected.summary}</p>}
            {stageDiags.map((d) => <p key={d.id} className="mt-1 text-destructive">{formatDiagnostic(d)}</p>)}
          </div>
        )}
      </div>
    </section>
  );
}
