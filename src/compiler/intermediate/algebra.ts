import type { LogicalPlanNode, RelationalAlgebraExpression, TreeNode, SelectItem } from '@/types/compiler';
import { exprToSql, quoteIdent } from '../codegen/printer';

/**
 * Relational-algebra notation used by this project:
 *   ρ_{a}(R)          rename: table R used under alias a
 *   σ_{p}(E)          selection of rows satisfying predicate p
 *   π_{a, b}(E)       projection onto expressions a, b   (AS shows output aliases)
 *   δ(E)            duplicate elimination (SELECT DISTINCT)
 *   (E ⋈_{c} F)       inner join on condition c
 *   (E ⟕_{c} F)       left outer join on condition c
 *   γ_{g; f}(E)     grouping on g with aggregate functions f
 *   τ_{k}(E)          sort (order by) on keys k
 *   λ_{n}(E)        limit n rows (λ_{n, offset m} when an offset is present)
 */
export const ALGEBRA_NOTATION: { symbol: string; meaning: string; sql: string }[] = [
  { symbol: 'ρ_{a}(R)', meaning: 'Rename — table R is used under alias a', sql: 'FROM R AS a' },
  { symbol: 'σ_{p}(E)', meaning: 'Selection — keep rows where predicate p holds', sql: 'WHERE p / HAVING p' },
  { symbol: 'π_{a, b}(E)', meaning: 'Projection — keep the listed expressions', sql: 'SELECT a, b' },
  { symbol: 'δ(E)', meaning: 'Duplicate elimination', sql: 'SELECT DISTINCT' },
  { symbol: '(E ⋈_{c} F)', meaning: 'Inner join on condition c', sql: 'INNER JOIN … ON c' },
  { symbol: '(E ⟕_{c} F)', meaning: 'Left outer join on condition c', sql: 'LEFT JOIN … ON c' },
  { symbol: 'γ_{g; f}(E)', meaning: 'Grouping g with aggregate functions f', sql: 'GROUP BY g, COUNT/SUM/…' },
  { symbol: 'τ_{k}(E)', meaning: 'Sort on keys k', sql: 'ORDER BY k' },
  { symbol: 'λ_{n}(E)', meaning: 'Limit to n rows', sql: 'LIMIT n' },
];

const itemSql = (i: SelectItem) => exprToSql(i.expr) + (i.alias ? ` AS ${quoteIdent(i.alias)}` : '');

export function toAlgebra(node: LogicalPlanNode): string {
  switch (node.op) {
    case 'TableScan':
      return node.alias ? `ρ_{${node.alias}}(${node.table})` : node.table;
    case 'Selection':
      return `σ_{${exprToSql(node.predicate)}}(${toAlgebra(node.children[0])})`;
    case 'Projection': {
      const inner = `π_{${node.items.map(itemSql).join(', ')}}(${toAlgebra(node.children[0])})`;
      return node.distinct ? `δ(${inner})` : inner;
    }
    case 'Join': {
      const sym = node.joinType === 'LEFT' ? '⟕' : '⋈';
      const cond = node.condition ? `_{${exprToSql(node.condition)}}` : '';
      return `(${toAlgebra(node.children[0])} ${sym}${cond} ${toAlgebra(node.children[1])})`;
    }
    case 'Aggregation': {
      const g = node.groupBy.map((e) => exprToSql(e)).join(', ');
      const a = node.aggregates.map((e) => exprToSql(e)).join(', ');
      return `γ_{${[g, a].filter(Boolean).join('; ')}}(${toAlgebra(node.children[0])})`;
    }
    case 'Sort':
      return `τ_{${node.keys.map((k) => `${exprToSql(k.expr)} ${k.direction}`).join(', ')}}(${toAlgebra(node.children[0])})`;
    case 'Limit':
      return `λ_{${node.count}${node.offset !== undefined ? `, offset ${node.offset}` : ''}}(${toAlgebra(node.children[0])})`;
  }
}

