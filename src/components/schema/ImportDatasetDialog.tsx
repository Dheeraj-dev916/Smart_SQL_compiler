import * as React from 'react';
import { FileUp, RotateCcw, Table2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useApp } from '@/hooks/useApp';
import { useToast } from '@/components/ui/toast';
import {
  MAX_DATASET_ROWS,
  parseCsvTable,
  parseJsonDataset,
  parseSqlDataset,
  sanitizeIdent,
  type DatasetTable,
} from '@/services/dataset';

const SAMPLE_CSV = `id,product,category,price,in_stock
1,Laptop,Electronics,999.99,true
2,Desk Chair,Furniture,249.50,true
3,Notebook,Stationery,4.99,false`;

const SAMPLE_SQL = `CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT,
  salary DECIMAL
);
INSERT INTO employees (id, name, department, salary) VALUES
  (1, 'Sara Ali', 'Engineering', 95000.00),
  (2, 'Omar Khan', 'Design', 78000.50),
  (3, 'Nadia Patel', 'Engineering', 102000.00);`;

export function ImportDatasetDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (tables: DatasetTable[]) => void;
}) {
  const { customDataset, importDataset, resetDataset } = useApp();
  const { toast } = useToast();

  const [format, setFormat] = React.useState<'csv' | 'json' | 'sql'>('csv');
  const [tableName, setTableName] = React.useState('my_table');
  const [rawText, setRawText] = React.useState('');
  const [largeFile, setLargeFile] = React.useState<{ name: string; sizeKb: number; text: string } | null>(null);
  const [mode, setMode] = React.useState<'replace' | 'add'>('replace');
  const [error, setError] = React.useState('');

  const activeText = largeFile ? largeFile.text : rawText;

  const preview = React.useMemo<{ tables: DatasetTable[]; error: string }>(() => {
    if (!activeText.trim()) return { tables: [], error: '' };
    try {
      const tables =
        format === 'sql'
          ? parseSqlDataset(activeText)
          : format === 'json'
            ? parseJsonDataset(tableName || 'imported_table', activeText)
            : [parseCsvTable(tableName || 'imported_table', activeText)];
      return { tables, error: '' };
    } catch (e) {
      return { tables: [], error: e instanceof Error ? e.message : 'Could not parse dataset.' };
    }
  }, [activeText, format, tableName]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const base = file.name.replace(/\.[^.]+$/, '');
    setTableName(sanitizeIdent(base, 'imported_table'));
    const lower = file.name.toLowerCase();
    setFormat(lower.endsWith('.sql') ? 'sql' : lower.endsWith('.json') ? 'json' : 'csv');
    try {
      const text = await file.text();
      if (text.length > 100_000) {
        setLargeFile({ name: file.name, sizeKb: Math.round(file.size / 1024), text });
        setRawText('');
      } else {
        setLargeFile(null);
        setRawText(text);
      }
    } catch {
      setError('Could not read the selected file.');
    }
    e.target.value = '';
  };

  const handleImport = () => {
    if (preview.error) {
      setError(preview.error);
      return;
    }
    if (preview.tables.length === 0) {
      setError('Paste CSV/JSON data or upload a file first.');
      return;
    }
    importDataset(preview.tables, mode);
    const totalRows = preview.tables.reduce((sum, t) => sum + t.rows.length, 0);
    toast({
      kind: 'success',
      title: 'Dataset imported',
      description: `Loaded ${preview.tables.length} table${preview.tables.length === 1 ? '' : 's'} (${totalRows} rows) into the compiler & sandbox.`,
    });
    onImported?.(preview.tables);
    onOpenChange(false);
  };

  const handleReset = () => {
    resetDataset();
    toast({ kind: 'info', title: 'Restored demo dataset', description: 'Using students, courses, and enrollments.' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-4 text-cyan-brand" aria-hidden="true" />
            Import Dataset
          </DialogTitle>
          <DialogDescription>
            Upload a CSV, JSON, or SQL file (up to {MAX_DATASET_ROWS} rows per table). Tables, columns, and types are loaded into both the compiler and SQLite sandbox.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80">
              <FileUp className="size-3.5" aria-hidden="true" />
              Choose CSV / JSON / SQL file
              <input type="file" accept=".csv,.tsv,.txt,.json,.sql" onChange={(e) => void handleFile(e)} className="sr-only" />
            </label>
            <div className="inline-flex rounded-md border bg-muted p-0.5 text-xs">
              {(['csv', 'json', 'sql'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { setFormat(f); setError(''); }}
                  className={`rounded px-2.5 py-1 font-medium uppercase ${format === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                if (format === 'sql') {
                  setRawText(SAMPLE_SQL);
                } else {
                  setFormat('csv');
                  setTableName('products');
                  setRawText(SAMPLE_CSV);
                }
                setError('');
              }}
              className="ml-auto text-xs text-cyan-brand hover:underline"
            >
              Load sample {format === 'sql' ? 'SQL' : 'CSV'}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="dataset-table-name" className="mb-1 block text-xs font-medium text-muted-foreground">
                Table name {format === 'sql' ? '(from CREATE TABLE)' : format === 'json' ? '(for array JSON)' : ''}
              </label>
              <Input
                id="dataset-table-name"
                value={tableName}
                disabled={format === 'sql'}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="my_table"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div>
              <label htmlFor="dataset-import-mode" className="mb-1 block text-xs font-medium text-muted-foreground">
                Import mode
              </label>
              <select
                id="dataset-import-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'replace' | 'add')}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="replace">Replace current dataset</option>
                <option value="add">Add / update table in dataset</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="dataset-raw-input" className="mb-1 block text-xs font-medium text-muted-foreground">
              {largeFile ? `Loaded file: ${largeFile.name} (${largeFile.sizeKb} KB)` : `Paste ${format.toUpperCase()} data`}
            </label>
            {largeFile ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-3 text-xs">
                <span>Large file loaded into memory ({largeFile.sizeKb} KB) — previewing detected schema below.</span>
                <button type="button" onClick={() => setLargeFile(null)} className="font-medium text-cyan-brand hover:underline">
                  Clear file
                </button>
              </div>
            ) : (
              <textarea
                id="dataset-raw-input"
                value={rawText}
                onChange={(e) => { setRawText(e.target.value); setError(''); }}
                rows={6}
                placeholder={
                  format === 'sql'
                    ? 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO users VALUES (1, \'Alice\');'
                    : format === 'csv'
                      ? 'id,name,score\n1,Alice,95\n2,Bob,88'
                      : '[{"id": 1, "name": "Alice", "score": 95}]'
                }
                className="scroll-thin block w-full resize-y rounded-md border border-input bg-background p-2.5 font-mono text-xs placeholder:text-muted-foreground/60"
              />
            )}
          </div>

          {(error || preview.error) && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error || preview.error}
            </p>
          )}

          {preview.tables.length > 0 && (
            <div className="space-y-1.5 rounded-md border bg-muted/40 p-2.5">
              <p className="text-xs font-medium text-muted-foreground">Detected schema preview</p>
              {preview.tables.map((t) => (
                <div key={t.name} className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <Table2 className="size-3.5 text-cyan-brand" aria-hidden="true" />
                    <span className="font-mono font-semibold">{t.name}</span>
                    <span className="text-muted-foreground">({t.rows.length} rows, {t.columns.length} cols)</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.columns.map((c) => (
                      <Badge key={c.name} variant="outline" className="font-mono text-[10px]">
                        {c.name}: {c.type}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <div>
            {customDataset && (
              <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
                <RotateCcw /> Reset to demo data
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={preview.tables.length === 0} onClick={handleImport}>
              <Upload /> Import dataset
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
