import type { Expr, SelectStatement, Statement } from '@/types/compiler';

const PRECEDENCE: Record<string, number> = {
  OR: 1,
  AND: 2,
  '=': 4, '<>': 4, '<': 4, '>': 4, '<=': 4, '>=': 4, LIKE: 4, 'NOT LIKE': 4, IN: 4, 'NOT IN': 4,
  '||': 5,
  '+': 6, '-': 6,
  '*': 7, '/': 7, '%': 7,
};

export function quoteIdent(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

/** Prints an expression back to SQL, adding parentheses only where precedence requires them. */
export function exprToSql(e: Expr, parentPrec = 0): string {
  const wrap = (s: string, p: number) => (p < parentPrec ? `(${s})` : s);
  switch (e.kind) {
    case 'column':
      return e.table ? `${quoteIdent(e.table)}.${quoteIdent(e.name)}` : quoteIdent(e.name);
    case 'star':
      return e.table ? `${quoteIdent(e.table)}.*` : '*';
    case 'number':
      return e.raw;
    case 'string':
      return `'${e.value.replace(/'/g, "''")}'`;
    case 'boolean':
      return e.value ? 'TRUE' : 'FALSE';
    case 'null':
      return 'NULL';
    case 'list':
      return `(${e.items.map((i) => exprToSql(i)).join(', ')})`;
    case 'func': {
      const inner = e.args.length === 0 && e.name === 'COUNT' ? '*' : e.args.map((a) => exprToSql(a)).join(', ');
      return `${e.name}(${e.distinct ? 'DISTINCT ' : ''}${inner})`;
    }
    case 'unary': {
      if (e.op === 'NOT') return wrap(`NOT ${exprToSql(e.operand, 3)}`, 3);
      if (e.operand.kind === 'unary' && e.operand.op !== 'NOT') return wrap(`${e.op}(${exprToSql(e.operand, 8)})`, 8);
      return wrap(`${e.op}${exprToSql(e.operand, 8)}`, 8);
    }
    case 'between': {
      const s = `${exprToSql(e.expr, 5)} ${e.negated ? 'NOT BETWEEN' : 'BETWEEN'} ${exprToSql(e.low, 5)} AND ${exprToSql(e.high, 5)}`;
      return wrap(s, 4);
    }
    case 'isnull':
      return wrap(`${exprToSql(e.expr, 5)} IS ${e.negated ? 'NOT ' : ''}NULL`, 4);
    case 'binary': {
      const p = PRECEDENCE[e.op] ?? 4;
      // left-assoc: right child needs parens at equal precedence for non-commutative ops
      const left = exprToSql(e.left, p);
      const right = exprToSql(e.right, e.op === 'AND' || e.op === 'OR' || e.op === '+' || e.op === '*' ? p : p + 1);
      return wrap(`${left} ${e.op} ${right}`, p);
    }
    case 'unsupported':
      return `/* ${e.description} */`;
  }
}

export function selectToSql(s: SelectStatement, pretty = true): string {
  const nl = pretty ? '\n' : ' ';
  const parts: string[] = [];
  const cols = s.columns.map((c) => exprToSql(c.expr) + (c.alias ? ` AS ${quoteIdent(c.alias)}` : ''));
  parts.push(`SELECT ${s.distinct ? 'DISTINCT ' : ''}${cols.join(', ')}`);
  s.from.forEach((t, i) => {
    const ref = quoteIdent(t.table) + (t.alias ? ` AS ${quoteIdent(t.alias)}` : '');
    if (i === 0) parts.push(`FROM ${ref}`);
    else parts.push(`${t.join ?? 'INNER JOIN'} ${ref} ON ${t.on ? exprToSql(t.on) : 'TRUE'}`);
  });
  if (s.where) parts.push(`WHERE ${exprToSql(s.where)}`);
  if (s.groupBy.length) parts.push(`GROUP BY ${s.groupBy.map((g) => exprToSql(g)).join(', ')}`);
  if (s.having) parts.push(`HAVING ${exprToSql(s.having)}`);
  if (s.orderBy.length) parts.push(`ORDER BY ${s.orderBy.map((o) => exprToSql(o.expr) + (o.direction === 'DESC' ? ' DESC' : '')).join(', ')}`);
  if (s.limit !== undefined) parts.push(`LIMIT ${s.limit}`);
  if (s.offset !== undefined) parts.push(`OFFSET ${s.offset}`);
  return parts.join(nl) + ';';
}

export function statementToSql(st: Statement, pretty = true): string {
  switch (st.type) {
    case 'select':
      return selectToSql(st, pretty);
    case 'insert':
      return `INSERT INTO ${quoteIdent(st.table)}${st.columns.length ? ` (${st.columns.map(quoteIdent).join(', ')})` : ''} VALUES ${st.rows.map((r) => `(${r.map((v) => exprToSql(v)).join(', ')})`).join(', ')};`;
    case 'update':
      return `UPDATE ${quoteIdent(st.table)}${st.alias ? ` AS ${quoteIdent(st.alias)}` : ''} SET ${st.assignments.map((a) => `${quoteIdent(a.column)} = ${exprToSql(a.value)}`).join(', ')}${st.where ? `${pretty ? '\n' : ' '}WHERE ${exprToSql(st.where)}` : ''};`;
    case 'delete':
      return `DELETE FROM ${quoteIdent(st.table)}${st.alias ? ` AS ${quoteIdent(st.alias)}` : ''}${st.where ? `${pretty ? '\n' : ' '}WHERE ${exprToSql(st.where)}` : ''};`;
  }
}
