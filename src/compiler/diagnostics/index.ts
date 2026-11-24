import type { Diagnostic, DiagnosticCategory, Severity, SourceLocation } from '@/types/compiler';

let counter = 0;

export function resetDiagnosticIds(): void {
  counter = 0;
}

export function makeDiagnostic(
  category: DiagnosticCategory,
  message: string,
  opts: { severity?: Severity; location?: SourceLocation; suggestion?: string } = {},
): Diagnostic {
  counter += 1;
  return {
    id: `d${counter}`,
    severity: opts.severity ?? (category === 'Optimization Warning' ? 'warning' : 'error'),
    category,
    message,
    location: opts.location,
    suggestion: opts.suggestion,
  };
}

/** Converts 0-based offsets in `source` to a SourceLocation (1-based line/column). */
export function locationFromOffsets(source: string, start: number, end: number): SourceLocation {
  const s = Math.max(0, Math.min(start, source.length));
  const e = Math.max(s, Math.min(end, source.length));
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < s; i++) {
    if (source[i] === '\n') {
      line++;
      lastBreak = i;
    }
  }
  return { line, column: s - lastBreak, start: s, end: e };
}

export function formatDiagnostic(d: Diagnostic): string {
  const loc = d.location ? ` (line ${d.location.line}, column ${d.location.column})` : '';
  return `${d.category}: ${d.message}${loc}`;
}
