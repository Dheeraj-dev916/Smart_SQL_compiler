import type { StageId } from '@/types/compiler';

export interface SqlExample {
  id: string;
  title: string;
  category: 'Basics' | 'Aggregation' | 'Joins' | 'Errors' | 'Optimization';
  sql: string;
  objective: string;
  /** Phases a learner should look at for this example. */
  phases: string[];
  /** What the compiler is expected to do. Verified by automated tests against the real compiler. */
  expect: {
    outcome: 'success' | 'failure';
    failedStage?: StageId;
    /** Optimizer rule ids that must be applied (and, for success cases, no others). */
    appliedRules?: string[];
    /** Optimizer rule ids that must be reported as skipped. */
    skippedRules?: string[];
  };
  /** Human-readable summary of the expected outcome. */
  outcomeNote: string;
}

export const EXAMPLES: SqlExample[] = [
  {
    id: 'basic-select',
    title: 'Basic SELECT',
    category: 'Basics',
    sql: 'SELECT * FROM students;',
    objective: 'See how a minimal query flows through every phase and becomes a TableScan plus a Projection.',
    phases: ['Lexical', 'Syntax', 'Semantic', 'IR'],
    expect: { outcome: 'success', appliedRules: [] },
    outcomeNote: 'Compiles successfully. No optimization applies, and the compiler says so.',
  },
  {
    id: 'where',
    title: 'SELECT with WHERE',
    category: 'Basics',
    sql: 'SELECT name, gpa\nFROM students\nWHERE gpa >= 3.5;',
    objective: 'Understand how WHERE becomes a Selection (σ) operator below the Projection (π).',
    phases: ['Syntax', 'IR'],
    expect: { outcome: 'success', appliedRules: [] },
    outcomeNote: 'Algebra: π_{name, gpa}(σ_{gpa >= 3.5}(students)).',
  },
  {
    id: 'order-by',
    title: 'SELECT with ORDER BY',
    category: 'Basics',
    sql: 'SELECT name, age\nFROM students\nORDER BY age DESC, name ASC;',
    objective: 'Learn that ORDER BY becomes a Sort (τ) operator above the Projection.',
    phases: ['Syntax', 'IR'],
    expect: { outcome: 'success', appliedRules: [] },
    outcomeNote: 'Algebra: τ_{age DESC, name ASC}(π_{name, age}(students)).',
  },
  {
    id: 'group-count',
    title: 'GROUP BY with COUNT',
    category: 'Aggregation',
    sql: 'SELECT department, COUNT(*) AS student_count\nFROM students\nGROUP BY department;',
    objective: 'See the Aggregation (γ) operator and how semantic analysis validates grouped columns.',
    phases: ['Semantic', 'IR'],
    expect: { outcome: 'success', appliedRules: [] },
    outcomeNote: 'Algebra contains γ_{department; COUNT(*)}.',
  },
  {
    id: 'group-having',
    title: 'GROUP BY with HAVING',
    category: 'Aggregation',
    sql: 'SELECT department, COUNT(*) AS n\nFROM students\nGROUP BY department\nHAVING COUNT(*) >= 2\nORDER BY n DESC;',
    objective: 'HAVING filters groups after aggregation, so its Selection sits above γ and is never pushed below it.',
    phases: ['Semantic', 'IR', 'Optimization'],
    expect: { outcome: 'success', appliedRules: [] },
    outcomeNote: 'Compiles; HAVING stays above the aggregation boundary.',
  },
  {
    id: 'inner-join',
    title: 'INNER JOIN',
    category: 'Joins',
    sql: 'SELECT s.name, c.course_name, e.grade\nFROM students s\nINNER JOIN enrollments e ON s.id = e.student_id\nINNER JOIN courses c ON c.id = e.course_id;',
    objective: 'Watch alias resolution and a left-deep tree of Join (⋈) operators.',
    phases: ['Semantic', 'IR', 'Optimization'],
    expect: { outcome: 'success', appliedRules: ['projection-pushdown'] },
    outcomeNote: 'Projection pushdown narrows each scan to the columns used.',
  },
  {
    id: 'left-join',
    title: 'LEFT JOIN (unsafe pushdown skipped)',
    category: 'Joins',
    sql: 'SELECT s.name, e.course_id\nFROM students s\nLEFT JOIN enrollments e ON s.id = e.student_id\nWHERE e.grade IS NULL;',
    objective: 'A WHERE filter on the nullable side of a LEFT JOIN must not be pushed below the join.',
    phases: ['Optimization'],
    expect: { outcome: 'success', appliedRules: ['projection-pushdown'], skippedRules: ['predicate-pushdown'] },
    outcomeNote: 'Predicate pushdown is skipped with an explanation; the result stays correct.',
  },
  {
    id: 'aggregates',
    title: 'Aggregate functions',
    category: 'Aggregation',
    sql: 'SELECT COUNT(*) AS total,\n       AVG(gpa) AS avg_gpa,\n       MAX(age) AS oldest,\n       MIN(age) AS youngest,\n       SUM(age) AS total_age\nFROM students;',
    objective: 'Check aggregate typing: AVG is DECIMAL, COUNT is INTEGER. A query with only aggregates returns one row.',
    phases: ['Semantic', 'IR'],
    expect: { outcome: 'success', appliedRules: [] },
    outcomeNote: 'Output column types are inferred in the Semantic tab.',
  },
  {
    id: 'unknown-column',
    title: 'Unknown column (semantic error)',
    category: 'Errors',
    sql: 'SELECT student_name\nFROM students;',
    objective: 'Semantic analysis checks names against the schema and suggests the closest real column.',
    phases: ['Semantic'],
    expect: { outcome: 'failure', failedStage: 'semantic' },
    outcomeNote: "Semantic Error: Column 'student_name' does not exist in table 'students'. Did you mean 'name'?",
  },
  {
    id: 'invalid-syntax',
    title: 'Invalid syntax (parser error)',
    category: 'Errors',
    sql: 'SELECT name\nFROM students\nWHERE age > ;',
    objective: 'The parser rejects an incomplete condition; later phases are skipped.',
    phases: ['Syntax'],
    expect: { outcome: 'failure', failedStage: 'syntax' },
    outcomeNote: 'Syntax Error reported with a source position; semantic, IR, optimization and codegen are skipped.',
  },
  {
    id: 'lexical-error',
    title: 'Unterminated string (lexical error)',
    category: 'Errors',
    sql: "SELECT name\nFROM students\nWHERE department = 'Computer Science;",
    objective: 'The lexer detects a string literal that is never closed.',
    phases: ['Lexical'],
    expect: { outcome: 'failure', failedStage: 'lexical' },
    outcomeNote: 'Lexical Error: unterminated string literal. The pipeline stops at the lexer.',
  },
  {
    id: 'constant-folding',
    title: 'Constant expression simplification',
    category: 'Optimization',
    sql: 'SELECT name\nFROM students\nWHERE 2 * 10 < age AND 1 = 1;',
    objective: 'Constant folding evaluates 2 * 10 and 1 = 1; boolean simplification then removes TRUE.',
    phases: ['Optimization', 'Code generation'],
    expect: { outcome: 'success', appliedRules: ['constant-folding', 'boolean-simplification'] },
    outcomeNote: 'Optimized SQL: WHERE 20 < age.',
  },
  {
    id: 'multi-predicate',
    title: 'Multiple predicates (reordering)',
    category: 'Optimization',
    sql: "SELECT name\nFROM students\nWHERE name LIKE 'A%' AND age > 20 AND department = 'Computer Science';",
    objective: 'Independent AND-ed predicates are reordered by a heuristic: equality, then range, then LIKE.',
    phases: ['Optimization', 'Code generation'],
    expect: { outcome: 'success', appliedRules: ['predicate-reordering'] },
    outcomeNote: 'Equality moves first. This is a heuristic: no speed-up is claimed.',
  },
  {
    id: 'pushdown',
    title: 'Predicate pushdown through joins',
    category: 'Optimization',
    sql: "SELECT s.name, c.course_name\nFROM students s\nINNER JOIN enrollments e ON s.id = e.student_id\nINNER JOIN courses c ON c.id = e.course_id\nWHERE s.department = 'Computer Science' AND c.credits > 2;",
    objective: 'Single-table filters move below the joins in the logical plan; the SQL text stays the same.',
    phases: ['IR', 'Optimization'],
    expect: { outcome: 'success', appliedRules: ['predicate-pushdown', 'projection-pushdown'] },
    outcomeNote: 'Compare the original and optimized algebra side by side.',
  },
  {
    id: 'redundant-distinct',
    title: 'Redundant DISTINCT',
    category: 'Optimization',
    sql: 'SELECT DISTINCT id, name\nFROM students;',
    objective: 'DISTINCT is dropped because the primary key already makes every row unique.',
    phases: ['Optimization', 'Code generation'],
    expect: { outcome: 'success', appliedRules: ['redundant-distinct'] },
    outcomeNote: 'Optimized SQL no longer contains DISTINCT.',
  },
  {
    id: 'optimizer-showcase',
    title: 'Optimizer showcase: 3 tables, 9 lines',
    category: 'Optimization',
    sql: "SELECT DISTINCT s.id, s.name, c.course_name\nFROM students s\nINNER JOIN enrollments e ON s.id = e.student_id\nINNER JOIN courses c ON c.id = e.course_id\nWHERE 1 = 1\n  AND s.age > 18 + 2\n  AND c.credits * 1 > 2\n  AND s.department IN ('Computer Science')\nORDER BY s.name;",
    objective: 'A longer query with several clean-up opportunities: 1 = 1, 18 + 2, credits * 1, a one-item IN list, filters on joined tables. Click Optimize Query, then Apply to editor.',
    phases: ['Optimization', 'Code generation'],
    expect: { outcome: 'success', appliedRules: ['constant-folding', 'boolean-simplification', 'expression-simplification', 'predicate-reordering', 'predicate-pushdown', 'projection-pushdown'] },
    outcomeNote: 'Optimized SQL: WHERE s.department = \'Computer Science\' AND s.age > 20 AND c.credits > 2.',
  },
  {
    id: 'optimizer-aggregate',
    title: 'Optimizer showcase: grouping and HAVING',
    category: 'Optimization',
    sql: "SELECT s.department, COUNT(*) AS total, AVG(s.gpa) AS avg_gpa\nFROM students s\nINNER JOIN enrollments e ON s.id = e.student_id\nWHERE 2 > 1\n  AND s.age >= 10 * 2\n  AND e.grade IN ('A')\nGROUP BY s.department\nHAVING COUNT(*) > 1 + 1\nORDER BY avg_gpa DESC;",
    objective: 'Constant arithmetic in WHERE and HAVING is folded, 2 > 1 disappears and a one-item IN becomes an equality.',
    phases: ['Optimization', 'Code generation'],
    expect: { outcome: 'success', appliedRules: ['constant-folding', 'boolean-simplification', 'expression-simplification', 'predicate-reordering', 'predicate-pushdown', 'projection-pushdown'] },
    outcomeNote: 'Optimized SQL: WHERE e.grade = \'A\' AND s.age >= 20 ... HAVING COUNT(*) > 2.',
  },
  {
    id: 'optimizer-cleanup',
    title: 'Optimizer showcase: NOT, DISTINCT and filters',
    category: 'Optimization',
    sql: "SELECT DISTINCT id, name, gpa\nFROM students\nWHERE NOT (gpa < 3.0)\n  AND age > 17 + 1\n  AND department = 'Computer Science'\n  AND 1 = 1\nORDER BY gpa DESC\nLIMIT 10;",
    objective: 'NOT (gpa < 3.0) becomes gpa >= 3.0, 17 + 1 is folded, 1 = 1 is dropped and DISTINCT is removed because id is the primary key.',
    phases: ['Optimization', 'Code generation'],
    expect: { outcome: 'success', appliedRules: ['constant-folding', 'boolean-simplification', 'predicate-reordering', 'redundant-distinct'] },
    outcomeNote: 'Optimized SQL has no DISTINCT and no 1 = 1.',
  },
];
