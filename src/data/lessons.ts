import type { ResultTab } from '@/hooks/useApp';

export interface Lesson {
  id: string;
  title: string;
  /** Short label for the diagram box that names the phase. */
  phase: string;
  definition: string;
  sql: string;
  /** The compile result the example is verified to produce (checked by an automated test). */
  expect: 'success' | 'failure';
  steps: string[];
  input: string;
  output: string;
  /** Concrete illustration of the output for the example SQL. */
  outputExample: string;
  why: string;
  /** Result tab to open when the learner clicks "Try it in the compiler". */
  tab: ResultTab;
}

export const LESSONS: Lesson[] = [
  {
    id: 'fundamentals',
    title: 'Compiler fundamentals',
    phase: 'Whole pipeline',
    definition:
      'A compiler translates a program from one form into another by running it through a series of phases. Each phase reads the output of the previous one, and any phase can stop the process by reporting an error. This project is a source-to-source compiler: SQL goes in, checked and optimized SQL (plus a logical plan) comes out.',
    sql: 'SELECT name\nFROM students\nWHERE age > 20;',
    expect: 'success',
    steps: [
      'The front end analyzes the program: lexical analysis (tokens), syntax analysis (tree) and semantic analysis (meaning).',
      'The middle end turns the checked program into an intermediate representation and improves it with optimizations.',
      'The back end generates the final output from that representation.',
      'If a required phase fails, later phases are skipped, so an error is never reported as success.',
    ],
    input: 'SQL text',
    output: 'Diagnostics, a plan and generated SQL',
    outputExample: 'Tokens → syntax tree → resolved names → π_{name}(σ_{age > 20}(students)) → SELECT name FROM students WHERE age > 20;',
    why: 'Splitting the work into phases keeps each step small enough to reason about and test. It also means an error can be reported at the earliest phase that can detect it, with the most precise message.',
    tab: 'tokens',
  },
  {
    id: 'lexical',
    title: 'Lexical analysis',
    phase: 'Lexer',
    definition:
      'Lexical analysis (scanning) reads the raw characters and groups them into tokens: the smallest meaningful units such as keywords, identifiers, literals, operators and punctuation.',
    sql: 'SELECT name FROM students WHERE age >= 20;',
    expect: 'success',
    steps: [
      'Read characters from left to right and skip whitespace.',
      'Group characters by the longest match, so >= is one operator token, not > followed by =.',
      'Classify each lexeme. A word found in the keyword table (SELECT, FROM) is a KEYWORD; any other word is an IDENTIFIER.',
      'Record the token type, line, column and start/end offsets so later errors can point at the source.',
      'Report lexical errors, such as an unterminated string or an invalid character.',
    ],
    input: 'Stream of characters',
    output: 'List of tokens with positions',
    outputExample: 'SELECT (KEYWORD) · name (IDENTIFIER) · FROM (KEYWORD) · students (IDENTIFIER) · WHERE (KEYWORD) · age (IDENTIFIER) · >= (OPERATOR) · 20 (NUMBER) · ; (SEMICOLON)',
    why: 'Everything after this phase works with tokens instead of characters. A lexer also handles strings and comments, so text inside quotes is never mistaken for SQL. (In this project the parser library also scans internally; our lexer exposes the tokens and catches lexical errors first.)',
    tab: 'tokens',
  },
  {
    id: 'syntax',
    title: 'Syntax analysis',
    phase: 'Parser',
    definition:
      'Syntax analysis (parsing) checks that the tokens follow the grammar of the language and builds a tree that shows how they are structured.',
    sql: 'SELECT FROM students WHERE;',
    expect: 'failure',
    steps: [
      'The grammar says a SELECT is followed by a list of expressions, then FROM and a table.',
      'The parser matches the input against the grammar rules from left to right.',
      'When the next token cannot continue any rule, the parser reports a syntax error with the position and what was unexpected.',
      'If the whole input matches, the parser returns a tree. This project uses the node-sql-parser library, not hand-made regular expressions.',
      'Valid SQL that falls outside the supported subset (for example subqueries) is rejected as unsupported instead of being accepted silently.',
    ],
    input: 'Tokens (source text)',
    output: 'Parse tree, or a syntax error',
    outputExample: 'The example above fails: a column or expression was expected between SELECT and FROM, and the condition after WHERE is missing.',
    why: 'Syntax is the first check that the query has a valid shape at all. Without a tree there is nothing for later phases to analyze, so parsing failures stop the pipeline.',
    tab: 'ast',
  },
  {
    id: 'semantic',
    title: 'Semantic analysis',
    phase: 'Semantic analyzer',
    definition:
      'Semantic analysis checks that a syntactically valid query makes sense: that the tables and columns exist, that names are not ambiguous, and that aggregate and GROUP BY rules are respected.',
    sql: 'SELECT student_name\nFROM students;',
    expect: 'failure',
    steps: [
      'Build a scope from the FROM clause: each table or alias and the real table it refers to.',
      'Look up every table in the schema catalog and every column in the tables that are in scope.',
      'Report unknown or ambiguous names, using the schema to suggest the closest real name.',
      'Check that selected columns are grouped or aggregated when GROUP BY is used.',
      'Record the resolved columns and infer the output column types.',
    ],
    input: 'Syntax tree + schema catalog',
    output: 'Resolved names and types, or semantic errors',
    outputExample: "Column 'student_name' does not exist in table 'students'. Did you mean 'name'?",
    why: 'The grammar cannot know your schema. This is the phase that stops a query that is well-formed but refers to things that do not exist, before any planning or execution is attempted.',
    tab: 'semantic',
  },
  {
    id: 'ast',
    title: 'Abstract syntax trees',
    phase: 'AST',
    definition:
      'An abstract syntax tree (AST) represents the structure of the program with only the meaningful parts. Punctuation such as commas and parentheses is gone; what remains is nodes like SELECT, FROM, WHERE and the expressions inside them.',
    sql: 'SELECT name\nFROM students\nWHERE age > 20;',
    expect: 'success',
    steps: [
      'The root node is the statement (SELECT).',
      'Its children are the clauses: the column list, the table, and the WHERE condition.',
      'The condition age > 20 is a binary node with the operator > and two children: the column age and the number 20.',
      'Later phases walk this tree instead of re-reading the text.',
    ],
    input: 'Tokens / parser output',
    output: 'Tree of nodes',
    outputExample: 'SELECT → [columns: name] · [FROM: students] · [WHERE: > (age, 20)]',
    why: 'A tree is easy for a program to traverse and transform. Semantic analysis, planning and optimization all operate on the AST, so its shape determines how simple those phases are.',
    tab: 'ast',
  },
  {
    id: 'ir',
    title: 'Intermediate representations',
    phase: 'Planner',
    definition:
      'An intermediate representation (IR) is a form between the source language and the output. Here it is a logical query plan: a tree of operators that says what to compute, without saying how.',
    sql: 'SELECT s.name, c.course_name\nFROM students s\nINNER JOIN enrollments e ON s.id = e.student_id\nINNER JOIN courses c ON c.id = e.course_id\nWHERE s.gpa > 3.5;',
    expect: 'success',
    steps: [
      'Start with a TableScan for each table in the FROM clause.',
      'Combine them with Join operators in the order written.',
      'Apply a Selection for WHERE, then Aggregation for GROUP BY and a Selection for HAVING.',
      'Apply Projection for the SELECT list, then Sort for ORDER BY and Limit for LIMIT.',
      'The same plan is shown as relational algebra and as JSON.',
    ],
    input: 'Checked AST',
    output: 'Logical plan (operator tree)',
    outputExample: 'Projection ← Selection(s.gpa > 3.5) ← Join ← [Join ← [TableScan students, TableScan enrollments], TableScan courses]',
    why: 'The IR is independent of SQL syntax, so the optimizer can reorder and rewrite operators without worrying about text. It is also the single place where the meaning of the query is made explicit.',
    tab: 'ir',
  },
  {
    id: 'algebra',
    title: 'Relational algebra',
    phase: 'Algebra',
    definition:
      'Relational algebra is the mathematical language behind SQL. Each operator takes one or two relations (tables) and returns a relation, so operators can be nested.',
    sql: 'SELECT name\nFROM students\nWHERE age > 20;',
    expect: 'success',
    steps: [
      'The table students is a relation.',
      'Selection σ keeps the rows where age > 20: σ_{age > 20}(students).',
      'Projection π keeps only the column name: π_{name}(σ_{age > 20}(students)).',
      'Other operators: ⋈ join, γ grouping, τ sorting, λ limit, δ duplicate elimination, ρ rename.',
    ],
    input: 'Logical plan',
    output: 'Algebra expression',
    outputExample: 'π_{name}(σ_{age > 20}(students))',
    why: 'Algebra has proven equivalence laws. For example, a selection on one table can be moved below a join. Optimizers rely on such laws to rewrite plans without changing the result.',
    tab: 'ir',
  },
  {
    id: 'optimization',
    title: 'Query optimization',
    phase: 'Optimizer',
    definition:
      'Query optimization rewrites a query or plan into an equivalent one using rules. Each rule is applied only when it is provably safe; otherwise it is skipped and the reason is reported.',
    sql: 'SELECT name\nFROM students\nWHERE 1 + 1 = 2 AND age > 20;',
    expect: 'success',
    steps: [
      'Constant folding evaluates 1 + 1 = 2 at compile time to TRUE.',
      'Boolean simplification applies TRUE AND x = x, leaving only age > 20.',
      'Rules that could change results are skipped. Examples: moving a filter across a LEFT JOIN, or rewriting expressions that involve NULL.',
      'Each rule reports whether it was applied, an explanation, or why it was skipped.',
    ],
    input: 'Logical plan / statement',
    output: 'Equivalent plan + rule log',
    outputExample: 'SELECT name FROM students WHERE age > 20; (constant folding and boolean simplification applied)',
    why: 'Optimizers reduce unnecessary work. A logical rewrite does not guarantee a faster query, because real speed depends on the database engine, indexes and data, so this project never claims a speedup it did not measure.',
    tab: 'optimization',
  },
  {
    id: 'codegen',
    title: 'Code generation',
    phase: 'Code generator',
    definition:
      'Code generation turns the final representation into output text. Here the output is SQL, printed from the optimized statement with quoted identifiers and escaped literals.',
    sql: 'select   name,department from students\n where  department = \'Computer Science\'  order by name',
    expect: 'success',
    steps: [
      'Walk the optimized statement clause by clause: SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT.',
      'Print each expression, keeping identifiers, aliases and literals exactly as meant.',
      'Compare with the formatted original to see whether the SQL text was really rewritten.',
      'If no rule changed anything, the output is just the formatted query, and the tool says so.',
    ],
    input: 'Optimized statement',
    output: 'SQL text',
    outputExample: "SELECT name, department\nFROM students\nWHERE department = 'Computer Science'\nORDER BY name;",
    why: 'The generator is the only place that decides how the result looks. Keeping formatting, plan optimization and SQL rewriting separate makes it clear what actually changed.',
    tab: 'sql',
  },
  {
    id: 'errors',
    title: 'Error handling',
    phase: 'Diagnostics',
    definition:
      'Error handling detects problems, classifies them, reports them clearly and decides whether compilation can continue.',
    sql: "SELECT name\nFROM students\nWHERE department = 'CS;",
    expect: 'failure',
    steps: [
      'Lexical errors: the text cannot be split into tokens (for example an unterminated string, as above).',
      'Syntax errors: the tokens do not fit the grammar.',
      'Semantic errors: the query is well-formed but refers to unknown or ambiguous things.',
      'Optimization warnings: the query is valid but suspicious, such as = NULL. Execution errors come from the database itself.',
      'Every diagnostic has a severity, category, message, location when known, and a suggested fix when possible.',
    ],
    input: 'Any phase’s failure',
    output: 'Diagnostics with locations',
    outputExample: 'Lexical Error: Unterminated string literal: missing closing single quote (line 3, column 20)',
    why: 'Good diagnostics are most of what makes a compiler pleasant to use. Stopping at the first failed phase also prevents a flood of confusing follow-up errors.',
    tab: 'diagnostics',
  },
];
