import * as React from 'react';
import { Download } from 'lucide-react';
import type { CompilationResult } from '@/types/compiler';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code-block';
import { CopyButton } from '@/components/ui/copy-button';
import { ALGEBRA_NOTATION, planToTree } from '@/compiler/intermediate';
import { downloadText } from '@/utils/download';
import { treeToText } from '@/utils/format';
import { TreeView } from '../TreeView';
import { DataTable, Section, StatusNote, Unavailable } from './shared';

export function IrPanel({ result }: { result: CompilationResult }) {
  const ir = result.ir;
  const tree = React.useMemo(() => (ir?.plan ? planToTree(ir.plan) : null), [ir?.plan]);
  if (!ir?.ok || !ir.plan || !tree) {
    if (ir && !ir.ok && ir.notes.length) return <div className="p-3"><StatusNote tone="info">{ir.notes.join(' ')}</StatusNote></div>;
    return <Unavailable result={result} stage="ir" what="intermediate representation" />;
  }
  const json = JSON.stringify(ir.json, null, 2);
  return (
    <div className="space-y-5 p-3">
      <Section title="Relational algebra" hint="Built from the typed AST, not from the SQL text.">
        <CodeBlock code={ir.algebra?.text ?? ''} label="relational algebra" wrap />
        <details className="rounded-md border px-3 py-2 text-sm">
          <summary className="cursor-pointer select-none font-medium">Notation used by this project</summary>
          <div className="mt-2">
            <DataTable head={['Symbol', 'Meaning', 'SQL']} minWidth={460} caption="Relational algebra notation">
              {ALGEBRA_NOTATION.map((n) => (
                <tr key={n.symbol}>
                  <td className="px-3 py-1.5 font-mono text-[13px]">{n.symbol}</td>
                  <td className="px-3 py-1.5">{n.meaning}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{n.sql}</td>
                </tr>
              ))}
            </DataTable>
          </div>
        </details>
      </Section>

      <Section
        title="Logical query plan"
        hint="Read from the leaves (table scans) up to the root: the root is the last operator applied."
        actions={<CopyButton label="Copy plan as text" text={() => treeToText(tree)} />}
      >
        <div className="scroll-thin overflow-x-auto rounded-md border bg-muted/20 p-2"><TreeView root={tree} defaultDepth={12} /></div>
      </Section>

      <Section
        title="Structured JSON"
        actions={
          <div className="flex items-center gap-1">
            <CopyButton label="Copy JSON" text={json} />
            <Button variant="ghost" size="icon" aria-label="Download IR as JSON" onClick={() => downloadText('intermediate-representation.json', json, 'application/json')}><Download /></Button>
          </div>
        }
      >
        <details className="rounded-md border">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">Show JSON</summary>
          <CodeBlock code={json} label="IR JSON" className="rounded-none border-0 border-t" />
        </details>
      </Section>

      {ir.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{ir.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}
    </div>
  );
}
