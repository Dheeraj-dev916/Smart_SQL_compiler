import * as React from 'react';
import type { CompilationResult, StageId, StageState } from '@/types/compiler';
import { compileWithProgress } from '@/compiler';
import { useToast } from '@/components/ui/toast';
import { createLocalStore, createSupabaseStore, entryFromResult, type HistoryEntry, type HistoryStore } from '@/services/history';
import { isSupabaseConfigured } from '@/services/supabase';
import { runInSandbox, type ExecutionResult } from '@/services/execution';
import {
  DRAFT_KEY, applyTheme, loadProfile, loadSettings, saveProfile, saveSettings, type Profile, type Settings,
} from '@/services/settings';
import { readJson, writeJson } from '@/services/storage';

/** The first query ever shipped as the default. A draft that still equals it is upgraded to the new default. */
const OLD_9_LINE_DEFAULT = "SELECT DISTINCT s.id, s.name, c.course_name\nFROM students s\nINNER JOIN enrollments e ON s.id = e.student_id\nINNER JOIN courses c ON c.id = e.course_id\nWHERE 1 = 1\n  AND s.age > 18 + 2\n  AND c.credits * 1 > 2\n  AND s.department IN ('Computer Science')\nORDER BY s.name;";
const LEGACY_DEFAULT_QUERY = "SELECT name, department\nFROM students\nWHERE department = 'Computer Science'\nORDER BY name;";
/** 17 lines, 3 tables, deliberately un-optimized: click Optimize Query and the editor text is rewritten. */
export const DEFAULT_QUERY = "SELECT DISTINCT\n  s.id,\n  s.name,\n  s.department,\n  c.course_name,\n  c.credits\nFROM students s\nINNER JOIN enrollments e ON s.id = e.student_id\nINNER JOIN courses c ON c.id = e.course_id\nWHERE 1 = 1\n  AND s.age > 18 + 2\n  AND c.credits * 1 > 2\n  AND s.department IN ('Computer Science')\n  AND NOT (s.gpa < 2.0)\n  AND e.student_id IS NOT NULL\nORDER BY s.name;";

export type ResultTab = 'tokens' | 'ast' | 'semantic' | 'ir' | 'optimization' | 'sql' | 'diagnostics' | 'execution';

export interface ExecutionState {
  status: 'idle' | 'running' | 'done';
  sql?: string;
  result?: ExecutionResult;
}

interface AppState {
  sql: string;
  setSql: (s: string) => void;
  result: CompilationResult | null;
  liveStages: StageState[] | null;
  compiling: boolean;
  compileNow: (sql?: string, opts?: { tab?: ResultTab }) => Promise<CompilationResult | null>;
  tab: ResultTab;
  setTab: (t: ResultTab) => void;
  selectedStage: StageId | null;
  setSelectedStage: (s: StageId | null) => void;
  highlight: { start: number; end: number; nonce: number } | null;
  highlightRange: (start: number, end: number) => void;
  history: HistoryEntry[];
  historyMode: 'local' | 'supabase';
  historyNote?: string;
  historyLoading: boolean;
  removeHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  profile: Profile;
  updateProfile: (p: Profile) => void;
  execution: ExecutionState;
  runExecution: (sql: string) => Promise<void>;
  resetEditor: () => void;
}

