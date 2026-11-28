import * as React from 'react';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { SqlEditor, type SqlEditorHandle } from '@/components/editor/SqlEditor';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { PipelineView } from '@/components/compiler/PipelineView';
import { ResultsWorkspace } from '@/components/compiler/ResultsWorkspace';
import { SchemaExplorer } from '@/components/schema/SchemaExplorer';
import { ImportDatasetDialog } from '@/components/schema/ImportDatasetDialog';
import { EXAMPLES } from '@/data/examples';
import { useApp } from '@/hooks/useApp';
import { buildJsonReport, buildMarkdownReport } from '@/services/report';
import { copyText, downloadText } from '@/utils/download';
import { formatSql } from '@/utils/format';

export default function CompilerPage() {
  const { sql, setSql, result, compiling, compileNow, settings, highlight, resetEditor, activeSchema, customDataset, resetDataset } = useApp();
  const { toast } = useToast();
  const editor = React.useRef<SqlEditorHandle>(null);
  const [importOpen, setImportOpen] = React.useState(false);

  const diagnostics = React.useMemo(() => (result && result.source === sql ? result.diagnostics : []), [result, sql]);
  const desktopSchema = typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches;

  /** Optimize Query: compile, show the Optimization tab, and put the shorter equivalent SQL into the editor. */
  const optimizeNow = async () => {
    const r = await compileNow(undefined, { tab: 'optimization' });
    const opt = r?.optimizer;
    if (r?.success && opt?.statementChanged && r.codegen) {
      setSql(r.codegen.optimizedSql);
      toast({ kind: 'success', title: 'Query optimized', description: 'The editor now holds the optimized SQL. Use Undo in the Optimization tab to get your original back.' });
    } else if (r?.success && opt) {
      toast({ kind: 'info', title: opt.appliedCount > 0 ? 'Plan optimized' : 'Nothing to optimize', description: opt.appliedCount > 0 ? 'The SQL text is already simple; the plan improved (see the Optimization tab).' : 'This query is already in its simplest form.' });
    }
  };

  const onFormat = () => {
    if (!sql.trim()) return toast({ kind: 'info', title: 'Nothing to format', description: 'The editor is empty.' });
    try {
      setSql(formatSql(sql));
      toast({ kind: 'success', title: 'SQL formatted', description: 'Formatting changes layout only, not meaning.' });
    } catch (e) {
      toast({ kind: 'error', title: 'Could not format this SQL', description: `${(e as Error).message.split('\n')[0]} Fix the syntax first, then format again.` });
    }
  };

  const onCopy = async () => {
    if (!sql) return toast({ kind: 'info', title: 'Nothing to copy', description: 'The editor is empty.' });
    const ok = await copyText(sql);
    toast(ok ? { kind: 'success', title: 'SQL copied to clipboard' } : { kind: 'error', title: 'Could not copy', description: 'Clipboard access was blocked by the browser.' });
  };

  const onExport = (kind: 'markdown' | 'json') => {
    if (!result) return;
    const stamp = result.compiledAt.replace(/[:.]/g, '-').slice(0, 19);
    if (kind === 'markdown') downloadText(`sql-compiler-report-${stamp}.md`, buildMarkdownReport(result), 'text/markdown');
    else downloadText(`sql-compiler-result-${stamp}.json`, buildJsonReport(result), 'application/json');
    toast({ kind: 'success', title: 'Report exported', description: result.source === sql ? undefined : 'It describes the last compiled query, not the current editor text.' });
  };

  return (
    <div className="space-y-4">
      <PipelineView />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Card className="flex min-w-0 flex-col overflow-hidden">
          <EditorToolbar
            compiling={compiling}
            hasResult={result !== null}
            result={result}
            onCompile={() => void compileNow()}
            onOptimize={() => void optimizeNow()}
            onFormat={onFormat}
            onCopy={() => void onCopy()}
            onClear={() => { setSql(''); editor.current?.focus(); toast({ kind: 'info', title: 'Editor cleared', description: 'Press Ctrl+Z in the editor to undo.' }); }}
            onReset={() => { resetEditor(); toast({ kind: 'info', title: 'Default query restored' }); }}
            onLoadExample={(id) => {
              const ex = EXAMPLES.find((e) => e.id === id);
              if (ex) { setSql(ex.sql); toast({ kind: 'success', title: `Loaded “${ex.title}”`, description: ex.objective }); }
            }}
            onExport={onExport}
          />
          <div className="h-[15rem] sm:h-[17.5rem]">
            <SqlEditor
              ref={editor}
              value={sql}
              onChange={setSql}
              onCompile={() => void compileNow()}
              onOptimize={() => void optimizeNow()}
              diagnostics={diagnostics}
              highlight={highlight}
              fontSize={settings.fontSize}
              wrap={settings.wrap}
              dark={settings.theme === 'dark'}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-3 py-1.5 text-xs text-muted-foreground">
            <span><kbd className="rounded border px-1">Ctrl</kbd>/<kbd className="rounded border px-1">⌘</kbd> + <kbd className="rounded border px-1">Enter</kbd> compile · add <kbd className="rounded border px-1">Shift</kbd> to optimize</span>
            <span>{sql.length} chars · {sql === '' ? 0 : sql.split('\n').length} lines · PostgreSQL dialect</span>
          </div>
        </Card>
        <SchemaExplorer
          schema={activeSchema}
          isCustom={Boolean(customDataset)}
          onImportClick={() => setImportOpen(true)}
          onResetClick={() => {
            resetDataset();
            toast({ kind: 'info', title: 'Restored demo dataset', description: 'Using students, courses, and enrollments.' });
          }}
          defaultOpen={Boolean(desktopSchema)}
          onInsert={(text) => editor.current?.insertText(text)}
        />
      </div>
      <ResultsWorkspace />
      <ImportDatasetDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(tables) => {
          if (tables[0]) setSql(`SELECT * FROM ${tables[0].name} LIMIT 20;`);
        }}
      />
    </div>
  );
}
