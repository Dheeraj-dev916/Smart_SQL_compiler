import { describe, expect, it, vi } from 'vitest';
import { schemaToPrompt } from './aiClient';
import { verifySql, generateVerified } from './verify';
import { compareSuccess } from './equivalence';
import type { ExecutionSuccess } from '@/services/execution';

const ok = (rows: unknown[][], cols = ['name']): ExecutionSuccess => ({ ok: true, columns: cols, rows, truncated: false, maxRows: 200, durationMs: 1 });

describe('schemaToPrompt', () => {
  it('comes from the real catalog, including keys', () => {
    const t = schemaToPrompt();
    expect(t).toContain('students(id INTEGER PRIMARY KEY');
    expect(t).toContain('student_id INTEGER REFERENCES students(id)');
  });
});

describe('verifySql (the compiler is the referee)', () => {
  it('passes a good query and fails a bad one with real errors', () => {
    expect(verifySql('SELECT name FROM students;').ok).toBe(true);
    const bad = verifySql('SELECT nme FROM students;');
    expect(bad.ok).toBe(false);
    expect(bad.failedStage).toBe('semantic');
    expect(bad.errors[0]).toMatch(/nme/);
  });
  it('rejects unsupported syntax such as subqueries', () => {
    expect(verifySql('SELECT name FROM students WHERE id IN (SELECT student_id FROM enrollments);').ok).toBe(false);
  });
  it('can require a SELECT', () => {
    expect(verifySql("DELETE FROM students WHERE id = 1;", { selectOnly: true }).ok).toBe(false);
  });
});

describe('generateVerified', () => {
  it('retries with the compiler errors until the answer compiles', async () => {
    const ask = vi
      .fn()
      .mockResolvedValueOnce({ sql: 'SELECT nme FROM students;', explanation: 'x' })
      .mockResolvedValueOnce({ sql: 'SELECT name FROM students;', explanation: 'y' });
    const out = await generateVerified<{ sql: string; explanation: string }>('nl2sql', { question: 'names' }, { ask: ask as never });
    expect(out.attempts).toBe(2);
    expect(out.verification?.ok).toBe(true);
    // The second call carried the first answer and the real compiler error.
    expect(ask.mock.calls[1][1].feedback.previousSql).toBe('SELECT nme FROM students;');
    expect(ask.mock.calls[1][1].feedback.errors.join(' ')).toMatch(/nme/);
  });
  it('is honest when the AI never produces valid SQL', async () => {
    const ask = vi.fn().mockResolvedValue({ sql: 'SELECT nope FROM students;', explanation: '' });
    const out = await generateVerified<{ sql: string; explanation: string }>('fix', { sql: 'x' }, { ask: ask as never, maxAttempts: 2 });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(out.verification?.ok).toBe(false);
  });
  it('passes through an empty answer without compiling it', async () => {
    const ask = vi.fn().mockResolvedValue({ sql: '', explanation: 'Cannot be answered.' });
    const out = await generateVerified<{ sql: string; explanation: string }>('nl2sql', { question: 'weather' }, { ask: ask as never });
    expect(out.verification).toBeNull();
    expect(out.attempts).toBe(1);
  });
});

describe('compareSuccess', () => {
  it('matches the same rows in a different order', () => {
    expect(compareSuccess(ok([['a'], ['b']]), ok([['b'], ['a']])).status).toBe('match');
  });
  it('detects different rows, row counts and column counts', () => {
    expect(compareSuccess(ok([['a']]), ok([['b']])).status).toBe('different');
    expect(compareSuccess(ok([['a']]), ok([['a'], ['a']])).status).toBe('different');
    expect(compareSuccess(ok([['a']]), ok([['a', 1]], ['name', 'n'])).status).toBe('different');
  });
  it('refuses to compare truncated results', () => {
    expect(compareSuccess({ ...ok([['a']]), truncated: true }, ok([['a']])).status).toBe('unavailable');
  });
});
