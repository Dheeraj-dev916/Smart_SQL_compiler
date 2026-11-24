import type {
  Diagnostic,
  Expr,
  ResolvedColumn,
  SchemaMeta,
  SelectStatement,
  SemanticResult,
  SourceLocation,
  SqlType,
  Statement,
  TableMeta,
  Token,
} from '@/types/compiler';
import { makeDiagnostic } from '../diagnostics';
import { exprToSql } from '../codegen/printer';
import { findTable, suggestName } from './schema';

type T = SqlType | 'UNKNOWN' | 'NULL';

interface ScopeEntry {
  qualifier: string; // alias if present, else table name
  alias?: string;
  table: TableMeta;
}

type Clause = 'select' | 'where' | 'on' | 'group' | 'having' | 'order' | 'dml';

interface Ctx {
  clause: Clause;
  scope: ScopeEntry[];
  /** select-list aliases usable in this clause (GROUP BY / ORDER BY only) */
  aliases?: Map<string, T>;
  inAggregate: boolean;
}

const isNumeric = (t: T) => t === 'INTEGER' || t === 'DECIMAL';
const KNOWN_FUNCTIONS = new Set(['UPPER', 'LOWER', 'TRIM', 'LENGTH', 'ABS', 'ROUND', 'COALESCE', 'RANDOM']);

/**
 * Finds source locations for identifiers. The AST has no positions, so we match identifier
 * tokens by lexeme (and by qualifier for `a.b`). Each token is used once so repeated errors
 * map to distinct occurrences. If no token matches, no location is reported.
 */
class Locator {
  private used = new Set<number>();
  private tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens.filter((t) => t.type !== 'COMMENT');
  }

  private text(t: Token): string {
    return t.type === 'QUOTED_IDENTIFIER' ? t.lexeme.slice(1, -1) : t.lexeme;
  }
  private isIdent(t: Token) {
    return t.type === 'IDENTIFIER' || t.type === 'QUOTED_IDENTIFIER' || t.type === 'KEYWORD';
  }
  private loc(t: Token): SourceLocation {
    return { line: t.line, column: t.column, start: t.start, end: t.end };
  }

  /** Locate identifier `name`; if `qualifier` is given, it must be written as `qualifier.name`. */
  find(name: string, qualifier?: string): SourceLocation | undefined {
    const toks = this.tokens;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (this.used.has(t.index) || !this.isIdent(t) || this.text(t).toLowerCase() !== name.toLowerCase()) continue;
      if (qualifier) {
        const dot = toks[i - 1];
        const q = toks[i - 2];
        if (!dot || dot.type !== 'DOT' || !q || this.text(q).toLowerCase() !== qualifier.toLowerCase()) continue;
      }
      this.used.add(t.index);
      return this.loc(t);
    }
    return undefined;
  }

  /** Locate `qualifier` as the left part of `qualifier.something`. */
  findQualifier(qualifier: string): SourceLocation | undefined {
    const toks = this.tokens;
    for (let i = 0; i < toks.length - 1; i++) {
      const t = toks[i];
      if (this.used.has(t.index) || !this.isIdent(t) || toks[i + 1].type !== 'DOT') continue;
      if (this.text(t).toLowerCase() !== qualifier.toLowerCase()) continue;
      this.used.add(t.index);
      return this.loc(t);
    }
    return undefined;
  }
}

function containsAggregate(e: Expr): boolean {
  switch (e.kind) {
    case 'func':
      return e.aggregate || e.args.some(containsAggregate);
    case 'binary':
      return containsAggregate(e.left) || containsAggregate(e.right);
    case 'unary':
      return containsAggregate(e.operand);
    case 'between':
      return containsAggregate(e.expr) || containsAggregate(e.low) || containsAggregate(e.high);
    case 'isnull':
      return containsAggregate(e.expr);
    case 'list':
      return e.items.some(containsAggregate);
    default:
      return false;
  }
}

