import type { Diagnostic, LexResult, Token, TokenType } from '@/types/compiler';
import { locationFromOffsets, makeDiagnostic } from '../diagnostics';
import { SQL_KEYWORDS } from './keywords';

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
const isIdentStart = (c: string | undefined) => c !== undefined && /[A-Za-z_]/.test(c);
const isIdentPart = (c: string | undefined) => c !== undefined && /[A-Za-z0-9_$]/.test(c);

/**
 * Hand-written scanner. It never splits tokens inside string literals or comments,
 * and records token index, lexeme, type, line, column and start/end offsets.
 * Whitespace is skipped (not emitted); comments are emitted as COMMENT tokens.
 */
export function tokenize(source: string): LexResult {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0; // offset of first char of current line

  const push = (type: TokenType, start: number, end: number, startLine: number, startLineStart: number) => {
    tokens.push({
      index: tokens.length,
      lexeme: source.slice(start, end),
      type,
      line: startLine,
      column: start - startLineStart + 1,
      start,
      end,
    });
  };

  /** Advance over `count` chars while keeping line bookkeeping correct. */
  const advanceTo = (target: number) => {
    while (i < target) {
      if (source[i] === '\n') {
        line++;
        lineStart = i + 1;
      }
      i++;
    }
  };

  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];

    // whitespace
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f') {
      advanceTo(i + 1);
      continue;
    }

    const start = i;
    const startLine = line;
    const startLineStart = lineStart;

    // -- line comment
    if (c === '-' && next === '-') {
      let j = i + 2;
      while (j < source.length && source[j] !== '\n') j++;
      advanceTo(j);
      push('COMMENT', start, j, startLine, startLineStart);
      continue;
    }

    // /* block comment */
    if (c === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      if (close === -1) {
        advanceTo(source.length);
        push('COMMENT', start, source.length, startLine, startLineStart);
        diagnostics.push(
          makeDiagnostic('Lexical Error', 'Unterminated block comment: missing closing */', {
            location: locationFromOffsets(source, start, source.length),
            suggestion: 'Add */ to close the comment.',
          }),
        );
      } else {
        advanceTo(close + 2);
        push('COMMENT', start, close + 2, startLine, startLineStart);
      }
      continue;
    }

    // 'string literal' ('' is an escaped quote)
    if (c === "'") {
      let j = i + 1;
      let closed = false;
      while (j < source.length) {
        if (source[j] === "'") {
          if (source[j + 1] === "'") {
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        j++;
      }
      advanceTo(j);
      if (closed) {
        push('STRING', start, j, startLine, startLineStart);
      } else {
        push('INVALID', start, j, startLine, startLineStart);
        diagnostics.push(
          makeDiagnostic('Lexical Error', 'Unterminated string literal: missing closing single quote', {
            location: locationFromOffsets(source, start, j),
            suggestion: "Add a closing ' at the end of the string.",
          }),
        );
      }
      continue;
    }

    // "quoted identifier" or `quoted identifier`
    if (c === '"' || c === '`') {
      let j = i + 1;
      let closed = false;
      while (j < source.length) {
        if (source[j] === c) {
          if (source[j + 1] === c) {
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        j++;
      }
      advanceTo(j);
      if (closed) {
        push('QUOTED_IDENTIFIER', start, j, startLine, startLineStart);
      } else {
        push('INVALID', start, j, startLine, startLineStart);
        diagnostics.push(
          makeDiagnostic('Lexical Error', `Unterminated quoted identifier: missing closing ${c}`, {
            location: locationFromOffsets(source, start, j),
            suggestion: `Add a closing ${c}.`,
          }),
        );
      }
      continue;
    }

    // numbers: 12, 3.14, 1e5, 2.5E-3
    if (isDigit(c)) {
      let j = i;
      while (isDigit(source[j])) j++;
      if (source[j] === '.' && isDigit(source[j + 1])) {
        j++;
        while (isDigit(source[j])) j++;
      }
      if ((source[j] === 'e' || source[j] === 'E') && (isDigit(source[j + 1]) || ((source[j + 1] === '+' || source[j + 1] === '-') && isDigit(source[j + 2])))) {
        j += 2;
        while (isDigit(source[j])) j++;
      }
      // identifier glued to number, e.g. 12abc
      if (isIdentStart(source[j])) {
        let k = j;
        while (isIdentPart(source[k])) k++;
        advanceTo(k);
        push('INVALID', start, k, startLine, startLineStart);
        diagnostics.push(
          makeDiagnostic('Lexical Error', `Malformed token '${source.slice(start, k)}': identifiers cannot start with a digit`, {
            location: locationFromOffsets(source, start, k),
            suggestion: 'Rename the identifier or quote it with double quotes.',
          }),
        );
        continue;
      }
      advanceTo(j);
      push('NUMBER', start, j, startLine, startLineStart);
      continue;
    }

    // identifiers / keywords / TRUE / FALSE / NULL
    if (isIdentStart(c)) {
      let j = i + 1;
      while (isIdentPart(source[j])) j++;
      const text = source.slice(start, j);
      const upper = text.toUpperCase();
      advanceTo(j);
      if (upper === 'TRUE' || upper === 'FALSE') push('BOOLEAN', start, j, startLine, startLineStart);
      else if (upper === 'NULL') push('NULL', start, j, startLine, startLineStart);
      else if (SQL_KEYWORDS.has(upper)) push('KEYWORD', start, j, startLine, startLineStart);
      else push('IDENTIFIER', start, j, startLine, startLineStart);
      continue;
    }

    // multi-character operators
    const two = source.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>' || two === '!=' || two === '||') {
      advanceTo(i + 2);
      push('OPERATOR', start, i, startLine, startLineStart);
      continue;
    }

    // single-character tokens
    if ('=<>+-*/%'.includes(c)) {
      advanceTo(i + 1);
      push('OPERATOR', start, i, startLine, startLineStart);
      continue;
    }
    if (c === ',') { advanceTo(i + 1); push('COMMA', start, i, startLine, startLineStart); continue; }
    if (c === '(') { advanceTo(i + 1); push('LPAREN', start, i, startLine, startLineStart); continue; }
    if (c === ')') { advanceTo(i + 1); push('RPAREN', start, i, startLine, startLineStart); continue; }
    if (c === ';') { advanceTo(i + 1); push('SEMICOLON', start, i, startLine, startLineStart); continue; }
    if (c === '.') { advanceTo(i + 1); push('DOT', start, i, startLine, startLineStart); continue; }

    // anything else is an invalid character
    advanceTo(i + 1);
    push('INVALID', start, i, startLine, startLineStart);
    diagnostics.push(
      makeDiagnostic('Lexical Error', `Invalid character '${c}'`, {
        location: locationFromOffsets(source, start, i),
        suggestion: 'Remove the character, or put it inside a string literal.',
      }),
    );
  }

  return { tokens, diagnostics };
}
