import type { Expr, LogicalPlanNode, OptimizationResult, SchemaMeta, SelectItem, SelectStatement, TableMeta } from '@/types/compiler';
import { exprToSql, selectToSql } from '../codegen/printer';
import { findTable } from '../semantic/schema';
import { buildPlan } from '../intermediate/builder';
import { toAlgebra } from '../intermediate/algebra';
import {
  FALSE,
  TRUE,
  andAll,
  clauseText,
  conjuncts,
  hasDivision,
  hasFunctionCall,
  isFalse,
  isTrue,
  mapConditions,
  mapExpr,
  sameExpr,
  someExpr,
} from './exprUtils';

export interface OptimizerRule {
  id: string;
  name: string;
  description: string;
}

export const RULES: OptimizerRule[] = [
  { id: 'constant-folding', name: 'Constant folding', description: 'Evaluates integer arithmetic and literal comparisons in WHERE / HAVING / ON at compile time.' },
  { id: 'boolean-simplification', name: 'Boolean simplification', description: 'Applies identities that hold under SQL three-valued logic (TRUE AND x → x, NOT (a < b) → a >= b, duplicate predicates, …).' },
  { id: 'expression-simplification', name: 'Expression simplification', description: 'Removes arithmetic identities (x + 0, x * 1) and rewrites single-element IN lists to equality.' },
  { id: 'predicate-reordering', name: 'Predicate reordering', description: 'Orders independent AND-ed predicates so cheap, selective-looking tests (equality) come first. Heuristic only.' },
  { id: 'redundant-distinct', name: 'Redundant DISTINCT elimination', description: 'Drops DISTINCT when uniqueness is guaranteed by a primary key, GROUP BY columns or a single-row aggregate.' },
  { id: 'predicate-pushdown', name: 'Predicate pushdown', description: 'Moves single-table WHERE conjuncts below joins, to the table scan they belong to (logical plan only).' },
  { id: 'projection-pushdown', name: 'Projection pushdown', description: 'Limits each table scan in a join to the columns the query actually uses (logical plan only).' },
];

const ruleMeta = (id: string) => RULES.find((r) => r.id === id)!;

function result(id: string, scope: OptimizationResult['scope'], applied: boolean, original: string, optimized: string, explanation: string, skipReason?: string): OptimizationResult {
  const m = ruleMeta(id);
  return { rule: m.name, ruleId: id, scope, applied, original, optimized, explanation, skipReason: applied ? undefined : skipReason };
}

export interface StatementRuleOutput {
  statement: SelectStatement;
  result: OptimizationResult;
}

const sqlOf = (s: SelectStatement) => selectToSql(s, false);

// ───────────────────────── 1. Constant folding ─────────────────────────
const isIntLiteral = (e: Expr): e is Extract<Expr, { kind: 'number' }> => e.kind === 'number' && Number.isInteger(e.value) && /^-?\d+$/.test(e.raw);
const num = (v: number): Expr => ({ kind: 'number', value: v, raw: String(v) });

function foldNode(e: Expr): Expr {
  if (e.kind === 'unary' && e.op === '-' && isIntLiteral(e.operand)) return num(-e.operand.value);
  if (e.kind !== 'binary') return e;
  const { left: l, right: r, op } = e;
  if (isIntLiteral(l) && isIntLiteral(r)) {
    const a = l.value;
    const b = r.value;
    let v: number | undefined;
    switch (op) {
      case '+': v = a + b; break;
      case '-': v = a - b; break;
      case '*': v = a * b; break;
      case '/': if (b !== 0 && a % b === 0) v = a / b; break; // only exact divisions: no integer-division ambiguity
      case '%': if (b !== 0) v = a % b; break;
      case '=': return { kind: 'boolean', value: a === b };
      case '<>': return { kind: 'boolean', value: a !== b };
      case '<': return { kind: 'boolean', value: a < b };
      case '>': return { kind: 'boolean', value: a > b };
      case '<=': return { kind: 'boolean', value: a <= b };
      case '>=': return { kind: 'boolean', value: a >= b };
      default:
    }
    if (v !== undefined && Number.isSafeInteger(v)) return num(v);
  }
  if (l.kind === 'string' && r.kind === 'string') {
    // Only (in)equality: ordering comparisons depend on the database collation.
    if (op === '=') return { kind: 'boolean', value: l.value === r.value };
    if (op === '<>') return { kind: 'boolean', value: l.value !== r.value };
  }
  return e;
}

