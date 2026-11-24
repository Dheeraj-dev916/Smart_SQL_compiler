// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compile } from '../index';
import { EXAMPLES } from '@/data/examples';
import { createDb, normalized } from '@/tests/sqlite';
import type { OptimizerOutput } from '@/types/compiler';

function opt(sql: string): OptimizerOutput {
  const r = compile(sql);
  if (!r.optimizer) throw new Error('optimizer did not run: ' + r.diagnostics.map((d) => d.message).join('; '));
  return r.optimizer;
}
const rule = (o: OptimizerOutput, id: string) => o.results.find((r) => r.ruleId === id)!;
const optimizedSql = (sql: string) => compile(sql).codegen!.optimizedSql;

describe('optimizer: applied transformations', () => {
  it('folds constants and removes TRUE predicates', () => {
    const o = opt('SELECT name FROM students WHERE 2 * 10 < age AND 1 = 1');
    expect(rule(o, 'constant-folding').applied).toBe(true);
    expect(rule(o, 'boolean-simplification').applied).toBe(true);
    expect(optimizedSql('SELECT name FROM students WHERE 2 * 10 < age AND 1 = 1')).toBe('SELECT name\nFROM students\nWHERE 20 < age;');
  });

  it('drops WHERE when it folds to TRUE', () => {
    expect(optimizedSql('SELECT name FROM students WHERE 1 = 1')).toBe('SELECT name\nFROM students;');
  });

  it('simplifies NOT over comparisons, double negation and duplicates', () => {
    expect(optimizedSql('SELECT name FROM students WHERE NOT (age < 20)')).toContain('WHERE age >= 20');
    expect(optimizedSql('SELECT name FROM students WHERE NOT NOT (age > 1)')).toContain('WHERE age > 1');
    expect(optimizedSql('SELECT name FROM students WHERE age > 1 AND age > 1')).toContain('WHERE age > 1;');
    expect(optimizedSql('SELECT name FROM students WHERE NOT (department IN (\'a\', \'b\'))')).toContain("department NOT IN ('a', 'b')");
  });

  it('simplifies arithmetic identities and single-element IN', () => {
    const o = opt("SELECT name FROM students WHERE age + 0 > 3 AND department IN ('CS')");
    expect(rule(o, 'expression-simplification').applied).toBe(true);
    expect(optimizedSql("SELECT name FROM students WHERE age + 0 > 3 AND department IN ('CS')")).toContain("WHERE department = 'CS' AND age > 3");
  });

  it('reorders independent predicates heuristically', () => {
    const sql = "SELECT name FROM students WHERE name LIKE 'A%' AND age > 20 AND department = 'CS'";
    const o = opt(sql);
    expect(rule(o, 'predicate-reordering').applied).toBe(true);
    expect(optimizedSql(sql)).toContain("WHERE department = 'CS' AND age > 20 AND name LIKE 'A%'");
  });

  it('removes redundant DISTINCT (primary key, GROUP BY columns, single-row aggregate)', () => {
    expect(rule(opt('SELECT DISTINCT id, name FROM students'), 'redundant-distinct').applied).toBe(true);
    expect(rule(opt('SELECT DISTINCT department, COUNT(*) FROM students GROUP BY department'), 'redundant-distinct').applied).toBe(true);
    expect(rule(opt('SELECT DISTINCT COUNT(*) FROM students'), 'redundant-distinct').applied).toBe(true);
  });

  it('pushes single-table predicates below inner joins and narrows scans (plan only)', () => {
    const sql = "SELECT s.name, c.course_name FROM students s INNER JOIN enrollments e ON s.id = e.student_id INNER JOIN courses c ON c.id = e.course_id WHERE s.department = 'CS' AND c.credits > 2";
    const o = opt(sql);
    expect(rule(o, 'predicate-pushdown').applied).toBe(true);
    expect(rule(o, 'predicate-pushdown').scope).toBe('Logical plan');
    expect(rule(o, 'projection-pushdown').applied).toBe(true);
    expect(o.optimizedAlgebra).toContain("σ_{s.department = 'CS'}(ρ_{s}(students))");
    expect(o.optimizedAlgebra).toContain('σ_{c.credits > 2}(ρ_{c}(courses))');
    // plan-only rules never change the SQL text
    expect(o.statementChanged).toBe(false);
    expect(compile(sql).codegen!.sqlChanged).toBe(false);
  });

  it('keeps a multi-table predicate above the join while pushing the rest', () => {
    const o = opt("SELECT s.name FROM students s INNER JOIN courses c ON s.department = c.department WHERE s.age > 20 AND s.gpa > c.credits");
    expect(o.optimizedAlgebra).toContain('σ_{s.age > 20}(ρ_{s}(students))');
    expect(o.optimizedAlgebra).toContain('σ_{s.gpa > c.credits}((');
  });
});

