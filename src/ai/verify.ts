import { compile, formatDiagnostic } from '@/compiler';
import type { CompilationResult, StageId } from '@/types/compiler';
import { askAi, type AiTask } from './aiClient';

export interface Verification {
  ok: boolean;
  /** First stage that failed, when ok is false. */
  failedStage?: StageId;
  /** Human-readable error lines (these are fed back to the AI on a retry). */
  errors: string[];
  result: CompilationResult;
}

/** Runs the REAL compiler on a piece of SQL. This is the referee for every AI answer. */
export function verifySql(sql: string, opts: { selectOnly?: boolean } = {}): Verification {
  const result = compile(sql);
  const failed = result.stages.find((s) => s.status === 'failed');
  const errors = result.diagnostics.filter((d) => d.severity === 'error').map(formatDiagnostic);
  if (!failed && opts.selectOnly && result.parse?.statement && result.parse.statement.type !== 'select') {
    return { ok: false, failedStage: 'syntax', errors: ['Only a SELECT query is wanted here.'], result };
  }
  return { ok: result.success, failedStage: failed?.id, errors, result };
}

export interface VerifiedAnswer<T> {
  data: T;
  /** null when the AI returned no SQL (for example it said the request cannot be answered). */
  verification: Verification | null;
  /** How many AI calls were needed (1 = the first answer passed). */
  attempts: number;
}

/**
 * Asks the AI for SQL, checks it with the compiler, and on failure sends the compiler's errors back
 * for another try. Returns the last answer even if it never passed, with its failing verification,
 * so the UI can say so honestly.
 */
export async function generateVerified<T extends { sql: string }>(
  task: Extract<AiTask, 'nl2sql' | 'fix' | 'rewrite'>,
  input: Record<string, unknown>,
  opts: { maxAttempts?: number; selectOnly?: boolean; ask?: typeof askAi } = {},
): Promise<VerifiedAnswer<T>> {
  const ask = opts.ask ?? askAi;
  const max = opts.maxAttempts ?? 3;
  let feedback: { previousSql: string; errors: string[] } | undefined;
  let last: VerifiedAnswer<T> | undefined;
  for (let attempt = 1; attempt <= max; attempt++) {
    const data = await ask<T>(task, { ...input, ...(feedback ? { feedback } : {}) });
    if (!data.sql.trim()) return { data, verification: null, attempts: attempt };
    const verification = verifySql(data.sql, { selectOnly: opts.selectOnly ?? true });
    last = { data, verification, attempts: attempt };
    if (verification.ok) return last;
    feedback = { previousSql: data.sql, errors: verification.errors };
  }
  return last!;
}
