import { cn } from '@/lib/utils';
import { CopyButton } from './copy-button';

/** Read-only monospace block with an optional copy button. Wraps instead of forcing page-level horizontal scroll. */
export function CodeBlock({ code, label, className, copy = true, wrap = false }: { code: string; label?: string; className?: string; copy?: boolean; wrap?: boolean }) {
  return (
    <div className={cn('group relative rounded-md border bg-muted/40', className)}>
      {copy && (
        <div className="absolute right-1 top-1 z-10 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <CopyButton text={code} label={label ? `Copy ${label}` : 'Copy'} />
        </div>
      )}
      <pre
        tabIndex={0}
        aria-label={label}
        className={cn('scroll-thin max-h-[28rem] overflow-auto p-3 pr-11 font-mono text-[13px] leading-relaxed', wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre')}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
