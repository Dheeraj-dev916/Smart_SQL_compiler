// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { validateSelect } from './validate.mjs';
import { executeSelect } from './execute.mjs';
import { createApp } from './index.mjs';

describe('sandbox validation (independent of the compiler)', () => {
  it('accepts a single SELECT', () => {
    expect(validateSelect('SELECT * FROM students;').ok).toBe(true);
    expect(validateSelect('  select name from students -- comment\n').ok).toBe(true);
    expect(validateSelect("SELECT 'DROP TABLE x; DELETE' AS s FROM students").ok).toBe(true); // inside a string literal
  });
  it.each([
    'DELETE FROM students',
    'UPDATE students SET age = 1',
    'INSERT INTO students VALUES (1)',
    'DROP TABLE students',
    'SELECT 1; DROP TABLE students',
    'SELECT 1; SELECT 2',
    'PRAGMA table_info(students)',
    "ATTACH DATABASE 'x.db' AS x",
    'WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM t) SELECT * FROM t',
    'SELECT * FROM sqlite_master',
    'SELECT load_extension("x")',
    'SELECT randomblob(1000000000)',
    "SELECT 'unterminated",
    '/* SELECT */ DELETE FROM students',
    '',
    'SELECT ' + 'a'.repeat(5000),
  ])('rejects %s', (sql) => {
    expect(validateSelect(sql).ok).toBe(false);
  });
  it('rejects non-strings', () => {
    expect(validateSelect(undefined).ok).toBe(false);
    expect(validateSelect({ sql: 'SELECT 1' }).ok).toBe(false);
  });
});

describe('sandbox execution', () => {
  it('returns real rows and column names', async () => {
    const r = await executeSelect('SELECT name, age FROM students WHERE id = 1');
    expect(r.ok).toBe(true);
    expect(r.columns).toEqual(['name', 'age']);
    expect(r.rows).toEqual([['Alice Khan', 21]]);
  });
  it('applies the row limit', async () => {
    const r = await executeSelect('SELECT * FROM enrollments', { maxRows: 5 });
    expect(r.rows).toHaveLength(5);
    expect(r.truncated).toBe(true);
  });
  it('enforces a time limit', async () => {
    const heavy = 'SELECT COUNT(*) FROM enrollments a, enrollments b, enrollments c, enrollments d, enrollments e, enrollments f, enrollments g, enrollments h, enrollments i, enrollments j';
    const r = await executeSelect(heavy, { timeoutMs: 100 });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(408);
  });
  it('reports SQL errors from the engine', async () => {
    const r = await executeSelect('SELECT nope FROM students');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no such column/);
  });
  it('never persists changes (each request has a fresh database)', async () => {
    expect((await executeSelect('DELETE FROM students')).ok).toBe(false);
    const r = await executeSelect('SELECT COUNT(*) FROM students');
    expect(r.rows).toEqual([[12]]);
  });
});

describe('HTTP API', () => {
  let server;
  let base;
  beforeAll(async () => {
    server = createApp().listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  it('GET /api/health', async () => {
    const j = await (await fetch(`${base}/api/health`)).json();
    expect(j.ok).toBe(true);
  });
  it('POST /api/execute runs a SELECT', async () => {
    const res = await fetch(`${base}/api/execute`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sql: 'SELECT COUNT(*) AS n FROM courses' }) });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.rows).toEqual([[7]]);
  });
  it('POST /api/execute blocks destructive statements with 400', async () => {
    const res = await fetch(`${base}/api/execute`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sql: 'DROP TABLE students' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });
});

describe('serving the built front-end', () => {
  it('starts with a dist folder and falls back to index.html for client-side routes (Express 5)', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssc-dist-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>spa</title>');
    const server = createApp(dir).listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const page = await fetch(`${base}/compiler`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('<title>spa</title>');
      const missingApi = await fetch(`${base}/api/does-not-exist`);
      expect(missingApi.status).toBe(404);
    } finally {
      await new Promise((r) => server.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
