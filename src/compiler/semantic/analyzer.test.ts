import { describe, expect, it } from 'vitest';
import { tokenize } from '../lexer';
import { parse } from '../parser';
import { analyze } from './analyzer';
import { ACADEMIC_SCHEMA } from './schema';

function sem(sql: string) {
  const p = parse(sql);
  if (!p.ok) throw new Error('parse failed: ' + p.diagnostics[0]?.message);
  return analyze(p.statement!, ACADEMIC_SCHEMA, tokenize(sql).tokens);
}
const msgs = (sql: string) => sem(sql).diagnostics.map((d) => d.message);

describe('semantic analyzer', () => {
  it('accepts valid table and column references', () => {
    const r = sem('SELECT name, department FROM students WHERE age > 20 ORDER BY name');
    expect(r.ok).toBe(true);
    expect(r.resolvedColumns.map((c) => c.column)).toEqual(expect.arrayContaining(['name', 'department', 'age']));
    expect(r.outputColumns).toEqual([
      { name: 'name', type: 'TEXT' },
      { name: 'department', type: 'TEXT' },
    ]);
  });

  it('reports unknown tables with a suggestion', () => {
    const m = msgs('SELECT name FROM student');
    expect(m[0]).toBe("Table 'student' does not exist in schema 'academic'. Did you mean 'students'?");
  });

  it('reports unknown columns with the documented message and a source location', () => {
    const r = sem('SELECT student_name FROM students');
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].message).toBe("Column 'student_name' does not exist in table 'students'. Did you mean 'name'?");
    expect(r.diagnostics[0].category).toBe('Semantic Error');
    expect(r.diagnostics[0].location).toMatchObject({ line: 1, column: 8, start: 7, end: 19 });
  });

  it('resolves table aliases and does not flag valid aliases', () => {
    const r = sem('SELECT s.name AS n, s.gpa FROM students s WHERE s.age > 20 ORDER BY n');
    expect(r.ok).toBe(true);
    expect(r.scope).toEqual([{ qualifier: 's', table: 'students' }]);
  });

  it('rejects the real table name when the table is aliased', () => {
    expect(msgs('SELECT students.name FROM students s')[0]).toMatch(/aliased as 's'/);
  });

  it('reports unknown qualifiers and unknown qualified columns', () => {
    expect(msgs('SELECT x.name FROM students s')[0]).toMatch(/Unknown table or alias 'x'/);
    expect(msgs('SELECT s.nme FROM students s')[0]).toBe("Column 'nme' does not exist in table 'students'. Did you mean 'name'?");
  });

  it('detects ambiguous unqualified columns', () => {
    const m = msgs('SELECT id FROM students s JOIN enrollments e ON s.id = e.student_id');
    expect(m.some((x) => x.includes("Column 'id' is ambiguous"))).toBe(true);
    // department exists in both students and courses
    expect(msgs('SELECT department FROM students s JOIN courses c ON s.department = c.department').some((x) => /ambiguous/.test(x))).toBe(true);
  });

  it('validates JOIN conditions', () => {
    expect(sem('SELECT s.name FROM students s INNER JOIN enrollments e ON s.id = e.student_id').ok).toBe(true);
    expect(msgs('SELECT s.name FROM students s INNER JOIN enrollments e ON s.id = c.id INNER JOIN courses c ON c.id = e.course_id')[0]).toMatch(/Invalid reference in JOIN condition/);
    expect(msgs('SELECT s.name FROM students s INNER JOIN enrollments e ON s.id = e.studentid')[0]).toMatch(/Did you mean 'student_id'/);
  });

  it('detects duplicate aliases', () => {
    expect(msgs('SELECT s.name FROM students s JOIN courses s ON s.id = s.id')[0]).toMatch(/Duplicate table name or alias 's'/);
  });

  it('validates GROUP BY references', () => {
    expect(sem('SELECT department, COUNT(*) FROM students GROUP BY department').ok).toBe(true);
    expect(msgs('SELECT name, COUNT(*) FROM students GROUP BY department')[0]).toMatch(/Invalid GROUP BY: column 'name'/);
    // grouping by the primary key makes the table's other columns valid (PostgreSQL functional dependency)
    expect(sem('SELECT id, name, COUNT(*) FROM students GROUP BY id').ok).toBe(true);
  });

  it('rejects aggregates in WHERE', () => {
    expect(msgs('SELECT name FROM students WHERE COUNT(*) > 1')[0]).toMatch(/not allowed in WHERE/);
  });

  it('detects reliably detectable type errors', () => {
    expect(msgs("SELECT name FROM students WHERE age = 'abc'")[0]).toMatch(/Type mismatch/);
    expect(msgs('SELECT SUM(name) FROM students')[0]).toMatch(/requires a numeric argument/);
    expect(msgs('SELECT name FROM students WHERE age LIKE 3')[0]).toMatch(/requires text operands/);
    // numeric-looking string literals coerce, so they are accepted
    expect(sem("SELECT name FROM students WHERE age = '20'").ok).toBe(true);
  });

  it('allows ORDER BY on select aliases and reports unknown ones', () => {
    expect(sem('SELECT department, COUNT(*) AS n FROM students GROUP BY department ORDER BY n DESC').ok).toBe(true);
    expect(sem('SELECT name FROM students ORDER BY missing').ok).toBe(false);
  });

  it('expands * and qualified *', () => {
    expect(sem('SELECT * FROM students').outputColumns).toHaveLength(5);
    expect(sem('SELECT s.* FROM students s JOIN enrollments e ON s.id = e.student_id').outputColumns).toHaveLength(5);
  });

  it('validates INSERT, UPDATE and DELETE', () => {
    expect(sem("INSERT INTO students (id, name) VALUES (1, 'A')").ok).toBe(true);
    expect(msgs("INSERT INTO students (id, nam) VALUES (1, 'A')")[0]).toMatch(/Did you mean 'name'/);
    // the parser itself rejects a column/value count mismatch, so it is reported as a syntax error
    const bad = parse("INSERT INTO students (id, name) VALUES (1)");
    expect(bad.ok).toBe(false);
    expect(bad.diagnostics[0].category).toBe('Syntax Error');
    expect(bad.diagnostics[0].message).toMatch(/column count doesn't match value count/);
    expect(msgs("INSERT INTO students (id, name) VALUES (1, NULL)")[0]).toMatch(/NOT NULL/);
    expect(sem("UPDATE students SET gpa = 3.5 WHERE id = 1").ok).toBe(true);
    expect(msgs("UPDATE students SET gpa = 'high' WHERE id = 1")[0]).toMatch(/cannot assign/);
    expect(sem('DELETE FROM students WHERE age < 18').ok).toBe(true);
    expect(msgs('DELETE FROM nothing')[0]).toMatch(/does not exist/);
  });
});
