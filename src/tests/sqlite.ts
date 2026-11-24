// Test helper: runs SQL against an in-memory SQLite database seeded with the demo data.
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL, SEED_SQL } from '../../server/seed.mjs';

export function createDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA_SQL);
  db.exec(SEED_SQL);
  return db;
}

export function rows(db: ReturnType<typeof createDb>, sql: string): unknown[][] {
  const stmt = db.prepare(sql.replace(/;\s*$/, ''));
  stmt.setReturnArrays(true);
  return stmt.all() as unknown as unknown[][];
}

/** Rows as comparable strings; sorted unless the query has ORDER BY. */
export function normalized(db: ReturnType<typeof createDb>, sql: string): string[] {
  const out = rows(db, sql).map((r) => JSON.stringify(r));
  return /order\s+by/i.test(sql) ? out : out.sort();
}
