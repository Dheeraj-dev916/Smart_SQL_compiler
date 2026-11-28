// Runs one validated SELECT against a fresh in-memory SQLite database (seeded demo data).
// A new database per request means nothing can persist between requests, even if validation failed.
import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL, SEED_SQL } from './seed.mjs';

const { sql, maxRows, dataset } = workerData;
try {
  const db = new DatabaseSync(':memory:');
  if (dataset && Array.isArray(dataset.tables)) {
    db.exec('BEGIN;');
    for (const t of dataset.tables) {
      const colDefs = t.columns
        .map((c) => `"${c.name}" ${c.type === 'DECIMAL' ? 'REAL' : c.type === 'BOOLEAN' ? 'INTEGER' : c.type}${c.primaryKey ? ' PRIMARY KEY' : ''}`)
        .join(', ');
      db.exec(`CREATE TABLE "${t.name}" (${colDefs});`);
      if (t.rows.length > 0) {
        const cols = t.columns.map((c) => `"${c.name}"`).join(', ');
        const placeholders = t.columns.map(() => '?').join(', ');
        const ins = db.prepare(`INSERT INTO "${t.name}" (${cols}) VALUES (${placeholders});`);
        for (const r of t.rows) ins.run(...r);
      }
    }
    db.exec('COMMIT;');
  } else {
    db.exec(SCHEMA_SQL);
    db.exec(SEED_SQL);
  }
  const stmt = db.prepare(sql);
  stmt.setReturnArrays(true);
  const columns = stmt.columns().map((c) => c.name);
  const rows = [];
  let truncated = false;
  const start = performance.now();
  for (const row of stmt.iterate()) {
    if (rows.length >= maxRows) { truncated = true; break; }
    rows.push(row);
  }
  parentPort.postMessage({ ok: true, columns, rows, truncated, durationMs: performance.now() - start });
} catch (e) {
  parentPort.postMessage({ ok: false, error: String(e && e.message ? e.message : e) });
}
