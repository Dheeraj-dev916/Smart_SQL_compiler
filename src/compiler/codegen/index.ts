import type { CodegenResult, OptimizerOutput, Statement } from '@/types/compiler';
import { statementToSql, selectToSql } from './printer';

export { statementToSql, selectToSql, exprToSql } from './printer';

/**
 * Generates SQL text.
 *  - formattedSql: canonical SQL printed from the parsed AST (formatting only, no rewrite).
 *  - optimizedSql: SQL printed from the optimizer's statement. Equal to formattedSql when no SQL rewrite applied.
 */
export function generateSql(source: string, statement: Statement, optimizer?: OptimizerOutput): CodegenResult {
  const formattedSql = statementToSql(statement);
  const notes: string[] = [];
  let optimizedSql = formattedSql;
  if (statement.type !== 'select') {
    notes.push(`${statement.type.toUpperCase()} statements are formatted but not optimized (the optimizer handles SELECT only).`);
  } else if (!optimizer) {
    notes.push('The optimizer was not run, so the generated SQL is the formatted original.');
  } else {
    optimizedSql = selectToSql(optimizer.optimizedStatement);
    const sqlRules = optimizer.results.filter((r) => r.applied && r.scope === 'SQL rewrite');
    const planRules = optimizer.results.filter((r) => r.applied && r.scope === 'Logical plan');
    if (sqlRules.length) notes.push(`SQL was rewritten by: ${sqlRules.map((r) => r.rule).join(', ')}.`);
    else notes.push('No SQL rewrite was applied; the optimized SQL is identical to the formatted SQL.');
    if (planRules.length) notes.push(`Logical-plan optimizations (${planRules.map((r) => r.rule).join(', ')}) change the plan, not the SQL text.`);
    notes.push('Whether a logical optimization makes the query faster depends on the database engine and data; execution time was not measured.');
  }
  return { originalSql: source, formattedSql, optimizedSql, sqlChanged: optimizedSql !== formattedSql, notes };
}