export function constantFolding(s: SelectStatement): StatementRuleOutput {
  const next = mapConditions(s, (e) => mapExpr(e, foldNode));
  const applied = sqlOf(next) !== sqlOf(s);
  const hasNull = [s.where, s.having, ...s.from.map((t) => t.on)].some((e) => e && someExpr(e, (x) => x.kind === 'null'));
  return {
    statement: applied ? next : s,
    result: result(
      'constant-folding',
      'SQL rewrite',
      applied,
      clauseText(s),
      applied ? clauseText(next) : clauseText(s),
      'Sub-expressions made only of integer literals were evaluated at compile time. Only exact integer arithmetic and integer/string equality are folded, so the value is identical to what the database would compute.',
      hasNull
        ? 'No foldable constant sub-expressions. Expressions involving NULL were left alone because their result depends on three-valued logic.'
        : 'No constant sub-expressions made of integer literals were found in WHERE, HAVING or ON.',
    ),
  };
}

// ───────────────────────── 2. Boolean simplification ─────────────────────────
const INVERSE: Record<string, string> = { '=': '<>', '<>': '=', '<': '>=', '>=': '<', '>': '<=', '<=': '>' };

function simplifyBool(e: Expr): Expr {
  if (e.kind === 'binary' && (e.op === 'AND' || e.op === 'OR')) {
    const { left: l, right: r } = e;
    if (e.op === 'AND') {
      if (isTrue(l)) return r;
      if (isTrue(r)) return l;
      if ((isFalse(l) && !hasFunctionCall(r) && !hasDivision(r)) || (isFalse(r) && !hasFunctionCall(l) && !hasDivision(l))) return FALSE;
    } else {
      if (isFalse(l)) return r;
      if (isFalse(r)) return l;
      if ((isTrue(l) && !hasFunctionCall(r) && !hasDivision(r)) || (isTrue(r) && !hasFunctionCall(l) && !hasDivision(l))) return TRUE;
    }
    if (sameExpr(l, r) && !hasFunctionCall(l)) return l; // idempotence (deterministic operands only)
    return e;
  }
  if (e.kind === 'unary' && e.op === 'NOT') {
    const o = e.operand;
    if (isTrue(o)) return FALSE;
    if (isFalse(o)) return TRUE;
    if (o.kind === 'unary' && o.op === 'NOT') return o.operand; // NOT NOT x = x (also in 3VL)
    if (o.kind === 'binary' && INVERSE[o.op]) return { ...o, op: INVERSE[o.op] }; // NULL stays NULL on both sides
    if (o.kind === 'binary' && (o.op === 'IN' || o.op === 'NOT IN' || o.op === 'LIKE' || o.op === 'NOT LIKE')) {
      const inv = { IN: 'NOT IN', 'NOT IN': 'IN', LIKE: 'NOT LIKE', 'NOT LIKE': 'LIKE' }[o.op]!;
      return { ...o, op: inv };
    }
    if (o.kind === 'isnull') return { ...o, negated: !o.negated };
    if (o.kind === 'between') return { ...o, negated: !o.negated };
  }
  return e;
}