export function analyze(stmt: Statement, schema: SchemaMeta, tokens: Token[] = []): SemanticResult {
  const diagnostics: Diagnostic[] = [];
  const notes: string[] = [];
  const loc = new Locator(tokens);
  const resolvedMap = new Map<Expr, ResolvedColumn>();
  const resolvedList: ResolvedColumn[] = [];
  const addResolved = (r: ResolvedColumn) => {
    if (!resolvedList.some((x) => x.qualifier === r.qualifier && x.column === r.column)) resolvedList.push(r);
  };
  const err = (message: string, where?: SourceLocation, suggestion?: string) =>
    diagnostics.push(makeDiagnostic('Semantic Error', message, { location: where, suggestion }));

  // ───────── scope construction ─────────
  const scope: ScopeEntry[] = [];

  function addTable(name: string, alias?: string): ScopeEntry | undefined {
    const table = findTable(schema, name);
    if (!table) {
      const sug = suggestName(name, schema.tables.map((t) => t.name));
      err(
        `Table '${name}' does not exist in schema '${schema.name}'.${sug ? ` Did you mean '${sug}'?` : ''}`,
        loc.find(name),
        sug ? `Use table '${sug}', or choose one of: ${schema.tables.map((t) => t.name).join(', ')}.` : `Available tables: ${schema.tables.map((t) => t.name).join(', ')}.`,
      );
      return undefined;
    }
    const qualifier = alias ?? table.name;
    if (scope.some((s) => s.qualifier.toLowerCase() === qualifier.toLowerCase())) {
      err(`Duplicate table name or alias '${qualifier}' in the FROM clause.`, loc.find(qualifier), 'Give each table in the FROM clause a unique alias.');
      return undefined;
    }
    const entry: ScopeEntry = { qualifier, alias, table };
    scope.push(entry);
    return entry;
  }

  // ───────── column resolution ─────────
  function resolveColumn(e: Extract<Expr, { kind: 'column' }>, ctx: Ctx): T {
    const visible = ctx.scope;
    if (e.table) {
      const entry = visible.find((s) => s.qualifier.toLowerCase() === e.table!.toLowerCase());
      if (!entry) {
        const aliasedAway = visible.find((s) => s.alias && s.table.name.toLowerCase() === e.table!.toLowerCase());
        const inFull = scope.find((s) => s.qualifier.toLowerCase() === e.table!.toLowerCase());
        if (aliasedAway) {
          err(
            `Invalid qualified reference '${e.table}.${e.name}': table '${aliasedAway.table.name}' is aliased as '${aliasedAway.alias}' in this query.`,
            loc.findQualifier(e.table),
            `Use '${aliasedAway.alias}.${e.name}' instead.`,
          );
        } else if (inFull && ctx.clause === 'on') {
          err(`Invalid reference in JOIN condition: '${e.table}' is not available until a later join.`, loc.findQualifier(e.table), 'A JOIN condition can only reference tables that appear before or in that JOIN.');
        } else {
          const sug = suggestName(e.table, visible.map((s) => s.qualifier));
          err(
            `Unknown table or alias '${e.table}' in reference '${e.table}.${e.name}'.${sug ? ` Did you mean '${sug}'?` : ''}`,
            loc.findQualifier(e.table),
            sug ? `Use '${sug}.${e.name}'.` : `Tables in scope: ${visible.map((s) => s.qualifier).join(', ') || '(none)'}.`,
          );
        }
        return 'UNKNOWN';
      }
      const col = entry.table.columns.find((c) => c.name.toLowerCase() === e.name.toLowerCase());
      if (!col) {
        const sug = suggestName(e.name, entry.table.columns.map((c) => c.name));
        err(
          `Column '${e.name}' does not exist in table '${entry.table.name}'.${sug ? ` Did you mean '${sug}'?` : ''}`,
          loc.find(e.name, e.table),
          sug ? `Replace '${e.name}' with '${sug}'.` : `Columns of ${entry.table.name}: ${entry.table.columns.map((c) => c.name).join(', ')}.`,
        );
        return 'UNKNOWN';
      }
      const r: ResolvedColumn = { qualifier: entry.qualifier, table: entry.table.name, column: col.name, type: col.type };
      resolvedMap.set(e, r);
      addResolved(r);
      return col.type;
    }

    // unqualified
    const matches = visible.filter((s) => s.table.columns.some((c) => c.name.toLowerCase() === e.name.toLowerCase()));
    if (matches.length === 1) {
      const entry = matches[0];
      const col = entry.table.columns.find((c) => c.name.toLowerCase() === e.name.toLowerCase())!;
      const r: ResolvedColumn = { qualifier: entry.qualifier, table: entry.table.name, column: col.name, type: col.type };
      resolvedMap.set(e, r);
      addResolved(r);
      loc.find(e.name); // consume the token so later errors map to later occurrences
      return col.type;
    }
    if (matches.length > 1) {
      // A select alias may legitimately shadow in ORDER BY / GROUP BY, but real columns take precedence in SQL; report ambiguity.
      err(
        `Column '${e.name}' is ambiguous: it exists in ${matches.map((m) => `'${m.table.name}'${m.alias ? ` (as ${m.alias})` : ''}`).join(' and ')}.`,
        loc.find(e.name),
        `Qualify it, for example '${matches[0].qualifier}.${e.name}'.`,
      );
      return 'UNKNOWN';
    }
    // select alias (ORDER BY / GROUP BY)
    const aliasType = ctx.aliases?.get(e.name.toLowerCase());
    if (aliasType !== undefined) {
      loc.find(e.name);
      notes.push(`'${e.name}' in ${ctx.clause === 'order' ? 'ORDER BY' : 'GROUP BY'} refers to a select-list alias.`);
      return aliasType;
    }
    const allCols = visible.flatMap((s) => s.table.columns.map((c) => c.name));
    const sug = suggestName(e.name, allCols);
    const where =
      visible.length === 1
        ? `in table '${visible[0].table.name}'`
        : visible.length === 0
          ? 'in any table'
          : `in any table of the FROM clause (${visible.map((v) => v.table.name).join(', ')})`;
    err(`Column '${e.name}' does not exist ${where}.${sug ? ` Did you mean '${sug}'?` : ''}`, loc.find(e.name), sug ? `Replace '${e.name}' with '${sug}'.` : `Available columns: ${[...new Set(allCols)].join(', ')}.`);
    return 'UNKNOWN';
  }

  const compatible = (a: T, b: T, aExpr?: Expr, bExpr?: Expr): boolean => {
    if (a === 'UNKNOWN' || b === 'UNKNOWN' || a === 'NULL' || b === 'NULL') return true;
    if (isNumeric(a) && isNumeric(b)) return true;
    if (a === b) return true;
    // numeric-looking string literal against a number: PostgreSQL coerces unknown-typed literals
    const numericLiteral = (x?: Expr) => x?.kind === 'string' && x.value.trim() !== '' && !Number.isNaN(Number(x.value));
    if ((isNumeric(a) && numericLiteral(bExpr)) || (isNumeric(b) && numericLiteral(aExpr))) return true;
    return false;
  };

  // ───────── expression checking ─────────
  function check(e: Expr, ctx: Ctx): T {
    switch (e.kind) {
      case 'column':
        return resolveColumn(e, ctx);
      case 'star':
        if (ctx.clause !== 'select') err("'*' is only allowed in the select list or inside COUNT(*).");
        return 'UNKNOWN';
      case 'number':
        return e.raw.includes('.') || /e/i.test(e.raw) ? 'DECIMAL' : 'INTEGER';
      case 'string':
        return 'TEXT';
      case 'boolean':
        return 'BOOLEAN';
      case 'null':
        return 'NULL';
      case 'unsupported':
        err(`Unsupported expression: ${e.description}`);
        return 'UNKNOWN';
      case 'list':
        e.items.forEach((i) => check(i, ctx));
        return 'UNKNOWN';
      case 'unary': {
        const t = check(e.operand, ctx);
        if (e.op === 'NOT') {
          if (t !== 'BOOLEAN' && t !== 'UNKNOWN' && t !== 'NULL') err(`Operand of NOT must be a boolean condition, but '${exprToSql(e.operand)}' has type ${t}.`);
          return 'BOOLEAN';
        }
        if (!isNumeric(t) && t !== 'UNKNOWN' && t !== 'NULL') err(`Unary '${e.op}' requires a numeric operand, but '${exprToSql(e.operand)}' has type ${t}.`);
        return t;
      }
      case 'isnull':
        check(e.expr, ctx);
        return 'BOOLEAN';
      case 'between': {
        const a = check(e.expr, ctx);
        const lo = check(e.low, ctx);
        const hi = check(e.high, ctx);
        if (!compatible(a, lo, e.expr, e.low) || !compatible(a, hi, e.expr, e.high)) {
          err(`Incompatible types in BETWEEN: ${a} compared with ${!compatible(a, lo, e.expr, e.low) ? lo : hi}.`);
        }
        return 'BOOLEAN';
      }
      case 'func':
        return checkFunc(e, ctx);
      case 'binary': {
        const op = e.op;
        const l = check(e.left, ctx);
        const r = (op === 'IN' || op === 'NOT IN') && e.right.kind === 'list' ? 'UNKNOWN' : check(e.right, ctx);
        if (op === 'AND' || op === 'OR') {
          for (const [side, t] of [[e.left, l], [e.right, r]] as const) {
            if (t !== 'BOOLEAN' && t !== 'UNKNOWN' && t !== 'NULL') err(`Operand of ${op} must be a boolean condition, but '${exprToSql(side)}' has type ${t}.`);
          }
          return 'BOOLEAN';
        }
        if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
          if (!compatible(l, r, e.left, e.right)) {
            err(`Type mismatch: cannot compare ${l} ('${exprToSql(e.left)}') with ${r} ('${exprToSql(e.right)}') using '${op}'.`, undefined, 'Compare values of the same type, or convert one side explicitly.');
          }
          return 'BOOLEAN';
        }
        if (op === 'LIKE' || op === 'NOT LIKE') {
          for (const [side, t] of [[e.left, l], [e.right, r]] as const) {
            if (t !== 'TEXT' && t !== 'UNKNOWN' && t !== 'NULL') err(`${op} requires text operands, but '${exprToSql(side)}' has type ${t}.`);
          }
          return 'BOOLEAN';
        }
        if (op === 'IN' || op === 'NOT IN') {
          if (e.right.kind === 'list') {
            for (const item of e.right.items) {
              const it = check(item, ctx);
              if (!compatible(l, it, e.left, item)) err(`Type mismatch in ${op} list: ${l} ('${exprToSql(e.left)}') is not comparable with ${it} ('${exprToSql(item)}').`);
            }
          }
          return 'BOOLEAN';
        }
        if (op === '||') {
          for (const [side, t] of [[e.left, l], [e.right, r]] as const) {
            if (t === 'BOOLEAN') err(`String concatenation '||' does not accept BOOLEAN operand '${exprToSql(side)}'.`);
          }
          return 'TEXT';
        }
        // arithmetic
        for (const [side, t] of [[e.left, l], [e.right, r]] as const) {
          if (!isNumeric(t) && t !== 'UNKNOWN' && t !== 'NULL') err(`Arithmetic operator '${op}' requires numeric operands, but '${exprToSql(side)}' has type ${t}.`);
        }
        if (l === 'UNKNOWN' || r === 'UNKNOWN' || l === 'NULL' || r === 'NULL') return 'UNKNOWN';
        return l === 'DECIMAL' || r === 'DECIMAL' ? 'DECIMAL' : 'INTEGER';
      }
    }
  }

  function checkFunc(e: Extract<Expr, { kind: 'func' }>, ctx: Ctx): T {
    if (e.aggregate) {
      if (ctx.clause === 'where' || ctx.clause === 'on' || ctx.clause === 'group') {
        const name = ctx.clause === 'where' ? 'WHERE' : ctx.clause === 'on' ? 'JOIN conditions' : 'GROUP BY';
        err(`Aggregate function ${e.name} is not allowed in ${name}.`, undefined, ctx.clause === 'where' ? 'Move the condition to a HAVING clause.' : undefined);
      }
      if (ctx.inAggregate) err(`Aggregate function ${e.name} cannot be nested inside another aggregate.`);
      const inner: Ctx = { ...ctx, inAggregate: true };
      const argTypes = e.args.map((a) => (a.kind === 'star' ? ('UNKNOWN' as T) : check(a, inner)));
      if (e.args.length > 1) err(`${e.name}() takes at most 1 argument.`);
      if (e.args.length === 0 || (e.args[0].kind === 'star' && e.name !== 'COUNT')) {
        if (e.name !== 'COUNT') err(`${e.name}(*) is not valid; ${e.name} requires a column or expression.`);
      }
      const a0 = argTypes[0] ?? 'UNKNOWN';
      switch (e.name) {
        case 'COUNT':
          return 'INTEGER';
        case 'SUM':
        case 'AVG':
          if (!isNumeric(a0) && a0 !== 'UNKNOWN' && a0 !== 'NULL') err(`${e.name}() requires a numeric argument, but '${exprToSql(e.args[0])}' has type ${a0}.`);
          return e.name === 'AVG' ? 'DECIMAL' : a0 === 'DECIMAL' ? 'DECIMAL' : isNumeric(a0) ? 'INTEGER' : 'UNKNOWN';
        default:
          return a0; // MIN / MAX keep the argument type
      }
    }
    if (!KNOWN_FUNCTIONS.has(e.name)) {
      err(`Unknown function '${e.name}'.`, loc.find(e.name), `Supported scalar functions: ${[...KNOWN_FUNCTIONS].join(', ')}.`);
      e.args.forEach((a) => check(a, ctx));
      return 'UNKNOWN';
    }
    const types = e.args.map((a) => check(a, ctx));
    const textArg = (t: T, a: Expr) => {
      if (t !== 'TEXT' && t !== 'UNKNOWN' && t !== 'NULL') err(`${e.name}() requires a text argument, but '${exprToSql(a)}' has type ${t}.`);
    };
    const numArg = (t: T, a: Expr) => {
      if (!isNumeric(t) && t !== 'UNKNOWN' && t !== 'NULL') err(`${e.name}() requires a numeric argument, but '${exprToSql(a)}' has type ${t}.`);
    };
    switch (e.name) {
      case 'UPPER':
      case 'LOWER':
      case 'TRIM':
        if (e.args.length !== 1) err(`${e.name}() takes exactly 1 argument.`);
        else textArg(types[0], e.args[0]);
        return 'TEXT';
      case 'LENGTH':
        if (e.args.length !== 1) err(`LENGTH() takes exactly 1 argument.`);
        else textArg(types[0], e.args[0]);
        return 'INTEGER';
      case 'ABS':
        if (e.args.length !== 1) err('ABS() takes exactly 1 argument.');
        else numArg(types[0], e.args[0]);
        return types[0] ?? 'UNKNOWN';
      case 'ROUND':
        if (e.args.length < 1 || e.args.length > 2) err('ROUND() takes 1 or 2 arguments.');
        else {
          numArg(types[0], e.args[0]);
          if (e.args.length === 2 && types[1] !== 'INTEGER' && types[1] !== 'UNKNOWN' && types[1] !== 'NULL') {
            err(`ROUND() second argument must be an integer, but '${exprToSql(e.args[1])}' has type ${types[1]}.`);
          }
        }
        return types[0] ?? 'UNKNOWN';
      case 'COALESCE': {
        if (e.args.length < 1) err('COALESCE() needs at least 1 argument.');
        const first = types.find((t) => t !== 'NULL' && t !== 'UNKNOWN');
        if (first) {
          for (let i = 0; i < types.length; i++) {
            if (!compatible(first, types[i], undefined, e.args[i])) {
              err(`Incompatible types in COALESCE(): ${first} and ${types[i]} ('${exprToSql(e.args[i])}').`);
              break;
            }
          }
        }
        return first ?? 'UNKNOWN';
      }
      case 'RANDOM':
        if (e.args.length !== 0) err('RANDOM() takes no arguments.');
        return 'DECIMAL';
      default:
        return 'UNKNOWN';
    }
  }

  // ───────── statements ─────────
  const outputColumns: SemanticResult['outputColumns'] = [];

  function analyzeSelect(s: SelectStatement) {
    // FROM + JOIN scope (conditions are checked with the scope visible at that point)
    const joinScopes: ScopeEntry[][] = [];
    s.from.forEach((t) => {
      addTable(t.table, t.alias);
      joinScopes.push([...scope]);
    });
    s.from.forEach((t, i) => {
      if (t.on) {
        const ctx: Ctx = { clause: 'on', scope: joinScopes[i], inAggregate: false };
        const ty = check(t.on, ctx);
        if (ty !== 'BOOLEAN' && ty !== 'UNKNOWN' && ty !== 'NULL') err(`JOIN condition must be a boolean expression, but has type ${ty}.`);
      }
    });

    const base: Ctx = { clause: 'select', scope, inAggregate: false };
    const aliasTypes = new Map<string, T>();

    // select list
    for (const item of s.columns) {
      if (item.expr.kind === 'star') {
        const q = item.expr.table;
        const entries = q ? scope.filter((e) => e.qualifier.toLowerCase() === q.toLowerCase()) : scope;
        if (q && entries.length === 0) {
          err(`Unknown table or alias '${q}' in '${q}.*'.`, loc.findQualifier(q));
        }
        for (const entry of entries) {
          for (const c of entry.table.columns) {
            outputColumns.push({ name: c.name, type: c.type });
            addResolved({ qualifier: entry.qualifier, table: entry.table.name, column: c.name, type: c.type });
          }
        }
        continue;
      }
      const ty = check(item.expr, base);
      const name =
        item.alias ??
        (item.expr.kind === 'column' ? item.expr.name : item.expr.kind === 'func' ? item.expr.name.toLowerCase() : '?column?');
      outputColumns.push({ name, type: ty === 'NULL' ? 'UNKNOWN' : ty });
      if (item.alias) {
        if (aliasTypes.has(item.alias.toLowerCase())) err(`Duplicate column alias '${item.alias}' in the select list.`, loc.find(item.alias), 'Use a different alias for one of the columns.');
        aliasTypes.set(item.alias.toLowerCase(), ty);
      }
    }
    const ordinalCheck = (e: Expr, clause: 'GROUP BY' | 'ORDER BY'): boolean => {
      if (e.kind === 'number' && Number.isInteger(e.value)) {
        if (e.value < 1 || e.value > outputColumns.length) err(`${clause} position ${e.value} is out of range (the select list has ${outputColumns.length} column${outputColumns.length === 1 ? '' : 's'}).`);
        return true;
      }
      return false;
    };

    if (s.where) {
      const ty = check(s.where, { clause: 'where', scope, inAggregate: false });
      if (ty !== 'BOOLEAN' && ty !== 'UNKNOWN' && ty !== 'NULL') err(`WHERE condition must be a boolean expression, but has type ${ty}.`);
    }
    for (const g of s.groupBy) {
      if (ordinalCheck(g, 'GROUP BY')) continue;
      check(g, { clause: 'group', scope, aliases: aliasTypes, inAggregate: false });
    }
    if (s.having) {
      const ty = check(s.having, { clause: 'having', scope, inAggregate: false });
      if (ty !== 'BOOLEAN' && ty !== 'UNKNOWN' && ty !== 'NULL') err(`HAVING condition must be a boolean expression, but has type ${ty}.`);
    }
    for (const o of s.orderBy) {
      if (ordinalCheck(o.expr, 'ORDER BY')) continue;
      check(o.expr, { clause: 'order', scope, aliases: aliasTypes, inAggregate: false });
    }

    // GROUP BY validity: non-aggregated references must be grouped
    const isAgg =
      s.groupBy.length > 0 ||
      s.having !== undefined ||
      s.columns.some((c) => containsAggregate(c.expr)) ||
      (s.having ? containsAggregate(s.having) : false);
    if (isAgg) {
      const groupKeys = new Set<string>();
      const groupedCols = new Set<string>();
      const addGroupedExpr = (expr: Expr) => {
        groupKeys.add(exprToSql(expr));
        if (expr.kind === 'column') {
          const r = resolvedMap.get(expr);
          if (r) groupedCols.add(`${r.qualifier}.${r.column}`.toLowerCase());
          else if (!expr.table && aliasTypes.has(expr.name.toLowerCase())) {
            const it = s.columns.find((c) => c.alias?.toLowerCase() === expr.name.toLowerCase());
            if (it) {
              groupKeys.add(exprToSql(it.expr));
              if (it.expr.kind === 'column') {
                const rr = resolvedMap.get(it.expr);
                if (rr) groupedCols.add(`${rr.qualifier}.${rr.column}`.toLowerCase());
              }
            }
          }
        }
      };
      for (const g of s.groupBy) {
        if (g.kind === 'number' && Number.isInteger(g.value)) {
          const target = s.columns[g.value - 1];
          if (target && target.expr.kind !== 'star') addGroupedExpr(target.expr);
        } else {
          addGroupedExpr(g);
        }
      }
      // PostgreSQL functional dependency: grouping by a table's primary key groups all of its columns.
      for (const entry of scope) {
        const pk = entry.table.columns.find((c) => c.primaryKey);
        if (pk && groupedCols.has(`${entry.qualifier}.${pk.name}`.toLowerCase())) {
          entry.table.columns.forEach((c) => groupedCols.add(`${entry.qualifier}.${c.name}`.toLowerCase()));
        }
      }
      const reported = new Set<string>();
      const walk = (e: Expr, where: string) => {
        if (groupKeys.has(exprToSql(e))) return;
        switch (e.kind) {
          case 'func':
            if (e.aggregate) return;
            e.args.forEach((a) => walk(a, where));
            return;
          case 'column': {
            const r = resolvedMap.get(e);
            if (!r) return; // already reported or alias
            const key = `${r.qualifier}.${r.column}`.toLowerCase();
            if (groupedCols.has(key) || reported.has(key)) return;
            reported.add(key);
            err(
              `Invalid GROUP BY: column '${e.table ? `${e.table}.` : ''}${e.name}' in ${where} must appear in the GROUP BY clause or be used in an aggregate function.`,
              loc.find(e.name, e.table),
              `Add '${e.table ? `${e.table}.` : ''}${e.name}' to GROUP BY, or wrap it in an aggregate such as MAX(${e.name}).`,
            );
            return;
          }
          case 'binary':
            walk(e.left, where);
            walk(e.right, where);
            return;
          case 'unary':
            walk(e.operand, where);
            return;
          case 'between':
            walk(e.expr, where);
            walk(e.low, where);
            walk(e.high, where);
            return;
          case 'isnull':
            walk(e.expr, where);
            return;
          case 'list':
            e.items.forEach((i) => walk(i, where));
            return;
          case 'star': {
            const entries = e.table ? scope.filter((en) => en.qualifier.toLowerCase() === e.table!.toLowerCase()) : scope;
            const allGrouped = entries.length > 0 && entries.every((en) => en.table.columns.every((c) => groupedCols.has(`${en.qualifier}.${c.name}`.toLowerCase())));
            if (!allGrouped) err("'*' cannot be selected together with aggregates or GROUP BY unless every column is grouped.");
            return;
          }
          default:
            return;
        }
      };
      s.columns.forEach((c) => walk(c.expr, 'the select list'));
      if (s.having) walk(s.having, 'HAVING');
      s.orderBy.forEach((o) => {
        if (o.expr.kind === 'column' && !o.expr.table && aliasTypes.has(o.expr.name.toLowerCase()) && !resolvedMap.has(o.expr)) return;
        if (o.expr.kind === 'number') return;
        walk(o.expr, 'ORDER BY');
      });
    }
    if (s.limit !== undefined && (!Number.isInteger(s.limit) || s.limit < 0)) err('LIMIT must be a non-negative integer.');
    if (s.offset !== undefined && (!Number.isInteger(s.offset) || s.offset < 0)) err('OFFSET must be a non-negative integer.');
    notes.push(`Scope: ${scope.map((e) => (e.alias ? `${e.alias} → ${e.table.name}` : e.table.name)).join(', ') || '(empty)'}`);
  }

  function analyzeDmlWhere(table: TableMeta, where?: Expr, alias?: string) {
    const entry: ScopeEntry = { qualifier: alias ?? table.name, alias, table };
    scope.push(entry);
    if (where) {
      const ty = check(where, { clause: 'where', scope, inAggregate: false });
      if (ty !== 'BOOLEAN' && ty !== 'UNKNOWN' && ty !== 'NULL') err(`WHERE condition must be a boolean expression, but has type ${ty}.`);
    }
  }

  switch (stmt.type) {
    case 'select':
      analyzeSelect(stmt);
      break;
    case 'insert': {
      const table = findTable(schema, stmt.table);
      if (!table) {
        addTable(stmt.table);
        break;
      }
      scope.push({ qualifier: table.name, table });
      const cols = stmt.columns.length ? stmt.columns : table.columns.map((c) => c.name);
      const metas = cols.map((c) => {
        const m = table.columns.find((x) => x.name.toLowerCase() === c.toLowerCase());
        if (!m) {
          const sug = suggestName(c, table.columns.map((x) => x.name));
          err(`Column '${c}' does not exist in table '${table.name}'.${sug ? ` Did you mean '${sug}'?` : ''}`, loc.find(c), sug ? `Replace '${c}' with '${sug}'.` : undefined);
        }
        return m;
      });
      for (const c of table.columns) {
        if (!c.nullable && !c.primaryKey && stmt.columns.length && !cols.some((x) => x.toLowerCase() === c.name.toLowerCase())) {
          err(`Column '${c.name}' of table '${table.name}' is NOT NULL but is missing from the INSERT column list.`, undefined, `Add '${c.name}' and a value for it.`);
        }
      }
      stmt.rows.forEach((row, ri) => {
        if (row.length !== cols.length) {
          err(`Row ${ri + 1} has ${row.length} value${row.length === 1 ? '' : 's'} but ${cols.length} column${cols.length === 1 ? ' is' : 's are'} expected.`);
          return;
        }
        row.forEach((v, ci) => {
          if (containsColumnRef(v)) {
            err(`VALUES cannot reference columns ('${exprToSql(v)}').`);
            return;
          }
          const ty = check(v, { clause: 'dml', scope: [], inAggregate: false });
          const m = metas[ci];
          if (!m) return;
          if (ty === 'NULL' && !m.nullable) err(`Column '${m.name}' is NOT NULL but row ${ri + 1} supplies NULL.`);
          else if (!compatible(m.type, ty, undefined, v)) err(`Type mismatch: column '${m.name}' is ${m.type} but row ${ri + 1} supplies ${ty} ('${exprToSql(v)}').`);
        });
      });
      notes.push(`INSERT target: ${table.name}`);
      break;
    }
    case 'update': {
      const table = findTable(schema, stmt.table);
      if (!table) {
        addTable(stmt.table);
        break;
      }
      for (const a of stmt.assignments) {
        const m = table.columns.find((c) => c.name.toLowerCase() === a.column.toLowerCase());
        if (!m) {
          const sug = suggestName(a.column, table.columns.map((x) => x.name));
          err(`Column '${a.column}' does not exist in table '${table.name}'.${sug ? ` Did you mean '${sug}'?` : ''}`, loc.find(a.column), sug ? `Replace '${a.column}' with '${sug}'.` : undefined);
          continue;
        }
        const ty = check(a.value, { clause: 'dml', scope: [{ qualifier: stmt.alias ?? table.name, alias: stmt.alias, table }], inAggregate: false });
        if (ty === 'NULL' && !m.nullable) err(`Column '${m.name}' is NOT NULL and cannot be set to NULL.`);
        else if (!compatible(m.type, ty, undefined, a.value)) err(`Type mismatch: cannot assign ${ty} ('${exprToSql(a.value)}') to column '${m.name}' of type ${m.type}.`);
      }
      analyzeDmlWhere(table, stmt.where, stmt.alias);
      notes.push(`UPDATE target: ${table.name}`);
      break;
    }
    case 'delete': {
      const table = findTable(schema, stmt.table);
      if (!table) {
        addTable(stmt.table);
        break;
      }
      analyzeDmlWhere(table, stmt.where, stmt.alias);
      notes.push(`DELETE target: ${table.name}`);
      break;
    }
  }

  return {
    ok: !diagnostics.some((d) => d.severity === 'error'),
    diagnostics,
    scope: scope.map((s) => ({ qualifier: s.qualifier, table: s.table.name })),
    resolvedColumns: resolvedList,
    outputColumns,
    notes,
  };
}

function containsColumnRef(e: Expr): boolean {
  switch (e.kind) {
    case 'column':
    case 'star':
      return true;
    case 'binary':
      return containsColumnRef(e.left) || containsColumnRef(e.right);
    case 'unary':
      return containsColumnRef(e.operand);
    case 'func':
      return e.args.some(containsColumnRef);
    case 'list':
      return e.items.some(containsColumnRef);
    default:
      return false;
  }
}

export { containsAggregate };
