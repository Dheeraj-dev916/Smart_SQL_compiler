import { ArrowRight } from 'lucide-react';
import type { CompilationResult } from '@/types/compiler';
import { Badge } from '@/components/ui/badge';
import { formatDiagnostic } from '@/compiler/diagnostics';
import { DataTable, Section, StatusNote, Unavailable } from './shared';

export function SemanticPanel({ result }: { result: CompilationResult }) {
  const sem = result.semantic;
  if (!sem) return <Unavailable result={result} stage="semantic" what="semantic analysis" />;
  const errors = sem.diagnostics.filter((d) => d.severity === 'error');
  return (
    <div className="space-y-5 p-3">
      {errors.length > 0 ? (
        <StatusNote tone="error">
          <p className="font-medium">{errors.length} semantic error{errors.length === 1 ? '' : 's'} against schema “{result.schemaName}”.</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {errors.map((d) => (
              <li key={d.id}>
                {formatDiagnostic(d)}
                {d.suggestion && <span className="text-muted-foreground"> — {d.suggestion}</span>}
              </li>
            ))}
          </ul>
        </StatusNote>
      ) : (
        <StatusNote tone="success">All names were resolved against the “{result.schemaName}” schema. No semantic errors.</StatusNote>
      )}

      <Section title="Name scope" hint="Each table or alias visible to the query, and the real table it refers to.">
        {sem.scope.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tables were resolved.</p>
        ) : (
          <DataTable head={['Name in query', '', 'Table']} minWidth={320} caption="Name scope">
            {sem.scope.map((s) => (
              <tr key={s.qualifier}>
                <td className="px-3 py-1.5 font-mono text-[13px]">{s.qualifier}</td>
                <td className="px-1 text-muted-foreground"><ArrowRight className="size-3.5" aria-label="refers to" /></td>
                <td className="px-3 py-1.5 font-mono text-[13px]">{s.table}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>

      <Section title="Resolved column references" hint="Every column used by the query, bound to the schema.">
        {sem.resolvedColumns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No column references were resolved.</p>
        ) : (
          <DataTable head={['Qualifier', 'Table', 'Column', 'Type']} minWidth={440} caption="Resolved columns">
            {sem.resolvedColumns.map((c, i) => (
              <tr key={`${c.qualifier}.${c.column}.${i}`}>
                <td className="px-3 py-1.5 font-mono text-[13px]">{c.qualifier}</td>
                <td className="px-3 py-1.5 font-mono text-[13px]">{c.table}</td>
                <td className="px-3 py-1.5 font-mono text-[13px]">{c.column}</td>
                <td className="px-3 py-1.5"><Badge variant="indigo">{c.type}</Badge></td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>

      {sem.outputColumns.length > 0 && (
        <Section title="Output columns" hint="Result columns with inferred types.">
          <DataTable head={['Name', 'Inferred type']} minWidth={300} caption="Output columns">
            {sem.outputColumns.map((c, i) => (
              <tr key={`${c.name}.${i}`}>
                <td className="px-3 py-1.5 font-mono text-[13px]">{c.name}</td>
                <td className="px-3 py-1.5"><Badge variant={c.type === 'UNKNOWN' ? 'outline' : 'indigo'}>{c.type}</Badge></td>
              </tr>
            ))}
          </DataTable>
        </Section>
      )}

      {sem.notes.length > 0 && (
        <Section title="Notes">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {sem.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </Section>
      )}
    </div>
  );
}
