import type { CompilationResult } from '@/types/compiler';
import { readJson, removeKey, writeJson } from './storage';
import { getSupabase } from './supabase';

export interface HistoryEntry {
  id: string;
  sql: string;
  status: 'success' | 'failed';
  errorCount: number;
  optimizationCount: number;
  /** Total pipeline time, measured. */
  durationMs?: number;
  createdAt: string;
}

export type NewHistoryEntry = Omit<HistoryEntry, 'id' | 'createdAt'>;

export interface HistoryStore {
  mode: 'local' | 'supabase';
  list(): Promise<HistoryEntry[]>;
  add(e: NewHistoryEntry): Promise<HistoryEntry>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

export const HISTORY_KEY = 'ssc.history';
const MAX_LOCAL = 200;

export function entryFromResult(r: CompilationResult): NewHistoryEntry {
  return {
    sql: r.source.slice(0, 10000),
    status: r.success ? 'success' : 'failed',
    errorCount: r.diagnostics.filter((d) => d.severity === 'error').length,
    optimizationCount: r.optimizationCount,
    durationMs: Math.round(r.totalDurationMs * 100) / 100,
  };
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `h${Date.now()}${Math.random().toString(36).slice(2, 8)}`);

export function createLocalStore(): HistoryStore {
  const load = () => readJson<HistoryEntry[]>(HISTORY_KEY, []);
  return {
    mode: 'local',
    async list() {
      return load();
    },
    async add(e) {
      const entry: HistoryEntry = { ...e, id: newId(), createdAt: new Date().toISOString() };
      const saved = writeJson(HISTORY_KEY, [entry, ...load()].slice(0, MAX_LOCAL));
      if (!saved) throw new Error('Browser storage is full; could not save history entry.');
      return entry;
    },
    async remove(id) {
      writeJson(HISTORY_KEY, load().filter((x) => x.id !== id));
    },
    async clear() {
      removeKey(HISTORY_KEY);
    },
  };
}

interface Row {
  id: string;
  original_query: string;
  compilation_status: 'success' | 'failed';
  error_count: number;
  optimization_count: number;
  duration_ms: number | null;
  created_at: string;
}

const fromRow = (r: Row): HistoryEntry => ({
  id: r.id,
  sql: r.original_query,
  status: r.compilation_status,
  errorCount: r.error_count,
  optimizationCount: r.optimization_count,
  durationMs: r.duration_ms ?? undefined,
  createdAt: r.created_at,
});

/** Supabase-backed store. Rows are protected by RLS (user_id = auth.uid()). Throws if the backend is unreachable. */
export async function createSupabaseStore(): Promise<HistoryStore> {
  const sb = await getSupabase();
  const { error } = await sb.from('query_history').select('id', { head: true, count: 'exact' });
  if (error) throw new Error(`query_history is not available: ${error.message}. Did you apply the migration?`);
  return {
    mode: 'supabase',
    async list() {
      const { data, error: e } = await sb.from('query_history').select('*').order('created_at', { ascending: false }).limit(500);
      if (e) throw new Error(e.message);
      return (data as Row[]).map(fromRow);
    },
    async add(entry) {
      const { data, error: e } = await sb
        .from('query_history')
        .insert({
          original_query: entry.sql,
          compilation_status: entry.status,
          error_count: entry.errorCount,
          optimization_count: entry.optimizationCount,
          duration_ms: entry.durationMs ?? null,
        })
        .select()
        .single();
      if (e) throw new Error(e.message);
      return fromRow(data as Row);
    },
    async remove(id) {
      const { error: e } = await sb.from('query_history').delete().eq('id', id);
      if (e) throw new Error(e.message);
    },
    async clear() {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) throw new Error('Not signed in');
      const { error: e } = await sb.from('query_history').delete().eq('user_id', u.user.id);
      if (e) throw new Error(e.message);
    },
  };
}
