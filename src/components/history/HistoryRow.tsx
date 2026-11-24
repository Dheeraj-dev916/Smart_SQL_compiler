import { CheckCircle2, Clock, FolderOpen, Play, Sparkles, Trash2, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { HistoryEntry } from '@/services/history';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { useApp } from '@/hooks/useApp';
import { formatDate, formatDuration, plural } from '@/utils/format';

/** Reopen / recompile helpers shared by the dashboard and the history page. */
export function useHistoryActions() {
  const { setSql, compileNow } = useApp();
  const navigate = useNavigate();
  return {
    reopen: (sql: string) => {
      setSql(sql);
      navigate('/compiler');
    },
    recompile: (sql: string) => {
      navigate('/compiler');
      void compileNow(sql);
    },
  };
}

export function HistoryRow({ entry, onDelete, compact = false }: { entry: HistoryEntry; onDelete?: (id: string) => void; compact?: boolean }) {
  const { reopen, recompile } = useHistoryActions();
  const ok = entry.status === 'success';
  return (
    <li className="rounded-lg border bg-card p-3" data-testid="history-row">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <Badge variant={ok ? 'success' : 'destructive'}>
          {ok ? <CheckCircle2 className="size-3" aria-hidden="true" /> : <XCircle className="size-3" aria-hidden="true" />}
          {ok ? 'Succeeded' : 'Failed'}
        </Badge>
        <time dateTime={entry.createdAt} className="text-muted-foreground">{formatDate(entry.createdAt)}</time>
        <span className="flex items-center gap-1 text-muted-foreground"><Clock className="size-3" aria-hidden="true" /> {formatDuration(entry.durationMs)}</span>
        <span className={entry.errorCount ? 'text-destructive' : 'text-muted-foreground'}>{plural(entry.errorCount, 'error')}</span>
        <span className="flex items-center gap-1 text-muted-foreground"><Sparkles className="size-3" aria-hidden="true" /> {plural(entry.optimizationCount, 'optimization')}</span>
      </div>
      <pre className={`scroll-thin mt-2 overflow-x-auto rounded-md bg-muted/50 p-2 font-mono text-[13px] leading-relaxed ${compact ? 'max-h-16' : 'max-h-40'} overflow-y-auto`}>{entry.sql}</pre>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={() => reopen(entry.sql)}><FolderOpen /> Reopen</Button>
        <Button size="sm" variant="outline" onClick={() => recompile(entry.sql)}><Play /> Recompile</Button>
        {onDelete && (
          <Tip label="Delete this entry">
            <Button size="icon" variant="ghost" className="ml-auto" onClick={() => onDelete(entry.id)} aria-label="Delete this history entry"><Trash2 /></Button>
          </Tip>
        )}
      </div>
    </li>
  );
}