export function booleanSimplification(s: SelectStatement): StatementRuleOutput {
  let next = mapConditions(s, (e) => mapExpr(e, simplifyBool));
  // WHERE TRUE / HAVING TRUE filter nothing, so the clause can be dropped.
  if (next.where && isTrue(next.where)) next = { ...next, where: undefined };
  if (next.having && isTrue(next.having)) next = { ...next, having: undefined };
  const applied = sqlOf(next) !== sqlOf(s);

  const selfCompare = [s.where, s.having].some((e) => e && someExpr(e, (x) => x.kind === 'binary' && ['=', '<>', '<', '>', '<=', '>='].includes(x.op) && sameExpr(x.left, x.right)));
  return {
    statement: applied ? next : s,
    result: result(
      'boolean-simplification',
      'SQL rewrite',
      applied,
      clauseText(s),
      applied ? clauseText(next) : clauseText(s),
      'Applied only identities that are valid in SQL three-valued logic (TRUE AND x = x, x OR FALSE = x, NOT (a < b) = a >= b, NOT NOT x = x, x AND x = x for deterministic x).',
      selfCompare
        ? "Nothing simplified. A comparison of an expression with itself (for example a = a) was kept: it is not always TRUE because NULL = NULL is NULL, so removing it could change the result."
        : 'No simplifiable boolean pattern was found.',
    ),
  };
}

// ───────────────────────── 3. Expression simplification ─────────────────────────
const isLit = (e: Expr, v: number) => e.kind === 'number' && e.value === v && /^-?\d+$/.test(e.raw);

function simplifyExpr(e: Expr): Expr {
  if (e.kind === 'binary') {
    const { op, left: l, right: r } = e;
    if (op === '+' && isLit(r, 0)) return l;
    if (op === '+' && isLit(l, 0)) return r;
    if (op === '-' && isLit(r, 0)) return l;
    if (op === '*' && isLit(r, 1)) return l;
    if (op === '*' && isLit(l, 1)) return r;
    if (op === '/' && isLit(r, 1)) return l;
    if ((op === 'IN' || op === 'NOT IN') && r.kind === 'list' && r.items.length === 1) {
      return { kind: 'binary', op: op === 'IN' ? '=' : '<>', left: l, right: r.items[0] };
    }
  }
  return e;
}

export function expressionSimplification(s: SelectStatement): StatementRuleOutput {
  const next = mapConditions(s, (e) => mapExpr(e, simplifyExpr));
  const applied = sqlOf(next) !== sqlOf(s);
  const mulZero = [s.where, s.having].some((e) => e && someExpr(e, (x) => x.kind === 'binary' && x.op === '*' && (isLit(x.left, 0) || isLit(x.right, 0))));
  return {
    statement: applied ? next : s,
    result: result(
      'expression-simplification',
      'SQL rewrite',
      applied,
      clauseText(s),
      applied ? clauseText(next) : clauseText(s),
      'Removed arithmetic identities (x + 0, x - 0, x * 1, x / 1) and rewrote single-element IN lists to = / <>. These produce the same value, including NULL, for numeric operands.',
      mulZero
        ? "Nothing simplified. 'x * 0' was not replaced by 0 because the result is NULL when x is NULL."
        : 'No arithmetic identity or single-element IN list was found.',
    ),
  };
}

// ───────────────────────── 4. Predicate reordering ─────────────────────────
function rankOf(e: Expr): number {
  if (e.kind === 'isnull') return 0;
  if (e.kind === 'binary') {
    const colLit = (e.left.kind === 'column' && ['number', 'string', 'boolean'].includes(e.right.kind)) || (e.right.kind === 'column' && ['number', 'string', 'boolean'].includes(e.left.kind));
    if (e.op === '=' && colLit) return 0;
    if (['<>', '<', '>', '<=', '>='].includes(e.op) && colLit) return 1;
    if (e.op === 'IN' && colLit === false && e.left.kind === 'column') return 1;
    if (e.op === 'LIKE' || e.op === 'NOT LIKE') return 2;
    if (e.op === 'OR') return 4;
    return 3;
  }
  if (e.kind === 'between') return 1;
  return 3;
}

