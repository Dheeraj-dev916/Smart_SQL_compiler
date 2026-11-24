import type { Expr, SelectStatement } from '@/types/compiler';
import { exprToSql } from '../codegen/printer';

/** Bottom-up transform: children are rewritten first, then `fn` is applied to the rebuilt node. */
export function mapExpr(e: Expr, fn: (x: Expr) => Expr): Expr {
  switch (e.kind) {
    case 'binary':
      return fn({ ...e, left: mapExpr(e.left, fn), right: mapExpr(e.right, fn) });
    case 'unary':
      return fn({ ...e, operand: mapExpr(e.operand, fn) });
    case 'func':
      return fn({ ...e, args: e.args.map((a) => mapExpr(a, fn)) });
    case 'between':
      return fn({ ...e, expr: mapExpr(e.expr, fn), low: mapExpr(e.low, fn), high: mapExpr(e.high, fn) });
    case 'isnull':
      return fn({ ...e, expr: mapExpr(e.expr, fn) });
    case 'list':
      return fn({ ...e, items: e.items.map((i) => mapExpr(i, fn)) });
    default:
      return fn(e);
  }
}

export function someExpr(e: Expr, pred: (x: Expr) => boolean): boolean {
  if (pred(e)) return true;
  switch (e.kind) {
    case 'binary':
      return someExpr(e.left, pred) || someExpr(e.right, pred);
    case 'unary':
      return someExpr(e.operand, pred);
    case 'func':
      return e.args.some((a) => someExpr(a, pred));
    case 'between':
      return someExpr(e.expr, pred) || someExpr(e.low, pred) || someExpr(e.high, pred);
    case 'isnull':
      return someExpr(e.expr, pred);
    case 'list':
      return e.items.some((i) => someExpr(i, pred));
    default:
      return false;
  }
}

/** Any function call. Scalar functions may be volatile (RANDOM) or error-prone, so rewrites avoid them. */
export const hasFunctionCall = (e: Expr) => someExpr(e, (x) => x.kind === 'func');
export const hasDivision = (e: Expr) => someExpr(e, (x) => x.kind === 'binary' && (x.op === '/' || x.op === '%'));

export const TRUE: Expr = { kind: 'boolean', value: true };
export const FALSE: Expr = { kind: 'boolean', value: false };
export const isTrue = (e: Expr) => e.kind === 'boolean' && e.value;
export const isFalse = (e: Expr) => e.kind === 'boolean' && !e.value;
export const sameExpr = (a: Expr, b: Expr) => exprToSql(a) === exprToSql(b);

export function conjuncts(e: Expr): Expr[] {
  return e.kind === 'binary' && e.op === 'AND' ? [...conjuncts(e.left), ...conjuncts(e.right)] : [e];
}

export function andAll(list: Expr[]): Expr | undefined {
  if (list.length === 0) return undefined;
  return list.slice(1).reduce<Expr>((acc, x) => ({ kind: 'binary', op: 'AND', left: acc, right: x }), list[0]);
}

/** Applies `fn` to every WHERE / HAVING / ON expression of a statement. */
export function mapConditions(s: SelectStatement, fn: (e: Expr) => Expr | undefined): SelectStatement {
  return {
    ...s,
    where: s.where ? fn(s.where) : undefined,
    having: s.having ? fn(s.having) : undefined,
    from: s.from.map((t) => (t.on ? { ...t, on: fn(t.on) ?? TRUE } : t)),
  };
}

export function clauseText(s: SelectStatement): string {
  const lines: string[] = [];
  if (s.where) lines.push(`WHERE ${exprToSql(s.where)}`);
  s.from.forEach((t) => {
    if (t.on) lines.push(`${t.join} ${t.table} ON ${exprToSql(t.on)}`);
  });
  if (s.having) lines.push(`HAVING ${exprToSql(s.having)}`);
  return lines.length ? lines.join('\n') : '(no WHERE / HAVING / ON conditions)';
}
