import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ExternalLink, Info, Loader2, Play, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CodeBlock } from '@/components/ui/code-block';
import { useApp } from '@/hooks/useApp';
import { runInSandbox, type ExecutionResult } from '@/services/execution';
import { cn } from '@/lib/utils';
import type { Verification } from '../verify';
import { STAGE_LABEL } from '../context';
import type { AiStatus } from '../aiClient';

/** A white card with a number, a title and a one-line explanation. Every feature uses it so they all look alike. */
export function StepCard({ step, title, description, children, className }: { step?: number; title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card p-4 shadow-sm sm:p-5', className)}>
      <header className="mb-3 flex items-start gap-3">
        {step !== undefined && (
          <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{step}</span>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export function BusyButton({ busy, children, icon, ...props }: React.ComponentProps<typeof Button> & { busy?: boolean; icon?: React.ReactNode }) {
  return (
    <Button {...props} disabled={busy || props.disabled}>
      {busy ? <Loader2 className="animate-spin" /> : icon}
      {children}
    </Button>
  );
}

export function Notice({ kind = 'info', children, className }: { kind?: 'info' | 'error' | 'success' | 'warning'; children: React.ReactNode; className?: string }) {
  const style = {
    info: 'border-primary/25 bg-secondary text-secondary-foreground',
    error: 'border-destructive/30 bg-destructive/10 text-destructive',
    success: 'border-success/30 bg-success/10 text-success',
    warning: 'border-warning/30 bg-warning/10 text-warning',
  }[kind];
  const Icon = { info: Info, error: XCircle, success: CheckCircle2, warning: AlertTriangle }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px] leading-snug', style, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Banner shown when the AI server is missing or has no key. The compiler-based parts keep working. */
export function AiOffline({ status }: { status: AiStatus | null }) {
  if (!status || status.configured) return null;
  return (
    <Notice kind="warning">
      <p className="font-medium">{status.reachable ? 'AI is not set up yet' : 'The server is not running'}</p>
      <p className="mt-0.5">
        {status.reachable
          ? 'Add GEMINI_API_KEY (or ANTHROPIC_API_KEY / OPENAI_API_KEY) to the .env file in the project folder, then restart "npm run server".'
          : 'Run "npm run server" in a second terminal, then reload this page.'}{' '}
        Compiler checks on this page still work; only the AI answers are switched off.
      </p>
    </Notice>
  );
}

/** Textarea for SQL with a shortcut to pull the query currently in the compiler editor. */
export function SqlInput({ value, onChange, label = 'Your SQL', rows = 5, placeholder, examples }: { value: string; onChange: (v: string) => void; label?: string; rows?: number; placeholder?: string; examples?: { label: string; sql: string }[] }) {
  const { sql: compilerSql } = useApp();
  const id = React.useId();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {examples?.map((e) => (
            <button key={e.label} type="button" onClick={() => onChange(e.sql)} className="rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">{e.label}</button>
          ))}
          <button type="button" onClick={() => onChange(compilerSql)} className="rounded-full border border-primary/30 bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/70">Use my compiler query</button>
        </div>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={4000}
        spellCheck={false}
        placeholder={placeholder}
        className="block w-full resize-y rounded-lg border border-input px-3 py-2 font-mono text-[13px] leading-relaxed placeholder:text-muted-foreground/70"
      />
    </div>
  );
}

export function ResultTable({ result }: { result: ExecutionResult }) {
  if (!result.ok) return <Notice kind="error">{result.error}</Notice>;
  return (
    <div className="space-y-1">
      <div className="scroll-thin max-h-64 overflow-auto rounded-lg border">
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 bg-muted">
            <tr>{result.columns.map((c, idx) => <th key={`${c}-${idx}`} className="whitespace-nowrap px-3 py-1.5 font-medium">{c}</th>)}</tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} className="border-t">
                {row.map((cell, j) => <td key={j} className="whitespace-nowrap px-3 py-1.5 font-mono">{cell === null ? <span className="text-muted-foreground">NULL</span> : String(cell)}</td>)}
              </tr>
            ))}
            {result.rows.length === 0 && <tr><td colSpan={Math.max(1, result.columns.length)} className="px-3 py-3 text-muted-foreground">No rows returned.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{result.rows.length} row{result.rows.length === 1 ? '' : 's'}{result.truncated ? ` (limited to ${result.maxRows})` : ''} · demo database</p>
    </div>
  );
}

/** SQL output block with the three actions people actually want: copy, open in the compiler, run. */
export function SqlResult({ sql, label, canRun = true }: { sql: string; label: string; canRun?: boolean }) {
  const { setSql } = useApp();
  const navigate = useNavigate();
  const [running, setRunning] = React.useState(false);
  const [exec, setExec] = React.useState<ExecutionResult | null>(null);
  const reqIdRef = React.useRef(0);
  React.useEffect(() => {
    reqIdRef.current++;
    setExec(null);
    setRunning(false);
  }, [sql]);

  const run = async () => {
    const id = ++reqIdRef.current;
    setRunning(true);
    const out = await runInSandbox(sql);
    if (reqIdRef.current !== id) return;
    setExec(out);
    setRunning(false);
  };
  return (
    <div className="space-y-2">
      <CodeBlock code={sql} label={label} wrap />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => { setSql(sql); navigate('/compiler'); }}>
          <ExternalLink /> Open in compiler
        </Button>
        {canRun && (
          <BusyButton type="button" size="sm" variant="outline" busy={running} icon={<Play />} onClick={run}>Run on demo data</BusyButton>
        )}
      </div>
      {exec && <ResultTable result={exec} />}
    </div>
  );
}

/** The compiler's verdict on a piece of SQL. This is what makes AI answers trustworthy in this project. */
export function VerifyBadge({ v, attempts }: { v: Verification | null; attempts?: number }) {
  if (!v) return null;
  if (v.ok) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success"><ShieldCheck className="size-3.5" /> Checked by the compiler: all stages passed</Badge>
        {attempts && attempts > 1 && <span className="text-xs text-muted-foreground">Corrected automatically after {attempts} tries</span>}
      </div>
    );
  }
  return (
    <Notice kind="error">
      <p className="font-medium">The AI answer did not pass the compiler ({STAGE_LABEL[v.failedStage ?? 'source']}).</p>
      <ul className="mt-1 list-disc pl-4">{v.errors.slice(0, 3).map((e, idx) => <li key={`${e}-${idx}`}>{e}</li>)}</ul>
      <p className="mt-1">Do not trust this query. Try again or edit your request.</p>
    </Notice>
  );
}
