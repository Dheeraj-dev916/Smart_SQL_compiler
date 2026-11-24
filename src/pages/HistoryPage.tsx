import * as React from 'react';
import { Link } from 'react-router-dom';
import { Cloud, HardDrive, History, Search, SearchX, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { HistoryRow } from '@/components/history/HistoryRow';
import { useApp } from '@/hooks/useApp';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'success' | 'failed';

export default function HistoryPage() {
  const { history, historyMode, historyNote, historyLoading, removeHistory, clearHistory } = useApp();
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState<Filter>('all');
  const [confirm, setConfirm] = React.useState(false);

  const shown = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return history.filter((h) => (filter === 'all' || h.status === filter) && (!s || h.sql.toLowerCase().includes(s)));
  }, [history, q, filter]);

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: history.length },
    { id: 'success', label: 'Succeeded', count: history.filter((h) => h.status === 'success').length },
    { id: 'failed', label: 'Failed', count: history.filter((h) => h.status === 'failed').length },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Query history</h2>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {historyMode === 'supabase' ? <Cloud className="size-4" aria-hidden="true" /> : <HardDrive className="size-4" aria-hidden="true" />}
          {historyMode === 'supabase'
            ? 'Saved to your Supabase project. Row Level Security keeps entries private to your session.'
            : 'Saved in this browser only (localStorage). Configure Supabase in the environment to persist it elsewhere.'}
        </p>
        {historyNote && <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm" role="status">{historyNote}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search saved queries" aria-label="Search saved queries" className="pl-8" />
        </div>
        <div role="group" aria-label="Filter by status" className="flex rounded-md border p-0.5 text-sm">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn('rounded px-3 py-1.5 font-medium transition-colors', filter === f.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {f.label} <span className="text-xs opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
        <Button variant="outline" disabled={history.length === 0} onClick={() => setConfirm(true)} className="text-destructive hover:text-destructive">
          <Trash2 /> Clear history
        </Button>
      </div>

      {historyLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground" role="status">Loading history…</p>
      ) : history.length === 0 ? (
        <EmptyState icon={History} title="No queries yet" description="Every query you compile is saved here so you can reopen or recompile it later.">
          <Button asChild><Link to="/compiler">Open the compiler</Link></Button>
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon={SearchX} title="No matching queries" description="Try a different search or filter.">
          <Button variant="outline" onClick={() => { setQ(''); setFilter('all'); }}>Reset filters</Button>
        </EmptyState>
      ) : (
        <>
          <p className="text-xs text-muted-foreground" aria-live="polite">Showing {shown.length} of {history.length} entries</p>
          <ul className="space-y-2.5" aria-label="Query history">
            {shown.map((h) => <HistoryRow key={h.id} entry={h} onDelete={(id) => void removeHistory(id)} />)}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Clear all history?"
        description={`This permanently deletes all ${history.length} saved ${history.length === 1 ? 'query' : 'queries'}${historyMode === 'supabase' ? ' from Supabase' : ' from this browser'}. It cannot be undone.`}
        confirmLabel="Clear history"
        onConfirm={() => void clearHistory()}
      />
    </div>
  );
}
