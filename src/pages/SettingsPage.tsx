import * as React from 'react';
import { Cloud, HardDrive, Loader2, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { useApp } from '@/hooks/useApp';
import { checkSandbox } from '@/services/execution';
import { isSupabaseConfigured } from '@/services/supabase';
import { DEFAULT_SETTINGS, EMPTY_PROFILE } from '@/services/settings';
import { cn } from '@/lib/utils';

function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-b-0">
      <div className="min-w-0 max-w-md">
        <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { settings, updateSettings, updateProfile, history, historyMode, historyNote, clearHistory } = useApp();
  const { toast } = useToast();
  const [sandbox, setSandbox] = React.useState<{ checking: boolean; ok?: boolean; detail?: string }>({ checking: false });
  const [confirmClear, setConfirmClear] = React.useState(false);

  const check = React.useCallback(async () => {
    setSandbox({ checking: true });
    const r = await checkSandbox();
    setSandbox({ checking: false, ...r });
  }, []);
  React.useEffect(() => { void check(); }, [check]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">Preferences are saved in this browser.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Appearance</CardTitle></CardHeader>
        <CardContent>
          <Row label="Theme" hint="Dark is the default. You can also switch from the top bar.">
            <div role="group" aria-label="Theme" className="flex rounded-md border p-0.5 text-sm">
              {(['dark', 'light'] as const).map((t) => (
                <button key={t} type="button" aria-pressed={settings.theme === t} onClick={() => updateSettings({ theme: t })} className={cn('rounded px-3 py-1.5 font-medium capitalize', settings.theme === t ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  {t}
                </button>
              ))}
            </div>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Editor and pipeline</CardTitle></CardHeader>
        <CardContent>
          <Row label="Editor font size" htmlFor="font-size" hint="Applies to the SQL editor.">
            <select
              id="font-size"
              value={settings.fontSize}
              onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            >
              {[12, 13, 14, 16, 18, 20].map((n) => <option key={n} value={n}>{n} px</option>)}
            </select>
          </Row>
          <Row label="Wrap long lines" htmlFor="wrap" hint="Wrap instead of scrolling horizontally.">
            <Switch id="wrap" checked={settings.wrap} onCheckedChange={(v) => updateSettings({ wrap: v })} />
          </Row>
          <Row label="Animate the pipeline" htmlFor="animate" hint="Adds a short pause between stages so you can watch them run. Measured durations never include the pause.">
            <Switch id="animate" checked={settings.animate} onCheckedChange={(v) => updateSettings({ animate: v })} />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data and services</CardTitle>
          <CardDescription>Where your history is kept and whether the execution sandbox is reachable.</CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="History storage" hint={historyNote ?? (historyMode === 'supabase' ? 'Synced to your Supabase project with Row Level Security.' : isSupabaseConfigured ? 'Supabase is configured but not reachable, so the browser is used.' : 'Supabase is not configured. History is stored in this browser only.')}>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {historyMode === 'supabase' ? <Cloud className="size-4 text-cyan-brand" aria-hidden="true" /> : <HardDrive className="size-4" aria-hidden="true" />}
              {historyMode === 'supabase' ? 'Supabase' : 'Browser (localStorage)'}
            </span>
          </Row>
          <Row label="Execution sandbox" hint={sandbox.checking ? 'Checking…' : (sandbox.detail ?? 'Not checked')}>
            <div className="flex items-center gap-2">
              <span role="status" className={cn('text-sm font-medium', sandbox.ok ? 'text-success' : 'text-muted-foreground')}>{sandbox.checking ? 'Checking' : sandbox.ok ? 'Running' : 'Not running'}</span>
              <Button size="sm" variant="outline" onClick={() => void check()} disabled={sandbox.checking}>{sandbox.checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check again</Button>
            </div>
          </Row>
          <Row label="Query history" hint={`${history.length} saved ${history.length === 1 ? 'query' : 'queries'}.`}>
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={history.length === 0} onClick={() => setConfirmClear(true)}><Trash2 /> Clear history</Button>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Reset</CardTitle></CardHeader>
        <CardContent>
          <Row label="Restore default settings" hint="Theme, editor and pipeline options. Your history and project details are kept.">
            <Button size="sm" variant="outline" onClick={() => { updateSettings(DEFAULT_SETTINGS); toast({ kind: 'success', title: 'Settings restored to defaults' }); }}><RotateCcw /> Restore defaults</Button>
          </Row>
          <Row label="Clear project details" hint="Removes the student, university and supervisor fields from this browser.">
            <Button size="sm" variant="outline" onClick={() => { updateProfile(EMPTY_PROFILE); toast({ kind: 'success', title: 'Project details cleared' }); }}>Clear details</Button>
          </Row>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all history?"
        description={`This permanently deletes all ${history.length} saved queries from ${historyMode === 'supabase' ? 'Supabase' : 'this browser'}.`}
        confirmLabel="Clear history"
        onConfirm={() => void clearHistory()}
      />
    </div>
  );
}
