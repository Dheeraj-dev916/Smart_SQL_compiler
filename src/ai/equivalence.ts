import { runInSandbox, type ExecutionSuccess } from '@/services/execution';

export type Comparison =
  | { status: 'match'; rows: number }
  | { status: 'different'; rowsA: number; rowsB: number; reason: string }
  | { status: 'unavailable'; reason: string };

const key = (rows: unknown[][]) => rows.map((r) => JSON.stringify(r)).sort();

/**
 * Runs both queries in the read-only SQLite sandbox and compares the rows (as a multiset, ignoring
 * order, because the two queries may not sort the same way). This is evidence on the demo data, not a
 * mathematical proof of equivalence.
 */
export async function compareInSandbox(sqlA: string, sqlB: string): Promise<Comparison> {
  const [a, b] = await Promise.all([runInSandbox(sqlA), runInSandbox(sqlB)]);
  if (!a.ok) return { status: 'unavailable', reason: a.unavailable ? a.error : `Original query could not run: ${a.error}` };
  if (!b.ok) return { status: 'unavailable', reason: b.unavailable ? b.error : `New query could not run: ${b.error}` };
  return compareSuccess(a, b);
}

export function compareSuccess(a: ExecutionSuccess, b: ExecutionSuccess): Comparison {
  if (a.truncated || b.truncated) return { status: 'unavailable', reason: `Results are longer than ${a.maxRows} rows, so they cannot be compared fully.` };
  if (a.columns.length !== b.columns.length) {
    return { status: 'different', rowsA: a.rows.length, rowsB: b.rows.length, reason: `Different number of columns (${a.columns.length} vs ${b.columns.length}).` };
  }
  const ka = key(a.rows);
  const kb = key(b.rows);
  if (ka.length !== kb.length) return { status: 'different', rowsA: ka.length, rowsB: kb.length, reason: `Different number of rows (${ka.length} vs ${kb.length}).` };
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return { status: 'different', rowsA: ka.length, rowsB: kb.length, reason: 'Same number of rows, but the values are different.' };
  }
  return { status: 'match', rows: ka.length };
}
