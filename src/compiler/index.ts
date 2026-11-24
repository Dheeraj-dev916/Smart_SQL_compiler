import type {
  CompilationResult,
  Diagnostic,
  SchemaMeta,
  StageId,
  StageState,
} from '@/types/compiler';
import { tokenize } from './lexer';
import { parse } from './parser';
import { analyze } from './semantic/analyzer';
import { ACADEMIC_SCHEMA } from './semantic/schema';
import { generateIR, walkPlan } from './intermediate';
import { optimize } from './optimizer';
import { generateSql } from './codegen';
import { makeDiagnostic, resetDiagnosticIds } from './diagnostics';

export const STAGE_ORDER: { id: StageId; label: string }[] = [
  { id: 'source', label: 'SQL Source' },
  { id: 'lexical', label: 'Lexical Analysis' },
  { id: 'syntax', label: 'Syntax Analysis' },
  { id: 'semantic', label: 'Semantic Analysis' },
  { id: 'ir', label: 'Intermediate Representation' },
  { id: 'optimization', label: 'Query Optimization' },
  { id: 'codegen', label: 'Code Generation' },
];

export interface CompileOptions {
  schema?: SchemaMeta;
  /** Run the optimizer stage (default true). */
  optimize?: boolean;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The pipeline as a generator: it yields a snapshot of the stage states each time a stage starts
 * running, and returns the final CompilationResult. Each stage consumes the real output of the
 * previous one; if a required stage fails, every later stage is marked "skipped".
 */
export function* runPipeline(source: string, options: CompileOptions = {}): Generator<StageState[], CompilationResult, void> {
  const schema = options.schema ?? ACADEMIC_SCHEMA;
  const t0 = now();
  resetDiagnosticIds();
  const stages: StageState[] = STAGE_ORDER.map((s) => ({ ...s, status: 'pending' }));
  const stage = (id: StageId) => stages.find((s) => s.id === id)!;
  const snapshot = () => stages.map((s) => ({ ...s }));
  const result: CompilationResult = {
    source,
    success: false,
    stages,
    diagnostics: [],
    totalDurationMs: 0,
    optimizationCount: 0,
    schemaName: schema.name,
    compiledAt: new Date().toISOString(),
  };
  const diagnostics: Diagnostic[] = [];
  let failed = false;

  const finishSkipped = () => {
    for (const s of stages) if (s.status === 'pending') s.status = 'skipped';
  };

  /** Runs one stage body, measuring its duration. The body returns success flag + summary. */
  const run = function* (id: StageId, body: () => { ok: boolean; summary: string }): Generator<StageState[], void, void> {
    const st = stage(id);
    if (failed) {
      st.status = 'skipped';
      st.summary = 'Skipped because an earlier stage failed';
      return;
    }
    st.status = 'running';
    yield snapshot();
    const start = now();
    const out = body();
    st.durationMs = now() - start;
    st.status = out.ok ? 'success' : 'failed';
    st.summary = out.summary;
    if (!out.ok) failed = true;
  };

  // 1. Source
  yield* run('source', () => {
    if (source.trim() === '') {
      diagnostics.push(makeDiagnostic('Syntax Error', 'The query is empty. Enter a SQL statement to compile.'));
      return { ok: false, summary: 'Empty input' };
    }
    const lines = source.split('\n').length;
    return { ok: true, summary: `${source.length} characters, ${lines} line${lines === 1 ? '' : 's'}` };
  });

  // 2. Lexical
  yield* run('lexical', () => {
    const lex = tokenize(source);
    result.lex = lex;
    diagnostics.push(...lex.diagnostics);
    const errors = lex.diagnostics.filter((d) => d.severity === 'error').length;
    const count = lex.tokens.filter((t) => t.type !== 'COMMENT').length;
    return errors ? { ok: false, summary: `${errors} lexical error${errors === 1 ? '' : 's'}` } : { ok: true, summary: `${count} tokens` };
  });

  // 3. Syntax
  yield* run('syntax', () => {
    const parsed = parse(source);
    result.parse = parsed;
    diagnostics.push(...parsed.diagnostics);
    return parsed.ok ? { ok: true, summary: `${parsed.statement!.type.toUpperCase()} statement parsed` } : { ok: false, summary: 'Syntax error' };
  });

  // 4. Semantic
  yield* run('semantic', () => {
    const sem = analyze(result.parse!.statement!, schema, result.lex?.tokens ?? []);
    result.semantic = sem;
    diagnostics.push(...sem.diagnostics);
    const errors = sem.diagnostics.filter((d) => d.severity === 'error').length;
    return sem.ok ? { ok: true, summary: `${sem.resolvedColumns.length} column${sem.resolvedColumns.length === 1 ? '' : 's'} resolved against '${schema.name}'` } : { ok: false, summary: `${errors} semantic error${errors === 1 ? '' : 's'}` };
  });

  // 5. Intermediate representation
  const statement = result.parse?.statement;
  if (!failed && statement && statement.type !== 'select') {
    const st = stage('ir');
    st.status = 'skipped';
    st.summary = `${statement.type.toUpperCase()} statements have no logical plan (SELECT only)`;
    result.ir = generateIR(statement);
  } else {
    yield* run('ir', () => {
      const ir = generateIR(statement!);
      result.ir = ir;
      diagnostics.push(...ir.diagnostics);
      let ops = 0;
      if (ir.plan) walkPlan(ir.plan, () => ops++);
      return ir.ok ? { ok: true, summary: `Logical plan with ${ops} operator${ops === 1 ? '' : 's'}` } : { ok: false, summary: 'Could not build a plan' };
    });
  }

  // 6. Optimization
  if (!failed && (statement?.type !== 'select' || options.optimize === false)) {
    const st = stage('optimization');
    st.status = 'skipped';
    st.summary = statement?.type !== 'select' ? 'Optimizer handles SELECT only' : 'Optimizer disabled';
  } else {
    yield* run('optimization', () => {
      const opt = optimize(statement as never, schema);
      result.optimizer = opt;
      diagnostics.push(...opt.diagnostics);
      result.optimizationCount = opt.appliedCount;
      return { ok: true, summary: opt.appliedCount ? `${opt.appliedCount} of ${opt.results.length} rules applied` : `No rule applied (${opt.results.length} checked)` };
    });
  }

  // 7. Code generation
  yield* run('codegen', () => {
    result.codegen = generateSql(source, statement!, result.optimizer);
    return { ok: true, summary: result.codegen.sqlChanged ? 'SQL rewritten by optimizer' : 'Formatted SQL generated' };
  });

  finishSkipped();
  result.diagnostics = diagnostics;
  result.success = stages.every((s) => s.status === 'success' || s.status === 'skipped') && !stages.some((s) => s.status === 'failed');
  result.totalDurationMs = now() - t0;
  return result;
}

/** Synchronous compile (used by tests, history recompile and examples verification). */
export function compile(source: string, options: CompileOptions = {}): CompilationResult {
  const gen = runPipeline(source, options);
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
  }
}

/** Async compile that reports each stage as it starts (for the animated pipeline). */
export async function compileWithProgress(
  source: string,
  options: CompileOptions & { stageDelayMs?: number; onStages?: (stages: StageState[]) => void } = {},
): Promise<CompilationResult> {
  const gen = runPipeline(source, options);
  const delay = options.stageDelayMs ?? 0;
  for (;;) {
    const r = gen.next();
    if (r.done) {
      options.onStages?.(r.value.stages.map((s) => ({ ...s })));
      return r.value;
    }
    options.onStages?.(r.value);
    await new Promise((res) => setTimeout(res, delay));
  }
}

export { tokenize } from './lexer';
export { parse } from './parser';
export { analyze } from './semantic/analyzer';
export { ACADEMIC_SCHEMA, SCHEMAS } from './semantic/schema';
export { formatDiagnostic } from './diagnostics';
