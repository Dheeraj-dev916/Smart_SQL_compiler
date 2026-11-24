import { useId } from 'react';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  const gid = `lg-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="#0b1220" stroke={`url(#${gid})`} strokeWidth="1" />
      <path d="M10 11l-4 5 4 5M22 11l4 5-4 5M17.5 9.5l-3 13" stroke={`url(#${gid})`} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">Smart SQL</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Query Compiler</p>
        </div>
      )}
    </div>
  );
}