/** Multi-line, indented version of toAlgebra for display: one operator per line, children indented below it. */
export function toAlgebraPretty(node: LogicalPlanNode, depth = 0): string {
  const pad = '  '.repeat(depth);
  const kids = (node.children as LogicalPlanNode[]);
  const sub = (i: number) => toAlgebraPretty(kids[i], depth + 1);
  switch (node.op) {
    case 'TableScan':
      return pad + (node.alias ? `ρ_{${node.alias}}(${node.table})` : node.table);
    case 'Selection':
      return `${pad}σ_{${exprToSql(node.predicate)}}(\n${sub(0)}\n${pad})`;
    case 'Projection': {
      const body = `${pad}π_{${node.items.map(itemSql).join(', ')}}(\n${sub(0)}\n${pad})`;
      return node.distinct ? `${pad}δ(\n${body.split('\n').map((l) => '  ' + l).join('\n')}\n${pad})` : body;
    }
    case 'Join': {
      const sym = node.joinType === 'LEFT' ? '⟕' : '⋈';
      const cond = node.condition ? `_{${exprToSql(node.condition)}}` : '';
      return `${pad}(\n${sub(0)}\n${pad}${sym}${cond}\n${sub(1)}\n${pad})`;
    }
    case 'Aggregation': {
      const g = node.groupBy.map((e) => exprToSql(e)).join(', ');
      const a = node.aggregates.map((e) => exprToSql(e)).join(', ');
      return `${pad}γ_{${[g, a].filter(Boolean).join('; ')}}(\n${sub(0)}\n${pad})`;
    }
    case 'Sort':
      return `${pad}τ_{${node.keys.map((k) => `${exprToSql(k.expr)} ${k.direction}`).join(', ')}}(\n${sub(0)}\n${pad})`;
    case 'Limit':
      return `${pad}λ_{${node.count}${node.offset !== undefined ? `, offset ${node.offset}` : ''}}(\n${sub(0)}\n${pad})`;
  }
}

export function toAlgebraExpression(node: LogicalPlanNode): RelationalAlgebraExpression {
  return { text: toAlgebra(node) };
}

/** Plain-JSON view of a plan (expressions rendered as SQL text) for the JSON panel and export. */
export function planToJson(node: LogicalPlanNode): unknown {
  const children = (node.children as LogicalPlanNode[]).map(planToJson);
  switch (node.op) {
    case 'TableScan':
      return { op: node.op, table: node.table, ...(node.alias ? { alias: node.alias } : {}) };
    case 'Selection':
      return { op: node.op, stage: node.stage, predicate: exprToSql(node.predicate), ...(node.pushedDown ? { pushedDown: true } : {}), children };
    case 'Projection':
      return { op: node.op, distinct: node.distinct, items: node.items.map(itemSql), ...(node.pushedDown ? { pushedDown: true } : {}), children };
    case 'Join':
      return { op: node.op, joinType: node.joinType, condition: node.condition ? exprToSql(node.condition) : null, children };
    case 'Aggregation':
      return { op: node.op, groupBy: node.groupBy.map((e) => exprToSql(e)), aggregates: node.aggregates.map((e) => exprToSql(e)), children };
    case 'Sort':
      return { op: node.op, keys: node.keys.map((k) => `${exprToSql(k.expr)} ${k.direction}`), children };
    case 'Limit':
      return { op: node.op, count: node.count, ...(node.offset !== undefined ? { offset: node.offset } : {}), children };
  }
}

/** Tree view (root = top operator) for the expandable plan panel. */
export function planToTree(node: LogicalPlanNode): TreeNode {
  const kids = (node.children as LogicalPlanNode[]).map(planToTree);
  switch (node.op) {
    case 'TableScan':
      return { label: 'TableScan', detail: node.alias ? `${node.table} AS ${node.alias}` : node.table, children: [] };
    case 'Selection':
      return { label: node.pushedDown ? 'Selection (pushed down)' : node.stage === 'having' ? 'Selection (HAVING)' : 'Selection', detail: exprToSql(node.predicate), children: kids };
    case 'Projection':
      return { label: node.pushedDown ? 'Projection (pushed down)' : node.distinct ? 'Projection (DISTINCT)' : 'Projection', detail: node.items.map(itemSql).join(', '), children: kids };
    case 'Join':
      return { label: `Join (${node.joinType})`, detail: node.condition ? exprToSql(node.condition) : undefined, children: kids };
    case 'Aggregation':
      return {
        label: 'Aggregation',
        detail: `group by [${node.groupBy.map((e) => exprToSql(e)).join(', ')}] compute [${node.aggregates.map((e) => exprToSql(e)).join(', ')}]`,
        children: kids,
      };
    case 'Sort':
      return { label: 'Sort', detail: node.keys.map((k) => `${exprToSql(k.expr)} ${k.direction}`).join(', '), children: kids };
    case 'Limit':
      return { label: 'Limit', detail: `${node.count}${node.offset !== undefined ? ` offset ${node.offset}` : ''}`, children: kids };
  }
}