describe('optimizer: unsafe transformations are skipped', () => {
  it('does not push a predicate on the nullable side of a LEFT JOIN', () => {
    const o = opt('SELECT s.name FROM students s LEFT JOIN enrollments e ON s.id = e.student_id WHERE e.grade IS NULL');
    const r = rule(o, 'predicate-pushdown');
    expect(r.applied).toBe(false);
    expect(r.skipReason).toMatch(/nullable side of a LEFT JOIN/);
  });

  it('does push a predicate on the preserved side of a LEFT JOIN', () => {
    const o = opt("SELECT s.name FROM students s LEFT JOIN enrollments e ON s.id = e.student_id WHERE s.age > 20");
    expect(rule(o, 'predicate-pushdown').applied).toBe(true);
  });

  it('never moves HAVING across the aggregation boundary', () => {
    const o = opt('SELECT department, COUNT(*) AS n FROM students GROUP BY department HAVING COUNT(*) > 1');
    expect(rule(o, 'predicate-pushdown').applied).toBe(false);
    expect(o.optimizedAlgebra).toBe(o.originalAlgebra);
  });

  it('keeps NULL-sensitive expressions: a = a and x * 0', () => {
    const o1 = opt('SELECT name FROM students WHERE department = department');
    expect(rule(o1, 'boolean-simplification').applied).toBe(false);
    expect(rule(o1, 'boolean-simplification').skipReason).toMatch(/NULL = NULL is NULL/);
    const o2 = opt('SELECT name FROM students WHERE age * 0 = 0');
    expect(rule(o2, 'expression-simplification').applied).toBe(false);
    expect(rule(o2, 'expression-simplification').skipReason).toMatch(/NULL/);
    expect(optimizedSql('SELECT name FROM students WHERE age * 0 = 0')).toContain('age * 0 = 0');
  });

  it('does not fold expressions involving NULL, decimals or inexact division', () => {
    expect(optimizedSql('SELECT name FROM students WHERE age > 1 + NULL')).toContain('1 + NULL');
    expect(optimizedSql('SELECT name FROM students WHERE gpa > 0.1 + 0.2')).toContain('0.1 + 0.2');
    expect(optimizedSql('SELECT name FROM students WHERE age > 7 / 2')).toContain('7 / 2');
  });

  it('does not reorder or dedupe predicates containing function calls (volatile)', () => {
    const sql = 'SELECT name FROM students WHERE RANDOM() > 0 AND RANDOM() > 0 AND age = 3';
    const o = opt(sql);
    expect(rule(o, 'predicate-reordering').applied).toBe(false);
    expect(rule(o, 'predicate-reordering').skipReason).toMatch(/function call/);
    expect(optimizedSql(sql).match(/RANDOM\(\)/g)).toHaveLength(2);
  });

  it('keeps DISTINCT when uniqueness cannot be proven', () => {
    const o = opt('SELECT DISTINCT department FROM students');
    expect(rule(o, 'redundant-distinct').applied).toBe(false);
    expect(optimizedSql('SELECT DISTINCT department FROM students')).toContain('DISTINCT');
  });

  it('does not narrow scans for SELECT * and single-table queries', () => {
    expect(rule(opt('SELECT * FROM students s JOIN enrollments e ON s.id = e.student_id'), 'projection-pushdown').skipReason).toMatch(/uses \*/);
    expect(rule(opt('SELECT name FROM students WHERE age > 3'), 'projection-pushdown').skipReason).toMatch(/Single-table/);
  });

  it('never claims an optimization when nothing was applied', () => {
    const r = compile('SELECT name, department FROM students WHERE department = \'Computer Science\' ORDER BY name;');
    expect(r.optimizer!.appliedCount).toBe(0);
    expect(r.optimizationCount).toBe(0);
    expect(r.codegen!.sqlChanged).toBe(false);
    expect(r.codegen!.optimizedSql).toBe(r.codegen!.formattedSql);
    expect(r.optimizer!.results.every((x) => !x.applied && x.skipReason)).toBe(true);
    expect(r.codegen!.notes.join(' ')).toMatch(/No SQL rewrite was applied/);
  });

  it('reports every rule exactly once with required fields', () => {
    const o = opt('SELECT name FROM students WHERE age > 1');
    expect(o.results.map((r) => r.ruleId)).toEqual([
      'constant-folding', 'boolean-simplification', 'expression-simplification', 'predicate-reordering',
      'redundant-distinct', 'predicate-pushdown', 'projection-pushdown',
    ]);
    for (const r of o.results) {
      expect(r.rule).toBeTruthy();
      expect(typeof r.original).toBe('string');
      expect(typeof r.optimized).toBe('string');
      expect(r.applied ? r.explanation : r.skipReason).toBeTruthy();
    }
  });
});

