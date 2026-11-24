import { Parser } from 'node-sql-parser/build/postgresql';
import type { Diagnostic, Expr, ParseResult, SourceLocation, Statement, Token, TreeNode } from '@/types/compiler';
import { tokenize } from '../lexer';
import { suggestName } from '../semantic/schema';
import { locationFromOffsets, makeDiagnostic } from '../diagnostics';
import { convertStatement, UnsupportedSyntaxError } from './adapter';
import { exprToSql } from '../codegen/printer';

const sqlParser = new Parser();

// ─────────── Parse tree construction (for the UI) ───────────
function exprTree(e: Expr): TreeNode {
  switch (e.kind) {
    case 'column':
      return { label: 'Column', detail: e.table ? `${e.table}.${e.name}` : e.name, children: [] };
    case 'star':
      return { label: 'Star', detail: e.table ? `${e.table}.*` : '*', children: [] };
    case 'number':
      return { label: 'Number', detail: e.raw, children: [] };
    case 'string':
      return { label: 'String', detail: `'${e.value}'`, children: [] };
    case 'boolean':
      return { label: 'Boolean', detail: e.value ? 'TRUE' : 'FALSE', children: [] };
    case 'null':
      return { label: 'Null', children: [] };
    case 'list':
      return { label: 'List', children: e.items.map(exprTree) };
    case 'func':
      return { label: e.aggregate ? 'Aggregate' : 'Function', detail: `${e.name}${e.distinct ? ' DISTINCT' : ''}`, children: e.args.map(exprTree) };
    case 'unary':
      return { label: 'Unary', detail: e.op, children: [exprTree(e.operand)] };
    case 'between':
      return { label: e.negated ? 'NotBetween' : 'Between', children: [exprTree(e.expr), exprTree(e.low), exprTree(e.high)] };
    case 'isnull':
      return { label: e.negated ? 'IsNotNull' : 'IsNull', children: [exprTree(e.expr)] };
    case 'binary':
      return { label: 'BinaryExpr', detail: e.op, children: [exprTree(e.left), exprTree(e.right)] };
    case 'unsupported':
      return { label: 'Unsupported', detail: e.description, children: [] };
  }
}

export function buildTree(st: Statement): TreeNode {
  switch (st.type) {
    case 'select': {
      const children: TreeNode[] = [];
      children.push({
        label: 'SelectList',
        detail: st.distinct ? 'DISTINCT' : undefined,
        children: st.columns.map((c) => ({ label: 'SelectItem', detail: c.alias ? `AS ${c.alias}` : undefined, children: [exprTree(c.expr)] })),
      });
      children.push({
        label: 'From',
        children: st.from.map((t) => ({
          label: t.join ? 'Join' : 'Table',
          detail: `${t.join ? t.join + ' ' : ''}${t.table}${t.alias ? ' AS ' + t.alias : ''}`,
          children: t.on ? [{ label: 'On', children: [exprTree(t.on)] }] : [],
        })),
      });
      if (st.where) children.push({ label: 'Where', children: [exprTree(st.where)] });
      if (st.groupBy.length) children.push({ label: 'GroupBy', children: st.groupBy.map(exprTree) });
      if (st.having) children.push({ label: 'Having', children: [exprTree(st.having)] });
      if (st.orderBy.length) children.push({ label: 'OrderBy', children: st.orderBy.map((o) => ({ label: 'OrderItem', detail: o.direction, children: [exprTree(o.expr)] })) });
      if (st.limit !== undefined) children.push({ label: 'Limit', detail: String(st.limit), children: [] });
      if (st.offset !== undefined) children.push({ label: 'Offset', detail: String(st.offset), children: [] });
      return { label: 'SelectStatement', children };
    }
    case 'insert':
      return {
        label: 'InsertStatement',
        detail: st.table,
        children: [
          { label: 'Columns', children: st.columns.map((c) => ({ label: 'Column', detail: c, children: [] })) },
          { label: 'Rows', children: st.rows.map((r, i) => ({ label: `Row ${i + 1}`, children: r.map(exprTree) })) },
        ],
      };
    case 'update':
      return {
        label: 'UpdateStatement',
        detail: st.table,
        children: [
          { label: 'Set', children: st.assignments.map((a) => ({ label: 'Assignment', detail: a.column, children: [exprTree(a.value)] })) },
          ...(st.where ? [{ label: 'Where', children: [exprTree(st.where)] }] : []),
        ],
      };
    case 'delete':
      return { label: 'DeleteStatement', detail: st.table, children: st.where ? [{ label: 'Where', children: [exprTree(st.where)] }] : [] };
  }
}

// ─────────── Error message cleanup ───────────
interface PegError {
  message?: string;
  found?: string | null;
  expected?: { type: string; text?: string; description?: string }[];
  location?: { start: { offset: number; line: number; column: number }; end: { offset: number; line: number; column: number } };
}

function describeToken(t: Token): string {
  switch (t.type) {
    case 'KEYWORD': return `keyword '${t.lexeme.toUpperCase()}'`;
    case 'IDENTIFIER': case 'QUOTED_IDENTIFIER': return `identifier ${t.lexeme}`;
    case 'STRING': return `string literal ${t.lexeme}`;
    case 'NUMBER': return `number ${t.lexeme}`;
    default: return `'${t.lexeme}'`;
  }
}

