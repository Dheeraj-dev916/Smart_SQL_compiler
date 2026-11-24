import { Worker } from 'node:worker_threads';
import { validateSelect } from './validate.mjs';

export const MAX_ROWS = 200;
export const TIMEOUT_MS = 2000;
const MAX_CONCURRENT_WORKERS = 8;
let activeWorkers = 0;

/** Validates and executes a query in a worker with a hard timeout and a row cap. */
export function executeSelect(input, { maxRows = MAX_ROWS, timeoutMs = TIMEOUT_MS } = {}) {
  const v = validateSelect(input);
  if (!v.ok) return Promise.resolve({ ok: false, status: 400, error: v.error });
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
    const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { sql: v.sql, maxRows } });
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
