import { BookOpen, Download, Eraser, FileJson, FileText, Loader2, Play, RotateCcw, Sparkles, WandSparkles, Copy } from 'lucide-react';
import type { CompilationResult } from '@/types/compiler';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EXAMPLES } from '@/data/examples';

interface Props {
  compiling: boolean;
  hasResult: boolean;
  onCompile: () => void;
  onOptimize: () => void;
  onFormat: () => void;
  onCopy: () => void;
  onClear: () => void;
  onReset: () => void;
  onLoadExample: (id: string) => void;
  onExport: (kind: 'markdown' | 'json') => void;
  result: CompilationResult | null;
}

const CATEGORIES = ['Basics', 'Aggregation', 'Joins', 'Optimization', 'Errors'] as const;

function IconAction({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Tip label={label}>
      <Button variant="ghost" size="icon" onClick={onClick} aria-label={label} disabled={disabled}>{children}</Button>
    </Tip>
  );
}

export function EditorToolbar({ compiling, hasResult, onCompile, onOptimize, onFormat, onCopy, onClear, onReset, onLoadExample, onExport }: Props) {
  return (
    <div role="toolbar" aria-label="Editor actions" className="flex flex-wrap items-center gap-1.5 border-b px-2 py-2">
      <Button onClick={onCompile} disabled={compiling} aria-keyshortcuts="Control+Enter Meta+Enter">
        {compiling ? <Loader2 className="animate-spin" /> : <Play />} Compile Query
      </Button>
      <Button variant="violet" onClick={onOptimize} disabled={compiling} aria-keyshortcuts="Control+Shift+Enter Meta+Shift+Enter">
        <Sparkles /> Optimize Query
      </Button>
      <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
      <IconAction label="Format SQL" onClick={onFormat}><WandSparkles /></IconAction>
      <IconAction label="Copy SQL" onClick={onCopy}><Copy /></IconAction>
      <IconAction label="Clear editor" onClick={onClear}><Eraser /></IconAction>
      <IconAction label="Reset to default query" onClick={onReset}><RotateCcw /></IconAction>

      <DropdownMenu>
        <Tip label="Load an example query">
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm"><BookOpen /> <span className="hidden sm:inline">Load example</span><span className="sm:hidden">Examples</span></Button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="start" className="w-72">
          {CATEGORIES.map((c) => (
            <div key={c}>
              <DropdownMenuLabel>{c}</DropdownMenuLabel>
              {EXAMPLES.filter((e) => e.category === c).map((e) => (
                <DropdownMenuItem key={e.id} onSelect={() => onLoadExample(e.id)}>{e.title}</DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <Tip label={hasResult ? 'Export the last compilation report' : 'Compile a query first'}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={!hasResult}><Download /> <span className="hidden sm:inline">Export Report</span><span className="sm:hidden">Export</span></Button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onExport('markdown')}><FileText /> Markdown report (.md)</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport('json')}><FileJson /> Full result (.json)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
