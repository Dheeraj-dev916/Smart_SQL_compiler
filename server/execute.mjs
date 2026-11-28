import { Worker } from 'node:worker_threads';
import { validateSelect } from './validate.mjs';

export const MAX_ROWS = 200;
export const TIMEOUT_MS = 2000;
const MAX_CONCURRENT_WORKERS = 8;
let activeWorkers = 0;

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const ALLOWED_TYPES = new Set(['INTEGER', 'DECIMAL', 'TEXT', 'BOOLEAN']);

function validateDataset(dataset) {
  if (dataset === undefined || dataset === null) return { ok: true, dataset: null };
  if (typeof dataset !== 'object' || !Array.isArray(dataset.tables) || dataset.tables.length === 0 || dataset.tables.length > 50) {
    return { ok: false, error: 'Custom dataset must contain between 1 and 50 tables' };
  }
  let totalRows = 0;
  const cleanTables = [];
  for (const t of dataset.tables) {
    if (!t || typeof t.name !== 'string' || !IDENT_RE.test(t.name)) {
      return { ok: false, error: `Invalid table name '${String(t?.name ?? '')}'` };
    }
    if (!Array.isArray(t.columns) || t.columns.length === 0 || t.columns.length > 100) {
      return { ok: false, error: `Table '${t.name}' must have between 1 and 100 columns` };
    }
    const cleanCols = [];
    for (const c of t.columns) {
      if (!c || typeof c.name !== 'string' || !IDENT_RE.test(c.name)) {
        return { ok: false, error: `Invalid column name '${String(c?.name ?? '')}' in table '${t.name}'` };
      }
      const type = String(c.type ?? 'TEXT').toUpperCase();
      if (!ALLOWED_TYPES.has(type)) {
        return { ok: false, error: `Unsupported column type '${type}' in table '${t.name}'` };
      }
      cleanCols.push({ name: c.name, type, nullable: Boolean(c.nullable), primaryKey: Boolean(c.primaryKey) });
    }
    const rows = Array.isArray(t.rows) ? t.rows : [];
    totalRows += rows.length;
    if (totalRows > 25000) {
      return { ok: false, error: 'Custom dataset exceeds the 25,000 total row limit' };
    }
    const cleanRows = rows.map((r) =>
      cleanCols.map((_, idx) => {
        const v = Array.isArray(r) ? r[idx] : null;
        if (v === undefined || v === null) return null;
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (typeof v === 'number' || typeof v === 'string') return v;
        return String(v);
      }),
    );
    cleanTables.push({ name: t.name, columns: cleanCols, rows: cleanRows });
  }
  return { ok: true, dataset: { tables: cleanTables } };
}

/** Validates and executes a query in a worker with a hard timeout and a row cap. */
export function executeSelect(input, { maxRows = MAX_ROWS, timeoutMs = TIMEOUT_MS, dataset } = {}) {
  const v = validateSelect(input);
  if (!v.ok) return Promise.resolve({ ok: false, status: 400, error: v.error });
  const dv = validateDataset(dataset);
  if (!dv.ok) return Promise.resolve({ ok: false, status: 400, error: dv.error });
  if (activeWorkers >= MAX_CONCURRENT_WORKERS) {
    return Promise.resolve({ ok: false, status: 503, error: 'Sandbox is busy; please try again in a moment.' });
  }
  activeWorkers++;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (out) => {
      if (settled) return;
      settled = true;
      activeWorkers = Math.max(0, activeWorkers - 1);
      clearTimeout(timer);
      resolve(out);
    };
    const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { sql: v.sql, maxRows, dataset: dv.dataset } });
    const timer = setTimeout(() => {
      worker.terminate();
      finish({ ok: false, status: 408, error: `Execution exceeded the ${timeoutMs} ms time limit and was stopped` });
    }, timeoutMs);
    worker.once('message', (m) => {
      worker.terminate();
      finish(m.ok ? { ok: true, status: 200, ...m, maxRows } : { ok: false, status: 422, error: m.error });
    });
    worker.once('error', (e) => {
      finish({ ok: false, status: 500, error: `Sandbox error: ${e.message}` });
    });
    worker.once('exit', (code) => {
      if (!settled) {
        finish({ ok: false, status: 500, error: `Sandbox worker exited unexpectedly (code ${code})` });
      }
    });
  });
}
