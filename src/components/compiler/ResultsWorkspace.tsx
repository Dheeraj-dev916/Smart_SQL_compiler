import { AlertTriangle, Braces, Code2, Database, FileCode2, GitBranch, ListTree, Sparkles, Table2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useApp, type ResultTab } from '@/hooks/useApp';
import { StatusNote, NoResult } from './panels/shared';
import { TokensPanel } from './panels/TokensPanel';
import { AstPanel } from './panels/AstPanel';
import { SemanticPanel } from './panels/SemanticPanel';
import { IrPanel } from './panels/IrPanel';
import { OptimizationPanel } from './panels/OptimizationPanel';
import { SqlPanel } from './panels/SqlPanel';
import { DiagnosticsPanel, useAllDiagnostics } from './panels/DiagnosticsPanel';
import { ExecutionPanel } from './panels/ExecutionPanel';

export const TAB_META: { id: ResultTab; label: string; icon: typeof Code2; what: string }[] = [
  { id: 'tokens', label: 'Tokens', icon: Table2, what: 'tokens' },
  { id: 'ast', label: 'AST / Parse Tree', icon: ListTree, what: 'syntax tree' },
  { id: 'semantic', label: 'Semantic Analysis', icon: GitBranch, what: 'semantic analysis' },
  { id: 'ir', label: 'Intermediate Representation', icon: Braces, what: 'intermediate representation' },
  { id: 'optimization', label: 'Optimization', icon: Sparkles, what: 'optimization results' },
  { id: 'sql', label: 'Generated SQL', icon: FileCode2, what: 'generated SQL' },
  { id: 'diagnostics', label: 'Errors and Warnings', icon: AlertTriangle, what: 'errors and warnings' },
  { id: 'execution', label: 'Execution', icon: Database, what: 'execution results' },
];

/** Tabbed workspace; every tab renders the latest actual CompilationResult. */
export function ResultsWorkspace() {
  const { result, tab, setTab, sql, compiling } = useApp();
  const diags = useAllDiagnostics(result);
  const errorCount = diags.filter((d) => d.severity === 'error').length;
  const warnCount = diags.filter((d) => d.severity !== 'error').length;
  const stale = result !== null && result.source !== sql;

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm" aria-busy={compiling}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as ResultTab)}>
        <TabsList aria-label="Compiler results">
          {TAB_META.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id}>
              <Icon className="size-4" aria-hidden="true" />
              {label}
              {id === 'diagnostics' && result && (errorCount > 0 || warnCount > 0) && (
                <Badge variant={errorCount ? 'destructive' : 'warning'} className="px-1.5 py-0">
                  {errorCount || warnCount}
                  <span className="sr-only"> {errorCount ? 'errors' : 'warnings'}</span>
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {stale && (
          <div className="border-b p-2">
            <StatusNote tone="warning">The editor has changed since this result was produced. Compile again to refresh every tab.</StatusNote>
          </div>
        )}
        {TAB_META.map(({ id, what }) => (
          <TabsContent key={id} value={id} className="min-h-[12rem] focus-visible:ring-offset-0">
            {!result ? <NoResult what={what} /> : renderPanel(id, result)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function renderPanel(id: ResultTab, result: NonNullable<ReturnType<typeof useApp>['result']>) {
  switch (id) {
    case 'tokens': return <TokensPanel result={result} />;
    case 'ast': return <AstPanel result={result} />;
    case 'semantic': return <SemanticPanel result={result} />;
    case 'ir': return <IrPanel result={result} />;
    case 'optimization': return <OptimizationPanel result={result} />;
    case 'sql': return <SqlPanel result={result} />;
    case 'diagnostics': return <DiagnosticsPanel result={result} />;
    case 'execution': return <ExecutionPanel result={result} />;
  }
}
