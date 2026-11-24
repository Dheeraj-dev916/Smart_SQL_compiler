import type { Expr, LogicalPlanNode, SelectStatement, TableRef } from '@/types/compiler';
import { exprToSql } from '../codegen/printer';

/** Collects aggregate function calls (deduplicated by SQL text) from an expression. */
export function collectAggregates(e: Expr, out: Expr[] = []): Expr[] {
  switch (e.kind) {
    case 'func':
      if (e.aggregate) {
        if (!out.some((o) => exprToSql(o) === exprToSql(e))) out.push(e);
      } else e.args.forEach((a) => collectAggregates(a, out));
      break;
    case 'binary':
      collectAggregates(e.left, out);
      collectAggregates(e.right, out);
      break;
    case 'unary':
      collectAggregates(e.operand, out);
      break;
    case 'between':
      collectAggregates(e.expr, out);
      collectAggregates(e.low, out);
      collectAggregates(e.high, out);
      break;
    case 'isnull':
      collectAggregates(e.expr, out);
      break;
    case 'list':
      e.items.forEach((i) => collectAggregates(i, out));
      break;
    default:
  }
  return out;
}

const scan = (t: TableRef): LogicalPlanNode => ({ op: 'TableScan', table: t.table, alias: t.alias, children: [] });

/**
 * Builds the logical plan from the (validated) statement, bottom-up in SQL's logical order:
 * TableScan → Join* → Selection(WHERE) → Aggregation → Selection(HAVING) → Projection → Sort → Limit.
 *
 * ORDER BY normally sorts the projected output. If a sort key is neither a select item nor an
 * output alias (e.g. `SELECT name ... ORDER BY age`) the Sort is placed *below* the Projection so
 * the key is still available.
 */
export function buildPlan(s: SelectStatement): LogicalPlanNode {
  let node: LogicalPlanNode = s.from.length > 0 ? scan(s.from[0]) : { op: 'TableScan', table: '(dual)', children: [] };
  for (let i = 1; i < s.from.length; i++) {
    const t = s.from[i];
    node = { op: 'Join', joinType: t.join === 'LEFT JOIN' ? 'LEFT' : 'INNER', condition: t.on, children: [node, scan(t)] };
  }
  if (s.where) node = { op: 'Selection', predicate: s.where, stage: 'where', children: [node] };

  const aggregates: Expr[] = [];
  s.columns.forEach((c) => collectAggregates(c.expr, aggregates));
  if (s.having) collectAggregates(s.having, aggregates);
  s.orderBy.forEach((o) => collectAggregates(o.expr, aggregates));
  if (s.groupBy.length > 0 || aggregates.length > 0) {
    node = { op: 'Aggregation', groupBy: s.groupBy, aggregates, children: [node] };
  }
  if (s.having) node = { op: 'Selection', predicate: s.having, stage: 'having', children: [node] };

  const outputSql = new Set(s.columns.map((c) => exprToSql(c.expr)));
  const outputAlias = new Set(s.columns.filter((c) => c.alias).map((c) => c.alias!.toLowerCase()));
  const sortOnOutput =
    s.orderBy.every(
      (o) =>
        o.expr.kind === 'number' ||
        outputSql.has(exprToSql(o.expr)) ||
        (o.expr.kind === 'column' && !o.expr.table && outputAlias.has(o.expr.name.toLowerCase())) ||
        s.columns.some((c) => c.expr.kind === 'star'),
    );

  if (s.orderBy.length > 0 && !sortOnOutput) node = { op: 'Sort', keys: s.orderBy, children: [node] };
  node = { op: 'Projection', items: s.columns, distinct: s.distinct, children: [node] };
  if (s.orderBy.length > 0 && sortOnOutput) node = { op: 'Sort', keys: s.orderBy, children: [node] };
  if (s.limit !== undefined) node = { op: 'Limit', count: s.limit, offset: s.offset, children: [node] };
  return node;
}

/** Visits every node of a plan, parent first. */
export function walkPlan(node: LogicalPlanNode, fn: (n: LogicalPlanNode) => void): void {
  fn(node);
  (node.children as LogicalPlanNode[]).forEach((c) => walkPlan(c, fn));
}
