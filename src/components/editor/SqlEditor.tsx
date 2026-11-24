import * as React from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { PostgreSQL, sql as sqlLang } from '@codemirror/lang-sql';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { githubDarkInit, githubLightInit } from '@uiw/codemirror-theme-github';
import type { Diagnostic } from '@/types/compiler';
import { ACADEMIC_SCHEMA } from '@/compiler/semantic/schema';
import { cn } from '@/lib/utils';

export interface SqlEditorHandle {
  /** Inserts text at the cursor (replacing the selection) and focuses the editor. */
  insertText: (text: string) => void;
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onCompile?: () => void;
  onOptimize?: () => void;
  /** Diagnostics of the compilation of exactly `value`; they are underlined in the editor. */
  diagnostics?: Diagnostic[];
  highlight?: { start: number; end: number; nonce: number } | null;
  fontSize?: number;
  wrap?: boolean;
  dark?: boolean;
  className?: string;
}

// Autocomplete uses the same schema metadata as the semantic analyzer and the schema explorer.
const SCHEMA_FOR_COMPLETION = Object.fromEntries(ACADEMIC_SCHEMA.tables.map((t) => [t.name, t.columns.map((c) => c.name)]));

const dark = githubDarkInit({ settings: { background: 'transparent', gutterBackground: 'transparent', lineHighlight: 'rgba(148,163,184,0.08)' } });
const light = githubLightInit({ settings: { background: 'transparent', gutterBackground: 'transparent', lineHighlight: 'rgba(15,23,42,0.05)' } });

export const SqlEditor = React.forwardRef<SqlEditorHandle, Props>(function SqlEditor(
  { value, onChange, onCompile, onOptimize, diagnostics, highlight, fontSize = 14, wrap = false, dark: isDark = true, className },
  ref,
) {
  const cm = React.useRef<ReactCodeMirrorRef>(null);
  const compileRef = React.useRef(onCompile);
  const optimizeRef = React.useRef(onOptimize);
  compileRef.current = onCompile;
  optimizeRef.current = onOptimize;

  React.useImperativeHandle(ref, () => ({
    insertText(text: string) {
      const view = cm.current?.view;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, scrollIntoView: true });
      view.focus();
    },
    focus() {
      cm.current?.view?.focus();
    },
  }));

  const extensions = React.useMemo(
    () => [
      sqlLang({ dialect: PostgreSQL, schema: SCHEMA_FOR_COMPLETION, upperCaseKeywords: true }),
      lintGutter(),
      EditorView.contentAttributes.of({ 'aria-label': 'SQL editor. Press Ctrl+Enter or Command+Enter to compile.', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
      wrap ? EditorView.lineWrapping : [],
      Prec.highest(
        keymap.of([
          { key: 'Mod-Enter', run: () => { compileRef.current?.(); return true; } },
          { key: 'Mod-Shift-Enter', run: () => { optimizeRef.current?.(); return true; } },
        ]),
      ),
      EditorView.theme({
        '&': { height: '100%', fontSize: `${fontSize}px` },
        '.cm-scroller': { fontFamily: "'JetBrains Mono Variable','JetBrains Mono',ui-monospace,monospace", lineHeight: '1.6' },
        '.cm-content': { padding: '8px 0' },
        '.cm-gutters': { border: 'none', color: 'hsl(var(--muted-foreground))' },
        '.cm-tooltip': { border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--card-foreground))', borderRadius: '6px' },
        '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' },
        '.cm-diagnostic-error': { borderLeft: '3px solid hsl(var(--destructive))' },
        '.cm-diagnostic-warning': { borderLeft: '3px solid hsl(var(--warning))' },
      }),
    ],
    [fontSize, wrap],
  );

  // Underline compiler diagnostics that carry a real source location.
  React.useEffect(() => {
    const view = cm.current?.view;
    if (!view) return;
    const len = view.state.doc.length;
    const list: CmDiagnostic[] = (diagnostics ?? [])
      .filter((d) => d.location)
      .map((d) => {
        const from = Math.min(d.location!.start, len);
        const to = Math.min(Math.max(d.location!.end, from + 1), len);
        return {
          from,
          to: Math.max(to, from),
          severity: d.severity === 'info' ? 'info' : d.severity,
          message: `${d.category}: ${d.message}`,
          source: 'Smart SQL Compiler',
        } satisfies CmDiagnostic;
      });
    view.dispatch(setDiagnostics(view.state, list));
  }, [diagnostics, value]);

  // Select and scroll to a source range requested by the UI (token click, diagnostic click).
  React.useEffect(() => {
    const view = cm.current?.view;
    if (!view || !highlight) return;
    const len = view.state.doc.length;
    const a = Math.min(highlight.start, len);
    const b = Math.min(Math.max(highlight.end, a), len);
    view.dispatch({ selection: { anchor: a, head: b }, scrollIntoView: true });
    view.focus();
  }, [highlight]);

  return (
    <div className={cn('h-full min-h-0 overflow-hidden', className)} data-testid="sql-editor">
      <CodeMirror
        ref={cm}
        value={value}
        onChange={onChange}
        theme={isDark ? dark : light}
        extensions={extensions}
        height="100%"
        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true, autocompletion: true, indentOnInput: true, bracketMatching: true, closeBrackets: true }}
        indentWithTab={false}
      />
    </div>
  );
});
