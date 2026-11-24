import type { SchemaMeta } from '@/types/compiler';
import { ACADEMIC_SCHEMA } from '@/compiler/semantic/schema';

/** What the server's /api/ai can do. The server builds the prompts; the browser only sends small inputs. */
export type AiTask = 'nl2sql' | 'fix' | 'explain-error' | 'explain-query' | 'why-not' | 'rewrite' | 'practice' | 'tutor' | 'quiz';

export interface AiStatus {
  /** The server answered the status request. */
  reachable: boolean;
  /** An API key is set on the server. */
  configured: boolean;
  provider?: string | null;
  model?: string | null;
}

export class AiError extends Error {
  unconfigured: boolean;
  unavailable: boolean;
  constructor(message: string, flags: { unconfigured?: boolean; unavailable?: boolean } = {}) {
    super(message);
    this.name = 'AiError';
    this.unconfigured = Boolean(flags.unconfigured);
    this.unavailable = Boolean(flags.unavailable);
  }
}

/** Compact schema text sent with every request. Comes from the same catalog the analyzer uses. */
export function schemaToPrompt(schema: SchemaMeta = ACADEMIC_SCHEMA): string {
  return schema.tables
    .map((t) => {
      const cols = t.columns.map((c) => `${c.name} ${c.type}${c.primaryKey ? ' PRIMARY KEY' : ''}${c.references ? ` REFERENCES ${c.references.table}(${c.references.column})` : ''}`);
      return `${t.name}(${cols.join(', ')})`;
    })
    .join('\n');
}

export async function getAiStatus(): Promise<AiStatus> {
  try {
    const res = await fetch('/api/ai/status');
    if (!(res.headers.get('content-type') ?? '').includes('json')) return { reachable: false, configured: false };
    const j = (await res.json()) as { configured: boolean; provider: string | null; model: string | null };
    return { reachable: true, configured: Boolean(j.configured), provider: j.provider, model: j.model };
  } catch {
    return { reachable: false, configured: false };
  }
}

/** Calls the server. Throws AiError with a message that is safe to show to the student. */
export async function askAi<T>(task: AiTask, input: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task, input: { schema: schemaToPrompt(), ...input } }),
    });
  } catch {
    throw new AiError('Could not reach the server. Start it with "npm run server".', { unavailable: true });
  }
  if (!(res.headers.get('content-type') ?? '').includes('json')) {
    throw new AiError('The AI server is not running. Start it with "npm run server".', { unavailable: true });
  }
  let body: { ok: boolean; data?: T; error?: string; unconfigured?: boolean };
  try {
    body = (await res.json()) as { ok: boolean; data?: T; error?: string; unconfigured?: boolean };
  } catch {
    throw new AiError('The AI server returned an invalid JSON response.');
  }
  if (!body.ok || body.data === undefined) {
    throw new AiError(body.error ?? 'The AI request failed.', { unconfigured: body.unconfigured });
  }
  return body.data;
}

export interface AiTestAttempt { endpoint: string; model: string; status: number; reason: string }
export interface AiTestResult {
  /** The server answered the test request. */
  reachable: boolean;
  /** A real answer came back from the AI provider. */
  works: boolean;
  provider?: string | null;
  model?: string | null;
  error?: string;
  attempts: AiTestAttempt[];
}

/** Sends one tiny real request through the server and reports every attempt (no key is ever shown). */
export async function testAiConnection(): Promise<AiTestResult> {
  try {
    const res = await fetch('/api/ai/test', { method: 'POST' });
    if (!(res.headers.get('content-type') ?? '').includes('json')) {
      return { reachable: false, works: false, error: 'The server is not running or is an old version. Restart it with "npm run server" after updating server/ai.mjs.', attempts: [] };
    }
    const j = (await res.json()) as { ok: boolean; works?: boolean; provider?: string; model?: string; error?: string; attempts?: AiTestAttempt[] };
    return { reachable: true, works: Boolean(j.works), provider: j.provider, model: j.model, error: j.error, attempts: j.attempts ?? [] };
  } catch {
    return { reachable: false, works: false, error: 'Could not reach the server. Start it with "npm run server".', attempts: [] };
  }
}
