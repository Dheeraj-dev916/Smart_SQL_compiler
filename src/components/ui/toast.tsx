import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info' | 'warning';
interface ToastItem { id: number; kind: ToastKind; title: string; description?: string }
interface ToastApi { toast: (t: { kind?: ToastKind; title: string; description?: string }) => void }

const ToastContext = React.createContext<ToastApi>({ toast: () => undefined });
export const useToast = () => React.useContext(ToastContext);

const ICONS = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const COLORS = { success: 'text-success', error: 'text-destructive', info: 'text-cyan-brand', warning: 'text-warning' };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const next = React.useRef(1);
  const dismiss = React.useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const toast = React.useCallback<ToastApi['toast']>(
    ({ kind = 'info', title, description }) => {
      const id = next.current++;
      setItems((l) => [...l.slice(-3), { id, kind, title, description }]);
      window.setTimeout(() => dismiss(id), kind === 'error' ? 6500 : 3800);
    },
    [dismiss],
  );
  const api = React.useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4" aria-live="polite" role="status">
        {items.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border bg-card p-3 shadow-lg animate-fade-in">
              <Icon className={cn('mt-0.5 size-4 shrink-0', COLORS[t.kind])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
              </div>
              <button className="rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