describe('optimizer: warnings', () => {
  it('warns on = NULL, constant FALSE and LIMIT without ORDER BY', () => {
    const w = (sql: string) => compile(sql).diagnostics.filter((d) => d.category === 'Optimization Warning').map((d) => d.message);
    expect(w('SELECT name FROM students WHERE age = NULL')[0]).toMatch(/never TRUE/);
    expect(w('SELECT name FROM students WHERE 1 = 2')[0]).toMatch(/always FALSE/);
    expect(w('SELECT name FROM students LIMIT 3')[0]).toMatch(/LIMIT without ORDER BY/);
  });
});

// Semantic preservation: the original and optimized SQL must return identical rows on data that contains NULLs.
describe('optimizer: semantic equivalence on the sandbox database', () => {
  const db = createDb();
  const queries = [
    ...EXAMPLES.filter((e) => e.expect.outcome === 'success').map((e) => e.sql),
    'SELECT name FROM students WHERE 2 * 10 < age AND 1 = 1',
    'SELECT name FROM students WHERE NOT (age < 20)',
    'SELECT name FROM students WHERE NOT (gpa >= 3.5)',
    "SELECT name FROM students WHERE NOT (department IN ('Physics', 'Mathematics'))",
    "SELECT name FROM students WHERE NOT (name LIKE 'A%')",
    'SELECT name FROM students WHERE NOT (age BETWEEN 20 AND 22)',
    'SELECT name FROM students WHERE NOT (age IS NULL)',
    'SELECT name FROM students WHERE age > 20 AND age > 20',
    'SELECT name FROM students WHERE age > 20 OR 1 = 2',
    'SELECT name FROM students WHERE age > 20 OR 1 = 1',
    'SELECT name FROM students WHERE age > 20 AND 1 = 2',
    'SELECT name FROM students WHERE age + 0 > 20 AND gpa * 1 > 3',
    "SELECT name FROM students WHERE department IN ('Physics')",
    "SELECT name FROM students WHERE department NOT IN ('Physics')",
    'SELECT name FROM students WHERE department = department',
    'SELECT name FROM students WHERE age * 0 = 0',
    "SELECT name FROM students WHERE name LIKE '%a%' AND age > 20 AND department = 'Computer Science'",
    'SELECT DISTINCT id, name FROM students',
    'SELECT DISTINCT department, COUNT(*) AS n FROM students GROUP BY department',
    'SELECT DISTINCT COUNT(*) FROM students',
    "SELECT s.name, c.course_name FROM students s JOIN enrollments e ON s.id = e.student_id JOIN courses c ON c.id = e.course_id WHERE s.department = 'Computer Science' AND c.credits > 2",
    'SELECT s.name, e.grade FROM students s LEFT JOIN enrollments e ON s.id = e.student_id WHERE s.age > 20',
    'SELECT s.name, e.grade FROM students s LEFT JOIN enrollments e ON s.id = e.student_id WHERE e.grade IS NULL',
    'SELECT s.name, COUNT(e.id) AS n FROM students s LEFT JOIN enrollments e ON s.id = e.student_id GROUP BY s.name HAVING COUNT(e.id) >= 0 ORDER BY s.name',
    'SELECT department, AVG(gpa) AS g FROM students WHERE 1 = 1 AND age > 18 GROUP BY department ORDER BY department',
  ];

  it.each(queries.map((q) => [q.replace(/\s+/g, ' ')]))('%s', (sql) => {
    const r = compile(sql);
    expect(r.success).toBe(true);
    const original = normalized(db, sql);
    const optimized = normalized(db, r.codegen!.optimizedSql);
    const formatted = normalized(db, r.codegen!.formattedSql);
    expect(formatted).toEqual(original);
    expect(optimized).toEqual(original);
  });

  it('actually exercises rewrites (at least some queries changed)', () => {
    const changed = queries.filter((q) => compile(q).codegen!.sqlChanged).length;
    expect(changed).toBeGreaterThanOrEqual(15);
  });
});
