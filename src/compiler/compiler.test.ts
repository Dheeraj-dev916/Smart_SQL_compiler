import { describe, expect, it } from 'vitest';
import { compile, compileWithProgress, runPipeline, STAGE_ORDER } from './index';
import { EXAMPLES } from '@/data/examples';

const statuses = (sql: string) => Object.fromEntries(compile(sql).stages.map((s) => [s.id, s.status]));

describe('pipeline integration', () => {
  it('compiles the default query successfully through all seven stages', () => {
    const r = compile("SELECT name, department\nFROM students\nWHERE department = 'Computer Science'\nORDER BY name;");
    expect(r.success).toBe(true);
    expect(r.stages.map((s) => s.id)).toEqual(STAGE_ORDER.map((s) => s.id));
    expect(r.stages.every((s) => s.status === 'success')).toBe(true);
    expect(r.diagnostics).toEqual([]);
    expect(r.ir?.algebra?.text).toBe("τ_{name ASC}(π_{name, department}(σ_{department = 'Computer Science'}(students)))");
    expect(r.codegen?.optimizedSql).toContain('ORDER BY name');
  });

  it('stops at the lexer on a lexical error and skips downstream stages', () => {
    const s = statuses("SELECT name FROM students WHERE department = 'oops");
    expect(s).toMatchObject({ source: 'success', lexical: 'failed', syntax: 'skipped', semantic: 'skipped', ir: 'skipped', optimization: 'skipped', codegen: 'skipped' });
    const r = compile("SELECT 'x FROM students");
    expect(r.success).toBe(false);
    expect(r.diagnostics[0].category).toBe('Lexical Error');
    expect(r.parse).toBeUndefined();
  });

  it('stops at the parser on a syntax error', () => {
    const r = compile('SELECT name FROM students WHERE age > ;');
    expect(r.success).toBe(false);
    expect(r.stages.find((s) => s.id === 'syntax')!.status).toBe('failed');
    expect(r.stages.find((s) => s.id === 'semantic')!.status).toBe('skipped');
    expect(r.diagnostics.every((d) => d.category === 'Syntax Error')).toBe(true);
    expect(r.diagnostics[0].location).toBeDefined();
  });

  it('stops at semantic analysis on a semantic error and never generates IR', () => {
    const r = compile('SELECT student_name FROM students');
    expect(r.success).toBe(false);
    expect(statuses('SELECT student_name FROM students')).toMatchObject({ syntax: 'success', semantic: 'failed', ir: 'skipped', optimization: 'skipped', codegen: 'skipped' });
    expect(r.ir).toBeUndefined();
    expect(r.optimizer).toBeUndefined();
    expect(r.codegen).toBeUndefined();
  });

  it('reports unsupported syntax instead of accepting it', () => {
    for (const sql of ['SELECT name FROM students UNION SELECT name FROM students', 'SELECT name FROM (SELECT name FROM students) t', 'SELECT CASE WHEN age > 1 THEN 1 END FROM students', 'SELECT name FROM students RIGHT JOIN courses ON 1 = 1', 'CREATE TABLE x (a INT)']) {
      const r = compile(sql);
      expect(r.success, sql).toBe(false);
      expect(r.diagnostics[0].message, sql).toMatch(/Unsupported syntax|Unexpected|Unrecognized/);
    }
  });

  it('handles empty input', () => {
    const r = compile('   ');
    expect(r.success).toBe(false);
    expect(r.stages[0].status).toBe('failed');
  });

  it('compiles DML: formatted only, IR/optimizer skipped, not failed', () => {
    const r = compile("INSERT INTO students (id, name) VALUES (100, 'Zed');");
    expect(r.success).toBe(true);
    expect(statuses("INSERT INTO students (id, name) VALUES (100, 'Zed');")).toMatchObject({ semantic: 'success', ir: 'skipped', optimization: 'skipped', codegen: 'success' });
    expect(r.codegen?.optimizedSql).toBe(r.codegen?.formattedSql);
    expect(compile("UPDATE students SET gpa = 3.9 WHERE id = 1").success).toBe(true);
    expect(compile('DELETE FROM students WHERE id = 1').success).toBe(true);
  });

  it('measures durations only for stages that ran', () => {
    const r = compile('SELECT student_name FROM students');
    for (const s of r.stages) {
      if (s.status === 'skipped') expect(s.durationMs).toBeUndefined();
      else expect(s.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(r.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('yields a running snapshot before each executed stage', () => {
    const gen = runPipeline('SELECT name FROM students');
    const seen: string[] = [];
    for (;;) {
      const n = gen.next();
      if (n.done) break;
      seen.push(n.value.find((s) => s.status === 'running')!.id);
    }
    expect(seen).toEqual(STAGE_ORDER.map((s) => s.id));
  });

  it('reports progress asynchronously', async () => {
    const updates: string[] = [];
    const r = await compileWithProgress('SELECT name FROM students', { onStages: (s) => updates.push(s.map((x) => x.status[0]).join('')) });
    expect(r.success).toBe(true);
    expect(updates[0]).toBe('rpppppp');
    expect(updates.at(-1)).toBe('sssssss');
  });

  it('can run without the optimizer', () => {
    const r = compile('SELECT name FROM students WHERE 1 = 1', { optimize: false });
    expect(r.success).toBe(true);
    expect(r.stages.find((s) => s.id === 'optimization')!.status).toBe('skipped');
    expect(r.codegen?.sqlChanged).toBe(false);
  });

  it('keeps diagnostics categorized', () => {
    expect(compile('SELECT # FROM students').diagnostics[0].category).toBe('Lexical Error');
    expect(compile('SELECT FROM students WHERE').diagnostics[0].category).toBe('Syntax Error');
    expect(compile('SELECT nope FROM students').diagnostics[0].category).toBe('Semantic Error');
    expect(compile('SELECT name FROM students LIMIT 1').diagnostics[0].category).toBe('Optimization Warning');
  });
});

describe('example library is verified against the real compiler', () => {
  it('has the 12 required example types', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length);
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s behaves as documented', (_id, ex) => {
    const r = compile(ex.sql);
    if (ex.expect.outcome === 'success') {
      expect(r.success, r.diagnostics.map((d) => d.message).join('; ')).toBe(true);
      const applied = r.optimizer!.results.filter((x) => x.applied).map((x) => x.ruleId).sort();
      expect(applied).toEqual([...(ex.expect.appliedRules ?? [])].sort());
      for (const id of ex.expect.skippedRules ?? []) {
        const rule = r.optimizer!.results.find((x) => x.ruleId === id)!;
        expect(rule.applied).toBe(false);
        expect(rule.skipReason).toBeTruthy();
      }
    } else {
      expect(r.success).toBe(false);
      expect(r.stages.find((s) => s.id === ex.expect.failedStage)!.status).toBe('failed');
    }
  });

  it('unknown-column example produces the documented message', () => {
    const r = compile(EXAMPLES.find((e) => e.id === 'unknown-column')!.sql);
    expect(r.diagnostics[0].message).toBe("Column 'student_name' does not exist in table 'students'. Did you mean 'name'?");
  });
});
