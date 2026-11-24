import { describe, expect, it } from 'vitest';
import { tokenize } from './lexer';

const types = (sql: string) => tokenize(sql).tokens.map((t) => t.type);
const lexemes = (sql: string) => tokenize(sql).tokens.map((t) => t.lexeme);

describe('lexer', () => {
  it('recognizes keywords case-insensitively and identifiers', () => {
    const { tokens } = tokenize('select Name FROM students');
    expect(tokens.map((t) => t.type)).toEqual(['KEYWORD', 'IDENTIFIER', 'KEYWORD', 'IDENTIFIER']);
    expect(tokens[0].lexeme).toBe('select');
  });

  it('recognizes string literals and does not split inside them', () => {
    const { tokens, diagnostics } = tokenize("WHERE d = 'Computer, Science -- not a comment'");
    expect(diagnostics).toHaveLength(0);
    const str = tokens.find((t) => t.type === 'STRING');
    expect(str?.lexeme).toBe("'Computer, Science -- not a comment'");
    expect(tokens.some((t) => t.type === 'COMMENT')).toBe(false);
  });

  it('handles escaped quotes inside strings', () => {
    const { tokens, diagnostics } = tokenize("SELECT 'it''s'");
    expect(diagnostics).toHaveLength(0);
    expect(tokens[1]).toMatchObject({ type: 'STRING', lexeme: "'it''s'" });
  });

  it('recognizes integer, decimal and exponent numbers', () => {
    expect(lexemes('1 2.5 3e4 4.5E-2')).toEqual(['1', '2.5', '3e4', '4.5E-2']);
    expect(types('1 2.5 3e4')).toEqual(['NUMBER', 'NUMBER', 'NUMBER']);
  });

  it('recognizes boolean and NULL literals', () => {
    expect(types('TRUE false NULL')).toEqual(['BOOLEAN', 'BOOLEAN', 'NULL']);
  });

  it('recognizes multi-character operators', () => {
    expect(lexemes('a <= b >= c <> d != e')).toEqual(['a', '<=', 'b', '>=', 'c', '<>', 'd', '!=', 'e']);
    expect(types('<= >= <> !=')).toEqual(['OPERATOR', 'OPERATOR', 'OPERATOR', 'OPERATOR']);
  });

  it('recognizes punctuation and dot-qualified identifiers', () => {
    expect(types('s.name, (x);')).toEqual(['IDENTIFIER', 'DOT', 'IDENTIFIER', 'COMMA', 'LPAREN', 'IDENTIFIER', 'RPAREN', 'SEMICOLON']);
  });

  it('emits line and block comments as COMMENT tokens', () => {
    const { tokens, diagnostics } = tokenize('SELECT 1 -- trailing\n/* block\ncomment */ FROM t');
    expect(diagnostics).toHaveLength(0);
    expect(tokens.filter((t) => t.type === 'COMMENT').map((t) => t.lexeme)).toEqual(['-- trailing', '/* block\ncomment */']);
    const from = tokens.find((t) => t.lexeme === 'FROM')!;
    expect(from.line).toBe(3);
  });

  it('recognizes quoted identifiers', () => {
    expect(types('"my col" `x`')).toEqual(['QUOTED_IDENTIFIER', 'QUOTED_IDENTIFIER']);
  });

  it('records index, line, column and offsets', () => {
    const src = 'SELECT a\nFROM t';
    const { tokens } = tokenize(src);
    expect(tokens.map((t) => t.index)).toEqual([0, 1, 2, 3]);
    expect(tokens[1]).toMatchObject({ lexeme: 'a', line: 1, column: 8, start: 7, end: 8 });
    expect(tokens[2]).toMatchObject({ lexeme: 'FROM', line: 2, column: 1, start: 9, end: 13 });
    for (const t of tokens) expect(src.slice(t.start, t.end)).toBe(t.lexeme);
  });

  it('reports unterminated string literals with a location', () => {
    const { tokens, diagnostics } = tokenize("SELECT 'abc\nFROM t");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].category).toBe('Lexical Error');
    expect(diagnostics[0].message).toMatch(/Unterminated string/);
    expect(diagnostics[0].location).toMatchObject({ line: 1, column: 8 });
    expect(tokens.at(-1)?.type).toBe('INVALID');
  });

  it('reports unterminated block comments', () => {
    const { diagnostics } = tokenize('SELECT 1 /* oops');
    expect(diagnostics[0].message).toMatch(/Unterminated block comment/);
  });

  it('reports invalid characters', () => {
    const { tokens, diagnostics } = tokenize('SELECT # FROM t');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toMatch(/Invalid character '#'/);
    expect(tokens[1].type).toBe('INVALID');
  });

  it('reports identifiers that start with a digit', () => {
    const { diagnostics } = tokenize('SELECT 1abc');
    expect(diagnostics[0].message).toMatch(/Malformed token '1abc'/);
  });

  it('tokenizes the default query', () => {
    const { tokens, diagnostics } = tokenize("SELECT name, department\nFROM students\nWHERE department = 'Computer Science'\nORDER BY name;");
    expect(diagnostics).toHaveLength(0);
    expect(tokens.filter((t) => t.type === 'KEYWORD').map((t) => t.lexeme)).toEqual(['SELECT', 'FROM', 'WHERE', 'ORDER', 'BY']);
  });
});
