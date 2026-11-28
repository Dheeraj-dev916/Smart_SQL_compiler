import * as React from 'react';
import { ChevronRight, Database, Key, Link2, Plus, RotateCcw, Table2, Upload } from 'lucide-react';
import type { ColumnMeta, SchemaMeta } from '@/types/compiler';
import { ACADEMIC_SCHEMA } from '@/compiler/semantic/schema';
import { Badge } from '@/components/ui/badge';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

function ColumnRow({ col, onInsert }: { col: ColumnMeta; onInsert: (text: string) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5 hover:bg-muted/60">
      <button
        type="button"
        onClick={() => onInsert(col.name)}
        className="flex min-w-0 items-center gap-1.5 rounded font-mono text-[13px] hover:underline"
        aria-label={`Insert column ${col.name} into the editor`}
      >
        {col.primaryKey ? <Key className="size-3.5 shrink-0 text-warning" aria-hidden="true" /> : col.references ? <Link2 className="size-3.5 shrink-0 text-violet-brand" aria-hidden="true" /> : <span className="size-3.5 shrink-0" aria-hidden="true" />}
        <span className="truncate">{col.name}</span>
      </button>
      <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
        <Badge variant="indigo" className="px-1.5 py-0 font-mono text-[10px]">{col.type}</Badge>
        {col.primaryKey && <Badge variant="warning" className="px-1.5 py-0 text-[10px]" title="Primary key">PK</Badge>}
        {col.references && <Badge variant="violet" className="px-1.5 py-0 text-[10px]" title={`Foreign key to ${col.references.table}.${col.references.column}`}>FK → {col.references.table}.{col.references.column}</Badge>}
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{col.nullable ? 'NULL' : 'NOT NULL'}</Badge>
      </span>
    </li>
  );
}

/** Reads the same schema object the semantic analyzer validates against. */
export function SchemaExplorer({
  schema = ACADEMIC_SCHEMA,
  onInsert,
  defaultOpen = true,
  isCustom = false,
  onImportClick,
  onResetClick,
}: {
  schema?: SchemaMeta;
  onInsert: (text: string) => void;
  defaultOpen?: boolean;
  isCustom?: boolean;
  onImportClick?: () => void;
  onResetClick?: () => void;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set([schema.tables[0]?.name]));
  React.useEffect(() => {
    setExpanded(new Set([schema.tables[0]?.name]));
  }, [schema]);
  const toggle = (name: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
  return (
    <section aria-label="Database schema explorer" className="flex h-full min-h-0 flex-col rounded-lg border bg-card shadow-sm">
      <div className="flex items-center border-b">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left"
        >
          <Database className="size-4 shrink-0 text-cyan-brand" aria-hidden="true" />
          <span className="text-sm font-semibold">Schema</span>
          <span className="truncate font-mono text-xs text-muted-foreground">{schema.name}</span>
          <ChevronRight className={cn('ml-auto size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden="true" />
        </button>
        {onImportClick && (
          <Tip label="Import CSV / JSON dataset" side="left">
            <button
              type="button"
              onClick={onImportClick}
              aria-label="Import dataset"
              className="mr-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-cyan-brand hover:bg-muted"
            >
              <Upload className="size-3.5" aria-hidden="true" />
              Import
            </button>
          </Tip>
        )}
        {isCustom && onResetClick && (
          <Tip label="Reset to demo dataset" side="left">
            <button
              type="button"
              onClick={onResetClick}
              aria-label="Reset dataset"
              className="mr-2 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
            </button>
          </Tip>
        )}
      </div>
      {open && (
        <div className="relative min-h-0 flex-1">
          <div className="scroll-thin max-h-[22rem] overflow-y-auto p-2 lg:absolute lg:inset-0 lg:max-h-none">
            <p className="px-1 pb-2 text-xs text-muted-foreground">Click a name to insert it at the cursor. Metadata is shared with the semantic analyzer.</p>
            <ul className="space-y-1.5">
              {schema.tables.map((t) => {
                const isOpen = expanded.has(t.name);
                return (
                  <li key={t.name} className="rounded-md border">
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => toggle(t.name)}
                        aria-expanded={isOpen}
                        aria-controls={`cols-${t.name}`}
                        className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 text-left"
                      >
                        <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} aria-hidden="true" />
                        <Table2 className="size-4 shrink-0 text-[hsl(var(--indigo))]" aria-hidden="true" />
                        <span className="truncate font-mono text-sm font-medium">{t.name}</span>
                        <span className="text-xs text-muted-foreground">{t.columns.length} cols</span>
                      </button>
                      <Tip label={`Insert table ${t.name}`} side="left">
                        <button type="button" onClick={() => onInsert(t.name)} aria-label={`Insert table ${t.name} into the editor`} className="mr-1 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                          <Plus className="size-4" />
                        </button>
                      </Tip>
                    </div>
                    {isOpen && (
                      <ul id={`cols-${t.name}`} className="border-t p-1">
                        {t.columns.map((c) => <ColumnRow key={c.name} col={c} onInsert={onInsert} />)}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
