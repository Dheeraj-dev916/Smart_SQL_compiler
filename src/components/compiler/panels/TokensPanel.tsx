import * as React from 'react';
import { Download, Search } from 'lucide-react';
import type { CompilationResult, TokenType } from '@/types/compiler';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { downloadText } from '@/utils/download';
import { DataTable, PanelToolbar, StatusNote, Unavailable, useJump } from './shared';

const VARIANT: Record<TokenType, React.ComponentProps<typeof Badge>['variant']> = {
  KEYWORD: 'cyan',
  IDENTIFIER: 'indigo',
  QUOTED_IDENTIFIER: 'indigo',
  STRING: 'success',
  NUMBER: 'warning',
  BOOLEAN: 'violet',
  NULL: 'violet',
  OPERATOR: 'default',
  COMMA: 'outline',
  LPAREN: 'outline',
  RPAREN: 'outline',
  SEMICOLON: 'outline',
  DOT: 'outline',
  COMMENT: 'outline',
  INVALID: 'destructive',
};

export function TokensPanel({ result }: { result: CompilationResult }) {
  const [q, setQ] = React.useState('');
  const jump = useJump();
  const lex = result.lex;
  const tokens = lex?.tokens ?? [];
  const shown = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return tokens;
    return tokens.filter((t) => t.lexeme.toLowerCase().includes(s) || t.type.toLowerCase().includes(s.replace(/\s+/g, '_')) || String(t.line) === s);
  }, [tokens, q]);
  if (!lex) return <Unavailable result={result} stage="lexical" what="tokens" />;
  const errors = lex.diagnostics.filter((d) => d.severity === 'error');
  return (
    <div>
      <PanelToolbar>
        <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lexeme, type or line" aria-label="Search tokens" className="pl-8" />
        </div>
        <span className="text-xs text-muted-foreground" aria-live="polite">{shown.length} of {tokens.length} tokens</span>
        <div className="ml-auto flex items-center gap-1">
          <CopyButton label="Copy tokens as JSON" text={() => JSON.stringify(tokens, null, 2)} />
          <Button variant="ghost" size="icon" aria-label="Download tokens as JSON" onClick={() => downloadText('tokens.json', JSON.stringify(tokens, null, 2), 'application/json')}>
            <Download />
          </Button>
        </div>
      </PanelToolbar>
      <div className="space-y-3 p-3">
        {errors.length > 0 && (
          <StatusNote tone="error">
            <strong>{errors.length} lexical error{errors.length === 1 ? '' : 's'}.</strong> {errors[0].message} Tokenization continued so you can still inspect the rest of the input.
          </StatusNote>
        )}
        {tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">The input produced no tokens.</p>
        ) : (
          <DataTable head={['#', 'Lexeme', 'Type', 'Line', 'Column', 'Offsets']} caption="Tokens produced by the lexer" minWidth={560}>
            {shown.map((t) => (
              <tr key={t.index} className="hover:bg-muted/40">
                <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{t.index}</td>
                <td className="px-3 py-1.5 font-mono text-[13px]">
                  <button type="button" className="max-w-[16rem] truncate rounded text-left hover:underline" onClick={() => jump(t)} title="Select this token in the editor">
                    {t.lexeme.replace(/\n/g, '⏎')}
                  </button>
                </td>
                <td className="px-3 py-1.5"><Badge variant={VARIANT[t.type]}>{t.type}</Badge></td>
                <td className="px-3 py-1.5 font-mono text-xs">{t.line}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{t.column}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{t.start}–{t.end}</td>
              </tr>
            ))}
          </DataTable>
        )}
        {shown.length === 0 && tokens.length > 0 && <p className="text-sm text-muted-foreground">No tokens match “{q}”.</p>}
      </div>
    </div>
  );
}
