// Core type definitions shared by every compiler phase and the UI.

// ───────────────────────── Source locations & diagnostics ─────────────────────────
export interface SourceLocation {
  /** 1-based line */
  line: number;
  /** 1-based column */
  column: number;
  /** 0-based start offset (inclusive) */
  start: number;
  /** 0-based end offset (exclusive) */
  end: number;
}

export type DiagnosticCategory =
  | 'Lexical Error'
  | 'Syntax Error'
  | 'Semantic Error'
  | 'Optimization Warning'
  | 'Execution Error';

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  id: string;
  severity: Severity;
  category: DiagnosticCategory;
  message: string;
  location?: SourceLocation;
  suggestion?: string;
}

// ───────────────────────── Lexer ─────────────────────────
export type TokenType =
  | 'KEYWORD'
  | 'IDENTIFIER'
  | 'QUOTED_IDENTIFIER'
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'NULL'
  | 'OPERATOR'
  | 'COMMA'
  | 'LPAREN'
  | 'RPAREN'
  | 'SEMICOLON'
  | 'DOT'
  | 'COMMENT'
  | 'INVALID';

export interface Token {
  index: number;
  lexeme: string;
  type: TokenType;
  line: number;
  column: number;
  start: number;
  end: number;
}

export interface LexResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
}

// ───────────────────────── Normalized AST ─────────────────────────
export type Expr =
  | { kind: 'column'; table?: string; name: string }
  | { kind: 'star'; table?: string }
  | { kind: 'number'; value: number; raw: string }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'unary'; op: 'NOT' | '-' | '+'; operand: Expr }
  | { kind: 'func'; name: string; args: Expr[]; distinct?: boolean; aggregate: boolean }
  | { kind: 'list'; items: Expr[] }
  | { kind: 'between'; expr: Expr; low: Expr; high: Expr; negated: boolean }
  | { kind: 'isnull'; expr: Expr; negated: boolean }
  | { kind: 'unsupported'; description: string };

export interface SelectItem {
  expr: Expr;
  alias?: string;
}

export interface TableRef {
  table: string;
  alias?: string;
  join?: 'INNER JOIN' | 'LEFT JOIN';
  on?: Expr;
}

export interface OrderItem {
  expr: Expr;
  direction: 'ASC' | 'DESC';
}

export interface SelectStatement {
  type: 'select';
  distinct: boolean;
  columns: SelectItem[];
  from: TableRef[];
  where?: Expr;
  groupBy: Expr[];
  having?: Expr;
  orderBy: OrderItem[];
  limit?: number;
  offset?: number;
}

export interface InsertStatement {
  type: 'insert';
  table: string;
  columns: string[];
  rows: Expr[][];
}

export interface UpdateStatement {
  type: 'update';
  table: string;
  alias?: string;
  assignments: { column: string; value: Expr }[];
  where?: Expr;
}

export interface DeleteStatement {
  type: 'delete';
  table: string;
  alias?: string;
  where?: Expr;
}

export type Statement = SelectStatement | InsertStatement | UpdateStatement | DeleteStatement;

/** Generic tree used by the UI to render the parse tree. */
export interface TreeNode {
  label: string;
  detail?: string;
  children: TreeNode[];
}

export interface ParseResult {
  ok: boolean;
  statement?: Statement;
  /** Raw output of the third-party parser (node-sql-parser), shown for transparency. */
  rawAst?: unknown;
  tree?: TreeNode;
  diagnostics: Diagnostic[];
}

// ───────────────────────── Schema ─────────────────────────
export type SqlType = 'INTEGER' | 'TEXT' | 'DECIMAL' | 'BOOLEAN';

export interface ColumnMeta {
  name: string;
  type: SqlType;
  primaryKey?: boolean;
  nullable: boolean;
  references?: { table: string; column: string };
}

export interface TableMeta {
  name: string;
  columns: ColumnMeta[];
}

export interface SchemaMeta {
  name: string;
  tables: TableMeta[];
}

