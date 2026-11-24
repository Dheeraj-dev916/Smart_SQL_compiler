import type { IRResult, Statement } from '@/types/compiler';
import { makeDiagnostic } from '../diagnostics';
import { buildPlan } from './builder';
import { planToJson, toAlgebraExpression } from './algebra';

export { buildPlan, walkPlan, collectAggregates } from './builder';
export { toAlgebra, toAlgebraPretty, toAlgebraExpression, planToJson, planToTree, ALGEBRA_NOTATION } from './algebra';

/** Generates the intermediate representation from a semantically valid statement. */
export function generateIR(stmt: Statement): IRResult {
  if (stmt.type !== 'select') {
    return {
      ok: false,
      notes: [`Logical-plan generation supports SELECT only; ${stmt.type.toUpperCase()} statements are parsed and validated but not planned.`],
      diagnostics: [],
    };
  }
  try {
    const plan = buildPlan(stmt);
    const notes: string[] = ['Plan built bottom-up: TableScan → Join → Selection(WHERE) → Aggregation → Selection(HAVING) → Projection → Sort → Limit.'];
    return { ok: true, plan, algebra: toAlgebraExpression(plan), json: planToJson(plan), notes, diagnostics: [] };
  } catch (e) {
    return {
      ok: false,
      notes: [],
      diagnostics: [makeDiagnostic('Semantic Error', `Could not build a logical plan: ${(e as Error).message}`)],
    };
  }
}