export function predicateReordering(s: SelectStatement): StatementRuleOutput {
  const keep = (reason: string): StatementRuleOutput => ({
    statement: s,
    result: result('predicate-reordering', 'SQL rewrite', false, clauseText(s), clauseText(s), '', reason),
  });
  if (!s.where) return keep('The query has no WHERE clause.');
  const parts = conjuncts(s.where);
  if (parts.length < 2) return keep('WHERE contains a single predicate, so there is nothing to reorder.');
  if (parts.some(hasFunctionCall)) return keep('A predicate contains a function call (possibly volatile, e.g. RANDOM()), so evaluation order is not changed.');
  if (parts.some(hasDivision)) return keep('A predicate contains division or modulo, which can raise runtime errors; reordering could change which error appears.');
  const sorted = parts
    .map((p, i) => ({ p, i, r: rankOf(p) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.p);
  const next = { ...s, where: andAll(sorted) };
  const applied = sqlOf(next) !== sqlOf(s);
  return {
    statement: applied ? next : s,
    result: result(
      'predicate-reordering',
      'SQL rewrite',
      applied,
      clauseText(s),
      applied ? clauseText(next) : clauseText(s),
      'AND is commutative in three-valued logic, so the independent predicates were stably sorted: equality / IS NULL first, then ranges, then LIKE, then everything else. This is a heuristic without table statistics; it does not claim a speed-up.',
      'The predicates are already in heuristic order.',
    ),
  };
}

// ───────────────────────── 5. Redundant DISTINCT ─────────────────────────
export function redundantDistinct(s: SelectStatement, schema: SchemaMeta): StatementRuleOutput {
  const skip = (reason: string): StatementRuleOutput => ({
    statement: s,
    result: result('redundant-distinct', 'SQL rewrite', false, sqlOf(s), sqlOf(s), '', reason),
  });
  if (!s.distinct) return skip('The query does not use DISTINCT.');
  const itemSql = s.columns.map((c) => exprToSql(c.expr));
  const hasAgg = (e: Expr) => someExpr(e, (x) => x.kind === 'func' && x.aggregate);
  let why: string | undefined;

  if (s.groupBy.length === 0 && s.columns.every((c) => hasAgg(c.expr))) {
    why = 'The query has aggregates and no GROUP BY, so it returns exactly one row.';
  } else if (s.groupBy.length > 0 && s.groupBy.every((g) => g.kind !== 'number' && itemSql.includes(exprToSql(g)))) {
    why = 'Every GROUP BY expression is in the select list, and each group yields exactly one distinct row.';
  } else if (s.from.length === 1 && s.groupBy.length === 0 && !s.columns.some((c) => hasAgg(c.expr))) {
    const t: TableMeta | undefined = findTable(schema, s.from[0].table);
    const pk = t?.columns.find((c) => c.primaryKey);
    const q = (s.from[0].alias ?? s.from[0].table).toLowerCase();
    if (pk && s.columns.some((c) => c.expr.kind === 'column' && c.expr.name.toLowerCase() === pk.name.toLowerCase() && (!c.expr.table || c.expr.table.toLowerCase() === q))) {
      why = `The select list contains the primary key '${pk.name}' of a single table, so rows are already unique.`;
    }
  }
  if (!why) return skip('Uniqueness of the output rows cannot be proven from the primary key, GROUP BY columns or a single-row aggregate, so DISTINCT is kept.');
  const next = { ...s, distinct: false };
  return {
    statement: next,
    result: result('redundant-distinct', 'SQL rewrite', true, sqlOf(s), sqlOf(next), `DISTINCT was removed. ${why}`),
  };
}

// ───────────────────────── Plan-level rules ─────────────────────────
interface ScopeCol {
  qualifier: string;
  table: TableMeta;
  joinType: 'FIRST' | 'INNER' | 'LEFT';
}

function buildScope(s: SelectStatement, schema: SchemaMeta): ScopeCol[] {
  const out: ScopeCol[] = [];
  s.from.forEach((t, i) => {
    const table = findTable(schema, t.table);
    if (table) out.push({ qualifier: t.alias ?? t.table, table, joinType: i === 0 ? 'FIRST' : t.join === 'LEFT JOIN' ? 'LEFT' : 'INNER' });
  });
  return out;
}

/** Qualifiers of all tables an expression reads. */
function tablesOf(e: Expr, scope: ScopeCol[]): Set<string> {
  const out = new Set<string>();
  someExpr(e, (x) => {
    if (x.kind === 'column') {
      const hit = x.table
        ? scope.find((s) => s.qualifier.toLowerCase() === x.table!.toLowerCase())
        : scope.find((s) => s.table.columns.some((c) => c.name.toLowerCase() === x.name.toLowerCase()));
      if (hit) out.add(hit.qualifier);
    }
    return false;
  });
  return out;
}

function mapPlan(node: LogicalPlanNode, fn: (n: LogicalPlanNode) => LogicalPlanNode): LogicalPlanNode {
  const kids = (node.children as LogicalPlanNode[]).map((c) => mapPlan(c, fn));
  return fn({ ...node, children: kids } as LogicalPlanNode);
}

export interface PlanRuleOutput {
  plan: LogicalPlanNode;
  result: OptimizationResult;
}

export function predicatePushdown(s: SelectStatement, plan: LogicalPlanNode, schema: SchemaMeta): PlanRuleOutput {
  const before = toAlgebra(plan);
  const skip = (reason: string): PlanRuleOutput => ({ plan, result: result('predicate-pushdown', 'Logical plan', false, before, before, '', reason) });
  if (s.from.length < 2) return skip('Single-table query: the Selection already sits directly above the TableScan.');
  if (!s.where) return skip(s.having ? 'No WHERE clause. HAVING predicates are never moved across the aggregation boundary.' : 'The query has no WHERE clause.');
  const scope = buildScope(s, schema);
  const parts = conjuncts(s.where);
  const pushed: { expr: Expr; q: string }[] = [];
  const kept: Expr[] = [];
  const reasons: string[] = [];
  for (const p of parts) {
    const tables = [...tablesOf(p, scope)];
    if (hasFunctionCall(p)) { kept.push(p); reasons.push(`'${exprToSql(p)}' contains a function call (possibly volatile)`); continue; }
    if (tables.length === 0) { kept.push(p); reasons.push(`'${exprToSql(p)}' references no table`); continue; }
    if (tables.length > 1) { kept.push(p); reasons.push(`'${exprToSql(p)}' references several tables`); continue; }
    const entry = scope.find((x) => x.qualifier === tables[0])!;
    if (entry.joinType === 'LEFT') {
      kept.push(p);
      reasons.push(`'${exprToSql(p)}' filters the nullable side of a LEFT JOIN; filtering before the join would keep rows that WHERE removes`);
      continue;
    }
    pushed.push({ expr: p, q: entry.qualifier });
  }
  if (pushed.length === 0) return skip(reasons.length ? `No conjunct could be pushed safely: ${reasons.join('; ')}.` : 'No pushable predicate.');

  // 1. remove the WHERE Selection, 2. wrap the matching scans, 3. re-add the remaining conjuncts on top of the joins
  const remaining = andAll(kept);
  let optimized = mapPlan(plan, (n) => {
    if (n.op === 'Selection' && n.stage === 'where') return n.children[0];
    if (n.op === 'TableScan') {
      const q = n.alias ?? n.table;
      const mine = pushed.filter((p) => p.q === q);
      if (mine.length) return { op: 'Selection', predicate: andAll(mine.map((m) => m.expr))!, stage: 'where', pushedDown: true, children: [n] } as LogicalPlanNode;
    }
    return n;
  });
  if (remaining) optimized = wrapTopJoin(optimized, remaining);
  const after = toAlgebra(optimized);
  return {
    plan: optimized,
    result: result(
      'predicate-pushdown',
      'Logical plan',
      true,
      before,
      after,
      `${pushed.length} single-table predicate${pushed.length > 1 ? 's were' : ' was'} moved below the join onto ${[...new Set(pushed.map((p) => p.q))].join(', ')}. This changes the logical plan only; the generated SQL text is unchanged, and the rewrite is only safe because the filtered tables are not on the nullable side of an outer join.${reasons.length ? ` Kept above the join: ${reasons.join('; ')}.` : ''}`,
    ),
  };
}

/** Wraps the topmost Join (below Aggregation / Projection / Sort / Limit) in a Selection. */
function wrapTopJoin(node: LogicalPlanNode, predicate: Expr): LogicalPlanNode {
  if (node.op === 'Join') return { op: 'Selection', predicate, stage: 'where', children: [node] };
  if (node.children.length === 1) return { ...node, children: [wrapTopJoin(node.children[0], predicate)] } as LogicalPlanNode;
  return node;
}

export function projectionPushdown(s: SelectStatement, plan: LogicalPlanNode, schema: SchemaMeta): PlanRuleOutput {
  const before = toAlgebra(plan);
  const skip = (reason: string): PlanRuleOutput => ({ plan, result: result('projection-pushdown', 'Logical plan', false, before, before, '', reason) });
  if (s.from.length < 2) return skip('Single-table query: the top-level Projection already limits the columns.');
  if (s.columns.some((c) => c.expr.kind === 'star')) return skip('The select list uses *, so every column of the joined tables is required.');
  const scope = buildScope(s, schema);

  // Every column the statement uses, grouped by table qualifier.
  const needed = new Map<string, Set<string>>();
  const note = (e: Expr | undefined) => {
    if (!e) return;
    someExpr(e, (x) => {
      if (x.kind === 'column') {
        const hit = x.table
          ? scope.find((c) => c.qualifier.toLowerCase() === x.table!.toLowerCase())
          : scope.find((c) => c.table.columns.some((col) => col.name.toLowerCase() === x.name.toLowerCase()));
        const col = hit?.table.columns.find((c) => c.name.toLowerCase() === x.name.toLowerCase());
        if (hit && col) {
          if (!needed.has(hit.qualifier)) needed.set(hit.qualifier, new Set());
          needed.get(hit.qualifier)!.add(col.name);
        }
      }
      return false;
    });
  };
  s.columns.forEach((c) => note(c.expr));
  note(s.where);
  s.groupBy.forEach(note);
  note(s.having);
  s.orderBy.forEach((o) => note(o.expr));
  s.from.forEach((t) => note(t.on));

  const wrapped: string[] = [];
  const skipped: string[] = [];
  const optimized = mapPlan(plan, (n) => {
    if (n.op !== 'TableScan') return n;
    const q = n.alias ?? n.table;
    const entry = scope.find((x) => x.qualifier === q);
    const cols = needed.get(q);
    if (!entry || !cols || cols.size === 0) {
      skipped.push(`${q} (no column is used)`);
      return n;
    }
    if (cols.size >= entry.table.columns.length) {
      skipped.push(`${q} (all columns are used)`);
      return n;
    }
    wrapped.push(`${q}: ${[...cols].join(', ')}`);
    const items: SelectItem[] = entry.table.columns.filter((c) => cols.has(c.name)).map((c) => ({ expr: { kind: 'column', table: q, name: c.name } }));
    // Place the Projection above any pushed-down Selection of this scan (added by the previous rule).
    return { op: 'Projection', items, distinct: false, pushedDown: true, children: [n] } as LogicalPlanNode;
  });
  if (wrapped.length === 0) return skip(`No scan can be narrowed: ${skipped.join('; ') || 'nothing to project'}.`);

  // Re-order so each pushed Projection sits above its (pushed) Selection: π(σ(scan)).
  const normalized = mapPlan(optimized, (n) => {
    if (n.op === 'Selection' && n.pushedDown && n.children[0].op === 'Projection' && n.children[0].pushedDown) {
      const proj = n.children[0];
      return { ...proj, children: [{ ...n, children: [proj.children[0]] }] } as LogicalPlanNode;
    }
    return n;
  });
  return {
    plan: normalized,
    result: result(
      'projection-pushdown',
      'Logical plan',
      true,
      before,
      toAlgebra(normalized),
      `Scans were narrowed to the columns used anywhere in the query (${wrapped.join('; ')}). Join keys, filters, grouping and ordering columns are all kept, so the final result is unchanged. Logical plan only; the SQL text is unchanged.${skipped.length ? ` Not narrowed: ${skipped.join('; ')}.` : ''}`,
    ),
  };
}

export { buildPlan };
