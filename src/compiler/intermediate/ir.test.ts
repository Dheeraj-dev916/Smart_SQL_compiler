import { describe, expect, it } from 'vitest';
import { parse } from '../parser';
import { generateIR, planToTree } from './index';
import type { LogicalPlanNode, SelectStatement } from '@/types/compiler';

function ir(sql: string) {
  const p = parse(sql);
  if (!p.ok) throw new Error(p.diagnostics[0]?.message);
  return generateIR(p.statement!);
}
const ops = (n: LogicalPlanNode): string[] => [n.op, ...(n.children as LogicalPlanNode[]).flatMap(ops)];

describe('intermediate representation', () => {
  it('produces the documented projection/selection example', () => {
    const r = ir('SELECT name FROM students WHERE age > 20');
    expect(r.algebra?.text).toBe('π_{name}(σ_{age > 20}(students))');
    expect(ops(r.plan!)).toEqual(['Projection', 'Selection', 'TableScan']);
  });

  it('builds joins left-deep with join type and condition', () => {
    const r = ir('SELECT s.name FROM students s INNER JOIN enrollments e ON s.id = e.student_id LEFT JOIN courses c ON c.id = e.course_id');
    expect(ops(r.plan!)).toEqual(['Projection', 'Join', 'Join', 'TableScan', 'TableScan', 'TableScan']);
    expect(r.algebra?.text).toContain('⟕_{c.id = e.course_id}');
    expect(r.algebra?.text).toContain('⋈_{s.id = e.student_id}');
    const top = (r.plan as Extract<LogicalPlanNode, { op: 'Projection' }>).children[0];
    expect(top.op === 'Join' && top.joinType).toBe('LEFT');
  });

  it('orders GROUP BY / HAVING / ORDER BY / LIMIT logically', () => {
    const r = ir('SELECT department, COUNT(*) AS n FROM students WHERE age > 18 GROUP BY department HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 3');
    expect(ops(r.plan!)).toEqual(['Limit', 'Sort', 'Projection', 'Selection', 'Aggregation', 'Selection', 'TableScan']);
    expect(r.algebra?.text).toBe('λ_{3}(τ_{n DESC}(π_{department, COUNT(*) AS n}(σ_{COUNT(*) > 1}(γ_{department; COUNT(*)}(σ_{age > 18}(students))))))');
  });

  it('adds Aggregation for aggregate queries without GROUP BY', () => {
    const r = ir('SELECT COUNT(*), AVG(gpa) FROM students');
    expect(ops(r.plan!)).toContain('Aggregation');
  });

  it('wraps DISTINCT as δ and puts Sort below Projection when keys are not projected', () => {
    expect(ir('SELECT DISTINCT department FROM students').algebra?.text).toBe('δ(π_{department}(students))');
    expect(ops(ir('SELECT name FROM students ORDER BY age').plan!)).toEqual(['Projection', 'Sort', 'TableScan']);
    expect(ops(ir('SELECT name FROM students ORDER BY name').plan!)).toEqual(['Sort', 'Projection', 'TableScan']);
  });

  it('renders limit with offset and a JSON/tree view derived from the plan', () => {
    const r = ir('SELECT name FROM students LIMIT 5 OFFSET 10');
    expect(r.algebra?.text).toBe('λ_{5, offset 10}(π_{name}(students))');
    expect(JSON.stringify(r.json)).toContain('"op":"Limit"');
    expect(planToTree(r.plan!).label).toBe('Limit');
  });

  it('is derived from the query: different queries give different plans', () => {
    expect(ir('SELECT name FROM students').algebra?.text).not.toBe(ir('SELECT gpa FROM students').algebra?.text);
  });

  it('does not plan DML statements', () => {
    expect(ir("DELETE FROM students WHERE id = 1").ok).toBe(false);
  });

  it('keeps the statement typed', () => {
    const p = parse('SELECT 1 FROM students');
    expect((p.statement as SelectStatement).type).toBe('select');
  });
});