const STATEMENT_KEYWORDS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

/**
 * Builds a readable message from the parser's failure. The PEG parser reports the offset of the
 * furthest failure; we snap it to the lexer token that covers it. The suggestion lists keywords the
 * parser itself said it expected - nothing is invented.
 */
function describeSyntaxError(err: PegError, source: string, tokens: Token[]): { message: string; suggestion?: string; location?: SourceLocation } {
  const real = tokens.filter((t) => t.type !== 'COMMENT');
  const offset = err.location?.start.offset;
  const expectedTexts = [...new Set((err.expected ?? []).map((e) => e.text ?? e.description ?? '').filter(Boolean))];
  const keywordHints = expectedTexts.filter((t) => /^[A-Za-z_]{2,}$/.test(t) && !['CAST', 'NULL', 'DUAL', 'LATERAL', 'FOR', 'E'].includes(t.toUpperCase())).map((t) => t.toUpperCase());

  // 1. Misspelled / unknown statement keyword at the very start
  const first = real[0];
  if (first && first.type === 'IDENTIFIER' && offset !== undefined && offset <= (real[1]?.end ?? first.end)) {
    const guess = suggestName(first.lexeme, STATEMENT_KEYWORDS);
    return {
      message: `Unrecognized statement keyword '${first.lexeme}'.${guess ? ` Did you mean '${guess}'?` : ''}`,
      suggestion: `A statement must start with ${STATEMENT_KEYWORDS.join(', ')}.`,
      location: locationFromOffsets(source, first.start, first.end),
    };
  }

  // 2. End of input
  if (err.found === null || err.found === undefined || (offset !== undefined && offset >= source.trimEnd().length)) {
    const last = real[real.length - 1];
    return {
      message: 'Unexpected end of input: the statement is incomplete.',
      suggestion: last ? `Complete the statement after '${last.lexeme}' (a condition, column, table name or closing parenthesis may be missing).` : undefined,
      location: last ? locationFromOffsets(source, last.start, last.end) : undefined,
    };
  }

  // 3. Unexpected token
  const tok = offset === undefined ? undefined : real.find((t) => offset >= t.start && offset < t.end);
  const prev = tok ? real[real.indexOf(tok) - 1] : undefined;
  const found = tok ? describeToken(tok) : `'${err.found}'`;
  let suggestion: string | undefined;
  if (keywordHints.length > 0 && keywordHints.length <= 4) suggestion = `The parser expected ${keywordHints.join(' or ')} here${prev && prev !== tok ? ` (after '${prev.lexeme}')` : ''}.`;
  else if (expectedTexts.some((t) => ['(', '.'].includes(t))) suggestion = `An expression, column name or value was expected before ${found}.`;
  else if (expectedTexts.length) suggestion = `Check the syntax near ${found}.`;
  return {
    message: `Unexpected ${found}.`,
    suggestion,
    location: tok ? locationFromOffsets(source, tok.start, tok.end) : err.location ? locationFromOffsets(source, err.location.start.offset, err.location.start.offset + 1) : undefined,
  };
}

// ─────────── Public API ───────────
export function parse(source: string): ParseResult {
  if (source.trim() === '') {
    return { ok: false, diagnostics: [makeDiagnostic('Syntax Error', 'The query is empty. Enter a SQL statement to compile.')] };
  }

  let ast: unknown;
  try {
    const out = sqlParser.parse(source, { database: 'PostgresQL' });
    ast = out.ast;
  } catch (e) {
    const err = e as PegError;
    const diagnostics: Diagnostic[] = [];
    if (!err.location && !err.expected) {
      diagnostics.push(makeDiagnostic('Syntax Error', `${(e as Error).message.replace(/^Error:\s*/, '')}`));
      return { ok: false, diagnostics };
    }
    const { message, suggestion, location } = describeSyntaxError(err, source, tokenize(source).tokens);
    diagnostics.push(makeDiagnostic('Syntax Error', message, { location, suggestion }));
    return { ok: false, diagnostics };
  }

  const stmts = Array.isArray(ast) ? ast : [ast];
  if (stmts.length === 0) {
    return { ok: false, rawAst: ast, diagnostics: [makeDiagnostic('Syntax Error', 'No statement found.')] };
  }
  if (stmts.length > 1) {
    return {
      ok: false,
      rawAst: ast,
      diagnostics: [
        makeDiagnostic('Syntax Error', `Unsupported syntax: ${stmts.length} statements were found. This compiler handles one statement at a time.`, {
          suggestion: 'Compile each statement separately.',
        }),
      ],
    };
  }

  try {
    const statement = convertStatement(stmts[0]);
    return { ok: true, statement, rawAst: ast, tree: buildTree(statement), diagnostics: [] };
  } catch (e) {
    if (e instanceof UnsupportedSyntaxError) {
      return {
        ok: false,
        rawAst: ast,
        diagnostics: [
          makeDiagnostic('Syntax Error', `Unsupported syntax: ${e.description} is not supported by this compiler subset.`, {
            suggestion: 'See the Project Information page for the list of supported SQL features.',
          }),
        ],
      };
    }
    throw e;
  }
}

export { exprToSql };
