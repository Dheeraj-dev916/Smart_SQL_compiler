import * as React from 'react';
import { ChevronsDownUp, ChevronsUpDown, Download, Search } from 'lucide-react';
import type { CompilationResult } from '@/types/compiler';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code-block';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { Tip } from '@/components/ui/tooltip';
import { downloadText } from '@/utils/download';
import { treeToText } from '@/utils/format';
import { formatDiagnostic } from '@/compiler/diagnostics';
import { TreeView, countNodes } from '../TreeView';
import { PanelToolbar, StatusNote, Unavailable } from './shared';

type View = 'tree' | 'statement' | 'raw';

export function AstPanel({ result }: { result: CompilationResult }) {
  const [view, setView] = React.useState<View>('tree');
  const [q, setQ] = React.useState('');
  const [signal, setSignal] = React.useState<{ mode: 'expand' | 'collapse'; nonce: number }>({ mode: 'expand', nonce: 0 });
  const parse = result.parse;
  if (!parse) return <Unavailable result={result} stage="syntax" what="syntax tree" />;
  const json = view === 'raw' ? JSON.stringify(parse.rawAst, null, 2) : JSON.stringify(parse.statement, null, 2);
  const syntaxErrors = parse.diagnostics.filter((d) => d.severity === 'error');
  const copyText = () => (view === 'tree' && parse.tree ? treeToText(parse.tree) : json);

  return (
    <div>
      <PanelToolbar>
        <div role="group" aria-label="AST view" className="flex rounded-md border p-0.5 text-xs">
          {([['tree', 'Parse tree'], ['statement', 'Typed AST (JSON)'], ['raw', 'Raw parser output']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              disabled={v !== 'tree' && !parse.ok && v === 'statement'}
              className={`rounded px-2.5 py-1.5 font-medium transition-colors ${view === v ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'} disabled:opacity-40`}
            >
              {label}
            </button>
          ))}
        </div>
        {view === 'tree' && parse.tree && (
          <>
            <div className="relative min-w-[9rem] flex-1 sm:max-w-[14rem]">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search nodes" aria-label="Search syntax tree nodes" className="pl-8" />
            </div>
            <Tip label="Expand all"><Button variant="ghost" size="icon" aria-label="Expand all nodes" onClick={() => setSignal((s) => ({ mode: 'expand', nonce: s.nonce + 1 }))}><ChevronsUpDown /></Button></Tip>
            <Tip label="Collapse all"><Button variant="ghost" size="icon" aria-label="Collapse all nodes" onClick={() => setSignal((s) => ({ mode: 'collapse', nonce: s.nonce + 1 }))}><ChevronsDownUp /></Button></Tip>
            <span className="text-xs text-muted-foreground">{countNodes(parse.tree)} nodes</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          {parse.ok && <CopyButton label="Copy this view" text={copyText} />}
          {parse.ok && (
            <Button variant="ghost" size="icon" aria-label="Download AST as JSON" onClick={() => downloadText('ast.json', JSON.stringify({ statement: parse.statement, parserOutput: parse.rawAst }, null, 2), 'application/json')}>
              <Download />
            </Button>
          )}
        </div>
      </PanelToolbar>
      <div className="space-y-3 p-3">
        {!parse.ok && (
          <StatusNote tone="error">
            <p className="font-medium">The parser could not build a syntax tree.</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {syntaxErrors.map((d) => <li key={d.id}>{formatDiagnostic(d)}</li>)}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Syntax analysis stops at the first error. Fix it, then compile again.</p>
          </StatusNote>
        )}
        {parse.ok && view === 'tree' && parse.tree && <div className="scroll-thin overflow-x-auto"><TreeView root={parse.tree} query={q} expandSignal={signal} defaultDepth={4} /></div>}
        {parse.ok && view === 'statement' && (
          <>
            <p className="text-xs text-muted-foreground">The normalized, typed AST that semantic analysis, planning and optimization consume (produced by the adapter over the parser output).</p>
            <CodeBlock code={json} label="typed AST JSON" />
          </>
        )}
        {parse.ok && view === 'raw' && (
          <>
            <p className="text-xs text-muted-foreground">Unmodified output of the third-party SQL parser (node-sql-parser, PostgreSQL dialect), shown for transparency.</p>
            <CodeBlock code={json} label="raw parser output" />
          </>
        )}
        {!parse.ok && view === 'raw' && <p className="text-sm text-muted-foreground">There is no parser output because parsing failed.</p>}
      </div>
    </div>
  );
}
