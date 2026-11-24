import type { SchemaMeta, TableMeta } from '@/types/compiler';

/**
 * The single source of truth for schema metadata. Both the semantic analyzer
 * and the schema explorer UI read from here.
 */
export const ACADEMIC_SCHEMA: SchemaMeta = {
  name: 'academic',
  tables: [
    {
      name: 'students',
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true, nullable: false },
        { name: 'name', type: 'TEXT', nullable: false },
        { name: 'department', type: 'TEXT', nullable: true },
        { name: 'age', type: 'INTEGER', nullable: true },
        { name: 'gpa', type: 'DECIMAL', nullable: true },
      ],
    },
    {
      name: 'courses',
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true, nullable: false },
        { name: 'course_name', type: 'TEXT', nullable: false },
        { name: 'department', type: 'TEXT', nullable: true },
        { name: 'credits', type: 'INTEGER', nullable: false },
      ],
    },
    {
      name: 'enrollments',
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true, nullable: false },
        { name: 'student_id', type: 'INTEGER', nullable: false, references: { table: 'students', column: 'id' } },
        { name: 'course_id', type: 'INTEGER', nullable: false, references: { table: 'courses', column: 'id' } },
        { name: 'grade', type: 'TEXT', nullable: true },
      ],
    },
  ],
};

export const SCHEMAS: SchemaMeta[] = [ACADEMIC_SCHEMA];

export function findTable(schema: SchemaMeta, name: string): TableMeta | undefined {
  return schema.tables.find((t) => t.name.toLowerCase() === name.toLowerCase());
}

/** Levenshtein distance for "did you mean" suggestions. */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Suggest the closest candidate from real schema metadata.
 * Accepts substring relationships (student_name -> name) and small edit distances.
 */
export function suggestName(input: string, candidates: string[]): string | undefined {
  const lower = input.toLowerCase();
  let best: { name: string; score: number } | undefined;
  for (const c of candidates) {
    const cl = c.toLowerCase();
    let score = editDistance(lower, cl);
    if (lower.includes(cl) || cl.includes(lower)) score = Math.min(score, 1 + Math.abs(lower.length - cl.length) / 10);
    const limit = Math.max(2, Math.floor(Math.max(lower.length, cl.length) / 3));
    if (score <= limit && (!best || score < best.score)) best = { name: c, score };
  }
  return best?.name;
}
