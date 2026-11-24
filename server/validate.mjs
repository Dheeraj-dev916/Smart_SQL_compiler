/**
 * Independent safety check for the execution sandbox.
 *
 * This deliberately does NOT use the compiler's lexer/parser: the execution boundary must not trust
 * the front-end's output. It scans the raw text once (respecting strings, quoted identifiers and
 * comments) and allows exactly one read-only SELECT statement.
 */
export const MAX_SQL_LENGTH = 4000;

const FORBIDDEN_WORDS = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'ATTACH', 'DETACH', 'PRAGMA',
  'VACUUM', 'REINDEX', 'ANALYZE', 'TRUNCATE', 'GRANT', 'REVOKE', 'BEGIN', 'COMMIT', 'ROLLBACK',
  'SAVEPOINT', 'RELEASE', 'WITH', 'RECURSIVE', 'LOAD_EXTENSION', 'RANDOMBLOB', 'ZEROBLOB', 'PRINTF', 'EXPLAIN',
]);

/** @returns {{ ok: true, sql: string } | { ok: false, error: string }} */
export function validateSelect(input) {
  if (typeof input !== 'string') return { ok: false, error: 'sql must be a string' };
  if (input.length > MAX_SQL_LENGTH) return { ok: false, error: `Query is too long (max ${MAX_SQL_LENGTH} characters)` };
  if (input.includes('\0')) return { ok: false, error: 'Query contains a NUL character' };

  const words = [];
  let semicolons = 0;
  let sawContentAfterSemicolon = false;
  let i = 0;
  let cleaned = ''; // text with comments removed
  while (i < input.length) {
    const c = input[i];
    const n = input[i + 1];
    if (c === '-' && n === '-') {
      while (i < input.length && input[i] !== '\n') i++;
      cleaned += ' ';
      continue;
    }
    if (c === '/' && n === '*') {
      const end = input.indexOf('*/', i + 2);
      if (end === -1) return { ok: false, error: 'Unterminated comment' };
      i = end + 2;
      cleaned += ' ';
      continue;
    }
    if (c === "'" || c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      let j = i + 1;
      for (;;) {
        if (j >= input.length) return { ok: false, error: 'Unterminated string or quoted identifier' };
        if (input[j] === close) {
          if (input[j + 1] === close && c !== '[') { j += 2; continue; }
          break;
        }
        j++;
      }
      if (semicolons > 0) sawContentAfterSemicolon = true;
      cleaned += input.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === ';') {
      semicolons++;
      cleaned += c;
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_$]/.test(input[j])) j++;
      words.push(input.slice(i, j).toUpperCase());
      if (semicolons > 0) sawContentAfterSemicolon = true;
      cleaned += input.slice(i, j);
      i = j;
      continue;
    }
    if (!/\s/.test(c) && semicolons > 0) sawContentAfterSemicolon = true;
    cleaned += c;
    i++;
  }
  if (words.length === 0) return { ok: false, error: 'Empty query' };
  if (words[0] !== 'SELECT') return { ok: false, error: 'Only SELECT statements can be executed in the sandbox' };
  if (semicolons > 1 || sawContentAfterSemicolon) return { ok: false, error: 'Only a single statement is allowed' };
  const bad = words.find((w) => FORBIDDEN_WORDS.has(w) || w.startsWith('SQLITE_'));
  if (bad) return { ok: false, error: `Keyword or object '${bad}' is not allowed in the sandbox` };
  return { ok: true, sql: cleaned.trim().replace(/;\s*$/, '') };
}
