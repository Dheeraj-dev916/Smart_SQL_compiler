import type { Diagnostic, Expr, OptimizerOutput, SchemaMeta, SelectStatement } from '@/types/compiler';
import { makeDiagnostic } from '../diagnostics';
import { exprToSql, selectToSql } from '../codegen/printer';
import { buildPlan } from '../intermediate/builder';
import { toAlgebra } from '../intermediate/algebra';
import { someExpr, isFalse } from './exprUtils';
import {
  RULES,
  booleanSimplification,
  constantFolding,
  expressionSimplification,
  predicatePushdown,
  predicateReordering,
  projectionPushdown,
  redundantDistinct,
} from './rules';

export { RULES } from './rules';
export type { OptimizerRule } from './rules';

/** Warnings about the query itself (not rewrites). */
function warnings(original: SelectStatement, simplified: SelectStatement): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (simplified.where && isFalse(simplified.where)) {
    out.push(makeDiagnostic('Optimization Warning', 'The WHERE clause is always FALSE after simplification, so the query returns no rows.', { severity: 'warning', suggestion: 'Check the condition; it can never match.' }));
  }
  const conds: (Expr | undefined)[] = [original.where, original.having, ...original.from.map((t) => t.on)];
  for (const c of conds) {
    if (c && someExpr(c, (x) => x.kind === 'binary' && (x.op === '=' || x.op === '<>') && (x.left.kind === 'null' || x.right.kind === 'null'))) {
      out.push(
        makeDiagnostic('Optimization Warning', `A comparison with NULL using '=' or '<>' is never TRUE (it evaluates to NULL): ${exprToSql(c)}`, {
          severity: 'warning',
          suggestion: 'Use IS NULL or IS NOT NULL to test for NULL.',
        }),
      );
      break;
    }
  }
  if (original.limit !== undefined && original.orderBy.length === 0) {
    out.push(makeDiagnostic('Optimization Warning', 'LIMIT without ORDER BY returns an arbitrary subset of rows; the result is not deterministic.', { severity: 'info', suggestion: 'Add an ORDER BY to make the result repeatable.' }));
  }
  return out;
}

/**
 * Rule-based logical optimizer. Statement-level rules rewrite the SQL (each only when equivalence is
 * provable); plan-level rules transform the logical plan built from the rewritten statement.
 * Every rule is reported, applied or not, with an explanation or a skip reason.
 */
export function optimize(statement: SelectStatement, schema: SchemaMeta): OptimizerOutput {
  const originalPlan = buildPlan(statement);
  const originalAlgebra = toAlgebra(originalPlan);
  const results = [];

  let current = statement;
  for (const run of [constantFolding, booleanSimplification, expressionSimplification]) {
    const out = run(current);
    results.push(out.result);
    current = out.statement;
  }
  if (results[2].applied) {
    const boolPass2 = booleanSimplification(current);
    if (boolPass2.result.applied) {
      current = boolPass2.statement;
      results[1] = {
        ...results[1],
        applied: true,
        optimized: boolPass2.result.optimized,
        explanation: results[1].applied ? `${results[1].explanation} ${boolPass2.result.explanation}` : boolPass2.result.explanation,
        skipReason: undefined,
      };
    }
  }
  const pr = predicateReordering(current);
  results.push(pr.result);
  current = pr.statement;
  const d = redundantDistinct(current, schema);
  results.push(d.result);
  current = d.statement;

  let plan = buildPlan(current);
  const pp = predicatePushdown(current, plan, schema);
  results.push(pp.result);
  plan = pp.plan;
  const pj = projectionPushdown(current, plan, schema);
  results.push(pj.result);
  plan = pj.plan;

  const optimizedAlgebra = toAlgebra(plan);
  const statementChanged = selectToSql(current) !== selectToSql(statement);
  const planChanged = optimizedAlgebra !== originalAlgebra;
  return {
    results,
    originalPlan,
    optimizedPlan: plan,
    optimizedStatement: current,
    originalAlgebra,
    optimizedAlgebra,
    appliedCount: results.filter((r) => r.applied).length,
    statementChanged,
    planChanged,
    diagnostics: warnings(statement, current),
  };
}

export const OPTIMIZATION_RULES = RULES;