const AppContext = React.createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [sql, setSqlState] = React.useState<string>(() => {
    const saved = readJson<string>(DRAFT_KEY, DEFAULT_QUERY) || DEFAULT_QUERY;
    return saved === LEGACY_DEFAULT_QUERY || saved === OLD_9_LINE_DEFAULT ? DEFAULT_QUERY : saved;
  });
  const [result, setResult] = React.useState<CompilationResult | null>(null);
  const [liveStages, setLiveStages] = React.useState<StageState[] | null>(null);
  const [compiling, setCompiling] = React.useState(false);
  const [tab, setTab] = React.useState<ResultTab>('tokens');
  const [selectedStage, setSelectedStage] = React.useState<StageId | null>(null);
  const [highlight, setHighlight] = React.useState<AppState['highlight']>(null);
  const [settings, setSettings] = React.useState<Settings>(loadSettings);
  const [profile, setProfile] = React.useState<Profile>(loadProfile);
  const [execution, setExecution] = React.useState<ExecutionState>({ status: 'idle' });

  // history
  const storeRef = React.useRef<HistoryStore>(createLocalStore());
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [historyMode, setHistoryMode] = React.useState<'local' | 'supabase'>('local');
  const [historyNote, setHistoryNote] = React.useState<string | undefined>();
  const [historyLoading, setHistoryLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      let store: HistoryStore = createLocalStore();
      if (isSupabaseConfigured) {
        try {
          store = await createSupabaseStore();
          if (cancelled) return;
          setHistoryNote(undefined);
        } catch (e) {
          if (cancelled) return;
          setHistoryNote(`Supabase unavailable, using browser storage instead. ${(e as Error).message}`);
        }
      }
      try {
        const list = await store.list();
        if (cancelled) return;
        storeRef.current = store;
        setHistoryMode(store.mode);
        setHistory(list);
      } catch (e) {
        if (cancelled) return;
        storeRef.current = createLocalStore();
        setHistoryMode('local');
        setHistoryNote(`Could not load Supabase history (${(e as Error).message}); using browser storage.`);
        setHistory(await storeRef.current.list());
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // theme + persisted draft
  React.useEffect(() => { applyTheme(settings.theme); }, [settings.theme]);
  React.useEffect(() => {
    const t = window.setTimeout(() => writeJson(DRAFT_KEY, sql), 300);
    return () => window.clearTimeout(t);
  }, [sql]);

  const setSql = React.useCallback((s: string) => setSqlState(s), []);
  const resetEditor = React.useCallback(() => setSqlState(DEFAULT_QUERY), []);

  const highlightRange = React.useCallback((start: number, end: number) => setHighlight({ start, end, nonce: Date.now() }), []);

  const compilingRef = React.useRef(false);
  const execReqRef = React.useRef(0);
  const settingsRef = React.useRef(settings);
  settingsRef.current = settings;
  const sqlRef = React.useRef(sql);
  sqlRef.current = sql;

  const compileNow = React.useCallback<AppState['compileNow']>(async (override, opts) => {
    if (compilingRef.current) return null;
    const source = override ?? sqlRef.current;
    if (override !== undefined) setSqlState(override);
    compilingRef.current = true;
    execReqRef.current++;
    setExecution({ status: 'idle' });
    setCompiling(true);
    setSelectedStage(null);
    try {
      const r = await compileWithProgress(source, { stageDelayMs: settingsRef.current.animate ? 130 : 0, onStages: setLiveStages });
      setResult(r);
      if (!r.success) setTab('diagnostics');
      else if (opts?.tab) setTab(opts.tab);
      if (!r.success) setSelectedStage(r.stages.find((s) => s.status === 'failed')?.id ?? null);
      try {
        const entry = await storeRef.current.add(entryFromResult(r));
        setHistory((h) => [entry, ...h]);
      } catch (e) {
        toast({ kind: 'warning', title: 'Could not save to history', description: (e as Error).message });
      }
      return r;
    } catch (e) {
      toast({ kind: 'error', title: 'The compiler crashed', description: `${(e as Error).message}. This is a bug in the compiler, not in your SQL.` });
      return null;
    } finally {
      compilingRef.current = false;
      setCompiling(false);
      setLiveStages(null);
    }
  }, [toast]);

  const removeHistory = React.useCallback(async (id: string) => {
    try {
      await storeRef.current.remove(id);
      setHistory((h) => h.filter((x) => x.id !== id));
    } catch (e) {
      toast({ kind: 'error', title: 'Could not delete entry', description: (e as Error).message });
    }
  }, [toast]);

  const clearHistory = React.useCallback(async () => {
    try {
      await storeRef.current.clear();
      setHistory([]);
      toast({ kind: 'success', title: 'History cleared' });
    } catch (e) {
      toast({ kind: 'error', title: 'Could not clear history', description: (e as Error).message });
    }
  }, [toast]);

  const updateSettings = React.useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);
  const updateProfile = React.useCallback((p: Profile) => { setProfile(p); saveProfile(p); }, []);

  const runExecution = React.useCallback(async (s: string) => {
    const id = ++execReqRef.current;
    setExecution({ status: 'running', sql: s });
    const r = await runInSandbox(s);
    if (execReqRef.current !== id) return;
    setExecution({ status: 'done', sql: s, result: r });
  }, []);

  const value: AppState = {
    sql, setSql, result, liveStages, compiling, compileNow, tab, setTab, selectedStage, setSelectedStage,
    highlight, highlightRange, history, historyMode, historyNote, historyLoading, removeHistory, clearHistory,
    settings, updateSettings, profile, updateProfile, execution, runExecution, resetEditor,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
