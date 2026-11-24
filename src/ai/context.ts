import { formatDiagnostic } from '@/compiler';
import { planToJson } from '@/compiler/intermediate';
import type { CompilationResult } from '@/types/compiler';

export const diagnosticLines = (r: CompilationResult) =>
  r.diagnostics.filter((d) => d.severity !== 'info').map(formatDiagnostic);

/** Real optimizer report, in the shape the server expects. */
export const ruleReport = (r: CompilationResult) =>
  (r.optimizer?.results ?? []).map((x) => ({ name: x.rule, applied: x.applied, explanation: x.explanation, skipReason: x.skipReason }));

export const planText = (r: CompilationResult) => (r.ir?.plan ? JSON.stringify(planToJson(r.ir.plan), null, 1).slice(0, 3000) : '');

/** Short description of the student's current query and what the compiler really did with it. */
export function tutorContext(sql: string, r: CompilationResult): string {
  const stages = r.stages.map((s) => `${s.label}: ${s.status}${s.summary ? ` (${s.summary})` : ''}`).join('\n');
  const diags = diagnosticLines(r);
  return [
    `Query:\n${sql.slice(0, 1500)}`,
    `Stages:\n${stages}`,
    diags.length ? `Diagnostics:\n${diags.slice(0, 8).join('\n')}` : 'Diagnostics: none',
    r.ir?.algebra ? `Relational algebra: ${r.ir.algebra.text}` : '',
    r.optimizer ? `Optimizer: ${r.optimizer.appliedCount} of ${r.optimizer.results.length} rules applied` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const STAGE_LABEL: Record<string, string> = {
  lexical: 'Lexical analysis',
  syntax: 'Syntax analysis',
  semantic: 'Semantic analysis',
  ir: 'Intermediate representation',
  optimization: 'Query optimization',
  codegen: 'Code generation',
  source: 'SQL source',
};
