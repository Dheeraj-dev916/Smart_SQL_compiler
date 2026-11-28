import { Parser } from 'node-sql-parser';
import type { ColumnMeta, SchemaMeta, SqlType, TableMeta } from '@/types/compiler';
import { ACADEMIC_SCHEMA } from '@/compiler/semantic/schema';

export interface DatasetTable {
  name: string;
  columns: ColumnMeta[];
  rows: (string | number | boolean | null)[][];
}

export interface CustomDataset {
  name: string;
  tables: DatasetTable[];
}

export const DATASET_KEY = 'ssc.dataset';
export const MAX_DATASET_ROWS = 10000;

/** Normalizes any arbitrary header/filename into a safe SQL identifier. */
export function sanitizeIdent(raw: string, fallback = 'col'): string {
  let s = raw.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!s) s = fallback;
  if (/^[0-9]/.test(s)) s = `_${s}`;
  return s;
}

function makeUniqueNames(names: string[], fallbackPrefix: string): string[] {
  const seen = new Map<string, number>();
  return names.map((raw, i) => {
    const base = sanitizeIdent(raw, `${fallbackPrefix}_${i + 1}`);
    const lower = base.toLowerCase();
    const count = seen.get(lower) ?? 0;
    seen.set(lower, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function parseCell(raw: string): string | number | boolean | null {
  const t = raw.trim();
  if (t === '' || /^null$/i.test(t)) return null;
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
  if (/^-?\d+$/.test(t)) {
    const n = Number(t);
    if (Number.isSafeInteger(n)) return n;
  }
  if (/^-?\d+\.\d+$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return raw;
}

function inferColumnMeta(name: string, values: (string | number | boolean | null)[]): ColumnMeta {
  let nullable = false;
  let sawInt = false;
  let sawDec = false;
  let sawBool = false;
  let sawText = false;

  for (const v of values) {
    if (v === null || v === undefined) {
      nullable = true;
      continue;
    }
    if (typeof v === 'boolean') sawBool = true;
    else if (typeof v === 'number') {
      if (Number.isInteger(v)) sawInt = true;
      else sawDec = true;
    } else {
      sawText = true;
    }
  }

  let type: SqlType = 'TEXT';
  if (!sawText) {
    if (sawBool && !sawInt && !sawDec) type = 'BOOLEAN';
    else if (sawDec && !sawBool) type = 'DECIMAL';
    else if (sawInt && !sawBool) type = 'INTEGER';
  }

  return { name, type, nullable };
}

/** RFC-4180 CSV parser (handles quoted fields, escaped quotes, CRLF/LF, and auto-detects comma/tab/semicolon). */
export function parseCsvText(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];
  const firstLine = cleaned.split(/\r?\n/, 1)[0] ?? '';
  const delim =
    (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
      ? '\t'
      : (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
        ? ';'
        : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && cleaned[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export function parseCsvTable(tableName: string, csvText: string): DatasetTable {
  const grid = parseCsvText(csvText);
  if (grid.length < 1) throw new Error('CSV is empty. Provide a header row and at least one data row.');
  const headers = makeUniqueNames(grid[0], 'col');
  if (headers.length === 0) throw new Error('No columns found in CSV header.');

  const dataRows = grid.slice(1, MAX_DATASET_ROWS + 1);
  const typedRows = dataRows.map((r) => headers.map((_, ci) => parseCell(r[ci] ?? '')));
  const columns = headers.map((name, ci) => inferColumnMeta(name, typedRows.map((r) => r[ci])));
  return { name: sanitizeIdent(tableName, 'imported_table'), columns, rows: typedRows };
}

function normalizeJsonValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function tableFromObjects(tableName: string, items: Record<string, unknown>[]): DatasetTable {
  if (items.length === 0) throw new Error(`Table '${tableName}' has no rows.`);
  const rawKeys: string[] = [];
  const keySet = new Set<string>();
  for (const item of items.slice(0, MAX_DATASET_ROWS)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('JSON rows must be objects (e.g. [{"id": 1, "name": "Alice"}]).');
    }
    for (const k of Object.keys(item)) {
      if (!keySet.has(k)) {
        keySet.add(k);
        rawKeys.push(k);
      }
    }
  }
  if (rawKeys.length === 0) throw new Error(`Table '${tableName}' has no columns.`);
  const colNames = makeUniqueNames(rawKeys, 'col');
  const rows = items.slice(0, MAX_DATASET_ROWS).map((item) =>
    rawKeys.map((k) => normalizeJsonValue(item[k])),
  );
  const columns = colNames.map((name, ci) => inferColumnMeta(name, rows.map((r) => r[ci])));
  return { name: sanitizeIdent(tableName, 'imported_table'), columns, rows };
}

/** Parses either a JSON array of objects (single table) or `{ tableName: rows[] }` (multi-table). */
export function parseJsonDataset(defaultTableName: string, jsonText: string): DatasetTable[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid JSON syntax.');
  }
  if (Array.isArray(parsed)) {
    return [tableFromObjects(defaultTableName, parsed as Record<string, unknown>[])];
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.tables)) {
      // Structured CustomDataset export format
      return (obj.tables as DatasetTable[]).map((t) => ({
        name: sanitizeIdent(String(t.name ?? 'table'), 'table'),
        columns: (t.columns ?? []).map((c) => ({
          name: sanitizeIdent(String(c.name ?? 'col'), 'col'),
          type: c.type ?? 'TEXT',
          nullable: Boolean(c.nullable),
          primaryKey: Boolean(c.primaryKey),
        })),
        rows: (t.rows ?? []).slice(0, MAX_DATASET_ROWS),
      }));
    }
    const entries = Object.entries(obj).filter(([, v]) => Array.isArray(v));
    if (entries.length === 0) {
      throw new Error('JSON must be an array of row objects or an object mapping table names to row arrays.');
    }
    return entries.map(([name, rows]) => tableFromObjects(name, rows as Record<string, unknown>[]));
  }
  throw new Error('JSON must be an array of objects or an object of tables.');
}

export function datasetToSchema(dataset: CustomDataset | null): SchemaMeta {
  if (!dataset || dataset.tables.length === 0) return ACADEMIC_SCHEMA;
  const tables: TableMeta[] = dataset.tables.map((t) => ({
    name: t.name,
    columns: t.columns,
  }));
  return { name: dataset.name || 'custom', tables };
}

export function mergeDatasetTables(existing: CustomDataset | null, incoming: DatasetTable[], mode: 'add' | 'replace'): CustomDataset {
  if (mode === 'replace' || !existing) {
    return { name: 'custom', tables: incoming };
  }
  const byName = new Map(existing.tables.map((t) => [t.name.toLowerCase(), t]));
  for (const t of incoming) {
    byName.set(t.name.toLowerCase(), t);
  }
  return { name: existing.name || 'custom', tables: [...byName.values()] };
}

function mapSqlType(rawType: unknown): SqlType {
  const t = String(rawType ?? 'TEXT').toUpperCase();
  if (/INT|SERIAL/.test(t)) return 'INTEGER';
  if (/DEC|NUM|REAL|FLOAT|DOUBLE/.test(t)) return 'DECIMAL';
  if (/BOOL/.test(t)) return 'BOOLEAN';
  return 'TEXT';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSqlIdent(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node.value === 'string') return node.value;
  if (node.expr) return extractSqlIdent(node.expr);
  if (node.column) return extractSqlIdent(node.column);
  return '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSqlLiteral(node: any): string | number | boolean | null {
  if (!node) return null;
  if (node.type === 'null') return null;
  if (node.type === 'bool') return Boolean(node.value);
  if (node.type === 'number') {
    const n = Number(node.value);
    return Number.isFinite(n) ? n : String(node.value);
  }
  if (node.type === 'single_quote_string' || node.type === 'string' || node.type === 'double_quote_string') {
    return String(node.value ?? '');
  }
  if (node.type === 'unary_expr' && node.operator === '-' && node.expr?.type === 'number') {
    const n = -Number(node.expr.value);
    return Number.isFinite(n) ? n : null;
  }
  return node.value !== undefined ? String(node.value) : null;
}

/** Splits a SQL script into individual statements, respecting quotes and comments. */
function splitSqlStatements(sql: string): string[] {
  const stmts: string[] = [];
  let start = 0;
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i++;
      while (i < n) {
        if (sql[i] === '\\') {
          i += 2;
          continue;
        }
        if (sql[i] === c) {
          if (sql[i + 1] === c) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === ';') {
      const s = sql.slice(start, i).trim();
      if (s) stmts.push(s);
      start = i + 1;
    }
    i++;
  }
  const tail = sql.slice(start).trim();
  if (tail) stmts.push(tail);
  return stmts;
}

/** Strips leading comments and checks the starting SQL keyword(s). */
function stripLeadingComments(stmt: string): string {
  return stmt.replace(/^(?:\s|--[^\r\n]*|\/\*[\s\S]*?\*\/)+/g, '').trim();
}

/** Parses CREATE TABLE and INSERT INTO statements from a .sql script into DatasetTable[]. */
export function parseSqlDataset(sqlText: string): DatasetTable[] {
  const cleaned = sqlText.replace(/^\uFEFF/, '').trim();
  if (!cleaned) throw new Error('SQL input is empty.');

  const parser = new Parser();
  const rawStmts = splitSqlStatements(cleaned);
  const tables = new Map<string, DatasetTable>();
  let lastParseErr: unknown;

  for (const rawStmt of rawStmts) {
    const head = stripLeadingComments(rawStmt);
    if (!head) continue;
    const isCreateTable = /^CREATE\s+(?:TEMP(?:ORARY)?\s+|UNLOGGED\s+)?TABLE\b/i.test(head);
    const isInsert = /^INSERT\s+(?:IGNORE\s+)?INTO\b/i.test(head);
    if (!isCreateTable && !isInsert) continue; // skip SET, DROP, USE, BEGIN, COMMIT, LOCK, ALTER, CREATE INDEX, etc.

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ast: any = null;
    for (const database of ['PostgreSQL', 'SQLite', 'MySQL']) {
      try {
        ast = parser.astify(head, { database });
        break;
      } catch (e) {
        lastParseErr = e;
      }
    }
    if (!ast) continue;

    const stList = Array.isArray(ast) ? ast : [ast];
    for (const st of stList) {
      if (!st || typeof st !== 'object') continue;
      if (st.type === 'create' && String(st.keyword ?? '').toLowerCase() === 'table') {
        const rawName = st.table?.[0]?.table;
        if (!rawName) continue;
        const tableName = sanitizeIdent(String(rawName), 'table');
        const cols: ColumnMeta[] = [];
        const pkCols = new Set<string>();

        for (const def of st.create_definitions ?? []) {
          if (def.resource === 'column') {
            const colName = sanitizeIdent(extractSqlIdent(def.column), `col_${cols.length + 1}`);
            const isPk = Boolean(def.primary_key);
            const notNull = def.nullable?.type === 'not null' || isPk;
            cols.push({
              name: colName,
              type: mapSqlType(def.definition?.dataType),
              nullable: !notNull,
              ...(isPk ? { primaryKey: true } : {}),
            });
          } else if (def.resource === 'constraint' && String(def.constraint_type ?? '').toLowerCase() === 'primary key') {
            for (const d of def.definition ?? []) {
              const pkName = sanitizeIdent(extractSqlIdent(d), '');
              if (pkName) pkCols.add(pkName.toLowerCase());
            }
          }
        }

        if (pkCols.size > 0) {
          for (const c of cols) {
            if (pkCols.has(c.name.toLowerCase())) {
              c.primaryKey = true;
              c.nullable = false;
            }
          }
        }
        if (cols.length > 0) {
          tables.set(tableName.toLowerCase(), { name: tableName, columns: cols, rows: [] });
        }
      } else if (st.type === 'insert') {
        const rawName = st.table?.[0]?.table;
        if (!rawName) continue;
        const key = sanitizeIdent(String(rawName), 'table').toLowerCase();
        const target = tables.get(key);
        if (!target) continue;
        if (st.values?.type !== 'values' || !Array.isArray(st.values.values)) continue;

        const insertCols: string[] = Array.isArray(st.columns) && st.columns.length > 0
          ? st.columns.map((c: unknown) => sanitizeIdent(extractSqlIdent(c), '').toLowerCase())
          : target.columns.map((c) => c.name.toLowerCase());

        for (const rowNode of st.values.values) {
          if (target.rows.length >= MAX_DATASET_ROWS) break;
          const vals = Array.isArray(rowNode?.value) ? rowNode.value : [];
          const row = target.columns.map((col) => {
            const idx = insertCols.indexOf(col.name.toLowerCase());
            return idx >= 0 && idx < vals.length ? extractSqlLiteral(vals[idx]) : null;
          });
          target.rows.push(row);
        }
      }
    }
  }

  const out = [...tables.values()];
  if (out.length === 0) {
    const hint = lastParseErr instanceof Error ? ` (${lastParseErr.message.split('\n')[0]})` : '';
    throw new Error(`No valid CREATE TABLE statements were found in the SQL script${hint}.`);
  }
  return out;
}
