import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { statementToSql } from '../codegen/printer';

describe('parser', () => {
  it('parses a simple SELECT', () => {
    const r = parse("SELECT name, department FROM students WHERE department = 'Computer Science' ORDER BY name;");
    expect(r.ok).toBe(true);
    expect(r.statement?.type).toBe('select');
    expect(r.tree?.label).toBe('SelectStatement');
  });

  it('parses DISTINCT, aliases, GROUP BY, HAVING, LIMIT', () => {
    const r = parse('SELECT DISTINCT department AS d, COUNT(*) AS c FROM students GROUP BY department HAVING COUNT(*) > 1 ORDER BY c DESC LIMIT 5');
    expect(r.ok).toBe(true);
    if (r.statement?.type !== 'select') throw new Error();
    expect(r.statement.distinct).toBe(true);
    expect(r.statement.groupBy).toHaveLength(1);
    expect(r.statement.having).toBeDefined();
    expect(r.statement.limit).toBe(5);
    expect(r.statement.orderBy[0].direction).toBe('DESC');
  });

  it('parses INNER and LEFT JOIN', () => {
    const r = parse('SELECT s.name FROM students s INNER JOIN enrollments e ON s.id = e.student_id LEFT JOIN courses c ON c.id = e.course_id');
    expect(r.ok).toBe(true);
    if (r.statement?.type !== 'select') throw new Error();
    expect(r.statement.from.map((f) => f.join)).toEqual([undefined, 'INNER JOIN', 'LEFT JOIN']);
  });

  it('parses aggregate functions', () => {
    const r = parse('SELECT AVG(gpa), MAX(age), MIN(age), SUM(age), COUNT(DISTINCT department) FROM students');
    expect(r.ok).toBe(true);
    if (r.statement?.type !== 'select') throw new Error();
    expect(r.statement.columns.every((c) => c.expr.kind === 'func' && c.expr.aggregate)).toBe(true);
  });

  it('parses AND / OR / NOT, IN, LIKE, BETWEEN, IS NULL', () => {
    const r = parse("SELECT name FROM students WHERE NOT (age < 18) AND (department IN ('CS','EE') OR name LIKE 'A%') AND gpa BETWEEN 2 AND 4 AND age IS NOT NULL");
    expect(r.ok).toBe(true);
  });

  it('parses INSERT, UPDATE, DELETE', () => {
    expect(parse("INSERT INTO students (id, name) VALUES (1, 'A')").statement?.type).toBe('insert');
    expect(parse('UPDATE students SET age = 21 WHERE id = 1').statement?.type).toBe('update');
    expect(parse('DELETE FROM students WHERE id = 1').statement?.type).toBe('delete');
  });

  it('reports syntax errors with a real location', () => {
    const r = parse('SELECT FROM students');
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].category).toBe('Syntax Error');
    expect(r.diagnostics[0].location?.line).toBe(1);
    expect(r.diagnostics[0].location?.column).toBeGreaterThan(1);
  });

  it('reports incomplete WHERE as end of input', () => {
    const r = parse('SELECT name FROM students WHERE');
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].message).toMatch(/end of input/);
  });

  it('rejects empty input', () => {
    expect(parse('   ').ok).toBe(false);
  });

  it('rejects unsupported syntax explicitly instead of accepting it', () => {
    for (const sql of [
      'SELECT name FROM students UNION SELECT name FROM students',
      'WITH x AS (SELECT 1) SELECT * FROM x',
      'SELECT name FROM students RIGHT JOIN enrollments e ON students.id = e.student_id',
      'SELECT name FROM students WHERE id IN (SELECT student_id FROM enrollments)',
    ]) {
      const r = parse(sql);
      expect(r.ok, sql).toBe(false);
      expect(r.diagnostics[0].message, sql).toMatch(/Unsupported syntax/);
    }
  });

  it('rejects multiple statements', () => {
    const r = parse('SELECT 1; SELECT 2;');
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].message).toMatch(/Unsupported syntax/);
  });

  it('round-trips through the SQL printer to an equivalent parse', () => {
    const sql = "SELECT DISTINCT s.name, COUNT(*) AS c FROM students AS s LEFT JOIN enrollments AS e ON s.id = e.student_id WHERE s.age > 20 AND (s.gpa >= 3 OR s.name LIKE 'A%') GROUP BY s.name HAVING COUNT(*) > 1 ORDER BY c DESC LIMIT 3;";
    const a = parse(sql);
    expect(a.ok).toBe(true);
    const printed = statementToSql(a.statement!);
    const b = parse(printed);
    expect(b.ok).toBe(true);
    expect(b.statement).toEqual(a.statement);
  });
});
