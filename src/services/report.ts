import type { CompilationResult } from '@/types/compiler';
import { planToTree } from '@/compiler/intermediate';
import { formatDuration, treeToText } from '@/utils/format';
import { formatDiagnostic } from '@/compiler/diagnostics';

/** Markdown report of one compilation: every section comes from the real compiler output. */
export function buildMarkdownReport(r: CompilationResult): string {
  const out: string[] = [];
  out.push('# Smart SQL Query Compiler — Compilation Report', '');
  out.push(`- Compiled at: ${r.compiledAt}`, `- Schema: ${r.schemaName}`, `- Result: **${r.success ? 'SUCCESS' : 'FAILED'}**`, `- Total time (measured): ${formatDuration(r.totalDurationMs)}`, '');
  out.push('## Source SQL', '', '```sql', r.source, '```', '');
  out.push('## Pipeline', '', '| Stage | Status | Time | Summary |', '|---|---|---|---|');
  for (const s of r.stages) out.push(`| ${s.label} | ${s.status} | ${formatDuration(s.durationMs)} | ${s.summary ?? ''} |`);
  out.push('');
  out.push('## Diagnostics', '');
  if (r.diagnostics.length === 0) out.push('No errors or warnings.', '');
  else {
    for (const d of r.diagnostics) {
      out.push(`- **${d.severity.toUpperCase()}** ${formatDiagnostic(d)}${d.suggestion ? ` — _${d.suggestion}_` : ''}`);
    }
    out.push('');
  }
  if (r.lex) {
    const toks = r.lex.tokens.filter((t) => t.type !== 'COMMENT');
    out.push(`## Tokens (${toks.length})`, '', '| # | Lexeme | Type | Line | Col | Start | End |', '|---|---|---|---|---|---|---|');
    for (const t of toks.slice(0, 300)) {
      const safeLex = t.lexeme.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').replace(/`/g, "'");
      out.push(`| ${t.index} | \`${safeLex}\` | ${t.type} | ${t.line} | ${t.column} | ${t.start} | ${t.end} |`);
    }
    if (toks.length > 300) out.push(`| … | ${toks.length - 300} more tokens omitted | | | | | |`);
    out.push('');
  }
  if (r.parse?.tree) out.push('## Syntax tree', '', '```', treeToText(r.parse.tree), '```', '');
  if (r.semantic) {
    out.push('## Semantic analysis', '');
    out.push(`Scope: ${r.semantic.scope.map((s) => (s.qualifier === s.table ? s.table : `${s.qualifier} → ${s.table}`)).join(', ') || '(none)'}`, '');
    if (r.semantic.resolvedColumns.length) {
      out.push('| Qualifier | Table | Column | Type |', '|---|---|---|---|');
      for (const c of r.semantic.resolvedColumns) out.push(`| ${c.qualifier} | ${c.table} | ${c.column} | ${c.type} |`);
      out.push('');
    }
  }
  if (r.ir?.ok && r.ir.plan) {
    out.push('## Intermediate representation', '', `Relational algebra: \`${r.ir.algebra?.text ?? '(none)'}\``, '', '```', treeToText(planToTree(r.ir.plan)), '```', '');
  }
  if (r.optimizer) {
    out.push('## Optimization', '', `Rules applied: ${r.optimizer.appliedCount} of ${r.optimizer.results.length}. Logical rewrites are not measurements of execution time.`, '');
    for (const o of r.optimizer.results) {
      out.push(`### ${o.rule} — ${o.applied ? 'APPLIED' : 'skipped'} (${o.scope})`);
      out.push(o.applied ? o.explanation : `Reason: ${o.skipReason}`);
      if (o.applied) out.push('', 'Before:', '```', o.original, '```', 'After:', '```', o.optimized, '```');
      out.push('');
    }
    out.push(`Original algebra: \`${r.optimizer.originalAlgebra}\``, '', `Optimized algebra: \`${r.optimizer.optimizedAlgebra}\``, '');
  }
  if (r.codegen) {
    out.push('## Generated SQL', '', '### Formatted', '```sql', r.codegen.formattedSql, '```', '', `### Optimized${r.codegen.sqlChanged ? '' : ' (identical to formatted: no SQL rewrite applied)'}`, '```sql', r.codegen.optimizedSql, '```', '');
    for (const n of r.codegen.notes) out.push(`- ${n}`);
    out.push('');
  }
  return out.join('\n');
}

export function buildJsonReport(r: CompilationResult): string {
  const { parse, ...rest } = r;
  return JSON.stringify({ ...rest, parse: parse ? { ok: parse.ok, statement: parse.statement, tree: parse.tree, diagnostics: parse.diagnostics } : undefined }, null, 2);
}
