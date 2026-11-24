export interface ExecutionSuccess {
  ok: true;
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
  maxRows: number;
  durationMs: number;
}
export interface ExecutionFailure {
  ok: false;
  error: string;
  /** true when the sandbox API could not be reached at all */
  unavailable?: boolean;
}
export type ExecutionResult = ExecutionSuccess | ExecutionFailure;

/** Sends the SQL to the server-side sandbox. The server validates it again; nothing runs in the browser. */
export async function runInSandbox(sql: string): Promise<ExecutionResult> {
  try {
    const res = await fetch('/api/execute', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sql }) });
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) {
      return { ok: false, unavailable: true, error: 'The sandbox API is not running. Start it with "npm run server" (see README).' };
    }
    const body = (await res.json()) as Partial<ExecutionResult> & { error?: string };
    if (typeof body.ok !== 'boolean') {
      return { ok: false, error: body.error ?? `Sandbox returned HTTP ${res.status}` };
    }
    if (!res.ok && body.ok) {
      return { ok: false, error: body.error ?? `Sandbox returned HTTP ${res.status}` };
    }
    return body as ExecutionResult;
  } catch {
    return { ok: false, unavailable: true, error: 'Could not reach the sandbox API. Start it with "npm run server" (see README).' };
  }
}

export async function checkSandbox(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return { ok: false, detail: 'Not running' };
    const j = (await res.json()) as { sandbox?: string; maxRows?: number; timeoutMs?: number };
    if (!j.sandbox) return { ok: false, detail: 'Unexpected health response' };
    return { ok: true, detail: `${j.sandbox}, max ${j.maxRows} rows, ${j.timeoutMs} ms timeout` };
  } catch {
    return { ok: false, detail: 'Not reachable' };
  }
}