export interface ResolvedColumn {
  /** Alias or table name used in the query to reach this column */
  qualifier: string;
  table: string;
  column: string;
  type: SqlType;
}

export interface SemanticResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  /** Alias/table name -> real table name */
  scope: { qualifier: string; table: string }[];
  resolvedColumns: ResolvedColumn[];
  /** Output column names with inferred types */
  outputColumns: { name: string; type: SqlType | 'UNKNOWN' }[];
  notes: string[];
}

// ───────────────────────── Intermediate representation ─────────────────────────
export type LogicalPlanNode =
  | { op: 'TableScan'; table: string; alias?: string; children: [] }
  | { op: 'Selection'; predicate: Expr; stage: 'where' | 'having'; pushedDown?: boolean; children: [LogicalPlanNode] }
  | { op: 'Projection'; items: SelectItem[]; distinct: boolean; pushedDown?: boolean; children: [LogicalPlanNode] }
  | {
      op: 'Join';
      joinType: 'INNER' | 'LEFT';
      condition?: Expr;
      children: [LogicalPlanNode, LogicalPlanNode];
    }
  | { op: 'Aggregation'; groupBy: Expr[]; aggregates: Expr[]; children: [LogicalPlanNode] }
  | { op: 'Sort'; keys: OrderItem[]; children: [LogicalPlanNode] }
  | { op: 'Limit'; count: number; offset?: number; children: [LogicalPlanNode] };

export interface RelationalAlgebraExpression {
  /** Unicode relational algebra string, e.g. π_{name}(σ_{age > 20}(students)) */
  text: string;
}

export interface IRResult {
  ok: boolean;
  plan?: LogicalPlanNode;
  algebra?: RelationalAlgebraExpression;
  json?: unknown;
  notes: string[];
  diagnostics: Diagnostic[];
}

// ───────────────────────── Optimizer ─────────────────────────
export interface OptimizationRule {
  id: string;
  name: string;
  description: string;
}

export interface OptimizationResult {
  rule: string;
  ruleId: string;
  /** 'SQL rewrite' changes the generated SQL; 'Logical plan' only changes the plan/algebra. */
  scope: 'SQL rewrite' | 'Logical plan';
  applied: boolean;
  original: string;
  optimized: string;
  explanation: string;
  skipReason?: string;
}

export interface OptimizerOutput {
  results: OptimizationResult[];
  originalPlan: LogicalPlanNode;
  optimizedPlan: LogicalPlanNode;
  optimizedStatement: SelectStatement;
  originalAlgebra: string;
  optimizedAlgebra: string;
  appliedCount: number;
  /** True when the optimized statement prints differently from the original statement. */
  statementChanged: boolean;
  /** True when the optimized plan differs from the original plan. */
  planChanged: boolean;
  diagnostics: Diagnostic[];
}

// ───────────────────────── Code generation ─────────────────────────
export interface CodegenResult {
  originalSql: string;
  formattedSql: string;
  optimizedSql: string;
  /** True only if optimizer actually applied at least one rewrite that changed the SQL text */
  sqlChanged: boolean;
  notes: string[];
}

// ───────────────────────── Pipeline ─────────────────────────
export type StageId =
  | 'source'
  | 'lexical'
  | 'syntax'
  | 'semantic'
  | 'ir'
  | 'optimization'
  | 'codegen';

export type StageStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface StageState {
  id: StageId;
  label: string;
  status: StageStatus;
  /** Measured wall-clock time in ms (only set when the stage actually ran) */
  durationMs?: number;
  summary?: string;
}

export interface CompilationResult {
  source: string;
  success: boolean;
  stages: StageState[];
  lex?: LexResult;
  parse?: ParseResult;
  semantic?: SemanticResult;
  ir?: IRResult;
  optimizer?: OptimizerOutput;
  codegen?: CodegenResult;
  diagnostics: Diagnostic[];
  totalDurationMs: number;
  /** Number of optimization rules that were actually applied */
  optimizationCount: number;
  schemaName: string;
  compiledAt: string;
}
