import type { Expr, SelectItem, SelectStatement, Statement, TableRef, OrderItem } from '@/types/compiler';
import { AGGREGATE_FUNCTIONS } from '../lexer/keywords';

/** Thrown when the third-party AST uses a construct outside the supported subset. */
export class UnsupportedSyntaxError extends Error {
  constructor(public description: string) {
    super(description);
  }
}

type Raw = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function nameOf(v: Raw): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    if (typeof v.value === 'string') return v.value;
    if (v.expr) return nameOf(v.expr);
  }
  return undefined;
}

export function convertExpr(raw: Raw): Expr {
  if (raw == null) throw new UnsupportedSyntaxError('empty expression');
  switch (raw.type) {
    case 'column_ref': {
      const col = typeof raw.column === 'string' ? raw.column : nameOf(raw.column);
      if (col === undefined) throw new UnsupportedSyntaxError('unrecognized column reference');
      const table = nameOf(raw.table);
      if (col === '*') return { kind: 'star', table };
      return { kind: 'column', table, name: col };
    }
    case 'star':
      return { kind: 'star' };
    case 'number': {
      const v = Number(raw.value);
      return { kind: 'number', value: v, raw: String(raw.value) };
    }
    case 'single_quote_string':
    case 'string':
    case 'natural_string':
      return { kind: 'string', value: String(raw.value) };
    case 'bool':
    case 'boolean':
      return { kind: 'boolean', value: Boolean(raw.value) };
    case 'null':
      return { kind: 'null' };
    case 'expr_list':
      return { kind: 'list', items: (raw.value ?? []).map(convertExpr) };
    case 'unary_expr': {
      const op = String(raw.operator).toUpperCase();
      if (op === 'NOT' || op === '-' || op === '+') return { kind: 'unary', op: op as 'NOT' | '-' | '+', operand: convertExpr(raw.expr) };
      throw new UnsupportedSyntaxError(`unary operator ${raw.operator}`);
    }
    case 'aggr_func': {
      const name = String(raw.name).toUpperCase();
      const argExpr = raw.args?.expr;
      const args: Expr[] = argExpr ? [convertExpr(argExpr)] : [];
      return {
        kind: 'func',
        name,
        args,
        distinct: raw.args?.distinct === 'DISTINCT' || undefined,
        aggregate: true,
      };
    }
    case 'function': {
      const fname = (typeof raw.name === 'string'
        ? raw.name
        : (raw.name?.name ?? []).map((n: Raw) => n.value).join('.')
      ).toUpperCase();
      const args: Raw[] = raw.args?.value ?? [];
      if (fname === 'NOT' && args.length === 1) return { kind: 'unary', op: 'NOT', operand: convertExpr(args[0]) };
      return {
        kind: 'func',
        name: fname,
        args: args.map(convertExpr),
        aggregate: AGGREGATE_FUNCTIONS.has(fname),
      };
    }
    case 'binary_expr': {
      const op = String(raw.operator).toUpperCase();
      if (op === 'BETWEEN' || op === 'NOT BETWEEN') {
        const bounds = raw.right?.value ?? [];
        if (bounds.length !== 2) throw new UnsupportedSyntaxError('malformed BETWEEN');
        return { kind: 'between', expr: convertExpr(raw.left), low: convertExpr(bounds[0]), high: convertExpr(bounds[1]), negated: op === 'NOT BETWEEN' };
      }
      if (op === 'IS' || op === 'IS NOT') {
        if (raw.right?.type === 'null') return { kind: 'isnull', expr: convertExpr(raw.left), negated: op === 'IS NOT' };
        throw new UnsupportedSyntaxError(`${op} with a non-NULL operand`);
      }
      const supported = ['AND', 'OR', '=', '<>', '!=', '<', '<=', '>', '>=', '+', '-', '*', '/', '%', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', '||'];
      if (!supported.includes(op)) throw new UnsupportedSyntaxError(`operator ${op}`);
      return { kind: 'binary', op: op === '!=' ? '<>' : op, left: convertExpr(raw.left), right: convertExpr(raw.right) };
    }
    case 'select':
      throw new UnsupportedSyntaxError('subqueries');
    case 'case':
      throw new UnsupportedSyntaxError('CASE expressions');
    case 'cast':
      throw new UnsupportedSyntaxError('CAST expressions');
    default:
      throw new UnsupportedSyntaxError(`expression of type '${raw.type}'`);
  }
}

function convertSelect(raw: Raw): SelectStatement {
  if (raw._next || raw.set_op) throw new UnsupportedSyntaxError('set operations (UNION / INTERSECT / EXCEPT)');
  if (raw.with) throw new UnsupportedSyntaxError('WITH (common table expressions)');
  if (raw.window) throw new UnsupportedSyntaxError('window functions');

  const columns: SelectItem[] = (Array.isArray(raw.columns) ? raw.columns : []).map((c: Raw) => ({
    expr: convertExpr(c.expr),
    alias: c.as ?? undefined,
  }));

  const from: TableRef[] = (raw.from ?? []).map((f: Raw, idx: number): TableRef => {
    if (f.expr || !f.table) throw new UnsupportedSyntaxError('subqueries or table functions in FROM');
    let join: TableRef['join'];
    if (f.join) {
      const j = String(f.join).toUpperCase();
      if (j === 'INNER JOIN' || j === 'JOIN') join = 'INNER JOIN';
      else if (j === 'LEFT JOIN' || j === 'LEFT OUTER JOIN') join = 'LEFT JOIN';
      else throw new UnsupportedSyntaxError(`${j} (only INNER JOIN and LEFT JOIN are supported)`);
    } else if (idx > 0) {
      throw new UnsupportedSyntaxError('comma-separated tables (use explicit JOIN ... ON)');
    }
    if (f.using) throw new UnsupportedSyntaxError('JOIN ... USING');
    if (join && !f.on) throw new UnsupportedSyntaxError('JOIN without an ON condition');
    if (f.db) throw new UnsupportedSyntaxError('database-qualified table names');
    return { table: String(f.table), alias: f.as ?? undefined, join, on: f.on ? convertExpr(f.on) : undefined };
  });

  const gbRaw: Raw[] = Array.isArray(raw.groupby) ? raw.groupby : raw.groupby?.columns ?? [];
  const orderBy: OrderItem[] = (raw.orderby ?? []).map((o: Raw) => ({
    expr: convertExpr(o.expr),
    direction: String(o.type ?? 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
  }));

  let limit: number | undefined;
  let offset: number | undefined;
  const lv: Raw[] = raw.limit?.value ?? [];
  const toLimitNum = (v: unknown): number | undefined => {
    if (v === undefined || v === null || String(v).toLowerCase() === 'all') return undefined;
    return Number(v);
  };
  if (lv.length >= 1) {
    if (raw.limit.seperator === 'offset') {
      limit = toLimitNum(lv[0].value);
      offset = lv[1] ? toLimitNum(lv[1].value) : undefined;
    } else if (raw.limit.seperator === ',') {
      offset = toLimitNum(lv[0].value);
      limit = lv[1] ? toLimitNum(lv[1].value) : undefined;
    } else {
      limit = toLimitNum(lv[0].value);
    }
  }

  return {
    type: 'select',
    distinct: raw.distinct?.type === 'DISTINCT',
    columns,
    from,
    where: raw.where ? convertExpr(raw.where) : undefined,
    groupBy: gbRaw.map(convertExpr),
    having: raw.having ? convertExpr(raw.having) : undefined,
    orderBy,
    limit,
    offset,
  };
}

export function convertStatement(raw: Raw): Statement {
  switch (raw.type) {
    case 'select':
      return convertSelect(raw);
    case 'insert': {
      const table = raw.table?.[0]?.table;
      if (!table) throw new UnsupportedSyntaxError('INSERT target');
      if (raw.values?.type !== 'values') throw new UnsupportedSyntaxError('INSERT ... SELECT');
      return {
        type: 'insert',
        table: String(table),
        columns: (raw.columns ?? []).map((c: Raw) => nameOf(c) ?? ''),
        rows: raw.values.values.map((r: Raw) => (r.value ?? []).map(convertExpr)),
      };
    }
    case 'update': {
      if ((raw.table?.length ?? 0) !== 1 || raw.from) throw new UnsupportedSyntaxError('multi-table UPDATE');
      return {
        type: 'update',
        table: String(raw.table[0].table),
        alias: raw.table[0].as ?? undefined,
        assignments: (raw.set ?? []).map((s: Raw) => ({ column: nameOf(s.column) ?? '', value: convertExpr(s.value) })),
        where: raw.where ? convertExpr(raw.where) : undefined,
      };
    }
    case 'delete': {
      const from = raw.from ?? [];
      if (from.length !== 1) throw new UnsupportedSyntaxError('multi-table DELETE');
      return {
        type: 'delete',
        table: String(from[0].table),
        alias: from[0].as ?? undefined,
        where: raw.where ? convertExpr(raw.where) : undefined,
      };
    }
    default:
      throw new UnsupportedSyntaxError(`${String(raw.type).toUpperCase()} statements (only SELECT, INSERT, UPDATE and DELETE are supported)`);
  }
}
