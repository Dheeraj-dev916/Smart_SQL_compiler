import { beforeEach, describe, expect, it } from 'vitest';
import { compile } from '@/compiler';
import { buildJsonReport, buildMarkdownReport } from '@/services/report';
import { createLocalStore, entryFromResult } from '@/services/history';

beforeEach(() => window.localStorage.clear());

describe('history store (local fallback)', () => {
  it('adds, lists newest first, removes and clears entries from real compilation results', async () => {
    const store = createLocalStore();
    const ok = compile('SELECT name FROM students WHERE age > 20;');
    const bad = compile('SELECT student_name FROM students;');
    const a = await store.add(entryFromResult(ok));
    const b = await store.add(entryFromResult(bad));
    const list = await store.list();
    expect(list.map((e) => e.id)).toEqual([b.id, a.id]);
    expect(list[0]).toMatchObject({ status: 'failed', sql: bad.source });
    expect(list[0].errorCount).toBeGreaterThan(0);
    expect(list[1]).toMatchObject({ status: 'success', errorCount: 0 });
    await store.remove(a.id);
    expect((await store.list()).map((e) => e.id)).toEqual([b.id]);
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it('records only measured durations and no credentials', async () => {
    const e = entryFromResult(compile('SELECT 1 + 2 FROM students;'));
    expect(typeof e.durationMs).toBe('number');
    expect(Object.keys(e).sort()).toEqual(['durationMs', 'errorCount', 'optimizationCount', 'sql', 'status']);
  });
});

describe('report export', () => {
  it('markdown report reflects the compiled query, not fixed data', () => {
    const md = buildMarkdownReport(compile('SELECT name FROM students WHERE age > 20;'));
    expect(md).toContain('SELECT name FROM students WHERE age > 20;');
    expect(md).toContain('SUCCESS');
    expect(md).toContain('## Tokens');
    expect(md).toContain('σ');
  });

  it('marks failed compilations and omits downstream sections', () => {
    const md = buildMarkdownReport(compile('SELECT student_name FROM students;'));
    expect(md).toContain('FAILED');
    expect(md).toContain("student_name");
    expect(md).not.toContain('## Generated SQL');
  });

  it('JSON report is valid JSON carrying the same source', () => {
    const r = compile('SELECT name FROM students;');
    const parsed = JSON.parse(buildJsonReport(r));
    expect(parsed.source).toBe(r.source);
    expect(parsed.success).toBe(true);
  });
});
